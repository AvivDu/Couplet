import React from 'react';
import { Modal, View, StyleSheet } from 'react-native';
import CouponHeader from './CouponHeader';
import CouponDisplay from './CouponDisplay';
import CouponEditForm, { type CouponEditFormHandle } from './CouponEditForm';
import type { CouponDetailProps, CouponWithCode } from './types';

export default function CouponDetail({
  coupon,
  visible,
  onClose,
  onDelete,
  onMarkUsed,
  onUpdate,
}: CouponDetailProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const editFormRef = React.useRef<CouponEditFormHandle | null>(null);

  if (!coupon) {
    return null;
  }

  function handleClosePress() {
    if (isEditing) {
      setIsEditing(false);
      return;
    }
    onClose();
  }

  async function handleSavePress() {
    if (!editFormRef.current) {
      return;
    }
    await editFormRef.current.submit();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <CouponHeader
          isEditing={isEditing}
          saving={saving}
          onClosePress={handleClosePress}
          onSavePress={handleSavePress}
        />

        {!isEditing ? (
          <CouponDisplay
            coupon={coupon}
            onEdit={() => setIsEditing(true)}
            onDelete={onDelete}
            onMarkUsed={onMarkUsed}
            onClose={onClose}
          />
        ) : (
          <CouponEditForm
            ref={editFormRef}
            coupon={coupon}
            onSavingChange={setSaving}
            onSaved={(updated: CouponWithCode, newCode: string) => {
              onUpdate(updated, newCode);
              setIsEditing(false);
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F0E6' },
});
