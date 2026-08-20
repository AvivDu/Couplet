import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { api } from './api';

// Expo Go can't own the custom `cuplet://` redirect scheme, so the OAuth flow
// only works from a Dev Client build. Detect Expo Go and fail fast with a clear
// message instead of letting promptAsync hang or fail with a confusing error.
export const isGmailOAuthAvailable = Constants.appOwnership !== 'expo';

// Required once so the OAuth browser tab hands control back to the app after Google redirects.
WebBrowser.maybeCompleteAuthSession();

const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
};

// Custom-scheme redirect (cuplet://oauth2redirect) — requires a Dev Client build,
// registered with Google Cloud Console (see README). Doesn't work in plain Expo Go.
const redirectUri = AuthSession.makeRedirectUri({ scheme: 'cuplet', path: 'oauth2redirect' });

export interface GmailCandidate {
  message_id: string;
  from: string;
  subject: string;
  date: string;
  created_at: string;
}

// Launches Google's consent screen (PKCE, no client secret on the device), then
// sends the resulting auth code to the backend, which does the token exchange.
export async function connectGmail(): Promise<{ gmail_email: string }> {
  if (!isGmailOAuthAvailable) {
    throw new Error('Connecting Gmail isn\'t available in Expo Go — it needs a development build. Coming in a later step.');
  }

  const clientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('EXPO_PUBLIC_GOOGLE_CLIENT_ID is not set');

  const request = new AuthSession.AuthRequest({
    clientId,
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    redirectUri,
    usePKCE: true,
    responseType: AuthSession.ResponseType.Code,
    // access_type=offline + prompt=consent so Google reliably issues a refresh token.
    extraParams: { access_type: 'offline', prompt: 'consent' },
  });

  const result = await request.promptAsync(discovery);
  if (result.type !== 'success') {
    throw new Error(result.type === 'cancel' ? 'Gmail connection cancelled' : 'Gmail connection failed');
  }
  if (!request.codeVerifier) throw new Error('Missing PKCE verifier');

  const { data } = await api.post('/gmail/connect', {
    code: result.params.code,
    code_verifier: request.codeVerifier,
    redirect_uri: redirectUri,
  });
  return data;
}

export const scanGmail = () => api.post<GmailCandidate[]>('/gmail/scan');
export const getGmailCandidates = () => api.get<GmailCandidate[]>('/gmail/candidates');

export interface GmailStatus {
  connected: boolean;
  gmail_email: string | null;
}

export const getGmailStatus = () => api.get<GmailStatus>('/gmail/status').then(r => r.data);

// Expo-Go-compatible connect flow: the backend mints a ready-to-open Google consent
// URL and completes the whole exchange itself once Google redirects back to it
// (a plain https:// URL — no custom scheme needed). We just open it and wait for
// the user to switch back; there's no synchronous success signal, so the caller
// should re-check getGmailStatus() afterward (the screen's focus/AppState handlers do this).
export async function connectGmailViaBrowser(): Promise<void> {
  const { data } = await api.post<{ authUrl: string }>('/gmail/connect/start');
  await WebBrowser.openBrowserAsync(data.authUrl);
}
