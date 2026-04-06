import * as cheerio from 'cheerio';

// Tries to extract a list of participating store chains for a given brand name.
// Returns an empty array if the brand is unknown or the site is not scrapeable.
export async function crawlRedeemableStores(storeName: string): Promise<string[]> {
  const normalized = storeName.trim().toLowerCase();

  // 1. Known Israeli gift card / coupon platforms — hardcoded seedlist + live crawl
  if (normalized.includes('dreamcard') || normalized.includes('dream card') || normalized.includes('דרים קארד')) {
    return crawlDreamCard();
  }

  if (normalized.includes('buyme') || normalized.includes('buy me') || normalized.includes('ביי מי')) {
    return crawlBuyMe();
  }

  // 2. Generic fallback — try to fetch the brand's homepage and look for
  //    a "participating stores" or "where to use" section
  return crawlGeneric(storeName);
}

// ---------------------------------------------------------------------------
// DreamCard — Cheerio works on their main page
// ---------------------------------------------------------------------------
async function crawlDreamCard(): Promise<string[]> {
  try {
    const res = await fetch('https://www.dreamcard.co.il', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return DREAMCARD_FALLBACK;
    const html = await res.text();
    const $ = cheerio.load(html);

    const stores: string[] = [];
    // Brand names appear as headings / strong tags inside brand cards
    $('h2, h3, h4, strong, .brand-name, .store-name, [class*="brand"], [class*="store"]').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 1 && text.length < 50 && /^[A-Za-z\u0590-\u05FF\s&'\-]+$/.test(text)) {
        stores.push(text);
      }
    });

    const unique = [...new Set(stores)];
    return unique.length >= 3 ? unique : DREAMCARD_FALLBACK;
  } catch {
    return DREAMCARD_FALLBACK;
  }
}

// ---------------------------------------------------------------------------
// BuyMe — JS-rendered, but their sitemap exposes brand slugs
// ---------------------------------------------------------------------------
async function crawlBuyMe(): Promise<string[]> {
  try {
    const res = await fetch('https://buyme.co.il/sitemap.xml', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return BUYME_FALLBACK;
    const xml = await res.text();
    const $ = cheerio.load(xml, { xmlMode: true });

    const stores: string[] = [];
    $('loc').each((_, el) => {
      const url = $(el).text().trim();
      // Brand pages follow the pattern /page/<BrandName>
      const match = url.match(/buyme\.co\.il\/page\/([^/]+)$/);
      if (match) {
        const slug = decodeURIComponent(match[1]).replace(/-/g, ' ').trim();
        // Skip Hebrew content/promotional pages (contain Hebrew chars or long descriptions)
        if (slug.length < 40 && !/[\u0590-\u05FF]/.test(slug)) {
          stores.push(slug);
        }
      }
    });

    const unique = [...new Set(stores)];
    return unique.length >= 3 ? unique : BUYME_FALLBACK;
  } catch {
    return BUYME_FALLBACK;
  }
}

// ---------------------------------------------------------------------------
// Generic — try the brand's homepage, look for store/brand lists
// ---------------------------------------------------------------------------
async function crawlGeneric(storeName: string): Promise<string[]> {
  // Try to guess the domain from the store name
  const slug = storeName.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
  if (!slug) return [];

  const candidates = [
    `https://www.${slug}.co.il`,
    `https://www.${slug}.com`,
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);

      const stores: string[] = [];
      $('[class*="brand"], [class*="store"], [class*="partner"], [class*="merchant"]').each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 1 && text.length < 50) {
          stores.push(text);
        }
      });

      const unique = [...new Set(stores)];
      if (unique.length >= 3) return unique;
    } catch {
      // Try next candidate
    }
  }

  return [];
}

// ---------------------------------------------------------------------------
// Fallbacks — known store lists for major Israeli gift card platforms
// ---------------------------------------------------------------------------
const DREAMCARD_FALLBACK = [
  'Fox', 'Mango', 'American Eagle', 'Foot Locker', 'Laline',
  'Sunglass Hut', 'The Children\'s Place', 'Fox Home', 'Flying Tiger',
  'Jumbo', 'Aerie', 'Quiksilver', 'Billabong',
];

const BUYME_FALLBACK = [
  'Greg', 'Delta', 'H&O', 'Castro', 'Renuar',
  'Golf', 'Terminal X', 'Factory 54',
];
