import { useState, useCallback, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { Text, TextInput } from '../../components/rn';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import ImageCropModal from '../../components/ImageCropModal';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { createCoupon } from '../../services/api';
import { saveCouponCode, saveCouponImage } from '../../storage/couponStorage';
import { dismissDraft } from '../../storage/gmailDraftStorage';
import { matchGeneralGiftCard, findGiftCardInText, type GeneralGiftCard } from '../../constants/generalGiftCards';
import { maskBalanceInput } from '../../utils/format';
import { extractCouponFieldsFromText } from '../../utils/couponTextExtraction';
import AuroraBackground from '../../components/ui/AuroraBackground';
import ScreenHeader from '../../components/ui/ScreenHeader';
import Input from '../../components/ui/Input';
import CategoryTile from '../../components/ui/CategoryTile';
import GlassPanel from '../../components/ui/GlassPanel';
import Button from '../../components/ui/Button';
import Sheet from '../../components/ui/Sheet';
import SectionLabel from '../../components/ui/SectionLabel';
import { colors, glass, radius, spacing, fontFamily, fontSize } from '../../constants/theme';

const ADD_CATEGORIES: { label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: 'General',     icon: 'gift-outline'                },
  { label: 'Food',        icon: 'restaurant-outline'          },
  { label: 'Groceries',   icon: 'cart-outline'                },
  { label: 'Fashion',     icon: 'shirt-outline'               },
  { label: 'Electronics', icon: 'hardware-chip-outline'       },
  { label: 'Beauty',      icon: 'flower-outline'              },
  { label: 'Travel',      icon: 'airplane-outline'            },
  { label: 'Sport',       icon: 'trophy-outline'              },
  { label: 'Other',       icon: 'ellipsis-horizontal-outline' },
];

export default function AddCouponScreen() {
  const [code, setCode] = useState('');
  const [couponName, setCouponName] = useState('');
  const [category, setCategory] = useState('');
  const [expiryDate, setExpiryDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [balance, setBalance] = useState('');
  const [loading, setLoading] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [cropUri, setCropUri] = useState<string | null>(null);
  const [imageNatSize, setImageNatSize] = useState<{ w: number; h: number } | null>(null);
  const [giftUrl, setGiftUrl] = useState('');
  const [matchedGeneralCard, setMatchedGeneralCard] = useState<GeneralGiftCard | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const categoryTouchedRef = useRef(false);
  // Route params on a tab screen persist across focuses (there's no unmount to reset
  // them) - without this, the fromGmail branch below would re-populate the same draft
  // every time this tab regains focus, even long after it was saved.
  const consumedGmailMessageIdRef = useRef<string | null>(null);
  const router = useRouter();
  const params = useLocalSearchParams<{
    fromGmail?: string; messageId?: string; code?: string; store?: string;
    category?: string; expiration?: string; amount?: string;
  }>();

  useFocusEffect(
    useCallback(() => {
      if (params.fromGmail === '1' && params.messageId !== consumedGmailMessageIdRef.current) {
        consumedGmailMessageIdRef.current = params.messageId ?? null;
        setCode(params.code ?? '');
        setCouponName(params.store ?? '');
        // Run the same General-gift-card detection a hand-typed name gets, so an
        // imported BUYME/XTRA/etc. classifies identically. A recognized brand beats
        // the scanner's keyword guess - it matches on the store name itself, not on
        // whatever words happened to appear in the email body.
        const match = matchGeneralGiftCard(params.store ?? '');
        setMatchedGeneralCard(match);
        if (match) {
          setCategory('General');
        } else {
          setCategory(params.category && ADD_CATEGORIES.some(c => c.label === params.category) ? params.category : '');
        }
        setExpiryDate(params.expiration ? new Date(params.expiration) : null);
        setBalance(params.amount ?? '');
        setImageUri(null);
        setGiftUrl('');
        categoryTouchedRef.current = false;
        // Fires on blur (leaving this screen) - handleAdd already blanks the fields
        // on a successful save, so this is a no-op then. If the draft was instead
        // abandoned (navigated away without saving), this is what actually clears
        // it - otherwise the stale fields would sit there until a later Gmail
        // import overwrites them, visible on any unrelated fresh visit meanwhile.
        return () => {
          setCode('');
          setCouponName('');
          setCategory('');
          setExpiryDate(null);
          setBalance('');
          setImageUri(null);
          setGiftUrl('');
          setMatchedGeneralCard(null);
          categoryTouchedRef.current = false;
        };
      }
      if (params.fromGmail !== '1') {
        setCode('');
        setCouponName('');
        setCategory('');
        setExpiryDate(null);
        setBalance('');
        setImageUri(null);
        setGiftUrl('');
        setMatchedGeneralCard(null);
        categoryTouchedRef.current = false;
      }
    }, [params.fromGmail, params.messageId])
  );

  function handleCouponNameChange(text: string) {
    setCouponName(text);
    const match = matchGeneralGiftCard(text);
    setMatchedGeneralCard(match);
    if (match && !categoryTouchedRef.current) {
      setCategory('General');
    }
  }

  function handleCategoryPress(label: string) {
    categoryTouchedRef.current = true;
    setCategory(label);
  }

  function openQuickAdd() {
    setQuickAddOpen(true);
  }

  function handleQuickAddGmail() {
    setQuickAddOpen(false);
    router.push('/gmail-scan');
  }

  // Reads the clipboard and extracts straight into the form - no intermediate
  // "review the raw text" screen. That screen only ever let the user fix typos
  // before Analyze; the actual coupon form does that same job (every extracted
  // field lands there editable, same as a Gmail draft), so it was a second
  // review step for something the first one already covers.
  //
  // Runs entirely on-device - the clipboard text (which may contain a coupon
  // code) never goes to the server, same invariant as the Gmail draft flow.
  // Unlike that flow, store detection can fall back to the message's first
  // line (guessStoreFromFirstLine) when no known general-gift-card brand is
  // found - there's no email "From" header here, but there's often a name in
  // plain sight.
  async function handlePasteAndAnalyze() {
    setQuickAddOpen(false);
    const text = await Clipboard.getStringAsync();
    const fields = extractCouponFieldsFromText(text);
    const match = findGiftCardInText(text);
    const foundSomething =
      fields.code !== null ||
      fields.store !== null ||
      fields.amount !== null ||
      fields.expiration !== null ||
      match !== null;

    // Extraction is best-effort regex over arbitrary text (or an empty
    // clipboard), so finding nothing is a normal outcome, not an error - say
    // so and leave the form as it was rather than pretending something happened.
    if (!foundSomething) {
      Alert.alert(
        'Nothing found',
        "Couldn't find a coupon code, amount or expiry date on the clipboard. Copy the coupon text first, or fill the fields in yourself."
      );
      return;
    }

    // Assign only what was actually extracted. Writing every field
    // unconditionally meant a partial match (a code and nothing else) blanked
    // the store, expiry and balance the user may have already typed.
    if (fields.code !== null) setCode(fields.code);
    if (fields.store !== null) setCouponName(fields.store);
    if (fields.amount !== null) setBalance(String(fields.amount));
    if (fields.expiration !== null) setExpiryDate(new Date(fields.expiration));
    if (match) {
      setMatchedGeneralCard(match);
      // Same rule as typing a store name by hand (handleCouponNameChange): an
      // explicit category choice by the user outranks the detected brand.
      if (!categoryTouchedRef.current) setCategory('General');
    }
  }

  const expiryString = expiryDate
    ? expiryDate.toISOString().split('T')[0]
    : undefined;

  async function pickImage() {
    Alert.alert('Coupon Image', 'Choose a source', [
      {
        text: 'Camera',
        onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (perm.status !== 'granted') {
            Alert.alert('Permission needed', 'Please allow camera access in Settings.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
          if (!result.canceled) setCropUri(result.assets[0].uri);
        },
      },
      {
        text: 'Photo Library',
        onPress: async () => {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (perm.status !== 'granted') {
            Alert.alert('Permission needed', 'Please allow photo library access in Settings.');
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.85 });
          if (!result.canceled) setCropUri(result.assets[0].uri);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function handleAdd() {
    const hasCode = code.trim().length > 0;
    const hasImage = !!imageUri;
    const hasGiftUrl = giftUrl.trim().length > 0;

    if (!couponName.trim() || !category || (!hasCode && !hasImage && !hasGiftUrl)) {
      Alert.alert('Missing fields', 'Please fill in coupon name, category, and at least one of: coupon code, barcode image, or gift card URL.');
      return;
    }

    setLoading(true);
    try {
      const { data } = await createCoupon({
        category,
        store_name: couponName.trim(),
        expiration_date: expiryString,
        balance: balance ? parseFloat(balance) : undefined,
        giftcard_url: hasGiftUrl ? giftUrl.trim() : undefined,
      });

      if (hasCode) await saveCouponCode(data.coupon_id, code.trim());
      if (imageUri) {
        await saveCouponImage(data.coupon_id, imageUri);
      }
      // Belt-and-suspenders: the source email would also stop showing as a draft once
      // its code matches this new coupon's saved code, but dismiss it explicitly too.
      if (params.messageId) await dismissDraft(params.messageId);

      // The route's fromGmail/messageId params stick around (see consumedGmailMessageIdRef
      // above), so this screen won't auto-populate from them again - but reset the fields
      // now rather than leaving the just-saved draft's values sitting here until next focus.
      if (params.fromGmail === '1') {
        setCode('');
        setCouponName('');
        setCategory('');
        setExpiryDate(null);
        setBalance('');
        setImageUri(null);
        setGiftUrl('');
        setMatchedGeneralCard(null);
        categoryTouchedRef.current = false;
      }

      Alert.alert('Coupon added!', `${couponName} coupon has been saved.`, [
        { text: 'OK', onPress: () => router.replace('/(tabs)') },
      ]);
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Could not add coupon. Is the server running?';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
    {cropUri && (
      <ImageCropModal
        uri={cropUri}
        onCrop={uri => { setImageUri(uri); setCropUri(null); }}
        onCancel={() => setCropUri(null)}
      />
    )}
    <AuroraBackground>
      <ScreenHeader
        title="Add Coupon"
        subtitle="Stays on this device"
        actions={
          <Button
            variant="glass"
            size="s"
            icon={<Ionicons name="flash-outline" size={16} color={colors.coral400} />}
            onPress={openQuickAdd}
          >
            Quick Add
          </Button>
        }
      />
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">

          <Input
            label="Coupon Name"
            placeholder="e.g. Super-Pharm"
            value={couponName}
            onChangeText={handleCouponNameChange}
            wrapperStyle={styles.field}
          />
          {matchedGeneralCard && (
            <Text style={styles.matchHint}>
              Recognized as {matchedGeneralCard.canonicalName} → classified as General
            </Text>
          )}

          <Input
            label="Coupon Code"
            placeholder="Paste or scan"
            autoCapitalize="characters"
            value={code}
            onChangeText={setCode}
            wrapperStyle={styles.field}
          />

          <View style={[styles.row, styles.field]}>
            <Input
              label="Balance"
              placeholder="0"
              icon={<Ionicons name="cash-outline" size={17} color={colors.textMuted} />}
              value={maskBalanceInput(balance)}
              onChangeText={text => setBalance(text.replace(/,/g, ''))}
              keyboardType="decimal-pad"
              wrapperStyle={{ flex: 1 }}
            />
            <Pressable style={{ flex: 1 }} onPress={() => setShowDatePicker(true)}>
              <View pointerEvents="none">
                <Input
                  label="Expires"
                  placeholder="dd/mm/yyyy"
                  icon={<Ionicons name="calendar-outline" size={17} color={colors.textMuted} />}
                  value={expiryDate ? expiryDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                  editable={false}
                />
              </View>
            </Pressable>
          </View>

          <Input
            label="Dynamic Gift Card Link (optional)"
            placeholder="e.g. https://www.buyme.co.il/..."
            autoCapitalize="none"
            keyboardType="url"
            value={giftUrl}
            onChangeText={setGiftUrl}
            wrapperStyle={styles.field}
          />

          {/* Barcode / QR Image (optional) */}
          <Text style={styles.sectionLabel}>Barcode / QR Image (optional)</Text>
          <View style={styles.imagePickerWrap}>
            <TouchableOpacity
              style={imageUri && imageNatSize
                ? [styles.imagePickerBase, { aspectRatio: imageNatSize.w / imageNatSize.h }]
                : styles.imagePicker}
              onPress={pickImage}
              activeOpacity={0.8}
            >
              {imageUri ? (
                <>
                  <Image
                    source={{ uri: imageUri }}
                    style={styles.imagePreview}
                    resizeMode="contain"
                    onLoad={e => {
                      const { width: w, height: h } = e.nativeEvent.source;
                      setImageNatSize({ w, h });
                    }}
                  />
                  <View style={styles.imageChangeOverlay}>
                    <Text style={styles.imageChangeText}>Tap to change</Text>
                  </View>
                </>
              ) : (
                <View style={styles.imageEmpty}>
                  <Ionicons name="qr-code-outline" size={32} color={colors.textMuted} />
                  <Text style={styles.imageEmptyText}>Add barcode or QR image</Text>
                  <Text style={styles.imageEmptyHint}>Camera or Photo Library</Text>
                </View>
              )}
            </TouchableOpacity>
            {imageUri && (
              <TouchableOpacity
                style={styles.imageRemoveBtn}
                onPress={() => { setImageUri(null); setImageNatSize(null); }}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={22} color={colors.coral400} />
              </TouchableOpacity>
            )}
          </View>

          <SectionLabel>Category</SectionLabel>
          <View style={styles.categoryRow}>
            {ADD_CATEGORIES.map(cat => (
              <CategoryTile
                key={cat.label}
                label={cat.label}
                category={cat.label}
                icon={cat.icon}
                active={category === cat.label}
                onPress={() => handleCategoryPress(cat.label)}
              />
            ))}
          </View>

          <GlassPanel tint="brand" radius={radius.l} padding={spacing.s7} sheen={false} style={styles.privacyPanel}>
            <View style={styles.privacyRow}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.coral500} style={{ marginTop: 2 }} />
              <Text style={styles.privacyText}>
                The code is written to this phone's secure storage. Our servers only ever see the store name, category and balance.
              </Text>
            </View>
          </GlassPanel>

          <Button variant="primary" size="l" block onPress={handleAdd} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : 'Save Coupon'}
          </Button>

        </ScrollView>

        {/* Android: native date picker dialog */}
        {Platform.OS === 'android' && showDatePicker && (
          <DateTimePicker
            value={expiryDate ?? new Date()}
            mode="date"
            minimumDate={new Date()}
            onChange={(event, date) => {
              setShowDatePicker(false);
              if (event.type !== 'dismissed' && date) setExpiryDate(date);
            }}
          />
        )}

        {/* iOS: date picker in bottom sheet */}
        {Platform.OS === 'ios' && (
          <Sheet title="Select Date" open={showDatePicker} onClose={() => setShowDatePicker(false)}>
            <DateTimePicker
              value={expiryDate ?? new Date()}
              mode="date"
              display="inline"
              minimumDate={new Date()}
              themeVariant="light"
              accentColor={colors.coral400}
              onChange={(_, date) => { if (date) setExpiryDate(date); }}
              style={{ alignSelf: 'center' }}
            />
            <Button variant="primary" block style={{ marginTop: spacing.s6 }} onPress={() => setShowDatePicker(false)}>
              Done
            </Button>
          </Sheet>
        )}

        <Sheet title="Quick Add" open={quickAddOpen} onClose={() => setQuickAddOpen(false)}>
          <View style={{ gap: spacing.s6 }}>
            <Button
              variant="glass"
              size="l"
              block
              icon={<Ionicons name="mail-outline" size={18} color={colors.coral400} />}
              onPress={handleQuickAddGmail}
            >
              Scan Gmail for Coupons
            </Button>
            <Button
              variant="glass"
              size="l"
              block
              icon={<Ionicons name="clipboard-outline" size={18} color={colors.coral400} />}
              onPress={handlePasteAndAnalyze}
            >
              Paste Text
            </Button>
          </View>
        </Sheet>

        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </AuroraBackground>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { padding: spacing.gutterScreen, paddingBottom: 130 },
  field: { marginBottom: spacing.s14 },
  row: { flexDirection: 'row', gap: spacing.s6 },
  sectionLabel: {
    fontFamily: fontFamily.uiBold,
    fontSize: fontSize.micro,
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: spacing.s5,
  },
  matchHint: {
    fontFamily: fontFamily.uiSemibold,
    fontSize: fontSize.micro,
    color: colors.coral400,
    marginTop: -spacing.s10,
    marginBottom: spacing.s10,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: spacing.s16,
    marginTop: 4,
  },
  privacyPanel: { marginBottom: spacing.s10 },
  privacyRow: { flexDirection: 'row', gap: spacing.s6, alignItems: 'flex-start' },
  privacyText: { flex: 1, fontFamily: fontFamily.ui, fontSize: fontSize.caption, color: colors.textBody, lineHeight: fontSize.caption * 1.4 },
  imagePickerWrap: {
    position: 'relative',
    marginBottom: spacing.s14,
  },
  imagePickerBase: {
    borderRadius: radius.l,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderStyle: 'dashed',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,.5)',
    width: '100%',
    maxHeight: 150,
  },
  imagePicker: {
    borderRadius: radius.l,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderStyle: 'dashed',
    height: 120,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageRemoveBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: colors.surfacePage,
    borderRadius: 11,
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  imageChangeOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(26,35,50,0.45)',
    paddingVertical: 5,
    alignItems: 'center',
  },
  imageChangeText: {
    color: '#fff',
    fontFamily: fontFamily.uiSemibold,
    fontSize: 12,
  },
  imageEmpty: {
    alignItems: 'center',
    gap: 6,
  },
  imageEmptyText: {
    fontFamily: fontFamily.uiSemibold,
    fontSize: 13,
    color: colors.textStrong,
    opacity: 0.55,
  },
  imageEmptyHint: {
    fontFamily: fontFamily.ui,
    fontSize: 11,
    color: colors.textMuted,
  },
});
