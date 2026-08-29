/**
 * Types for Lucide's per-icon modules.
 *
 * `Icon.tsx` imports the physical files (`lucide-react-native/dist/esm/icons/
 * <name>.mjs`) because Metro doesn't tree-shake and the barrel import costs
 * +1.78MB. TypeScript can't find the shipped declarations from those paths —
 * they live under `dist/types/icons/` — so this maps the pattern.
 *
 * Declaring **only** a default export is deliberate: each icon module ends with
 * `export { ArrowLeft as default }`, so a named import compiles to `undefined`
 * and the icon silently vanishes at runtime. This turns that into a type error.
 */
declare module 'lucide-react-native/dist/esm/icons/*.mjs' {
  import type { LucideIcon } from 'lucide-react-native';

  const icon: LucideIcon;
  export default icon;
}
