import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  Modal,
  RefreshControl,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CATEGORY_COLORS } from '../../constants/categories';
import { getCoupons, updateCoupon, deleteCoupon, getInvitations, acceptInvitation, declineInvitation, type CouponMeta } from '../../services/api';
import { getCouponCode, deleteCouponCode, deleteCouponImage } from '../../storage/couponStorage';
import { useAuth } from '../../context/AuthContext';
import CouponCard from '../../components/CouponCard';
import CouponDetail from '../../components/CouponDetail';
import NotificationPanel, { type NotificationItem } from '../../components/NotificationPanel';

type CategoryDef = {
  label: string;
  filter: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
};

const CATEGORY_DEFS: CategoryDef[] = [
  { label: 'All Coupons',  filter: 'All',         icon: 'grid-outline',                color: CATEGORY_COLORS.All         },
  { label: 'Food',         filter: 'Food',        icon: 'restaurant-outline',          color: CATEGORY_COLORS.Food        },
  { label: 'Groceries',    filter: 'Groceries',   icon: 'cart-outline',                color: CATEGORY_COLORS.Groceries   },
  { label: 'Fashion',      filter: 'Fashion',     icon: 'shirt-outline',               color: CATEGORY_COLORS.Fashion     },
  { label: 'Electronics',  filter: 'Electronics', icon: 'hardware-chip-outline',       color: CATEGORY_COLORS.Electronics },
  { label: 'Beauty',       filter: 'Beauty',      icon: 'flower-outline',              color: CATEGORY_COLORS.Beauty      },
  { label: 'Travel',       filter: 'Travel',      icon: 'airplane-outline',            color: CATEGORY_COLORS.Travel      },
  { label: 'Sport',        filter: 'Sport',       icon: 'trophy-outline',              color: CATEGORY_COLORS.Sport       },
  { label: 'Other',        filter: 'Other',       icon: 'ellipsis-horizontal-outline', color: CATEGORY_COLORS.Other       },
];

type SortOption = 'balance-desc' | 'balance-asc' | 'expiry-asc';

const SORT_OPTIONS: { value: SortOption; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'balance-desc', label: 'Balance: High to Low',      icon: 'arrow-down-outline'  },
  { value: 'balance-asc',  label: 'Balance: Low to High',      icon: 'arrow-up-outline'    },
  { value: 'expiry-asc',   label: 'Expiry Date',                icon: 'calendar-outline'   },
];

type CouponWithCode = CouponMeta & { code: string | null };

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const [coupons, setCoupons] = useState<CouponMeta[]>([]);
  const [couponCodes, setCouponCodes] = useState<Record<string, string | null>>({});
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption | null>(null);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<CouponWithCode | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await getCoupons();

      // Auto-expire: flip any active coupon whose expiry date has passed
      const now = new Date();
      const toExpire = data.filter(
        c => c.status === 'active' && c.expiration_date && new Date(c.expiration_date) < now
      );
      let coupons = data;
      if (toExpire.length > 0) {
        const updated = await Promise.all(
          toExpire.map(c => updateCoupon(c.coupon_id, { status: 'expired' }).then(r => r.data))
        );
        const updatedMap = Object.fromEntries(updated.map(c => [c.coupon_id, c]));
        coupons = data.map(c => updatedMap[c.coupon_id] ?? c);
      }

      setCoupons(coupons);
      const codes: Record<string, string | null> = {};
      await Promise.all(
        coupons.map(async c => {
          codes[c.coupon_id] = await getCouponCode(c.coupon_id);
        })
      );
      setCouponCodes(codes);

      // Generate expiry notifications for coupons due within 7 days
      const soonMs = 7 * 24 * 60 * 60 * 1000;
      const generated: NotificationItem[] = coupons
        .filter(c => c.expiration_date)
        .flatMap(c => {
          const msLeft = new Date(c.expiration_date!).getTime() - now.getTime();
          if (c.status === 'active' && msLeft >= 0 && msLeft <= soonMs) {
            const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
            return [{
              id: `expiry-${c.coupon_id}`,
              type: 'coupon' as const,
              title: `${c.store_name} expiring soon`,
              body: daysLeft === 0 ? 'Expires today!' : `Expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
              category: c.category,
              read: false,
            }];
          }
          return [];
        });
      let inviteNotifs: NotificationItem[] = [];
      try {
        const { data: invitations } = await getInvitations();
        inviteNotifs = invitations.map(inv => ({
          id: `invite-${inv.group_id}`,
          type: 'social' as const,
          title: 'Group invitation',
          body: `You've been invited to join "${inv.name}"`,
          read: false,
          actionType: 'group_invite' as const,
          actionGroupId: inv.group_id,
        }));
      } catch { /* invitation fetch failure should not break coupon load */ }

      setNotifications(prev => {
        const readIds = new Set(prev.filter(n => n.read).map(n => n.id));
        return [...inviteNotifs, ...generated].map(n => ({ ...n, read: readIds.has(n.id) }));
      });
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

  const filtered = coupons
    .filter(c => filter === 'All' || c.category === filter)
    .filter(c => !search.trim() || c.store_name.toLowerCase().includes(search.trim().toLowerCase()));

  const displayed = sort === null ? filtered : [...filtered].sort((a, b) => {
    if (sort === 'balance-desc') return (b.balance ?? 0) - (a.balance ?? 0);
    if (sort === 'balance-asc')  return (a.balance ?? 0) - (b.balance ?? 0);
    // expiry-asc: coupons without a date go to the bottom
    if (!a.expiration_date && !b.expiration_date) return 0;
    if (!a.expiration_date) return 1;
    if (!b.expiration_date) return -1;
    return new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime();
  });

  const activeSortLabel = SORT_OPTIONS.find(o => o.value === sort)?.label ?? null;
  const unreadCount = notifications.filter(n => !n.read).length;

  async function handleAcceptInvite(groupId: string) {
    await acceptInvitation(groupId);
    load();
  }

  async function handleDeclineInvite(groupId: string) {
    await declineInvitation(groupId);
    load();
  }

  function handleBellPress() {
    setNotifPanelOpen(true);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }

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
            await deleteCouponImage(id);
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
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={handleBellPress} style={styles.bellBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="notifications-outline" size={24} color="#1A2332" />
              {unreadCount > 0 && <View style={styles.badge} />}
            </TouchableOpacity>
            <TouchableOpacity onPress={signOut} style={styles.logoutBtn}>
              <Text style={styles.logoutText}>Log out</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Search bar */}
        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search coupons..."
            placeholderTextColor="#A8997A"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.searchClear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Category cards — horizontal scroll */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScrollView}
          contentContainerStyle={styles.categoryScroll}
        >
          {CATEGORY_DEFS.map(cat => {
            const active = filter === cat.filter;
            return (
              <TouchableOpacity
                key={cat.filter}
                style={[styles.categoryCard, active && { backgroundColor: cat.color, borderColor: cat.color }]}
                onPress={() => setFilter(cat.filter)}
                activeOpacity={0.75}
              >
                <Ionicons name={cat.icon} size={26} color={active ? '#444444' : '#1A2332'} />
                <Text style={[styles.categoryCardLabel, active && styles.categoryCardLabelActive]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Sort row */}
        <View style={styles.sortRow}>
          <TouchableOpacity style={styles.sortBtn} onPress={() => setSortMenuOpen(true)} activeOpacity={0.75}>
            <Ionicons name="funnel-outline" size={15} color={sort ? '#E8604C' : '#1A2332'} />
            <Text style={[styles.sortBtnText, sort && styles.sortBtnTextActive]} numberOfLines={1}>
              {activeSortLabel ?? 'Sort'}
            </Text>
            {sort && (
              <TouchableOpacity
                onPress={() => setSort(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={15} color="#E8604C" />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </View>

        {/* Coupon list */}
        <FlatList
          data={displayed}
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
          contentContainerStyle={displayed.length === 0 ? styles.emptyContainer : { paddingBottom: 100 }}
        />

        {/* Sort menu */}
        <Modal visible={sortMenuOpen} transparent animationType="slide" onRequestClose={() => setSortMenuOpen(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSortMenuOpen(false)}>
            <View style={styles.sortSheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sortSheetTitle}>Sort By</Text>
              {SORT_OPTIONS.map(opt => {
                const active = sort === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.sortOption, active && styles.sortOptionActive]}
                    onPress={() => { setSort(active ? null : opt.value); setSortMenuOpen(false); }}
                  >
                    <View style={styles.sortOptionLeft}>
                      <Ionicons name={opt.icon} size={20} color={active ? '#E8604C' : '#1A2332'} />
                      <Text style={[styles.sortOptionText, active && styles.sortOptionTextActive]}>
                        {opt.label}
                      </Text>
                    </View>
                    {active && <Ionicons name="checkmark" size={18} color="#E8604C" />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Notification panel */}
        <NotificationPanel
          visible={notifPanelOpen}
          notifications={notifications}
          onClose={() => setNotifPanelOpen(false)}
          onAcceptInvite={handleAcceptInvite}
          onDeclineInvite={handleDeclineInvite}
        />

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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bellBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  badge: {
    position: 'absolute', top: 6, right: 6,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#FFB7B2',
    borderWidth: 1.5, borderColor: '#F5F0E6',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#EDE8DC',
    gap: 8,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, fontSize: 15, color: '#1A2332' },
  searchClear: { fontSize: 13, color: '#A8997A', fontWeight: '600' },
  categoryScrollView: { flexGrow: 0, flexShrink: 0 },
  categoryScroll: { paddingHorizontal: 20, paddingBottom: 4, gap: 10 },
  categoryCard: {
    width: 80,
    height: 80,
    borderRadius: 16,
    backgroundColor: '#EDE8DC',
    borderWidth: 1.5,
    borderColor: '#E0D8CA',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  categoryCardLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1A2332',
    textAlign: 'center',
    opacity: 0.7,
    paddingHorizontal: 4,
  },
  categoryCardLabelActive: { color: '#444444', opacity: 1 },
  sortRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#C4B8A0',
    backgroundColor: 'transparent',
    maxWidth: 220,
  },
  sortBtnText: { fontSize: 13, fontWeight: '600', color: '#1A2332', opacity: 0.6, flexShrink: 1 },
  sortBtnTextActive: { color: '#E8604C', opacity: 1 },
  // Sort sheet modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(26,35,50,0.4)',
    justifyContent: 'flex-end',
  },
  sortSheet: {
    backgroundColor: '#F5F0E6',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 16,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C4B8A0',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sortSheetTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1A2332',
    opacity: 0.4,
    letterSpacing: 1,
    marginBottom: 8,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E0D8CA',
  },
  sortOptionActive: { backgroundColor: 'rgba(232,96,76,0.06)', borderRadius: 12 },
  sortOptionLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sortOptionText: { fontSize: 15, fontWeight: '500', color: '#1A2332' },
  sortOptionTextActive: { color: '#E8604C', fontWeight: '700' },
  // Coupon list empty state
  empty: { alignItems: 'center', gap: 10 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  emptyIcon: { fontSize: 52 },
  emptyText: { fontSize: 18, fontWeight: '700', color: '#1A2332' },
  emptyHint: { fontSize: 14, color: '#1A2332', opacity: 0.45 },
});
