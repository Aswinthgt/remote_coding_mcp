import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { WORKSPACE_DIR } from "./config.js";

export const execAsync = promisify(exec);

/**
 * Security: Ensures the AI cannot access files outside the workspace
 * (Prevents path traversal attacks like "../../windows/system32")
 */
export function resolveSafePath(userPath: string): string {
  // Resolve the path as-is — callers supply full absolute paths
  const targetPath = path.resolve(userPath);

  // Ensure targetPath is inside WORKSPACE_DIR.
  // Append sep so "/home/user" never falsely matches "/home/username/..."
  const safeRoot = WORKSPACE_DIR.endsWith(path.sep)
    ? WORKSPACE_DIR
    : WORKSPACE_DIR + path.sep;

  if (!targetPath.startsWith(safeRoot) && targetPath !== WORKSPACE_DIR) {
    throw new Error(`Access Denied: Path "${userPath}" is outside the allowed workspace (${WORKSPACE_DIR})`);
  }
  return targetPath;
}
