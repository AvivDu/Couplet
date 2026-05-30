import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'coupon_code_';

/**
 * Save sensitive coupon data (code/QR) locally — never sent to server.
 */
export async function saveCouponCode(couponId: string, code: string): Promise<void> {
  await AsyncStorage.setItem(`${PREFIX}${couponId}`, code);
}

export async function getCouponCode(couponId: string): Promise<string | null> {
  return AsyncStorage.getItem(`${PREFIX}${couponId}`);
}

export async function deleteCouponCode(couponId: string): Promise<void> {
  await AsyncStorage.removeItem(`${PREFIX}${couponId}`);
}

const IMAGE_PREFIX = 'coupon_image_';

export async function saveCouponImage(couponId: string, uri: string): Promise<void> {
  await AsyncStorage.setItem(`${IMAGE_PREFIX}${couponId}`, uri);
}

export async function getCouponImage(couponId: string): Promise<string | null> {
  return AsyncStorage.getItem(`${IMAGE_PREFIX}${couponId}`);
}

export async function deleteCouponImage(couponId: string): Promise<void> {
  await AsyncStorage.removeItem(`${IMAGE_PREFIX}${couponId}`);
}

const USER_AVATAR_KEY = 'user_avatar';

export async function saveUserAvatar(uri: string): Promise<void> {
  await AsyncStorage.setItem(USER_AVATAR_KEY, uri);
}

export async function getUserAvatar(): Promise<string | null> {
  return AsyncStorage.getItem(USER_AVATAR_KEY);
}
