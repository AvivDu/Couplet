import { Ionicons } from '@expo/vector-icons';

export const CATEGORY_COLORS: Record<string, string> = {
  All:         '#FFB7B2',
  Food:        '#FFDAB9',
  Groceries:   '#e0f2e7',
  Fashion:     '#E6E6FA',
  Electronics: '#D1D9E6',
  Beauty:      '#FFD1DC',
  Travel:      '#CCEEFF',
  Sport:       '#FAFAC8',
  Other:       '#B9C4B6',
};

export const CATEGORY_ICONS: Record<string, string> = {
  Food:        'restaurant-outline',
  Groceries:   'cart-outline',
  Fashion:     'shirt-outline',
  Electronics: 'hardware-chip-outline',
  Beauty:      'flower-outline',
  Travel:      'airplane-outline',
  Sport:       'trophy-outline',
  Other:       'ellipsis-horizontal-outline',
};

// Category cards used by the filter UIs (My Coupons + Group page).
// Mirrors the inline defs in app/(tabs)/index.tsx — that screen can adopt this later.
export type CategoryDef = {
  label: string;
  filter: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
};

export const CATEGORY_DEFS: CategoryDef[] = [
  { label: 'All Coupons',  filter: 'All',         icon: 'grid-outline',                color: CATEGORY_COLORS.All         },
  { label: 'Food',         filter: 'Food',        icon: 'restaurant-outline',          color: CATEGORY_COLORS.Food        },
  { label: 'Groceries',    filter: 'Groceries',   icon: 'cart-outline',                color: CATEGORY_COLORS.Groceries   },
  { label: 'Fashion',      filter: 'Fashion',     icon: 'shirt-outline',               color: CATEGORY_COLORS.Fashion     },
  { label: 'Electronics',  filter: 'Electronics', icon: 'hardware-chip-outline',       color: CATEGORY_COLORS.Electronics },
  { label: 'Beauty',       filter: 'Beauty',      icon: 'flower-outline',              color: CATEGORY_COLORS.Beauty      },
  { label: 'Travel',       filter: 'Travel',      icon: 'airplane-outline',            color: CATEGORY_COLORS.Travel      },
  { label: 'Sport',        filter: 'Sport',       icon: 'trophy-outline',              color: CATEGORY_COLORS.Sport       },
  { label: 'Other',        filter: 'Other',       icon: 'ellipsis-horizontal-outline', color: CATEGORY_COLORS.Other       },
];

// Sort options shared by the coupon filter UIs.
export type SortOption = 'balance-desc' | 'balance-asc' | 'expiry-asc';

export const SORT_OPTIONS: { value: SortOption; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'balance-desc', label: 'Balance: High to Low', icon: 'arrow-down-outline' },
  { value: 'balance-asc',  label: 'Balance: Low to High', icon: 'arrow-up-outline'   },
  { value: 'expiry-asc',   label: 'Expiry Date',          icon: 'calendar-outline'   },
];

// Returns a sorted copy. Coupons without an expiry date sink to the bottom for expiry-asc.
export function sortCoupons<T extends { balance: number | null; expiration_date: string | null }>(
  list: T[],
  sort: SortOption | null
): T[] {
  if (sort === null) return list;
  return [...list].sort((a, b) => {
    if (sort === 'balance-desc') return (b.balance ?? 0) - (a.balance ?? 0);
    if (sort === 'balance-asc')  return (a.balance ?? 0) - (b.balance ?? 0);
    if (!a.expiration_date && !b.expiration_date) return 0;
    if (!a.expiration_date) return 1;
    if (!b.expiration_date) return -1;
    return new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime();
  });
}
