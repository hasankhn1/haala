import * as Haptics from 'expo-haptics';

// Thin, crash-safe wrappers. Haptics are unavailable on web/simulators, so all
// calls are best-effort and never throw.
//
// Both failure shapes have to be swallowed: a rejected promise (no hardware),
// and a *synchronous* throw — on web the native methods can be undefined, so
// `fn()` blows up before there's a promise to attach `.catch` to.
const safe = (fn: () => Promise<unknown>): void => {
  try {
    void fn()?.catch?.(() => undefined);
  } catch {
    // no haptics available — ignore
  }
};

export const haptics = {
  tap: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  select: () => safe(() => Haptics.selectionAsync()),
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  error: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
