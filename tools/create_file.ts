import type { FastMCP } from "fastmcp";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { resolveSafePath } from "../utils.js";

export function registerCreateFileTool(server: FastMCP) {
  server.addTool({
    name: "create_file",
    description: "Create a new file with optional content. Fails if the file already exists to prevent accidental overwriting.",
    parameters: z.object({
      filePath: z.string().describe("Relative path for the new file (e.g., 'src/components/Button.tsx')"),
      content: z.string().optional().describe("Initial file content (defaults to empty string)"),
    }),
    execute: async ({ filePath, content = "" }) => {
      try {
        const safePath = resolveSafePath(filePath);

        // Create parent directories if they don't exist yet
        await fs.mkdir(path.dirname(safePath), { recursive: true });

        // 'wx' flag opens the file for writing exclusively; fails if path exists
        await fs.writeFile(safePath, content, { flag: "wx", encoding: "utf-8" });

        return `Successfully created new file: ${filePath}`;
      } catch (err: any) {
        if (err.code === "EEXIST") {
          return `Error: File already exists at "${filePath}". Use write_file to overwrite it or replace_in_file to modify it.`;
        }
        return `Error creating file: ${err.message}`;
      }
    },
  });
}
