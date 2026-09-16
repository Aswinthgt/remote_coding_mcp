import type { FastMCP } from "fastmcp";
import { z } from "zod";
import fs from "fs/promises";
import { resolveSafePath } from "../utils.js";

export function registerDeleteFileTool(server: FastMCP) {
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
}
