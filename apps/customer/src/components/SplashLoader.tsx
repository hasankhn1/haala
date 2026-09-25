import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { theme } from '@haala/ui';

/**
 * The launch loader, from `Haala Splash.dc.html`: the logo GIF on ember.
 *
 * The native splash is set to the same ember in `app.json`, so hiding it and
 * painting this is invisible — the design asks for exactly that handoff.
 *
 * It holds for at least one full loop (3.0s), so a warm launch plays the
 * animation instead of flashing a frame of it, and gives up after 8s, so a
 * hung request lands on the home screen's own error state rather than behind
 * an orange wall.
 */
const MIN_MS = 3_000;
const MAX_MS = 8_000;
/** The GIF's own size; drawn larger it only blurs (tablets). */
const GIF_PX = 600;

type Splash = { reportHome: (ready: boolean) => void; replay: () => void };
const SplashContext = createContext<Splash | null>(null);

/**
 * The home screen reports whether it has something to show. A state, not an
 * event: a home that was already mounted when the loader replays still
 * counts, and one that mounts mid-load reports `false` first.
 */
export function useSplashDone(ready: boolean) {
  const splash = useContext(SplashContext);
  useEffect(() => {
    splash?.reportHome(ready);
  }, [ready, splash]);
}

/**
 * Play the loader again — for a sign-in that is about to land on the home
 * screen. Deliberately not automatic on every sign-in: the checkout sheet
 * signs people in too, and returns them to their basket, where an orange
 * wall would be exactly wrong.
 */
export function useSplashReplay() {
  return useContext(SplashContext)?.replay;
}

/**
 * `ready` is the root's own gate (fonts + session). While `waitForHome` is
 * true the loader also waits for the home screen to report in; signed out,
 * the app opens on `/login` and there is no home to wait for.
 */
export function SplashOverlay({
  ready,
  waitForHome,
  children,
}: {
  ready: boolean;
  waitForHome: boolean;
  children: ReactNode;
}) {
  const [homeReady, setHomeReady] = useState(false);
  const [minElapsed, setMinElapsed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [launch, setLaunch] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const { width } = useWindowDimensions();

  const [splash] = useState<Splash>(() => ({
    reportHome: setHomeReady,
    // Reset in the same batch as the bump, so the screen underneath never
    // shows for the frame before the timer effect re-runs.
    replay: () => {
      setDismissed(false);
      setMinElapsed(false);
      setTimedOut(false);
      setLaunch((n) => n + 1);
    },
  }));

  useEffect(() => {
    const min = setTimeout(() => setMinElapsed(true), MIN_MS);
    const max = setTimeout(() => setTimedOut(true), MAX_MS);
    return () => {
      clearTimeout(min);
      clearTimeout(max);
    };
  }, [launch]);

  // The timeout only overrides the wait for home; until fonts and session are
  // in there is nothing underneath to reveal.
  const holding = !ready || (!timedOut && !(minElapsed && (homeReady || !waitForHome)));
  // Once gone it stays gone until a replay — a home that starts loading again
  // (a new address, a new store) shows its own loading state, not this.
  const visible = holding && !dismissed;
  useEffect(() => {
    if (!holding) setDismissed(true);
  }, [holding]);
  const size = Math.min(width, GIF_PX);

  return (
    <SplashContext.Provider value={splash}>
      {ready ? children : null}
      {visible ? (
        <View style={styles.screen}>
          <StatusBar style="light" />
          {/* The comp draws it 314 wide in a 330 frame — effectively edge to edge. */}
          <Image
            source={require('../../assets/haala-logo-loading.gif')}
            style={{ width: size, height: size }}
            accessible
            accessibilityLabel="Haala is loading"
          />
        </View>
      ) : null}
    </SplashContext.Provider>
  );
}

const styles = StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
