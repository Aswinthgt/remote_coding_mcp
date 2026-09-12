#!/usr/bin/env node
import { FastMCP } from "fastmcp";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify, parseArgs } from "util";
import os from "os";


const execAsync = promisify(exec);

const options = {
  port: { 
    type: 'string' as const, 
    short: 'p',
    default: '8080'
  },
  token: { 
    type: 'string' as const, 
    short: 't',
  },
  workspace: { 
    type: 'string' as const, 
    short: 'w'
  }
};

// Parse the arguments
const { values } = parseArgs({ options, strict: false });
// ==========================================
// CONFIGURATION & SANDBOXING
// ==========================================
const PORT = Number(values.port) || 8080;
const AUTH_TOKEN = values.token as string | undefined;

// Determine the allowed folder for file editing. Defaults to the user's home directory.
const WORKSPACE_DIR = path.resolve((values.workspace as string | undefined) ?? os.homedir());

/**
 * Security: Ensures the AI cannot access files outside the workspace
 * (Prevents path traversal attacks like "../../windows/system32")
 */
function resolveSafePath(userPath: string): string {
  // Resolve the path as-is — callers supply full absolute paths
  const targetPath = path.resolve(userPath);

  // Ensure targetPath is inside WORKSPACE_DIR.
  // Append sep so "/home/user" never falsely matches "/home/username/..."
  const safeRoot = WORKSPACE_DIR.endsWith(path.sep)
    ? WORKSPACE_DIR
    : WORKSPACE_DIR + path.sep;

  if (!targetPath.startsWith(safeRoot) && targetPath !== WORKSPACE_DIR) {
    throw new Error(`Access Denied: Path "${userPath}" is outside the allowed workspace (${WORKSPACE_DIR})`);
  }
  return targetPath;
}

// ==========================================
// SERVER INITIALIZATION
// ==========================================
const server = new FastMCP({
  name: "Remote-Coder-Filesystem",
  version: "1.0.0",
});

// ==========================================
// AUTHENTICATION MIDDLEWARE
// ==========================================
const app = server.getApp();

app.use("*", async (c, next) => {
  // If no token was provided at startup, authentication is disabled
  if (!AUTH_TOKEN) {
    await next();
    return;
  }

  const authHeader = c.req.header("Authorization");
  if (authHeader !== `Bearer ${AUTH_TOKEN}`) {
    return c.text("Unauthorized: Invalid or missing API key.", 401);
  }
  await next();
});

// ==========================================
// TOOLS
// ==========================================

// 1. Explore Directory
server.addTool({
  name: "list_directory",
  description: "List all files and folders in a directory within the workspace.",
  parameters: z.object({
    dirPath: z.string().describe("Path to the directory (e.g., '.' for root)"),
  }),
  execute: async ({ dirPath }) => {
    try {
      const safePath = resolveSafePath(dirPath);
      const entries = await fs.readdir(safePath, { withFileTypes: true });
      
      const files = entries.map((entry: import("fs").Dirent) => {
        return `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`;
      });
      
      return files.join("\n") || "Directory is empty.";
    } catch (err: any) {
      return `Error reading directory: ${err.message}`;
    }
  },
});

// 2. Read File (with optional line slicing)
server.addTool({
  name: "read_file",
  description: "Read the contents of a file. For large files, you can specify startLine and endLine.",
  parameters: z.object({
    filePath: z.string().describe("Path to the file"),
    startLine: z.number().optional().describe("Starting line number (1-indexed)"),
    endLine: z.number().optional().describe("Ending line number (1-indexed)"),
  }),
  execute: async ({ filePath, startLine, endLine }) => {
    try {
      const safePath = resolveSafePath(filePath);
      const content = await fs.readFile(safePath, "utf-8");
      
      if (startLine || endLine) {
        const lines = content.split("\n");
        const start = (startLine || 1) - 1;
        const end = endLine || lines.length;
        
        return lines.slice(start, end).join("\n");
      }
      return content;
    } catch (err: any) {
      return `Error reading file: ${err.message}`;
    }
  },
});

// 3. Write/Overwrite File
server.addTool({
  name: "write_file",
  description: "Create a new file or completely overwrite an existing one.",
  parameters: z.object({
    filePath: z.string().describe("Path to the file"),
    content: z.string().describe("The full code/text to write"),
  }),
  execute: async ({ filePath, content }) => {
    try {
      const safePath = resolveSafePath(filePath);
      // Ensure parent directories exist
      await fs.mkdir(path.dirname(safePath), { recursive: true });
      await fs.writeFile(safePath, content, "utf-8");
      return `Successfully wrote to ${filePath}`;
    } catch (err: any) {
      return `Error writing file: ${err.message}`;
    }
  },
});

// 4. Smart Replace (Surgical edits to save tokens)
server.addTool({
  name: "replace_in_file",
  description: "Replace a specific snippet of text in a file without overwriting the entire file. Use this for refactoring.",
  parameters: z.object({
    filePath: z.string().describe("Path to the file"),
    oldText: z.string().describe("The exact text block to replace"),
    newText: z.string().describe("The new text block to insert"),
  }),
  execute: async ({ filePath, oldText, newText }) => {
    try {
      const safePath = resolveSafePath(filePath);
      const content = await fs.readFile(safePath, "utf-8");
      
      if (!content.includes(oldText)) {
        return "Error: Could not find 'oldText' exactly as provided in the file. Make sure whitespace and indentation match exactly.";
      }
      
      const updatedContent = content.replace(oldText, newText);
      await fs.writeFile(safePath, updatedContent, "utf-8");
      return `Successfully patched ${filePath}`;
    } catch (err: any) {
      return `Error patching file: ${err.message}`;
    }
  },
});

//5. Create a new file (Fails safely if the file already exists)
server.addTool({
  name: "create_file",
  description: "Create a new file with optional content. Fails if the file already exists to prevent accidental overwriting.",
  parameters: z.object({
    filePath: z.string().describe("Relative path for the new file (e.g., 'src/components/Button.tsx')"),
    content: z.string().optional().describe("Initial file content (defaults to empty string)"),
  }),
  execute: async ({ filePath, content = "" }) => {
    try {
      const safePath = resolveSafePath(filePath);

      // Create parent directories if they don't exist yet
      await fs.mkdir(path.dirname(safePath), { recursive: true });

      // 'wx' flag opens the file for writing exclusively; fails if path exists
      await fs.writeFile(safePath, content, { flag: "wx", encoding: "utf-8" });

      return `Successfully created new file: ${filePath}`;
    } catch (err: any) {
      if (err.code === "EEXIST") {
        return `Error: File already exists at "${filePath}". Use write_file to overwrite it or replace_in_file to modify it.`;
      }
      return `Error creating file: ${err.message}`;
    }
  },
});

// 6. Delete File
server.addTool({
  name: "delete_file",
  description: "Delete a specific file from the workspace.",
  parameters: z.object({
    filePath: z.string().describe("Path to the file to delete"),
  }),
  execute: async ({ filePath }) => {
    try {
      const safePath = resolveSafePath(filePath);
      
      // fs.unlink removes files. It will fail if you try to remove a directory.
      await fs.unlink(safePath);
      
      return `Successfully deleted file: ${filePath}`;
    } catch (err: any) {
      if (err.code === "ENOENT") {
        return `Error: File not found at "${filePath}"`;
      }
      return `Error deleting file: ${err.message}`;
    }
  },
});

// 7. Rename or Move File
server.addTool({
  name: "rename_file",
  description: "Rename a file or move it to a different directory within the workspace.",
  parameters: z.object({
    oldPath: z.string().describe("Current path of the file"),
    newPath: z.string().describe("New path and filename"),
  }),
  execute: async ({ oldPath, newPath }) => {
    try {
      // Secure both the source and the destination paths
      const safeOldPath = resolveSafePath(oldPath);
      const safeNewPath = resolveSafePath(newPath);
      
      // Ensure the destination folder exists before moving the file into it
      await fs.mkdir(path.dirname(safeNewPath), { recursive: true });
      
      await fs.rename(safeOldPath, safeNewPath);
      
      return `Successfully moved/renamed ${oldPath} to ${newPath}`;
    } catch (err: any) {
      if (err.code === "ENOENT") {
        return `Error: Source file not found at "${oldPath}"`;
      }
      return `Error renaming file: ${err.message}`;
    }
  },
});

// 8. Terminal Command Execution
server.addTool({
  name: "execute_command",
  description: "Execute a shell command in the terminal. Automatically times out after 30 seconds to prevent hanging.",
  parameters: z.object({
    command: z.string().describe("The shell command to execute"),
  }),
  execute: async ({ command }) => {
    try {
      // Executes strictly within your allowed WORKSPACE_DIR sandbox
      const { stdout, stderr } = await execAsync(command, {
        cwd: WORKSPACE_DIR,
        timeout: 30000, // Kill process if it takes longer than 30 seconds
        maxBuffer: 1024 * 1024 * 5, // Allow up to 5MB of output
      });
      
      return `STDOUT:\n${stdout}\nSTDERR:\n${stderr}`;
    } catch (err: any) {
      // Even if the command fails (e.g., exit code 1), we still want to see the output
      return `Command failed (Code ${err.code}):\n${err.message}\nSTDOUT:\n${err.stdout}\nSTDERR:\n${err.stderr}`;
    }
  },
});

// 9. Pure Node.js Grep (Regex file search)
server.addTool({
  name: "grep_search",
  description: "Search for a regex or text pattern inside files in the workspace. Skips node_modules and .git automatically.",
  parameters: z.object({
    pattern: z.string().describe("The text or regex pattern to search for"),
    dirPath: z.string().optional().describe("Directory to search in (defaults to root workspace)"),
    fileExtension: z.string().optional().describe("Filter by file extension (e.g., '.ts', '.md')"),
  }),
  execute: async ({ pattern, dirPath = ".", fileExtension }) => {
    try {
      const safePath = resolveSafePath(dirPath);
      const regex = new RegExp(pattern, "g"); 
      const results: string[] = [];
      let filesSearched = 0;
      
      // Recursive directory search function
      async function searchDir(currentDir: string) {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        
        for (const entry of entries) {
          // Hardcoded safety limits to prevent AI from scanning gigabytes of dependency files
          if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
          
          const fullPath = path.join(currentDir, entry.name);
          
          if (entry.isDirectory()) {
            await searchDir(fullPath);
          } else {
            if (fileExtension && !entry.name.endsWith(fileExtension)) continue;
            
            filesSearched++;
            try {
              const content = await fs.readFile(fullPath, "utf-8");
              const lines = content.split("\n");
              
              for (let i = 0; i < lines.length; i++) {
                const line = lines[i] ?? "";
                if (regex.test(line)) {
                  // Format like grep: relative/path.ts:line_num: matching code
                  const relPath = path.relative(WORKSPACE_DIR, fullPath);
                  results.push(`${relPath}:${i + 1}: ${line.trim()}`);
                }
              }
            } catch {
              // Ignore unreadable files (images, binaries, etc.)
            }
          }
        }
      }
      
      await searchDir(safePath);
      
      if (results.length === 0) {
        return `No matches found for "${pattern}" in ${filesSearched} files searched.`;
      }
      
      // Cap results to prevent a massive file crash from overloading the AI's context window
      if (results.length > 500) {
         return results.slice(0, 500).join("\n") + `\n\n...and ${results.length - 500} more matches (truncated).`;
      }
      
      return results.join("\n");
    } catch (err: any) {
      return `Grep error: ${err.message}`;
    }
  },
});

// 10. Search Files by Name
server.addTool({
  name: "search_files_by_name",
  description: "Quickly find file paths by filename or extension. Essential for locating files in large projects.",
  parameters: z.object({
    pattern: z.string().describe("Part of the filename or extension to match (e.g., '.test.ts', 'config')"),
    dirPath: z.string().optional().describe("Directory to start search (defaults to root)"),
  }),
  execute: async ({ pattern, dirPath = "." }) => {
    try {
      const safePath = resolveSafePath(dirPath);
      const results: string[] = [];

      async function search(currentDir: string) {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          // Skip massive directories
          if (["node_modules", ".git", "dist", "build"].includes(entry.name)) continue;
          
          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            await search(fullPath);
          } else if (entry.name.toLowerCase().includes(pattern.toLowerCase())) {
            results.push(path.relative(WORKSPACE_DIR, fullPath));
          }
        }
      }

      await search(safePath);
      return results.length > 0 ? results.join("\n") : `No files found matching "${pattern}".`;
    } catch (err: any) {
      return `Error searching files: ${err.message}`;
    }
  },
});

// 11. Get File Metadata
server.addTool({
  name: "get_file_info",
  description: "Get metadata about a file (size, line count, last modified). Always use this before reading unknown files to avoid context-window limits.",
  parameters: z.object({
    filePath: z.string().describe("Path to the file"),
  }),
  execute: async ({ filePath }) => {
    try {
      const safePath = resolveSafePath(filePath);
      const stats = await fs.stat(safePath);
      
      // Calculate line count efficiently without loading the whole string into memory
      const content = await fs.readFile(safePath, "utf-8");
      const lineCount = content.split("\n").length;

      return [
        `File: ${filePath}`,
        `Size: ${(stats.size / 1024).toFixed(2)} KB`,
        `Lines: ${lineCount}`,
        `Last Modified: ${stats.mtime.toLocaleString()}`,
        `Is Directory: ${stats.isDirectory()}`
      ].join("\n");
    } catch (err: any) {
      if (err.code === "ENOENT") return `Error: File does not exist at ${filePath}`;
      return `Error getting info: ${err.message}`;
    }
  },
});

// 12. Insert Lines
server.addTool({
  name: "insert_at_line",
  description: "Insert new text exactly at a specific line number without replacing any existing code.",
  parameters: z.object({
    filePath: z.string().describe("Path to the file"),
    lineNumber: z.number().describe("The line number where the new text should begin (1-indexed)"),
    newText: z.string().describe("The code/text to insert"),
  }),
  execute: async ({ filePath, lineNumber, newText }) => {
    try {
      const safePath = resolveSafePath(filePath);
      const content = await fs.readFile(safePath, "utf-8");
      
      const lines = content.split("\n");
      const insertIndex = Math.max(0, lineNumber - 1);
      
      // Splice inserts the new lines into the array at the target index
      lines.splice(insertIndex, 0, newText);
      
      await fs.writeFile(safePath, lines.join("\n"), "utf-8");
      return `Successfully inserted code at line ${lineNumber} in ${filePath}`;
    } catch (err: any) {
      return `Error inserting lines: ${err.message}`;
    }
  },
});

// 13. Check Git Changes
server.addTool({
  name: "git_diff",
  description: "View uncommitted changes in the repository. Use this to review your work before finishing a task.",
  parameters: z.object({
    stagedOnly: z.boolean().optional().describe("Set to true to only see staged changes"),
  }),
  execute: async ({ stagedOnly }) => {
    try {
      // We use the execAsync we imported earlier for the terminal tool
      const command = stagedOnly ? "git diff --cached" : "git diff";
      
      const { stdout, stderr } = await execAsync(command, { cwd: WORKSPACE_DIR });
      
      if (!stdout.trim()) {
        const { stdout: status } = await execAsync("git status -s", { cwd: WORKSPACE_DIR });
        if (status.trim()) return `No diff available, but there are untracked files:\n${status}`;
        return "Working tree is clean. No changes detected.";
      }
      
      return stdout;
    } catch (err: any) {
      return `Error running git diff: Is this a git repository? (${err.message})`;
    }
  },
});

// ==========================================
// START SERVER
// ==========================================
server.start({
  transportType: "httpStream",
  httpStream: {
    port: PORT,
  },
});

console.log(`🚀 Remote Coder MCP Server running on port ${PORT}`);
console.log(`🔒 Workspace locked to: ${WORKSPACE_DIR}`);