import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { getCouponImage, saveCouponImage } from '../../storage/couponStorage';
import { CATEGORY_COLORS } from './constants';
import type { CouponWithCode } from './types';

interface CouponDisplayProps {
  coupon: CouponWithCode;
  onEdit: () => void;
  onDelete: (id: string) => void;
  onMarkUsed: (id: string) => void;
  onClose: () => void;
}

export default function CouponDisplay({ coupon, onEdit, onDelete, onMarkUsed, onClose }: CouponDisplayProps) {
  const [imageUri, setImageUri] = React.useState<string | null>(null);

  React.useEffect(() => {
    getCouponImage(coupon.coupon_id).then(setImageUri);
  }, [coupon.coupon_id]);

  async function pickImage() {
    Alert.alert('Upload Coupon Image', 'Choose a source', [
      {
        text: 'Camera',
        onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (perm.status !== 'granted') {
            Alert.alert('Permission needed', 'Please allow camera access in Settings.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.85 });
          if (!result.canceled) {
            const uri = result.assets[0].uri;
            await saveCouponImage(coupon.coupon_id, uri);
            setImageUri(uri);
          }
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
          const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, quality: 0.85 });
          if (!result.canceled) {
            const uri = result.assets[0].uri;
            await saveCouponImage(coupon.coupon_id, uri);
            setImageUri(uri);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const color = CATEGORY_COLORS[coupon.category] ?? CATEGORY_COLORS.Other;
  const expiry = coupon.expiration_date
    ? new Date(coupon.expiration_date).toLocaleDateString()
    : 'No expiry';
  const balance = coupon.balance != null ? `₪${coupon.balance.toFixed(2)}` : '—';

  return (
    <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      <View style={[styles.couponCard, { backgroundColor: color }]}>
        <Text style={styles.couponStore}>{coupon.store_name}</Text>
        <Text style={styles.couponCategory}>{coupon.category}</Text>

        <TouchableOpacity style={styles.imageBox} onPress={pickImage} activeOpacity={0.8}>
          {imageUri ? (
            <>
              <Image source={{ uri: imageUri }} style={styles.uploadedImage} resizeMode="contain" />
              <View style={styles.changeOverlay}>
                <Text style={styles.changeOverlayText}>Tap to change</Text>
              </View>
            </>
          ) : (
            <View style={styles.uploadPlaceholder}>
              <Text style={styles.uploadIcon}>↑</Text>
              <Text style={styles.uploadLabel}>Upload barcode / QR</Text>
              <Text style={styles.uploadHint}>Camera or Photo Library</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.codePill}>
          <Text style={styles.codePillText}>Code: {coupon.code ?? '—'}</Text>
        </View>

        {coupon.status === 'active' && (
          <TouchableOpacity
            style={styles.redeemBtn}
            onPress={() => {
              onMarkUsed(coupon.coupon_id);
              onClose();
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.redeemBtnText}>Redeem</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.detailsSection}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Balance</Text>
          <Text style={styles.detailValue}>{balance}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Expires</Text>
          <Text style={styles.detailValue}>{expiry}</Text>
        </View>
        <View style={[styles.detailRow, styles.detailRowLast]}>
          <Text style={styles.detailLabel}>Status</Text>
          <Text style={[styles.detailValue, coupon.status !== 'active' && styles.statusUsed]}>
            {coupon.status.charAt(0).toUpperCase() + coupon.status.slice(1)}
          </Text>
        </View>
      </View>

      <TouchableOpacity style={styles.editBtn} onPress={onEdit}>
        <Text style={styles.editBtnText}>Edit Coupon</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => {
          onDelete(coupon.coupon_id);
          onClose();
        }}
      >
        <Text style={styles.deleteBtnText}>Delete Coupon</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, paddingBottom: 48 },
  couponCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 28,
    alignItems: 'center',
  },
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
  uploadedImage: {
    width: '100%',
    height: '100%',
  },
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
  uploadPlaceholder: {
    alignItems: 'center',
    gap: 6,
  },
  uploadIcon: {
    fontSize: 28,
    color: '#A8997A',
    fontWeight: '300',
  },
  uploadLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A2332',
    opacity: 0.55,
  },
  uploadHint: {
    fontSize: 12,
    color: '#A8997A',
  },
  codePill: {
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  codePillText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A2332',
    letterSpacing: 1,
  },
  redeemBtn: {
    backgroundColor: 'rgba(26,35,50,0.18)',
    borderRadius: 24,
    paddingVertical: 13,
    paddingHorizontal: 48,
  },
  redeemBtnText: {
    color: '#1A2332',
    fontSize: 16,
    fontWeight: '700',
  },
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
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EBE0',
  },
  detailRowLast: { borderBottomWidth: 0 },
  detailLabel: { fontSize: 15, color: '#1A2332', opacity: 0.55 },
  detailValue: { fontSize: 15, fontWeight: '600', color: '#1A2332' },
  statusUsed: { color: '#B8C4CC' },
  editBtn: {
    backgroundColor: '#E8604C',
    borderRadius: 30,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 12,
  },
  editBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  deleteBtn: {
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E8604C',
  },
  deleteBtnText: { color: '#E8604C', fontSize: 15, fontWeight: '600' },
});
