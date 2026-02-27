import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  TextInput,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { CouponMeta } from '../services/api';
import { updateCoupon } from '../services/api';
import { saveCouponCode, saveCouponImage, getCouponImage } from '../storage/couponStorage';

const CATEGORY_COLORS: Record<string, string> = {
  Food: '#F4856A',
  Fashion: '#9B7EC8',
  Groceries: '#7DC99E',
  Electronics: '#6BBDE8',
  Beauty: '#EC9BC0',
  Travel: '#5BC8A8',
  Sport: '#F4856A',
  Other: '#B8C4CC',
};

const YEARS = Array.from({ length: 12 }, (_, i) => String(2025 + i));

const MONTHS = [
  { label: 'January', value: '01' },
  { label: 'February', value: '02' },
  { label: 'March', value: '03' },
  { label: 'April', value: '04' },
  { label: 'May', value: '05' },
  { label: 'June', value: '06' },
  { label: 'July', value: '07' },
  { label: 'August', value: '08' },
  { label: 'September', value: '09' },
  { label: 'October', value: '10' },
  { label: 'November', value: '11' },
  { label: 'December', value: '12' },
];

const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));

type DateField = 'year' | 'month' | 'day';

interface Props {
  coupon: (CouponMeta & { code: string | null }) | null;
  visible: boolean;
  onClose: () => void;
  onDelete: (id: string) => void;
  onMarkUsed: (id: string) => void;
  onUpdate: (updated: CouponMeta, newCode: string) => void;
}

export default function CouponDetail({ coupon, visible, onClose, onDelete, onMarkUsed, onUpdate }: Props) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editYear, setEditYear] = useState('');
  const [editMonth, setEditMonth] = useState('');
  const [editDay, setEditDay] = useState('');
  const [editBalance, setEditBalance] = useState('');
  const [datePickerField, setDatePickerField] = useState<DateField | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (coupon?.coupon_id) {
      getCouponImage(coupon.coupon_id).then(setImageUri);
    }
  }, [coupon?.coupon_id]);

  function openEdit() {
    if (!coupon) return;
    setEditName(coupon.store_name);
    setEditCode(coupon.code ?? '');
    if (coupon.expiration_date) {
      const d = new Date(coupon.expiration_date);
      setEditYear(String(d.getFullYear()));
      setEditMonth(String(d.getMonth() + 1).padStart(2, '0'));
      setEditDay(String(d.getDate()).padStart(2, '0'));
    } else {
      setEditYear('');
      setEditMonth('');
      setEditDay('');
    }
    setEditBalance(coupon.balance != null ? String(coupon.balance) : '');
    setEditMode(true);
  }

  async function pickImage() {
    Alert.alert('Upload Coupon Image', 'Choose a source', [
      {
        text: 'Camera',
        onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (perm.status !== 'granted') {
            Alert.alert('Permission needed', 'Please allow camera access in Settings.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.85 });
          if (!result.canceled && coupon) {
            const uri = result.assets[0].uri;
            await saveCouponImage(coupon.coupon_id, uri);
            setImageUri(uri);
          }
        },
      },
      {
        text: 'Photo Library',
        onPress: async () => {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (perm.status !== 'granted') {
            Alert.alert('Permission needed', 'Please allow photo library access in Settings.');
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, quality: 0.85 });
          if (!result.canceled && coupon) {
            const uri = result.assets[0].uri;
            await saveCouponImage(coupon.coupon_id, uri);
            setImageUri(uri);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function handleSave() {
    if (!coupon || !editName.trim()) {
      Alert.alert('Missing fields', 'Coupon name is required.');
      return;
    }

    const expiryString =
      editYear && editMonth && editDay ? `${editYear}-${editMonth}-${editDay}` : undefined;

    setSaving(true);
    try {
      const { data: updated } = await updateCoupon(coupon.coupon_id, {
        store_name: editName.trim(),
        expiration_date: expiryString ?? null,
        balance: editBalance ? parseFloat(editBalance) : null,
      });

      const newCode = editCode.trim();
      if (newCode) {
        await saveCouponCode(coupon.coupon_id, newCode);
      }

      onUpdate(updated, newCode);
      setEditMode(false);
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Could not save changes.';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  }

  function getPickerItems(): { label: string; value: string }[] {
    if (datePickerField === 'year') return YEARS.map(y => ({ label: y, value: y }));
    if (datePickerField === 'month') return MONTHS;
    return DAYS.map(d => ({ label: d, value: d }));
  }

  function getCurrentPickerValue() {
    if (datePickerField === 'year') return editYear;
    if (datePickerField === 'month') return editMonth;
    return editDay;
  }

  function setCurrentPickerValue(value: string) {
    if (datePickerField === 'year') setEditYear(value);
    else if (datePickerField === 'month') setEditMonth(value);
    else setEditDay(value);
  }

  function getMonthLabel(value: string) {
    return MONTHS.find(m => m.value === value)?.label ?? '';
  }

  if (!coupon) return null;

  const color = CATEGORY_COLORS[coupon.category] ?? CATEGORY_COLORS.Other;
  const expiry = coupon.expiration_date
    ? new Date(coupon.expiration_date).toLocaleDateString()
    : 'No expiry';
  const balance = coupon.balance != null ? `₪${coupon.balance.toFixed(2)}` : '—';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header row */}
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={editMode ? () => setEditMode(false) : onClose}
            style={styles.closeBtn}
          >
            <Text style={styles.closeText}>{editMode ? '← Back' : '✕  Close'}</Text>
          </TouchableOpacity>
          {editMode && (
            <TouchableOpacity onPress={handleSave} style={styles.saveBtn} disabled={saving}>
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveBtnText}>Save</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* ── DETAIL VIEW ── */}
        {!editMode && (
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {/* Coupon card */}
            <View style={[styles.couponCard, { backgroundColor: color }]}>
              <Text style={styles.couponStore}>{coupon.store_name}</Text>
              <Text style={styles.couponCategory}>{coupon.category}</Text>

              {/* Image / upload area */}
              <TouchableOpacity style={styles.imageBox} onPress={pickImage} activeOpacity={0.8}>
                {imageUri ? (
                  <>
                    <Image source={{ uri: imageUri }} style={styles.uploadedImage} resizeMode="contain" />
                    <View style={styles.changeOverlay}>
                      <Text style={styles.changeOverlayText}>Tap to change</Text>
                    </View>
                  </>
                ) : (
                  <View style={styles.uploadPlaceholder}>
                    <Text style={styles.uploadIcon}>↑</Text>
                    <Text style={styles.uploadLabel}>Upload barcode / QR</Text>
                    <Text style={styles.uploadHint}>Camera or Photo Library</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Code pill */}
              <View style={styles.codePill}>
                <Text style={styles.codePillText}>Code: {coupon.code ?? '—'}</Text>
              </View>

              {/* Redeem button */}
              {coupon.status === 'active' && (
                <TouchableOpacity
                  style={styles.redeemBtn}
                  onPress={() => { onMarkUsed(coupon.coupon_id); onClose(); }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.redeemBtnText}>Redeem</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Details */}
            <View style={styles.detailsSection}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Balance</Text>
                <Text style={styles.detailValue}>{balance}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Expires</Text>
                <Text style={styles.detailValue}>{expiry}</Text>
              </View>
              <View style={[styles.detailRow, styles.detailRowLast]}>
                <Text style={styles.detailLabel}>Status</Text>
                <Text style={[styles.detailValue, coupon.status !== 'active' && styles.statusUsed]}>
                  {coupon.status.charAt(0).toUpperCase() + coupon.status.slice(1)}
                </Text>
              </View>
            </View>

            {/* Edit button */}
            <TouchableOpacity style={styles.editBtn} onPress={openEdit}>
              <Text style={styles.editBtnText}>Edit Coupon</Text>
            </TouchableOpacity>

            {/* Delete button */}
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => { onDelete(coupon.coupon_id); onClose(); }}
            >
              <Text style={styles.deleteBtnText}>Delete Coupon</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* ── EDIT VIEW ── */}
        {editMode && (
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.editTitle}>Edit Coupon</Text>

            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                placeholder="Coupon Name"
                placeholderTextColor="#A8997A"
                value={editName}
                onChangeText={setEditName}
              />
            </View>

            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                placeholder="Coupon Code"
                placeholderTextColor="#A8997A"
                autoCapitalize="characters"
                value={editCode}
                onChangeText={setEditCode}
              />
            </View>

            <Text style={styles.dateLabel}>Expiration Date</Text>
            <View style={styles.dateRow}>
              <TouchableOpacity
                style={[styles.datePill, editYear ? styles.datePillFilled : null]}
                onPress={() => setDatePickerField('year')}
              >
                <Text style={[styles.datePillText, editYear ? styles.datePillTextFilled : null]}>
                  {editYear || 'Year'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.datePill, editMonth ? styles.datePillFilled : null]}
                onPress={() => setDatePickerField('month')}
              >
                <Text style={[styles.datePillText, editMonth ? styles.datePillTextFilled : null]}>
                  {editMonth ? getMonthLabel(editMonth) : 'Month'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.datePill, editDay ? styles.datePillFilled : null]}
                onPress={() => setDatePickerField('day')}
              >
                <Text style={[styles.datePillText, editDay ? styles.datePillTextFilled : null]}>
                  {editDay || 'Day'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                placeholder="Balance (optional)"
                placeholderTextColor="#A8997A"
                value={editBalance}
                onChangeText={setEditBalance}
                keyboardType="decimal-pad"
              />
            </View>

            <TouchableOpacity style={styles.saveFullBtn} onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveFullBtnText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>

      {/* Date picker bottom sheet (for edit mode) */}
      <Modal
        visible={datePickerField !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setDatePickerField(null)}
      >
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={() => setDatePickerField(null)}
        >
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHandle} />
            <Text style={styles.pickerTitle}>
              {datePickerField === 'year'
                ? 'Select Year'
                : datePickerField === 'month'
                ? 'Select Month'
                : 'Select Day'}
            </Text>
            <FlatList
              data={getPickerItems()}
              keyExtractor={item => item.value}
              style={styles.pickerList}
              renderItem={({ item }) => {
                const selected = getCurrentPickerValue() === item.value;
                return (
                  <TouchableOpacity
                    style={[styles.pickerItem, selected && styles.pickerItemSelected]}
                    onPress={() => {
                      setCurrentPickerValue(item.value);
                      setDatePickerField(null);
                    }}
                  >
                    <Text style={[styles.pickerItemText, selected && styles.pickerItemTextSelected]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F0E6' },
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
  body: { padding: 20, paddingBottom: 48 },

  // Coupon card
  couponCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 28,
    alignItems: 'center',
  },
  couponStore: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1A2332',
    marginBottom: 4,
    textAlign: 'center',
  },
  couponCategory: {
    fontSize: 14,
    color: '#1A2332',
    opacity: 0.6,
    marginBottom: 20,
  },

  // Image upload area
  imageBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '100%',
    height: 140,
    marginBottom: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadedImage: {
    width: '100%',
    height: '100%',
  },
  changeOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(26,35,50,0.45)',
    paddingVertical: 6,
    alignItems: 'center',
  },
  changeOverlayText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  uploadPlaceholder: {
    alignItems: 'center',
    gap: 6,
  },
  uploadIcon: {
    fontSize: 28,
    color: '#A8997A',
    fontWeight: '300',
  },
  uploadLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A2332',
    opacity: 0.55,
  },
  uploadHint: {
    fontSize: 12,
    color: '#A8997A',
  },

  // Code pill
  codePill: {
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  codePillText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A2332',
    letterSpacing: 1,
  },

  // Redeem
  redeemBtn: {
    backgroundColor: 'rgba(26,35,50,0.18)',
    borderRadius: 24,
    paddingVertical: 13,
    paddingHorizontal: 48,
  },
  redeemBtnText: {
    color: '#1A2332',
    fontSize: 16,
    fontWeight: '700',
  },

  // Details section
  detailsSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 20,
    marginBottom: 20,
    opacity: 0.9,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EBE0',
  },
  detailRowLast: { borderBottomWidth: 0 },
  detailLabel: { fontSize: 15, color: '#1A2332', opacity: 0.55 },
  detailValue: { fontSize: 15, fontWeight: '600', color: '#1A2332' },
  statusUsed: { color: '#B8C4CC' },

  // Edit button
  editBtn: {
    backgroundColor: '#E8604C',
    borderRadius: 30,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 12,
  },
  editBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Delete button
  deleteBtn: {
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E8604C',
  },
  deleteBtnText: { color: '#E8604C', fontSize: 15, fontWeight: '600' },

  // Edit form
  editTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1A2332',
    marginBottom: 28,
    marginTop: 4,
  },
  inputWrap: {
    borderBottomWidth: 1.5,
    borderBottomColor: '#C4B8A0',
    marginBottom: 28,
  },
  input: {
    paddingVertical: 10,
    fontSize: 16,
    color: '#1A2332',
    backgroundColor: 'transparent',
  },
  dateLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#A8997A',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 28,
  },
  datePill: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#C4B8A0',
    alignItems: 'center',
  },
  datePillFilled: {
    borderColor: '#E8604C',
    backgroundColor: 'rgba(232,96,76,0.08)',
  },
  datePillText: {
    fontSize: 14,
    color: '#A8997A',
    fontWeight: '500',
  },
  datePillTextFilled: {
    color: '#1A2332',
    fontWeight: '600',
  },
  saveFullBtn: {
    backgroundColor: '#E8604C',
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  saveFullBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Date picker bottom sheet
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(26,35,50,0.5)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#F5F0E6',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '60%',
  },
  pickerHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C4B8A0',
    alignSelf: 'center',
    marginBottom: 16,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A2332',
    marginBottom: 12,
    textAlign: 'center',
  },
  pickerList: { flexGrow: 0 },
  pickerItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  pickerItemSelected: {
    backgroundColor: 'rgba(232,96,76,0.12)',
  },
  pickerItemText: {
    fontSize: 16,
    color: '#1A2332',
    textAlign: 'center',
  },
  pickerItemTextSelected: {
    color: '#E8604C',
    fontWeight: '700',
  },
});
