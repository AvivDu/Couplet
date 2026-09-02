import { useState, useCallback } from 'react';
import { useRefreshOnNotification } from '../../hooks/useRefreshOnNotification';
import {
  View,
  FlatList,
  ActivityIndicator,
  Alert,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, router } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { getGroups, createGroup } from '../../services/api';
import type { GroupMeta } from '../../services/api';
import GroupCard from '../../components/GroupCard';
import AuroraBackground from '../../components/ui/AuroraBackground';
import ScreenHeader from '../../components/ui/ScreenHeader';
import IconButton from '../../components/ui/IconButton';
import EmptyState from '../../components/ui/EmptyState';
import Sheet from '../../components/ui/Sheet';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { colors, spacing } from '../../constants/theme';

export default function ConnectionsScreen() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<GroupMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Create modal
  const [createVisible, setCreateVisible] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);


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

      {loading ? (
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
});
