import type { FastMCP } from "fastmcp";
import { z } from "zod";
import { WORKSPACE_DIR } from "../config.js";
import { execAsync } from "../utils.js";

export function registerGitDiffTool(server: FastMCP) {
  server.addTool({
    name: "git_diff",
    description: "View uncommitted changes in the repository. Use this to review your work before finishing a task.",
    parameters: z.object({
      stagedOnly: z.boolean().optional().describe("Set to true to only see staged changes"),
    }),
    execute: async ({ stagedOnly }) => {
      try {
        // We use the execAsync we imported earlier for the terminal tool
        const command = stagedOnly ? "git diff --cached" : "git diff";
        
        const { stdout, stderr } = await execAsync(command, { cwd: WORKSPACE_DIR });
        
        if (!stdout.trim()) {
          const { stdout: status } = await execAsync("git status -s", { cwd: WORKSPACE_DIR });
          if (status.trim()) return `No diff available, but there are untracked files:\n${status}`;
          return "Working tree is clean. No changes detected.";
        }
        
        return stdout;
      } catch (err: any) {
        return `Error running git diff: Is this a git repository? (${err.message})`;
      }
    },
  });
}
