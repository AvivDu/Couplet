import { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { getGroups, createGroup } from '../../services/api';
import type { GroupMeta } from '../../services/api';
import GroupCard from '../../components/GroupCard';
import GroupDetail from '../../components/GroupDetail';

export default function ConnectionsScreen() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<GroupMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Create modal
  const [createVisible, setCreateVisible] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);

  // Detail modal
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  async function fetchGroups() {
    try {
      const { data } = await getGroups();
      setGroups(data);
    } catch {
      // silently fail on background refresh
    }
  }

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchGroups().finally(() => setLoading(false));
    }, [])
  );

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

  function openDetail(groupId: string) {
    setSelectedGroupId(groupId);
    setDetailVisible(true);
  }

  if (!user) return null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Groups</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setCreateVisible(true)}>
          <Text style={styles.addBtnText}>＋</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#E8604C" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={g => g.group_id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#E8604C" />
          }
          renderItem={({ item }) => (
            <GroupCard
              group={item}
              currentUserId={user.userId}
              onPress={() => openDetail(item.group_id)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>👥</Text>
              <Text style={styles.emptyTitle}>No groups yet</Text>
              <Text style={styles.emptySub}>Tap ＋ to create your first group</Text>
            </View>
          }
        />
      )}

      {/* Create group modal */}
      <Modal
        visible={createVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCreateVisible(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setCreateVisible(false)}
        >
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>New Group</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                placeholder="Group name (e.g. Family)"
                placeholderTextColor="#A8997A"
                value={groupName}
                onChangeText={setGroupName}
                autoFocus
              />
            </View>
            <TouchableOpacity
              style={styles.createBtn}
              onPress={handleCreate}
              disabled={creating}
            >
              {creating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.createBtnText}>Create</Text>
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Group detail modal */}
      <GroupDetail
        groupId={selectedGroupId}
        visible={detailVisible}
        onClose={() => {
          setDetailVisible(false);
          fetchGroups(); // refresh list when detail closes
        }}
        currentUserId={user.userId}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F0E6' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  title: { fontSize: 28, fontWeight: '800', color: '#1A2332' },
  addBtn: {
    backgroundColor: '#E8604C',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { color: '#fff', fontSize: 22, lineHeight: 26 },
  list: { paddingHorizontal: 20, paddingBottom: 32 },

  // Empty state
  empty: { alignItems: 'center', marginTop: 80, gap: 10 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1A2332' },
  emptySub: { fontSize: 14, color: '#A8997A' },

  // Create sheet
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(26,35,50,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#F5F0E6',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C4B8A0',
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1A2332',
    marginBottom: 20,
  },
  inputWrap: {
    borderBottomWidth: 1.5,
    borderBottomColor: '#C4B8A0',
    marginBottom: 28,
  },
  input: {
    paddingVertical: 10,
    fontSize: 16,
    color: '#1A2332',
  },
  createBtn: {
    backgroundColor: '#E8604C',
    borderRadius: 30,
    paddingVertical: 15,
    alignItems: 'center',
  },
  createBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
