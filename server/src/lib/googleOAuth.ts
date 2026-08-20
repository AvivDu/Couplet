import type { OAuthClient } from '../repositories/gmailConnections';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export interface ClientCredentials {
  clientId: string;
  clientSecret: string;
}

// Two separate Google OAuth clients: "native" (Desktop app type, custom-scheme
// redirect, used by the Dev Client build) and "web" (Web application type, plain
// https redirect, used by the Expo-Go-compatible browser bridge). Google binds
// refresh tokens to whichever client requested them, so callers must always use
// the credentials matching the connection's stored `oauth_client`.
const NATIVE_CREDENTIALS: ClientCredentials = {
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
};
const WEB_CREDENTIALS: ClientCredentials = {
  clientId: process.env.GOOGLE_WEB_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_WEB_CLIENT_SECRET!,
};

export function credentialsFor(oauthClient: OAuthClient): ClientCredentials {
  return oauthClient === 'web' ? WEB_CREDENTIALS : NATIVE_CREDENTIALS;
}

async function postToken(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const data = await res.json() as any;
  if (!res.ok) {
    throw new Error(`Google token endpoint error: ${data.error ?? res.status} ${data.error_description ?? ''}`);
  }
  return data as TokenResponse;
}

// Exchanges an auth code for tokens. The client secret never leaves the server.
// codeVerifier is only needed for the PKCE (native/public-client) flow — the web
// flow is a confidential client authenticated by its own client_secret instead.
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  credentials: ClientCredentials,
  codeVerifier?: string
): Promise<TokenResponse> {
  return postToken({
    grant_type: 'authorization_code',
    code,
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    redirect_uri: redirectUri,
    ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
  });
}

export async function refreshAccessToken(refreshToken: string, credentials: ClientCredentials): Promise<string> {
  const data = await postToken({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
  });
  return data.access_token;
}

// Builds the Google consent-screen URL for the browser-bridge (Expo Go) flow.
export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: WEB_CREDENTIALS.clientId,
    redirect_uri: process.env.GOOGLE_WEB_REDIRECT_URI!,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}
