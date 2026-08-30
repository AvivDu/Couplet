import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
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
import { getGroups, getCouponLocations } from '../../services/api';
import type { GroupMeta, StoreLocation, CouponMeta, RedeemAction } from '../../services/api';
import { matchGeneralGiftCard } from '../../constants/generalGiftCards';
import type { CouponWithCode } from './types';
import { formatBalance, maskBalanceInput } from '../../utils/format';
import { inspectShareable, unusableShareMessage, deliverCouponCode } from '../../services/couponSharing';
import { useNotifications } from '../../context/NotificationsContext';
import GlassPanel from '../ui/GlassPanel';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Sheet from '../ui/Sheet';
import CouponCodePanel from '../ui/CouponCodePanel';
import { colors, glass, radius, spacing, fontFamily, fontSize } from '../../constants/theme';

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
  const [revealed, setRevealed] = React.useState(false);
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
      const data = await deliverCouponCode(sendSignal, group.group_id, coupon.coupon_id, coupon.code);
      console.log(
        '[share] online recipients:', data.online_recipient_ids ?? [],
        '- offline members get the encrypted DB fallback instead'
      );
      setGroupPickerVisible(false);
      Alert.alert('Shared!', `Coupon shared to "${group.name}".`);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.error ?? 'Could not share coupon.');
    } finally {
      setSharingGroupId(null);
    }
  }

  async function handleWhereToUse() {
    if (coupon.category === 'General') {
      const match = matchGeneralGiftCard(coupon.store_name);
      if (match) {
        WebBrowser.openBrowserAsync(match.storesUrl);
        return;
      }
    }

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

  const expiry = coupon.expiration_date
    ? new Date(coupon.expiration_date).toLocaleDateString()
    : 'No expiry';
  const balance = coupon.balance != null ? formatBalance(coupon.balance) : '—';

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

      {/* Hero panel - balance, status, expiry, category */}
      <GlassPanel tint="thick" radius={radius['3xl']} padding={spacing.s12} style={styles.hero}>
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.heroLabel}>Balance</Text>
            <Text style={styles.heroBalance}>₪{balance}</Text>
          </View>
          <Badge tone={coupon.status === 'active' ? 'success' : 'ink'} uppercase>{coupon.status}</Badge>
        </View>
        <View style={styles.perforation} />
        <View style={styles.heroBottom}>
          <View>
            <Text style={styles.heroCaption}>Expires</Text>
            <Text style={styles.heroValue}>{expiry}</Text>
          </View>
          <View>
            <Text style={styles.heroCaption}>Category</Text>
            <Text style={styles.heroValue}>{coupon.category}</Text>
          </View>
        </View>
      </GlassPanel>

      {/* Code reveal - or the dynamic gift-card link, which isn't a secret to gate */}
      {coupon.giftcard_url ? (
        <Button
          variant="primary"
          block
          style={styles.giftCardButton}
          onPress={() => WebBrowser.openBrowserAsync(coupon.giftcard_url!)}
          icon={<Ionicons name="link" size={20} color="#fff" />}
        >
          Open Live Gift Card
        </Button>
      ) : revealed ? (
        <View style={styles.codeBlock}>
          {imageUri !== null && !showTextCode ? (
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
          ) : (
            <CouponCodePanel code={coupon.code ?? '—'} store={coupon.store_name} />
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
        </View>
      ) : (
        <GlassPanel tint="regular" radius={radius['2xl']} padding={spacing.s14} style={styles.hiddenPanel}>
          <Text style={styles.hiddenTitle}>Code hidden</Text>
          <Text style={styles.hiddenHint}>This code lives on this device only — reveal it at the till.</Text>
          <Button variant="primary" block onPress={() => setRevealed(true)} icon={<Ionicons name="eye-outline" size={18} color="#fff" />}>
            Reveal code
          </Button>
        </GlassPanel>
      )}

      {/* Primary action - Redeem */}
      {coupon.status === 'active' && (
        <Button variant="primary" block style={styles.redeemBtn} onPress={() => setRedeemModalVisible(true)}>
          Redeem
        </Button>
      )}

      {/* Secondary actions - Edit + Share (owner-only server-side) */}
      {isOwner && (
        <View style={styles.actionRow}>
          <View style={styles.actionCol}>
            <Button variant="glass" block onPress={onEdit} icon={<Ionicons name="pencil-outline" size={16} color={colors.coral500} />}>
              Edit Coupon
            </Button>
          </View>
          <View style={styles.actionCol}>
            <Button variant="glass" block onPress={handleShareToGroup} icon={<Ionicons name="share-social-outline" size={16} color={colors.coral500} />}>
              Share to Group
            </Button>
          </View>
        </View>
      )}

      <Button
        variant="glass"
        block
        style={styles.whereBtn}
        onPress={handleWhereToUse}
        icon={<Ionicons name="location-outline" size={18} color={colors.textStrong} />}
      >
        Where to use
      </Button>

      {/* Delete (owner-only server-side) */}
      {isOwner && (
        <Button variant="danger" block style={styles.deleteBtn} onPress={() => { onDelete(coupon.coupon_id); onClose(); }}>
          Delete coupon
        </Button>
      )}

    </ScrollView>

    {/* Unified redemption choice sheet */}
    <Sheet
      open={redeemModalVisible}
      onClose={() => { setRedeemModalVisible(false); setPartialAmount(''); }}
    >
      <>
        <Text style={styles.confirmTitle}>
          {canPartialRedeem ? 'How would you like to redeem?' : 'Redeem this coupon?'}
        </Text>

        <Button variant="primary" block style={{ marginBottom: spacing.s4 }} disabled={redeemAllLoading || partialLoading} onPress={handleRedeemAll}>
          {redeemAllLoading ? <ActivityIndicator color="#fff" /> : 'Redeem All'}
        </Button>

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
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              value={maskBalanceInput(partialAmount)}
              onChangeText={text => setPartialAmount(text.replace(/,/g, ''))}
            />
            {partialError != null && (
              <Text style={styles.partialErrorText}>{partialError}</Text>
            )}
            <Button
              variant="primary"
              block
              style={{ marginTop: spacing.s4 }}
              disabled={partialConfirmDisabled}
              onPress={handlePartialRedeem}
            >
              {partialLoading ? <ActivityIndicator color="#fff" /> : 'Confirm Partial Redeem'}
            </Button>
          </>
        )}

        <TouchableOpacity
          style={styles.cancelLink}
          onPress={() => { setRedeemModalVisible(false); setPartialAmount(''); }}
        >
          <Text style={styles.cancelLinkText}>Cancel</Text>
        </TouchableOpacity>
      </>
    </Sheet>

    {/* Group picker sheet */}
    <Sheet title="Share to Group" open={groupPickerVisible} onClose={() => setGroupPickerVisible(false)}>
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
              <ActivityIndicator color={colors.coral400} />
            ) : (
              <Text style={styles.pickerItemText}>👥  {item.name}</Text>
            )}
          </TouchableOpacity>
        )}
      />
    </Sheet>

    {/* Locations sheet */}
    <Sheet title="📍  Where to use" open={locationsVisible} onClose={() => setLocationsVisible(false)}>
      {locationsLoading ? (
        <ActivityIndicator color={colors.coral400} style={{ marginVertical: 24 }} />
      ) : locations.length === 0 ? (
        <Text style={styles.locationsEmpty}>No nearby locations found.</Text>
      ) : (
        <FlatList
          data={locations}
          keyExtractor={(_, i) => String(i)}
          style={[styles.pickerList, styles.locationsList]}
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
    </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.gutterScreen, paddingBottom: 130, gap: spacing.s7 },

  // Hero panel
  hero: { marginBottom: 0 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  heroLabel: { fontFamily: fontFamily.uiBold, fontSize: fontSize.micro, letterSpacing: 1, textTransform: 'uppercase', color: colors.textMuted },
  heroBalance: { fontFamily: fontFamily.uiBlack, fontSize: 40, color: colors.textStrong, marginTop: 8 },
  perforation: { height: 1, borderTopWidth: 1, borderColor: 'rgba(26,35,50,.22)', borderStyle: 'dashed', opacity: 0.45, marginVertical: spacing.s7 },
  heroBottom: { flexDirection: 'row', gap: 22 },
  heroCaption: { fontFamily: fontFamily.ui, fontSize: fontSize.caption, color: colors.textMuted },
  heroValue: { fontFamily: fontFamily.uiBold, fontSize: fontSize.body, color: colors.textStrong, marginTop: 2 },

  // Code reveal
  hiddenPanel: { alignItems: 'center' },
  hiddenTitle: { fontFamily: fontFamily.displaySemibold, fontSize: fontSize.subheading, color: colors.textStrong, marginBottom: 6 },
  hiddenHint: { fontFamily: fontFamily.ui, fontSize: fontSize.caption, color: colors.textMuted, textAlign: 'center', marginBottom: 16 },
  codeBlock: { gap: spacing.s6 },
  imageBox: {
    backgroundColor: '#fff',
    borderRadius: radius.m,
    width: '100%',
    height: 140,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadedImage: { width: '100%', height: '100%' },
  imageBoxBase: {
    backgroundColor: '#fff',
    borderRadius: radius.m,
    width: '100%',
    maxHeight: 150,
    overflow: 'hidden',
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  toggleLabel: { fontFamily: fontFamily.ui, fontSize: fontSize.caption, color: colors.textStrong, opacity: 0.7 },

  // Actions
  redeemBtn: { marginTop: spacing.s4 },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionCol: { flex: 1 },
  whereBtn: {},
  deleteBtn: {},

  giftCardButton: {},

  // Redeem sheet
  confirmTitle: { fontFamily: fontFamily.displaySemibold, fontSize: fontSize.heading, color: colors.textStrong, marginBottom: 18, textAlign: 'center' },
  orDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 10 },
  orLine: { flex: 1, height: 1, backgroundColor: colors.lineSoft },
  orText: { fontFamily: fontFamily.uiBold, fontSize: 12, color: colors.textMuted, letterSpacing: 1 },
  partialLabel: { fontFamily: fontFamily.uiSemibold, fontSize: 12, color: colors.textMuted, letterSpacing: 0.5, marginBottom: 4 },
  partialInput: {
    width: '100%',
    borderBottomWidth: 1.5,
    borderBottomColor: colors.lineStrong,
    paddingVertical: 10,
    fontFamily: fontFamily.uiSemibold,
    fontSize: 18,
    color: colors.textStrong,
    textAlign: 'center',
    marginBottom: 4,
  },
  partialInputError: { borderBottomColor: colors.stateDanger },
  partialErrorText: { fontFamily: fontFamily.ui, fontSize: 12, color: colors.stateDanger, textAlign: 'center', marginTop: 2 },
  cancelLink: { marginTop: 16, paddingVertical: 8, alignItems: 'center' },
  cancelLinkText: { fontFamily: fontFamily.uiSemibold, fontSize: 14, color: colors.textMuted },

  // Group picker / locations sheets
  pickerList: { flexGrow: 0, maxHeight: 320 },
  locationsList: { maxHeight: 420 },
  pickerItem: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: radius.m },
  pickerItemText: { fontFamily: fontFamily.ui, fontSize: 16, color: colors.textStrong, textAlign: 'center' },
  locationsEmpty: { fontFamily: fontFamily.ui, fontSize: 15, color: colors.textMuted, textAlign: 'center', marginVertical: 24 },
  locationItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  locationInfo: { flex: 1, marginRight: 12 },
  locationName: { fontFamily: fontFamily.uiBold, fontSize: 15, color: colors.textStrong, marginBottom: 3 },
  locationAddress: { fontFamily: fontFamily.ui, fontSize: 12, color: colors.textMuted, lineHeight: 16 },
  locationMeta: { alignItems: 'flex-end', gap: 4, minWidth: 52 },
  locationDistance: { fontFamily: fontFamily.uiBold, fontSize: 13, color: colors.textStrong },
  locationOpen: { fontFamily: fontFamily.uiBold, fontSize: 12 },
  locationOpenYes: { color: colors.stateSuccess },
  locationOpenNo: { color: colors.coral400 },
  locationRating: { fontFamily: fontFamily.ui, fontSize: 12, color: colors.textMuted },

  // Fullscreen barcode modal
  fullscreenRoot: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  fullscreenClose: { position: 'absolute', top: 52, right: 20, zIndex: 10, padding: 8 },
  fullscreenImage: { width: '100%', height: '100%' },
});
