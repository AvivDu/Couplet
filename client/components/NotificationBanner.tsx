import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Text } from './rn';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, glass, blur, radius, fontFamily, fontSize, elevation } from '../constants/theme';

export type BannerData = {
  id: string;
  title: string;
  body: string;
  icon?: keyof typeof Ionicons.glyphMap;
};

// A lightweight top toast shown when a live notification arrives while the app
// is open (foreground-only delivery — this is the honest UX for Expo Go, no
// native push). Tapping it triggers onPress; it auto-dismisses after a few sec.
export default function NotificationBanner({
  data,
  onPress,
  onDismiss,
}: {
  data: BannerData | null;
  onPress: (data: BannerData) => void;
  onDismiss: () => void;
}) {
  const slide = useRef(new Animated.Value(-120)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!data) return;
    Animated.spring(slide, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
    timer.current = setTimeout(hide, 4500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id]);

  function hide() {
    Animated.timing(slide, { toValue: -120, duration: 200, useNativeDriver: true }).start(
      ({ finished }) => finished && onDismiss()
    );
  }

  if (!data) return null;

  return (
    <Animated.View
      style={[styles.wrap, { transform: [{ translateY: slide }] }]}
      pointerEvents="box-none"
    >
      <SafeAreaView edges={['top']}>
        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.card}
          onPress={() => {
            if (timer.current) clearTimeout(timer.current);
            onPress(data);
          }}
        >
          <BlurView intensity={blur.l} tint="light" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: glass.thick }]} />
          <Ionicons name={data.icon ?? 'notifications'} size={22} color={colors.coral400} style={styles.icon} />
          <View style={styles.textBlock}>
            <Text style={styles.title} numberOfLines={1}>{data.title}</Text>
            <Text style={styles.body} numberOfLines={2}>{data.body}</Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={hide} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={18} color={colors.tan600} />
          </TouchableOpacity>
        </TouchableOpacity>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1000, paddingHorizontal: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderColor: glass.edge,
    overflow: 'hidden',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 6,
    ...(elevation.panel as object),
  },
  icon: {},
  closeBtn: {},
  textBlock: { flex: 1 },
  title: { fontFamily: fontFamily.uiBlack, fontSize: fontSize.bodyS, color: colors.textStrong, marginBottom: 2 },
  body: { fontFamily: fontFamily.ui, fontSize: fontSize.caption, color: colors.textBody, lineHeight: 17 },
});
