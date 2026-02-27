import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { CouponMeta } from '../services/api';

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

interface Props {
  coupon: CouponMeta;
  onPress: () => void;
}

export default function CouponCard({ coupon, onPress }: Props) {
  const color = CATEGORY_COLORS[coupon.category] ?? CATEGORY_COLORS.Other;
  const isUsed = coupon.status !== 'active';

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: color }, isUsed && styles.cardUsed]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      <Text style={styles.store} numberOfLines={1}>
        {coupon.store_name}
      </Text>
      {coupon.balance != null && (
        <Text style={styles.balance}>₪{coupon.balance.toFixed(2)} remaining</Text>
      )}
      {isUsed && (
        <View style={styles.usedBadge}>
          <Text style={styles.usedText}>{coupon.status.toUpperCase()}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 7,
    paddingVertical: 20,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardUsed: { opacity: 0.5 },
  store: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A2332',
  },
  balance: {
    fontSize: 13,
    color: '#1A2332',
    opacity: 0.65,
    marginTop: 4,
  },
  usedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(26,35,50,0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 8,
  },
  usedText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1A2332',
    letterSpacing: 0.5,
  },
});
