import type { FastMCP } from "fastmcp";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { resolveSafePath } from "../utils.js";

export function registerWriteFileTool(server: FastMCP) {
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
}
