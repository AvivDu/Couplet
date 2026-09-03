import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Keyboard,
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
} from 'react-native';
import { Text } from '../../components/rn';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Contacts from 'expo-contacts';
import { Ionicons } from '@expo/vector-icons';
import {
  getGroup,
  addMember,
  matchContacts,
  removeMember,
  revokeFromGroup,
  leaveGroup,
  searchUsers,
  cancelInvitation,
  redeemGroupCoupon,
  getCoupons,
  renameGroup,
  setGroupPhoto,
  deleteGroup,
  getNotifications,
  clearNotificationCode,
  deleteNotification,
} from '../../services/api';
import type { GroupDetail as GroupDetailType, GroupMember, CouponMeta, ContactMatch, GroupCoupon, RedeemAction } from '../../services/api';

type ContactMatchWithName = ContactMatch & { contactName: string };
import { getCouponCode, saveCouponCode } from '../../storage/couponStorage';
import { inspectShareable, shareWarning, deliverCouponCode } from '../../services/couponSharing';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationsContext';
import { useRefreshOnNotification } from '../../hooks/useRefreshOnNotification';
import CouponDetail from '../../components/CouponDetail';
import type { CouponWithCode } from '../../components/CouponDetail/types';
import { CATEGORY_DEFS, SORT_OPTIONS, sortCoupons, type SortOption } from '../../constants/categories';
import { formatBalance } from '../../utils/format';
import AuroraBackground from '../../components/ui/AuroraBackground';
import ScreenHeader from '../../components/ui/ScreenHeader';
import IconButton from '../../components/ui/IconButton';
import Avatar from '../../components/ui/Avatar';
import MemberStrip, { type StripMember } from '../../components/ui/MemberStrip';
import SectionLabel from '../../components/ui/SectionLabel';
import Button from '../../components/ui/Button';
import Sheet from '../../components/ui/Sheet';
import CategoryTile from '../../components/ui/CategoryTile';
import OptionRow from '../../components/ui/OptionRow';
import Chip from '../../components/ui/Chip';
import GlassPanel from '../../components/ui/GlassPanel';
import Input from '../../components/ui/Input';
import CouponCard from '../../components/CouponCard';
import { colors as theme } from '../../constants/theme';

// ── Design tokens (group page redesign) ───────────────────────────
// Reuses the app's established palette; handoff-specific values (sender
// accents, tag tile, coralPale) added where the app had no equivalent.
const COLORS = {
  bg: '#F5F0E6',
  cardWhite: '#FFFFFF',
  coral: '#E8604C',
  coralDeep: '#D85A3C',
  coralPale: '#FCE5DC',
  ink: '#1A2332',
  muted: '#A8997A',
  divider: 'rgba(26,35,50,0.08)',
  tag: '#D6A77A',
  tagTile: 'rgba(214,167,122,0.18)',
  otherAvatar: '#E07A5F',
};
// WhatsApp-style per-sender colored names, assigned by member index.
const SENDER_ACCENTS = ['#1F7A8C', '#7A4FB7', '#2E8B57', '#C77B30', '#B83A5E'];

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : null;
  const { user } = useAuth();
  const { sendSignal, bump } = useNotifications();

  const [group, setGroup] = useState<GroupDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingPhoto, setSavingPhoto] = useState(false);

  const [settingsSheetVisible, setSettingsSheetVisible] = useState(false);
  const [membersSheetVisible, setMembersSheetVisible] = useState(false);
  const [inviteSheetVisible, setInviteSheetVisible] = useState(false);
  const [memberQuery, setMemberQuery] = useState('');
  const [suggestions, setSuggestions] = useState<GroupMember[]>([]);
  const [addingMember, setAddingMember] = useState(false);
  const [couponPickerVisible, setCouponPickerVisible] = useState(false);
  const [myCoupons, setMyCoupons] = useState<CouponMeta[]>([]);
  const [sharingCouponId, setSharingCouponId] = useState<string | null>(null);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [contactsSheetVisible, setContactsSheetVisible] = useState(false);
  const [contactMatches, setContactMatches] = useState<ContactMatchWithName[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [invitingContactUserId, setInvitingContactUserId] = useState<string | null>(null);
  const [selectedCoupon, setSelectedCoupon] = useState<CouponWithCode | null>(null);
  const [loadingCouponId, setLoadingCouponId] = useState<string | null>(null);

  // Filter sheet - by sender (member) and/or category.
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [filterMember, setFilterMember] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [filterSort, setFilterSort] = useState<SortOption | null>(null);

  const isAdmin = group?.admin_user_id === user?.userId;

  // `silent` skips the error alert for background refreshes (live-notification
  // updates, refocusing an already-loaded screen) where the user isn't
  // actively waiting on this call and a transient failure shouldn't interrupt
  // them - they'll just see stale data until the next successful refresh.
  // Explicit user actions (rename, share, invite, ...) call this with the
  // default so a real failure still surfaces.
  const fetchGroup = useCallback(async (opts?: { silent?: boolean }) => {
    if (!groupId) return;
    try {
      const { data } = await getGroup(groupId);
      setGroup(data);
    } catch (err: any) {
      // Always log, even when silent. A silent refresh that fails leaves the
      // screen on stale data with nothing on-screen to say so - which looks
      // exactly like a rendering bug (e.g. a status badge "not appearing")
      // when it's really a refresh that never landed.
      console.warn('[group] refresh failed:', err?.response?.status ?? '', err?.message ?? err);
      if (!opts?.silent) Alert.alert('Error', 'Could not load group details.');
    }
  }, [groupId]);

  const refreshGroupSilently = useCallback(() => {
    fetchGroup({ silent: true });
  }, [fetchGroup]);

  // Manual escape hatch. Everything here also refreshes live (notifications)
  // and on focus, but when any of that misses - socket dropped, app resumed
  // late, another member acted while this screen sat open - the user was
  // otherwise stuck looking at stale data with no way to force an update.
  // Not silent: the user asked for this one, so a failure has to surface
  // rather than leaving them pulling repeatedly at unchanged data.
  const handlePullRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchGroup();
    setRefreshing(false);
  }, [fetchGroup]);

  useEffect(() => {
    if (!groupId) return;
    setLoading(true);
    fetchGroup().finally(() => setLoading(false));
  }, [groupId, fetchGroup]);

  // Refetching on focus (no spinner) fixes the group page being mount-only -
  // returning to an already-open group after data changed elsewhere left it
  // stale until fully remounted. Skips the initial focus (mount), which the
  // effect above already covers with its own spinner + error alert.
  const hasMountedRef = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!hasMountedRef.current) { hasMountedRef.current = true; return; }
    refreshGroupSilently();
  }, [refreshGroupSilently]));

  // Live refresh: a group_invite/group_share/coupon_revoked notification can
  // change this group's member list or coupon list while the page is open.
  useRefreshOnNotification(refreshGroupSilently);

  useEffect(() => {
    if (!memberQuery.trim()) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const { data } = await searchUsers(memberQuery.trim());
        setSuggestions(data);
      } catch {
        setSuggestions([]);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [memberQuery]);

  async function handlePickImage() {
    if (!isAdmin || !groupId) return;
    try {
      // Match the rest of the app: request library permission explicitly first.
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow photo library access in Settings.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      if (result.canceled || !result.assets[0]) return;
      console.log('[group photo] picked', result.assets[0].uri);

      setSavingPhoto(true);
      const prevImage = group?.image ?? null;
      try {
        // Resize to a small square so the base64 stays tiny - well under DynamoDB's
        // 400KB item limit - and is cheap for every member to fetch.
        // Modern contextual API (manipulateAsync is deprecated in SDK 54).
        const ctx = ImageManipulator.manipulate(result.assets[0].uri);
        ctx.resize({ width: 256, height: 256 });
        const ref = await ctx.renderAsync();
        const out = await ref.saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
        if (!out.base64) throw new Error('image encode produced no base64');
        console.log('[group photo] resized, base64 length', out.base64.length);
        const dataUrl = `data:image/jpeg;base64,${out.base64}`;
        // Optimistic update so the new photo shows immediately.
        setGroup(g => (g ? { ...g, image: dataUrl } : g));
        await setGroupPhoto(groupId, dataUrl);
        console.log('[group photo] uploaded ok');
      } catch (err: any) {
        console.error('[group photo] failed', err);
        setGroup(g => (g ? { ...g, image: prevImage } : g));
        const detail = err?.response?.data?.error ?? err?.message ?? 'Could not update group photo.';
        // Defer so the alert isn't dropped while the picker is still dismissing (iOS).
        setTimeout(() => Alert.alert('Error', detail), 400);
      } finally {
        setSavingPhoto(false);
      }
    } catch (err: any) {
      console.error('[group photo] picker error', err);
      setTimeout(() => Alert.alert('Error', err?.message ?? 'Could not open the photo library.'), 400);
    }
  }

  async function handleAddMember(identifier: string) {
    if (!groupId) return;
    setAddingMember(true);
    try {
      await addMember(groupId, identifier);
      setMemberQuery('');
      setSuggestions([]);
      setInviteSheetVisible(false);
      await fetchGroup();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not invite member.');
    } finally {
      setAddingMember(false);
    }
  }

  async function handleRemoveMember(member: GroupMember) {
    if (!groupId) return;
    Alert.alert('Remove member', `Remove ${member.username} from this group?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeMember(groupId, member.user_id);
            await fetchGroup();
          } catch (err: any) {
            Alert.alert('Error', err?.response?.data?.error ?? 'Could not remove member.');
          }
        },
      },
    ]);
  }

  async function handleCancelInvite(member: GroupMember) {
    if (!groupId) return;
    Alert.alert('Cancel invitation', `Cancel invite for ${member.username}?`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Cancel invite',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelInvitation(groupId, member.user_id);
            await fetchGroup();
          } catch (err: any) {
            Alert.alert('Error', err?.response?.data?.error ?? 'Could not cancel invitation.');
          }
        },
      },
    ]);
  }

  async function handleRenameGroup() {
    if (!groupId || !newGroupName.trim()) return;
    setRenaming(true);
    try {
      const { data } = await renameGroup(groupId, newGroupName.trim());
      setGroup(prev => (prev ? { ...prev, name: data.name } : prev));
      setRenameModalVisible(false);
      setNewGroupName('');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not rename group.');
    } finally {
      setRenaming(false);
    }
  }

  async function handleDeleteGroup() {
    if (!groupId) return;
    setDeleting(true);
    try {
      await deleteGroup(groupId);
      setDeleteConfirmVisible(false);
      router.replace('/(tabs)/connections');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not delete group.');
    } finally {
      setDeleting(false);
    }
  }

  async function handleLeaveGroup() {
    if (!groupId) return;
    Alert.alert(
      'Leave group',
      `Leave "${group?.name}"? Your shared coupons will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveGroup(groupId);
              router.replace('/(tabs)/connections');
            } catch (err: any) {
              Alert.alert('Error', err?.response?.data?.error ?? 'Could not leave group.');
            }
          },
        },
      ]
    );
  }

  async function handleRevokeCoupon(couponId: string) {
    if (!groupId) return;
    Alert.alert('Remove coupon', 'Remove this coupon from the group?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await revokeFromGroup(groupId, couponId);
            await fetchGroup();
          } catch (err: any) {
            Alert.alert('Error', err?.response?.data?.error ?? 'Could not remove coupon.');
          }
        },
      },
    ]);
  }

  async function handleOpenCouponPicker() {
    setSettingsSheetVisible(false);
    try {
      const { data } = await getCoupons();
      setMyCoupons(data.filter(c => c.status === 'active'));
      setCouponPickerVisible(true);
    } catch {
      Alert.alert('Error', 'Could not load your coupons.');
    }
  }

  async function handleShareCoupon(couponId: string) {
    if (!groupId) return;
    // Nothing to send for this coupon, or only something that reaches part of
    // the group? Say so before sharing, rather than letting the recipient open
    // an empty coupon with no explanation.
    const info = await inspectShareable(
      couponId,
      myCoupons.find(c => c.coupon_id === couponId)?.giftcard_url
    );
    const warning = shareWarning(info);
    if (warning) {
      Alert.alert('Share anyway?', warning, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Share anyway', onPress: () => shareCouponNow(couponId, info.code) },
      ]);
      return;
    }
    await shareCouponNow(couponId, info.code);
  }

  async function shareCouponNow(couponId: string, code: string | null) {
    if (!groupId) return;
    setSharingCouponId(couponId);
    try {
      const data = await deliverCouponCode(sendSignal, groupId, couponId, code);
      console.log(
        '[share] online recipients:', data.online_recipient_ids ?? [],
        '- offline members get the encrypted DB fallback instead'
      );
      await fetchGroup();
      setCouponPickerVisible(false);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not share coupon.');
    } finally {
      setSharingCouponId(null);
    }
  }

  function normalizePhone(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    // +972 5X... → 05X...
    if (digits.startsWith('972') && digits.length >= 12) return '0' + digits.slice(3);
    return digits;
  }

  async function handleOpenContacts() {
    setInviteSheetVisible(false);
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Couplet needs contact access to find your friends.');
      return;
    }
    setContactsSheetVisible(true);
    setContactsLoading(true);
    try {
      const { data: deviceContacts } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
      });
      const phoneToName: Record<string, string> = {};
      for (const c of deviceContacts) {
        for (const p of c.phoneNumbers ?? []) {
          const normalized = normalizePhone(p.number ?? '');
          if (normalized) phoneToName[normalized] = c.name ?? 'Unknown';
        }
      }
      const allPhones = Object.keys(phoneToName);
      if (allPhones.length === 0) { setContactMatches([]); return; }
      const serverMatches = await matchContacts(allPhones);
      const existingIds = new Set([
        ...(group?.members.map(m => m.user_id) ?? []),
        ...(group?.pending_members.map(m => m.user_id) ?? []),
      ]);
      setContactMatches(
        serverMatches
          .filter(m => !existingIds.has(m.user_id))
          .map(m => ({ ...m, contactName: phoneToName[m.phone_number] ?? m.username }))
      );
    } catch {
      Alert.alert('Error', 'Could not load contacts.');
      setContactsSheetVisible(false);
    } finally {
      setContactsLoading(false);
    }
  }

  async function handleInviteContact(match: ContactMatchWithName) {
    if (!groupId) return;
    setInvitingContactUserId(match.user_id);
    try {
      await addMember(groupId, match.email);
      setContactMatches(prev => prev.filter(m => m.user_id !== match.user_id));
      await fetchGroup();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not invite.');
    } finally {
      setInvitingContactUserId(null);
    }
  }

  async function handleOpenCouponDetail(coupon: GroupCoupon) {
    if (loadingCouponId === coupon.coupon_id) return;
    setLoadingCouponId(coupon.coupon_id);
    try {
      let code = await getCouponCode(coupon.coupon_id);
      try {
        const { data: notifications } = await getNotifications();
        // group_share is only a first-time fallback (skip once a local code
        // exists). coupon_code_sync means the owner edited the code, so it
        // must win even when a - now stale - local code already exists;
        // it's checked unconditionally, not gated behind `!code`.
        const delivery = notifications.find(n =>
          n.coupon_id === coupon.coupon_id && n.coupon_code &&
          (n.type === 'coupon_code_sync' || (n.type === 'group_share' && !code))
        );
        if (delivery?.coupon_code) {
          await saveCouponCode(coupon.coupon_id, delivery.coupon_code);
          code = delivery.coupon_code;
          // Retire the row server-side now it's been consumed locally. Sync
          // rows are invisible carriers with nothing left to say, and each code
          // edit makes another, so they're deleted rather than left to eat
          // slots in the newest-50 fetch; group_share rows are real history and
          // just lose their code. Same rule as index.tsx's load().
          await (delivery.type === 'coupon_code_sync'
            ? deleteNotification(delivery.notification_id)
            : clearNotificationCode(delivery.notification_id)
          ).catch(err =>
            // Best-effort tidy-up: the code is already saved locally, so a
            // failure here must not stop the coupon from opening.
            console.warn('[notif] could not retire delivered code row', delivery.notification_id, err?.message ?? err)
          );
        }
      } catch {
        // network failure - open modal with whatever code is already local
      }
      setSelectedCoupon({ ...coupon, created_at: '', code });
    } finally {
      setLoadingCouponId(null);
    }
  }

  async function handleGroupRedeem(couponId: string, action: RedeemAction) {
    if (!groupId) throw new Error('No group id');
    const { data: updated } = await redeemGroupCoupon(groupId, couponId, action);
    setGroup(prev => prev
      ? { ...prev, coupons: prev.coupons.map(c => c.coupon_id === couponId ? { ...c, ...updated } : c) }
      : prev);
    // Local mutation, not a live notification - bump so any other mounted
    // screen (e.g. My Coupons for the owner) picks it up. Keyed off the
    // server's resulting status, so a partial redeem that happens to drain
    // the balance also refreshes.
    if (updated.status === 'used') bump();
    return updated;
  }

  function getInitials(name: string) {
    return name.slice(0, 2).toUpperCase();
  }

  function firstName(name: string) {
    return name.split(' ')[0];
  }

  // Stable accent color per sender, by member index (cycling).
  function accentFor(ownerId: string) {
    const i = group?.members.findIndex(m => m.user_id === ownerId) ?? -1;
    return SENDER_ACCENTS[Math.max(0, i) % SENDER_ACCENTS.length];
  }

  // The invite/rename dialogs are centred in a full-screen overlay, so the keyboard
  // covers their lower half. KeyboardAvoidingView measures its own parent-relative
  // frame and gets the offset wrong for an absolutely-filled overlay - taking the
  // height straight off the keyboard event is exact on both platforms.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, e => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  function closeInviteSheet() {
    setInviteSheetVisible(false);
    setMemberQuery('');
    setSuggestions([]);
  }

  // Derived: filtered + sorted coupon feed (category + member filter, then sort).
  const filteredCoupons = useMemo(() => {
    if (!group) return [];
    const filtered = group.coupons.filter(c => {
      if (filterMember && c.owner_id !== filterMember) return false;
      if (filterCategory !== 'All' && c.category !== filterCategory) return false;
      return true;
    });
    return sortCoupons(filtered, filterSort);
  }, [group, filterMember, filterCategory, filterSort]);

  const hasFilter = filterMember !== null || filterCategory !== 'All' || filterSort !== null;

  function clearFilters() {
    setFilterMember(null);
    setFilterCategory('All');
    setFilterSort(null);
  }

  function openFilterSheet() {
    setFilterSheetVisible(true);
  }

  function closeFilterSheet() {
    setFilterSheetVisible(false);
  }

  if (!user) return null;

  const memberStripData: StripMember[] = group
    ? group.members.map(m => ({
        id: m.user_id,
        name: firstName(m.username),
        initials: getInitials(m.username),
        image: m.image,
        color: m.user_id === user.userId ? undefined : accentFor(m.user_id),
        you: m.user_id === user.userId,
      }))
    : [];

  return (
    <AuroraBackground>
      {/* Header - tapping the avatar or the settings gear both open group settings */}
      <ScreenHeader
        back
        onBack={() => router.replace('/(tabs)/connections')}
        title={group?.name ?? ''}
        subtitle="Tap photo to edit"
        leading={
          <TouchableOpacity onPress={() => setSettingsSheetVisible(true)} activeOpacity={0.7} style={styles.headerAvatarWrap}>
            <Avatar
              initials={group ? getInitials(group.name) : ''}
              src={group?.image ?? undefined}
              size="l"
            />
            {savingPhoto && (
              <View style={styles.headerAvatarSaving}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            )}
          </TouchableOpacity>
        }
        actions={
          <IconButton label="Group settings" variant="bare" size="l" onPress={() => setSettingsSheetVisible(true)}>
            <Ionicons name="settings-outline" size={20} color={theme.textStrong} />
          </IconButton>
        }
      />

      {loading || !group ? (
        <ActivityIndicator color={COLORS.coral} style={{ marginTop: 80 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handlePullRefresh}
              tintColor={COLORS.coral}
              colors={[COLORS.coral]}
            />
          }
        >
          {/* Members */}
          <SectionLabel
            count={group.members.length}
            action={
              <TouchableOpacity style={styles.viewAllBtn} onPress={() => setMembersSheetVisible(true)} activeOpacity={0.7}>
                <Text style={styles.viewAllText}>View all</Text>
                <Ionicons name="chevron-forward" size={14} color={COLORS.coral} />
              </TouchableOpacity>
            }
          >
            Members
          </SectionLabel>
          <TouchableOpacity activeOpacity={0.85} onPress={() => setMembersSheetVisible(true)}>
            <MemberStrip
              members={memberStripData}
              showAdd={isAdmin}
              onAdd={() => setInviteSheetVisible(true)}
            />
          </TouchableOpacity>

          {/* Share a Coupon */}
          <View style={styles.shareWrap}>
            <Button variant="primary" size="l" block onPress={handleOpenCouponPicker} icon={<Ionicons name="pricetag-outline" size={20} color="#fff" />}>
              Share a Coupon
            </Button>
          </View>

          {/* Shared Coupons */}
          <SectionLabel
            count={filteredCoupons.length}
            action={
              <IconButton label="Filter" active={hasFilter} onPress={openFilterSheet}>
                <Ionicons name="options-outline" size={18} color={hasFilter ? '#fff' : COLORS.coral} />
              </IconButton>
            }
          >
            Shared coupons
          </SectionLabel>

          {/* Coupon feed */}
          {filteredCoupons.length === 0 ? (
            <Text style={styles.emptyCoupons}>
              {hasFilter
                ? 'No coupons match this filter.'
                : 'No coupons shared to this group yet.'}
            </Text>
          ) : (
            <View style={styles.couponList}>
            {filteredCoupons.map(coupon => {
              const isOwn = coupon.owner_id === user.userId;
              const sender = group.members.find(m => m.user_id === coupon.owner_id);
              const senderLabel = isOwn ? 'You' : sender ? firstName(sender.username) : 'Member';
              const accent = isOwn ? COLORS.coralDeep : accentFor(coupon.owner_id);
              const expiry = coupon.expiration_date
                ? new Date(coupon.expiration_date + 'T00:00:00').toLocaleDateString()
                : undefined;
              const isLoading = loadingCouponId === coupon.coupon_id;
              const isUsed = coupon.status !== 'active';

              return (
                <CouponCard
                  key={coupon.coupon_id}
                  store={coupon.store_name}
                  category={coupon.category}
                  balance={isUsed ? null : coupon.balance}
                  expires={expiry}
                  status={coupon.status as 'active' | 'used' | 'expired'}
                  sender={senderLabel}
                  senderColor={accent}
                  senderImage={sender?.image}
                  senderTrailing={isAdmin && !isOwn ? (
                    <TouchableOpacity
                      onPress={() => handleRevokeCoupon(coupon.coupon_id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={16} color={COLORS.muted} />
                    </TouchableOpacity>
                  ) : undefined}
                  onPress={() => handleOpenCouponDetail(coupon)}
                  action={isOwn ? (
                    <Button variant="danger" block disabled={isLoading} onPress={() => handleRevokeCoupon(coupon.coupon_id)}>
                      {isLoading ? <ActivityIndicator size="small" color={COLORS.coralDeep} /> : 'Revoke'}
                    </Button>
                  ) : (
                    <Button variant="quiet" block disabled={isLoading || isUsed} onPress={() => handleOpenCouponDetail(coupon)}>
                      {isLoading ? <ActivityIndicator size="small" color={COLORS.coral} /> : isUsed ? 'Used' : 'Use coupon'}
                    </Button>
                  )}
                />
              );
            })}
            </View>
          )}
        </ScrollView>
      )}

      {/* Filter Sheet */}
      <Sheet
        title="Filter Coupons"
        open={filterSheetVisible}
        onClose={closeFilterSheet}
        footer={<Button variant="primary" block onPress={closeFilterSheet}>Done</Button>}
      >
        {hasFilter && (
          <TouchableOpacity onPress={clearFilters} style={styles.clearFilterBtn}>
            <Text style={styles.clearFilterText}>Clear</Text>
          </TouchableOpacity>
        )}
        <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
          <SectionLabel>Category</SectionLabel>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryScroll}
          >
            {CATEGORY_DEFS.map(cat => (
              <CategoryTile
                key={cat.filter}
                label={cat.label}
                category={cat.filter}
                icon={cat.icon}
                active={filterCategory === cat.filter}
                onPress={() => setFilterCategory(cat.filter)}
              />
            ))}
          </ScrollView>

          <SectionLabel>Sort by</SectionLabel>
          {SORT_OPTIONS.map((opt, i) => {
            const active = filterSort === opt.value;
            return (
              <OptionRow
                key={opt.value}
                icon={<Ionicons name={opt.icon} size={20} color={active ? COLORS.coral : COLORS.ink} />}
                label={opt.label}
                selected={active}
                divider={i < SORT_OPTIONS.length - 1}
                onPress={() => setFilterSort(active ? null : opt.value)}
              />
            );
          })}

          <SectionLabel>Member</SectionLabel>
          <View style={styles.chipWrap}>
            {(group?.members ?? []).map(m => {
              const active = filterMember === m.user_id;
              const isYou = m.user_id === user.userId;
              return (
                <Chip key={m.user_id} active={active} onPress={() => setFilterMember(active ? null : m.user_id)}>
                  {isYou ? 'You' : firstName(m.username)}
                </Chip>
              );
            })}
          </View>
        </ScrollView>
      </Sheet>

      {/* Settings Bottom Sheet */}
      <Sheet
        title="Group Settings"
        open={settingsSheetVisible}
        onClose={() => setSettingsSheetVisible(false)}
      >
        {isAdmin && (
          <>
            <OptionRow
              icon={<Ionicons name="image-outline" size={20} color={COLORS.coral} />}
              label="Change Group Photo"
              trailing={<Ionicons name="chevron-forward" size={16} color="#C4B8A0" />}
              onPress={() => {
                // iOS can't present the image picker while the settings sheet is still
                // on screen, so launch it only AFTER the sheet has fully dismissed
                // (via Sheet's onDismiss). Android has no such restriction.
                // iOS can't present the image picker while the sheet's Modal is still
                // mounted, and Sheet unmounts rather than dismissing (so onDismiss never
                // fires) - wait out its 200ms close animation instead.
                setSettingsSheetVisible(false);
                setTimeout(() => handlePickImage(), 350);
              }}
            />
            <OptionRow
              icon={<Ionicons name="pencil-outline" size={20} color={COLORS.coral} />}
              label="Rename Group"
              trailing={<Ionicons name="chevron-forward" size={16} color="#C4B8A0" />}
              onPress={() => {
                setSettingsSheetVisible(false);
                setNewGroupName(group?.name ?? '');
                setRenameModalVisible(true);
              }}
            />
            <OptionRow
              icon={<Ionicons name="trash-outline" size={20} color="#D93025" />}
              label="Delete Group"
              destructive
              divider={false}
              trailing={<Ionicons name="chevron-forward" size={16} color="#C4B8A0" />}
              onPress={() => {
                setSettingsSheetVisible(false);
                setDeleteConfirmVisible(true);
              }}
            />
          </>
        )}

        {!isAdmin && (
          <OptionRow
            icon={<Ionicons name="exit-outline" size={20} color="#D93025" />}
            label="Leave Group"
            destructive
            divider={false}
            trailing={<Ionicons name="chevron-forward" size={16} color="#C4B8A0" />}
            onPress={() => {
              setSettingsSheetVisible(false);
              handleLeaveGroup();
            }}
          />
        )}
      </Sheet>

      {/* Members Bottom Sheet */}
      <Sheet open={membersSheetVisible} onClose={() => setMembersSheetVisible(false)}>
        <View style={styles.membersSheetHeader}>
          <Text style={[styles.sheetTitle, { marginBottom: 0 }]}>
            Members ({group?.members.length ?? 0})
          </Text>
          {isAdmin && (
            <TouchableOpacity
              style={styles.addMemberPill}
              onPress={() => {
                setMembersSheetVisible(false);
                setInviteSheetVisible(true);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.addMemberPillText}>Add</Text>
            </TouchableOpacity>
          )}
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={{ maxHeight: 420 }}
        >
          {(group?.members ?? []).map(member => {
            const isCurrentUser = member.user_id === user.userId;
            const isGroupAdmin = member.user_id === group?.admin_user_id;
            return (
              <View key={member.user_id} style={styles.memberRow}>
                <Avatar initials={getInitials(member.username)} src={member.image} size="m" />
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>
                    {member.username}
                    {isCurrentUser ? ' (you)' : ''}
                  </Text>
                  {member.phone_number ? (
                    <Text style={styles.memberEmail}>{member.phone_number}</Text>
                  ) : null}
                  {isGroupAdmin && (
                    <Text style={styles.adminLabel}>Admin</Text>
                  )}
                </View>
                {isAdmin && !isCurrentUser && !isGroupAdmin && (
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => handleRemoveMember(member)}
                  >
                    <Text style={styles.removeBtnText}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {(group?.pending_members ?? []).length > 0 && (
            <>
              <Text style={[styles.couponsHeaderLabel, { marginTop: 16, marginBottom: 8 }]}>
                PENDING ({group?.pending_members.length})
              </Text>
              {group?.pending_members.map(member => (
                <View key={member.user_id} style={styles.memberRow}>
                  <View style={{ opacity: 0.5 }}>
                    <Avatar initials={getInitials(member.username)} src={member.image} size="m" />
                  </View>
                  <View style={[styles.memberInfo, { opacity: 0.5 }]}>
                    <Text style={styles.memberName}>{member.username}</Text>
                    <Text style={styles.memberEmail}>{member.phone_number ?? member.email}</Text>
                  </View>
                  <View style={[styles.pendingBadge, { opacity: 0.5 }]}>
                    <Text style={styles.pendingBadgeText}>Pending</Text>
                  </View>
                  {isAdmin && (
                    <TouchableOpacity
                      style={styles.cancelInviteBtn}
                      onPress={() => handleCancelInvite(member)}
                    >
                      <Text style={styles.cancelInviteBtnText}>Cancel</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </Sheet>

      {/* Invite Member Dialog - View overlay, not a Modal, for the same reason as the
          rename dialog below: the members sheet is itself a Modal, and opening a second
          one while it closes leaves an invisible Modal on iOS that swallows every touch.
          The KeyboardAvoidingView keeps the centred panel clear of the keyboard. */}
      {inviteSheetVisible && (
        <TouchableOpacity
          style={[StyleSheet.absoluteFill, styles.dialogOverlay, { paddingBottom: keyboardHeight }]}
          activeOpacity={1}
          onPress={closeInviteSheet}
        >
          <View style={styles.dialogPanelWrap} onStartShouldSetResponder={() => true}>
          <GlassPanel tint="thick" radius={24} padding={24}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>Add Member</Text>
              <IconButton label="Close" size="s" onPress={closeInviteSheet}>
                <Ionicons name="close" size={18} color={COLORS.ink} />
              </IconButton>
            </View>
            <Input
              placeholder="Email or username"
              value={memberQuery}
              onChangeText={setMemberQuery}
              autoCapitalize="none"
              autoFocus
              wrapperStyle={{ marginBottom: suggestions.length > 0 ? 12 : 20 }}
            />
            {suggestions.length > 0 && (
              <View style={styles.suggestions}>
                {suggestions.map(s => (
                  <TouchableOpacity
                    key={s.user_id}
                    style={styles.suggestion}
                    onPress={() => {
                      setMemberQuery(s.phone_number ?? s.email);
                      setSuggestions([]);
                    }}
                  >
                    <Text style={styles.suggestionName}>{s.username}</Text>
                    <Text style={styles.suggestionEmail}>{s.phone_number ?? s.email}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <Button
              variant="primary"
              block
              onPress={() => memberQuery.trim() && handleAddMember(memberQuery.trim())}
              disabled={addingMember || !memberQuery.trim()}
              style={{ marginBottom: 12 }}
            >
              {addingMember ? <ActivityIndicator color="#fff" size="small" /> : 'Invite'}
            </Button>
            <Button
              variant="glass"
              block
              onPress={handleOpenContacts}
              icon={<Ionicons name="people-outline" size={16} color={COLORS.coral} />}
            >
              Add from Contacts
            </Button>
          </GlassPanel>
          </View>
        </TouchableOpacity>
      )}

      {/* Rename Dialog - View overlay avoids nested-Modal iOS conflict */}
      {renameModalVisible && (
        <TouchableOpacity
          style={[StyleSheet.absoluteFill, styles.dialogOverlay, { paddingBottom: keyboardHeight }]}
          activeOpacity={1}
          onPress={() => {
            setRenameModalVisible(false);
            setNewGroupName('');
          }}
        >
          <View style={styles.dialogPanelWrap} onStartShouldSetResponder={() => true}>
          <GlassPanel tint="thick" radius={24} padding={24}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>Rename Group</Text>
              <IconButton
                label="Close"
                size="s"
                onPress={() => {
                  setRenameModalVisible(false);
                  setNewGroupName('');
                }}
              >
                <Ionicons name="close" size={18} color={COLORS.ink} />
              </IconButton>
            </View>
            <Input
              placeholder="New group name"
              value={newGroupName}
              onChangeText={setNewGroupName}
              autoFocus
              maxLength={60}
              wrapperStyle={{ marginBottom: 20 }}
            />
            <Button
              variant="primary"
              block
              onPress={handleRenameGroup}
              disabled={!newGroupName.trim() || renaming}
            >
              {renaming ? <ActivityIndicator color="#fff" size="small" /> : 'Save'}
            </Button>
          </GlassPanel>
          </View>
        </TouchableOpacity>
      )}

      {/* Delete Confirmation - View overlay avoids nested-Modal iOS conflict */}
      {deleteConfirmVisible && (
        <TouchableOpacity
          style={[StyleSheet.absoluteFill, styles.dialogOverlay]}
          activeOpacity={1}
          onPress={() => setDeleteConfirmVisible(false)}
        >
          <View style={styles.dialogPanelWrap} onStartShouldSetResponder={() => true}>
          <GlassPanel tint="thick" radius={24} padding={24}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>Delete Group?</Text>
              <IconButton label="Close" size="s" onPress={() => setDeleteConfirmVisible(false)}>
                <Ionicons name="close" size={18} color={COLORS.ink} />
              </IconButton>
            </View>
            <Text style={styles.deleteWarningText}>
              Are you sure you want to delete "{group?.name}"? This action is
              permanent and will remove all members.
            </Text>
            <View style={styles.deleteDialogActions}>
              <View style={styles.deleteDialogCol}>
                <Button variant="ghost" block onPress={() => setDeleteConfirmVisible(false)}>
                  Cancel
                </Button>
              </View>
              <View style={styles.deleteDialogCol}>
                <Button variant="danger" block onPress={handleDeleteGroup} disabled={deleting}>
                  {deleting ? <ActivityIndicator color={theme.stateDanger} size="small" /> : 'Delete'}
                </Button>
              </View>
            </View>
          </GlassPanel>
          </View>
        </TouchableOpacity>
      )}

      {/* Add from Contacts Sheet */}
      <Sheet title="Your Contacts on Couplet" open={contactsSheetVisible} onClose={() => setContactsSheetVisible(false)}>
        {contactsLoading ? (
          <ActivityIndicator color={COLORS.coral} style={{ marginVertical: 32 }} />
        ) : contactMatches.length === 0 ? (
          <Text style={styles.emptyCoupons}>None of your contacts are on Couplet yet.</Text>
        ) : (
          <ScrollView style={{ maxHeight: 420 }}>
            {contactMatches.map(match => (
              <View key={match.user_id} style={styles.memberRow}>
                <Avatar initials={getInitials(match.contactName)} size="m" />
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{match.contactName}</Text>
                  <Text style={styles.memberEmail}>@{match.username}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.inviteContactBtn, invitingContactUserId === match.user_id && { opacity: 0.4 }]}
                  onPress={() => handleInviteContact(match)}
                  disabled={invitingContactUserId === match.user_id}
                  activeOpacity={0.8}
                >
                  {invitingContactUserId === match.user_id
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.inviteContactBtnText}>Invite</Text>}
                </TouchableOpacity>
              </View>
            ))}
            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </Sheet>

      {/* Share Coupon Picker */}
      <Sheet title="Share a Coupon" open={couponPickerVisible} onClose={() => setCouponPickerVisible(false)}>
        <ScrollView style={{ maxHeight: 420 }}>
          {myCoupons.length === 0 ? (
            <Text style={styles.emptyCoupons}>
              No active coupons to share.
            </Text>
          ) : (
            myCoupons.map(coupon => {
              const alreadyShared = group?.coupons.some(
                c => c.coupon_id === coupon.coupon_id
              );
              return (
                <TouchableOpacity
                  key={coupon.coupon_id}
                  style={[
                    styles.couponPickerRow,
                    alreadyShared && styles.couponPickerRowShared,
                  ]}
                  onPress={() =>
                    !alreadyShared && handleShareCoupon(coupon.coupon_id)
                  }
                  disabled={
                    alreadyShared || sharingCouponId === coupon.coupon_id
                  }
                  activeOpacity={alreadyShared ? 1 : 0.75}
                >
                  <View style={styles.couponPickerInfo}>
                    <Text style={styles.couponPickerName}>
                      {coupon.store_name}
                    </Text>
                    <Text style={styles.couponPickerSub}>
                      {coupon.category}
                    </Text>
                  </View>
                  {sharingCouponId === coupon.coupon_id ? (
                    <ActivityIndicator color={COLORS.coral} size="small" />
                  ) : alreadyShared ? (
                    <Text style={styles.alreadySharedText}>Shared</Text>
                  ) : (
                    <Ionicons
                      name="add-circle-outline"
                      size={22}
                      color={COLORS.coral}
                    />
                  )}
                </TouchableOpacity>
              );
            })
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </Sheet>

      {/* Coupon Detail - same experience as My Coupons tab */}
      <CouponDetail
        coupon={selectedCoupon}
        visible={!!selectedCoupon}
        onClose={() => setSelectedCoupon(null)}
        onDelete={() => setSelectedCoupon(null)}
        onRedeem={handleGroupRedeem}
        onUpdate={(updated, newCode) => {
          // Owners can open their own shared coupon from this screen and edit
          // it here, not just from My Coupons - so this needs the same fix:
          // sync the underlying list (not just the open modal) and bump so
          // this device's other screens (e.g. My Coupons) pick it up too.
          // pushCouponUpdated intentionally skips the actor's own devices.
          setSelectedCoupon(prev => prev ? { ...prev, ...updated, code: newCode } : prev);
          setGroup(prev => prev
            ? { ...prev, coupons: prev.coupons.map(c => c.coupon_id === updated.coupon_id ? { ...c, ...updated } : c) }
            : prev);
          bump();
        }}
      />
    </AuroraBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  headerAvatarWrap: { position: 'relative' },
  couponList: { gap: 12, paddingHorizontal: 20 },
  headerAvatar: { width: 44, height: 44, borderRadius: 22 },
  headerAvatarSaving: {
    position: 'absolute',
    left: 0,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(26,35,50,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  body: { paddingBottom: 48 },

  viewAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewAllText: { fontSize: 13, fontWeight: '600', color: COLORS.coral },

  // Share button
  shareWrap: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 14 },

  emptyCoupons: {
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    marginVertical: 24,
    paddingHorizontal: 16,
  },
  // Still used as a generic uppercase section label inside the Members sheet
  // ("PENDING (N)") - not touched by the header/coupon-list redesign.
  couponsHeaderLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  // Filter sheet
  clearFilterBtn: { alignSelf: 'flex-end', marginBottom: 8 },
  clearFilterText: { fontSize: 14, fontWeight: '600', color: COLORS.coral },
  categoryScroll: { gap: 10, paddingBottom: 4, paddingRight: 4, marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16, marginTop: 4 },

  // Settings sheet rows
  sheetTitle: { fontSize: 18, fontWeight: '800', color: COLORS.ink, marginBottom: 16 },

  membersSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  addMemberPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.coral,
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  addMemberPillText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // Member rows in sheet
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.cardWhite,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontWeight: '600', color: COLORS.ink },
  memberEmail: { fontSize: 12, color: COLORS.muted, marginTop: 1 },
  adminLabel: { fontSize: 12, color: COLORS.coral, fontWeight: '600', marginTop: 2 },
  removeBtn: {
    backgroundColor: 'rgba(232,96,76,0.1)',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  removeBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.coral },
  pendingBadge: {
    backgroundColor: '#F5E6A3',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 8,
  },
  pendingBadgeText: { fontSize: 11, fontWeight: '700', color: '#8A7200' },
  cancelInviteBtn: {
    backgroundColor: '#FF5252',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    elevation: 2,
    shadowColor: '#FF5252',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
  },
  cancelInviteBtnText: { fontSize: 13, fontWeight: 'bold', color: '#FFFFFF' },

  // Dialogs
  dialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(26,35,50,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  dialogPanelWrap: { width: '100%' },
  dialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  dialogTitle: { fontSize: 18, fontWeight: '800', color: COLORS.ink },
  suggestions: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginTop: 0,
    marginBottom: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F0EBE0',
  },
  suggestion: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EBE0',
  },
  suggestionName: { fontSize: 14, fontWeight: '600', color: COLORS.ink },
  suggestionEmail: { fontSize: 12, color: COLORS.muted },

  // Delete dialog
  deleteWarningText: {
    fontSize: 14,
    color: COLORS.ink,
    opacity: 0.7,
    lineHeight: 22,
    marginBottom: 24,
  },
  deleteDialogActions: { flexDirection: 'row', gap: 12 },
  deleteDialogCol: { flex: 1 },

  // Coupon picker
  couponPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  couponPickerRowShared: { opacity: 0.5 },
  couponPickerInfo: { flex: 1 },
  couponPickerName: { fontSize: 15, fontWeight: '600', color: COLORS.ink },
  couponPickerSub: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  alreadySharedText: { fontSize: 13, fontWeight: '600', color: COLORS.muted },

  inviteContactBtn: {
    backgroundColor: COLORS.coral,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  inviteContactBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
