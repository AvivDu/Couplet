import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
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
  shareToGroup,
  getCoupons,
  renameGroup,
  setGroupPhoto,
  deleteGroup,
  getNotifications,
} from '../../services/api';
import type { GroupDetail as GroupDetailType, GroupMember, CouponMeta, ContactMatch, GroupCoupon } from '../../services/api';

type ContactMatchWithName = ContactMatch & { contactName: string };
import { getCouponCode, saveCouponCode } from '../../storage/couponStorage';
import { useAuth } from '../../context/AuthContext';
import CouponDetail from '../../components/CouponDetail';
import type { CouponWithCode } from '../../components/CouponDetail/types';
import { CATEGORY_DEFS, SORT_OPTIONS, sortCoupons, type SortOption } from '../../constants/categories';

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

  const [group, setGroup] = useState<GroupDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [pendingPhotoPick, setPendingPhotoPick] = useState(false);

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

  // Filter sheet — by sender (member) and/or category.
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [filterMember, setFilterMember] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [filterSort, setFilterSort] = useState<SortOption | null>(null);

  const isAdmin = group?.admin_user_id === user?.userId;

  const fetchGroup = useCallback(async () => {
    if (!groupId) return;
    try {
      const { data } = await getGroup(groupId);
      setGroup(data);
    } catch {
      Alert.alert('Error', 'Could not load group details.');
    }
  }, [groupId]);

  useEffect(() => {
    if (!groupId) return;
    setLoading(true);
    fetchGroup().finally(() => setLoading(false));
  }, [groupId, fetchGroup]);

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
        // Resize to a small square so the base64 stays tiny — well under DynamoDB's
        // 400KB item limit — and is cheap for every member to fetch.
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
    setSharingCouponId(couponId);
    try {
      const code = await getCouponCode(couponId);
      // The server relays the code live to online members and stores it for
      // offline ones; recipients save it silently. We only send metadata here.
      await shareToGroup(groupId, couponId, code);
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
      if (!code) {
        try {
          const { data: notifications } = await getNotifications();
          const delivery = notifications.find(
            n => n.type === 'group_share' && n.coupon_id === coupon.coupon_id && n.coupon_code
          );
          if (delivery?.coupon_code) {
            await saveCouponCode(coupon.coupon_id, delivery.coupon_code);
            code = delivery.coupon_code;
          }
        } catch {
          // network failure — open modal with null code rather than crashing
        }
      }
      setSelectedCoupon({ ...coupon, created_at: '', code });
    } finally {
      setLoadingCouponId(null);
    }
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

  if (!user) return null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.replace('/(tabs)/connections')}
          style={styles.headerIconBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.ink} />
        </TouchableOpacity>

        {/* The group name is the single entry point to group settings. */}
        <TouchableOpacity
          style={styles.headerCenter}
          onPress={() => setSettingsSheetVisible(true)}
          activeOpacity={0.7}
        >
          {group?.image ? (
            <Image source={{ uri: group.image }} style={styles.headerAvatar} />
          ) : (
            <View style={styles.headerAvatarFallback}>
              <Text style={styles.headerAvatarText}>
                {group ? getInitials(group.name) : ''}
              </Text>
            </View>
          )}
          {savingPhoto && (
            <View style={styles.headerAvatarSaving}>
              <ActivityIndicator size="small" color="#fff" />
            </View>
          )}
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {group?.name ?? ''}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={18} color={COLORS.muted} />
        </TouchableOpacity>
      </View>

      {loading || !group ? (
        <ActivityIndicator color={COLORS.coral} style={{ marginTop: 80 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {/* Members section label */}
          <View style={styles.membersLabelRow}>
            <Text style={styles.membersLabel}>MEMBERS · {group.members.length}</Text>
            <TouchableOpacity
              style={styles.viewAllBtn}
              onPress={() => setMembersSheetVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={styles.viewAllText}>View all</Text>
              <Ionicons name="chevron-forward" size={14} color={COLORS.coral} />
            </TouchableOpacity>
          </View>

          {/* Members strip (horizontal) */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.strip}
          >
            {isAdmin && (
              <TouchableOpacity
                style={styles.stripItem}
                onPress={() => setInviteSheetVisible(true)}
                activeOpacity={0.75}
              >
                <View style={styles.addChip}>
                  <Ionicons name="add" size={22} color={COLORS.coral} />
                </View>
                <Text style={styles.addChipLabel} numberOfLines={1}>Add</Text>
              </TouchableOpacity>
            )}
            {group.members.map(member => {
              const isYou = member.user_id === user.userId;
              return (
                <TouchableOpacity
                  key={member.user_id}
                  style={styles.stripItem}
                  onPress={() => setMembersSheetVisible(true)}
                  activeOpacity={0.75}
                >
                  <View
                    style={[
                      styles.stripAvatar,
                      { backgroundColor: isYou ? COLORS.coral : COLORS.otherAvatar },
                      isYou && styles.stripAvatarRing,
                    ]}
                  >
                    <Text style={styles.stripAvatarText}>{getInitials(member.username)}</Text>
                  </View>
                  <Text style={styles.stripName} numberOfLines={1}>
                    {isYou ? 'You' : firstName(member.username)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Share a Coupon */}
          <View style={styles.shareWrap}>
            <TouchableOpacity
              style={styles.shareBtn}
              onPress={handleOpenCouponPicker}
              activeOpacity={0.85}
            >
              <Ionicons name="pricetag" size={22} color="#fff" />
              <Text style={styles.shareBtnText}>Share a Coupon</Text>
            </TouchableOpacity>
          </View>

          {/* Shared Coupons header */}
          <View style={styles.couponsHeaderRow}>
            <Text style={styles.couponsHeaderLabel}>
              SHARED COUPONS ({filteredCoupons.length})
            </Text>
            <TouchableOpacity
              style={[styles.filterBtn, hasFilter && styles.filterBtnActive]}
              onPress={() => setFilterSheetVisible(true)}
              activeOpacity={0.75}
            >
              <Ionicons
                name="options-outline"
                size={20}
                color={hasFilter ? '#fff' : COLORS.coral}
              />
            </TouchableOpacity>
          </View>

          {/* Coupon feed */}
          {filteredCoupons.length === 0 ? (
            <Text style={styles.emptyCoupons}>
              {hasFilter
                ? 'No coupons match this filter.'
                : 'No coupons shared to this group yet.'}
            </Text>
          ) : (
            filteredCoupons.map(coupon => {
              const isOwn = coupon.owner_id === user.userId;
              const sender = group.members.find(m => m.user_id === coupon.owner_id);
              const senderLabel = isOwn ? 'You' : sender ? firstName(sender.username) : 'Member';
              const senderInitials = getInitials(sender?.username ?? 'M');
              const accent = isOwn ? COLORS.coralDeep : accentFor(coupon.owner_id);
              const expiry = coupon.expiration_date
                ? new Date(coupon.expiration_date + 'T00:00:00').toLocaleDateString()
                : null;
              const isLoading = loadingCouponId === coupon.coupon_id;

              return (
                <View key={coupon.coupon_id} style={styles.card}>
                  {/* Sender attribution */}
                  <View style={styles.senderRow}>
                    <View
                      style={[
                        styles.senderAvatar,
                        { backgroundColor: isOwn ? COLORS.coral : COLORS.otherAvatar },
                      ]}
                    >
                      <Text style={styles.senderAvatarText}>{senderInitials}</Text>
                    </View>
                    <Text style={[styles.senderName, { color: accent }]}>{senderLabel}</Text>
                    {/* Admins may remove others' coupons (own coupons use the Revoke CTA). */}
                    {isAdmin && !isOwn && (
                      <TouchableOpacity
                        style={styles.adminRemoveBtn}
                        onPress={() => handleRevokeCoupon(coupon.coupon_id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="trash-outline" size={16} color={COLORS.muted} />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Coupon body */}
                  <TouchableOpacity
                    style={styles.cardBody}
                    onPress={() => handleOpenCouponDetail(coupon)}
                    activeOpacity={0.75}
                    disabled={isLoading}
                  >
                    <View style={styles.tagTile}>
                      <Ionicons name="pricetag-outline" size={26} color={COLORS.tag} />
                    </View>
                    <View style={styles.cardText}>
                      <Text style={styles.brandName} numberOfLines={1}>{coupon.store_name}</Text>
                      <Text style={styles.category}>{coupon.category}</Text>
                      {expiry && <Text style={styles.expiry}>Expires {expiry}</Text>}
                    </View>
                  </TouchableOpacity>

                  {/* Action */}
                  <TouchableOpacity
                    style={[styles.actionBtn, isOwn ? styles.actionBtnRevoke : styles.actionBtnUse]}
                    onPress={() =>
                      isOwn
                        ? handleRevokeCoupon(coupon.coupon_id)
                        : handleOpenCouponDetail(coupon)
                    }
                    disabled={isLoading}
                    activeOpacity={0.8}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color={COLORS.coralDeep} />
                    ) : (
                      <Text style={styles.actionBtnText}>{isOwn ? 'Revoke' : 'Use coupon'}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Filter Sheet */}
      <Modal
        visible={filterSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterSheetVisible(false)}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setFilterSheetVisible(false)}
        >
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <View style={styles.filterHeaderRow}>
              <Text style={[styles.sheetTitle, { marginBottom: 0 }]}>Filter Coupons</Text>
              {hasFilter && (
                <TouchableOpacity onPress={clearFilters}>
                  <Text style={styles.clearFilterText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>

            <ScrollView style={{ maxHeight: '78%' }} showsVerticalScrollIndicator={false}>
              <Text style={styles.filterGroupLabel}>CATEGORY</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryScroll}
              >
                {CATEGORY_DEFS.map(cat => {
                  const active = filterCategory === cat.filter;
                  return (
                    <TouchableOpacity
                      key={cat.filter}
                      style={[styles.categoryCard, active && { backgroundColor: cat.color, borderColor: cat.color }]}
                      onPress={() => setFilterCategory(cat.filter)}
                      activeOpacity={0.75}
                    >
                      <Ionicons name={cat.icon} size={24} color={active ? '#444444' : COLORS.ink} />
                      <Text style={[styles.categoryCardLabel, active && styles.categoryCardLabelActive]}>
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={styles.filterGroupLabel}>SORT BY</Text>
              {SORT_OPTIONS.map(opt => {
                const active = filterSort === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.sortOption, active && styles.sortOptionActive]}
                    onPress={() => setFilterSort(active ? null : opt.value)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.sortOptionLeft}>
                      <Ionicons name={opt.icon} size={20} color={active ? COLORS.coral : COLORS.ink} />
                      <Text style={[styles.sortOptionText, active && styles.sortOptionTextActive]}>
                        {opt.label}
                      </Text>
                    </View>
                    {active && <Ionicons name="checkmark" size={18} color={COLORS.coral} />}
                  </TouchableOpacity>
                );
              })}

              <Text style={styles.filterGroupLabel}>MEMBER</Text>
              <View style={styles.chipWrap}>
                {(group?.members ?? []).map(m => {
                  const active = filterMember === m.user_id;
                  const isYou = m.user_id === user.userId;
                  return (
                    <TouchableOpacity
                      key={m.user_id}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      onPress={() => setFilterMember(active ? null : m.user_id)}
                    >
                      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                        {isYou ? 'You' : firstName(m.username)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <TouchableOpacity
              style={styles.filterDoneBtn}
              onPress={() => setFilterSheetVisible(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.filterDoneBtnText}>Done</Text>
            </TouchableOpacity>
            <View style={{ height: 24 }} />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Settings Bottom Sheet */}
      <Modal
        visible={settingsSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSettingsSheetVisible(false)}
        onDismiss={() => {
          // iOS: runs after the sheet has fully closed — safe to present the picker now.
          if (pendingPhotoPick) {
            setPendingPhotoPick(false);
            handlePickImage();
          }
        }}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setSettingsSheetVisible(false)}
        >
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Group Settings</Text>

            {isAdmin && (
              <>
                <TouchableOpacity
                  style={styles.settingsRow}
                  onPress={() => {
                    // iOS can't present the image picker while the settings Modal is still
                    // on screen, so launch it only AFTER the Modal has fully dismissed
                    // (via the Modal's onDismiss). Android has no such restriction.
                    setSettingsSheetVisible(false);
                    if (Platform.OS === 'ios') {
                      setPendingPhotoPick(true);
                    } else {
                      setTimeout(() => handlePickImage(), 250);
                    }
                  }}
                  activeOpacity={0.75}
                >
                  <Ionicons name="image-outline" size={20} color={COLORS.coral} />
                  <Text style={styles.settingsRowText}>Change Group Photo</Text>
                  <Ionicons name="chevron-forward" size={16} color="#C4B8A0" style={styles.settingsRowChevron} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.settingsRow}
                  onPress={() => {
                    setSettingsSheetVisible(false);
                    setNewGroupName(group?.name ?? '');
                    setRenameModalVisible(true);
                  }}
                  activeOpacity={0.75}
                >
                  <Ionicons name="pencil-outline" size={20} color={COLORS.coral} />
                  <Text style={styles.settingsRowText}>Rename Group</Text>
                  <Ionicons name="chevron-forward" size={16} color="#C4B8A0" style={styles.settingsRowChevron} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.settingsRow, styles.settingsRowLast]}
                  onPress={() => {
                    setSettingsSheetVisible(false);
                    setDeleteConfirmVisible(true);
                  }}
                  activeOpacity={0.75}
                >
                  <Ionicons name="trash-outline" size={20} color="#D93025" />
                  <Text style={[styles.settingsRowText, styles.settingsRowTextDestructive]}>
                    Delete Group
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color="#C4B8A0" style={styles.settingsRowChevron} />
                </TouchableOpacity>
              </>
            )}

            {!isAdmin && (
              <TouchableOpacity
                style={[styles.settingsRow, styles.settingsRowLast]}
                onPress={() => {
                  setSettingsSheetVisible(false);
                  handleLeaveGroup();
                }}
                activeOpacity={0.75}
              >
                <Ionicons name="exit-outline" size={20} color="#D93025" />
                <Text style={[styles.settingsRowText, styles.settingsRowTextDestructive]}>
                  Leave Group
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#C4B8A0" style={styles.settingsRowChevron} />
              </TouchableOpacity>
            )}

            <View style={{ height: 24 }} />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Members Bottom Sheet */}
      <Modal
        visible={membersSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setMembersSheetVisible(false)}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setMembersSheetVisible(false)}
        >
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
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
              style={{ maxHeight: '80%' }}
            >
              {(group?.members ?? []).map(member => {
                const isCurrentUser = member.user_id === user.userId;
                const isGroupAdmin = member.user_id === group?.admin_user_id;
                return (
                  <View key={member.user_id} style={styles.memberRow}>
                    <View style={styles.memberAvatar}>
                      <Text style={styles.memberAvatarText}>
                        {getInitials(member.username)}
                      </Text>
                    </View>
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
                      <View style={[styles.memberAvatar, { opacity: 0.5 }]}>
                        <Text style={styles.memberAvatarText}>
                          {getInitials(member.username)}
                        </Text>
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
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Invite Member Dialog */}
      <Modal
        visible={inviteSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={closeInviteSheet}
      >
        <TouchableOpacity
          style={styles.dialogOverlay}
          activeOpacity={1}
          onPress={closeInviteSheet}
        >
          <View style={styles.dialog} onStartShouldSetResponder={() => true}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>Add Member</Text>
              <TouchableOpacity
                onPress={closeInviteSheet}
                style={styles.dialogCloseBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={20} color={COLORS.ink} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.dialogInput}
              placeholder="Email or username"
              placeholderTextColor="#A8997A"
              value={memberQuery}
              onChangeText={setMemberQuery}
              autoCapitalize="none"
              autoFocus
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
            <TouchableOpacity
              style={[
                styles.dialogInviteBtn,
                (addingMember || !memberQuery.trim()) && styles.dialogInviteBtnDisabled,
              ]}
              onPress={() => memberQuery.trim() && handleAddMember(memberQuery.trim())}
              disabled={addingMember || !memberQuery.trim()}
              activeOpacity={0.8}
            >
              {addingMember ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.dialogInviteBtnText}>Invite</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addFromContactsBtn}
              onPress={handleOpenContacts}
              activeOpacity={0.8}
            >
              <Ionicons name="people-outline" size={16} color={COLORS.coral} />
              <Text style={styles.addFromContactsBtnText}>Add from Contacts</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Rename Dialog — View overlay avoids nested-Modal iOS conflict */}
      {renameModalVisible && (
        <TouchableOpacity
          style={[StyleSheet.absoluteFill, styles.dialogOverlay]}
          activeOpacity={1}
          onPress={() => {
            setRenameModalVisible(false);
            setNewGroupName('');
          }}
        >
          <View style={styles.dialog} onStartShouldSetResponder={() => true}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>Rename Group</Text>
              <TouchableOpacity
                onPress={() => {
                  setRenameModalVisible(false);
                  setNewGroupName('');
                }}
                style={styles.dialogCloseBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={20} color={COLORS.ink} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.dialogInput}
              placeholder="New group name"
              placeholderTextColor="#A8997A"
              value={newGroupName}
              onChangeText={setNewGroupName}
              autoFocus
              maxLength={60}
            />
            <TouchableOpacity
              style={[
                styles.dialogInviteBtn,
                (!newGroupName.trim() || renaming) && styles.dialogInviteBtnDisabled,
              ]}
              onPress={handleRenameGroup}
              disabled={!newGroupName.trim() || renaming}
              activeOpacity={0.8}
            >
              {renaming ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.dialogInviteBtnText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )}

      {/* Delete Confirmation — View overlay avoids nested-Modal iOS conflict */}
      {deleteConfirmVisible && (
        <TouchableOpacity
          style={[StyleSheet.absoluteFill, styles.dialogOverlay]}
          activeOpacity={1}
          onPress={() => setDeleteConfirmVisible(false)}
        >
          <View style={styles.dialog} onStartShouldSetResponder={() => true}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>Delete Group?</Text>
              <TouchableOpacity
                onPress={() => setDeleteConfirmVisible(false)}
                style={styles.dialogCloseBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={20} color={COLORS.ink} />
              </TouchableOpacity>
            </View>
            <Text style={styles.deleteWarningText}>
              Are you sure you want to delete "{group?.name}"? This action is
              permanent and will remove all members.
            </Text>
            <View style={styles.deleteDialogActions}>
              <TouchableOpacity
                style={styles.deleteCancelBtn}
                onPress={() => setDeleteConfirmVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.deleteCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.deleteConfirmBtn,
                  deleting && styles.dialogInviteBtnDisabled,
                ]}
                onPress={handleDeleteGroup}
                disabled={deleting}
                activeOpacity={0.8}
              >
                {deleting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.deleteConfirmBtnText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      )}

      {/* Add from Contacts Sheet */}
      <Modal
        visible={contactsSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setContactsSheetVisible(false)}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setContactsSheetVisible(false)}
        >
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Your Contacts on Couplet</Text>
            {contactsLoading ? (
              <ActivityIndicator color={COLORS.coral} style={{ marginVertical: 32 }} />
            ) : contactMatches.length === 0 ? (
              <Text style={styles.emptyCoupons}>None of your contacts are on Couplet yet.</Text>
            ) : (
              <ScrollView style={{ maxHeight: '80%' }}>
                {contactMatches.map(match => (
                  <View key={match.user_id} style={styles.memberRow}>
                    <View style={styles.memberAvatar}>
                      <Text style={styles.memberAvatarText}>{getInitials(match.contactName)}</Text>
                    </View>
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
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Share Coupon Picker */}
      <Modal
        visible={couponPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCouponPickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setCouponPickerVisible(false)}
        >
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Share a Coupon</Text>
            <ScrollView style={{ maxHeight: '80%' }}>
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
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Coupon Detail — same experience as My Coupons tab */}
      <CouponDetail
        coupon={selectedCoupon}
        visible={!!selectedCoupon}
        onClose={() => setSelectedCoupon(null)}
        onDelete={() => setSelectedCoupon(null)}
        onMarkUsed={() => setSelectedCoupon(null)}
        onUpdate={() => setSelectedCoupon(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 8,
    paddingBottom: 14,
    paddingLeft: 14,
    paddingRight: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  headerIconBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
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
  headerAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: { fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },
  headerTitleWrap: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 19, fontWeight: '700', color: COLORS.ink },

  body: { paddingBottom: 48 },

  // Members section label
  membersLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  membersLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.muted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  viewAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewAllText: { fontSize: 13, fontWeight: '600', color: COLORS.coral },

  // Members strip
  strip: {
    gap: 14,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  stripItem: { alignItems: 'center', gap: 6, width: 56 },
  stripAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripAvatarRing: {
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: COLORS.coral,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  stripAvatarText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  stripName: { fontSize: 11, fontWeight: '600', color: COLORS.ink, maxWidth: 56 },
  addChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.coralPale,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: COLORS.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addChipLabel: { fontSize: 11, fontWeight: '600', color: COLORS.coral },

  // Share button
  shareWrap: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 14 },
  shareBtn: {
    height: 60,
    borderRadius: 18,
    backgroundColor: COLORS.coral,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    shadowColor: COLORS.coral,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6,
  },
  shareBtnText: { fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },

  // Shared Coupons header
  couponsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
  },
  couponsHeaderLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  filterBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: COLORS.cardWhite,
    borderWidth: 1,
    borderColor: COLORS.divider,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  filterBtnActive: { backgroundColor: COLORS.coral, borderColor: COLORS.coral },

  emptyCoupons: {
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    marginVertical: 24,
    paddingHorizontal: 16,
  },

  // Coupon card
  card: {
    backgroundColor: COLORS.cardWhite,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.divider,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 12,
    shadowColor: COLORS.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  senderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  senderAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  senderAvatarText: { fontSize: 9, fontWeight: '700', color: '#fff' },
  senderName: { fontSize: 13, fontWeight: '700' },
  adminRemoveBtn: { marginLeft: 'auto' },

  cardBody: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tagTile: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: COLORS.tagTile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1, minWidth: 0 },
  brandName: { fontSize: 17, fontWeight: '700', color: COLORS.ink },
  category: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  expiry: { fontSize: 12, color: COLORS.muted, marginTop: 4 },

  actionBtn: {
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnUse: { backgroundColor: COLORS.coralPale },
  actionBtnRevoke: { backgroundColor: 'rgba(216,90,60,0.10)' },
  actionBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.coralDeep },

  // Filter sheet
  filterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  clearFilterText: { fontSize: 14, fontWeight: '600', color: COLORS.coral },
  filterGroupLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.muted,
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 4,
  },
  // Category cards (mirrors My Coupons filter)
  categoryScroll: { gap: 10, paddingBottom: 4, paddingRight: 4, marginBottom: 8 },
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
    color: COLORS.ink,
    textAlign: 'center',
    opacity: 0.7,
    paddingHorizontal: 4,
  },
  categoryCardLabelActive: { color: '#444444', opacity: 1 },
  // Sort rows (mirrors My Coupons sort sheet)
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E0D8CA',
  },
  sortOptionActive: { backgroundColor: 'rgba(232,96,76,0.06)', borderRadius: 12 },
  sortOptionLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sortOptionText: { fontSize: 15, fontWeight: '500', color: COLORS.ink },
  sortOptionTextActive: { color: COLORS.coral, fontWeight: '700' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16, marginTop: 4 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.cardWhite,
    borderWidth: 1,
    borderColor: COLORS.divider,
  },
  filterChipActive: { backgroundColor: COLORS.coral, borderColor: COLORS.coral },
  filterChipText: { fontSize: 13, fontWeight: '600', color: COLORS.ink },
  filterChipTextActive: { color: '#fff' },
  filterDoneBtn: {
    backgroundColor: COLORS.coral,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  filterDoneBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Settings sheet rows
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196,184,160,0.25)',
  },
  settingsRowLast: { borderBottomWidth: 0 },
  settingsRowText: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.ink },
  settingsRowTextDestructive: { color: '#D93025' },
  settingsRowChevron: { marginLeft: 'auto' as any },

  // Bottom sheets
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(26,35,50,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 0,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C4B8A0',
    alignSelf: 'center',
    marginBottom: 16,
  },
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
    backgroundColor: COLORS.cardWhite,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.coral,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  memberAvatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
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
  dialog: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  dialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  dialogTitle: { fontSize: 18, fontWeight: '800', color: COLORS.ink },
  dialogCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0EBE0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogInput: {
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    fontSize: 15,
    color: COLORS.ink,
    marginBottom: 12,
  },
  dialogInviteBtn: {
    backgroundColor: COLORS.coral,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  dialogInviteBtnDisabled: { opacity: 0.4 },
  dialogInviteBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
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
  deleteCancelBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#C4B8A0',
  },
  deleteCancelBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.ink },
  deleteConfirmBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#D93025',
  },
  deleteConfirmBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

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

  addFromContactsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    borderWidth: 1.5,
    borderColor: COLORS.coral,
    borderRadius: 14,
    paddingVertical: 13,
  },
  addFromContactsBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.coral },
});
