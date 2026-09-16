import type { FastMCP } from "fastmcp";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { resolveSafePath } from "../utils.js";

export function registerRenameFileTool(server: FastMCP) {
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
}
