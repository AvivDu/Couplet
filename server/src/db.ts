import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(__dirname, '..', 'data.json');

interface User {
  user_id: string;
  email: string;
  username: string;
  password_hash: string;
  created_at: string;
}

interface Coupon {
  coupon_id: string;
  owner_id: string;
  category: string;
  store_name: string;
  expiration_date: string | null;
  balance: number | null;
  status: string;
  created_at: string;
}

interface Store {
  users: User[];
  coupons: Coupon[];
}

function load(): Store {
  if (!fs.existsSync(DB_PATH)) {
    return { users: [], coupons: [] };
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')) as Store;
}

function save(store: Store): void {
  fs.writeFileSync(DB_PATH, JSON.stringify(store, null, 2));
}

export const db = {
  // Users
  findUserByEmail(email: string): User | undefined {
    return load().users.find(u => u.email === email);
  },
  findUserById(id: string): User | undefined {
    return load().users.find(u => u.user_id === id);
  },
  insertUser(user: User): void {
    const store = load();
    store.users.push(user);
    save(store);
  },

  // Coupons
  getCouponsByOwner(ownerId: string): Coupon[] {
    return load().coupons.filter(c => c.owner_id === ownerId).sort(
      (a, b) => b.created_at.localeCompare(a.created_at)
    );
  },
  getCouponById(id: string): Coupon | undefined {
    return load().coupons.find(c => c.coupon_id === id);
  },
  insertCoupon(coupon: Coupon): void {
    const store = load();
    store.coupons.push(coupon);
    save(store);
  },
  updateCoupon(id: string, ownerId: string, fields: Partial<Coupon>): Coupon | undefined {
    const store = load();
    const idx = store.coupons.findIndex(c => c.coupon_id === id && c.owner_id === ownerId);
    if (idx === -1) return undefined;
    store.coupons[idx] = { ...store.coupons[idx], ...fields };
    save(store);
    return store.coupons[idx];
  },
  deleteCoupon(id: string, ownerId: string): boolean {
    const store = load();
    const before = store.coupons.length;
    store.coupons = store.coupons.filter(c => !(c.coupon_id === id && c.owner_id === ownerId));
    if (store.coupons.length === before) return false;
    save(store);
    return true;
  },
};
