import { View, StyleSheet, Modal, ScrollView, TouchableOpacity } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import AuroraBackground from './ui/AuroraBackground';
import ScreenHeader from './ui/ScreenHeader';
import IconButton from './ui/IconButton';
import NotificationCard from './ui/NotificationCard';
import EmptyState from './ui/EmptyState';
import Button from './ui/Button';
import { colors, spacing } from '../constants/theme';

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
  // Invite cards use Accept/Decline; any other card with a group target taps to navigate.
  const navigable = item.actionType !== 'group_invite' && !!item.navigateGroupId;

  const card = (
    <NotificationCard
      kind={item.type}
      category={item.category}
      title={item.title}
      body={item.body}
      read={item.read}
      navigable={navigable}
      actions={item.actionType === 'group_invite' ? (
        <>
          <Button size="s" onPress={onAccept}>Accept</Button>
          <Button size="s" variant="outline" onPress={onDecline}>Decline</Button>
        </>
      ) : undefined}
    />
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
        <TouchableOpacity activeOpacity={0.85} onPress={onPress}>{card}</TouchableOpacity>
      ) : (
        card
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
      <AuroraBackground>
        <ScreenHeader
          title="Notifications"
          actions={
            <IconButton label="Close" variant="bare" size="l" onPress={onClose}>
              <Ionicons name="close" size={22} color={colors.textStrong} />
            </IconButton>
          }
        />

        {notifications.length === 0 ? (
          <View style={styles.empty}>
            <EmptyState icon="notifications-off-outline" title="All caught up!" hint="No new notifications." />
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
      </AuroraBackground>
    </Modal>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, justifyContent: 'center' },
  list: { paddingVertical: spacing.s6, paddingHorizontal: spacing.gutterScreen, gap: spacing.s6, paddingBottom: 60 },
  swipeContainer: {
    borderRadius: 16,
  },
  deleteAction: {
    backgroundColor: colors.stateDanger,
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    borderRadius: 16,
  },
});
