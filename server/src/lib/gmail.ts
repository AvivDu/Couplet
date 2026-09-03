const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

// Keywords chosen so Gmail filters server-side (via `q`) - we never download
// the whole inbox, only messages that already look coupon-related. Favors specific
// phrases ("discount code") over bare words ("discount"/"sale") - the bare words
// matched too much ordinary marketing mail with no actual redeemable code attached.
// Widened from the original list, which missed a lot of real coupon mail phrased
// just slightly differently (e.g. "redeem code", "קוד מימוש") - still all 2-3 word
// phrases or Hebrew terms specific enough to stay high-precision.
const KEYWORDS = [
  'קופון', '"קוד קופון"', '"קוד הנחה"', '"קוד מימוש"', '"קוד הטבה"', '"מימוש קופון"',
  'זיכוי', 'זכייה', 'הטבה', 'שובר', '"כרטיס מתנה"', '"תו קנייה"', '"כרטיס נטען"',
  'coupon', 'voucher', '"promo code"', '"coupon code"', '"discount code"', '"discount coupon"',
  '"gift card"', '"gift voucher"', '"redeem code"', '"reward code"',
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
    // Inline the href before the generic tag strip below removes it - the URL
    // lives in the attribute, not the link text, so "<a href='X'>Redeem</a>"
    // would otherwise vanish entirely instead of surviving as "Redeem (X)".
    // Real coupon marketing mail is HTML, so this is the common case, not an edge one.
    .replace(/<a\s+[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gis, '$2 ($1)')
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
  // 'label' = matched an explicit "coupon code:" style label, trustworthy as-is.
  // 'guess' = matched only a bare "code"/"קוד" with no qualifying word, worth a
  // second look before saving. null when no code was found at all.
  codeConfidence: 'label' | 'guess' | null;
  store: string | null;
  amount: number | null;
  expiration: string | null;
  // A personalized redemption link for a known general-gift-card brand (BuyMe,
  // XTRA, etc.) found in the body - these coupons are often link-based rather
  // than a plain-text code, so this can be present even when code is null.
  giftUrl: string | null;
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
// Known gap, not yet fixed: doesn't bridge a possessive word between the label and
// "is"/"הוא" ("הקוד שלך הוא: X" - "your code is: X" - the common real phrasing).
// Widening this to skip arbitrary words would meaningfully raise false-positive
// risk without real failing samples to validate against - left for a follow-up
// once there's actual data to tune it with, rather than guessed at now.
const CONNECTOR = String.raw`(?:[:\s]+|\s+(?:is|הוא)\s*:?\s*)`;
const QUOTE = `["'"”‘’׳]?`;
const CODE = `${QUOTE}([A-Za-z0-9-]{4,20})${QUOTE}`;

// Specific enough that a match is trustworthy on its own - a real label naming
// "coupon"/"promo"/"discount"/etc., or an explicit instruction ("use code X").
const HIGH_CONFIDENCE_CODE_PATTERNS = [
  new RegExp(String.raw`קוד\s*קופון${CONNECTOR}${CODE}`, 'i'),
  new RegExp(String.raw`קוד\s*הנחה${CONNECTOR}${CODE}`, 'i'),
  new RegExp(String.raw`קוד\s*מימוש${CONNECTOR}${CODE}`, 'i'),
  new RegExp(String.raw`קוד\s*הטבה${CONNECTOR}${CODE}`, 'i'),
  new RegExp(String.raw`coupon\s*code${CONNECTOR}${CODE}`, 'i'),
  new RegExp(String.raw`promo(?:\s*code)?${CONNECTOR}${CODE}`, 'i'),
  new RegExp(String.raw`discount\s*code${CONNECTOR}${CODE}`, 'i'),
  new RegExp(String.raw`voucher\s*code${CONNECTOR}${CODE}`, 'i'),
  new RegExp(String.raw`reward\s*code${CONNECTOR}${CODE}`, 'i'),
  new RegExp(String.raw`(?:use|enter|apply|with)\s*code${CONNECTOR}${CODE}`, 'i'),
];

// Bare "code" with no qualifying word in front of it - much likelier to be ordinary
// prose ("your code expires soon", "zip code: 12345") than the labeled patterns
// above, so a hit here is reported as a lower-confidence "guess", never as certain.
const ENGLISH_BARE_CODE_PATTERN = new RegExp(String.raw`\bcode${CONNECTOR}${CODE}`, 'gi');

// Hebrew has no separate space-joined "bare code" case worth a dedicated pattern -
// "קוד" is already the whole word, so the label patterns above and this fallback
// are the same shape. Kept as its own pattern (rather than folded into the high
// confidence list) because Hebrew glues one-letter prefixes onto the next word with
// no space ("השתמשו בקוד" = "use" + "with-code", fused) - "קוד" as a bare match is
// therefore looser than it looks and needs the same downgrade + guard as English.
const HEBREW_BARE_CODE_PATTERN = new RegExp(String.raw`קוד${CONNECTOR}${CODE}`, 'gi');

// A pure lowercase-letters token is almost always ordinary prose ("enter the code
// below", "your code expires soon") - real codes carry a digit or an uppercase
// letter (SAVE20, WELCOME15, OLD123).
const ALL_LOWERCASE_LETTERS = /^[a-z]+$/;

function isPlausibleCode(code: string, requireLetterAndDigit: boolean): boolean {
  if (ALL_LOWERCASE_LETTERS.test(code)) return false;
  // The bare-fallback tiers are loose enough to catch a plain number (a zip/area/
  // order code sitting after the word "code") - requiring a letter too keeps those
  // out without touching the high-confidence tier, where the label already vouches
  // for it and all-digit codes are legitimate (some sites do issue numeric-only ones).
  if (requireLetterAndDigit && !/[a-zA-Z]/.test(code)) return false;
  return true;
}

// Same word ("קוד") appears, glued with no space, as the tail of unrelated Hebrew
// words - most commonly "מיקוד" (zip code) and "תיקוד" (documentation) - both of
// which are followed by exactly the "label: value" shape this pattern looks for
// ("מיקוד: 12345"). A regex lookbehind could exclude these directly, but Hermes
// (React Native's JS engine) support for lookbehind assertions isn't guaranteed
// across versions, and a syntax error in a module-scope RegExp literal would crash
// the app at import time - so this checks the two characters before the match in
// plain JS instead, which works everywhere.
const HEBREW_COMPOUND_FALSE_POSITIVE_PREFIXES = ['מי', 'תי'];

function firstPlausibleMatch(text: string, pattern: RegExp, opts: { requireLetterAndDigit: boolean; guardHebrewPrefix?: boolean }): string | null {
  for (const match of text.matchAll(pattern)) {
    if (opts.guardHebrewPrefix) {
      const prefix = text.slice(Math.max(0, match.index! - 2), match.index!);
      if (HEBREW_COMPOUND_FALSE_POSITIVE_PREFIXES.includes(prefix)) continue;
    }
    const code = match[1]?.trim();
    if (!code || !isPlausibleCode(code, opts.requireLetterAndDigit)) continue;
    return code;
  }
  return null;
}

export interface CodeExtractionResult {
  code: string;
  confidence: 'label' | 'guess';
}

// Domains for the same general gift-card brands as client/constants/generalGiftCards.ts's
// storesUrl entries - kept in sync by hand, same as the regex logic above (no
// shared-package setup in this repo, and this is a plain domain list, not the
// aliases/store-locator data the client actually needs the full brand objects for).
// These brands' coupons are typically a personalized redemption link rather than
// (or in addition to) a plain-text code, so finding one of these in the body is
// worth surfacing even when extractCode found nothing.
const GIFT_CARD_DOMAINS = [
  'buyme.co.il', 'tavhazahav.shufersal.co.il', 'xtra.co.il', 'dcgift.co.il',
  'swish.co.il', 'nofshonit.co.il', 'tavplus.co.il', 'tav.rami-levy.co.il',
  'zara.com', 'castro.com', 'golf-il.co.il', 'max.co.il', 'isracard.co.il',
  'cal-online.co.il', 'gifta.co.il', 'azrieli.com', 'myofer.co.il',
];

const RAW_URL_PATTERN = /https?:\/\/[^\s"'<>)\]]+/g;

// Checks the URL's actual hostname, not just whether the domain string appears
// anywhere in it - a click-tracking redirect commonly embeds the real destination
// in its query string ("click.example.com/track?url=https://buyme.co.il/..."),
// and a substring check would wrongly treat that tracking link as the gift card URL.
function extractGiftCardUrl(text: string): string | null {
  for (const match of text.matchAll(RAW_URL_PATTERN)) {
    let hostname: string;
    try {
      hostname = new URL(match[0]).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (GIFT_CARD_DOMAINS.some(domain => hostname === domain || hostname.endsWith(`.${domain}`))) {
      return match[0];
    }
  }
  return null;
}

function extractCode(text: string): CodeExtractionResult | null {
  for (const pattern of HIGH_CONFIDENCE_CODE_PATTERNS) {
    const code = firstPlausibleMatch(text, new RegExp(pattern.source, pattern.flags + 'g'), { requireLetterAndDigit: false });
    if (code) return { code, confidence: 'label' };
  }
  const hebrewGuess = firstPlausibleMatch(text, HEBREW_BARE_CODE_PATTERN, { requireLetterAndDigit: true, guardHebrewPrefix: true });
  if (hebrewGuess) return { code: hebrewGuess, confidence: 'guess' };
  const englishGuess = firstPlausibleMatch(text, ENGLISH_BARE_CODE_PATTERN, { requireLetterAndDigit: true });
  if (englishGuess) return { code: englishGuess, confidence: 'guess' };
  return null;
}

const AMOUNT_PATTERNS = [
  /₪\s*(\d+(?:[.,]\d+)?)/,
  /(\d+(?:[.,]\d+)?)\s*₪/,
  /(\d+(?:[.,]\d+)?)\s*שקל/,
  /\$\s*(\d+(?:[.,]\d+)?)/,
  // Hebrew "amount" label ("הסכום: 120", "הסכום הוא 120", "סכום של 120 ש"ח") - none of the
  // currency-symbol patterns above fire when the email states the value by label instead.
  /(?:הסכום|סכום)(?:\s*(?:הוא|של))?\s*[:\s]*₪?\s*(\d+(?:[.,]\d+)?)/,
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

// Marketing noise that shows up in the display name itself rather than the body -
// stripped before the name is used as-is, so a banner like "20% OFF Newsletter"
// doesn't become the coupon's store name.
const DISPLAY_NAME_NOISE_WORDS = /\b(no[-\s]?reply|do not reply|newsletter|team|support|marketing|customer service|updates?)\b/gi;
const DISPLAY_NAME_PROMO_NOISE = /(\d{1,3}\s*%\s*(off)?|[₪$]\s*\d+)/gi;
const EMOJI_RANGE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu;

function cleanDisplayName(name: string): string {
  return name
    .replace(EMOJI_RANGE, ' ')
    .replace(DISPLAY_NAME_PROMO_NOISE, ' ')
    .replace(DISPLAY_NAME_NOISE_WORDS, ' ')
    .replace(/[|•·–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s-]+|[\s-]+$/g, '')
    .trim();
}

function extractEmailAddress(fromHeader: string): string | null {
  const angle = fromHeader.match(/<([^>]+)>/);
  if (angle) return angle[1].trim();
  const bare = fromHeader.trim();
  return /^[^\s@]+@[^\s@]+$/.test(bare) ? bare : null;
}

// Domains split as <brand>.<tld>, except these, which need one more label
// stripped or "buyme.co.il" becomes "Co" instead of "Buyme".
const MULTI_PART_TLDS = new Set(['co.il', 'com.il', 'org.il', 'net.il', 'co.uk', 'com.au']);
// Generic subdomains that occasionally sit in front of the actual brand
// ("mail.buyme.co.il", "no-reply.buyme.co.il") and would otherwise be title-cased
// into the store name themselves.
const GENERIC_DOMAIN_LABELS = new Set(['mail', 'info', 'news', 'noreply', 'no-reply', 'e', 'em', 'marketing']);

// Last-resort store guess when the From header has no usable display name (a bare
// address, or one that was entirely marketing noise) - turns "noreply@buyme.co.il"
// into "Buyme" instead of showing the raw address or dropping the field.
function storeNameFromDomain(email: string): string | null {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;
  const parts = domain.split('.');
  const lastTwo = parts.slice(-2).join('.');
  const labels = MULTI_PART_TLDS.has(lastTwo) ? parts.slice(0, -2) : parts.slice(0, -1);
  const brandLabel = labels.filter(p => !GENERIC_DOMAIN_LABELS.has(p)).pop();
  if (!brandLabel) return null;
  return brandLabel.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function extractStore(fromHeader: string): string | null {
  const match = fromHeader.match(/^"?([^"<]+?)"?\s*<[^>]+>$/);
  const rawName = match ? match[1].trim() : null;
  const cleaned = rawName ? cleanDisplayName(rawName) : '';

  // A usable, non-empty name that isn't itself just the email address restated as
  // the display name (some senders duplicate it into both fields).
  if (cleaned && cleaned.length > 1 && !cleaned.includes('@')) return cleaned;

  const email = extractEmailAddress(fromHeader);
  const domainName = email ? storeNameFromDomain(email) : null;
  if (domainName) return domainName;

  const fallback = (rawName ?? fromHeader).trim();
  return fallback || null;
}

// Best-effort only - the client always shows extracted fields as an editable,
// user-reviewed draft before a coupon is actually saved.
export function extractCouponFields(body: string, fromHeader: string, subject: string): GmailDraftFields {
  const text = `${subject}\n${body}`;
  const codeResult = extractCode(text);
  return {
    code: codeResult?.code ?? null,
    codeConfidence: codeResult?.confidence ?? null,
    store: extractStore(fromHeader),
    amount: extractAmount(text),
    expiration: extractExpiration(text),
    giftUrl: extractGiftCardUrl(text),
  };
}
