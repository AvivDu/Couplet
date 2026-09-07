import { useState, useCallback } from 'react';
import { useRefreshOnNotification } from '../../hooks/useRefreshOnNotification';
import { useUserSearch } from '../../hooks/useUserSearch';
import {
  View,
  FlatList,
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { Text } from '../../components/rn';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, router } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { getGroups, createGroup } from '../../services/api';
import type { GroupMeta, GroupMember } from '../../services/api';
import GroupCard from '../../components/GroupCard';
import AuroraBackground from '../../components/ui/AuroraBackground';
import ScreenHeader from '../../components/ui/ScreenHeader';
import IconButton from '../../components/ui/IconButton';
import EmptyState from '../../components/ui/EmptyState';
import Sheet from '../../components/ui/Sheet';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import SearchField from '../../components/ui/SearchField';
import Avatar from '../../components/ui/Avatar';
import Chip from '../../components/ui/Chip';
import GlassPanel from '../../components/ui/GlassPanel';
import { colors, radius, spacing, fontFamily, fontSize } from '../../constants/theme';

// One search list holds both kinds of result, so ordering and separators are
// the list's job rather than two stacked lists trying to look like one.
type SearchRow =
  | { kind: 'group'; group: GroupMeta }
  | { kind: 'user'; user: GroupMember };

// Says which kind of thing a result row is - without it, a group and a person
// with the same name are indistinguishable in a mixed list.
function KindTag({ label }: { label: string }) {
  return (
    <View style={styles.kindTag}>
      <Text style={styles.kindTagText}>{label}</Text>
    </View>
  );
}

export default function ConnectionsScreen() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<GroupMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Create modal
  const [createVisible, setCreateVisible] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);

  // Search covers both people and the user's own groups. People come from
  // the same endpoint and hook the group invite flow uses, and each result
  // shows which of the already-fetched groups that person is also in -
  // purely a client-side cross-reference, no server endpoint computes
  // "shared groups" between two users.
  const [query, setQuery] = useState('');
  const { results: userResults, searching } = useUserSearch(query);

  const trimmedQuery = query.trim();

  // Groups are matched locally on name, so they appear the instant you type
  // while the people lookup is still debouncing. Deliberately not held
  // behind that request's spinner - there is nothing to wait for.
  const groupMatches = trimmedQuery
    ? groups.filter(g => g.name.toLowerCase().includes(trimmedQuery.toLowerCase()))
    : [];

  // Groups first: they are the user's own data and a name match there is a
  // stronger signal of intent than a fuzzy lookup across every user.
  const searchRows: SearchRow[] = [
    ...groupMatches.map(g => ({ kind: 'group' as const, group: g })),
    ...userResults.map(u => ({ kind: 'user' as const, user: u })),
  ];

  const fetchGroups = useCallback(async () => {
    try {
      const { data } = await getGroups();
      setGroups(data);
    } catch {
      // silently fail on background refresh
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchGroups().finally(() => setLoading(false));
    }, [fetchGroups])
  );

  // Live refresh: a group_invite/group_share/coupon_revoked notification can
  // change what this list should show (new group, updated coupon count).
  useRefreshOnNotification(fetchGroups);

  async function handleRefresh() {
    setRefreshing(true);
    await fetchGroups();
    setRefreshing(false);
  }

  async function handleCreate() {
    if (!groupName.trim()) {
      Alert.alert('Missing name', 'Please enter a group name.');
      return;
    }
    setCreating(true);
    try {
      const { data: newGroup } = await createGroup(groupName.trim());
      setGroups(prev => [newGroup, ...prev]);
      setGroupName('');
      setCreateVisible(false);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not create group.');
    } finally {
      setCreating(false);
    }
  }

  if (!user) return null;

  return (
    <AuroraBackground>
      <ScreenHeader
        title="Groups"
        actions={
          <IconButton label="New group" variant="solid" onPress={() => setCreateVisible(true)}>
            <Ionicons name="add" size={20} color="#fff" />
          </IconButton>
        }
      />

      <View style={styles.searchWrap}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          onClear={() => setQuery('')}
          placeholder="Search people or groups..."
          autoCapitalize="none"
        />
      </View>

      {trimmedQuery.length > 0 ? (
        <FlatList
          data={searchRows}
          keyExtractor={row => (row.kind === 'group' ? `g:${row.group.group_id}` : `u:${row.user.user_id}`)}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: spacing.stackCard }} />}
          renderItem={({ item }) => {
            if (item.kind === 'group') {
              const g = item.group;
              const memberCount = g.user_id_list.length;
              return (
                <Pressable onPress={() => router.push(`/group/${g.group_id}`)}>
                  <GlassPanel tint="regular" radius={radius.card} padding={spacing.s8} sheen={false}>
                    <View style={styles.personRow}>
                      <Avatar initials={g.name.slice(0, 2)} src={g.image} size="l" />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.personName} numberOfLines={1}>{g.name}</Text>
                        <Text style={styles.personSub} numberOfLines={1}>
                          {memberCount} {memberCount === 1 ? 'member' : 'members'}
                        </Text>
                      </View>
                      <KindTag label="Group" />
                    </View>
                  </GlassPanel>
                </Pressable>
              );
            }

            const u = item.user;
            const sharedGroups = groups.filter(g => g.user_id_list.includes(u.user_id));
            return (
              <GlassPanel tint="regular" radius={radius.card} padding={spacing.s8} sheen={false}>
                <View style={styles.personRow}>
                  <Avatar initials={u.username.slice(0, 2)} src={u.image} size="l" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.personName} numberOfLines={1}>{u.username}</Text>
                    <Text style={styles.personSub} numberOfLines={1}>{u.phone_number ?? u.email}</Text>
                  </View>
                  <KindTag label="User" />
                </View>
                {sharedGroups.length > 0 ? (
                  <View style={styles.sharedGroupsRow}>
                    {sharedGroups.map(g => (
                      <Chip key={g.group_id} onPress={() => router.push(`/group/${g.group_id}`)}>
                        {g.name}
                      </Chip>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.noSharedGroups}>No groups in common yet</Text>
                )}
              </GlassPanel>
            );
          }}
          // Footer, not a full-screen swap: any group matches are already
          // on screen and shouldn't be replaced by a spinner belonging to
          // the people request.
          ListFooterComponent={
            searching ? <ActivityIndicator color={colors.coral400} style={{ marginTop: spacing.s8 }} /> : null
          }
          ListEmptyComponent={
            searching ? null : (
              <EmptyState
                icon="search-outline"
                title="No matches"
                hint="Try a different name, email, phone number or group name"
              />
            )
          }
        />
      ) : loading ? (
        <ActivityIndicator color={colors.coral400} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={g => g.group_id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: spacing.stackCard }} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.coral400} />
          }
          renderItem={({ item }) => (
            <GroupCard
              group={item}
              currentUserId={user.userId}
              imageUri={item.image}
              onPress={() => router.push(`/group/${item.group_id}`)}
            />
          )}
          ListEmptyComponent={
            <EmptyState icon="people-outline" title="No groups yet" hint="Tap + to create your first group" />
          }
        />
      )}

      {/* Create group sheet */}
      <Sheet title="New Group" open={createVisible} onClose={() => setCreateVisible(false)}>
        <Input
          label="Group name"
          placeholder="e.g. Family"
          value={groupName}
          onChangeText={setGroupName}
          autoFocus
          wrapperStyle={{ marginBottom: spacing.s8 }}
        />
        <Button variant="primary" block onPress={handleCreate} disabled={creating}>
          {creating ? <ActivityIndicator color="#fff" /> : 'Create'}
        </Button>
      </Sheet>
    </AuroraBackground>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.gutterScreen, paddingBottom: 130 },
  searchWrap: { paddingHorizontal: spacing.gutterScreen, marginTop: spacing.s6, marginBottom: spacing.s2 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s7 },
  personName: { fontFamily: fontFamily.uiBold, fontSize: fontSize.subheading, color: colors.textStrong },
  personSub: { fontFamily: fontFamily.ui, fontSize: fontSize.caption, color: colors.textMuted, marginTop: 2 },
  sharedGroupsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s4, marginTop: spacing.s7 },
  noSharedGroups: { fontFamily: fontFamily.ui, fontSize: fontSize.caption, color: colors.textMuted, marginTop: spacing.s7 },
  kindTag: {
    paddingHorizontal: spacing.s5,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(26,35,50,0.07)',
  },
  kindTagText: {
    fontFamily: fontFamily.uiBold,
    fontSize: fontSize.micro,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
