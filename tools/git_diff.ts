import type { FastMCP } from "fastmcp";
import { z } from "zod";
import { execAsync, resolveSafePath, getPrimaryWorkspace } from "../utils.js";

export function registerGitDiffTool(server: FastMCP) {
  server.addTool({
    name: "git_diff",
    description: "View uncommitted changes in the repository. Use this to review your work before finishing a task.",
    parameters: z.object({
      stagedOnly: z.boolean().optional().describe("Set to true to only see staged changes"),
      cwd: z.string().optional().describe("Directory of the git repository. Must be an authorized workspace path. Defaults to primary workspace."),
    }),
    execute: async ({ stagedOnly, cwd }) => {
      try {
        const targetCwd = resolveSafePath(cwd || getPrimaryWorkspace());
        const command = stagedOnly ? "git diff --cached" : "git diff";
        
        const { stdout } = await execAsync(command, { cwd: targetCwd });
        
        if (!stdout.trim()) {
          const { stdout: status } = await execAsync("git status -s", { cwd: targetCwd });
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
