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
// existing findGiftCardInText brand lookup plus a leading-lines guess instead
// (see extractCouponFieldsFromText).
//
// That guess also feeds the OCR photo-scan path, whose input is far noisier
// than pasted text - a screenshot leads with the phone's status bar, a photo
// with whatever else was in frame - which is why guessStoreFromText scans
// several lines and rejects hard rather than taking line one on faith.

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

// OCR of a Hebrew line emits it in VISUAL order and wraps any embedded Latin
// run in bidi control marks, so "קוד קופון: BONUS50" comes back as
// "‎BONUS50‏ :קוד קופון" - the code sitting before its own label.
// (Verified on a real Gmail coupon screenshot: the code was recognized
// perfectly, only its position moved.) The marks are stripped first, then
// each Hebrew label gets a mirrored pattern so that order still matches.
//
// Only the Hebrew labels need this. Latin-script lines are not reordered,
// and amounts/dates survive anyway because their patterns key off a symbol
// or the digits themselves rather than a preceding word.
const HEBREW_CODE_LABELS = String.raw`(?:קוד\s*קופון|קוד\s*הנחה|קוד\s*מימוש|קוד\s*הטבה)`;
const RTL_VISUAL_CODE_PATTERN = new RegExp(String.raw`${CODE}[:\s]+${HEBREW_CODE_LABELS}`, 'g');

// LRM/RLM, the embedding/override set, the isolates, and the Arabic letter
// mark. Invisible, carry no meaning for extraction, and break any pattern
// that expects a space or colon where one of them landed. Written as escapes
// on purpose: these characters are invisible in an editor, so a literal class
// here would be silently destroyable by any copy-paste or reformat.
const BIDI_MARKS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069\u061C]/g;

function stripBidiMarks(text: string): string {
  return text.replace(BIDI_MARKS, '');
}

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

function isPlausibleCode(code: string): boolean {
  return !ALL_LOWERCASE_LETTERS.test(code);
}

// "קוד" also appears, glued with no space, as the tail of unrelated Hebrew words -
// most commonly "מיקוד" (zip code) and "תיקוד" (documentation) - both commonly
// followed by exactly the "label: value" shape this pattern looks for ("מיקוד:
// 12345"). Checked in plain JS rather than a regex lookbehind: Hermes (React
// Native's JS engine) support for lookbehind assertions isn't guaranteed across
// versions, and a syntax error in a module-scope RegExp literal would crash the
// app at import time.
const HEBREW_COMPOUND_FALSE_POSITIVE_PREFIXES = ['מי', 'תי'];

// A qualifying word sitting immediately before "code" that means this is not a
// coupon at all: "zip code: 12345", "order code: 998877". Those plain-number
// cases are exactly what the bare tier used to catch, and blocking them by
// requiring a letter in the code blocked legitimate numeric coupon codes with
// them ("code: 12345"). The digits were never the problem - the qualifier was,
// so the qualifier is what gets checked. Same shape as the Hebrew guard above,
// which solves the identical problem for prefixes glued onto "קוד".
//
// Note "barcode"/"zipcode" written as one word need no entry: a word boundary before "code" cannot
// match mid-word, so they never reach here.
const ENGLISH_NON_COUPON_QUALIFIERS = [
  'zip', 'postal', 'post', 'area', 'country', 'dial', 'dialing',
  'order', 'reference', 'ref', 'tracking', 'invoice', 'account', 'customer',
  'error', 'status', 'qr', 'bar', 'pin', 'security', 'verification',
  'confirmation', 'otp', 'auth', 'sort', 'swift', 'iban', 'branch',
  'product', 'sku', 'model', 'serial', 'employee', 'store',
];

// The alphabetic word immediately before `index`, lowercased ('' if there is
// none - a code label starting the line has nothing in front of it).
function precedingWord(text: string, index: number): string {
  const before = text.slice(0, index).replace(/[\s:>\-]+$/, '');
  const match = before.match(/([A-Za-z]+)$/);
  return match ? match[1].toLowerCase() : '';
}

function firstPlausibleMatch(text: string, pattern: RegExp, opts: { guardHebrewPrefix?: boolean; guardEnglishQualifier?: boolean } = {}): string | null {
  for (const match of text.matchAll(pattern)) {
    if (opts.guardHebrewPrefix) {
      const prefix = text.slice(Math.max(0, match.index! - 2), match.index!);
      if (HEBREW_COMPOUND_FALSE_POSITIVE_PREFIXES.includes(prefix)) continue;
    }
    if (opts.guardEnglishQualifier && ENGLISH_NON_COUPON_QUALIFIERS.includes(precedingWord(text, match.index!))) continue;
    const code = match[1]?.trim();
    if (!code || !isPlausibleCode(code)) continue;
    // Uppercased only after the plausibility check above, never before -
    // that check rejects all-lowercase tokens as ordinary prose, and
    // uppercasing first would make every one of them look like a real code.
    // OCR reads printed codes with inconsistent case ("Save25" for SAVE25),
    // and coupon codes are conventionally uppercase, so this normalizes
    // rather than guesses.
    return code.toUpperCase();
  }
  return null;
}

export interface CodeExtractionResult {
  code: string;
  confidence: 'label' | 'guess';
}

function extractCode(text: string): CodeExtractionResult | null {
  for (const pattern of HIGH_CONFIDENCE_CODE_PATTERNS) {
    const code = firstPlausibleMatch(text, new RegExp(pattern.source, pattern.flags + 'g'));
    if (code) return { code, confidence: 'label' };
  }
  // Just as trustworthy as the tier above - it IS an explicit label match,
  // only with the label sitting on the far side of the code because OCR
  // emitted an RTL line in visual order.
  const rtlVisual = firstPlausibleMatch(text, RTL_VISUAL_CODE_PATTERN);
  if (rtlVisual) return { code: rtlVisual, confidence: 'label' };
  const hebrewGuess = firstPlausibleMatch(text, HEBREW_BARE_CODE_PATTERN, { guardHebrewPrefix: true });
  if (hebrewGuess) return { code: hebrewGuess, confidence: 'guess' };
  const englishGuess = firstPlausibleMatch(text, ENGLISH_BARE_CODE_PATTERN, { guardEnglishQualifier: true });
  if (englishGuess) return { code: englishGuess, confidence: 'guess' };
  return null;
}

// A currency symbol, or a single character standing in for one OCR mangled.
// The same ₪ in the same coupon has come back as 'm', as 'W', and correctly,
// across three runs - so the tolerance is "one stray character" rather than a
// list of the specific letters seen so far, which would just keep growing.
//
// Deliberately allowed on EITHER side of the number: which side the symbol
// lands on flips with RTL reordering, so position is not something to rely on.
// Scoped to labelled amounts only - a bare "150W" elsewhere in a message is
// likelier watts than shekels - and limited to a single character, so
// "Amount: about 150" still will not match through the word.
const CURRENCY_OR_MANGLED = String.raw`[₪$\p{L}]?`;

// The trailing \b is what keeps "150ml" out: the optional character takes the
// 'm', then the boundary fails against the 'l', and the empty alternative
// fails against the 'm' - so neither path matches.
const LABELLED_AMOUNT = String.raw`\s*[:\s]\s*${CURRENCY_OR_MANGLED}\s*(\d+(?:[.,]\d+)?)\s*${CURRENCY_OR_MANGLED}\b`;

const AMOUNT_PATTERNS = [
  /₪\s*(\d+(?:[.,]\d+)?)/,
  /(\d+(?:[.,]\d+)?)\s*₪/,
  /(\d+(?:[.,]\d+)?)\s*שקל/,
  /\$\s*(\d+(?:[.,]\d+)?)/,
  new RegExp(String.raw`(?:הסכום|סכום)(?:\s*(?:הוא|של))?${LABELLED_AMOUNT}`, 'u'),
  // The English counterpart of the Hebrew label above. Its absence meant a
  // plain "Balance: 150" matched nothing at all - the amount could only be
  // found through a currency symbol, which is exactly the character OCR is
  // least reliable at.
  new RegExp(String.raw`\b(?:balance|amount|value|worth)${LABELLED_AMOUNT}`, 'iu'),
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

// A store name is a name, not a sentence. Four words still covers
// "Super Pharm Tel Aviv" while rejecting "Thanks for shopping with us!".
const STORE_MAX_WORDS = 4;

// Pasted text puts the store on line 1. OCR does not: a screenshot begins
// with the phone's status bar, and a photo begins with whatever else was in
// frame - so look a few lines down instead of trusting the first absolutely.
const STORE_SEARCH_LINES = 6;

// A clock is the tell for a status-bar line ("3 46 In, 10:41").
const CLOCK_PATTERN = /\d{1,2}:\d{2}/;

// Words naming the *kind* of message rather than the merchant. An email
// subject or app header ("Coupon", "קופון") sits above the store name in a
// screenshot and would otherwise be picked in its place. Matched whole, not
// as a substring, so a real merchant like "Coupon King" still survives.
const GENERIC_HEADER_WORDS = [
  'coupon', 'coupons', 'voucher', 'vouchers', 'gift card', 'giftcard', 'gift',
  'promo', 'promotion', 'discount', 'offer', 'deal', 'reward', 'inbox',
  'קופון', 'שובר', 'הטבה', 'מתנה', 'הנחה',
];

// OCR noise is mostly digits, punctuation and stray symbols ("bi 0",
// "ul ® ¢ =3"); a real store name is overwhelmingly letters. That ratio is
// what separates them, since both are short and neither looks like a code.
function isMostlyLetters(line: string): boolean {
  const letters = (line.match(/\p{L}/gu) ?? []).length;
  const dense = line.replace(/\s/g, '').length;
  return dense > 0 && letters / dense >= 0.7;
}

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
    !/\p{L}/u.test(line) ||
    CLOCK_PATTERN.test(line) ||
    !isMostlyLetters(line) ||
    line.split(/\s+/).length > STORE_MAX_WORDS ||
    GENERIC_HEADER_WORDS.includes(line.toLowerCase().replace(/[^\p{L}\s]/gu, '').trim())
  );
}

// Fallback for a store that isn't one of the general gift-card brands (e.g. a
// single-retailer coupon for "Fox" or "Nike") - findGiftCardInText only knows
// the fixed whitelist, so a specific retailer's name is otherwise dropped
// entirely even when it's sitting in plain sight as the message's first line.
// Not a real classifier - like every other field here this is best-effort and
// the user reviews it before saving, so a wrong guess is an edit, not a
// broken save.
//
// Returns the first line that could plausibly be a merchant name, or null.
// Null is deliberately preferred over a weak guess: an empty field is
// obvious and gets typed in, whereas "3 46 In, 10:41" sitting in the name
// field can be saved without the user ever noticing it was wrong.
function guessStoreFromText(text: string): string | null {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  for (const line of lines.slice(0, STORE_SEARCH_LINES)) {
    if (line.length > STORE_LINE_MAX_LENGTH) continue;
    if (looksLikeNonStoreLine(line)) continue;
    return line;
  }
  return null;
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
  // Stripped once here rather than inside each extractor: the marks are
  // invisible, carry no meaning, and land in arbitrary places in OCR output -
  // any pattern expecting a space or colon breaks when one turns up there.
  const clean = stripBidiMarks(text);
  const codeResult = extractCode(clean);
  return {
    code: codeResult?.code ?? null,
    codeConfidence: codeResult?.confidence ?? null,
    // The whitelist match comes first: it returns a canonical brand name
    // (and drives the "General" category / where-to-use link in add.tsx), so
    // it is strictly higher-confidence than a guessed line and should win
    // whenever both would apply.
    store: findGiftCardInText(clean)?.canonicalName ?? guessStoreFromText(clean),
    giftUrl: extractGiftCardUrl(clean),
    amount: extractAmount(clean),
    expiration: extractExpiration(clean),
  };
}
