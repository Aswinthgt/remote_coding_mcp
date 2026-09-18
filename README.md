# remote-coding-mcp

[![npm version](https://img.shields.io/npm/v/remote-coding-mcp.svg)](https://www.npmjs.com/package/remote-coding-mcp)
[![GitHub](https://img.shields.io/badge/GitHub-Aswinthgt%2Fremote__coding__mcp-blue?logo=github)](https://github.com/Aswinthgt/remote_coding_mcp)
[![License: ISC](https://img.shields.io/badge/License-ISC-green.svg)](https://opensource.org/licenses/ISC)

> A zero-config MCP server that lets any AI (Gemini, Claude, GPT, etc.) read and write code **directly on your machine** — over the internet.

---

## How it works

```
Your Machine                         AI (Gemini / Claude / etc.)
─────────────────────────────        ──────────────────────────────
npx remote-coding-mcp                Connect MCP → your public URL
        │                                        │
        ▼                                        │
  MCP server on                                  │
  localhost:8080  ◄──── ngrok / VS Code port ────┘
                         forwarding (public URL)
```

1. Run `npx remote-coding-mcp` on your machine — the MCP server starts locally.
2. Expose it to the internet using **ngrok** or **VS Code port forwarding**.
3. Copy the public URL and paste it into any AI that supports MCP (e.g. Gemini Spark → Connect Apps).
4. Tell the AI what you want to build — it reads and writes code **directly on your machine**.

---

## Quick Start

```bash
npx remote-coding-mcp
```

That's it. The server starts on port `8080` with the workspace locked to your home directory.

### With options

```bash
npx remote-coding-mcp -p 3000 -w "D:/my-project" --enable-auth
```

| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--port` | `-p` | `8080` | Port to listen on |
| `--workspace` | `-w` | `os.homedir()` | Root folder the AI is allowed to access |
| `--enable-auth` | *(none)* | `false` | Enable JWT authentication (generates and displays token on startup) |
| `--enable-oauth` | *(none)* | `false` | Enable OAuth 2.0 (generates Client ID & Secret for ChatGPT / Gemini) |

---

## 🎛️ Terminal Control Center

Every instance includes a built-in, real-time web dashboard accessible at:

```
http://localhost:8080/control-center
```

Designed with a high-tech terminal UI, the Control Center puts you in complete control of what the AI can do on your system in real time:

- **Toggle Any Tool**: Turn individual tools ON or OFF on the fly.
- **📁 Multi-Workspace Manager**: Authorize additional folders or project directories dynamically without restarting the server. Primary workspace remains permanently protected.
- **🛡️ Safe Mode Preset**: One-click lock down — instantly disables shell execution, file deletion, and file writing tools while keeping read and search tools active.
- **Smart Permission Interception**: If an AI agent attempts to invoke a tool you've disabled, execution is blocked and the AI receives:
  > *"Error: The tool '\<tool\>' has been disabled by the user in the Control Center. Please ask the user for permission to enable this tool before proceeding."*
- **Secure Access**: When `--enable-auth` or `--enable-oauth` is set, a cryptographically signed JWT token is displayed in your terminal. Use it to unlock the dashboard or append `?token=<your-jwt-token>`.

---

## Expose to the Internet

### Option A — ngrok

```bash
# Install ngrok: https://ngrok.com/download
ngrok http 8080
```

ngrok gives you a URL like `https://abc123.ngrok-free.app`.\
Your **MCP endpoint** is: `https://abc123.ngrok-free.app/mcp`

### Option B — VS Code Port Forwarding

1. Open the **Ports** panel in VS Code (`Ctrl+Shift+P` → *Forward a Port*).
2. Forward port `8080`.
3. Set visibility to **Public**.
4. Copy the generated URL and append `/mcp`.\
   e.g. `https://abc123-8080.app.github.dev/mcp`

---

## Connect to an AI

### Gemini (AI Studio / Gemini Spark)

1. Open [Google AI Studio](https://aistudio.google.com) or Gemini Spark.
2. Go to **Connect Apps** → **Add MCP Server**.
3. Paste your public URL with `/mcp` at the end — e.g. `https://abc123.ngrok-free.app/mcp`.
4. If authentication is enabled: add header `Authorization: Bearer <your-jwt-token>`.
5. Start chatting — the AI can now code on your machine.

### Claude (Desktop / API)

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "remote-coder": {
      "url": "https://abc123.ngrok-free.app/mcp",
      "headers": {
        "Authorization": "Bearer <your-jwt-token>"
      }
    }
  }
}
```

### ChatGPT / Gemini (OAuth 2.0)

When launched with `--enable-oauth`, the server generates OAuth 2.0 client credentials:

```bash
npx remote-coding-mcp --enable-oauth
```

In your custom GPT or AI provider configuration:
- **Client ID**: Paste the Client ID shown in the terminal.
- **Client Secret**: Paste the Client Secret shown in the terminal.
- **Token URL**: `https://<your-public-url>/oauth/token` (or `http://localhost:8080/oauth/token` if local).

---

### Any MCP-compatible client

Point it to:
```
https://<your-public-url>/mcp
```

---

## Available Tools

The AI gets access to these tools on your machine:

| Tool | Description |
|------|-------------|
| `available_directories` | List all authorized workspace directories (primary + dynamic) |
| `list_directory` | List files and folders |
| `read_file` | Read a file (with optional line range) |
| `write_file` | Create or overwrite a file |
| `create_file` | Create a new file (fails if exists) |
| `replace_in_file` | Surgical text replacement inside a file |
| `insert_at_line` | Insert text at a specific line |
| `delete_file` | Delete a file |
| `rename_file` | Rename or move a file |
| `execute_command` | Run a shell command in workspace (supports optional `cwd`) |
| `grep_search` | Search for a pattern across files |
| `search_files_by_name` | Find files by name or extension |
| `get_file_info` | Get file size, line count, last modified |
| `git_diff` | View uncommitted git changes (supports optional `cwd`) |

---

## Security

- The AI can **only access files inside approved workspace directories** (primary + added workspaces) — path traversal attacks are blocked.
- Pass `--enable-auth` to require a secure JWT token on every request.
- Pass `--enable-oauth` to enable OAuth 2.0 authentication with dynamic Client ID & Secret for AI providers.
- Without `--enable-auth` or `--enable-oauth`, the server accepts all requests (fine for local/trusted networks).
- **Fine-Grained Tool Permissions**: Use the Control Center (`/control-center`) to toggle high-risk tools (e.g. `execute_command` or `delete_file`) on/off or activate **Safe Mode** anytime.

---

## License

ISC — made by [Aswinth GT](https://github.com/Aswinthgt)

> ⭐ If this project helps you, consider starring it on [GitHub](https://github.com/Aswinthgt/remote_coding_mcp)!