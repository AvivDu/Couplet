import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from './Avatar';
import { colors, spacing, radius, fontFamily, fontSize } from '../../constants/theme';

export interface StripMember {
  id: string;
  name: string;
  initials?: string;
  color?: string;
  you?: boolean;
}

interface MemberStripProps {
  members: StripMember[];
  onAdd?: () => void;
  showAdd?: boolean;
}

export default function MemberStrip({ members, onAdd, showAdd = true }: MemberStripProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.root}>
      {showAdd && (
        <Pressable onPress={onAdd} style={styles.item}>
          <View style={styles.addCircle}>
            <Ionicons name="add" size={20} color={colors.coral400} />
          </View>
          <Text style={[styles.name, { color: colors.coral400 }]}>Add</Text>
        </Pressable>
      )}
      {members.map(m => (
        <View key={m.id} style={styles.item}>
          <Avatar initials={m.initials ?? m.name.slice(0, 2)} color={m.you ? colors.coral400 : (m.color ?? colors.accentTag)} ring={m.you} />
          <Text style={styles.name} numberOfLines={1}>{m.you ? 'You' : m.name}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', gap: spacing.s7, paddingHorizontal: spacing.gutterScreen, paddingBottom: spacing.s7 },
  item: { width: 56, alignItems: 'center', gap: spacing.s3 },
  addCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.coral100,
    borderWidth: 1.5,
    borderColor: colors.coral400,
    borderStyle: 'dashed',
  },
  name: { fontFamily: fontFamily.uiSemibold, fontSize: fontSize.nano, color: colors.textStrong, maxWidth: 56 },
});
