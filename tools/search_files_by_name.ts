import type { FastMCP } from "fastmcp";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { WORKSPACE_DIR } from "../config.js";
import { resolveSafePath } from "../utils.js";

export function registerSearchFilesByNameTool(server: FastMCP) {
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
}
