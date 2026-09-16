import type { FastMCP } from "fastmcp";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { WORKSPACE_DIR } from "../config.js";
import { resolveSafePath } from "../utils.js";

export function registerGrepSearchTool(server: FastMCP) {
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
}
