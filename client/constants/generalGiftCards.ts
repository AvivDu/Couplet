export interface GeneralGiftCard {
  canonicalName: string;
  aliases: string[];
  storesUrl: string;
}

export const GENERAL_GIFT_CARDS: GeneralGiftCard[] = [
  {
    canonicalName: 'BUYME',
    aliases: ['buyme', 'buy me', 'ביימי', 'ביי מי'],
    storesUrl: 'https://buyme.co.il/brands/13438757',
  },
  {
    canonicalName: 'תו הזהב',
    aliases: ['תו הזהב', 'tav hazahav', 'tavhazahav', 'gold voucher', 'תו זהב'],
    storesUrl: 'https://tavhazahav.shufersal.co.il/tavhazahav/',
  },
  {
    canonicalName: 'XTRA',
    aliases: ['xtra', 'אקסטרה', 'אקסטרא'],
    storesUrl: 'https://xtra.co.il/pages/xtra-shopping',
  },
  {
    canonicalName: 'Dream Card',
    aliases: ['dream card', 'dreamcard', 'דרים קארד', 'דרים כארד', 'דרים קרד'],
    storesUrl: 'https://www.dcgift.co.il/brands',
  },
  {
    canonicalName: 'Swish',
    aliases: ['swish', 'סוויש'],
    storesUrl: 'https://swish.co.il',
  },
  {
    canonicalName: 'נופשונית',
    aliases: ['נופשונית', 'nofshonit', 'nofeshonit'],
    storesUrl: 'https://www.nofshonit.co.il',
  },
  {
    canonicalName: 'תו פלוס',
    aliases: ['תו פלוס', 'tav plus', 'tavplus'],
    storesUrl: 'https://tavplus.co.il/',
  },
  {
    canonicalName: 'רמי לוי',
    aliases: ['רמי לוי', 'rami levy', 'ramilevy'],
    storesUrl: 'https://tav.rami-levy.co.il',
  },
  {
    canonicalName: 'ZARA',
    aliases: ['zara', 'זארה', 'זרה'],
    storesUrl: 'https://www.zara.com/il/en/help-center/PaymentWithGiftCard',
  },
  {
    canonicalName: 'Castro-Hoodies',
    aliases: ['castro', 'hoodies', 'castro hoodies', 'קסטרו', 'הודיז', 'הודיס', 'קסטרו הודיז'],
    storesUrl: 'https://www.castro.com/buy-giftcard/lovecard',
  },
  {
    canonicalName: 'Golf',
    aliases: ['golf', 'גולף'],
    storesUrl: 'https://www.golf-il.co.il/buy-giftcard/giftcard',
  },
  {
    canonicalName: 'MAX',
    aliases: ['max', 'מקס'],
    storesUrl: 'https://www.max.co.il/cards/giftcards',
  },
  {
    canonicalName: 'Isracard',
    aliases: ['isracard', 'ישראכרט'],
    storesUrl: 'https://www.isracard.co.il/credit-cards/gift-card-isracard',
  },
  {
    canonicalName: 'CAL',
    aliases: ['cal', 'כאל'],
    storesUrl: 'https://www.cal-online.co.il/benefits/',
  },
  {
    canonicalName: 'Gifta',
    aliases: ['gifta', 'גיפטה', 'גיפטא'],
    storesUrl: 'https://gifta.co.il/',
  },
  {
    canonicalName: 'Azrieli',
    aliases: ['azrieli', 'עזריאלי'],
    storesUrl: 'https://www.azrieli.com/c/gifts-azrieli-gift-card',
  },
  {
    canonicalName: 'Ofer',
    aliases: ['ofer', 'ofer gift', 'עופר', 'עופר גיפט'],
    storesUrl: 'https://myofer.co.il/gift-card',
  },
];

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ');
}

// Hebrew glues its one-letter prefixes straight onto the following word, so
// "בקסטרו" / "מגולף" are the same brand mention as "קסטרו" / "גולף". Without
// allowing for them, whole-word matching would miss brand names in exactly the
// Hebrew sentences this app's coupons are written in.
const HEBREW_PREFIXES = 'בלהומשכ';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Whole-word containment: `alias` must appear in `text` as its own token (or
// behind a single Hebrew prefix), never as a fragment of a longer word. This is
// what stops "local"/"calendar"/"physical" from being read as the CAL card.
function containsAliasAsWord(text: string, alias: string): boolean {
  const re = new RegExp(
    `(^|\\s)[${HEBREW_PREFIXES}]?${escapeRegExp(alias)}(\\s|$)`,
    'u'
  );
  return re.test(text);
}

// A short all-Latin alias is indistinguishable from an ordinary English word
// once it stands alone: "max 50% off" and "max 3 per customer" are not MAX gift
// cards, and whole-word matching cannot tell them apart. Their Hebrew aliases
// ("מקס", "כאל") are not ordinary words, so the brands stay reachable from the
// Hebrew text these coupons are actually written in - only the English trigger
// is given up, and only when scanning free text.
const MIN_LATIN_ALIAS_LENGTH = 4;

function isAmbiguousInFreeText(alias: string): boolean {
  return /^[a-z0-9 ]+$/.test(alias) && alias.replace(/\s/g, '').length < MIN_LATIN_ALIAS_LENGTH;
}

/**
 * Brand lookup for a STORE NAME - a short, mostly-brand string the user typed or
 * that came from a Gmail draft ("BuyMe", "buyme gift card", "קסטרו").
 *
 * Substring matching is right here: the input is nearly all brand, so a loose
 * match is almost certainly the real one and a miss costs the user a working
 * "where to use" link. Do NOT call this on a whole pasted message - use
 * findGiftCardInText, which trades this recall for precision.
 */
export function matchGeneralGiftCard(name: string): GeneralGiftCard | null {
  const n = normalize(name);
  if (!n) return null;
  // No `alias.includes(n)`: that reverse direction let a one-character store
  // name match any alias containing that letter (n="e" matched "buyme").
  return GENERAL_GIFT_CARDS.find(card =>
    card.aliases.some(alias => {
      const a = normalize(alias);
      return n === a || n.includes(a);
    })
  ) ?? null;
}

/**
 * Brand lookup for FREE TEXT - a whole pasted SMS or email, mostly words that
 * have nothing to do with any brand.
 *
 * Precision-first, because a false positive here is not a dead link: it forces
 * category "General" and overwrites the store name on a form the user is about
 * to save. Three rules do the work - whole-word matching, no short Latin
 * aliases, and longest-alias-wins so the most specific mention beats table
 * order when a message names more than one brand.
 */
export function findGiftCardInText(text: string): GeneralGiftCard | null {
  const t = normalize(text);
  if (!t) return null;

  let best: GeneralGiftCard | null = null;
  let bestLength = 0;
  for (const card of GENERAL_GIFT_CARDS) {
    for (const alias of card.aliases) {
      const a = normalize(alias);
      if (!a || isAmbiguousInFreeText(a)) continue;
      if (a.length <= bestLength || !containsAliasAsWord(t, a)) continue;
      best = card;
      bestLength = a.length;
    }
  }
  return best;
}
