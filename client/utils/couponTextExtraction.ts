import { findGiftCardInText, GENERAL_GIFT_CARDS } from '../constants/generalGiftCards';

// Client-side port of the Gmail-API-independent extraction logic in
// server/src/lib/gmail.ts (the CODE_LABEL_PATTERNS tiers / AMOUNT_PATTERNS /
// EXPIRATION_LABEL_PATTERNS / extractCode / extractAmount / extractExpiration).
// Runs here (not on the server) because pasted text already lives on the device -
// sending it server-side just to parse it would push a coupon code through the
// server for no reason, breaking the "codes never touch the server" invariant.
// There is no monorepo/shared-package setup in this repo, so this is a deliberate
// copy, not a literal shared module - keep the two in sync by hand if the regexes
// change. `extractStore`'s From-header parsing and domain-fallback guess do not
// port over - pasted text has no email header - store detection here reuses the
// existing findGiftCardInText brand lookup plus a first-line guess instead (see
// extractCouponFieldsFromText).

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

// Hebrew glues one-letter prefixes onto the next word with no space ("השתמשו בקוד"
// = "use" + "with-code", fused), so "קוד" as a bare match is looser than it looks -
// same downgrade + guard as the English fallback.
const HEBREW_BARE_CODE_PATTERN = new RegExp(String.raw`קוד${CONNECTOR}${CODE}`, 'gi');

// A pure lowercase-letters token is almost always ordinary prose ("enter the code
// below", "your code expires soon") - real codes carry a digit or an uppercase
// letter (SAVE20, WELCOME15, OLD123).
const ALL_LOWERCASE_LETTERS = /^[a-z]+$/;

function isPlausibleCode(code: string, requireLetterAndDigit: boolean): boolean {
  if (ALL_LOWERCASE_LETTERS.test(code)) return false;
  if (requireLetterAndDigit && !/[a-zA-Z]/.test(code)) return false;
  return true;
}

// "קוד" also appears, glued with no space, as the tail of unrelated Hebrew words -
// most commonly "מיקוד" (zip code) and "תיקוד" (documentation) - both commonly
// followed by exactly the "label: value" shape this pattern looks for ("מיקוד:
// 12345"). Checked in plain JS rather than a regex lookbehind: Hermes (React
// Native's JS engine) support for lookbehind assertions isn't guaranteed across
// versions, and a syntax error in a module-scope RegExp literal would crash the
// app at import time.
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

// Derived from the same brand list findGiftCardInText already uses, rather than a
// hand-duplicated domain list - one source of truth for "which brands are general
// gift cards" instead of two lists that can silently drift apart. (server/src/lib/
// gmail.ts has no access to this file - no shared-package setup in this repo - so
// its copy of this list is hand-maintained; see the comment there.)
const GIFT_CARD_DOMAINS: string[] = GENERAL_GIFT_CARDS.map(card => {
  try {
    return new URL(card.storesUrl).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}).filter((d): d is string => !!d);

const RAW_URL_PATTERN = /https?:\/\/[^\s"'<>)\]]+/g;

// Checks the URL's actual hostname, not just whether the domain string appears
// anywhere in it - guards against a tracking-redirect link that embeds the real
// destination in its query string rather than being the destination itself.
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

const STORE_LINE_MAX_LENGTH = 30;

// Non-global copies for a plain boolean .test() below - HEBREW_BARE_CODE_PATTERN
// and ENGLISH_BARE_CODE_PATTERN carry the 'g' flag for matchAll() in extractCode,
// and .test() on a shared global-flagged regex is stateful (it advances
// lastIndex), which would make repeated calls here intermittently wrong.
const HEBREW_BARE_CODE_TEST = new RegExp(HEBREW_BARE_CODE_PATTERN.source, 'i');
const ENGLISH_BARE_CODE_TEST = new RegExp(ENGLISH_BARE_CODE_PATTERN.source, 'i');

// True for a line that is unlikely to be a store name on its own: a labeled
// field (the code/amount/expiry patterns above), a promo banner ("50% OFF"),
// a bare link (a tracking/unsubscribe URL is often the first line of pasted
// marketing email), or a line with no letters in it at all (a bare code or date).
function looksLikeNonStoreLine(line: string): boolean {
  return (
    HIGH_CONFIDENCE_CODE_PATTERNS.some(p => p.test(line)) ||
    HEBREW_BARE_CODE_TEST.test(line) ||
    ENGLISH_BARE_CODE_TEST.test(line) ||
    AMOUNT_PATTERNS.some(p => p.test(line)) ||
    EXPIRATION_LABEL_PATTERNS.some(p => p.test(line)) ||
    line.includes('%') ||
    /^https?:\/\//i.test(line) ||
    !/\p{L}/u.test(line)
  );
}

// Fallback for a store that isn't one of the general gift-card brands (e.g. a
// single-retailer coupon for "Fox" or "Nike") - findGiftCardInText only knows
// the fixed whitelist, so a specific retailer's name is otherwise dropped
// entirely even when it's sitting in plain sight as the message's first line.
// Deliberately just the first line, not a real classifier - like every other
// field here, this is best-effort and the user reviews it before saving, so a
// wrong guess (e.g. a marketing line that slips past looksLikeNonStoreLine) is
// an edit, not a broken save.
function guessStoreFromFirstLine(text: string): string | null {
  const line = text.split(/\r?\n/).map(l => l.trim()).find(l => l.length > 0);
  if (!line || line.length > STORE_LINE_MAX_LENGTH) return null;
  return looksLikeNonStoreLine(line) ? null : line;
}

export interface ExtractedCouponFields {
  code: string | null;
  // 'label' = matched an explicit "coupon code:" style label, trustworthy as-is.
  // 'guess' = matched only a bare "code"/"קוד" with no qualifying word, worth a
  // second look before saving. null when no code was found at all.
  codeConfidence: 'label' | 'guess' | null;
  store: string | null;
  amount: number | null;
  expiration: string | null;
  // A personalized redemption link for a known general-gift-card brand (BuyMe,
  // XTRA, etc.) found in the text - these coupons are often link-based rather
  // than a plain-text code, so this can be present even when code is null.
  giftUrl: string | null;
}

// Best-effort only - same as the Gmail draft flow, the user always reviews/edits
// the fields before saving.
export function extractCouponFieldsFromText(text: string): ExtractedCouponFields {
  const codeResult = extractCode(text);
  return {
    code: codeResult?.code ?? null,
    codeConfidence: codeResult?.confidence ?? null,
    // The whitelist match comes first: it returns a canonical brand name
    // (and drives the "General" category / where-to-use link in add.tsx), so
    // it is strictly higher-confidence than a guessed line and should win
    // whenever both would apply.
    store: findGiftCardInText(text)?.canonicalName ?? guessStoreFromFirstLine(text),
    giftUrl: extractGiftCardUrl(text),
    amount: extractAmount(text),
    expiration: extractExpiration(text),
  };
}
