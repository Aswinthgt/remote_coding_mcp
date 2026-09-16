import type { FastMCP } from "fastmcp";
import { z } from "zod";
import fs from "fs/promises";
import { resolveSafePath } from "../utils.js";

export function registerReadFileTool(server: FastMCP) {
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
}
