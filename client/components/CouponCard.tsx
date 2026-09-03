import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Avatar from './ui/Avatar';
import Badge from './ui/Badge';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '../constants/categories';
import { colors, glass, blur, radius, spacing, fontFamily, fontSize, elevation } from '../constants/theme';
import { formatBalance } from '../utils/format';

interface Props {
  store: string;
  category: string;
  balance?: number | null;
  expires?: string | null;
  status?: 'active' | 'used' | 'expired';
  /** Shown for group-shared coupons: "You" or a member's first name. */
  sender?: string;
  senderColor?: string;
  senderImage?: string | null;
  sharedAt?: string;
  /** Extra control at the end of the sender row, e.g. an admin's remove affordance. */
  senderTrailing?: React.ReactNode;
  /** Full-width action node, e.g. a Revoke/Use-coupon Button. */
  action?: React.ReactNode;
  /** Grid variant — smaller padding, title and tile. */
  dense?: boolean;
  onPress?: () => void;
}

export default function CouponCard({
  store, category, balance, expires, status = 'active',
  sender, senderColor = colors.coral500, senderImage, sharedAt, senderTrailing, action, dense = false, onPress,
}: Props) {
  const tint = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.Other;
  const icon = (CATEGORY_ICONS[category] ?? 'ellipsis-horizontal-outline') as keyof typeof Ionicons.glyphMap;
  const used = status !== 'active';
  const pad = dense ? spacing.gutterCardDense : spacing.gutterCard;

  return (
    <Pressable onPress={onPress} style={[styles.root, { opacity: used ? 0.58 : 1 }, elevation.card as object]}>
      <BlurView pointerEvents="none" intensity={blur.m} tint="light" style={StyleSheet.absoluteFill} />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,.86)', 'rgba(255,255,255,.66)']}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tint, opacity: 0.55 }]} />
      <LinearGradient
        pointerEvents="none"
        colors={glass.sheenColors as unknown as [string, string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={{ padding: pad, gap: dense ? spacing.s5 : spacing.s6 }}>
        {sender && (
          <View style={styles.senderRow}>
            <Avatar initials={sender.slice(0, 2)} src={senderImage} size="xs" color={senderColor} />
            <Text style={[styles.senderName, { color: senderColor }]}>{sender}</Text>
            {sharedAt && <Text style={styles.sharedAt}>{sharedAt}</Text>}
            {senderTrailing && <View style={sharedAt ? undefined : styles.senderTrailingAuto}>{senderTrailing}</View>}
          </View>
        )}
        {sender && <View style={styles.perforation} />}

        <View style={styles.body}>
          <View style={[styles.iconTile, { width: dense ? 40 : 46, height: dense ? 40 : 46 }]}>
            <Ionicons name={icon} size={dense ? 22 : 26} color={colors.accentTag} />
          </View>
          <View style={styles.info}>
            <Text style={[styles.store, dense && { fontSize: fontSize.bodyS }]} numberOfLines={1}>{store}</Text>
            <Text style={styles.category}>{category}</Text>
            {balance != null && (
              <Text style={styles.balance}>
                ₪{formatBalance(balance)} <Text style={styles.balanceLabel}>remaining</Text>
              </Text>
            )}
            {expires && (
              <Text style={styles.expires}>{dense ? 'Exp ' : 'Expires '}{expires}</Text>
            )}
          </View>
          {used && <Badge tone="ink" uppercase>{status}</Badge>}
        </View>

        {action}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { borderRadius: radius.card, borderWidth: 1, borderColor: glass.edge, overflow: 'hidden' },
  senderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s4 },
  senderName: { fontFamily: fontFamily.uiBold, fontSize: fontSize.caption },
  sharedAt: { marginLeft: 'auto', fontFamily: fontFamily.ui, fontSize: fontSize.micro, color: colors.textMuted },
  senderTrailingAuto: { marginLeft: 'auto' },
  perforation: { height: 1, borderTopWidth: 1, borderColor: 'rgba(26,35,50,.22)', borderStyle: 'dashed', opacity: 0.35 },
  body: { flexDirection: 'row', alignItems: 'center', gap: spacing.s6 },
  iconTile: { borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(214,167,122,.18)' },
  info: { flex: 1, minWidth: 0 },
  store: { fontFamily: fontFamily.uiBold, fontSize: fontSize.subheading, color: colors.textStrong },
  category: { marginTop: 2, fontFamily: fontFamily.ui, fontSize: fontSize.caption, color: colors.textMuted },
  balance: { marginTop: 4, fontFamily: fontFamily.mono, fontSize: fontSize.bodyS, color: colors.textStrong },
  balanceLabel: { fontFamily: fontFamily.ui, fontSize: fontSize.caption, color: colors.textMuted },
  expires: { marginTop: 4, fontFamily: fontFamily.ui, fontSize: fontSize.micro, color: colors.textMuted },
});
