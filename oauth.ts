import type { Hono } from "hono";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { ENABLE_OAUTH, OAUTH_BASE_URL } from "./config.js";
import {
  createAuthorizationCode,
  exchangeAuthorizationCode,
  getClient,
  getOAuthIssuer,
  registerClient,
  verifyOAuthAccessToken,
  cleanupOAuthState,
} from "./service/oauth.js";

export { verifyOAuthAccessToken };

export function isOAuthRoute(path: string): boolean {
  if (!ENABLE_OAUTH) return false;

  return [
    "/oauth/token",
    "/oauth/token/",
    "/oauth/authorize",
    "/oauth/register",
    "/.well-known/oauth-authorization-server",
    "/.well-known/oauth-protected-resource",
  ].includes(path);
}

function oauthDisabled(c: any) {
  return c.json({ error: "not_found" }, 404);
}

function parseBasicAuth(value?: string): { clientId: string; clientSecret: string } | null {
  if (!value?.startsWith("Basic ")) return null;

  try {
    const decoded = Buffer.from(value.slice(6).trim(), "base64").toString("utf8");
    const index = decoded.indexOf(":");
    if (index < 0) return null;

    return {
      clientId: decoded.slice(0, index),
      clientSecret: decoded.slice(index + 1),
    };
  } catch {
    return null;
  }
}

async function parseTokenRequest(c: any): Promise<Record<string, string>> {
  const contentType = c.req.header("Content-Type") ?? "";

  if (contentType.includes("application/json")) {
    return await c.req.json();
  }

  const body = await c.req.parseBody();
  return Object.fromEntries(
    Object.entries(body).map(([key, value]) => [key, String(value)])
  );
}

async function handleToken(c: any) {
  if (!ENABLE_OAUTH) return oauthDisabled(c);

  cleanupOAuthState();

  let body: Record<string, string> = {};
  try {
    body = await parseTokenRequest(c);
  } catch {
    return c.json(
      { error: "invalid_request", error_description: "Invalid token request body." },
      400
    );
  }

  const basic = parseBasicAuth(c.req.header("Authorization"));
  const clientId = basic?.clientId ?? body.client_id;
  const clientSecret = basic?.clientSecret ?? body.client_secret;

  if (!clientId) {
    return c.json({ error: "invalid_client" }, 401);
  }

  const client = getClient(clientId);
  if (!client || !client.clientSecret || client.clientSecret !== clientSecret) {
    return c.json({ error: "invalid_client" }, 401);
  }

  if (body.grant_type !== "authorization_code") {
    return c.json(
      {
        error: "unsupported_grant_type",
        error_description: "This server supports the authorization_code grant with PKCE.",
      },
      400
    );
  }

  const code = body.code;
  const redirectUri = body.redirect_uri;
  const codeVerifier = body.code_verifier;

  if (!code || !redirectUri || !codeVerifier) {
    return c.json(
      { error: "invalid_request", error_description: "code, redirect_uri and code_verifier are required." },
      400
    );
  }

  const result = exchangeAuthorizationCode({
    code,
    clientId,
    redirectUri,
    codeVerifier,
  });

  if (!result) {
    return c.json(
      { error: "invalid_grant", error_description: "Invalid, expired, or already-used authorization code." },
      400
    );
  }

  return c.json({
    access_token: result.accessToken,
    token_type: "Bearer",
    expires_in: result.expiresIn,
    scope: "mcp",
  });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function loadAuthorizationPage(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}) {
  const possiblePaths = [
    path.join(__dirname, "views", "oauth-authorization.html"),
    path.join(__dirname, "..", "views", "oauth-authorization.html"),
    path.join(process.cwd(), "views", "oauth-authorization.html"),
    path.join(process.cwd(), "dist", "views", "oauth-authorization.html"),
  ];

  let html: string | null = null;
  for (const candidate of possiblePaths) {
    try {
      html = await fs.readFile(candidate, "utf-8");
      break;
    } catch {
      // Continue looking in other runtime locations.
    }
  }

  if (!html) {
    throw new Error("Unable to locate views/oauth-authorization.html in any expected path.");
  }

  const hiddenFields = [
    ["client_id", params.clientId],
    ["redirect_uri", params.redirectUri],
    ["response_type", "code"],
    ["state", params.state],
    ["code_challenge", params.codeChallenge],
    ["code_challenge_method", "S256"],
  ]
    .map(([name, value]) => `<input type="hidden" name="${name}" value="${escapeHtml(value ?? "")}">`)
    .join("\n          ");

  return html
    .replace(/__CLIENT_ID__/g, escapeHtml(params.clientId))
    .replace(/__REDIRECT_URI__/g, escapeHtml(params.redirectUri))
    .replace(/__HIDDEN_FIELDS__/g, hiddenFields);
}

async function handleAuthorize(c: any) {
  if (!ENABLE_OAUTH) return oauthDisabled(c);

  cleanupOAuthState();

  const method = c.req.method;
  let params: Record<string, string> = {};

  if (method === "GET") {
    params = {
      client_id: c.req.query("client_id") ?? "",
      redirect_uri: c.req.query("redirect_uri") ?? "",
      response_type: c.req.query("response_type") ?? "",
      state: c.req.query("state") ?? "",
      code_challenge: c.req.query("code_challenge") ?? "",
      code_challenge_method: c.req.query("code_challenge_method") ?? "",
    };
  } else {
    const body = await c.req.parseBody();
    params = Object.fromEntries(
      Object.entries(body).map(([key, value]) => [key, String(value)])
    );
  }

  const clientId = params.client_id;
  const redirectUri = params.redirect_uri;
  const responseType = params.response_type;
  const codeChallenge = params.code_challenge;
  const codeChallengeMethod = params.code_challenge_method;

  if (!clientId || !redirectUri || !responseType || !codeChallenge || !codeChallengeMethod) {
    return c.text("Missing required OAuth authorization parameters.", 400);
  }

  const client = getClient(clientId);
  if (!client) return c.text("Unknown client_id.", 400);

  if (responseType !== "code") {
    return c.text("Only response_type=code is supported.", 400);
  }

  if (!client.redirectUris.includes(redirectUri)) {
    return c.text("Invalid redirect_uri.", 400);
  }

  if (codeChallengeMethod !== "S256") {
    return c.text("PKCE S256 is required.", 400);
  }

  if (method === "GET") {
    try {
      return c.html(
        await loadAuthorizationPage({
          clientId,
          redirectUri,
          state: params.state ?? "",
          codeChallenge,
        })
      );
    } catch (err: any) {
      return c.text(`Authorization page error: ${err.message}`, 500);
    }
  }

  const redirect = new URL(redirectUri);

  if (params.decision === "deny") {
    redirect.searchParams.set("error", "access_denied");
    redirect.searchParams.set("error_description", "The resource owner denied the authorization request.");
    if (params.state) redirect.searchParams.set("state", params.state);
    return c.redirect(redirect.toString(), 302);
  }

  if (params.decision !== "allow") {
    return c.text("Invalid authorization decision.", 400);
  }

  const code = createAuthorizationCode({
    clientId,
    redirectUri,
    codeChallenge,
  });

  redirect.searchParams.set("code", code);
  if (params.state) redirect.searchParams.set("state", params.state);

  // RFC 9207 issuer response parameter.
  redirect.searchParams.set("iss", getOAuthIssuer());

  return c.redirect(redirect.toString(), 302);
}

export function registerOAuth(app: Hono): void {
  app.post("/oauth/register", async (c) => {
    if (!ENABLE_OAUTH) return oauthDisabled(c);

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_client_metadata" }, 400);
    }

    const redirectUris = Array.isArray(body.redirect_uris)
      ? body.redirect_uris.filter((uri: unknown): uri is string => typeof uri === "string")
      : [];

    if (!redirectUris.length) {
      return c.json(
        { error: "invalid_redirect_uri", error_description: "redirect_uris is required." },
        400
      );
    }

    const client = registerClient({
      clientName: body.client_name,
      redirectUris,
    });

    return c.json({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: "client_secret_basic",
    }, 201);
  });

  app.get("/oauth/token", (c) => c.json({ error: "method_not_allowed" }, 405));
  app.post("/oauth/token", handleToken);

  app.get("/oauth/authorize", handleAuthorize);
  app.post("/oauth/authorize", handleAuthorize);

  app.get("/.well-known/oauth-protected-resource", (c) => {
    if (!ENABLE_OAUTH || !OAUTH_BASE_URL) return oauthDisabled(c);

    return c.json({
      resource: OAUTH_BASE_URL + "/mcp",
      authorization_servers: [getOAuthIssuer()],
      scopes_supported: ["mcp"],
      bearer_methods_supported: ["header"],
    });
  });

  app.get("/.well-known/oauth-authorization-server", (c) => {
    if (!ENABLE_OAUTH || !OAUTH_BASE_URL) return oauthDisabled(c);

    return c.json({
      issuer: getOAuthIssuer(),
      authorization_endpoint: getOAuthIssuer() + "/oauth/authorize",
      token_endpoint: getOAuthIssuer() + "/oauth/token",
      registration_endpoint: getOAuthIssuer() + "/oauth/register",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
      scopes_supported: ["mcp"],
    });
  });
}
