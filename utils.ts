import { exec } from "child_process";
import { promisify } from "util";
import { resolveSafePath, getMatchingWorkspace, getAllWorkspaces, getPrimaryWorkspace } from "./workspaceManager.js";

export const execAsync = promisify(exec);
export { resolveSafePath, getMatchingWorkspace, getAllWorkspaces, getPrimaryWorkspace };
