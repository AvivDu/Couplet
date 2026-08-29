import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, glass, blur, radius, fontFamily, fontSize } from '../../constants/theme';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.coral400,
        tabBarInactiveTintColor: colors.tan600,
        tabBarShowLabel: true,
        tabBarLabelStyle: { fontFamily: fontFamily.uiSemibold, fontSize: fontSize.nano },
        tabBarItemStyle: { borderRadius: radius['2xl'] },
        tabBarStyle: {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 18 + insets.bottom,
          height: 64,
          borderRadius: radius['4xl'],
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: glass.edge,
          backgroundColor: 'transparent',
          // No overflow:'hidden' here so the float shadow below isn't clipped —
          // the blur/tint layers in tabBarBackground carry their own borderRadius.
          elevation: 10,
          shadowColor: colors.ink900,
          shadowOpacity: 0.16,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 18 },
        },
        tabBarBackground: () => (
          <>
            <BlurView intensity={blur.l} tint="light" style={[StyleSheet.absoluteFill, { borderRadius: radius['4xl'] }]} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: glass.thick, borderRadius: radius['4xl'] }]} />
          </>
        ),
        headerStyle: { backgroundColor: colors.surfacePage },
        headerTintColor: colors.textStrong,
        headerTitleStyle: { fontFamily: fontFamily.display, fontSize: 20 },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'My Coupons',
          headerShown: false,
          tabBarIcon: ({ color }) => <Ionicons name="pricetags-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: 'Add Coupon',
          headerShown: false,
          tabBarIcon: ({ color }) => <Ionicons name="add-circle-outline" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="connections"
        options={{
          title: 'Groups',
          headerShown: false,
          tabBarIcon: ({ color }) => <Ionicons name="people-outline" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
