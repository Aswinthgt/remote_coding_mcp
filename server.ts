#!/usr/bin/env node
import { FastMCP } from "fastmcp";
import { PORT, AUTH_TOKEN, WORKSPACE_DIR } from "./config.js";
import { registerAllTools } from "./tools/index.js";

// ==========================================
// SERVER INITIALIZATION
// ==========================================
const server = new FastMCP({
  name: "Remote-Coder-Filesystem",
  version: "1.0.0",
});

// ==========================================
// AUTHENTICATION MIDDLEWARE
// ==========================================
const app = server.getApp();

app.use("*", async (c, next) => {
  // If no token was provided at startup, authentication is disabled
  if (!AUTH_TOKEN) {
    await next();
    return;
  }

  const authHeader = c.req.header("Authorization");
  if (authHeader !== `Bearer ${AUTH_TOKEN}`) {
    return c.text("Unauthorized: Invalid or missing API key.", 401);
  }
  await next();
});

// ==========================================
// REGISTER TOOLS
// ==========================================
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