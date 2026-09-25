import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SavedCardDto } from '@haala/shared';
import {
  Card,
  EmptyState,
  Icon,
  IconButton,
  StateView,
  Text,
  theme,
  useToast,
} from '@haala/ui';
import { messageFor } from '../src/api/client';
import { paymentsApi } from '../src/api/endpoints';
import { qk } from '../src/api/queryKeys';

/**
 * Cards Safepay is holding for this customer.
 *
 * Read-only apart from removal: a card is saved during a payment, on Safepay's
 * own checkout page, because that is the only place the number is ever typed.
 * There is deliberately no "add a card" button here — it would have to open a
 * checkout for an amount, and there isn't one.
 */
export default function PaymentMethodsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();

  /**
   * Which card is one tap from being removed.
   *
   * A two-step button rather than `Alert.alert`, which React Native Web turns
   * into a no-op — a destructive confirmation that silently does not appear on
   * one platform is worse than no confirmation at all.
   */
  const [confirming, setConfirming] = useState<string | null>(null);

  const cards = useQuery({
    queryKey: qk.paymentMethods,
    queryFn: async () => (await paymentsApi.methods()).cards,
  });

  const remove = useMutation({
    mutationFn: (token: string) => paymentsApi.removeMethod(token),
    onSuccess: () => {
      setConfirming(null);
      toast.show('Card removed', 'success');
      return qc.invalidateQueries({ queryKey: qk.paymentMethods });
    },
    onError: (e) => {
      setConfirming(null);
      toast.show(messageFor(e, 'Could not remove that card'), 'error');
    },
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <IconButton name="arrow-back" onPress={() => router.back()} accessibilityLabel="Back" />
        <Text variant="h2">Payment methods</Text>
      </View>

      <StateView
        loading={cards.isLoading}
        error={cards.error}
        isEmpty={!!cards.data && cards.data.length === 0}
        onRetry={() => cards.refetch()}
        empty={
          <EmptyState
            emoji="💳"
            title="No saved cards"
            subtitle="Pay by card once and you can choose to save it for next time."
          />
        }
      >
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {cards.data?.map((card) => (
            <SavedCardRow
              key={card.token}
              card={card}
              confirming={confirming === card.token}
              busy={remove.isPending && remove.variables === card.token}
              onRemovePress={() =>
                confirming === card.token
                  ? remove.mutate(card.token)
                  : setConfirming(card.token)
              }
              onCancel={() => setConfirming(null)}
            />
          ))}

          <Text variant="caption" color="textSecondary" style={styles.footnote}>
            Card details are held by Safepay, never by Haala. Removing a card here removes it
            from them too.
          </Text>
        </ScrollView>
      </StateView>
    </SafeAreaView>
  );
}

function SavedCardRow({
  card,
  confirming,
  busy,
  onRemovePress,
  onCancel,
}: {
  card: SavedCardDto;
  confirming: boolean;
  busy: boolean;
  onRemovePress: () => void;
  onCancel: () => void;
}) {
  // "Visa •• 1096", or just "•• 1096" when the BIN did not name a scheme. The
  // server sends null rather than guessing, so don't print "null".
  const title = [card.brand, card.last4 ? `•• ${card.last4}` : null].filter(Boolean).join(' ');
  const expiry =
    card.expiryMonth && card.expiryYear
      ? `Expires ${card.expiryMonth}/${card.expiryYear.slice(-2)}`
      : null;

  return (
    <Card style={styles.card}>
      <View style={styles.cardRow}>
        <View style={styles.cardIcon}>
          <Icon name="card-outline" size={20} color={theme.colors.textPrimary} />
        </View>

        <View style={styles.cardText}>
          <Text variant="body">{title || 'Saved card'}</Text>
          {expiry ? (
            <Text variant="caption" color="textSecondary">
              {expiry}
            </Text>
          ) : null}
        </View>

        {confirming ? (
          <View style={styles.confirmRow}>
            <Pressable onPress={onCancel} hitSlop={8} accessibilityLabel="Keep this card">
              <Text variant="caption" color="textSecondary">
                Keep
              </Text>
            </Pressable>
            <Pressable
              onPress={onRemovePress}
              disabled={busy}
              hitSlop={8}
              accessibilityLabel={`Confirm removing ${title || 'this card'}`}
            >
              <Text variant="caption" color="error">
                {busy ? 'Removing…' : 'Confirm'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={onRemovePress}
            hitSlop={8}
            accessibilityLabel={`Remove ${title || 'this card'}`}
          >
            <Icon name="close-circle-outline" size={20} color={theme.colors.textTertiary} />
          </Pressable>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.layout.margin,
    paddingVertical: theme.spacing.md,
  },
  content: {
    paddingHorizontal: theme.layout.margin,
    paddingBottom: theme.spacing['2xl'],
    gap: theme.spacing.md,
  },
  card: { paddingVertical: theme.spacing.md },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceMuted,
  },
  cardText: { flex: 1, gap: 2 },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  footnote: { marginTop: theme.spacing.sm },
});
