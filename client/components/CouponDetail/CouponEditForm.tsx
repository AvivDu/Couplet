import React from 'react';
import {
  ScrollView,
  Text,
  View,
  TextInput,
  StyleSheet,
  Alert,
} from 'react-native';
import { updateCoupon } from '../../services/api';
import { saveCouponCode } from '../../storage/couponStorage';
import { DAYS, MONTHS, YEARS } from './constants';
import DatePickerSheet from './DatePickerSheet';
import type { CouponWithCode } from './types';

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

    React.useEffect(() => {
      setEditName(coupon.store_name);
      setEditCode(coupon.code ?? '');
      setEditBalance(coupon.balance != null ? String(coupon.balance) : '');

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
        });

        const newCode = editCode.trim();
        if (newCode) {
          await saveCouponCode(coupon.coupon_id, newCode);
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
        </ScrollView>

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
  body: { padding: 20, paddingBottom: 48 },
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
  datePillWrap: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#C4B8A0',
    padding: 10,
    alignItems: 'center',
  },
  datePillCaption: {
    fontSize: 11,
    color: '#A8997A',
    marginBottom: 4,
  },
  dateValue: {
    fontSize: 14,
    color: '#1A2332',
    fontWeight: '600',
  },
});
