import { View, TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';

interface CouponHeaderProps {
  isEditing: boolean;
  saving: boolean;
  onClosePress: () => void;
  onSavePress: () => void;
}

export default function CouponHeader({
  isEditing,
  saving,
  onClosePress,
  onSavePress,
}: CouponHeaderProps) {
  return (
    <View style={styles.headerRow}>
      <TouchableOpacity onPress={onClosePress} style={styles.closeBtn}>
        <Text style={styles.closeText}>{isEditing ? '← Back' : '✕  Close'}</Text>
      </TouchableOpacity>
      {isEditing && (
        <TouchableOpacity onPress={onSavePress} style={styles.saveBtn} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  closeBtn: { paddingVertical: 4 },
  closeText: { fontSize: 15, color: '#1A2332', fontWeight: '600', opacity: 0.6 },
  saveBtn: {
    backgroundColor: '#E8604C',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
