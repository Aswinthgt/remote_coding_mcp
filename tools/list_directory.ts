import type { FastMCP } from "fastmcp";
import { z } from "zod";
import fs from "fs/promises";
import type { Dirent } from "fs";
import { resolveSafePath } from "../utils.js";

export function registerListDirectoryTool(server: FastMCP) {
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
        
        const files = entries.map((entry: Dirent) => {
          return `${entry.isDirectory() ? "[DIR]" : "[FILE]"} ${entry.name}`;
        });
        
        return files.join("\n") || "Directory is empty.";
      } catch (err: any) {
        return `Error reading directory: ${err.message}`;
      }
    },
  });
}
