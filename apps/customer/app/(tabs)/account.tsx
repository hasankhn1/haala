import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Divider, Icon, type IconName, Text, theme } from '@haala/ui';
import { notificationsApi } from '../../src/api/endpoints';
import { qk } from '../../src/api/queryKeys';
import { useAuth } from '../../src/auth/AuthContext';


/**
 * Account, which a guest can now reach.
 *
 * Since the app-wide sign-in wall came down, this screen renders for somebody
 * with no account at all. It used to show a dash where their name goes and four
 * rows that would each answer 401, so the signed-out state is explicit: what
 * signing in gets you, and nothing that cannot work without it.
 */
export default function AccountScreen() {
  const router = useRouter();
  const { user, status, logout } = useAuth();
  const signedIn = status === 'authenticated' && user !== null;

  // Cheap enough to keep fresh; this is where the unread count is discovered
  // when a push was missed or dismissed. Not asked for at all while signed
  // out — the route is authenticated and would only ever 401.
  const notifications = useQuery({
    queryKey: qk.notifications,
    queryFn: notificationsApi.list,
    staleTime: 30_000,
    enabled: signedIn,
  });
  const unread = notifications.data?.unreadCount ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.content}>
        <Text variant="h1" style={{ marginBottom: theme.spacing.lg }}>
          Account
        </Text>

        {signedIn ? (
          <Card style={styles.userCard}>
            <View style={styles.avatar}>
              <Text variant="h2" color="onPrimary">
                {(user.name || 'H').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="title">{user.name}</Text>
              <Text variant="bodySm" color="textSecondary">
                {user.email ?? user.deliveryPhone ?? user.phone ?? ''}
              </Text>
            </View>
          </Card>
        ) : (
          <Card style={{ gap: theme.spacing.md }}>
            <Text variant="title">Sign in to order</Text>
            <Text variant="bodySm" color="textSecondary">
              Keep your addresses, follow a delivery, and see what you bought last time. Your
              basket comes with you.
            </Text>
            <Button label="Sign in or create an account" onPress={() => router.push('/login')} />
          </Card>
        )}

        <Card padded={false} style={{ marginTop: theme.spacing.lg }}>
          {/* Everything above the divider needs an account. Offering these to a
              guest would send them to a screen that answers 401. */}
          {signedIn ? (
            <>
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
              <MenuRow
                icon="notifications-outline"
                label="Notifications"
                badge={unread}
                onPress={() => router.push('/notifications')}
              />
              <Divider />
            </>
          ) : null}
          <MenuRow icon="help-circle-outline" label="Help & support" onPress={() => {}} />
        </Card>

        <View style={{ flex: 1 }} />
        {signedIn ? <Button label="Log out" variant="secondary" onPress={logout} /> : null}
      </View>
    </SafeAreaView>
  );
}

function MenuRow({
  icon,
  label,
  onPress,
  badge = 0,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  /** Unread count; hidden at zero. Capped at 9+ so the pill keeps its shape. */
  badge?: number;
}) {
  return (
    <Pressable style={styles.menuRow} onPress={onPress}>
      <Icon name={icon} size={20} color={theme.colors.textSecondary} />
      <Text variant="body" style={{ flex: 1 }}>
        {label}
      </Text>
      {badge > 0 ? (
        <View style={styles.badge}>
          <Text variant="caption" color="onPrimary">
            {badge > 9 ? '9+' : badge}
          </Text>
        </View>
      ) : null}
      <Icon name="chevron-forward" size={18} color={theme.colors.textTertiary} />
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
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
});
