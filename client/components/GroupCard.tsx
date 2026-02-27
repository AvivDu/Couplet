import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { GroupMeta } from '../services/api';

interface Props {
  group: GroupMeta;
  currentUserId: string;
  onPress: () => void;
}

export default function GroupCard({ group, currentUserId, onPress }: Props) {
  const isAdmin = group.admin_user_id === currentUserId;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.82}>
      <View style={styles.left}>
        <Text style={styles.icon}>👥</Text>
      </View>
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{group.name}</Text>
          {isAdmin && <View style={styles.adminBadge}><Text style={styles.adminBadgeText}>Admin</Text></View>}
        </View>
        <Text style={styles.sub}>
          {group.user_id_list.length} {group.user_id_list.length === 1 ? 'member' : 'members'}
          {group.coupon_id_list.length > 0
            ? ` · ${group.coupon_id_list.length} coupon${group.coupon_id_list.length === 1 ? '' : 's'} shared`
            : ''}
        </Text>
      </View>
      <Text style={styles.arrow}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#1A2332',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  left: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5F0E6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  icon: { fontSize: 22 },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  name: { fontSize: 16, fontWeight: '700', color: '#1A2332' },
  adminBadge: {
    backgroundColor: 'rgba(232,96,76,0.12)',
    borderRadius: 10,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  adminBadgeText: { fontSize: 11, fontWeight: '700', color: '#E8604C' },
  sub: { fontSize: 13, color: '#A8997A' },
  arrow: { fontSize: 22, color: '#C4B8A0', marginLeft: 8 },
});
