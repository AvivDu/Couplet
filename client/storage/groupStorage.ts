import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'group_image_';

export async function saveGroupImage(groupId: string, uri: string): Promise<void> {
  await AsyncStorage.setItem(`${PREFIX}${groupId}`, uri);
}

export async function getGroupImage(groupId: string): Promise<string | null> {
  return AsyncStorage.getItem(`${PREFIX}${groupId}`);
}

export async function deleteGroupImage(groupId: string): Promise<void> {
  await AsyncStorage.removeItem(`${PREFIX}${groupId}`);
}
