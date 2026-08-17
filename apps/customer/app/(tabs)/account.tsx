import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Divider, Text, theme } from '@haala/ui';
import { useAuth } from '../../src/auth/AuthContext';

type IconName = keyof typeof Ionicons.glyphMap;

export default function AccountScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.content}>
        <Text variant="h1" style={{ marginBottom: theme.spacing.lg }}>
          Account
        </Text>

        <Card style={styles.userCard}>
          <View style={styles.avatar}>
            <Text variant="h2" color="onPrimary">
              {(user?.name ?? 'H').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="title">{user?.name ?? '—'}</Text>
            <Text variant="bodySm" color="textSecondary">
              {user?.phone}
            </Text>
          </View>
        </Card>

        <Card padded={false} style={{ marginTop: theme.spacing.lg }}>
          <MenuRow
            icon="location-outline"
            label="Delivery addresses"
            onPress={() => router.push('/addresses')}
          />
          <Divider />
          <MenuRow
            icon="receipt-outline"
            label="Your orders"
            onPress={() => router.push('/orders')}
          />
          <Divider />
          <MenuRow icon="help-circle-outline" label="Help & support" onPress={() => {}} />
        </Card>

        <View style={{ flex: 1 }} />
        <Button label="Log out" variant="secondary" onPress={logout} />
      </View>
    </SafeAreaView>
  );
}

function MenuRow({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.menuRow} onPress={onPress}>
      <Ionicons name={icon} size={20} color={theme.colors.textSecondary} />
      <Text variant="body" style={{ flex: 1 }}>
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  content: { flex: 1, padding: theme.spacing.lg },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
  },
});
