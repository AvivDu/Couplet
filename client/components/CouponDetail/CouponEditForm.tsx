import React from 'react';
import {
  ScrollView,
  View,
  StyleSheet,
  Alert,
  TouchableOpacity,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Image,
} from 'react-native';
import { Text } from '../rn';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { updateCoupon, getCouponGroups } from '../../services/api';
import { saveCouponCode, saveCouponImage, getCouponImage, deleteCouponImage } from '../../storage/couponStorage';
import ImageCropModal from '../ImageCropModal';
import { DAYS, MONTHS, YEARS } from './constants';
import { maskBalanceInput } from '../../utils/format';
import DatePickerSheet from './DatePickerSheet';
import type { CouponWithCode } from './types';
import { deliverCouponCode } from '../../services/couponSharing';
import { useNotifications } from '../../context/NotificationsContext';
import Input from '../ui/Input';
import { colors, radius, spacing, fontFamily, fontSize } from '../../constants/theme';

type DateField = 'year' | 'month' | 'day';

export interface CouponEditFormHandle {
  submit: () => Promise<void>;
}

interface CouponEditFormProps {
  coupon: CouponWithCode;
  onSaved: (updatedCoupon: CouponWithCode, updatedCode: string) => void;
  onSavingChange: (saving: boolean) => void;
}

const CouponEditForm = React.forwardRef<CouponEditFormHandle, CouponEditFormProps>(
  (
    { coupon, onSaved, onSavingChange }: CouponEditFormProps,
    ref: React.ForwardedRef<CouponEditFormHandle>
  ) => {
    const [editName, setEditName] = React.useState(coupon.store_name);
    const [editCode, setEditCode] = React.useState(coupon.code ?? '');
    const [editYear, setEditYear] = React.useState('');
    const [editMonth, setEditMonth] = React.useState('');
    const [editDay, setEditDay] = React.useState('');
    const [editBalance, setEditBalance] = React.useState(
      coupon.balance != null ? String(coupon.balance) : ''
    );
    const [datePickerField, setDatePickerField] = React.useState<DateField | null>(null);
    const [imageUri, setImageUri] = React.useState<string | null>(null);
    const [cropUri, setCropUri] = React.useState<string | null>(null);
    const [imageNatSize, setImageNatSize] = React.useState<{ w: number; h: number } | null>(null);
    const [editGiftUrl, setEditGiftUrl] = React.useState(coupon.giftcard_url ?? '');
    const { sendSignal } = useNotifications();

    React.useEffect(() => {
      getCouponImage(coupon.coupon_id).then(setImageUri);
    }, [coupon.coupon_id]);

    React.useEffect(() => {
      setEditName(coupon.store_name);
      setEditCode(coupon.code ?? '');
      setEditBalance(coupon.balance != null ? String(coupon.balance) : '');
      setEditGiftUrl(coupon.giftcard_url ?? '');

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
    }, [coupon]);

    async function handleSave() {
      if (!editName.trim()) {
        Alert.alert('Missing fields', 'Coupon name is required.');
        return;
      }

      if (editBalance && Number.isNaN(parseFloat(editBalance))) {
        Alert.alert('Invalid balance', 'Balance must be a valid number.');
        return;
      }

      const expiryString =
        editYear && editMonth && editDay ? `${editYear}-${editMonth}-${editDay}` : undefined;

      onSavingChange(true);
      try {
        const { data: updated } = await updateCoupon(coupon.coupon_id, {
          store_name: editName.trim(),
          expiration_date: expiryString ?? null,
          balance: editBalance ? parseFloat(editBalance) : null,
          giftcard_url: editGiftUrl.trim() || null,
        });

        const newCode = editCode.trim();
        if (newCode) {
          await saveCouponCode(coupon.coupon_id, newCode);
        }

        // The code lives only on this device (server never sees it), so an
        // edited code needs the exact same delivery this coupon's original
        // share used - P2P or the encrypted fallback - or every recipient
        // who already received the old code is silently stuck with it
        // forever. Fire-and-forget: the coupon save above already succeeded
        // and is what the user is waiting on; a redelivery hiccup here
        // shouldn't block or fail that.
        if (newCode && newCode !== (coupon.code ?? '')) {
          getCouponGroups(coupon.coupon_id)
            .then(({ data: groups }) =>
              Promise.all(
                groups.map(g =>
                  deliverCouponCode(sendSignal, g.group_id, coupon.coupon_id, newCode, { codeUpdated: true })
                )
              )
            )
            .catch(err => console.warn('[code-update] redelivery failed:', err?.message ?? err));
        }

        onSaved({ ...updated, code: newCode || null }, newCode);
      } catch (err: any) {
        const msg = err?.response?.data?.error ?? 'Could not save changes.';
        Alert.alert('Error', msg);
      } finally {
        onSavingChange(false);
      }
    }

    React.useImperativeHandle(ref, () => ({
      submit: handleSave,
    }));

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

    const pickerTitle =
      datePickerField === 'year'
        ? 'Select Year'
        : datePickerField === 'month'
        ? 'Select Month'
        : 'Select Day';

    return (
      <>
        {cropUri && (
          <ImageCropModal
            uri={cropUri}
            onCrop={async uri => {
              await saveCouponImage(coupon.coupon_id, uri);
              setImageUri(uri);
              setCropUri(null);
            }}
            onCancel={() => setCropUri(null)}
          />
        )}
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">

          <Input
            label="Coupon Name"
            value={editName}
            onChangeText={setEditName}
            wrapperStyle={styles.field}
          />

          <Input
            label="Coupon Code"
            autoCapitalize="characters"
            value={editCode}
            onChangeText={setEditCode}
            wrapperStyle={styles.field}
          />

          <Input
            label="Dynamic Gift Card Link (optional)"
            placeholder="e.g. https://www.buyme.co.il/..."
            autoCapitalize="none"
            keyboardType="url"
            value={editGiftUrl}
            onChangeText={setEditGiftUrl}
            wrapperStyle={styles.field}
          />

          <Text style={styles.dateLabel}>Barcode / QR Image (optional)</Text>
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
                  <Ionicons name="qr-code-outline" size={28} color={colors.textMuted} />
                  <Text style={styles.imageEmptyText}>Add barcode or QR image</Text>
                  <Text style={styles.imageEmptyHint}>Camera or Photo Library</Text>
                </View>
              )}
            </TouchableOpacity>
            {imageUri && (
              <TouchableOpacity
                style={styles.imageRemoveBtn}
                onPress={async () => {
                  await deleteCouponImage(coupon.coupon_id);
                  setImageUri(null);
                  setImageNatSize(null);
                }}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={22} color={colors.coral400} />
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.dateLabel}>Expiration Date</Text>
          <View style={styles.dateRow}>
            <View style={styles.datePillWrap}>
              <Text style={styles.datePillCaption}>Year</Text>
              <Text style={styles.dateValue} onPress={() => setDatePickerField('year')}>
                {editYear || 'Select'}
              </Text>
            </View>

            <View style={styles.datePillWrap}>
              <Text style={styles.datePillCaption}>Month</Text>
              <Text style={styles.dateValue} onPress={() => setDatePickerField('month')}>
                {editMonth ? getMonthLabel(editMonth) : 'Select'}
              </Text>
            </View>

            <View style={styles.datePillWrap}>
              <Text style={styles.datePillCaption}>Day</Text>
              <Text style={styles.dateValue} onPress={() => setDatePickerField('day')}>
                {editDay || 'Select'}
              </Text>
            </View>
          </View>

          <Input
            label="Balance (optional)"
            placeholder="0"
            value={maskBalanceInput(editBalance)}
            onChangeText={text => setEditBalance(text.replace(/,/g, ''))}
            keyboardType="decimal-pad"
            wrapperStyle={styles.field}
          />
            </ScrollView>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>

        <DatePickerSheet
          visible={datePickerField !== null}
          title={pickerTitle}
          items={getPickerItems()}
          selectedValue={getCurrentPickerValue()}
          onSelect={setCurrentPickerValue}
          onClose={() => setDatePickerField(null)}
        />
      </>
    );
  }
);

CouponEditForm.displayName = 'CouponEditForm';

export default CouponEditForm;

const styles = StyleSheet.create({
  body: { padding: spacing.gutterScreen, paddingBottom: 48 },
  field: { marginBottom: spacing.s7 },
  dateLabel: {
    fontFamily: fontFamily.uiBold,
    fontSize: fontSize.micro,
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: spacing.s5,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: spacing.s7,
  },
  datePillWrap: {
    flex: 1,
    borderRadius: radius.m,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    padding: 10,
    alignItems: 'center',
  },
  datePillCaption: {
    fontFamily: fontFamily.ui,
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 4,
  },
  dateValue: {
    fontFamily: fontFamily.uiSemibold,
    fontSize: 14,
    color: colors.textStrong,
  },
  imagePickerWrap: {
    position: 'relative',
    marginBottom: spacing.s7,
  },
  imagePickerBase: {
    borderRadius: radius.l,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderStyle: 'dashed',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,.5)',
    width: '100%',
    maxHeight: 150,
  },
  imagePicker: {
    borderRadius: radius.l,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderStyle: 'dashed',
    height: 120,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageRemoveBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: colors.surfacePage,
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
    fontFamily: fontFamily.uiSemibold,
    fontSize: 12,
  },
  imageEmpty: {
    alignItems: 'center',
    gap: 6,
  },
  imageEmptyText: {
    fontFamily: fontFamily.uiSemibold,
    fontSize: 13,
    color: colors.textStrong,
    opacity: 0.55,
  },
  imageEmptyHint: {
    fontFamily: fontFamily.ui,
    fontSize: 11,
    color: colors.textMuted,
  },
});
