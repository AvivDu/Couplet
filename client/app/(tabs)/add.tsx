import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  SafeAreaView,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { createCoupon } from '../../services/api';
import { saveCouponCode } from '../../storage/couponStorage';

const CATEGORIES: { label: string; color: string }[] = [
  { label: 'Food', color: '#F4856A' },
  { label: 'Fashion', color: '#9B7EC8' },
  { label: 'Groceries', color: '#7DC99E' },
  { label: 'Electronics', color: '#6BBDE8' },
  { label: 'Beauty', color: '#EC9BC0' },
  { label: 'Travel', color: '#5BC8A8' },
  { label: 'Sport', color: '#F4856A' },
  { label: 'Other', color: '#B8C4CC' },
];

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

export default function AddCouponScreen() {
  const [code, setCode] = useState('');
  const [couponName, setCouponName] = useState('');
  const [category, setCategory] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryDay, setExpiryDay] = useState('');
  const [balance, setBalance] = useState('');
  const [loading, setLoading] = useState(false);
  const [aboutVisible, setAboutVisible] = useState(false);
  const [datePickerField, setDatePickerField] = useState<DateField | null>(null);
  const router = useRouter();

  const expiryString =
    expiryYear && expiryMonth && expiryDay
      ? `${expiryYear}-${expiryMonth}-${expiryDay}`
      : undefined;

  function getPickerItems(): { label: string; value: string }[] {
    if (datePickerField === 'year') return YEARS.map(y => ({ label: y, value: y }));
    if (datePickerField === 'month') return MONTHS;
    return DAYS.map(d => ({ label: d, value: d }));
  }

  function getCurrentValue() {
    if (datePickerField === 'year') return expiryYear;
    if (datePickerField === 'month') return expiryMonth;
    return expiryDay;
  }

  function setCurrentValue(value: string) {
    if (datePickerField === 'year') setExpiryYear(value);
    else if (datePickerField === 'month') setExpiryMonth(value);
    else setExpiryDay(value);
  }

  function getMonthLabel(value: string) {
    return MONTHS.find(m => m.value === value)?.label ?? '';
  }

  async function handleAdd() {
    if (!code.trim() || !couponName.trim() || !category) {
      Alert.alert('Missing fields', 'Please fill in coupon name, code, and category.');
      return;
    }

    setLoading(true);
    try {
      const { data } = await createCoupon({
        category,
        store_name: couponName.trim(),
        expiration_date: expiryString,
        balance: balance ? parseFloat(balance) : undefined,
      });

      await saveCouponCode(data.coupon_id, code.trim());

      Alert.alert('Coupon added!', `${couponName} coupon has been saved.`, [
        { text: 'OK', onPress: () => router.replace('/(tabs)') },
      ]);
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Could not add coupon. Is the server running?';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
          <Text style={styles.screenTitle}>Add New Coupon</Text>

          {/* Coupon Name */}
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              placeholder="Coupon Name"
              placeholderTextColor="#A8997A"
              value={couponName}
              onChangeText={setCouponName}
            />
          </View>

          {/* Coupon Code */}
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              placeholder="Coupon Code"
              placeholderTextColor="#A8997A"
              autoCapitalize="characters"
              value={code}
              onChangeText={setCode}
            />
          </View>

          {/* Expiration Date — three dropdowns */}
          <Text style={styles.dateLabel}>Expiration Date</Text>
          <View style={styles.dateRow}>
            <TouchableOpacity
              style={[styles.datePill, expiryYear ? styles.datePillFilled : null]}
              onPress={() => setDatePickerField('year')}
            >
              <Text style={[styles.datePillText, expiryYear ? styles.datePillTextFilled : null]}>
                {expiryYear || 'Year'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.datePill, expiryMonth ? styles.datePillFilled : null]}
              onPress={() => setDatePickerField('month')}
            >
              <Text style={[styles.datePillText, expiryMonth ? styles.datePillTextFilled : null]}>
                {expiryMonth ? getMonthLabel(expiryMonth) : 'Month'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.datePill, expiryDay ? styles.datePillFilled : null]}
              onPress={() => setDatePickerField('day')}
            >
              <Text style={[styles.datePillText, expiryDay ? styles.datePillTextFilled : null]}>
                {expiryDay || 'Day'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Balance */}
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              placeholder="Balance (optional)"
              placeholderTextColor="#A8997A"
              value={balance}
              onChangeText={setBalance}
              keyboardType="decimal-pad"
            />
          </View>

          {/* Category selector */}
          <View style={styles.categoryRow}>
            {CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat.label}
                style={styles.categoryItem}
                onPress={() => setCategory(cat.label)}
                activeOpacity={0.75}
              >
                <View
                  style={[
                    styles.categoryCircle,
                    { backgroundColor: cat.color },
                    category === cat.label && styles.categoryCircleActive,
                  ]}
                />
                <Text style={[styles.categoryLabel, category === cat.label && styles.categoryLabelActive]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.btn} onPress={handleAdd} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Save Coupon</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.aboutBtn} onPress={() => setAboutVisible(true)}>
            <Text style={styles.aboutBtnText}>About</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Date Picker Modal */}
        <Modal
          visible={datePickerField !== null}
          animationType="slide"
          transparent
          onRequestClose={() => setDatePickerField(null)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setDatePickerField(null)}
          >
            <View style={styles.pickerSheet}>
              <View style={styles.pickerHandle} />
              <Text style={styles.pickerTitle}>
                {datePickerField === 'year' ? 'Select Year' : datePickerField === 'month' ? 'Select Month' : 'Select Day'}
              </Text>
              <FlatList
                data={getPickerItems()}
                keyExtractor={item => item.value}
                style={styles.pickerList}
                renderItem={({ item }) => {
                  const selected = getCurrentValue() === item.value;
                  return (
                    <TouchableOpacity
                      style={[styles.pickerItem, selected && styles.pickerItemSelected]}
                      onPress={() => {
                        setCurrentValue(item.value);
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

        {/* About Modal */}
        <Modal visible={aboutVisible} animationType="fade" transparent onRequestClose={() => setAboutVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Couplet</Text>
              <Text style={styles.modalVersion}>Version 1.0.0</Text>
              <Text style={styles.modalDesc}>
                Your personal coupon wallet — store, manage, and share coupons securely. Coupon codes never leave your device.
              </Text>
              <View style={styles.divider} />
              <Text style={styles.modalTeamLabel}>BUILT BY</Text>
              <Text style={styles.modalTeam}>Aviv Duzy</Text>
              <Text style={styles.modalTeam}>Roni Kenigsberg</Text>
              <Text style={styles.modalTeam}>Doron Shen-Tzur</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setAboutVisible(false)}>
                <Text style={styles.modalCloseBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F0E6' },
  container: { flex: 1, backgroundColor: '#F5F0E6' },
  inner: { padding: 20, paddingBottom: 48 },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1A2332',
    marginBottom: 32,
    marginTop: 8,
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
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 36,
    marginTop: 8,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: '40%',
  },
  categoryCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  categoryCircleActive: {
    borderWidth: 3,
    borderColor: '#1A2332',
  },
  categoryLabel: {
    fontSize: 14,
    color: '#1A2332',
    opacity: 0.6,
    fontWeight: '500',
  },
  categoryLabelActive: {
    opacity: 1,
    fontWeight: '700',
  },
  btn: {
    backgroundColor: '#E8604C',
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  aboutBtn: {
    alignItems: 'center',
    marginTop: 20,
    paddingVertical: 10,
  },
  aboutBtnText: { color: '#1A2332', fontSize: 14, opacity: 0.4 },
  // Date picker sheet
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
  // About modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(26,35,50,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#F5F0E6',
    borderRadius: 24,
    padding: 28,
    margin: 24,
    alignItems: 'center',
  },
  modalTitle: { fontSize: 28, fontWeight: '800', color: '#E8604C', marginBottom: 4 },
  modalVersion: { fontSize: 13, color: '#1A2332', opacity: 0.4, marginBottom: 16 },
  modalDesc: { fontSize: 14, color: '#1A2332', opacity: 0.6, textAlign: 'center', lineHeight: 20 },
  divider: { height: 1, backgroundColor: '#C4B8A0', width: '100%', marginVertical: 20 },
  modalTeamLabel: { fontSize: 11, fontWeight: '700', color: '#1A2332', opacity: 0.4, letterSpacing: 1, marginBottom: 10 },
  modalTeam: { fontSize: 15, color: '#1A2332', fontWeight: '500', marginBottom: 4 },
  modalCloseBtn: {
    marginTop: 24,
    backgroundColor: '#E8604C',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 40,
  },
  modalCloseBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
