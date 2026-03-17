// ── Interfaces ────────────────────────────────────────────────────────────

export interface User {
  user_id: string;
  email: string;
  username: string;
  password_hash: string;
  created_at: string;
}

export interface Coupon {
  coupon_id: string;
  owner_id: string;
  category: string;
  store_name: string;
  expiration_date: string | null;
  balance: number | null;
  status: string;
  created_at: string;
}

export interface Group {
  group_id: string;
  name: string;
  admin_user_id: string;
  user_id_list: string[];
  coupon_id_list: string[];
  created_at: string;
}

// ── In-memory store ───────────────────────────────────────────────────────

const users   = new Map<string, User>();
const coupons = new Map<string, Coupon>();
const groups  = new Map<string, Group>();

// ── DB functions ──────────────────────────────────────────────────────────

export const db = {
  // Users
  async findUserByEmail(email: string): Promise<User | null> {
    for (const u of users.values()) {
      if (u.email === email) return u;
    }
    return null;
  },
  async findUserById(id: string): Promise<User | null> {
    return users.get(id) ?? null;
  },
  async insertUser(user: User): Promise<void> {
    users.set(user.user_id, user);
  },
  async findUsersByQuery(query: string): Promise<User[]> {
    const q = query.toLowerCase();
    const results: User[] = [];
    for (const u of users.values()) {
      if (u.email.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)) {
        results.push(u);
        if (results.length >= 10) break;
      }
    }
    return results;
  },

  // Coupons
  async getCouponsByOwner(ownerId: string): Promise<Coupon[]> {
    return [...coupons.values()]
      .filter(c => c.owner_id === ownerId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async getCouponById(id: string): Promise<Coupon | null> {
    return coupons.get(id) ?? null;
  },
  async insertCoupon(coupon: Coupon): Promise<void> {
    coupons.set(coupon.coupon_id, coupon);
  },
  async updateCoupon(id: string, ownerId: string, fields: Partial<Coupon>): Promise<Coupon | null> {
    const coupon = coupons.get(id);
    if (!coupon || coupon.owner_id !== ownerId) return null;
    const updated = { ...coupon, ...fields };
    coupons.set(id, updated);
    return updated;
  },
  async deleteCoupon(id: string, ownerId: string): Promise<boolean> {
    const coupon = coupons.get(id);
    if (!coupon || coupon.owner_id !== ownerId) return false;
    coupons.delete(id);
    return true;
  },

  // Groups
  async createGroup(group: Group): Promise<void> {
    groups.set(group.group_id, group);
  },
  async getGroupsByUser(userId: string): Promise<Group[]> {
    return [...groups.values()]
      .filter(g => g.user_id_list.includes(userId))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async getGroupById(id: string): Promise<Group | null> {
    return groups.get(id) ?? null;
  },
  async addMemberToGroup(groupId: string, userId: string): Promise<Group | null> {
    const group = groups.get(groupId);
    if (!group) return null;
    if (!group.user_id_list.includes(userId)) group.user_id_list.push(userId);
    return group;
  },
  async removeMemberFromGroup(groupId: string, userId: string, adminId: string): Promise<Group | null> {
    const group = groups.get(groupId);
    if (!group || group.admin_user_id !== adminId) return null;
    group.user_id_list = group.user_id_list.filter(id => id !== userId);
    return group;
  },
  async addCouponToGroup(groupId: string, couponId: string): Promise<Group | null> {
    const group = groups.get(groupId);
    if (!group) return null;
    if (!group.coupon_id_list.includes(couponId)) group.coupon_id_list.push(couponId);
    return group;
  },
  async removeCouponFromGroup(groupId: string, couponId: string): Promise<Group | null> {
    const group = groups.get(groupId);
    if (!group) return null;
    group.coupon_id_list = group.coupon_id_list.filter(id => id !== couponId);
    return group;
  },
  async removeCouponsByOwnerFromGroup(groupId: string, ownerId: string): Promise<void> {
    const group = groups.get(groupId);
    if (!group) return;
    group.coupon_id_list = group.coupon_id_list.filter(cid => {
      const c = coupons.get(cid);
      return !c || c.owner_id !== ownerId;
    });
  },
};
