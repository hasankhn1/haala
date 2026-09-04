import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { LinkedProvider } from '@haala/shared';
import { Button, Card, Divider, Icon, type IconName, Text, theme } from '@haala/ui';
import { authApi, notificationsApi } from '../../src/api/endpoints';
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

  /**
   * How this customer can sign in.
   *
   * Worth showing because the whole identity model rests on a claim they cannot
   * otherwise check: that arriving by Google, by email or by phone all reach the
   * *same* account. Listing the methods makes that promise inspectable instead
   * of something we simply assert.
   */
  const providers = useQuery({
    queryKey: qk.myProviders,
    queryFn: authApi.providers,
    enabled: signedIn,
    staleTime: 5 * 60_000,
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Scrolls now: the provider list and the sign-out note pushed this past
          a short screen's height, and a clipped Sign out is the one control on
          here somebody genuinely needs to reach. */}
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
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
              <Text variant="title" numberOfLines={1}>
                {user.email ?? user.name}
              </Text>
              <Text variant="bodySm" color="textSecondary" style={styles.userMeta}>
                Signed in {viaFor(providers.data)}
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

        {/* The methods, and the sentence they exist to make checkable. */}
        {signedIn && (providers.data?.length ?? 0) > 0 ? (
          <Card padded={false} style={styles.providerCard}>
            {providers.data!.map((p, i) => (
              <View
                key={p.provider}
                style={[styles.providerRow, i < providers.data!.length - 1 && styles.providerRowRule]}
              >
                <View style={styles.providerBadge}>
                  <Text variant="caption" color="textSecondary">
                    {BADGE[p.provider]}
                  </Text>
                </View>
                <Text variant="bodyStrong" style={styles.flex}>
                  {LABEL[p.provider]}
                </Text>
                <Text variant="labelSm" style={styles.providerState}>
                  Linked
                </Text>
              </View>
            ))}
            <View style={styles.providerNote}>
              <Text variant="bodySm" color="textSecondary">
                All methods point at one customer ID — signing in with Google using the same email
                never creates a second account.
              </Text>
            </View>
          </Card>
        ) : null}

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

        <View style={{ flex: 1, minHeight: theme.spacing.lg }} />

        {/* Said before signing out rather than after, when it would be too late
            to be reassuring. */}
        {signedIn ? (
          <>
            <View style={styles.basketNote}>
              <Icon name="bag-handle-outline" size={17} color={theme.colors.info} />
              <Text variant="bodySm" style={styles.basketNoteText}>
                Your basket stays on this device after you sign out, and merges back in next time
                you sign in.
              </Text>
            </View>
            <Pressable style={styles.signOut} onPress={logout} accessibilityRole="button">
              <Text variant="label" style={styles.signOutLabel}>
                Sign out
              </Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Short marks for the provider rows, in the comp's treatment. */
const BADGE: Record<LinkedProvider['provider'], string> = {
  google: 'G',
  apple: '',
  email: '@',
  phone: '#',
};

const LABEL: Record<LinkedProvider['provider'], string> = {
  google: 'Google',
  apple: 'Apple',
  email: 'Email and password',
  phone: 'Phone number',
};

/**
 * "Signed in with email", from the linked methods.
 *
 * Falls back to a bare "in" while the list is loading rather than guessing from
 * `user.email` — which is present for a Google customer too, so guessing would
 * confidently say the wrong thing.
 */
function viaFor(providers: LinkedProvider[] | undefined): string {
  if (!providers || providers.length === 0) return 'in';
  const first = providers[0].provider;
  return `with ${LABEL[first].toLowerCase().replace(' and password', '')}`;
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
  content: { flexGrow: 1, padding: theme.spacing.lg },
  flex: { flex: 1 },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  userMeta: { marginTop: 5 },
  providerCard: { marginTop: theme.spacing.md },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  providerRowRule: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  providerBadge: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: theme.colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerState: { color: theme.colors.confirmed },
  providerNote: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: theme.colors.surfaceSunken,
  },
  basketNote: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.infoSoft,
  },
  basketNoteText: { flex: 1, color: theme.colors.textPrimary },
  /** Outlined in the error family: destructive enough to look it, not a button
      you press by accident. */
  signOut: {
    marginTop: theme.spacing.md,
    height: 54,
    borderRadius: theme.radii.pill,
    borderWidth: 1.5,
    borderColor: theme.colors.borderAlert,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutLabel: { color: theme.colors.error },
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
