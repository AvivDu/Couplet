import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import {
  Animated,
  Dimensions,
  View,
  StyleSheet,
  FlatList,
  Modal,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Text } from '../../components/rn';
import { Ionicons } from '@expo/vector-icons';
import { CATEGORY_DEFS, SORT_OPTIONS, sortCoupons, type SortOption } from '../../constants/categories';
import { getCoupons, getSharedCoupons, updateCoupon, redeemOwnCoupon, deleteCoupon, getInvitations, acceptInvitation, declineInvitation, getNotifications, markNotificationsRead, deleteNotification, clearNotificationCode, type CouponMeta, type SharedCouponMeta, type RedeemAction } from '../../services/api';
import { getCouponCode, saveCouponCode, deleteCouponCode, deleteCouponImage } from '../../storage/couponStorage';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationsContext';
import { useRefreshOnNotification } from '../../hooks/useRefreshOnNotification';
import CouponCard from '../../components/CouponCard';
import CouponDetail from '../../components/CouponDetail';
import NotificationPanel, { type NotificationItem } from '../../components/NotificationPanel';
import AuroraBackground from '../../components/ui/AuroraBackground';
import ScreenHeader from '../../components/ui/ScreenHeader';
import IconButton from '../../components/ui/IconButton';
import SearchField from '../../components/ui/SearchField';
import CategoryTile from '../../components/ui/CategoryTile';
import Chip from '../../components/ui/Chip';
import Sheet from '../../components/ui/Sheet';
import OptionRow from '../../components/ui/OptionRow';
import SectionLabel from '../../components/ui/SectionLabel';
import EmptyState from '../../components/ui/EmptyState';
import Avatar from '../../components/ui/Avatar';
import GlassPanel from '../../components/ui/GlassPanel';
import Button from '../../components/ui/Button';
import { BlurView } from 'expo-blur';
import { colors, glass, blur, radius, fontFamily, fontSize, spacing } from '../../constants/theme';

type CouponWithCode = CouponMeta & { code: string | null };

const DRAWER_WIDTH = Dimensions.get('window').width * 0.48;

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const { bump } = useNotifications();
  const router = useRouter();
  const params = useLocalSearchParams<{ openNotifications?: string }>();
  const [coupons, setCoupons] = useState<CouponMeta[]>([]);
  // Coupons other members shared into the user's groups. Fetched alongside the
  // owned list but surfaced only while searching - see `sharedMatches`.
  const [sharedCoupons, setSharedCoupons] = useState<SharedCouponMeta[]>([]);
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
      const [invitationsResult, serverNotifsResult, sharedResult] = await Promise.allSettled([
        getInvitations(),
        getNotifications(),
        getSharedCoupons(),
      ]);

      const invitations = invitationsResult.status === 'fulfilled' ? invitationsResult.value.data : [];
      const serverNotifData = serverNotifsResult.status === 'fulfilled' ? serverNotifsResult.value.data : [];
      // Tolerated failure, like the two above: a server that predates
      // /coupons/shared-with-me 404s here, and search simply falls back to
      // owned coupons only rather than the whole screen erroring.
      if (sharedResult.status === 'fulfilled') {
        setSharedCoupons(sharedResult.value.data);
      } else {
        console.warn('[search] shared coupons unavailable - searching own coupons only');
        setSharedCoupons([]);
      }

      // Save coupon codes delivered as a fallback - either a first share
      // (group_share) or a silent redelivery after the owner edited the code
      // (coupon_code_sync, see services/couponSharing.ts) - both carry
      // coupon_code the same way and are consumed identically.
      const codeCarryingNotifs = serverNotifData.filter(
        n => n.type === 'group_share' || n.type === 'coupon_code_sync'
      );
      // Counts only - never log the notification object itself: the server
      // returns coupon_code decrypted, so dumping it would put plaintext
      // coupon codes in the device log.
      console.log('[notif] code-carrying:', codeCarryingNotifs.length,
        '| carrying a fallback code:', codeCarryingNotifs.filter(n => n.coupon_code).length);
      const codeDeliveries = codeCarryingNotifs.filter(n => n.coupon_id && n.coupon_code);
      if (codeDeliveries.length > 0) {
        // Editing a code repeatedly while a recipient is offline leaves several
        // rows for the same coupon, so writing them concurrently would race on
        // one storage key and could let an older code win. The server returns
        // newest-first, so the first row per coupon is the current code; save
        // only that, then clear every row since they're all superseded.
        const newestPerCoupon = new Map<string, typeof codeDeliveries[number]>();
        for (const n of codeDeliveries) {
          if (!newestPerCoupon.has(n.coupon_id!)) newestPerCoupon.set(n.coupon_id!, n);
        }
        await Promise.all(
          [...newestPerCoupon.values()].map(n => saveCouponCode(n.coupon_id!, n.coupon_code!))
        );
        // Retire the rows server-side now they've been consumed locally -
        // faster and more precise than waiting on the TTL.
        //
        // group_share rows are kept (code stripped): they're real history, the
        // user saw "X shared a coupon with you". coupon_code_sync rows are
        // invisible carriers with nothing left to say once consumed, and every
        // code edit makes another - left behind they'd eat slots in the newest-50
        // fetch and push genuine notifications out of the panel.
        await Promise.all(
          codeDeliveries.map(n =>
            (n.type === 'coupon_code_sync'
              ? deleteNotification(n.notification_id)
              : clearNotificationCode(n.notification_id)
            ).catch(err =>
              // Best-effort tidy-up: the code is already saved locally, so a
              // failure here must not reject and fail the whole load().
              console.warn('[notif] could not retire delivered code row', n.notification_id, err?.message ?? err)
            )
          )
        );
        console.log('[notif] saved fallback codes for coupon_ids:', [...newestPerCoupon.keys()]);
      }

      // Delete local coupon codes for any revoked coupons
      const revokedCouponIds = serverNotifData
        .filter(n => n.type === 'coupon_revoked' && n.coupon_id)
        .map(n => n.coupon_id!);
      if (revokedCouponIds.length > 0) {
        await Promise.all(revokedCouponIds.map(id => deleteCouponCode(id)));
      }

      // Map server notifications; group_invite type gets Accept/Decline action
      // buttons. coupon_code_sync is an internal carrier row only (a silent
      // code redelivery, consumed above) - it's never meant to be seen, so it
      // never becomes a panel row.
      const serverNotifs: NotificationItem[] = serverNotifData
        .filter(n => n.type !== 'coupon_code_sync')
        .map(n => ({
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

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  // A tapped group-invite banner/OS notification lands here (see
  // NotificationsContext's dismissAndNavigate) instead of jumping straight
  // into the group, so the invite can only be accepted/declined explicitly.
  //
  // Kept out of the focus effect above on purpose: clearing the param is itself
  // a param change, so having both in one effect made it re-run and fire a
  // second load() on every invite tap. This only depends on the param.
  useEffect(() => {
    if (params.openNotifications !== '1') return;
    setNotifPanelOpen(true);
    router.setParams({ openNotifications: undefined });
  }, [params.openNotifications]);

  // Live refresh: re-runs load() on every incoming notification/WebRTC event
  // so the list updates instantly without a manual screen refresh.
  useRefreshOnNotification(load);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const query = search.trim().toLowerCase();

  const filtered = coupons
    .filter(c => filter === 'All' || c.category === filter)
    .filter(c => !query || c.store_name.toLowerCase().includes(query));

  const displayed = sortCoupons(filtered, sort);

  // Shared coupons surface only while searching. Folding them into the default
  // list would turn Home from "my coupons" into "every coupon in every group I
  // am in", which is what the Groups tab is for - the ask was a search that can
  // reach them, not a merged inbox.
  //
  // Matches on the sharer's name as well as the store, since "what did Dana
  // send me" is the other natural way to look for someone else's coupon.
  const sharedMatches = query
    ? sharedCoupons
        .filter(c => filter === 'All' || c.category === filter)
        .filter(c =>
          c.store_name.toLowerCase().includes(query) ||
          (c.shared_by?.username ?? '').toLowerCase().includes(query)
        )
    : [];

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

  async function handleRedeem(id: string, action: RedeemAction) {
    const { data } = await redeemOwnCoupon(id, action);
    setCoupons(prev => prev.map(c => c.coupon_id === id ? data : c));
    // Local mutation, not a live notification - bump so any other mounted
    // screen (e.g. a group screen showing this shared coupon) picks it up.
    // Keyed off the server's resulting status, so a partial redeem that
    // happens to drain the balance also refreshes.
    if (data.status === 'used') bump();
    return data;
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

  // A shared coupon opens its group, not the local detail sheet. Home's detail
  // sheet redeems through redeemOwnCoupon (owner-only, 403 for a member), and
  // the code for a shared coupon lives under the group screen's pickup logic -
  // so the group screen is the one place that already handles all of it.
  function openSharedCoupon(coupon: SharedCouponMeta) {
    // groups is non-empty by construction: the coupon only appears here because
    // it was found inside one of the caller's groups.
    const group = coupon.groups[0];
    if (group) router.push(`/group/${group.group_id}`);
  }

  function handleUpdate(updated: CouponMeta, newCode: string) {
    setCoupons(prev => prev.map(c => c.coupon_id === updated.coupon_id ? updated : c));
    setCouponCodes(prev => ({ ...prev, [updated.coupon_id]: newCode }));
    setSelected({ ...updated, code: newCode });
    // Covers edit-save (redeem already bumps itself via handleRedeem).
    // pushCouponUpdated deliberately excludes the actor - the editing device
    // doesn't need a round-trip to know about its own edit - which means
    // nothing else refreshes this device's OTHER open screens (e.g. the
    // Groups tab) unless something local does it.
    bump();
  }

  function openDrawer() {
    setDrawerOpen(true);
    Animated.timing(drawerAnim, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }

  function closeDrawer(cb?: () => void) {
    Animated.timing(drawerAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setDrawerOpen(false);
      cb?.();
    });
  }

  function openSortMenu() {
    setSortMenuOpen(true);
  }

  function closeSortMenu() {
    setSortMenuOpen(false);
  }

  return (
    <AuroraBackground>
      <View style={styles.container}>
        <ScreenHeader
          title="My Coupons"
          subtitle={`Hi, ${user?.username ?? ''} 👋`}
          actions={
            <>
              <IconButton label="Notifications" badge={unreadCount > 0} onPress={handleBellPress}>
                <Ionicons name="notifications-outline" size={20} color={colors.coral500} />
              </IconButton>
              <IconButton label="Settings" variant="bare" onPress={openDrawer}>
                <Ionicons name="settings-outline" size={20} color={colors.textStrong} />
              </IconButton>
            </>
          }
        />

        {/* Search bar */}
        <View style={styles.searchWrap}>
          <SearchField
            value={search}
            onChangeText={setSearch}
            onClear={() => setSearch('')}
            autoCapitalize="none"
            returnKeyType="search"
          />
        </View>

        {/* Category tiles - horizontal scroll */}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={CATEGORY_DEFS}
          keyExtractor={cat => cat.filter}
          style={styles.categoryScrollView}
          contentContainerStyle={styles.categoryScroll}
          renderItem={({ item: cat }) => (
            <CategoryTile
              label={cat.label}
              category={cat.filter}
              icon={cat.icon}
              active={filter === cat.filter}
              onPress={() => setFilter(cat.filter)}
              style={styles.categoryTile}
            />
          )}
        />

        {/* Sort chip */}
        <View style={styles.sortRow}>
          <Chip
            icon={<Ionicons name="funnel-outline" size={15} color={sort ? colors.coral400 : colors.textStrong} />}
            active={!!sort}
            onDismiss={() => setSort(null)}
            onPress={openSortMenu}
          >
            {activeSortLabel ?? 'Sort'}
          </Chip>
        </View>

        <SectionLabel count={displayed.length}>Wallet</SectionLabel>

        {/* Coupon list */}
        <FlatList
          data={displayed}
          keyExtractor={c => c.coupon_id}
          renderItem={({ item }) => (
            <CouponCard
              store={item.store_name}
              category={item.category}
              balance={item.balance}
              expires={item.expiration_date ? new Date(item.expiration_date).toLocaleDateString() : undefined}
              status={item.status as 'active' | 'used' | 'expired'}
              onPress={() => openDetail(item)}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.stackCard }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.coral400} />}
          ListEmptyComponent={
            // Suppressed when the search found shared coupons - the footer below
            // is showing results, so "No coupons here" would contradict them.
            sharedMatches.length > 0 ? null : (
              <EmptyState
                icon="pricetags-outline"
                title="No coupons here"
                hint={search ? `Nothing matches "${search}"` : 'Add your first coupon to get started'}
              />
            )
          }
          ListFooterComponent={
            sharedMatches.length === 0 ? null : (
              <View style={styles.sharedSection}>
                <SectionLabel count={sharedMatches.length}>Shared with you</SectionLabel>
                {sharedMatches.map(c => (
                  <View key={c.coupon_id} style={styles.sharedCard}>
                    <CouponCard
                      store={c.store_name}
                      category={c.category}
                      balance={c.balance}
                      expires={c.expiration_date ? new Date(c.expiration_date).toLocaleDateString() : undefined}
                      status={c.status as 'active' | 'used' | 'expired'}
                      sender={c.shared_by?.username ?? 'A member'}
                      senderImage={c.shared_by?.image ?? null}
                      sharedAt={
                        c.groups.length > 1
                          ? `${c.groups[0].name} +${c.groups.length - 1}`
                          : c.groups[0]?.name
                      }
                      onPress={() => openSharedCoupon(c)}
                    />
                  </View>
                ))}
              </View>
            )
          }
          contentContainerStyle={
            displayed.length === 0 && sharedMatches.length === 0
              ? styles.emptyContainer
              : styles.listContainer
          }
        />

        {/* Sort menu */}
        <Sheet title="Sort by" open={sortMenuOpen} onClose={closeSortMenu}>
          {SORT_OPTIONS.map((opt, i) => {
            const active = sort === opt.value;
            return (
              <OptionRow
                key={opt.value}
                icon={<Ionicons name={opt.icon} size={20} color={active ? colors.coral400 : colors.textStrong} />}
                label={opt.label}
                selected={active}
                divider={i < SORT_OPTIONS.length - 1}
                onPress={() => { setSort(active ? null : opt.value); closeSortMenu(); }}
              />
            );
          })}
        </Sheet>

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
              {/* Backdrop - rendered first so the box sits on top and receives touches first */}
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
          onRedeem={handleRedeem}
          onUpdate={handleUpdate}
        />

        {/* Settings Drawer */}
        {drawerOpen && (
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
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
              <BlurView pointerEvents="none" intensity={blur.l} tint="light" style={StyleSheet.absoluteFill} />
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: glass.thick }]} />
              <View style={styles.drawerHeader}>
                <Avatar
                  initials={(user?.username ?? '').slice(0, 2).toUpperCase()}
                  src={user?.profile_image}
                  size="xxl"
                />
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
                  onPress={() => closeDrawer(() => router.push('/gmail-scan'))}
                >
                  <Ionicons name="mail-outline" size={20} color="#1A2332" />
                  <Text style={styles.drawerItemText}>Scan Gmail for Coupons</Text>
                </TouchableOpacity>
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
                  <Ionicons name="log-out-outline" size={20} color={colors.stateDanger} />
                  <Text style={[styles.drawerItemText, { color: colors.stateDanger }]}>Log Out</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>
        )}

        {/* About modal */}
        <Modal visible={aboutVisible} animationType="fade" transparent onRequestClose={() => setAboutVisible(false)}>
          <View style={styles.aboutOverlay}>
            <GlassPanel tint="thick" radius={radius['2xl']} padding={spacing.s14} style={{ width: '100%' }}>
              <Text style={styles.aboutTitle}>Couplet</Text>
              <Text style={styles.aboutVersion}>Version 1.0.0</Text>
              <Text style={styles.aboutDesc}>Your personal coupon wallet - store, manage, and share coupons securely. Coupon codes never leave your device.</Text>
              <View style={styles.aboutDivider} />
              <Text style={styles.aboutTeamLabel}>BUILT BY</Text>
              <Text style={styles.aboutTeam}>Aviv Duzy</Text>
              <Text style={styles.aboutTeam}>Roni Kenigsberg</Text>
              <Text style={styles.aboutTeam}>Doron Shen-Tzur</Text>
              <Button variant="primary" block onPress={() => setAboutVisible(false)} style={{ marginTop: 24 }}>
                Close
              </Button>
            </GlassPanel>
          </View>
        </Modal>
      </View>
    </AuroraBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchWrap: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  categoryScrollView: { flexGrow: 0, flexShrink: 0 },
  categoryScroll: { paddingHorizontal: 20, paddingBottom: 4, gap: 10 },
  categoryTile: {},
  sortRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
  },
  listContainer: { paddingHorizontal: 20, paddingBottom: 130 },
  // Sits inside the list's own horizontal padding, so no extra inset here -
  // only the breathing room that separates it from the owned results above.
  sharedSection: { marginTop: spacing.s10 },
  sharedCard: { marginBottom: spacing.stackCard },
  emptyContainer: { flex: 1, justifyContent: 'center' },
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
    shadowColor: colors.ink900,
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
  drawerOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(26,35,50,0.45)' },
  drawer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    paddingTop: 56,
    paddingBottom: 32,
    shadowColor: colors.ink900,
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
    borderBottomColor: colors.lineSoft,
    gap: spacing.s5,
  },
  drawerUsername: { fontFamily: fontFamily.uiBold, fontSize: 16, color: colors.textStrong },
  drawerProfileBtn: {
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.coral400,
    paddingVertical: 7,
    paddingHorizontal: 16,
  },
  drawerProfileBtnText: { fontFamily: fontFamily.uiSemibold, fontSize: 13, color: colors.coral400 },
  drawerBody: { flex: 1, paddingTop: 16, paddingHorizontal: 8 },
  drawerFooter: {
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
    paddingTop: 12,
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: radius.s,
  },
  drawerItemText: { fontFamily: fontFamily.ui, fontSize: fontSize.body, color: colors.textStrong },
  // About modal
  aboutOverlay: {
    flex: 1,
    backgroundColor: 'rgba(26,35,50,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  aboutTitle: { fontFamily: fontFamily.display, fontSize: 28, color: colors.coral400, marginBottom: 4, textAlign: 'center' },
  aboutVersion: { fontFamily: fontFamily.ui, fontSize: 13, color: colors.textStrong, opacity: 0.4, marginBottom: 16, textAlign: 'center' },
  aboutDesc: { fontFamily: fontFamily.ui, fontSize: 14, color: colors.textStrong, opacity: 0.6, textAlign: 'center', lineHeight: 20 },
  aboutDivider: { height: 1, backgroundColor: colors.lineStrong, width: '100%', marginVertical: 20 },
  aboutTeamLabel: { fontFamily: fontFamily.uiBold, fontSize: 11, color: colors.textStrong, opacity: 0.4, letterSpacing: 1, marginBottom: 10, textAlign: 'center' },
  aboutTeam: { fontFamily: fontFamily.ui, fontSize: 15, color: colors.textStrong, marginBottom: 4, textAlign: 'center' },
});
