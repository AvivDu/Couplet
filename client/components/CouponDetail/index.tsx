import React from 'react';
import { Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import CouponDisplay from './CouponDisplay';
import CouponEditForm, { type CouponEditFormHandle } from './CouponEditForm';
import type { CouponDetailProps, CouponWithCode } from './types';
import AuroraBackground from '../ui/AuroraBackground';
import ScreenHeader from '../ui/ScreenHeader';
import IconButton from '../ui/IconButton';
import { colors } from '../../constants/theme';

export default function CouponDetail({
  coupon,
  visible,
  onClose,
  onDelete,
  onRedeem,
  onUpdate,
}: CouponDetailProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const editFormRef = React.useRef<CouponEditFormHandle | null>(null);
  const { user } = useAuth();

  if (!coupon) {
    return null;
  }

  // Editing, sharing and deleting are owner-only server-side. This modal is
  // also opened by non-owners from the group screen (to redeem a shared
  // coupon), so those controls are hidden rather than left as dead ends.
  const isOwner = coupon.owner_id === user?.userId;

  async function handleSavePress() {
    if (!editFormRef.current) return;
    await editFormRef.current.submit();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <AuroraBackground>
        <ScreenHeader
          back
          onBack={onClose}
          title={coupon.store_name}
          subtitle={coupon.category}
          actions={isOwner && (
            <IconButton label="Edit coupon" variant="bare" size="l" onPress={() => setIsEditing(true)}>
              <Ionicons name="create-outline" size={20} color={colors.textStrong} />
            </IconButton>
          )}
        />
        <CouponDisplay
          coupon={coupon}
          isOwner={isOwner}
          onEdit={() => setIsEditing(true)}
          onDelete={onDelete}
          onRedeem={onRedeem}
          onUpdate={onUpdate}
          onClose={onClose}
        />
      </AuroraBackground>

      <Modal
        visible={isEditing}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsEditing(false)}
      >
        <AuroraBackground>
          <ScreenHeader
            back
            onBack={() => setIsEditing(false)}
            title="Edit Coupon"
            actions={
              <IconButton label="Save" variant="solid" size="l" onPress={handleSavePress}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="checkmark" size={20} color="#fff" />}
              </IconButton>
            }
          />
          <CouponEditForm
            ref={editFormRef}
            coupon={coupon}
            onSavingChange={setSaving}
            onSaved={(updated: CouponWithCode, newCode: string) => {
              onUpdate(updated, newCode);
              setIsEditing(false);
            }}
          />
        </AuroraBackground>
      </Modal>
    </Modal>
  );
}
