import type { FastMCP } from "fastmcp";
import { z } from "zod";
import fs from "fs/promises";
import { resolveSafePath } from "../utils.js";

export function registerReplaceInFileTool(server: FastMCP) {
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
}
