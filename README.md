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
npx remote-coding-mcp -p 3000 -w "D:/my-project" -t my-secret-token
```

| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--port` | `-p` | `8080` | Port to listen on |
| `--workspace` | `-w` | `os.homedir()` | Root folder the AI is allowed to access |
| `--token` | `-t` | *(none)* | Bearer token for auth (no auth if omitted) |

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
4. If you set a token: add header `Authorization: Bearer <your-token>`.
5. Start chatting — the AI can now code on your machine.

### Claude (Desktop / API)

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "remote-coder": {
      "url": "https://abc123.ngrok-free.app/mcp",
      "headers": {
        "Authorization": "Bearer my-secret-token"
      }
    }
  }
}
```

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
| `list_directory` | List files and folders |
| `read_file` | Read a file (with optional line range) |
| `write_file` | Create or overwrite a file |
| `create_file` | Create a new file (fails if exists) |
| `replace_in_file` | Surgical text replacement inside a file |
| `insert_at_line` | Insert text at a specific line |
| `delete_file` | Delete a file |
| `rename_file` | Rename or move a file |
| `execute_command` | Run a shell command (30s timeout) |
| `grep_search` | Search for a pattern across files |
| `search_files_by_name` | Find files by name or extension |
| `get_file_info` | Get file size, line count, last modified |
| `git_diff` | View uncommitted git changes |

---

## Security

- The AI can **only access files inside the `--workspace` directory** — path traversal attacks are blocked.
- Pass `--token` to require a `Bearer` token on every request.
- Without `--token`, the server accepts all requests (fine for local/trusted networks).

---

## License

ISC — made by [Aswinth GT](https://github.com/Aswinthgt)

> ⭐ If this project helps you, consider starring it on [GitHub](https://github.com/Aswinthgt/remote_coding_mcp)!