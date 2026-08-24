import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
  FlatList,
  Modal,
  ActivityIndicator,
  Switch,
  StatusBar,
} from 'react-native';
import { Text, TextInput } from '../rn';
import * as Location from 'expo-location';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { getCouponImage } from '../../storage/couponStorage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getGroups, shareToGroup, rescueCode, getCouponLocations } from '../../services/api';
import type { GroupMeta, StoreLocation, CouponMeta, RedeemAction } from '../../services/api';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '../../constants/categories';
import type { CouponWithCode } from './types';
import { formatBalance, maskBalanceInput } from '../../utils/format';
import { startShareSession } from '../../services/webrtc';
import { inspectShareable, unusableShareMessage } from '../../services/couponSharing';
import { useNotifications } from '../../context/NotificationsContext';

interface CouponDisplayProps {
  coupon: CouponWithCode;
  // Non-owners open this from the group screen to redeem a shared coupon;
  // owner-only controls (edit/share/delete) are hidden for them.
  isOwner: boolean;
  onEdit: () => void;
  onDelete: (id: string) => void;
  onRedeem: (id: string, action: RedeemAction) => Promise<CouponMeta>;
  onUpdate: (updated: CouponMeta, newCode: string) => void;
  onClose: () => void;
}

export default function CouponDisplay({ coupon, isOwner, onEdit, onDelete, onRedeem, onUpdate, onClose }: CouponDisplayProps) {
  const [imageUri, setImageUri] = React.useState<string | null>(null);
  const [imageNatSize, setImageNatSize] = React.useState<{ w: number; h: number } | null>(null);
  const [fullscreenVisible, setFullscreenVisible] = React.useState(false);
  const [showTextCode, setShowTextCode] = React.useState(true);
  const insets = useSafeAreaInsets();
  const [groupPickerVisible, setGroupPickerVisible] = React.useState(false);
  const [groups, setGroups] = React.useState<GroupMeta[]>([]);
  const [sharingGroupId, setSharingGroupId] = React.useState<string | null>(null);
  const [locationsVisible, setLocationsVisible] = React.useState(false);
  const [locations, setLocations] = React.useState<StoreLocation[]>([]);
  const [locationsLoading, setLocationsLoading] = React.useState(false);
  const [redeemModalVisible, setRedeemModalVisible] = React.useState(false);
  const [partialAmount, setPartialAmount] = React.useState('');
  const [partialLoading, setPartialLoading] = React.useState(false);
  const [redeemAllLoading, setRedeemAllLoading] = React.useState(false);
  const { sendSignal, bump } = useNotifications();

  // A rejected redeem means this screen's copy of the coupon is out of date -
  // someone else changed it underneath us. Leaving the sheet open invites
  // another attempt against the same stale numbers (which is how Redeem All
  // slipped past a balance that had already been drained), so close back to
  // the list and refresh it before telling the user what happened.
  function failRedeem(err: any) {
    onClose();
    bump();
    Alert.alert('Could not redeem', err?.response?.data?.error ?? 'Please try again.');
  }

  React.useEffect(() => {
    getCouponImage(coupon.coupon_id).then(uri => {
      setImageUri(uri);
      if (uri !== null) setShowTextCode(false);
    });
  }, [coupon.coupon_id]);

  async function handleShareToGroup() {
    try {
      const { data } = await getGroups();
      if (data.length === 0) {
        Alert.alert('No groups', 'You have no groups yet. Create one in the Groups tab.');
        return;
      }
      setGroups(data);
      setGroupPickerVisible(true);
    } catch {
      Alert.alert('Error', 'Could not load groups.');
    }
  }

  async function handleShareToGroupConfirm(group: GroupMeta) {
    // Nothing to send for this coupon? Say so before sharing, rather than
    // letting the recipient open an empty coupon with no explanation.
    const info = await inspectShareable(coupon.coupon_id, coupon.giftcard_url);
    if (!info.willBeUsable) {
      Alert.alert('Share anyway?', unusableShareMessage(info), [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Share anyway', onPress: () => shareToGroupNow(group) },
      ]);
      return;
    }
    await shareToGroupNow(group);
  }

  async function shareToGroupNow(group: GroupMeta) {
    setSharingGroupId(group.group_id);
    try {
      // Offline members get the code stored server-side as a fallback; online
      // members get it via a direct WebRTC data channel negotiated below -
      // the server never sees the code for them.
      const { data } = await shareToGroup(group.group_id, coupon.coupon_id, coupon.code);
      console.log(
        '[share] online recipients:', data.online_recipient_ids ?? [],
        '- offline members get the encrypted DB fallback instead'
      );
      if (coupon.code) {
        // Tolerate a server that predates online_recipient_ids: the share
        // itself already succeeded, so degrade to "no P2P targets" rather
        // than throwing and reporting a failed share to the user.
        (data.online_recipient_ids ?? []).forEach(uid =>
          startShareSession(sendSignal, uid, coupon.coupon_id, coupon.code!, () => {
            // Last line of defence: P2P already failed, so if this also fails
            // the code reaches nobody. Log it rather than swallowing silently.
            rescueCode(group.group_id, coupon.coupon_id, uid, coupon.code!).catch(err =>
              console.warn('[share] rescue-code write failed for recipient', uid, err?.message ?? err)
            );
          })
        );
      }
      setGroupPickerVisible(false);
      Alert.alert('Shared!', `Coupon shared to "${group.name}".`);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not share coupon.');
    } finally {
      setSharingGroupId(null);
    }
  }

  async function handleWhereToUse() {
    setLocationsLoading(true);
    setLocationsVisible(true);
    setLocations([]);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location needed', 'Please allow location access to find nearby stores.');
        setLocationsVisible(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { data } = await getCouponLocations(coupon.coupon_id, pos.coords.latitude, pos.coords.longitude);
      setLocations(data);
    } catch {
      Alert.alert('Error', 'Could not load nearby locations.');
      setLocationsVisible(false);
    } finally {
      setLocationsLoading(false);
    }
  }

  async function handleRedeemAll() {
    setRedeemAllLoading(true);
    try {
      const updated = await onRedeem(coupon.coupon_id, { redeem_all: true });
      onUpdate(updated, coupon.code ?? '');
      setRedeemModalVisible(false);
      onClose();
    } catch (err: any) {
      setRedeemModalVisible(false);
      failRedeem(err);
    } finally {
      setRedeemAllLoading(false);
    }
  }

  async function handlePartialRedeem() {
    // Unreachable while invalid - the Confirm button is disabled and the
    // reason is shown inline (see partialError). Kept as a guard only.
    if (partialError || parsedPartialAmount === null) return;
    const amount = parsedPartialAmount;
    // Client-side validation is an affordance, not enforcement - the server
    // applies the decrement atomically and is the authority on the result,
    // which matters when another member redeems the same coupon at once.
    setPartialLoading(true);
    try {
      const updated = await onRedeem(coupon.coupon_id, { amount });
      onUpdate(updated, coupon.code ?? '');
      setRedeemModalVisible(false);
      setPartialAmount('');
      // Close back to the list either way, so the next action always starts
      // from freshly-fetched numbers rather than this screen's snapshot.
      onClose();
      if (updated.status === 'used') {
        Alert.alert('Fully Redeemed', 'Balance is now zero.');
      } else {
        Alert.alert('Success', `₪${formatBalance(amount)} redeemed. Remaining: ₪${formatBalance(updated.balance ?? 0)}.`);
      }
    } catch (err: any) {
      setRedeemModalVisible(false);
      failRedeem(err);
    } finally {
      setPartialLoading(false);
    }
  }

  // Partial-redeem validation, derived from the input rather than stored, so
  // the Confirm button and the inline message can never drift out of sync.
  // `null` = nothing usable typed yet (button disabled, but no scolding).
  const currentBalance = coupon.balance ?? 0;
  const canPartialRedeem = coupon.balance != null && coupon.balance > 0;
  const parsedPartialAmount = partialAmount.trim() === '' ? null : Number(partialAmount);
  const partialError =
    parsedPartialAmount === null
      ? null // nothing typed yet - don't scold before they've started
      : Number.isNaN(parsedPartialAmount)
        ? 'Enter a valid number.'
        : parsedPartialAmount <= 0
          ? 'Enter an amount greater than 0.'
          : parsedPartialAmount > currentBalance
            ? `That's more than the ₪${formatBalance(currentBalance)} left on this coupon.`
            : null;
  // The only silently-disabled state is "nothing typed", which is self-evident;
  // every other disabled state has a message next to it.
  const partialConfirmDisabled =
    partialLoading || redeemAllLoading || parsedPartialAmount === null || partialError !== null;

  const color = CATEGORY_COLORS[coupon.category] ?? CATEGORY_COLORS.Other;
  const categoryIcon = (CATEGORY_ICONS[coupon.category] ?? 'ellipsis-horizontal-outline') as any;
  const expiry = coupon.expiration_date
    ? new Date(coupon.expiration_date).toLocaleDateString()
    : 'No expiry';
  const balance = coupon.balance != null ? `₪${formatBalance(coupon.balance)}` : '-';

  return (
    <>
    {/* Fullscreen barcode viewer */}
    {imageUri && (
      <Modal visible={fullscreenVisible} animationType="fade" statusBarTranslucent>
        <View style={[styles.fullscreenRoot, { paddingTop: insets.top }]}>
          <StatusBar barStyle="light-content" backgroundColor="#000" />
          <TouchableOpacity style={styles.fullscreenClose} onPress={() => setFullscreenVisible(false)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <Image source={{ uri: imageUri }} style={styles.fullscreenImage} resizeMode="contain" />
        </View>
      </Modal>
    )}
    <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

      {/* Coupon card */}
      <View style={[styles.couponCard, { backgroundColor: color }]}>
        <Ionicons name={categoryIcon} size={28} color="#1A2332" style={styles.categoryIcon} />
        <Text style={styles.couponStore}>{coupon.store_name}</Text>
        <Text style={styles.couponCategory}>{coupon.category}</Text>

        {coupon.giftcard_url ? (
          <TouchableOpacity
            style={styles.giftCardButton}
            onPress={() => WebBrowser.openBrowserAsync(coupon.giftcard_url!)}
            activeOpacity={0.85}
          >
            <Ionicons name="link" size={22} color="#1A2332" style={{ marginRight: 8 }} />
            <Text style={styles.giftCardButtonText}>Open Live Gift Card</Text>
          </TouchableOpacity>
        ) : (
          <>
            {imageUri !== null && !showTextCode && (
              <TouchableOpacity
                style={imageNatSize
                  ? [styles.imageBoxBase, { aspectRatio: imageNatSize.w / imageNatSize.h }]
                  : styles.imageBox}
                onPress={() => setFullscreenVisible(true)}
                activeOpacity={0.85}
              >
                <Image
                  source={{ uri: imageUri }}
                  style={styles.uploadedImage}
                  resizeMode="contain"
                  onLoad={e => {
                    const { width: w, height: h } = e.nativeEvent.source;
                    setImageNatSize({ w, h });
                  }}
                />
              </TouchableOpacity>
            )}

            {(showTextCode || imageUri === null) && (
              <View style={styles.codeLarge}>
                <Text style={styles.codeLargeText}>{coupon.code ?? '-'}</Text>
              </View>
            )}

            {imageUri !== null && (
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>
                  {showTextCode ? 'Switch to QR Code' : 'Switch to Text Code'}
                </Text>
                <Switch
                  value={showTextCode}
                  onValueChange={setShowTextCode}
                  trackColor={{ false: 'rgba(26,35,50,0.18)', true: 'rgba(26,35,50,0.45)' }}
                  thumbColor="#fff"
                />
              </View>
            )}
          </>
        )}
      </View>

      {/* Details card */}
      <View style={styles.detailsSection}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Balance</Text>
          <Text style={styles.balanceValue}>{balance}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Expires</Text>
          <View style={styles.detailRowRight}>
            <Text style={styles.detailValue}>{expiry}</Text>
            <Ionicons name="hourglass-outline" size={15} color="#A8997A" />
          </View>
        </View>
        <View style={[styles.detailRow, styles.detailRowLast]}>
          <Text style={styles.detailLabel}>Status</Text>
          <View style={styles.detailRowRight}>
            {coupon.status === 'active' && <View style={styles.statusDot} />}
            <Text style={[styles.detailValue, coupon.status !== 'active' && styles.statusUsed]}>
              {coupon.status.charAt(0).toUpperCase() + coupon.status.slice(1)}
            </Text>
          </View>
        </View>
      </View>

      {/* Primary action - Redeem */}
      {coupon.status === 'active' && (
        <TouchableOpacity
          style={styles.redeemBtn}
          onPress={() => setRedeemModalVisible(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.redeemBtnText}>Redeem</Text>
        </TouchableOpacity>
      )}

      {/* Secondary actions - Edit + Share (owner-only server-side) */}
      {isOwner && (
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.editBtn} onPress={onEdit}>
            <Ionicons name="pencil-outline" size={16} color="#E8604C" />
            <Text style={styles.editBtnText}>Edit Coupon</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShareToGroup}>
            <Ionicons name="share-social-outline" size={16} color="#E8604C" />
            <Text style={styles.shareBtnText}>Share to Group</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Where to use - minimalist link */}
      <TouchableOpacity
        style={styles.whereLink}
        onPress={handleWhereToUse}
        hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }}
      >
        <Ionicons name="location-outline" size={18} color="#1A2332" />
        <Text style={styles.whereLinkText}>Where to use</Text>
      </TouchableOpacity>

      {/* Delete - destructive plain text link (owner-only server-side) */}
      {isOwner && (
        <TouchableOpacity
          style={styles.deleteLink}
          onPress={() => { onDelete(coupon.coupon_id); onClose(); }}
        >
          <Text style={styles.deleteLinkText}>Delete Coupon</Text>
        </TouchableOpacity>
      )}

    </ScrollView>

    {/* Unified redemption choice modal */}
    <Modal
      visible={redeemModalVisible}
      animationType="fade"
      transparent
      onRequestClose={() => { setRedeemModalVisible(false); setPartialAmount(''); }}
    >
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <TouchableOpacity
        style={styles.confirmOverlay}
        activeOpacity={1}
        onPress={() => { setRedeemModalVisible(false); setPartialAmount(''); }}
      >
        <View style={styles.confirmBox} onStartShouldSetResponder={() => true}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ width: '100%' }}>
          <Text style={styles.confirmTitle}>
            {canPartialRedeem ? 'How would you like to redeem?' : 'Redeem this coupon?'}
          </Text>

          <TouchableOpacity
            style={styles.redeemAllBtn}
            onPress={handleRedeemAll}
            disabled={redeemAllLoading || partialLoading}
            activeOpacity={0.85}
          >
            {redeemAllLoading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.redeemAllBtnText}>Redeem All</Text>}
          </TouchableOpacity>

          {/* Partial redemption only makes sense for a coupon that tracks a
              remaining balance - otherwise there's nothing to split. */}
          {canPartialRedeem && (
            <>
              <View style={styles.orDivider}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>OR</Text>
                <View style={styles.orLine} />
              </View>

              <Text style={styles.partialLabel}>Enter partial amount</Text>
              <TextInput
                style={[styles.partialInput, partialError != null && styles.partialInputError]}
                placeholder={`max ₪${formatBalance(currentBalance)}`}
                placeholderTextColor="#A8997A"
                keyboardType="numeric"
                value={maskBalanceInput(partialAmount)}
                onChangeText={text => setPartialAmount(text.replace(/,/g, ''))}
              />
              {partialError != null && (
                <Text style={styles.partialErrorText}>{partialError}</Text>
              )}
              <TouchableOpacity
                style={[styles.redeemPartialConfirmBtn, partialConfirmDisabled && styles.redeemPartialConfirmBtnDisabled]}
                onPress={handlePartialRedeem}
                disabled={partialConfirmDisabled}
              >
                {partialLoading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.redeemPartialConfirmBtnText}>Confirm Partial Redeem</Text>}
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            style={styles.cancelLink}
            onPress={() => { setRedeemModalVisible(false); setPartialAmount(''); }}
          >
            <Text style={styles.cancelLinkText}>Cancel</Text>
          </TouchableOpacity>
          </ScrollView>
        </View>
      </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>

    {/* Group picker modal */}
    <Modal
      visible={groupPickerVisible}
      animationType="slide"
      transparent
      onRequestClose={() => setGroupPickerVisible(false)}
    >
      <TouchableOpacity
        style={styles.pickerOverlay}
        activeOpacity={1}
        onPress={() => setGroupPickerVisible(false)}
      >
        <View style={styles.pickerSheet}>
          <View style={styles.pickerHandle} />
          <Text style={styles.pickerTitle}>Share to Group</Text>
          <FlatList
            data={groups}
            keyExtractor={g => g.group_id}
            style={styles.pickerList}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.pickerItem}
                onPress={() => handleShareToGroupConfirm(item)}
                disabled={sharingGroupId === item.group_id}
              >
                {sharingGroupId === item.group_id ? (
                  <ActivityIndicator color="#E8604C" />
                ) : (
                  <Text style={styles.pickerItemText}>👥  {item.name}</Text>
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </TouchableOpacity>
    </Modal>

    {/* Locations modal */}
    <Modal
      visible={locationsVisible}
      animationType="slide"
      transparent
      onRequestClose={() => setLocationsVisible(false)}
    >
      <TouchableOpacity
        style={styles.pickerOverlay}
        activeOpacity={1}
        onPress={() => setLocationsVisible(false)}
      >
        <View style={[styles.pickerSheet, styles.locationsSheet]}>
          <View style={styles.pickerHandle} />
          <Text style={styles.pickerTitle}>📍  Where to use</Text>
          {locationsLoading ? (
            <ActivityIndicator color="#E8604C" style={{ marginVertical: 24 }} />
          ) : locations.length === 0 ? (
            <Text style={styles.locationsEmpty}>No nearby locations found.</Text>
          ) : (
            <FlatList
              data={locations}
              keyExtractor={(_, i) => String(i)}
              style={styles.pickerList}
              renderItem={({ item }) => (
                <View style={styles.locationItem}>
                  <View style={styles.locationInfo}>
                    <Text style={styles.locationName}>{item.name}</Text>
                    <Text style={styles.locationAddress}>{item.address}</Text>
                  </View>
                  <View style={styles.locationMeta}>
                    {item.distanceKm !== null && (
                      <Text style={styles.locationDistance}>
                        {item.distanceKm < 1
                          ? `${Math.round(item.distanceKm * 1000)}m`
                          : `${item.distanceKm.toFixed(1)}km`}
                      </Text>
                    )}
                    {item.openNow !== null && (
                      <Text style={[styles.locationOpen, item.openNow ? styles.locationOpenYes : styles.locationOpenNo]}>
                        {item.openNow ? 'Open' : 'Closed'}
                      </Text>
                    )}
                    {item.rating !== null && (
                      <Text style={styles.locationRating}>★ {item.rating.toFixed(1)}</Text>
                    )}
                  </View>
                </View>
              )}
            />
          )}
        </View>
      </TouchableOpacity>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, paddingBottom: 48 },

  // Coupon card
  couponCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 28,
    alignItems: 'center',
  },
  categoryIcon: { marginBottom: 8, opacity: 0.7 },
  couponStore: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1A2332',
    marginBottom: 4,
    textAlign: 'center',
  },
  couponCategory: {
    fontSize: 14,
    color: '#1A2332',
    opacity: 0.6,
    marginBottom: 20,
  },
  imageBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '100%',
    height: 140,
    marginBottom: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadedImage: { width: '100%', height: '100%' },
  changeOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(26,35,50,0.45)',
    paddingVertical: 6,
    alignItems: 'center',
  },
  changeOverlayText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  codeLarge: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 28,
    marginBottom: 14,
    alignItems: 'center',
  },
  codeLargeText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1A2332',
    letterSpacing: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleLabel: { fontSize: 13, color: '#1A2332', opacity: 0.7 },

  // Details card
  detailsSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 20,
    marginBottom: 20,
    opacity: 0.9,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EBE0',
  },
  detailRowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailRowLast: { borderBottomWidth: 0 },
  detailLabel: { fontSize: 15, color: '#1A2332', opacity: 0.55 },
  detailValue: { fontSize: 15, fontWeight: '600', color: '#1A2332' },
  balanceValue: { fontSize: 22, fontWeight: '800', color: '#1A2332' },
  statusDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#7DC99E' },
  statusUsed: { color: '#B8C4CC' },

  // Primary - Redeem button
  redeemBtn: {
    backgroundColor: '#1A2332',
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  redeemBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Secondary - Edit + Share
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 30,
    paddingVertical: 15,
    borderWidth: 1.5,
    borderColor: '#E8604C',
  },
  editBtnText: { color: '#E8604C', fontSize: 15, fontWeight: '700' },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 30,
    paddingVertical: 15,
    borderWidth: 1.5,
    borderColor: '#E8604C',
  },
  shareBtnText: { color: '#E8604C', fontSize: 15, fontWeight: '700' },

  // Where to use link
  whereLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    marginVertical: 12,
  },
  whereLinkText: { fontSize: 19, fontWeight: '600', color: '#1A2332' },

  // Delete link
  deleteLink: { alignItems: 'center', paddingVertical: 14, marginTop: 12 },
  deleteLinkText: { fontSize: 16, color: '#C0857A', fontWeight: '500' },

  // Unified redeem modal
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(26,35,50,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  confirmBox: {
    backgroundColor: '#F5F0E6',
    borderRadius: 20,
    padding: 28,
    width: '100%',
    alignItems: 'center',
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A2332',
    marginBottom: 20,
    textAlign: 'center',
  },
  redeemAllBtn: {
    width: '100%',
    backgroundColor: '#1A2332',
    borderRadius: 30,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 8,
  },
  redeemAllBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: 16,
    gap: 10,
  },
  orLine: { flex: 1, height: 1, backgroundColor: '#E0D8CA' },
  orText: { fontSize: 12, fontWeight: '700', color: '#A8997A', letterSpacing: 1 },
  partialLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#A8997A',
    letterSpacing: 0.5,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  partialInput: {
    width: '100%',
    borderBottomWidth: 1.5,
    borderBottomColor: '#C4B8A0',
    paddingVertical: 10,
    fontSize: 18,
    fontWeight: '600',
    color: '#1A2332',
    textAlign: 'center',
    marginBottom: 4,
  },
  partialInputError: { borderBottomColor: '#C0392B' },
  partialErrorText: {
    fontSize: 12,
    color: '#C0392B',
    textAlign: 'center',
    marginTop: 2,
  },
  redeemPartialConfirmBtn: {
    width: '100%',
    backgroundColor: '#E8604C',
    borderRadius: 30,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 12,
  },
  redeemPartialConfirmBtnDisabled: { backgroundColor: '#E0D8CA' },
  redeemPartialConfirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  cancelLink: { marginTop: 16, paddingVertical: 8, alignItems: 'center' },
  cancelLinkText: { fontSize: 14, color: '#A8997A', fontWeight: '500' },

  // Pickers / sheets
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(26,35,50,0.5)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#F5F0E6',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '60%',
  },
  pickerHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C4B8A0',
    alignSelf: 'center',
    marginBottom: 16,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A2332',
    marginBottom: 12,
    textAlign: 'center',
  },
  pickerList: { flexGrow: 0 },
  pickerItem: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12 },
  pickerItemText: { fontSize: 16, color: '#1A2332', textAlign: 'center' },
  locationsSheet: { maxHeight: '75%' },
  locationsEmpty: {
    fontSize: 15,
    color: '#A8997A',
    textAlign: 'center',
    marginVertical: 24,
  },
  locationItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0D8CA',
  },
  locationInfo: { flex: 1, marginRight: 12 },
  locationName: { fontSize: 15, fontWeight: '700', color: '#1A2332', marginBottom: 3 },
  locationAddress: { fontSize: 12, color: '#A8997A', lineHeight: 16 },
  locationMeta: { alignItems: 'flex-end', gap: 4, minWidth: 52 },
  locationDistance: { fontSize: 13, fontWeight: '700', color: '#1A2332' },
  locationOpen: { fontSize: 12, fontWeight: '700' },
  locationOpenYes: { color: '#7DC99E' },
  locationOpenNo: { color: '#E8604C' },
  locationRating: { fontSize: 12, color: '#A8997A' },

  // Image box - base (used when aspect ratio known)
  imageBoxBase: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '100%',
    maxHeight: 150,
    marginBottom: 16,
    overflow: 'hidden',
  },

  // Fullscreen barcode modal
  fullscreenRoot: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenClose: {
    position: 'absolute',
    top: 52,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  fullscreenImage: {
    width: '100%',
    height: '100%',
  },

  // Dynamic gift card URL button
  giftCardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5EDD6',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginTop: 16,
    marginBottom: 8,
    shadowColor: '#1A2332',
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 3,
  },
  giftCardButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A2332',
    letterSpacing: 0.3,
  },
});
