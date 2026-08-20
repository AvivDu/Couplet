const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

// Keywords chosen so Gmail filters server-side (via `q`) — we never download
// the whole inbox, only messages that already look coupon-related. Favors specific
// phrases ("discount code") over bare words ("discount"/"sale") — the bare words
// matched too much ordinary marketing mail with no actual redeemable code attached.
const KEYWORDS = [
  'קופון', '"קוד קופון"', '"קוד הנחה"', 'זיכוי', 'זכייה', 'הטבה', 'שובר', '"כרטיס מתנה"',
  'coupon', 'voucher', '"promo code"', '"coupon code"', '"discount code"', '"gift card"',
].join(' OR ');

// Filters out plain purchase receipts, which often mention a discount/coupon
// that was already used rather than one still available.
const EXCLUDE_TERMS = ['קבלת רכישה'];

// First scan looks back 30 days; later scans only look since the last scan.
export function buildCandidateQuery(sinceIso: string | null): string {
  const dateFilter = sinceIso
    ? `after:${Math.floor(new Date(sinceIso).getTime() / 1000)}`
    : 'newer_than:30d';
  const exclusions = EXCLUDE_TERMS.map(term => `-"${term}"`).join(' ');
  return `${dateFilter} (${KEYWORDS}) ${exclusions}`;
}

async function gmailFetch(accessToken: string, path: string, searchParams?: URLSearchParams) {
  const url = `${GMAIL_API}${path}${searchParams ? `?${searchParams.toString()}` : ''}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail API error ${res.status}: ${body}`);
  }
  return res.json() as Promise<any>;
}

export async function getGmailAddress(accessToken: string): Promise<string> {
  const profile = await gmailFetch(accessToken, '/profile');
  return profile.emailAddress;
}

// Caps total messages processed per scan to keep the Lambda invocation fast/cheap.
const MAX_MESSAGES_PER_SCAN = 200;
const PAGE_SIZE = 100;

export async function listCandidateMessageIds(accessToken: string, query: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({ q: query, maxResults: String(PAGE_SIZE) });
    if (pageToken) params.set('pageToken', pageToken);
    const page = await gmailFetch(accessToken, '/messages', params);
    for (const m of page.messages ?? []) ids.push(m.id);
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < MAX_MESSAGES_PER_SCAN);

  return ids.slice(0, MAX_MESSAGES_PER_SCAN);
}

export interface MessageHeaders {
  from: string;
  subject: string;
  date: string;
}

export async function getMessageHeaders(accessToken: string, messageId: string): Promise<MessageHeaders> {
  const params = new URLSearchParams({ format: 'metadata' });
  params.append('metadataHeaders', 'From');
  params.append('metadataHeaders', 'Subject');
  params.append('metadataHeaders', 'Date');
  const message = await gmailFetch(accessToken, `/messages/${messageId}`, params);
  const headers: { name: string; value: string }[] = message.payload?.headers ?? [];
  const get = (name: string) => headers.find(h => h.name === name)?.value ?? '';
  return { from: get('From'), subject: get('Subject'), date: get('Date') };
}
