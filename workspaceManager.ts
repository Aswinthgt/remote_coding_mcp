import path from "path";
import fs from "fs/promises";
import os from "os";
import { WORKSPACE_DIR as PRIMARY_WORKSPACE_DIR } from "./config.js";
import { controlCenterEvents } from "./toolControl.js";

function expandHome(dirPath: string): string {
  if (dirPath === "~") {
    return os.homedir();
  }
  if (dirPath.startsWith("~" + path.sep) || dirPath.startsWith("~/") || dirPath.startsWith("~\\")) {
    return path.join(os.homedir(), dirPath.slice(2));
  }
  return dirPath;
}

const primaryWorkspace = path.resolve(expandHome(PRIMARY_WORKSPACE_DIR));
const additionalWorkspaces = new Set<string>();

export function getPrimaryWorkspace(): string {
  return primaryWorkspace;
}

export function getAdditionalWorkspaces(): string[] {
  return Array.from(additionalWorkspaces);
}

export function getAllWorkspaces(): string[] {
  return [primaryWorkspace, ...additionalWorkspaces];
}

/**
 * Validates and adds a new workspace directory.
 */
export async function addWorkspace(dirPath: string): Promise<{ success: boolean; path?: string; error?: string }> {
  if (!dirPath || typeof dirPath !== "string") {
    return { success: false, error: "Directory path is required." };
  }

  const resolved = path.resolve(expandHome(dirPath.trim()));

  if (resolved === primaryWorkspace) {
    return { success: false, error: "Directory is already the primary workspace." };
  }

  if (additionalWorkspaces.has(resolved)) {
    return { success: false, error: "Directory is already added to workspaces." };
  }

  try {
    const stats = await fs.stat(resolved);
    if (!stats.isDirectory()) {
      return { success: false, error: `Path "${dirPath}" exists but is not a directory.` };
    }
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return { success: false, error: `Directory "${dirPath}" does not exist.` };
    }
    return { success: false, error: `Unable to access "${dirPath}": ${err.message}` };
  }

  additionalWorkspaces.add(resolved);
  controlCenterEvents.emit("workspaceChange", {
    type: "add",
    path: resolved,
    all: getAllWorkspaces(),
  });

  return { success: true, path: resolved };
}

/**
 * Removes an additional workspace directory. The primary workspace cannot be removed.
 */
export function removeWorkspace(dirPath: string): { success: boolean; error?: string } {
  const resolved = path.resolve(expandHome(dirPath.trim()));

  if (resolved === primaryWorkspace) {
    return { success: false, error: "Cannot remove the primary workspace." };
  }

  if (!additionalWorkspaces.has(resolved)) {
    return { success: false, error: "Directory is not in additional workspaces." };
  }

  additionalWorkspaces.delete(resolved);
  controlCenterEvents.emit("workspaceChange", {
    type: "remove",
    path: resolved,
    all: getAllWorkspaces(),
  });

  return { success: true };
}

/**
 * Checks whether a given path is inside any of the approved workspace directories.
 */
export function isPathInAllowedWorkspaces(targetPath: string): boolean {
  const resolved = path.resolve(expandHome(targetPath));
  const all = getAllWorkspaces();

  for (const ws of all) {
    const safeRoot = ws.endsWith(path.sep) ? ws : ws + path.sep;
    if (resolved.startsWith(safeRoot) || resolved === ws) {
      return true;
    }
  }

  return false;
}

/**
 * Finds which workspace a targetPath belongs to (longest matching workspace root).
 */
export function getMatchingWorkspace(targetPath: string): string {
  const resolved = path.resolve(expandHome(targetPath));
  const all = getAllWorkspaces();
  let bestMatch = primaryWorkspace;
  let bestLength = 0;

  for (const ws of all) {
    const safeRoot = ws.endsWith(path.sep) ? ws : ws + path.sep;
    if ((resolved.startsWith(safeRoot) || resolved === ws) && ws.length > bestLength) {
      bestMatch = ws;
      bestLength = ws.length;
    }
  }

  return bestMatch;
}

/**
 * Security: Ensures the AI cannot access files outside any allowed workspaces
 * (Prevents path traversal attacks like "../../windows/system32")
 */
export function resolveSafePath(userPath: string, preferredWorkspace?: string): string {
  const expanded = expandHome(userPath);
  let targetPath: string;

  if (path.isAbsolute(expanded)) {
    targetPath = path.resolve(expanded);
  } else {
    const baseDir = (preferredWorkspace && isPathInAllowedWorkspaces(preferredWorkspace))
      ? path.resolve(expandHome(preferredWorkspace))
      : primaryWorkspace;
    targetPath = path.resolve(baseDir, expanded);
  }

  if (!isPathInAllowedWorkspaces(targetPath)) {
    throw new Error(
      `Access Denied: Path "${userPath}" is outside allowed workspaces (${getAllWorkspaces().join(", ")})`
    );
  }

  return targetPath;
}
