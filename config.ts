import path from "path";
import { parseArgs } from "util";
import os from "os";

const rawArgs = process.argv.slice(2);
const normalizedArgs = rawArgs.map((arg) => {
  const lower = arg.toLowerCase();
  if (lower === "-enable-auth" || lower === "--enable-auth") return "--enable-auth";
  if (lower === "-enable-oauth" || lower === "--enable-oauth") return "--enable-oauth";
  return arg;
});

// Support: --enable-oauth https://example.com
for (let i = 0; i < normalizedArgs.length - 1; i++) {
  if (
    normalizedArgs[i] === "--enable-oauth" &&
    normalizedArgs[i + 1] &&
    !normalizedArgs[i + 1]!.startsWith("-")
  ) {
    const url = normalizedArgs[i + 1]!;
    normalizedArgs.splice(i, 2, "--enable-oauth", "--oauth-url=" + url);
    break;
  }
}

const options = {
  port: { type: "string" as const, short: "p", default: "8080" },
  "enable-auth": { type: "boolean" as const, default: false },
  "enable-oauth": { type: "boolean" as const, default: false },
  "oauth-url": { type: "string" as const },
  "oauth-redirect-uri": { type: "string" as const },
  workspace: { type: "string" as const, short: "w" }
};

const { values } = parseArgs({ args: normalizedArgs, options, strict: false });

export const PORT = Number(values.port) || 8080;

const rawOAuth = values["enable-oauth"];
export const ENABLE_OAUTH = rawOAuth === true || rawOAuth === "true";

const rawOAuthUrl = values["oauth-url"] as string | undefined;

function normalizeOAuthUrl(value: string): string {
  if (!value) {
    throw new Error(
      "OAuth URL is required. Use: --enable-oauth https://your-public-domain.example"
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      "Invalid OAuth URL. Use: --enable-oauth https://your-public-domain.example"
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("OAuth URL must use http:// or https://.");
  }

  parsed.hash = "";
  parsed.search = "";
  return parsed.toString().replace(/\/$/, "");
}

export const OAUTH_BASE_URL = ENABLE_OAUTH
  ? normalizeOAuthUrl(rawOAuthUrl ?? "")
  : null;

export const OAUTH_REDIRECT_URI = ENABLE_OAUTH
  ? (values["oauth-redirect-uri"] as string | undefined) ?? "https://antigravity.google/oauth-callback"
  : null;

const rawAuth = values["enable-auth"];
export const ENABLE_AUTH = ENABLE_OAUTH || rawAuth === true || rawAuth === "true";

export const WORKSPACE_DIR = path.resolve(
  (values.workspace as string | undefined) ?? os.homedir()
);
