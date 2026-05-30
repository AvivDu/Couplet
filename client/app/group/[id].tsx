import { useState, useEffect, useCallback } from 'react';
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
  SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
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
  deleteGroup,
  getNotifications,
} from '../../services/api';
import type { GroupDetail as GroupDetailType, GroupMember, CouponMeta, ContactMatch } from '../../services/api';

type ContactMatchWithName = ContactMatch & { contactName: string };
import { saveGroupImage, getGroupImage } from '../../storage/groupStorage';
import { getCouponCode, saveCouponCode } from '../../storage/couponStorage';
import { useAuth } from '../../context/AuthContext';
import CouponDetail from '../../components/CouponDetail';
import type { CouponWithCode } from '../../components/CouponDetail/types';

const AVATAR_LIMIT = 4;

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : null;
  const { user } = useAuth();

  const [group, setGroup] = useState<GroupDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageUri, setImageUri] = useState<string | null>(null);

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

  const isAdmin = group?.admin_user_id === user?.userId;
  const visibleMembers = group?.members.slice(0, AVATAR_LIMIT) ?? [];
  const overflowCount = Math.max(0, (group?.members.length ?? 0) - AVATAR_LIMIT);

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
    Promise.all([fetchGroup(), getGroupImage(groupId).then(setImageUri)]).finally(() =>
      setLoading(false)
    );
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
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      await saveGroupImage(groupId, uri);
      setImageUri(uri);
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
      router.back();
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
              router.back();
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
      console.log('[DEBUG share] couponId:', couponId, '| code:', code ? code.slice(0, 12) + '...' : 'NULL');
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

  async function handleOpenCouponDetail(coupon: GroupDetailType['coupons'][0]) {
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

  function closeInviteSheet() {
    setInviteSheetVisible(false);
    setMemberQuery('');
    setSuggestions([]);
  }

  if (!user) return null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={26} color="#1A2332" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerCenter}
          onPress={handlePickImage}
          activeOpacity={isAdmin ? 0.75 : 1}
        >
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.headerAvatar} />
          ) : (
            <View style={styles.headerAvatarFallback}>
              <Text style={styles.headerAvatarText}>
                {group ? getInitials(group.name) : ''}
              </Text>
            </View>
          )}
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {group?.name ?? ''}
            </Text>
            {isAdmin && (
              <Text style={styles.headerSubtitle}>Tap photo to edit</Text>
            )}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setSettingsSheetVisible(true)}
          style={styles.headerBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="settings-outline" size={22} color="#1A2332" />
        </TouchableOpacity>
      </View>

      {loading || !group ? (
        <ActivityIndicator color="#E8604C" style={{ marginTop: 80 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          {/* Member Strip */}
          <TouchableOpacity
            style={styles.memberStrip}
            onPress={() => setMembersSheetVisible(true)}
            activeOpacity={0.75}
          >
            <View style={styles.avatarRow}>
              {visibleMembers.map(member => (
                <View key={member.user_id} style={styles.stripAvatar}>
                  <Text style={styles.stripAvatarText}>
                    {getInitials(member.username)}
                  </Text>
                </View>
              ))}
              {overflowCount > 0 && (
                <View style={styles.overflowChip}>
                  <Text style={styles.overflowChipText}>+{overflowCount}</Text>
                </View>
              )}
            </View>
            <View style={styles.membersLabelRow}>
              <Text style={styles.membersLabelText}>Members</Text>
              <View style={styles.memberCountBadge}>
                <Text style={styles.memberCountText}>{group.members.length}</Text>
              </View>
              {(group.pending_members ?? []).length > 0 && (
                <View style={styles.pendingCountBadge}>
                  <Text style={styles.pendingCountText}>
                    {group.pending_members.length} pending
                  </Text>
                </View>
              )}
              <Ionicons
                name="chevron-forward"
                size={16}
                color="#C4B8A0"
                style={styles.membersChevron}
              />
            </View>
          </TouchableOpacity>

          {/* Shared Coupons */}
          <Text style={styles.sectionTitle}>
            SHARED COUPONS ({group.coupons.length})
          </Text>
          {group.coupons.length === 0 ? (
            <Text style={styles.emptyCoupons}>
              No coupons shared to this group yet.
            </Text>
          ) : (
            group.coupons.map(coupon => {
              const canRevoke = isAdmin || coupon.owner_id === user.userId;
              const expiry = coupon.expiration_date
                ? new Date(coupon.expiration_date + 'T00:00:00').toLocaleDateString()
                : null;
              return (
                <TouchableOpacity
                  key={coupon.coupon_id}
                  style={styles.couponRow}
                  onPress={() => handleOpenCouponDetail(coupon)}
                  activeOpacity={0.75}
                  disabled={loadingCouponId === coupon.coupon_id}
                >
                  {loadingCouponId === coupon.coupon_id ? (
                    <ActivityIndicator size="small" color="#E8604C" style={{ marginRight: 12 }} />
                  ) : (
                    <Text style={styles.couponIcon}>🏷️</Text>
                  )}
                  <View style={styles.couponInfo}>
                    <Text style={styles.couponName}>
                      {coupon.store_name}
                      <Text style={styles.couponCategory}>  {coupon.category}</Text>
                    </Text>
                    {expiry && (
                      <Text style={styles.couponExpiry}>Expires {expiry}</Text>
                    )}
                  </View>
                  {canRevoke && (
                    <TouchableOpacity
                      style={styles.revokeBtn}
                      onPress={e => {
                        e.stopPropagation();
                        handleRevokeCoupon(coupon.coupon_id);
                      }}
                    >
                      <Text style={styles.revokeBtnText}>Revoke</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Settings Bottom Sheet */}
      <Modal
        visible={settingsSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSettingsSheetVisible(false)}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setSettingsSheetVisible(false)}
        >
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Group Settings</Text>

            <TouchableOpacity style={styles.settingsRow} onPress={handleOpenCouponPicker} activeOpacity={0.75}>
              <Ionicons name="pricetag-outline" size={20} color="#E8604C" />
              <Text style={styles.settingsRowText}>Share Coupon</Text>
              <Ionicons name="chevron-forward" size={16} color="#C4B8A0" style={styles.settingsRowChevron} />
            </TouchableOpacity>

            {isAdmin && (
              <>
                <TouchableOpacity
                  style={styles.settingsRow}
                  onPress={() => {
                    setSettingsSheetVisible(false);
                    setInviteSheetVisible(true);
                  }}
                  activeOpacity={0.75}
                >
                  <Ionicons name="person-add-outline" size={20} color="#E8604C" />
                  <Text style={styles.settingsRowText}>Add Member</Text>
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
                  <Ionicons name="pencil-outline" size={20} color="#E8604C" />
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
            <Text style={styles.sheetTitle}>
              Members ({group?.members.length ?? 0})
            </Text>
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
                  <Text style={[styles.sectionTitle, { marginTop: 16, marginBottom: 8 }]}>
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
                        <Text style={styles.memberEmail}>{member.email}</Text>
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
                <Ionicons name="close" size={20} color="#1A2332" />
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
                      setMemberQuery(s.email);
                      setSuggestions([]);
                    }}
                  >
                    <Text style={styles.suggestionName}>{s.username}</Text>
                    <Text style={styles.suggestionEmail}>{s.email}</Text>
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
              <Ionicons name="people-outline" size={16} color="#E8604C" />
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
                <Ionicons name="close" size={20} color="#1A2332" />
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
                <Ionicons name="close" size={20} color="#1A2332" />
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
              <ActivityIndicator color="#E8604C" style={{ marginVertical: 32 }} />
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
                        <ActivityIndicator color="#E8604C" size="small" />
                      ) : alreadyShared ? (
                        <Text style={styles.alreadySharedText}>Shared</Text>
                      ) : (
                        <Ionicons
                          name="add-circle-outline"
                          size={22}
                          color="#E8604C"
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
  container: { flex: 1, backgroundColor: '#F5F0E6' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196,184,160,0.3)',
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 4,
  },
  headerAvatar: { width: 38, height: 38, borderRadius: 19 },
  headerAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E8604C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  headerTitleWrap: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#1A2332' },
  headerSubtitle: { fontSize: 11, color: '#A8997A', marginTop: 1 },

  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48 },

  // Member Strip
  memberStrip: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#1A2332',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
    gap: 12,
  },
  avatarRow: {
    flexDirection: 'row',
    gap: 8,
  },
  stripAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E8604C',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  stripAvatarText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  overflowChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(232,96,76,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  overflowChipText: { fontSize: 13, fontWeight: '700', color: '#E8604C' },
  membersLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  membersLabelText: { fontSize: 15, fontWeight: '600', color: '#1A2332' },
  memberCountBadge: {
    backgroundColor: '#E8604C',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  memberCountText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  pendingCountBadge: {
    backgroundColor: '#F5E6A3',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  pendingCountText: { fontSize: 12, fontWeight: '700', color: '#8A7200' },
  membersChevron: { marginLeft: 'auto' as any },

  // Section
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A8997A',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  emptyCoupons: {
    fontSize: 14,
    color: '#A8997A',
    textAlign: 'center',
    marginVertical: 16,
  },

  // Coupon rows
  couponRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    shadowColor: '#1A2332',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  couponIcon: { fontSize: 20, marginRight: 12 },
  couponInfo: { flex: 1 },
  couponName: { fontSize: 15, fontWeight: '600', color: '#1A2332' },
  couponCategory: { fontSize: 13, color: '#A8997A', fontWeight: '400' },
  couponExpiry: { fontSize: 12, color: '#A8997A', marginTop: 2 },
  revokeBtn: {
    backgroundColor: 'rgba(232,96,76,0.1)',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  revokeBtnText: { fontSize: 13, fontWeight: '600', color: '#E8604C' },

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
  settingsRowText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1A2332' },
  settingsRowTextDestructive: { color: '#D93025' },
  settingsRowChevron: { marginLeft: 'auto' as any },

  // Bottom sheets
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(26,35,50,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#F5F0E6',
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
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#1A2332', marginBottom: 16 },

  // Member rows in sheet
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8604C',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  memberAvatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontWeight: '600', color: '#1A2332' },
  memberEmail: { fontSize: 12, color: '#A8997A', marginTop: 1 },
  adminLabel: { fontSize: 12, color: '#E8604C', fontWeight: '600', marginTop: 2 },
  removeBtn: {
    backgroundColor: 'rgba(232,96,76,0.1)',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  removeBtnText: { fontSize: 13, fontWeight: '600', color: '#E8604C' },
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
  dialogTitle: { fontSize: 18, fontWeight: '800', color: '#1A2332' },
  dialogCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0EBE0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogInput: {
    backgroundColor: '#F5F0E6',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#1A2332',
    marginBottom: 12,
  },
  dialogInviteBtn: {
    backgroundColor: '#E8604C',
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
  suggestionName: { fontSize: 14, fontWeight: '600', color: '#1A2332' },
  suggestionEmail: { fontSize: 12, color: '#A8997A' },

  // Delete dialog
  deleteWarningText: {
    fontSize: 14,
    color: '#1A2332',
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
  deleteCancelBtnText: { fontSize: 15, fontWeight: '600', color: '#1A2332' },
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
  couponPickerName: { fontSize: 15, fontWeight: '600', color: '#1A2332' },
  couponPickerSub: { fontSize: 13, color: '#A8997A', marginTop: 2 },
  alreadySharedText: { fontSize: 13, fontWeight: '600', color: '#A8997A' },

  inviteContactBtn: {
    backgroundColor: '#E8604C',
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
    borderColor: '#E8604C',
    borderRadius: 14,
    paddingVertical: 13,
  },
  addFromContactsBtnText: { fontSize: 15, fontWeight: '600', color: '#E8604C' },
});
