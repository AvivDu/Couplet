import { useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { updateProfile, resolvePhone, uploadProfileImage } from '../services/api';
import AuroraBackground from '../components/ui/AuroraBackground';
import ScreenHeader from '../components/ui/ScreenHeader';
import Avatar from '../components/ui/Avatar';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import { colors, radius, spacing } from '../constants/theme';

export default function EditProfileScreen() {
  const router = useRouter();
  const { user, updateUser } = useAuth();
  const [username, setUsername] = useState(user?.username ?? '');
  const [phone, setPhone] = useState(user?.phone_number ?? '');
  const [newImageUri, setNewImageUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const avatarUri = newImageUri ?? user?.profile_image ?? null;

  async function pickAvatar() {
    Alert.alert('Profile Photo', 'Choose a source', [
      {
        text: 'Camera',
        onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (perm.status !== 'granted') {
            Alert.alert('Permission needed', 'Please allow camera access in Settings.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.85 });
          if (!result.canceled) setNewImageUri(result.assets[0].uri);
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
          const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.85 });
          if (!result.canceled) setNewImageUri(result.assets[0].uri);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function handleSave() {
    if (!username.trim()) {
      Alert.alert('Missing fields', 'Username is required.');
      return;
    }

    const stripped = phone.replace(/\D/g, '');
    if (phone.trim() && !/^0\d{8,9}$/.test(stripped)) {
      Alert.alert('Invalid phone', 'Please enter a valid Israeli phone number (e.g. 0501234567).');
      return;
    }

    setSaving(true);
    try {
      if (phone.trim() && phone !== user?.phone_number) {
        const existingEmail = await resolvePhone(stripped);
        if (existingEmail && existingEmail !== user?.email) {
          Alert.alert('Phone already in use', 'That phone number is linked to another account.');
          setSaving(false);
          return;
        }
      }

      await updateProfile({
        username: username.trim(),
        phone_number: phone.trim() ? stripped : undefined,
      });
      updateUser({ username: username.trim(), phone_number: phone.trim() ? stripped : undefined });

      if (newImageUri) {
        const resized = await ImageManipulator.manipulateAsync(
          newImageUri,
          [{ resize: { width: 256, height: 256 } }],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        const dataUrl = `data:image/jpeg;base64,${resized.base64}`;
        await uploadProfileImage(dataUrl);
        updateUser({ profile_image: dataUrl });
      }

      router.back();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Could not save changes.';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  }

  const initials = (user?.username ?? '').slice(0, 2).toUpperCase();

  return (
    <AuroraBackground>
      <ScreenHeader back onBack={() => router.back()} title="Edit Profile" />

      {/* Avatar */}
      <View style={styles.avatarWrap}>
        <TouchableOpacity onPress={pickAvatar} activeOpacity={0.8} style={styles.avatarTouchable}>
          <Avatar initials={initials} src={avatarUri} size="xxl" />
          <View style={styles.cameraBadge}>
            <Ionicons name="camera-outline" size={14} color="#fff" />
          </View>
        </TouchableOpacity>
      </View>

      {/* Form */}
      <View style={styles.form}>
        <Input
          label="Username"
          value={username}
          onChangeText={setUsername}
          placeholder="Username"
          autoCapitalize="none"
          wrapperStyle={styles.field}
        />

        <Input
          label="Phone number"
          value={phone}
          onChangeText={setPhone}
          placeholder="e.g. 0501234567"
          keyboardType="phone-pad"
          wrapperStyle={styles.field}
        />

        <Input
          label="Email"
          value={user?.email ?? ''}
          editable={false}
          wrapperStyle={styles.field}
        />

        <Button variant="primary" size="l" block onPress={handleSave} disabled={saving} style={styles.saveBtn}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : 'Save Changes'}
        </Button>
      </View>
    </AuroraBackground>
  );
}

const styles = StyleSheet.create({
  avatarWrap: { alignItems: 'center', marginTop: 20, marginBottom: 32 },
  avatarTouchable: { position: 'relative' },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.coral400,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surfacePage,
  },
  form: { paddingHorizontal: spacing.gutterScreen },
  field: { marginBottom: spacing.s7 },
  saveBtn: { marginTop: 12 },
});
