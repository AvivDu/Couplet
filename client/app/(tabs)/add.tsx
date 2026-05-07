import { useState, useCallback } from 'react';
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
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { createCoupon } from '../../services/api';
import { saveCouponCode } from '../../storage/couponStorage';
import { CATEGORY_COLORS } from '../../constants/categories';

const ADD_CATEGORIES: { label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: 'Food',        icon: 'restaurant-outline'          },
  { label: 'Groceries',   icon: 'cart-outline'                },
  { label: 'Fashion',     icon: 'shirt-outline'               },
  { label: 'Electronics', icon: 'hardware-chip-outline'       },
  { label: 'Beauty',      icon: 'flower-outline'              },
  { label: 'Travel',      icon: 'airplane-outline'            },
  { label: 'Sport',       icon: 'trophy-outline'              },
  { label: 'Other',       icon: 'ellipsis-horizontal-outline' },
];

export default function AddCouponScreen() {
  const [code, setCode] = useState('');
  const [couponName, setCouponName] = useState('');
  const [category, setCategory] = useState('');
  const [expiryDate, setExpiryDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [balance, setBalance] = useState('');
  const [loading, setLoading] = useState(false);
  const [aboutVisible, setAboutVisible] = useState(false);
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      setCode('');
      setCouponName('');
      setCategory('');
      setExpiryDate(null);
      setBalance('');
    }, [])
  );

  const expiryString = expiryDate
    ? expiryDate.toISOString().split('T')[0]
    : undefined;

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

          {/* Expiration Date */}
          <Text style={styles.sectionLabel}>Expiration Date</Text>
          <View style={styles.dateRow}>
            <TouchableOpacity
              style={[styles.datePill, expiryDate ? styles.datePillFilled : null]}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={[styles.datePillText, expiryDate ? styles.datePillTextFilled : null]}>
                {expiryDate
                  ? expiryDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                  : 'Select date'}
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
          <Text style={styles.sectionLabel}>Category</Text>
          <View style={styles.categoryRow}>
            {ADD_CATEGORIES.map(cat => {
              const active = category === cat.label;
              const color = CATEGORY_COLORS[cat.label] ?? '#EDE8DC';
              return (
                <TouchableOpacity
                  key={cat.label}
                  style={[styles.categoryCard, { borderColor: color }, active && { backgroundColor: color }]}
                  onPress={() => setCategory(cat.label)}
                  activeOpacity={0.75}
                >
                  <Ionicons name={cat.icon} size={24} color="#444444" />
                  <Text style={styles.categoryCardLabel}>{cat.label}</Text>
                </TouchableOpacity>
              );
            })}
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

        {/* Android: native date picker dialog */}
        {Platform.OS === 'android' && showDatePicker && (
          <DateTimePicker
            value={expiryDate ?? new Date()}
            mode="date"
            minimumDate={new Date()}
            onChange={(event, date) => {
              setShowDatePicker(false);
              if (event.type !== 'dismissed' && date) setExpiryDate(date);
            }}
          />
        )}

        {/* iOS: date picker in bottom sheet */}
        <Modal
          visible={Platform.OS === 'ios' && showDatePicker}
          animationType="slide"
          transparent
          onRequestClose={() => setShowDatePicker(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowDatePicker(false)}
          >
            <View style={[styles.pickerSheet, { paddingBottom: 32 }]}>
              <View style={styles.pickerHandle} />
              <Text style={styles.pickerTitle}>Select Date</Text>
              <DateTimePicker
                value={expiryDate ?? new Date()}
                mode="date"
                display="inline"
                minimumDate={new Date()}
                themeVariant="light"
                accentColor="#E8604C"
                onChange={(_, date) => { if (date) setExpiryDate(date); }}
                style={{ alignSelf: 'center' }}
              />
              <TouchableOpacity
                style={[styles.btn, { marginTop: 12 }]}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={styles.btnText}>Done</Text>
              </TouchableOpacity>
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
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#A8997A',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  dateRow: {
    marginBottom: 28,
  },
  datePill: {
    paddingVertical: 10,
    paddingHorizontal: 16,
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
    gap: 10,
    marginBottom: 36,
    marginTop: 4,
  },
  categoryCard: {
    width: 78,
    height: 78,
    borderRadius: 16,
    backgroundColor: '#F5F0E6',
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  categoryCardLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#444444',
    textAlign: 'center',
    paddingHorizontal: 4,
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
  pickerSheet: {
    backgroundColor: '#F5F0E6',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
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
