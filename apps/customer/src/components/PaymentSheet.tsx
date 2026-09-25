import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { classifyCheckoutUrl, type CheckoutExit } from '@haala/shared';
import { IconButton, Text, theme } from '@haala/ui';

/**
 * Safepay's hosted checkout, rendered **inside the app** rather than in a
 * browser sheet.
 *
 * ## Why not `@sfpy/react-native-sdk`
 *
 * Their official SDK does the same job and cannot be used here. It calls
 * `/order/v1/init` — the v1 API this integration replaced — **from the phone**,
 * with the amount as a prop, so the client names its own price and our server
 * never sees the tracker. It also sends no tracker metadata, so the webhook
 * that follows carries nothing to match an order against and the order would
 * never reach `paid`. Its last commit is from July 2023 and it pins
 * `react-native-webview@^11` against Expo SDK 52's 13.12.5.
 *
 * What it does have is this screen. So this is that screen, over a session our
 * own server created, with the amount, the order metadata and the saved-card
 * customer all fixed server-side.
 *
 * ## What closing the sheet does and does not mean
 *
 * Nothing here is evidence of payment. A page reaching `/external/complete`
 * means a page loaded; the webhook is what moves money, and `runOnlineCheckout`
 * re-asks our own server either way. The only decision made in this file is
 * **when to stop showing the WebView** — and getting that wrong in the eager
 * direction closes a 3DS challenge mid-authentication, which is why the URL
 * matching lives in `@haala/shared` behind tests.
 */
export type SheetOutcome = CheckoutExit | 'dismissed';

export const usePaymentSheet = (): {
  present: (url: string) => Promise<SheetOutcome>;
  sheet: React.ReactNode;
} => {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Resolves the promise `present()` handed back. Held in a ref and cleared on
   * use, because both navigation callbacks can fire for the same URL and a
   * promise resolved twice would be a silent second `verify` call.
   */
  const resolver = useRef<((outcome: SheetOutcome) => void) | null>(null);

  const finish = useCallback((outcome: SheetOutcome) => {
    const resolve = resolver.current;
    resolver.current = null;
    setUrl(null);
    if (resolve) resolve(outcome);
  }, []);

  const present = useCallback((next: string) => {
    setLoading(true);
    setUrl(next);
    return new Promise<SheetOutcome>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  /**
   * Android does not fire `onShouldStartLoadWithRequest` for every navigation,
   * and iOS does not always produce a `onNavigationStateChange` for a custom
   * scheme. Both are wired, and `finish` is idempotent, so whichever arrives
   * first wins and the second is a no-op.
   */
  const onNavigation = useCallback(
    (event: WebViewNavigation) => {
      const exit = classifyCheckoutUrl(event.url);
      if (exit) finish(exit);
    },
    [finish],
  );

  const shouldLoad = useCallback(
    (event: WebViewNavigation) => {
      const exit = classifyCheckoutUrl(event.url);
      if (!exit) return true;
      // Returning false stops the WebView trying to render a URL that is only a
      // signal — `haala://` in particular has nothing behind it to load.
      finish(exit);
      return false;
    },
    [finish],
  );

  const sheet = (
    <Modal
      visible={url !== null}
      animationType="slide"
      // Android's hardware back button. Without this the sheet is inescapable
      // if the page stalls.
      onRequestClose={() => finish('dismissed')}
    >
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.header}>
          <IconButton
            name="close"
            onPress={() => finish('dismissed')}
            accessibilityLabel="Cancel payment"
          />
          <Text variant="h3" style={styles.title}>
            Secure checkout
          </Text>
          {/* Balances the close button so the title stays centred. */}
          <View style={styles.headerSpacer} />
        </View>

        {url ? (
          <View style={styles.flex}>
            <WebView
              source={{ uri: url }}
              style={styles.flex}
              onNavigationStateChange={onNavigation}
              onShouldStartLoadWithRequest={shouldLoad}
              onLoadEnd={() => setLoading(false)}
              // Their page keeps state across the 3DS hop, and the card form is
              // JavaScript throughout.
              javaScriptEnabled
              domStorageEnabled
              // Third-party cookies are how the issuer's ACS keeps the
              // challenge session on Android.
              thirdPartyCookiesEnabled
              startInLoadingState={false}
            />
            {loading ? (
              <View style={styles.loading} pointerEvents="none">
                <ActivityIndicator size="large" color={theme.colors.primary} />
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.footer}>
          <Text variant="caption" color="textSecondary" style={styles.footerText}>
            Payments are handled by Safepay. Haala never sees your card number.
          </Text>
        </View>
      </SafeAreaView>
    </Modal>
  );

  return { present, sheet };
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  title: { flex: 1, textAlign: 'center' },
  headerSpacer: { width: 40 },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
  footer: {
    paddingHorizontal: theme.layout.margin,
    paddingVertical: theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  footerText: { textAlign: 'center' },
});
