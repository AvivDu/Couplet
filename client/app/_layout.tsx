import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts as useOutfitFonts, Outfit_600SemiBold, Outfit_800ExtraBold } from '@expo-google-fonts/outfit';
import { useFonts as useManropeFonts, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { useFonts as useJetBrainsMonoFonts, JetBrainsMono_500Medium, JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { NotificationsProvider } from '../context/NotificationsContext';
import WebRTCBridge from '../components/WebRTCBridge';

function RootGuard({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!user && !inAuthGroup) {
      router.replace('/(auth)/welcome');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [user, isLoading, segments]);

  if (isLoading || !fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F0E6' }}>
        <ActivityIndicator size="large" color="#E8604C" />
      </View>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  const [outfitLoaded] = useOutfitFonts({ Outfit_600SemiBold, Outfit_800ExtraBold });
  const [manropeLoaded] = useManropeFonts({ Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold });
  const [jetBrainsMonoLoaded] = useJetBrainsMonoFonts({ JetBrainsMono_500Medium, JetBrainsMono_700Bold });
  const fontsLoaded = outfitLoaded && manropeLoaded && jetBrainsMonoLoaded;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <NotificationsProvider>
          <RootGuard fontsLoaded={fontsLoaded} />
          <WebRTCBridge />
        </NotificationsProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
