import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Swipeable } from 'react-native-gesture-handler';
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
  // Tap-to-navigate target + the server notification id to delete on tap.
  navigateGroupId?: string;
  serverId?: string;
};

interface Props {
  visible: boolean;
  notifications: NotificationItem[];
  onClose: () => void;
  onAcceptInvite: (groupId: string) => Promise<void>;
  onDeclineInvite: (groupId: string) => Promise<void>;
  onDismissNotification: (id: string) => void;
  onPressItem: (item: NotificationItem) => void;
}

function DeleteAction() {
  return (
    <View style={styles.deleteAction}>
      <Ionicons name="trash-outline" size={22} color="#fff" />
    </View>
  );
}

function NotifCard({ item, onAccept, onDecline, onDismiss, onPress }: {
  item: NotificationItem;
  onAccept: () => void;
  onDecline: () => void;
  onDismiss: () => void;
  onPress: () => void;
}) {
  const stripeColor =
    item.type === 'coupon'
      ? (CATEGORY_COLORS[item.category ?? ''] ?? CATEGORY_COLORS.Other)
      : '#FFB7B2';

  const icon: keyof typeof Ionicons.glyphMap =
    item.type === 'coupon' ? 'time-outline' : 'people-outline';

  // Invite cards use Accept/Decline; any other card with a group target taps to navigate.
  const navigable = item.actionType !== 'group_invite' && !!item.navigateGroupId;

  const cardInner = (
    <View style={[styles.card, item.read && styles.cardRead]}>
      <View style={[styles.stripe, { backgroundColor: stripeColor }]} />
      <View style={styles.cardBody}>
        <Ionicons name={icon} size={22} color="#E8604C" />
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
        {navigable && <Ionicons name="chevron-forward" size={18} color="#C4B8A0" />}
      </View>
    </View>
  );

  return (
    <Swipeable
      renderRightActions={() => <DeleteAction />}
      renderLeftActions={() => <DeleteAction />}
      onSwipeableOpen={onDismiss}
      overshootLeft={false}
      overshootRight={false}
      containerStyle={styles.swipeContainer}
    >
      {navigable ? (
        <TouchableOpacity activeOpacity={0.85} onPress={onPress}>{cardInner}</TouchableOpacity>
      ) : (
        cardInner
      )}
    </Swipeable>
  );
}

export default function NotificationPanel({ visible, notifications, onClose, onAcceptInvite, onDeclineInvite, onDismissNotification, onPressItem }: Props) {
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
                onPress={() => onPressItem(item)}
              />
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#EDE7D9' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1.5,
    borderBottomColor: '#C4B8A0',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#1A2332' },
  closeBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  list: { paddingVertical: 12, paddingBottom: 60 },
  swipeContainer: {
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 16,
  },
  card: {
    flexDirection: 'row',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#C4B8A0',
    shadowColor: '#1A2332',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  cardRead: { backgroundColor: '#F7F2EA', borderColor: '#D6CCBA' },
  stripe: { width: 8, alignSelf: 'stretch' },
  cardBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  textBlock: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#1A2332', marginBottom: 3 },
  cardSub: { fontSize: 13, fontWeight: '500', color: '#4A3F30', lineHeight: 18 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1A2332' },
  emptyHint: { fontSize: 14, color: '#7A6A55' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  acceptBtn: { backgroundColor: '#E8604C', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 7 },
  acceptBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  declineBtn: { borderWidth: 1.5, borderColor: '#8A7A65', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 7 },
  declineBtnText: { fontSize: 13, fontWeight: '700', color: '#1A2332' },
  deleteAction: {
    backgroundColor: '#C0392B',
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    borderRadius: 16,
  },
});
