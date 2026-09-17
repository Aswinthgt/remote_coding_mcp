import type { FastMCP } from "fastmcp";
import { z } from "zod";
import { getPrimaryWorkspace, getAdditionalWorkspaces } from "../workspaceManager.js";

export function registerAvailableDirectoriesTool(server: FastMCP) {
  server.addTool({
    name: "available_directories",
    description: "List all allowed workspace directories that the AI is authorized to access and modify, including primary and additional workspaces.",
    parameters: z.object({}),
    execute: async () => {
      const primary = getPrimaryWorkspace();
      const additional = getAdditionalWorkspaces();

      const lines: string[] = [
        "AUTHORIZED WORKSPACE DIRECTORIES:",
        "",
        `[PRIMARY WORKSPACE] (Default for relative paths and terminal commands):`,
        `  ${primary}`,
      ];

      if (additional.length > 0) {
        lines.push("", "[ADDITIONAL WORKSPACES]:");
        for (const dir of additional) {
          lines.push(`  ${dir}`);
        }
      } else {
        lines.push("", "[ADDITIONAL WORKSPACES]: (None currently added. User can add more via Control Center)");
      }

      lines.push(
        "",
        "Usage Guidelines:",
        "- You have full file read, write, search, and execution permissions in ALL listed directories.",
        "- For any tool, you can pass an absolute path within any of the authorized workspaces.",
        "- For tools like execute_command and git_diff, pass the 'cwd' parameter to run within a specific workspace.",
        "- Relative paths without a directory specified default to the PRIMARY WORKSPACE."
      );

      return lines.join("\n");
    },
  });
}
