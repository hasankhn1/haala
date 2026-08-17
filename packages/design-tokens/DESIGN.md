# Onyx & Ink — Haala design system

Source of truth for `@haala/design-tokens` and `@haala/ui`.

**Provenance.** Generated in Google Stitch — project *SwiftCart Rapid Grocery*
(`8027475194803000408`), design system *Onyx & Ink*
(`assets/75cac6f7af844837b8495c9e0ea3550f`). The "Onyx Edition" screens in that
project are the reference comps. This replaced the earlier green/Instacart
direction on 2026-08-13.

> Stitch's MCP tools do not load in Claude Code (its JSON-Schema resolver can't
> dereference `#/$defs/ScreenInstance`). The server itself is fine over plain
> HTTP JSON-RPC — `initialize`, then `tools/call` with `list_screens` /
> `list_design_systems` — which is how these tokens were extracted.

## Brand

Premium, fintech-inspired **high-contrast minimalism**. Authoritative but
understated. Value is communicated through whitespace, typography and tonal
layering — never through decorative color.

The name is the rule: **Onyx** (deep structural blacks) against **Ink** (crisp
high-contrast content) on gallery-white surfaces.

## Non-negotiables

1. **Onyx `#0F172A` is the action color.** Primary CTAs, add-to-cart, active
   nav, selected states. Green is demoted to a *semantic* success signal
   (delivered, in stock) and is never brand.
2. **Restricted palette.** Slate tones plus one indigo accent. A colorful
   element on a product grid is a bug.
3. **Negative space over dividers.** Group with padding. Reach for a rule only
   when whitespace genuinely fails.
4. **One shadow.** `0 10px 30px rgba(15,23,42,0.04)`, ink-tinted, on white
   cards. Depth is atmospheric, not a drop shadow. No borders on cards.
5. **8px rhythm**, 4px half-steps. 32px+ between sections — the pacing is what
   keeps it off a crowded-supermarket feel.
6. **Radii are small.** Chips 4, cards/buttons/inputs 8, media 12, hero 16,
   sheets 24. Pills survive only on the Home category rail and avatars.
7. **No circular selection backdrops in nav.** Active = icon and label shift
   Slate → Onyx, plus a 2px ink bar on the item's leading edge.

## Type

**Plus Jakarta Sans**, loaded via `@expo-google-fonts/plus-jakarta-sans`.

React Native does not synthesise weights for custom families, so every text
style names its exact family (`PlusJakartaSans_600SemiBold`, …). The customer
app's root layout holds the splash until all five weights resolve; painting
earlier flashes system text and reflows every screen.

| Token | Size / line | Weight |
| --- | --- | --- |
| `displayLg` / `display` | 48/56 · 40/48 | 700 |
| `h1` / `h2` / `h3` | 32/40 · 24/32 · 20/28 | 600 |
| `title` / `body` / `bodySm` | 18/26 · 16/24 · 14/20 | 600 / 400 / 400 |
| `label` / `labelSm` / `labelCaps` | 14/20 · 12/16 · 12/16 caps | 600 / 600 / 700 |

Upstream letter-spacing is in `em`; the tokens pre-multiply it to points.

## Deviations from the comps

- **Auth.** The comps sign in with phone + OTP. The API authenticates on
  phone + password and has no OTP issuer, so the `+92` phone field and Onyx CTA
  are kept and the code step is a password. The OTP screen is not built.
- **Order tracking.** Built to the full design (map, driver card, call action),
  but the rider app and `delivery_assignments` are Phase 2 — so the rider pin
  is absent and the driver card renders placeholder details with a disabled
  call. Store and destination pins are real.
- **Immersive confirmation.** The comp backs it with an animated WebGL shader.
  That needs `expo-gl`; it is approximated with layered translucent ink blooms.
- **Promo banner.** Rendered as a solid ink panel rather than photography, so
  Home carries no remote image dependency.
