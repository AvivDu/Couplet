import type { CouponMeta, RedeemAction } from '../../services/api';

export type CouponWithCode = CouponMeta & { code: string | null };

export interface CouponDetailProps {
  coupon: CouponWithCode | null;
  visible: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
  onRedeem: (id: string, action: RedeemAction) => Promise<CouponMeta>;
  onUpdate: (updated: CouponMeta, newCode: string) => void;
}
