# Basket — Haala design system

Source of truth for `@haala/design-tokens` and `@haala/ui`.

**Provenance.** Claude Design project *Grocery App Design System*
(`724c489b-cf18-484d-a4bf-6adc9905d619`), file `Grocery App.dc.html` — eight
interactive screens (home, categories, listing, PDP, cart, checkout, success,
tracking). Imported via the DesignSync tool on 2026-08-29.

This replaced **Onyx & Ink** — the cool slate / gallery-white system sourced
from Google Stitch — which had itself replaced a green/Instacart direction on
2026-08-13. Onyx was coherent but austere; food retail reads warm, and the
comps for this system are unambiguous about that.

> The project's other three files — `support.js`, `image-slot.js`,
> `android-frame.jsx` — are canvas plumbing (the DC template runtime, an image
> placeholder element, and a Material 3 device bezel). **None of their colours
> or Material tokens belong in the app.** Only `Grocery App.dc.html` is design.

## Brand

Warm, appetising, **round**. Confidence comes from colour and weight rather
than from restraint. Where Onyx used whitespace and hairlines to create
hierarchy, Basket uses a hot action colour, heavy type and generous corners.

**Ember** `#FF5A1F` is the heat. **Clay** is everything structural — a warm
neutral ramp from `#F7F3EF` to `#191410`, never a cool grey. **Sun** `#FFD84D`
is savings and progress only.

## Non-negotiables

1. **Ember `#FF5A1F` is the action color.** Primary CTAs, add-to-cart, active
   nav, prices, selected states. Green is only a semantic success signal.
2. **Clay 900 `#26211E` is the contrast surface.** The free-delivery card, the
   ETA pill, the second promo banner. Use it when a block must sit forward;
   it is not a second brand colour and never a page background.
3. **Sun yellow is reserved.** Savings badges, "best value", the free-delivery
   progress fill. Yellow on chrome is a bug. It always carries ink text —
   yellow-on-white fails contrast at label sizes.
4. **The canvas is warm.** `#EDE7E0`, not white and never a cool off-white.
   White is for cards lifting off it.
5. **Round.** Pills for every chip, tag and control; 14 buttons/inputs, 16
   cards, 20 media, 26 for the hero sweep and sheets.
6. **Heavy headings.** Headings, product names, prices and titles are
   **extrabold (800)**; body copy stays regular. That contrast *is* the
   hierarchy — do not split the difference with semibold.
7. **One warm shadow.** Clay-tinted (`#3D3128`). Cards sit on beige now, so the
   old 4% slate whisper is invisible; `card` is 10% at 24px blur.
8. **8px rhythm**, 4px half-steps, 32px between sections — unchanged from the
   previous system. Basket differs in colour and roundness, not in measure.
9. **No circular selection backdrops in nav.** Active = icon and label shift to
   Ember, plus the ink bar on the item's leading edge.

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

## Not implemented from the Basket comps

Four things in `Grocery App.dc.html` have no backend and were deliberately left
out rather than faked — the same call made for Onyx's "Tax & Platform Fee":

- **Product size variants** (500 g / 1 kg with a per-kg unit price). Products
  carry a single `unit`; there is no variant model.
- **Service fee** and **tipping** at checkout. The bill is Subtotal / Delivery /
  Discount, and `promotionService.quote()` is the only thing that may alter it.
- **Plus / subscription nudge.** No such product exists.

The comps are also priced in Bahraini dinar and reference Dubai hubs; all money
renders through `formatPKR` and store names come from the `stores` table.
