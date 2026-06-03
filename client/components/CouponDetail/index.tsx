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

  async function handleSavePress() {
    if (!editFormRef.current) return;
    await editFormRef.current.submit();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <CouponHeader
          isEditing={false}
          saving={false}
          onClosePress={onClose}
          onSavePress={() => {}}
        />
        <CouponDisplay
          coupon={coupon}
          onEdit={() => setIsEditing(true)}
          onDelete={onDelete}
          onMarkUsed={onMarkUsed}
          onUpdate={onUpdate}
          onClose={onClose}
        />
      </View>

      <Modal
        visible={isEditing}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsEditing(false)}
      >
        <View style={styles.container}>
          <CouponHeader
            isEditing={true}
            saving={saving}
            onClosePress={() => setIsEditing(false)}
            onSavePress={handleSavePress}
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
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F0E6' },
});
