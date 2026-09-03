import { findGiftCardInText } from '../constants/generalGiftCards';

// Client-side port of the Gmail-API-independent extraction logic in
// server/src/lib/gmail.ts (CODE_LABEL_PATTERNS / AMOUNT_PATTERNS /
// EXPIRATION_LABEL_PATTERNS / extractCode / extractAmount / extractExpiration).
// Runs here (not on the server) because pasted text already lives on the device -
// sending it server-side just to parse it would push a coupon code through the
// server for no reason, breaking the "codes never touch the server" invariant.
// There is no monorepo/shared-package setup in this repo, so this is a deliberate
// copy, not a literal shared module - keep the two in sync by hand if the regexes
// change. `extractStore` does not port over: it parses an email `From` header,
// which pasted text doesn't have - store detection here reuses the existing
// findGiftCardInText brand lookup instead (see extractCouponFieldsFromText) -
// the free-text variant, not the loose store-name one.

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

const ALL_LOWERCASE_LETTERS = /^[a-z]+$/;

function extractCode(text: string): string | null {
  for (const pattern of CODE_LABEL_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    const code = match[1].trim();
    if (ALL_LOWERCASE_LETTERS.test(code)) continue;
    return code;
  }
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

const STORE_LINE_MAX_LENGTH = 30;

// True for a line that is unlikely to be a store name on its own: a labeled
// field (the code/amount/expiry patterns above), a promo banner ("50% OFF"),
// or a line with no letters in it at all (a bare code or date).
function looksLikeNonStoreLine(line: string): boolean {
  return (
    CODE_LABEL_PATTERNS.some(p => p.test(line)) ||
    AMOUNT_PATTERNS.some(p => p.test(line)) ||
    EXPIRATION_LABEL_PATTERNS.some(p => p.test(line)) ||
    line.includes('%') ||
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
  store: string | null;
  amount: number | null;
  expiration: string | null;
}

// Best-effort only - same as the Gmail draft flow, the user always reviews/edits
// the fields before saving.
export function extractCouponFieldsFromText(text: string): ExtractedCouponFields {
  return {
    code: extractCode(text),
    // The whitelist match comes first: it returns a canonical brand name
    // (and drives the "General" category / where-to-use link in add.tsx), so
    // it is strictly higher-confidence than a guessed line and should win
    // whenever both would apply.
    store: findGiftCardInText(text)?.canonicalName ?? guessStoreFromFirstLine(text),
    amount: extractAmount(text),
    expiration: extractExpiration(text),
  };
}
