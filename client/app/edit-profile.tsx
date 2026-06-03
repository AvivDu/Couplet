import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { updateProfile, resolvePhone, uploadProfileImage } from '../services/api';

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

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={26} color="#1A2332" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Avatar */}
      <View style={styles.avatarWrap}>
        <TouchableOpacity onPress={pickAvatar} activeOpacity={0.8}>
          <View style={styles.avatarCircle}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <Ionicons name="person-outline" size={44} color="#A8997A" />
            )}
          </View>
          <View style={styles.cameraBadge}>
            <Ionicons name="camera-outline" size={14} color="#fff" />
          </View>
        </TouchableOpacity>
      </View>

      {/* Form */}
      <View style={styles.form}>
        <Text style={styles.fieldLabel}>USERNAME</Text>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="Username"
            placeholderTextColor="#A8997A"
            autoCapitalize="none"
          />
        </View>

        <Text style={styles.fieldLabel}>PHONE NUMBER</Text>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="e.g. 0501234567"
            placeholderTextColor="#A8997A"
            keyboardType="phone-pad"
          />
        </View>

        <Text style={styles.fieldLabel}>EMAIL</Text>
        <View style={[styles.inputWrap, styles.inputWrapDisabled]}>
          <TextInput
            style={[styles.input, styles.inputDisabled]}
            value={user?.email ?? ''}
            editable={false}
          />
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveBtnText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F0E6' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1A2332' },
  headerSpacer: { width: 40 },
  avatarWrap: { alignItems: 'center', marginTop: 20, marginBottom: 32 },
  avatarCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#E0D8CA',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: 96, height: 96 },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E8604C',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#F5F0E6',
  },
  form: { paddingHorizontal: 24 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A8997A',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  inputWrap: {
    borderBottomWidth: 1.5,
    borderBottomColor: '#C4B8A0',
    marginBottom: 28,
  },
  inputWrapDisabled: { borderBottomColor: '#E0D8CA' },
  input: {
    paddingVertical: 10,
    fontSize: 16,
    color: '#1A2332',
    backgroundColor: 'transparent',
  },
  inputDisabled: { color: '#1A2332', opacity: 0.35 },
  saveBtn: {
    marginTop: 12,
    backgroundColor: '#E8604C',
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
