import { useState, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, TextInput } from '../../components/rn';
import * as ImagePicker from 'expo-image-picker';
import ImageCropModal from '../../components/ImageCropModal';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { createCoupon } from '../../services/api';
import { saveCouponCode, saveCouponImage } from '../../storage/couponStorage';
import { CATEGORY_COLORS } from '../../constants/categories';
import { maskBalanceInput } from '../../utils/format';

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
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [cropUri, setCropUri] = useState<string | null>(null);
  const [imageNatSize, setImageNatSize] = useState<{ w: number; h: number } | null>(null);
  const [giftUrl, setGiftUrl] = useState('');
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      setCode('');
      setCouponName('');
      setCategory('');
      setExpiryDate(null);
      setBalance('');
      setImageUri(null);
      setGiftUrl('');
    }, [])
  );

  const expiryString = expiryDate
    ? expiryDate.toISOString().split('T')[0]
    : undefined;

  async function pickImage() {
    Alert.alert('Coupon Image', 'Choose a source', [
      {
        text: 'Camera',
        onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (perm.status !== 'granted') {
            Alert.alert('Permission needed', 'Please allow camera access in Settings.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
          if (!result.canceled) setCropUri(result.assets[0].uri);
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
          const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.85 });
          if (!result.canceled) setCropUri(result.assets[0].uri);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function handleAdd() {
    const hasCode = code.trim().length > 0;
    const hasImage = !!imageUri;
    const hasGiftUrl = giftUrl.trim().length > 0;

    if (!couponName.trim() || !category || (!hasCode && !hasImage && !hasGiftUrl)) {
      Alert.alert('Missing fields', 'Please fill in coupon name, category, and at least one of: coupon code, barcode image, or gift card URL.');
      return;
    }

    setLoading(true);
    try {
      const { data } = await createCoupon({
        category,
        store_name: couponName.trim(),
        expiration_date: expiryString,
        balance: balance ? parseFloat(balance) : undefined,
        giftcard_url: hasGiftUrl ? giftUrl.trim() : undefined,
      });

      if (hasCode) await saveCouponCode(data.coupon_id, code.trim());
      if (imageUri) {
        await saveCouponImage(data.coupon_id, imageUri);
      }

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
    <>
    {cropUri && (
      <ImageCropModal
        uri={cropUri}
        onCrop={uri => { setImageUri(uri); setCropUri(null); }}
        onCancel={() => setCropUri(null)}
      />
    )}
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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

          {/* Dynamic Gift Card Link */}
          <Text style={styles.sectionLabel}>Dynamic Gift Card Link (optional)</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              placeholder="e.g. https://www.buyme.co.il/..."
              placeholderTextColor="#A8997A"
              autoCapitalize="none"
              keyboardType="url"
              value={giftUrl}
              onChangeText={setGiftUrl}
            />
          </View>

          {/* Barcode / QR Image (optional) */}
          <Text style={styles.sectionLabel}>Barcode / QR Image (optional)</Text>
          <View style={styles.imagePickerWrap}>
            <TouchableOpacity
              style={imageUri && imageNatSize
                ? [styles.imagePickerBase, { aspectRatio: imageNatSize.w / imageNatSize.h }]
                : styles.imagePicker}
              onPress={pickImage}
              activeOpacity={0.8}
            >
              {imageUri ? (
                <>
                  <Image
                    source={{ uri: imageUri }}
                    style={styles.imagePreview}
                    resizeMode="contain"
                    onLoad={e => {
                      const { width: w, height: h } = e.nativeEvent.source;
                      setImageNatSize({ w, h });
                    }}
                  />
                  <View style={styles.imageChangeOverlay}>
                    <Text style={styles.imageChangeText}>Tap to change</Text>
                  </View>
                </>
              ) : (
                <View style={styles.imageEmpty}>
                  <Ionicons name="qr-code-outline" size={32} color="#A8997A" />
                  <Text style={styles.imageEmptyText}>Add barcode or QR image</Text>
                  <Text style={styles.imageEmptyHint}>Camera or Photo Library</Text>
                </View>
              )}
            </TouchableOpacity>
            {imageUri && (
              <TouchableOpacity
                style={styles.imageRemoveBtn}
                onPress={() => { setImageUri(null); setImageNatSize(null); }}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={22} color="#E8604C" />
              </TouchableOpacity>
            )}
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
              value={maskBalanceInput(balance)}
              onChangeText={text => setBalance(text.replace(/,/g, ''))}
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

        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
    </>
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
  imagePickerWrap: {
    position: 'relative',
    marginBottom: 28,
  },
  imagePickerBase: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#C4B8A0',
    borderStyle: 'dashed',
    overflow: 'hidden',
    backgroundColor: '#FDFAF4',
    width: '100%',
    maxHeight: 150,
  },
  imagePicker: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#C4B8A0',
    borderStyle: 'dashed',
    height: 120,
    overflow: 'hidden',
    backgroundColor: '#FDFAF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageRemoveBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#F5F0E6',
    borderRadius: 11,
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  imageChangeOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(26,35,50,0.45)',
    paddingVertical: 5,
    alignItems: 'center',
  },
  imageChangeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  imageEmpty: {
    alignItems: 'center',
    gap: 6,
  },
  imageEmptyText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A2332',
    opacity: 0.55,
  },
  imageEmptyHint: {
    fontSize: 11,
    color: '#A8997A',
  },
});
