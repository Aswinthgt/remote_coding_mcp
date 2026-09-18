#!/usr/bin/env node
import { FastMCP } from "fastmcp";
import { PORT, ENABLE_AUTH, ENABLE_OAUTH, WORKSPACE_DIR } from "./config.js";
import {
  initializeAuth,
  verifyAuthToken,
  getAuthToken,
  extractToken,
  getClientId,
  getClientSecret,
} from "./auth.js";
import { setupToolControl } from "./toolControl.js";
import { registerControlCenter } from "./controlCenter.js";
import { registerOAuth, isOAuthRoute } from "./oauth.js";
import { registerAllTools } from "./tools/index.js";

// ==========================================
// INITIALIZE AUTHENTICATION IF ENABLED
// ==========================================
if (ENABLE_AUTH) {
  await initializeAuth(ENABLE_OAUTH);
}

// Build FastMCP options — only attach `authenticate` when auth is enabled.
// Without this, some MCP clients detect the handler and attempt OAuth discovery even in open mode.
const mcpAuthHandler = ENABLE_AUTH
  ? async (request: any) => {
      const authHeader =
        request.headers?.["authorization"] ||
        (typeof request.headers?.get === "function" ? request.headers.get("authorization") : undefined);
      const url = new URL(request.url || "", "http://localhost");
      const queryToken = url.searchParams.get("token");

      const token = extractToken(authHeader, queryToken);
      if (!token || !(await verifyAuthToken(token))) {
        throw new Response("Unauthorized: Invalid or missing authentication token.", {
          status: 401,
          statusText: "Unauthorized",
        });
      }

      return { token };
    }
  : undefined;

const server = new FastMCP({
  name: "Remote-Coder-Filesystem",
  version: "1.0.0",
  ...(mcpAuthHandler ? { authenticate: mcpAuthHandler } : {}),
});

// ==========================================
// TOOL CONTROL INTERCEPTION
// ==========================================
setupToolControl(server);

// ==========================================
// AUTHENTICATION MIDDLEWARE
// ==========================================
const app = server.getApp();

app.use("*", async (c, next) => {
  // If authentication is disabled, bypass
  if (!ENABLE_AUTH) {
    await next();
    return;
  }

  // Allow the Control Center HTML view to load so it can present the unlock modal
  if (c.req.path === "/control-center" || c.req.path === "/control-center/") {
    await next();
    return;
  }

  // Allow OAuth 2.0 discovery, token, and authorize endpoints to bypass Bearer check
  if (isOAuthRoute(c.req.path)) {
    await next();
    return;
  }

  const token = extractToken(c.req.header("Authorization"), c.req.query("token"));
  const isControlCenterApi = c.req.path.startsWith("/control-center/api/");

  if (!token) {
    const error = "Unauthorized: Missing authentication token.";
    return isControlCenterApi ? c.json({ error }, 401) : c.text(error, 401);
  }

  const isValid = await verifyAuthToken(token);
  if (!isValid) {
    const error = "Unauthorized: Invalid or expired authentication token.";
    return isControlCenterApi ? c.json({ error }, 401) : c.text(error, 401);
  }

  await next();
});

// ==========================================
// CONTROL CENTER, OAUTH & TOOLS REGISTRATION
// ==========================================
registerControlCenter(app);
registerOAuth(app);
registerAllTools(server);

// ==========================================
// START SERVER
// ==========================================
server.start({
  transportType: "httpStream",
  httpStream: {
    port: PORT,
  },
});

console.log(`🚀 Remote Coder MCP Server running on port ${PORT}`);
console.log(`🔒 Workspace locked to: ${WORKSPACE_DIR}`);

const token = getAuthToken();
const clientId = getClientId();
const clientSecret = getClientSecret();

if (ENABLE_OAUTH && clientId && clientSecret && token) {
  console.log(`\n================================================================================`);
  console.log(`🔐 OAUTH 2.0 & AUTHENTICATION ENABLED`);
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`🆔 OAuth Client ID:`);
  console.log(clientId);
  console.log(``);
  console.log(`🔒 OAuth Client Secret:`);
  console.log(clientSecret);
  console.log(``);
  console.log(`🌐 OAuth Token Endpoint:`);
  console.log(`http://localhost:${PORT}/oauth/token`);
  console.log(``);
  console.log(`🔑 Direct JWT Access Token:`);
  console.log(token);
  console.log(``);
  console.log(`🎛️  Control Center (One-Click Access):`);
  console.log(`http://localhost:${PORT}/control-center?token=${token}`);
  console.log(``);
  console.log(`🔌 MCP Server URL:`);
  console.log(`http://localhost:${PORT}/mcp`);
  console.log(``);
  console.log(`🤖 For AI Providers (ChatGPT, Gemini, etc.):`);
  console.log(`• Client ID:     ${clientId}`);
  console.log(`• Client Secret: ${clientSecret}`);
  console.log(`• Token URL:     http://localhost:${PORT}/oauth/token`);
  console.log(`================================================================================\n`);
} else if (ENABLE_AUTH && token) {
  console.log(`\n================================================================================`);
  console.log(`🔐 AUTHENTICATION ENABLED`);
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`🔑 JWT Access Token:`);
  console.log(token);
  console.log(``);
  console.log(`🎛️  Control Center (One-Click Access):`);
  console.log(`http://localhost:${PORT}/control-center?token=${token}`);
  console.log(``);
  console.log(`🔌 MCP Server URL:`);
  console.log(`http://localhost:${PORT}/mcp`);
  console.log(``);
  console.log(`🤖 For MCP Clients (Claude, Cursor, AI Studio), provide:`);
  console.log(`URL:    http://localhost:${PORT}/mcp`);
  console.log(`Header: Authorization: Bearer ${token}`);
  console.log(`================================================================================\n`);
} else {
  console.log(`🔌 MCP Server URL: http://localhost:${PORT}/mcp`);
  console.log(`🎛️  Control Center available at: http://localhost:${PORT}/control-center`);
  console.log(`🔓 Authentication: DISABLED (Pass --enable-auth for JWT, or --enable-oauth for OAuth 2.0)`);
}