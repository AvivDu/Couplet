import type { CouponMeta } from '../../services/api';

export type CouponWithCode = CouponMeta & { code: string | null };

export interface CouponDetailProps {
  coupon: CouponWithCode | null;
  visible: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
  onMarkUsed: (id: string) => void;
  onUpdate: (updated: CouponMeta, newCode: string) => void;
}
