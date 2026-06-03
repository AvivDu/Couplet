import { View, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Text } from './rn';
import type { GroupMeta } from '../services/api';

interface Props {
  group: GroupMeta;
  currentUserId: string;
  imageUri?: string | null;
  onPress: () => void;
}

export default function GroupCard({ group, currentUserId, imageUri, onPress }: Props) {
  const isAdmin = group.admin_user_id === currentUserId;
  const initials = group.name.slice(0, 2).toUpperCase();

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.82}>
      <View style={styles.left}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.groupImage} />
        ) : (
          <View style={styles.groupImageFallback}>
            <Text style={styles.fallbackText}>{initials}</Text>
          </View>
        )}
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
  left: { marginRight: 14 },
  groupImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  groupImageFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E8604C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: { fontSize: 16, fontWeight: '800', color: '#fff' },
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
