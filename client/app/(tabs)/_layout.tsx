import { Tabs } from 'expo-router';
import { Text } from 'react-native';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#E8604C',
        tabBarInactiveTintColor: '#A8997A',
        tabBarStyle: {
          backgroundColor: '#F5F0E6',
          borderTopColor: '#E0D8CA',
        },
        headerStyle: { backgroundColor: '#F5F0E6' },
        headerTintColor: '#1A2332',
        headerTitleStyle: { fontWeight: '800', fontSize: 20 },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'My Coupons',
          headerShown: false,
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🏷️</Text>,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: 'Add Coupon',
          headerShown: false,
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>➕</Text>,
        }}
      />
    </Tabs>
  );
}
