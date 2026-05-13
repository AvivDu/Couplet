import { useRef } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, Animated, PanResponder } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CATEGORY_COLORS } from '../constants/categories';

export type NotificationItem = {
  id: string;
  type: 'coupon' | 'social';
  title: string;
  body: string;
  category?: string;
  read: boolean;
  actionType?: 'group_invite';
  actionGroupId?: string;
  actionGroupName?: string;
};

interface Props {
  visible: boolean;
  notifications: NotificationItem[];
  onClose: () => void;
  onAcceptInvite: (groupId: string) => Promise<void>;
  onDeclineInvite: (groupId: string) => Promise<void>;
  onDismissNotification: (id: string) => void;
}

function NotifCard({ item, onAccept, onDecline, onDismiss }: {
  item: NotificationItem;
  onAccept: () => void;
  onDecline: () => void;
  onDismiss: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = translateX.interpolate({
    inputRange: [-200, -60, 0, 60, 200],
    outputRange: [0, 0.5, 1, 0.5, 0],
    extrapolate: 'clamp',
  });

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, { dx, dy }) =>
      Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy),
    onPanResponderMove: (_, { dx }) => translateX.setValue(dx),
    onPanResponderRelease: (_, { dx }) => {
      if (Math.abs(dx) > 80) {
        Animated.timing(translateX, {
          toValue: dx > 0 ? 500 : -500,
          duration: 200,
          useNativeDriver: true,
        }).start(onDismiss);
      } else {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
      }
    },
  })).current;

  const stripeColor =
    item.type === 'coupon'
      ? (CATEGORY_COLORS[item.category ?? ''] ?? CATEGORY_COLORS.Other)
      : '#FFB7B2';

  const icon: keyof typeof Ionicons.glyphMap =
    item.type === 'coupon' ? 'time-outline' : 'people-outline';

  return (
    <Animated.View
      style={[styles.card, item.read && styles.cardRead, { transform: [{ translateX }], opacity }]}
      {...panResponder.panHandlers}
    >
      <View style={[styles.stripe, { backgroundColor: stripeColor }]} />
      <View style={styles.cardBody}>
        <Ionicons name={icon} size={20} color="#444444" />
        <View style={styles.textBlock}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.cardSub}>{item.body}</Text>
          {item.actionType === 'group_invite' && (
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.acceptBtn} onPress={onAccept}>
                <Text style={styles.acceptBtnText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.declineBtn} onPress={onDecline}>
                <Text style={styles.declineBtnText}>Decline</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

export default function NotificationPanel({ visible, notifications, onClose, onAcceptInvite, onDeclineInvite, onDismissNotification }: Props) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Notifications</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={22} color="#1A2332" />
          </TouchableOpacity>
        </View>

        {notifications.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={52} color="#C4B8A0" />
            <Text style={styles.emptyTitle}>All caught up!</Text>
            <Text style={styles.emptyHint}>No new notifications.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list}>
            {notifications.map(item => (
              <NotifCard
                key={item.id}
                item={item}
                onAccept={() => item.actionGroupId && onAcceptInvite(item.actionGroupId)}
                onDecline={() => item.actionGroupId && onDeclineInvite(item.actionGroupId)}
                onDismiss={() => onDismissNotification(item.id)}
              />
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F0E6' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0D8CA',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#1A2332' },
  closeBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  list: { paddingVertical: 10, paddingBottom: 60 },
  card: {
    flexDirection: 'row',
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 7,
    backgroundColor: '#fff',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  cardRead: { opacity: 0.6 },
  stripe: { width: 5, alignSelf: 'stretch' },
  cardBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  textBlock: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1A2332', marginBottom: 2 },
  cardSub: { fontSize: 13, color: '#1A2332', opacity: 0.55 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1A2332' },
  emptyHint: { fontSize: 14, color: '#1A2332', opacity: 0.45 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  acceptBtn: { backgroundColor: '#E8604C', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 7 },
  acceptBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  declineBtn: { borderWidth: 1.5, borderColor: '#C4B8A0', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 7 },
  declineBtnText: { fontSize: 13, fontWeight: '700', color: '#1A2332' },
});
