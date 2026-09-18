import crypto from "crypto";
import { SignJWT, jwtVerify } from "jose";

export const PROJECT_IDENTITY = "remote-coding-mcp";

let serverJwtToken: string | null = null;
let activeRandomId: string | null = null;
let signingSecret: Uint8Array | null = null;
let oauthClientId: string | null = null;
let oauthClientSecret: string | null = null;

/**
 * Initializes server authentication by generating an ephemeral session secret,
 * a unique random ID, and a signed JWT containing project identity verification.
 * Optionally generates OAuth client_id and client_secret if enableOAuth is true.
 */
export async function initializeAuth(enableOAuth = false): Promise<string> {
  // Generate a cryptographically secure 256-bit secret key for this server instance
  signingSecret = crypto.getRandomValues(new Uint8Array(32));

  // Generate a unique random ID for this session
  activeRandomId = crypto.randomUUID();

  // Create and sign the JWT token
  serverJwtToken = await new SignJWT({
    randomId: activeRandomId,
    identity: PROJECT_IDENTITY,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(PROJECT_IDENTITY)
    .setIssuedAt()
    .sign(signingSecret);

  if (enableOAuth) {
    oauthClientId = "mcp_" + crypto.randomBytes(8).toString("hex");
    oauthClientSecret = "sec_" + crypto.randomBytes(24).toString("hex");
  }

  return serverJwtToken;
}

/**
 * Returns the generated OAuth client ID for the current session.
 */
export function getClientId(): string | null {
  return oauthClientId;
}

/**
 * Returns the generated OAuth client secret for the current session.
 */
export function getClientSecret(): string | null {
  return oauthClientSecret;
}

/**
 * Verifies provided client credentials against the active session OAuth credentials.
 */
export function verifyClientCredentials(id: string, secret: string): boolean {
  if (!oauthClientId || !oauthClientSecret) {
    return false;
  }
  if (!id || !secret) {
    return false;
  }
  return id.trim() === oauthClientId && secret.trim() === oauthClientSecret;
}

/**
 * Returns the currently active JWT token, or null if auth was not initialized.
 */
export function getAuthToken(): string | null {
  return serverJwtToken;
}

/**
 * Returns the active random ID for the current session.
 */
export function getActiveRandomId(): string | null {
  return activeRandomId;
}

/**
 * Verifies that the provided token is valid, signed by this server instance,
 * belongs to this project identity, and matches the active session random ID.
 */
export async function verifyAuthToken(token: string): Promise<boolean> {
  if (!signingSecret || !activeRandomId) {
    return false;
  }

  if (!token || typeof token !== "string") {
    return false;
  }

  try {
    const { payload } = await jwtVerify(token, signingSecret, {
      issuer: PROJECT_IDENTITY,
    });

    // Verify identity that the token was created by this project
    if (payload.identity !== PROJECT_IDENTITY) {
      return false;
    }

    // Verify that the random ID matches the session random ID
    if (payload.randomId !== activeRandomId) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Extracts a token from an Authorization header value or query parameter.
 */
export function extractToken(
  authHeader?: string | null,
  queryToken?: string | null
): string | undefined {
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  if (authHeader) {
    return authHeader.trim();
  }
  if (queryToken) {
    return queryToken.trim();
  }
  return undefined;
}

