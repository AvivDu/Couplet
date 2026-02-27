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
} from 'react-native';
import {
  getGroup,
  addMember,
  removeMember,
  revokeFromGroup,
  searchUsers,
} from '../services/api';
import type { GroupDetail as GroupDetailType, GroupMember, GroupCoupon } from '../services/api';

interface Props {
  groupId: string | null;
  visible: boolean;
  onClose: () => void;
  currentUserId: string;
}

export default function GroupDetail({ groupId, visible, onClose, currentUserId }: Props) {
  const [group, setGroup] = useState<GroupDetailType | null>(null);
  const [loading, setLoading] = useState(false);

  // Add member
  const [memberQuery, setMemberQuery] = useState('');
  const [suggestions, setSuggestions] = useState<GroupMember[]>([]);
  const [addingMember, setAddingMember] = useState(false);

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
    } else {
      setGroup(null);
      setMemberQuery('');
      setSuggestions([]);
    }
  }, [visible, groupId, fetchGroup]);

  // Debounced user search
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

  async function handleAddMember(identifier: string) {
    if (!groupId) return;
    setAddingMember(true);
    try {
      await addMember(groupId, identifier);
      setMemberQuery('');
      setSuggestions([]);
      await fetchGroup();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not add member.');
    } finally {
      setAddingMember(false);
    }
  }

  async function handleRemoveMember(member: GroupMember) {
    if (!groupId) return;
    Alert.alert(
      'Remove member',
      `Remove ${member.username} from this group?`,
      [
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
      ]
    );
  }

  async function handleRevokeCoupon(couponId: string) {
    if (!groupId) return;
    Alert.alert(
      'Remove coupon',
      'Remove this coupon from the group?',
      [
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
      ]
    );
  }

  function getInitials(username: string) {
    return username.slice(0, 2).toUpperCase();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕  Close</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{group?.name ?? ''}</Text>
          <View style={{ width: 70 }} />
        </View>

        {loading || !group ? (
          <ActivityIndicator color="#E8604C" style={{ marginTop: 48 }} />
        ) : (
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {/* Members section */}
            <Text style={styles.sectionTitle}>MEMBERS ({group.members.length})</Text>
            {group.members.map(member => {
              const isCurrentUser = member.user_id === currentUserId;
              const isGroupAdmin = member.user_id === group.admin_user_id;
              return (
                <View key={member.user_id} style={styles.memberRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{getInitials(member.username)}</Text>
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>
                      {member.username}{isCurrentUser ? ' (you)' : ''}
                    </Text>
                    {isGroupAdmin && <Text style={styles.adminLabel}>Admin</Text>}
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

            {/* Add member (admin only) */}
            {isAdmin && (
              <View style={styles.addMemberSection}>
                <View style={styles.addMemberRow}>
                  <View style={styles.addMemberInputWrap}>
                    <TextInput
                      style={styles.addMemberInput}
                      placeholder="+ Add member by email or username"
                      placeholderTextColor="#A8997A"
                      value={memberQuery}
                      onChangeText={setMemberQuery}
                      autoCapitalize="none"
                    />
                  </View>
                  {addingMember ? (
                    <ActivityIndicator color="#E8604C" style={{ marginLeft: 12 }} />
                  ) : (
                    memberQuery.trim().length > 0 && (
                      <TouchableOpacity
                        style={styles.addMemberBtn}
                        onPress={() => handleAddMember(memberQuery.trim())}
                      >
                        <Text style={styles.addMemberBtnText}>Add</Text>
                      </TouchableOpacity>
                    )
                  )}
                </View>

                {/* Suggestions dropdown */}
                {suggestions.length > 0 && (
                  <View style={styles.suggestions}>
                    {suggestions.map(s => (
                      <TouchableOpacity
                        key={s.user_id}
                        style={styles.suggestion}
                        onPress={() => {
                          setMemberQuery('');
                          setSuggestions([]);
                          handleAddMember(s.email);
                        }}
                      >
                        <Text style={styles.suggestionName}>{s.username}</Text>
                        <Text style={styles.suggestionEmail}>{s.email}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Shared coupons section */}
            <Text style={[styles.sectionTitle, { marginTop: 28 }]}>
              SHARED COUPONS ({group.coupons.length})
            </Text>

            {group.coupons.length === 0 ? (
              <Text style={styles.emptyCoupons}>No coupons shared to this group yet.</Text>
            ) : (
              group.coupons.map(coupon => {
                const isOwner = coupon.owner_id === currentUserId;
                const canRevoke = isAdmin || isOwner;
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
                      <TouchableOpacity
                        style={styles.revokeBtn}
                        onPress={() => handleRevokeCoupon(coupon.coupon_id)}
                      >
                        <Text style={styles.revokeBtnText}>Revoke</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F0E6' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  closeBtn: { paddingVertical: 4, width: 70 },
  closeText: { fontSize: 15, color: '#1A2332', fontWeight: '600', opacity: 0.6 },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A2332',
    flex: 1,
    textAlign: 'center',
  },
  body: { padding: 20, paddingBottom: 48 },

  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A8997A',
    letterSpacing: 0.8,
    marginBottom: 12,
  },

  // Members
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
  adminLabel: { fontSize: 12, color: '#E8604C', fontWeight: '600', marginTop: 2 },
  removeBtn: {
    backgroundColor: 'rgba(232,96,76,0.1)',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  removeBtnText: { fontSize: 13, fontWeight: '600', color: '#E8604C' },

  // Add member
  addMemberSection: { marginTop: 12 },
  addMemberRow: { flexDirection: 'row', alignItems: 'center' },
  addMemberInputWrap: {
    flex: 1,
    borderBottomWidth: 1.5,
    borderBottomColor: '#C4B8A0',
  },
  addMemberInput: {
    paddingVertical: 10,
    fontSize: 15,
    color: '#1A2332',
  },
  addMemberBtn: {
    marginLeft: 12,
    backgroundColor: '#E8604C',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  addMemberBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  suggestions: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginTop: 8,
    overflow: 'hidden',
  },
  suggestion: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EBE0',
  },
  suggestionName: { fontSize: 14, fontWeight: '600', color: '#1A2332' },
  suggestionEmail: { fontSize: 12, color: '#A8997A' },

  // Coupons
  emptyCoupons: { fontSize: 14, color: '#A8997A', textAlign: 'center', marginTop: 8 },
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
});
