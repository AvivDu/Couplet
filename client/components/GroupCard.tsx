import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import GlassEdge from './ui/GlassEdge';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Avatar from './ui/Avatar';
import Badge from './ui/Badge';
import type { GroupMeta } from '../services/api';
import { colors, glass, blur, radius, spacing, fontFamily, fontSize, elevation } from '../constants/theme';

interface Props {
  group: GroupMeta;
  currentUserId: string;
  imageUri?: string | null;
  onPress: () => void;
}

export default function GroupCard({ group, currentUserId, imageUri, onPress }: Props) {
  const isAdmin = group.admin_user_id === currentUserId;
  const initials = group.name.slice(0, 2).toUpperCase();
  const memberCount = group.user_id_list.length;
  const couponCount = group.coupon_id_list.length;
  const sub = `${memberCount} ${memberCount === 1 ? 'member' : 'members'}`
    + (couponCount > 0 ? ` · ${couponCount} coupon${couponCount === 1 ? '' : 's'} shared` : '');

  return (
    <Pressable onPress={onPress} style={[styles.root, elevation.raised as object]}>
      <BlurView pointerEvents="none" intensity={blur.m} tint="light" style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: glass.thick }]} />
      <GlassEdge />
      <LinearGradient
        pointerEvents="none"
        colors={glass.sheenColors as unknown as [string, string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>
        <Avatar initials={initials} src={imageUri} size="xl" />
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{group.name}</Text>
            {isAdmin && <Badge>Admin</Badge>}
          </View>
          <Text style={styles.sub}>{sub}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.cream400} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { borderRadius: radius.card, borderWidth: 1, borderColor: glass.edge, overflow: 'hidden' },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.s7, padding: spacing.s8 },
  info: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s4, marginBottom: 3 },
  name: { fontFamily: fontFamily.uiBold, fontSize: fontSize.subheading, color: colors.textStrong, flexShrink: 1 },
  sub: { fontFamily: fontFamily.ui, fontSize: fontSize.caption, color: colors.textMuted },
});
