import mongoose from 'mongoose';

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

// ── Schemas ───────────────────────────────────────────────────────────────

const userSchema = new mongoose.Schema<User>({
  user_id:       { type: String, required: true, unique: true },
  email:         { type: String, required: true, unique: true },
  username:      { type: String, required: true },
  password_hash: { type: String, required: true },
  created_at:    { type: String, required: true },
});

const couponSchema = new mongoose.Schema<Coupon>({
  coupon_id:       { type: String, required: true, unique: true },
  owner_id:        { type: String, required: true },
  category:        { type: String, required: true },
  store_name:      { type: String, required: true },
  expiration_date: { type: String, default: null },
  balance:         { type: Number, default: null },
  status:          { type: String, required: true, default: 'active' },
  created_at:      { type: String, required: true },
});

const groupSchema = new mongoose.Schema<Group>({
  group_id:       { type: String, required: true, unique: true },
  name:           { type: String, required: true },
  admin_user_id:  { type: String, required: true },
  user_id_list:   { type: [String], default: [] },
  coupon_id_list: { type: [String], default: [] },
  created_at:     { type: String, required: true },
});

const UserModel   = mongoose.model<User>('User', userSchema);
const CouponModel = mongoose.model<Coupon>('Coupon', couponSchema);
const GroupModel  = mongoose.model<Group>('Group', groupSchema);

// ── DB functions ──────────────────────────────────────────────────────────

export const db = {
  // Users
  async findUserByEmail(email: string): Promise<User | null> {
    return UserModel.findOne({ email }).lean<User>();
  },
  async findUserById(id: string): Promise<User | null> {
    return UserModel.findOne({ user_id: id }).lean<User>();
  },
  async insertUser(user: User): Promise<void> {
    await UserModel.create(user);
  },
  async findUsersByQuery(query: string): Promise<User[]> {
    const regex = new RegExp(query, 'i');
    return UserModel.find({ $or: [{ email: regex }, { username: regex }] })
      .limit(10)
      .lean<User[]>();
  },

  // Coupons
  async getCouponsByOwner(ownerId: string): Promise<Coupon[]> {
    return CouponModel.find({ owner_id: ownerId })
      .sort({ created_at: -1 })
      .lean<Coupon[]>();
  },
  async getCouponById(id: string): Promise<Coupon | null> {
    return CouponModel.findOne({ coupon_id: id }).lean<Coupon>();
  },
  async insertCoupon(coupon: Coupon): Promise<void> {
    await CouponModel.create(coupon);
  },
  async updateCoupon(id: string, ownerId: string, fields: Partial<Coupon>): Promise<Coupon | null> {
    return CouponModel.findOneAndUpdate(
      { coupon_id: id, owner_id: ownerId },
      { $set: fields },
      { new: true }
    ).lean<Coupon>();
  },
  async deleteCoupon(id: string, ownerId: string): Promise<boolean> {
    const result = await CouponModel.deleteOne({ coupon_id: id, owner_id: ownerId });
    return result.deletedCount > 0;
  },

  // Groups
  async createGroup(group: Group): Promise<void> {
    await GroupModel.create(group);
  },
  async getGroupsByUser(userId: string): Promise<Group[]> {
    return GroupModel.find({ user_id_list: userId })
      .sort({ created_at: -1 })
      .lean<Group[]>();
  },
  async getGroupById(id: string): Promise<Group | null> {
    return GroupModel.findOne({ group_id: id }).lean<Group>();
  },
  async addMemberToGroup(groupId: string, userId: string): Promise<Group | null> {
    return GroupModel.findOneAndUpdate(
      { group_id: groupId },
      { $addToSet: { user_id_list: userId } },
      { new: true }
    ).lean<Group>();
  },
  async removeMemberFromGroup(groupId: string, userId: string, adminId: string): Promise<Group | null> {
    return GroupModel.findOneAndUpdate(
      { group_id: groupId, admin_user_id: adminId },
      { $pull: { user_id_list: userId } },
      { new: true }
    ).lean<Group>();
  },
  async addCouponToGroup(groupId: string, couponId: string): Promise<Group | null> {
    return GroupModel.findOneAndUpdate(
      { group_id: groupId },
      { $addToSet: { coupon_id_list: couponId } },
      { new: true }
    ).lean<Group>();
  },
  async removeCouponFromGroup(groupId: string, couponId: string): Promise<Group | null> {
    return GroupModel.findOneAndUpdate(
      { group_id: groupId },
      { $pull: { coupon_id_list: couponId } },
      { new: true }
    ).lean<Group>();
  },
  async removeCouponsByOwnerFromGroup(groupId: string, ownerId: string): Promise<void> {
    const group = await GroupModel.findOne({ group_id: groupId }).lean<Group>();
    if (!group) return;
    const toRemove = await CouponModel.find({
      coupon_id: { $in: group.coupon_id_list },
      owner_id: ownerId,
    }).lean<Coupon[]>();
    const ids = toRemove.map(c => c.coupon_id);
    if (ids.length > 0) {
      await GroupModel.updateOne({ group_id: groupId }, { $pull: { coupon_id_list: { $in: ids } } });
    }
  },
};
