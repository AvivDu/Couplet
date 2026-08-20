import { Router, Request, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { encryptToken, decryptToken } from '../lib/tokenCrypto';
import { exchangeCodeForTokens, refreshAccessToken, buildGoogleAuthUrl, credentialsFor } from '../lib/googleOAuth';
import { getGmailAddress, buildCandidateQuery, listCandidateMessageIds, getMessageHeaders } from '../lib/gmail';
import { createOAuthState, verifyOAuthState } from '../lib/oauthState';
import { renderOAuthResultPage } from '../lib/oauthResultPage';
import { getGmailConnection, saveGmailConnection, addCandidatesAndUpdateLastScan, GmailCandidate, OAuthClient } from '../repositories/gmailConnections';

const router = Router();

// Public — Google redirects the user's browser here directly, so there's no
// Authorization header to check. Must stay registered before router.use(authMiddleware)
// below, since Express only applies middleware to handlers registered after it.
router.get('/callback', async (req: Request, res: Response): Promise<void> => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  const error = req.query.error as string | undefined;

  const success = (email: string) => renderOAuthResultPage({
    icon: '✅',
    heading: 'Gmail connected',
    message: `${email} is now connected to Couplet. Close this tab and go back to the app.`,
  });

  if (error) {
    res.send(renderOAuthResultPage({
      icon: '🚫',
      heading: 'Connection cancelled',
      message: 'You didn\'t grant access, so Gmail wasn\'t connected. Go back to the app and try again whenever you\'re ready.',
    }));
    return;
  }

  const userId = state ? verifyOAuthState(state) : null;
  if (!userId || !code) {
    res.status(400).send(renderOAuthResultPage({
      icon: '⏱️',
      heading: 'Link expired',
      message: 'This connection link is no longer valid. Go back to the app and tap "Connect Gmail" again.',
    }));
    return;
  }

  try {
    const [tokens, existing] = await Promise.all([
      exchangeCodeForTokens(code, process.env.GOOGLE_WEB_REDIRECT_URI!, credentialsFor('web')),
      getGmailConnection(userId),
    ]);

    let refreshToken = tokens.refresh_token;
    let oauthClient: OAuthClient = 'web';
    if (!refreshToken) {
      if (!existing) {
        res.send(renderOAuthResultPage({
          icon: '⚠️',
          heading: 'Missing permission',
          message: 'Google didn\'t grant offline access. Revoke Couplet\'s access at myaccount.google.com/permissions, then try connecting again.',
        }));
        return;
      }
      refreshToken = decryptToken(existing.refresh_token_encrypted);
      oauthClient = existing.oauth_client ?? 'native';
    }

    const gmailEmail = await getGmailAddress(tokens.access_token);

    await saveGmailConnection({
      user_id: userId,
      gmail_email: gmailEmail,
      refresh_token_encrypted: encryptToken(refreshToken),
      oauth_client: oauthClient,
      last_scan: existing?.last_scan ?? null,
      created_at: existing?.created_at ?? new Date().toISOString(),
      candidates: existing?.candidates ?? [],
    });

    res.send(success(gmailEmail));
  } catch (err) {
    console.error('[gmail/callback]', err);
    const existing = await getGmailConnection(userId);
    if (existing) {
      res.send(success(existing.gmail_email));
      return;
    }
    res.status(500).send(renderOAuthResultPage({
      icon: '⚠️',
      heading: 'Something went wrong',
      message: 'We couldn\'t finish connecting Gmail. Go back to the app and try again — if it keeps happening, let us know.',
    }));
  }
});

router.use(authMiddleware);

// Starts the browser-bridge (Expo-Go-compatible) connect flow: mints a signed,
// short-lived state token and returns a ready-to-open Google consent URL.
router.post('/connect/start', async (req: AuthRequest, res: Response): Promise<void> => {
  const state = createOAuthState(req.userId!);
  res.json({ authUrl: buildGoogleAuthUrl(state) });
});

router.get('/status', async (req: AuthRequest, res: Response): Promise<void> => {
  const connection = await getGmailConnection(req.userId!);
  res.json({ connected: !!connection, gmail_email: connection?.gmail_email ?? null });
});

// Native (Dev Client) PKCE flow — the app already has the code + its own verifier.
router.post('/connect', async (req: AuthRequest, res: Response): Promise<void> => {
  const { code, code_verifier, redirect_uri } = req.body;
  if (!code || !code_verifier || !redirect_uri) {
    res.status(400).json({ error: 'code, code_verifier, and redirect_uri are required' });
    return;
  }

  const [tokens, existing] = await Promise.all([
    exchangeCodeForTokens(code, redirect_uri, credentialsFor('native'), code_verifier),
    getGmailConnection(req.userId!),
  ]);

  // Google only issues a refresh_token on first consent (or with prompt=consent).
  // Fall back to the previously stored one on reconnect so we don't lose access.
  let refreshToken = tokens.refresh_token;
  let oauthClient: OAuthClient = 'native';
  if (!refreshToken) {
    if (!existing) {
      res.status(400).json({ error: 'Google did not return a refresh token. Revoke Couplet access at myaccount.google.com/permissions and try connecting again.' });
      return;
    }
    refreshToken = decryptToken(existing.refresh_token_encrypted);
    oauthClient = existing.oauth_client ?? 'native';
  }

  const gmailEmail = await getGmailAddress(tokens.access_token);

  await saveGmailConnection({
    user_id: req.userId!,
    gmail_email: gmailEmail,
    refresh_token_encrypted: encryptToken(refreshToken),
    oauth_client: oauthClient,
    last_scan: existing?.last_scan ?? null,
    created_at: existing?.created_at ?? new Date().toISOString(),
    candidates: existing?.candidates ?? [],
  });

  res.json({ gmail_email: gmailEmail });
});

router.post('/scan', async (req: AuthRequest, res: Response): Promise<void> => {
  const connection = await getGmailConnection(req.userId!);
  if (!connection) {
    res.status(404).json({ error: 'Gmail not connected' });
    return;
  }

  let accessToken: string;
  try {
    accessToken = await refreshAccessToken(decryptToken(connection.refresh_token_encrypted), credentialsFor(connection.oauth_client ?? 'native'));
  } catch {
    res.status(409).json({ error: 'Gmail access expired or was revoked. Please reconnect.' });
    return;
  }

  const query = buildCandidateQuery(connection.last_scan);
  const messageIds = await listCandidateMessageIds(accessToken, query);

  const knownIds = new Set(connection.candidates.map(c => c.message_id));
  const newIds = messageIds.filter(id => !knownIds.has(id));

  const now = new Date().toISOString();
  // One message failing to fetch (deleted, transient API error) shouldn't lose the
  // rest of the batch — skip it and keep the ones that succeeded.
  const fetched = await Promise.all(
    newIds.map(async id => {
      try {
        const headers = await getMessageHeaders(accessToken, id);
        return { message_id: id, ...headers, created_at: now };
      } catch {
        return null;
      }
    })
  );
  const newCandidates: GmailCandidate[] = fetched.filter((c): c is GmailCandidate => c !== null);

  const merged = await addCandidatesAndUpdateLastScan(req.userId!, connection.candidates, newCandidates, now);

  res.json(merged);
});

router.get('/candidates', async (req: AuthRequest, res: Response): Promise<void> => {
  const connection = await getGmailConnection(req.userId!);
  res.json(connection?.candidates ?? []);
});

export default router;
