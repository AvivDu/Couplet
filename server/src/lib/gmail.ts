const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

// Keywords chosen so Gmail filters server-side (via `q`) - we never download
// the whole inbox, only messages that already look coupon-related. Favors specific
// phrases ("discount code") over bare words ("discount"/"sale") - the bare words
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

interface GmailMessagePart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailMessagePart[];
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf-8');
}

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, '\'')
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function findBodyText(part: GmailMessagePart, preferredMime: string): string | null {
  if (part.mimeType === preferredMime && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }
  for (const child of part.parts ?? []) {
    const found = findBodyText(child, preferredMime);
    if (found) return found;
  }
  return null;
}

// Full message body - never persisted. Used only to extract draft coupon fields
// transiently for the caller's response (see extractCouponFields below).
export async function getMessageBody(accessToken: string, messageId: string): Promise<string> {
  const params = new URLSearchParams({ format: 'full' });
  const message = await gmailFetch(accessToken, `/messages/${messageId}`, params);
  const payload: GmailMessagePart = message.payload ?? {};
  const plain = findBodyText(payload, 'text/plain');
  if (plain) return plain;
  const html = findBodyText(payload, 'text/html');
  if (html) return stripHtml(html);
  return '';
}

export interface GmailDraftFields {
  code: string | null;
  store: string | null;
  amount: number | null;
  expiration: string | null;
}

// Labeled patterns only - deliberately conservative. An unlabeled bare token would
// false-positive on order numbers, phone numbers, etc. scattered through marketing mail.
//
// The connector between the label and the code has to allow more than the original
// "colon or whitespace, then the code immediately" - real marketing mail commonly
// phrases it as "the code is: X" (a filler word between label and separator) and
// wraps the code in quotes ("code: \"SAVE20\""). Both alternatives below still require
// at least one real separator character, so "codeXXXX" (no separator at all) still
// can't fuse into a false match.
const CONNECTOR = String.raw`(?:[:\s]+|\s+(?:is|הוא)\s*:?\s*)`;
const QUOTE = `["'"”‘’׳]?`;
const CODE = `${QUOTE}([A-Za-z0-9-]{4,20})${QUOTE}`;

const CODE_LABEL_PATTERNS = [
  new RegExp(String.raw`קוד\s*קופון${CONNECTOR}${CODE}`, 'i'),
  new RegExp(String.raw`קוד\s*הנחה${CONNECTOR}${CODE}`, 'i'),
  new RegExp(String.raw`coupon\s*code${CONNECTOR}${CODE}`, 'i'),
  new RegExp(String.raw`promo(?:\s*code)?${CONNECTOR}${CODE}`, 'i'),
  new RegExp(String.raw`discount\s*code${CONNECTOR}${CODE}`, 'i'),
  new RegExp(String.raw`\bcode${CONNECTOR}${CODE}`, 'i'),
];

function extractCode(text: string): string | null {
  for (const pattern of CODE_LABEL_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

const AMOUNT_PATTERNS = [
  /₪\s*(\d+(?:[.,]\d+)?)/,
  /(\d+(?:[.,]\d+)?)\s*₪/,
  /(\d+(?:[.,]\d+)?)\s*שקל/,
  /\$\s*(\d+(?:[.,]\d+)?)/,
];

function extractAmount(text: string): number | null {
  for (const pattern of AMOUNT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const value = parseFloat(match[1].replace(',', ''));
      if (!isNaN(value)) return value;
    }
  }
  return null;
}

const EXPIRATION_LABEL_PATTERNS = [
  /(?:בתוקף\s*עד|תוקף\s*עד)[:\s]*([0-9./-]{6,10})/,
  /(?:valid\s*until|expires?(?:\s*on)?|exp\.?\s*date)[:\s]*([0-9./-]{6,10})/i,
];

function parseDateToken(token: string): string | null {
  const parts = token.split(/[./-]/).map(p => p.trim());
  if (parts.length !== 3) return null;
  const [a, b, c] = parts;
  let year: number, month: number, day: number;
  if (a.length === 4) {
    year = parseInt(a, 10); month = parseInt(b, 10); day = parseInt(c, 10);
  } else {
    day = parseInt(a, 10); month = parseInt(b, 10); year = parseInt(c, 10);
    if (year < 100) year += 2000;
  }
  if (!year || !month || !day || month > 12 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (isNaN(date.getTime())) return null;
  return date.toISOString().split('T')[0];
}

function extractExpiration(text: string): string | null {
  for (const pattern of EXPIRATION_LABEL_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const parsed = parseDateToken(match[1]);
      if (parsed) return parsed;
    }
  }
  return null;
}

function extractStore(fromHeader: string): string | null {
  const match = fromHeader.match(/^"?([^"<]+?)"?\s*<[^>]+>$/);
  const name = (match ? match[1] : fromHeader).trim();
  return name || null;
}

// Best-effort only - the client always shows extracted fields as an editable,
// user-reviewed draft before a coupon is actually saved.
export function extractCouponFields(body: string, fromHeader: string, subject: string): GmailDraftFields {
  const text = `${subject}\n${body}`;
  return {
    code: extractCode(text),
    store: extractStore(fromHeader),
    amount: extractAmount(text),
    expiration: extractExpiration(text),
  };
}
