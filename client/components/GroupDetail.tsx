import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import {
  getGroup,
  addMember,
  removeMember,
  revokeFromGroup,
  leaveGroup,
  searchUsers,
  cancelInvitation,
  shareToGroup,
  getCoupons,
  renameGroup,
  deleteGroup,
} from '../services/api';
import type { GroupDetail as GroupDetailType, GroupMember, CouponMeta } from '../services/api';
import { saveGroupImage, getGroupImage } from '../storage/groupStorage';

interface Props {
  groupId: string | null;
  visible: boolean;
  onClose: () => void;
  currentUserId: string;
  onGroupDeleted?: () => void;
}

export default function GroupDetail({ groupId, visible, onClose, currentUserId, onGroupDeleted }: Props) {
  const [group, setGroup] = useState<GroupDetailType | null>(null);
  const [loading, setLoading] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);

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

  const isAdmin = group?.admin_user_id === currentUserId;

  const fetchGroup = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    try {
      const { data } = await getGroup(groupId);
      setGroup(data);
    } catch {
      Alert.alert('Error', 'Could not load group details.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    if (visible && groupId) {
      fetchGroup();
      getGroupImage(groupId).then(setImageUri);
    } else {
      // Don't clear group here — it goes blank mid-animation. Reset only interactive state;
      // group data will be re-fetched fresh on the next open.
      setMemberQuery('');
      setSuggestions([]);
      setInviteSheetVisible(false);
      setRenameModalVisible(false);
      setDeleteConfirmVisible(false);
    }
  }, [visible, groupId, fetchGroup]);

  useEffect(() => {
    if (!memberQuery.trim()) { setSuggestions([]); return; }
    const timer = setTimeout(async () => {
      try {
        const { data } = await searchUsers(memberQuery.trim());
        setSuggestions(data);
      } catch { setSuggestions([]); }
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
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await removeMember(groupId, member.user_id); await fetchGroup(); }
        catch (err: any) { Alert.alert('Error', err?.response?.data?.error ?? 'Could not remove member.'); }
      }},
    ]);
  }

  async function handleCancelInvite(member: GroupMember) {
    if (!groupId) return;
    Alert.alert('Cancel invitation', `Cancel invite for ${member.username}?`, [
      { text: 'No', style: 'cancel' },
      { text: 'Cancel invite', style: 'destructive', onPress: async () => {
        try { await cancelInvitation(groupId, member.user_id); await fetchGroup(); }
        catch (err: any) { Alert.alert('Error', err?.response?.data?.error ?? 'Could not cancel invitation.'); }
      }},
    ]);
  }

  async function handleRenameGroup() {
    if (!groupId || !newGroupName.trim()) return;
    setRenaming(true);
    try {
      const { data } = await renameGroup(groupId, newGroupName.trim());
      setGroup(prev => prev ? { ...prev, name: data.name } : prev);
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
      onGroupDeleted?.();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not delete group.');
    } finally {
      setDeleting(false);
    }
  }

  async function handleLeaveGroup() {
    if (!groupId) return;
    Alert.alert('Leave group', `Leave "${group?.name}"? Your shared coupons will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: async () => {
        try { await leaveGroup(groupId); onClose(); }
        catch (err: any) { Alert.alert('Error', err?.response?.data?.error ?? 'Could not leave group.'); }
      }},
    ]);
  }

  async function handleRevokeCoupon(couponId: string) {
    if (!groupId) return;
    Alert.alert('Remove coupon', 'Remove this coupon from the group?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await revokeFromGroup(groupId, couponId); await fetchGroup(); }
        catch (err: any) { Alert.alert('Error', err?.response?.data?.error ?? 'Could not remove coupon.'); }
      }},
    ]);
  }

  async function handleOpenCouponPicker() {
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
      await shareToGroup(groupId, couponId);
      await fetchGroup();
      setCouponPickerVisible(false);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not share coupon.');
    } finally {
      setSharingCouponId(null);
    }
  }

  function getInitials(name: string) {
    return name.slice(0, 2).toUpperCase();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="close" size={22} color="#1A2332" />
        </TouchableOpacity>

        {loading || !group ? (
          <ActivityIndicator color="#E8604C" style={{ marginTop: 80 }} />
        ) : (
          <>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity
                style={styles.groupImageWrap}
                onPress={handlePickImage}
                activeOpacity={isAdmin ? 0.75 : 1}
              >
                {imageUri ? (
                  <Image source={{ uri: imageUri }} style={styles.groupImage} />
                ) : (
                  <View style={styles.groupImageFallback}>
                    <Text style={styles.groupImageFallbackText}>{getInitials(group.name)}</Text>
                  </View>
                )}
                {isAdmin && (
                  <View style={styles.editImageBadge}>
                    <Ionicons name="camera" size={12} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
              <Text style={styles.groupName}>{group.name}</Text>
            </View>

            {/* Action Bar */}
            <View style={styles.actionBar}>
              {isAdmin && (
                <TouchableOpacity
                  style={[styles.actionBtn, styles.actionBtnSecondary]}
                  onPress={() => setInviteSheetVisible(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="person-add-outline" size={18} color="#E8604C" />
                  <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>Add Member</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnSecondary]}
                onPress={handleOpenCouponPicker}
                activeOpacity={0.8}
              >
                <Ionicons name="pricetag-outline" size={18} color="#E8604C" />
                <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>Share Coupon</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              {/* Shared Coupons */}
              <Text style={styles.sectionTitle}>SHARED COUPONS ({group.coupons.length})</Text>
              {group.coupons.length === 0 ? (
                <Text style={styles.emptyCoupons}>No coupons shared to this group yet.</Text>
              ) : (
                group.coupons.map(coupon => {
                  const canRevoke = isAdmin || coupon.owner_id === currentUserId;
                  const expiry = coupon.expiration_date
                    ? new Date(coupon.expiration_date + 'T00:00:00').toLocaleDateString()
                    : null;
                  return (
                    <View key={coupon.coupon_id} style={styles.couponRow}>
                      <Text style={styles.couponIcon}>🏷️</Text>
                      <View style={styles.couponInfo}>
                        <Text style={styles.couponName}>
                          {coupon.store_name}
                          <Text style={styles.couponCategory}>  {coupon.category}</Text>
                        </Text>
                        {expiry && <Text style={styles.couponExpiry}>Expires {expiry}</Text>}
                      </View>
                      {canRevoke && (
                        <TouchableOpacity style={styles.revokeBtn} onPress={() => handleRevokeCoupon(coupon.coupon_id)}>
                          <Text style={styles.revokeBtnText}>Revoke</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })
              )}

              {/* Members Row */}
              <TouchableOpacity
                style={styles.membersRow}
                onPress={() => setMembersSheetVisible(true)}
                activeOpacity={0.75}
              >
                <View style={styles.membersRowLeft}>
                  <Ionicons name="people-outline" size={20} color="#1A2332" />
                  <Text style={styles.membersRowText}>Members</Text>
                  <View style={styles.memberCountBadge}>
                    <Text style={styles.memberCountText}>{group.members.length}</Text>
                  </View>
                  {(group.pending_members ?? []).length > 0 && (
                    <View style={styles.pendingCountBadge}>
                      <Text style={styles.pendingCountText}>{group.pending_members.length} pending</Text>
                    </View>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color="#C4B8A0" />
              </TouchableOpacity>

              {!isAdmin && (
                <TouchableOpacity style={styles.leaveBtn} onPress={handleLeaveGroup}>
                  <Text style={styles.leaveBtnText}>Leave Group</Text>
                </TouchableOpacity>
              )}

              {isAdmin && (
                <View style={styles.adminActions}>
                  <TouchableOpacity
                    style={styles.renameBtn}
                    onPress={() => { setNewGroupName(group.name); setRenameModalVisible(true); }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="pencil-outline" size={16} color="#E8604C" />
                    <Text style={styles.renameBtnText}>Rename Group</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => setDeleteConfirmVisible(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="trash-outline" size={16} color="#D93025" />
                    <Text style={styles.deleteBtnText}>Delete Group</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </>
        )}

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
              <Text style={styles.sheetTitle}>Members ({group?.members.length ?? 0})</Text>
              <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: '80%' }}>
                {(group?.members ?? []).map(member => {
                  const isCurrentUser = member.user_id === currentUserId;
                  const isGroupAdmin = member.user_id === group?.admin_user_id;
                  return (
                    <View key={member.user_id} style={styles.memberRow}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{getInitials(member.username)}</Text>
                      </View>
                      <View style={styles.memberInfo}>
                        <Text style={styles.memberName}>{member.username}{isCurrentUser ? ' (you)' : ''}</Text>
                        {isGroupAdmin && <Text style={styles.adminLabel}>Admin</Text>}
                      </View>
                      {isAdmin && !isCurrentUser && !isGroupAdmin && (
                        <TouchableOpacity style={styles.removeBtn} onPress={() => handleRemoveMember(member)}>
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
                        <View style={[styles.avatar, { opacity: 0.5 }]}>
                          <Text style={styles.avatarText}>{getInitials(member.username)}</Text>
                        </View>
                        <View style={[styles.memberInfo, { opacity: 0.5 }]}>
                          <Text style={styles.memberName}>{member.username}</Text>
                          <Text style={styles.memberEmail}>{member.email}</Text>
                        </View>
                        <View style={[styles.pendingBadge, { opacity: 0.5 }]}>
                          <Text style={styles.pendingBadgeText}>Pending</Text>
                        </View>
                        {isAdmin && (
                          <TouchableOpacity style={styles.cancelInviteBtn} onPress={() => handleCancelInvite(member)}>
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
          onRequestClose={() => { setInviteSheetVisible(false); setMemberQuery(''); setSuggestions([]); }}
        >
          <TouchableOpacity
            style={styles.dialogOverlay}
            activeOpacity={1}
            onPress={() => { setInviteSheetVisible(false); setMemberQuery(''); setSuggestions([]); }}
          >
            <View style={styles.dialog} onStartShouldSetResponder={() => true}>
              {/* Header */}
              <View style={styles.dialogHeader}>
                <Text style={styles.dialogTitle}>Add Member</Text>
                <TouchableOpacity
                  onPress={() => { setInviteSheetVisible(false); setMemberQuery(''); setSuggestions([]); }}
                  style={styles.dialogCloseBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={20} color="#1A2332" />
                </TouchableOpacity>
              </View>

              {/* Input */}
              <TextInput
                style={styles.dialogInput}
                placeholder="Email or username"
                placeholderTextColor="#A8997A"
                value={memberQuery}
                onChangeText={setMemberQuery}
                autoCapitalize="none"
                autoFocus
              />

              {/* Suggestions */}
              {suggestions.length > 0 && (
                <View style={styles.suggestions}>
                  {suggestions.map(s => (
                    <TouchableOpacity
                      key={s.user_id}
                      style={styles.suggestion}
                      onPress={() => { setMemberQuery(s.email); setSuggestions([]); }}
                    >
                      <Text style={styles.suggestionName}>{s.username}</Text>
                      <Text style={styles.suggestionEmail}>{s.email}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Invite button */}
              <TouchableOpacity
                style={[styles.dialogInviteBtn, (addingMember || !memberQuery.trim()) && styles.dialogInviteBtnDisabled]}
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
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Rename Group Dialog — View overlay avoids nested-Modal iOS conflict */}
        {renameModalVisible && (
          <TouchableOpacity
            style={[StyleSheet.absoluteFill, styles.dialogOverlay]}
            activeOpacity={1}
            onPress={() => { setRenameModalVisible(false); setNewGroupName(''); }}
          >
            <View style={styles.dialog} onStartShouldSetResponder={() => true}>
              <View style={styles.dialogHeader}>
                <Text style={styles.dialogTitle}>Rename Group</Text>
                <TouchableOpacity
                  onPress={() => { setRenameModalVisible(false); setNewGroupName(''); }}
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
                style={[styles.dialogInviteBtn, (!newGroupName.trim() || renaming) && styles.dialogInviteBtnDisabled]}
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

        {/* Delete Group Confirmation — View overlay avoids nested-Modal iOS conflict */}
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
                Are you sure you want to delete "{group?.name}"? This action is permanent and will remove all members.
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
                  style={[styles.deleteConfirmBtn, deleting && styles.dialogInviteBtnDisabled]}
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
                  <Text style={styles.emptyCoupons}>No active coupons to share.</Text>
                ) : (
                  myCoupons.map(coupon => {
                    const alreadyShared = group?.coupons.some(c => c.coupon_id === coupon.coupon_id);
                    return (
                      <TouchableOpacity
                        key={coupon.coupon_id}
                        style={[styles.couponPickerRow, alreadyShared && styles.couponPickerRowShared]}
                        onPress={() => !alreadyShared && handleShareCoupon(coupon.coupon_id)}
                        disabled={alreadyShared || sharingCouponId === coupon.coupon_id}
                        activeOpacity={alreadyShared ? 1 : 0.75}
                      >
                        <View style={styles.couponPickerInfo}>
                          <Text style={styles.couponPickerName}>{coupon.store_name}</Text>
                          <Text style={styles.couponPickerSub}>{coupon.category}</Text>
                        </View>
                        {sharingCouponId === coupon.coupon_id ? (
                          <ActivityIndicator color="#E8604C" size="small" />
                        ) : alreadyShared ? (
                          <Text style={styles.alreadySharedText}>Shared</Text>
                        ) : (
                          <Ionicons name="add-circle-outline" size={22} color="#E8604C" />
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F0E6' },

  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(26,35,50,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  header: {
    alignItems: 'center',
    paddingTop: 44,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  groupImageWrap: {
    width: 90,
    height: 90,
    borderRadius: 45,
    marginBottom: 14,
  },
  groupImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  groupImageFallback: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#E8604C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupImageFallbackText: { fontSize: 32, fontWeight: '800', color: '#fff' },
  editImageBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#1A2332',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#F5F0E6',
  },
  groupName: { fontSize: 24, fontWeight: '800', color: '#1A2332', textAlign: 'center' },

  actionBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 4,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E8604C',
    borderRadius: 14,
    paddingVertical: 13,
  },
  actionBtnSecondary: { backgroundColor: 'rgba(232,96,76,0.1)' },
  actionBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  actionBtnTextSecondary: { color: '#E8604C' },

  body: { paddingHorizontal: 20, paddingBottom: 48, paddingTop: 12 },

  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A8997A',
    letterSpacing: 0.8,
    marginBottom: 12,
  },

  membersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginTop: 20,
    shadowColor: '#1A2332',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  membersRowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  membersRowText: { fontSize: 15, fontWeight: '600', color: '#1A2332' },
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

  emptyCoupons: { fontSize: 14, color: '#A8997A', textAlign: 'center', marginVertical: 16 },
  couponRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
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

  leaveBtn: {
    marginTop: 32,
    borderRadius: 30,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E8604C',
  },
  leaveBtnText: { color: '#E8604C', fontSize: 15, fontWeight: '600' },

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

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8604C',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
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

  addMemberSection: { marginTop: 4 },
  addMemberRow: { flexDirection: 'row', alignItems: 'center' },
  addMemberInputWrap: { flex: 1, borderBottomWidth: 1.5, borderBottomColor: '#C4B8A0' },
  addMemberInput: { paddingVertical: 10, fontSize: 15, color: '#1A2332' },
  addMemberBtn: {
    marginLeft: 12,
    backgroundColor: '#E8604C',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  addMemberBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  suggestions: { backgroundColor: '#fff', borderRadius: 12, marginTop: 8, overflow: 'hidden' },
  suggestion: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#F0EBE0' },
  suggestionName: { fontSize: 14, fontWeight: '600', color: '#1A2332' },
  suggestionEmail: { fontSize: 12, color: '#A8997A' },

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

  adminActions: { marginTop: 32, gap: 12 },
  renameBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 30,
    paddingVertical: 15,
    borderWidth: 1.5,
    borderColor: '#E8604C',
  },
  renameBtnText: { color: '#E8604C', fontSize: 15, fontWeight: '600' },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 30,
    paddingVertical: 15,
    borderWidth: 1.5,
    borderColor: '#D93025',
  },
  deleteBtnText: { color: '#D93025', fontSize: 15, fontWeight: '600' },

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
});
