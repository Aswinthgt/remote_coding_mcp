import type { FastMCP } from "fastmcp";
import { z } from "zod";
import fs from "fs/promises";
import { resolveSafePath } from "../utils.js";

export function registerInsertAtLineTool(server: FastMCP) {
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
}
