import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from './rn';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

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
          <Ionicons name={data.icon ?? 'notifications'} size={22} color="#E8604C" />
          <View style={styles.textBlock}>
            <Text style={styles.title} numberOfLines={1}>{data.title}</Text>
            <Text style={styles.body} numberOfLines={2}>{data.body}</Text>
          </View>
          <TouchableOpacity onPress={hide} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={18} color="#8A7A65" />
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
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#C4B8A0',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 6,
    shadowColor: '#1A2332',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  textBlock: { flex: 1 },
  title: { fontSize: 15, fontWeight: '800', color: '#1A2332', marginBottom: 2 },
  body: { fontSize: 13, fontWeight: '500', color: '#4A3F30', lineHeight: 17 },
});
