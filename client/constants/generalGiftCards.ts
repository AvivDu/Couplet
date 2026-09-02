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

// Returns the matching card if `name` contains (or is contained in) any of its aliases, else null.
export function matchGeneralGiftCard(name: string): GeneralGiftCard | null {
  const n = normalize(name);
  if (!n) return null;
  return GENERAL_GIFT_CARDS.find(card =>
    card.aliases.some(alias => {
      const a = normalize(alias);
      return n === a || n.includes(a) || a.includes(n);
    })
  ) ?? null;
}
