import path from "path";
import { parseArgs } from "util";
import os from "os";

// Normalize arguments to accept both single-dash and double-dash flags (case-insensitive for oauth)
const rawArgs = process.argv.slice(2);
const normalizedArgs = rawArgs.map((arg) => {
  const lower = arg.toLowerCase();
  if (lower === "-enable-auth" || lower === "--enable-auth") return "--enable-auth";
  if (lower === "-enable-oauth" || lower === "--enable-oauth") return "--enable-oauth";
  return arg;
});

const options = {
  port: { 
    type: "string" as const, 
    short: "p",
    default: "8080"
  },
  "enable-auth": { 
    type: "boolean" as const, 
    default: false
  },
  "enable-oauth": {
    type: "boolean" as const,
    default: false
  },
  workspace: { 
    type: "string" as const, 
    short: "w"
  }
};

// Parse the arguments
const { values } = parseArgs({ args: normalizedArgs, options, strict: false });

// ==========================================
// CONFIGURATION & SANDBOXING
// ==========================================
export const PORT = Number(values.port) || 8080;

// OAuth flag: `--enable-oauth` / `-enable-oAuth`
const rawOAuth = values["enable-oauth"];
export const ENABLE_OAUTH = rawOAuth === true || rawOAuth === "true";

// Auth flag: `--enable-auth` (or automatically true if OAuth is enabled)
const rawAuth = values["enable-auth"];
export const ENABLE_AUTH = ENABLE_OAUTH || rawAuth === true || rawAuth === "true";

// Determine the allowed folder for file editing. Defaults to the user's home directory.
export const WORKSPACE_DIR = path.resolve((values.workspace as string | undefined) ?? os.homedir());

