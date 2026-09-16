import type { FastMCP } from "fastmcp";
import { z } from "zod";
import { WORKSPACE_DIR } from "../config.js";
import { execAsync } from "../utils.js";

export function registerExecuteCommandTool(server: FastMCP) {
  server.addTool({
    name: "execute_command",
    description: "Execute a shell command in the terminal. Automatically times out after 30 seconds to prevent hanging.",
    parameters: z.object({
      command: z.string().describe("The shell command to execute"),
    }),
    execute: async ({ command }) => {
      try {
        // Executes strictly within your allowed WORKSPACE_DIR sandbox
        const { stdout, stderr } = await execAsync(command, {
          cwd: WORKSPACE_DIR,
          timeout: 30000, // Kill process if it takes longer than 30 seconds
          maxBuffer: 1024 * 1024 * 5, // Allow up to 5MB of output
        });
        
        return `STDOUT:\n${stdout}\nSTDERR:\n${stderr}`;
      } catch (err: any) {
        // Even if the command fails (e.g., exit code 1), we still want to see the output
        return `Command failed (Code ${err.code}):\n${err.message}\nSTDOUT:\n${err.stdout}\nSTDERR:\n${err.stderr}`;
      }
    },
  });
}
