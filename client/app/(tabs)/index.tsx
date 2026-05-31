import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Animated,
  Dimensions,
  Image,
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
import { getCoupons, updateCoupon, deleteCoupon, getInvitations, acceptInvitation, declineInvitation, getNotifications, markNotificationsRead, deleteNotification, type CouponMeta } from '../../services/api';
import { getCouponCode, saveCouponCode, deleteCouponCode, deleteCouponImage, getUserAvatar } from '../../storage/couponStorage';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationsContext';
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

const DRAWER_WIDTH = Dimensions.get('window').width * 0.48;

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const { revision } = useNotifications();
  const router = useRouter();
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
  const [joinedGroupName, setJoinedGroupName] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [aboutVisible, setAboutVisible] = useState(false);
  const [drawerAvatarUri, setDrawerAvatarUri] = useState<string | null>(null);
  const drawerAnim = useRef(new Animated.Value(0)).current;

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

      // Generate one expiry notification per day (7 down to 1) for each active coupon
      const soonMs = 7 * 24 * 60 * 60 * 1000;
      const generated: NotificationItem[] = coupons
        .filter(c => c.expiration_date)
        .flatMap(c => {
          const msLeft = new Date(c.expiration_date!).getTime() - now.getTime();
          if (c.status === 'active' && msLeft > 0 && msLeft <= soonMs) {
            const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
            return [{
              // ID includes daysLeft so each day produces a fresh unread notification
              id: `expiry-${c.coupon_id}-${daysLeft}`,
              type: 'coupon' as const,
              title: `${c.store_name} expiring soon`,
              body: daysLeft === 1 ? 'Expires tomorrow!' : `Expires in ${daysLeft} days`,
              category: c.category,
              read: false,
            }];
          }
          return [];
        });
      const [invitationsResult, serverNotifsResult] = await Promise.allSettled([
        getInvitations(),
        getNotifications(),
      ]);

      const invitations = invitationsResult.status === 'fulfilled' ? invitationsResult.value.data : [];
      const serverNotifData = serverNotifsResult.status === 'fulfilled' ? serverNotifsResult.value.data : [];

      // Save coupon codes delivered through group_share notifications
      const groupShareNotifs = serverNotifData.filter(n => n.type === 'group_share');
      console.log('[DEBUG notif] group_share count:', groupShareNotifs.length,
        '| with code:', groupShareNotifs.filter(n => n.coupon_code).length,
        '| sample:', JSON.stringify(groupShareNotifs[0] ?? null));
      const codeDeliveries = groupShareNotifs.filter(n => n.coupon_id && n.coupon_code);
      if (codeDeliveries.length > 0) {
        await Promise.all(
          codeDeliveries.map(n => saveCouponCode(n.coupon_id!, n.coupon_code!))
        );
        console.log('[DEBUG notif] saved codes for coupon_ids:', codeDeliveries.map(n => n.coupon_id));
      }

      // Delete local coupon codes for any revoked coupons
      const revokedCouponIds = serverNotifData
        .filter(n => n.type === 'coupon_revoked' && n.coupon_id)
        .map(n => n.coupon_id!);
      if (revokedCouponIds.length > 0) {
        await Promise.all(revokedCouponIds.map(id => deleteCouponCode(id)));
      }

      // Map server notifications; group_invite type gets Accept/Decline action buttons
      const serverNotifs: NotificationItem[] = serverNotifData.map(n => ({
        id: `server-${n.notification_id}`,
        serverId: n.notification_id,
        type: 'social' as const,
        title: n.title,
        body: n.body,
        read: n.read,
        // Non-invite notifications with a group become tap-to-navigate.
        ...(n.type !== 'group_invite' && n.group_id ? { navigateGroupId: n.group_id } : {}),
        ...(n.type === 'group_invite' && n.group_id
          ? { actionType: 'group_invite' as const, actionGroupId: n.group_id, actionGroupName: n.group_name }
          : {}),
      }));

      // Legacy: only show getInvitations() items not already covered by a server notification
      const serverInviteGroupIds = new Set(
        serverNotifData.filter(n => n.type === 'group_invite' && n.group_id).map(n => n.group_id!)
      );
      const inviteNotifs: NotificationItem[] = invitations
        .filter(inv => !serverInviteGroupIds.has(inv.group_id))
        .map(inv => ({
          id: `invite-${inv.group_id}`,
          type: 'social' as const,
          title: 'Group invitation',
          body: `You've been invited to join "${inv.name}"`,
          read: false,
          actionType: 'group_invite' as const,
          actionGroupId: inv.group_id,
          actionGroupName: inv.name,
        }));

      setNotifications(prev => {
        const readIds = new Set(prev.filter(n => n.read).map(n => n.id));
        return [
          // Invitations are always unread while still pending
          ...inviteNotifs,
          ...serverNotifs.map(n => ({
            ...n,
            read: n.actionType === 'group_invite' ? false : (n.read || readIds.has(n.id)),
          })),
          ...generated.map(n => ({ ...n, read: readIds.has(n.id) })),
        ];
      });
    } catch {
      Alert.alert('Error', 'Could not load coupons. Is the server running?');
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Live refresh: the WebSocket provider bumps `revision` on every incoming
  // event so the list updates instantly without a manual screen refresh.
  useEffect(() => {
    if (revision > 0) load();
  }, [revision, load]);

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
    const notif = notifications.find(n => n.actionGroupId === groupId);
    try {
      const { data } = await acceptInvitation(groupId);
      const groupName: string = (data as any)?.name ?? notif?.actionGroupName ?? 'the group';
      setNotifications(prev => prev.filter(n => n.actionGroupId !== groupId));
      if (notif?.id.startsWith('server-')) {
        deleteNotification(notif.id.slice('server-'.length)).catch(() => {});
      }
      // Close the panel first, then show the popup after the sheet-close animation (~350ms)
      // Avoids stacking two Modals simultaneously which makes the second one invisible on iOS
      setNotifPanelOpen(false);
      setTimeout(() => setJoinedGroupName(groupName), 350);
      load();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not accept invitation.');
    }
  }

  async function handleDeclineInvite(groupId: string) {
    await declineInvitation(groupId);
    load();
  }

  function handleDismissNotification(id: string) {
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (id.startsWith('server-')) {
      deleteNotification(id.slice('server-'.length)).catch(() => {});
    }
  }

  // Tapping a (non-invite) notification deletes it and jumps to its group.
  function handlePressNotification(item: NotificationItem) {
    const groupId = item.navigateGroupId ?? item.actionGroupId;
    if (!groupId) return;
    setNotifications(prev => prev.filter(n => n.id !== item.id));
    if (item.serverId) deleteNotification(item.serverId).catch(() => {});
    setNotifPanelOpen(false);
    router.push(`/group/${groupId}`);
  }

  function handleBellPress() {
    setNotifPanelOpen(true);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    markNotificationsRead().catch(() => {});
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

  function openDrawer() {
    getUserAvatar().then(setDrawerAvatarUri);
    setDrawerOpen(true);
    Animated.timing(drawerAnim, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }

  function closeDrawer(cb?: () => void) {
    Animated.timing(drawerAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setDrawerOpen(false);
      cb?.();
    });
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
            <TouchableOpacity
              onPress={openDrawer}
              style={styles.settingsBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="settings-outline" size={24} color="#1A2332" />
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
          onDismissNotification={handleDismissNotification}
          onPressItem={handlePressNotification}
        />

        {/* Joined group confirmation */}
        {joinedGroupName !== null && (
          <Modal transparent animationType="fade" visible onRequestClose={() => setJoinedGroupName(null)}>
            <View style={styles.joinOverlay}>
              {/* Backdrop — rendered first so the box sits on top and receives touches first */}
              <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setJoinedGroupName(null)} />
              <View style={styles.joinBox}>
                <TouchableOpacity style={styles.joinCloseBtn} onPress={() => setJoinedGroupName(null)}>
                  <Ionicons name="close" size={20} color="#1A2332" />
                </TouchableOpacity>
                <Ionicons name="people-circle-outline" size={52} color="#E8604C" />
                <Text style={styles.joinText}>You joined "{joinedGroupName}" group!</Text>
              </View>
            </View>
          </Modal>
        )}

        {/* Detail modal */}
        <CouponDetail
          coupon={selected}
          visible={!!selected}
          onClose={() => setSelected(null)}
          onDelete={handleDelete}
          onMarkUsed={handleMarkUsed}
          onUpdate={handleUpdate}
        />

        {/* Settings Drawer */}
        {drawerOpen && (
          <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
            <TouchableOpacity
              style={styles.drawerOverlay}
              activeOpacity={1}
              onPress={() => closeDrawer()}
            />
            <Animated.View
              style={[
                styles.drawer,
                {
                  width: DRAWER_WIDTH,
                  transform: [{ translateX: drawerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [DRAWER_WIDTH, 0],
                  }) }],
                },
              ]}
            >
              <View style={styles.drawerHeader}>
                <View style={styles.avatarCircle}>
                  {drawerAvatarUri
                    ? <Image source={{ uri: drawerAvatarUri }} style={styles.avatarImage} />
                    : <Ionicons name="person-outline" size={32} color="#A8997A" />}
                </View>
                <Text style={styles.drawerUsername}>{user?.username}</Text>
                <TouchableOpacity
                  style={styles.drawerProfileBtn}
                  onPress={() => closeDrawer(() => router.push('/edit-profile'))}
                >
                  <Text style={styles.drawerProfileBtnText}>View & Edit Profile</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.drawerBody}>
                <TouchableOpacity
                  style={styles.drawerItem}
                  onPress={() => { closeDrawer(); setTimeout(() => setAboutVisible(true), 250); }}
                >
                  <Ionicons name="information-circle-outline" size={20} color="#1A2332" />
                  <Text style={styles.drawerItemText}>About Couplet</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.drawerFooter}>
                <TouchableOpacity style={styles.drawerItem} onPress={() => closeDrawer(signOut)}>
                  <Ionicons name="log-out-outline" size={20} color="#C0857A" />
                  <Text style={[styles.drawerItemText, { color: '#C0857A' }]}>Log Out</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>
        )}

        {/* About modal */}
        <Modal visible={aboutVisible} animationType="fade" transparent onRequestClose={() => setAboutVisible(false)}>
          <View style={styles.aboutOverlay}>
            <View style={styles.aboutCard}>
              <Text style={styles.aboutTitle}>Couplet</Text>
              <Text style={styles.aboutVersion}>Version 1.0.0</Text>
              <Text style={styles.aboutDesc}>Your personal coupon wallet — store, manage, and share coupons securely. Coupon codes never leave your device.</Text>
              <View style={styles.aboutDivider} />
              <Text style={styles.aboutTeamLabel}>BUILT BY</Text>
              <Text style={styles.aboutTeam}>Aviv Duzy</Text>
              <Text style={styles.aboutTeam}>Roni Kenigsberg</Text>
              <Text style={styles.aboutTeam}>Doron Shen-Tzur</Text>
              <TouchableOpacity style={styles.aboutCloseBtn} onPress={() => setAboutVisible(false)}>
                <Text style={styles.aboutCloseBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  settingsBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  bellBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  badge: {
    position: 'absolute', top: 4, right: 4,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#E8604C',
    borderWidth: 2, borderColor: '#F5F0E6',
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
  empty: { alignItems: 'center', gap: 10 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  emptyIcon: { fontSize: 52 },
  emptyText: { fontSize: 18, fontWeight: '700', color: '#1A2332' },
  emptyHint: { fontSize: 14, color: '#1A2332', opacity: 0.45 },
  joinOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  joinBox: {
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingTop: 44,
    paddingBottom: 32,
    paddingHorizontal: 32,
    alignItems: 'center',
    width: 300,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  joinCloseBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  joinText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A2332',
    textAlign: 'center',
    lineHeight: 24,
  },
  // Settings Drawer
  drawerOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(26,35,50,0.45)' },
  drawer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#F5F0E6',
    paddingTop: 56,
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 16,
  },
  drawerHeader: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E0D8CA',
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#E0D8CA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    overflow: 'hidden',
  },
  avatarImage: { width: 72, height: 72 },
  drawerUsername: { fontSize: 16, fontWeight: '700', color: '#1A2332', marginBottom: 10 },
  drawerProfileBtn: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E8604C',
    paddingVertical: 7,
    paddingHorizontal: 16,
  },
  drawerProfileBtnText: { fontSize: 13, fontWeight: '600', color: '#E8604C' },
  drawerBody: { flex: 1, paddingTop: 16, paddingHorizontal: 8 },
  drawerFooter: {
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0D8CA',
    paddingTop: 12,
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  drawerItemText: { fontSize: 15, fontWeight: '500', color: '#1A2332' },
  // About modal
  aboutOverlay: {
    flex: 1,
    backgroundColor: 'rgba(26,35,50,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  aboutCard: {
    backgroundColor: '#F5F0E6',
    borderRadius: 24,
    padding: 28,
    width: '100%',
    alignItems: 'center',
  },
  aboutTitle: { fontSize: 28, fontWeight: '800', color: '#E8604C', marginBottom: 4 },
  aboutVersion: { fontSize: 13, color: '#1A2332', opacity: 0.4, marginBottom: 16 },
  aboutDesc: { fontSize: 14, color: '#1A2332', opacity: 0.6, textAlign: 'center', lineHeight: 20 },
  aboutDivider: { height: 1, backgroundColor: '#C4B8A0', width: '100%', marginVertical: 20 },
  aboutTeamLabel: { fontSize: 11, fontWeight: '700', color: '#1A2332', opacity: 0.4, letterSpacing: 1, marginBottom: 10 },
  aboutTeam: { fontSize: 15, color: '#1A2332', fontWeight: '500', marginBottom: 4 },
  aboutCloseBtn: {
    marginTop: 24,
    backgroundColor: '#E8604C',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 40,
  },
  aboutCloseBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
