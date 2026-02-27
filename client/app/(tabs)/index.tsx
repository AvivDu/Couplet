import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  Modal,
} from 'react-native';
import { getCoupons, updateCoupon, deleteCoupon, type CouponMeta } from '../../services/api';
import { getCouponCode, deleteCouponCode } from '../../storage/couponStorage';
import { useAuth } from '../../context/AuthContext';
import CouponCard from '../../components/CouponCard';
import CouponDetail from '../../components/CouponDetail';

const CATEGORIES = ['All', 'Food', 'Fashion', 'Electronics', 'Beauty', 'Travel', 'Sport', 'Other'];

type CouponWithCode = CouponMeta & { code: string | null };

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const [coupons, setCoupons] = useState<CouponMeta[]>([]);
  const [couponCodes, setCouponCodes] = useState<Record<string, string | null>>({});
  const [filter, setFilter] = useState('All');
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<CouponWithCode | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await getCoupons();
      setCoupons(data);
      const codes: Record<string, string | null> = {};
      await Promise.all(
        data.map(async c => {
          codes[c.coupon_id] = await getCouponCode(c.coupon_id);
        })
      );
      setCouponCodes(codes);
    } catch {
      Alert.alert('Error', 'Could not load coupons. Is the server running?');
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filtered = filter === 'All' ? coupons : coupons.filter(c => c.category === filter);

  async function handleMarkUsed(id: string) {
    try {
      const { data } = await updateCoupon(id, { status: 'used' });
      setCoupons(prev => prev.map(c => c.coupon_id === id ? data : c));
    } catch {
      Alert.alert('Error', 'Could not update coupon.');
    }
  }

  async function handleDelete(id: string) {
    Alert.alert('Delete coupon', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCoupon(id);
            await deleteCouponCode(id);
            setCoupons(prev => prev.filter(c => c.coupon_id !== id));
          } catch {
            Alert.alert('Error', 'Could not delete coupon.');
          }
        },
      },
    ]);
  }

  function openDetail(coupon: CouponMeta) {
    setSelected({ ...coupon, code: couponCodes[coupon.coupon_id] ?? null });
  }

  function handleUpdate(updated: CouponMeta, newCode: string) {
    setCoupons(prev => prev.map(c => c.coupon_id === updated.coupon_id ? updated : c));
    setCouponCodes(prev => ({ ...prev, [updated.coupon_id]: newCode }));
    setSelected({ ...updated, code: newCode });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>My Coupons</Text>
            <Text style={styles.headerSub}>Hi, {user?.username} 👋</Text>
          </View>
          <TouchableOpacity onPress={signOut} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Log out</Text>
          </TouchableOpacity>
        </View>

        {/* Category dropdown trigger */}
        <TouchableOpacity style={styles.dropdown} onPress={() => setDropdownOpen(true)} activeOpacity={0.8}>
          <Text style={styles.dropdownLabel}>{filter === 'All' ? 'All Coupons' : filter}</Text>
          <Text style={styles.dropdownArrow}>▾</Text>
        </TouchableOpacity>

        {/* Coupon list */}
        <FlatList
          data={filtered}
          keyExtractor={c => c.coupon_id}
          renderItem={({ item }) => <CouponCard coupon={item} onPress={() => openDetail(item)} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E8604C" />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🏷️</Text>
              <Text style={styles.emptyText}>No coupons yet</Text>
              <Text style={styles.emptyHint}>Tap the tab below to add your first coupon</Text>
            </View>
          }
          contentContainerStyle={filtered.length === 0 ? styles.emptyContainer : { paddingBottom: 100 }}
        />

        {/* Dropdown modal */}
        <Modal visible={dropdownOpen} transparent animationType="fade" onRequestClose={() => setDropdownOpen(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDropdownOpen(false)}>
            <View style={styles.dropdownMenu}>
              <Text style={styles.dropdownMenuTitle}>Filter by Category</Text>
              {CATEGORIES.map((cat, i) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.dropdownItem,
                    i < CATEGORIES.length - 1 && styles.dropdownItemBorder,
                    filter === cat && styles.dropdownItemActive,
                  ]}
                  onPress={() => { setFilter(cat); setDropdownOpen(false); }}
                >
                  <Text style={[styles.dropdownItemText, filter === cat && styles.dropdownItemTextActive]}>
                    {cat === 'All' ? 'All Coupons' : cat}
                  </Text>
                  {filter === cat && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Detail modal */}
        <CouponDetail
          coupon={selected}
          visible={!!selected}
          onClose={() => setSelected(null)}
          onDelete={handleDelete}
          onMarkUsed={handleMarkUsed}
          onUpdate={handleUpdate}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F0E6' },
  container: { flex: 1, backgroundColor: '#F5F0E6' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#1A2332' },
  headerSub: { fontSize: 14, color: '#1A2332', opacity: 0.5, marginTop: 2 },
  logoutBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#C4B8A0',
  },
  logoutText: { fontSize: 13, color: '#1A2332', fontWeight: '600' },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginBottom: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#C4B8A0',
    backgroundColor: 'transparent',
  },
  dropdownLabel: { fontSize: 15, fontWeight: '600', color: '#1A2332' },
  dropdownArrow: { fontSize: 14, color: '#1A2332', opacity: 0.5 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(26,35,50,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  dropdownMenu: {
    backgroundColor: '#F5F0E6',
    borderRadius: 20,
    width: '100%',
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  dropdownMenuTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1A2332',
    opacity: 0.4,
    letterSpacing: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  dropdownItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#E0D8CA',
  },
  dropdownItemActive: { backgroundColor: 'rgba(232,96,76,0.08)' },
  dropdownItemText: { fontSize: 16, color: '#1A2332', fontWeight: '500' },
  dropdownItemTextActive: { color: '#E8604C', fontWeight: '700' },
  checkmark: { fontSize: 16, color: '#E8604C', fontWeight: '700' },
  empty: { alignItems: 'center', gap: 10 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  emptyIcon: { fontSize: 52 },
  emptyText: { fontSize: 18, fontWeight: '700', color: '#1A2332' },
  emptyHint: { fontSize: 14, color: '#1A2332', opacity: 0.45 },
});
