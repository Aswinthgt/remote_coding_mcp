import type { FastMCP } from "fastmcp";
import { z } from "zod";
import fs from "fs/promises";
import { resolveSafePath } from "../utils.js";

export function registerGetFileInfoTool(server: FastMCP) {
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
}
