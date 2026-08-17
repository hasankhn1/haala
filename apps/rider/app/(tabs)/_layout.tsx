import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { theme } from '@haala/ui';
import { useAuth } from '../../src/auth/AuthContext';

type IconName = keyof typeof Ionicons.glyphMap;

const tabIcon =
  (name: IconName, focusedName: IconName) =>
  ({ focused, color, size }: { focused: boolean; color: string; size: number }) => (
    <View style={styles.iconWrap}>
      <View style={[styles.inkBar, focused ? styles.inkBarOn : styles.inkBarOff]} />
      <Ionicons name={focused ? focusedName : name} size={size} color={color} />
    </View>
  );

export default function TabsLayout() {
  const { status } = useAuth();
  if (status === 'unauthenticated') return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: styles.bar,
        tabBarLabelStyle: styles.label,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Queue', tabBarIcon: tabIcon('list-outline', 'list') }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: 'History', tabBarIcon: tabIcon('time-outline', 'time') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: tabIcon('person-outline', 'person') }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: theme.colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    height: 64,
  },
  iconWrap: { alignItems: 'center', gap: 6 },
  inkBar: { width: 24, height: 2, borderRadius: 1 },
  inkBarOn: { backgroundColor: theme.colors.primary },
  inkBarOff: { backgroundColor: 'transparent' },
  label: { fontFamily: theme.typography.fontFamily.semibold, fontSize: 11, letterSpacing: 0.2 },
});
