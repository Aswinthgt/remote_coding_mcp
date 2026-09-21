import crypto from "crypto";
import { OAUTH_BASE_URL } from "../config.js";

interface RegisteredClient {
  clientId: string;
  clientSecret?: string;
  redirectUris: string[];
}

interface AuthorizationCode {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  expiresAt: number;
}

interface AccessToken {
  clientId: string;
  resource: string;
  expiresAt: number;
}

const clients = new Map<string, RegisteredClient>();
const authorizationCodes = new Map<string, AuthorizationCode>();
const accessTokens = new Map<string, AccessToken>();

function randomId(prefix: string, bytes = 32): string {
  return prefix + crypto.randomBytes(bytes).toString("base64url");
}

export function getOAuthIssuer(): string {
  if (!OAUTH_BASE_URL) throw new Error("OAuth is not enabled.");
  return OAUTH_BASE_URL;
}

export function getProtectedResourceMetadataUrl(): string {
  return getOAuthIssuer() + "/.well-known/oauth-protected-resource";
}

export function registerClient(input: {
  clientName?: string;
  redirectUris: string[];
}): RegisteredClient {
  const clientId = randomId("client_");
  const clientSecret = randomId("secret_", 24);
  const client = {
    clientId,
    clientSecret,
    redirectUris: input.redirectUris,
  };
  clients.set(clientId, client);
  return client;
}

export function getClient(clientId: string): RegisteredClient | undefined {
  return clients.get(clientId);
}

/**
 * Creates the server-generated client used when the user supplies OAuth
 * credentials manually to an MCP client. It uses the same client registry
 * as Dynamic Client Registration.
 */
export function initializeStartupClient(redirectUri: string): RegisteredClient {
  return registerClient({
    clientName: "Remote Coding MCP startup client",
    redirectUris: [redirectUri],
  });
}

export function createAuthorizationCode(input: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
}): string {
  const code = randomId("code_", 32);
  authorizationCodes.set(code, {
    ...input,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
  return code;
}

function timingSafeEqualString(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

export function exchangeAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}): { accessToken: string; expiresIn: number } | null {
  const record = authorizationCodes.get(input.code);
  if (!record) return null;

  // Authorization codes are single-use.
  authorizationCodes.delete(input.code);

  if (record.expiresAt < Date.now()) return null;
  if (record.clientId !== input.clientId) return null;
  if (record.redirectUri !== input.redirectUri) return null;

  const challenge = crypto
    .createHash("sha256")
    .update(input.codeVerifier)
    .digest("base64url");

  if (!timingSafeEqualString(challenge, record.codeChallenge)) return null;

  const accessToken = randomId("mcp_at_", 48);
  const expiresIn = 3600;

  accessTokens.set(accessToken, {
    clientId: input.clientId,
    resource: getOAuthIssuer() + "/mcp",
    expiresAt: Date.now() + expiresIn * 1000,
  });

  return { accessToken, expiresIn };
}

export function verifyOAuthAccessToken(token: string): boolean {
  const record = accessTokens.get(token);
  if (!record) return false;

  if (record.expiresAt < Date.now()) {
    accessTokens.delete(token);
    return false;
  }

  return true;
}

export function getOAuthAccessTokenInfo(token: string): AccessToken | undefined {
  return accessTokens.get(token);
}

export function cleanupOAuthState(): void {
  const now = Date.now();

  for (const [code, record] of authorizationCodes) {
    if (record.expiresAt < now) authorizationCodes.delete(code);
  }

  for (const [token, record] of accessTokens) {
    if (record.expiresAt < now) accessTokens.delete(token);
  }
}
