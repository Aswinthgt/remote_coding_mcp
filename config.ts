import path from "path";
import { parseArgs } from "util";
import os from "os";

const options = {
  port: { 
    type: "string" as const, 
    short: "p",
    default: "8080"
  },
  token: { 
    type: "string" as const, 
    short: "t",
  },
  workspace: { 
    type: "string" as const, 
    short: "w"
  }
};

// Parse the arguments
const { values } = parseArgs({ options, strict: false });

// ==========================================
// CONFIGURATION & SANDBOXING
// ==========================================
export const PORT = Number(values.port) || 8080;
export const AUTH_TOKEN = values.token as string | undefined;

// Determine the allowed folder for file editing. Defaults to the user's home directory.
export const WORKSPACE_DIR = path.resolve((values.workspace as string | undefined) ?? os.homedir());
