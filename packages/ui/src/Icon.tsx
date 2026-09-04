/// <reference path="./lucide-icons.d.ts" />
// The reference is load-bearing: the apps' tsconfigs only `include` their
// own app/ and src/, so a standalone .d.ts in this package would not enter
// their programs and every icon import would fall back to implicit-any.
import ArrowLeft from 'lucide-react-native/dist/esm/icons/arrow-left.mjs';
import ArrowRight from 'lucide-react-native/dist/esm/icons/arrow-right.mjs';
import Banknote from 'lucide-react-native/dist/esm/icons/banknote.mjs';
import Bell from 'lucide-react-native/dist/esm/icons/bell.mjs';
import Bike from 'lucide-react-native/dist/esm/icons/bike.mjs';
import Briefcase from 'lucide-react-native/dist/esm/icons/briefcase.mjs';
import Building2 from 'lucide-react-native/dist/esm/icons/building-2.mjs';
import Check from 'lucide-react-native/dist/esm/icons/check.mjs';
import ChevronDown from 'lucide-react-native/dist/esm/icons/chevron-down.mjs';
import ChevronRight from 'lucide-react-native/dist/esm/icons/chevron-right.mjs';
import CircleAlert from 'lucide-react-native/dist/esm/icons/circle-alert.mjs';
import CircleCheck from 'lucide-react-native/dist/esm/icons/circle-check.mjs';
import CircleCheckBig from 'lucide-react-native/dist/esm/icons/circle-check-big.mjs';
import CircleQuestionMark from 'lucide-react-native/dist/esm/icons/circle-question-mark.mjs';
import CircleX from 'lucide-react-native/dist/esm/icons/circle-x.mjs';
import Clock from 'lucide-react-native/dist/esm/icons/clock.mjs';
import Eye from 'lucide-react-native/dist/esm/icons/eye.mjs';
import EyeOff from 'lucide-react-native/dist/esm/icons/eye-off.mjs';
import Mail from 'lucide-react-native/dist/esm/icons/mail.mjs';
import ShieldCheck from 'lucide-react-native/dist/esm/icons/shield-check.mjs';
import CreditCard from 'lucide-react-native/dist/esm/icons/credit-card.mjs';
import Heart from 'lucide-react-native/dist/esm/icons/heart.mjs';
import House from 'lucide-react-native/dist/esm/icons/house.mjs';
import Info from 'lucide-react-native/dist/esm/icons/info.mjs';
import LayoutGrid from 'lucide-react-native/dist/esm/icons/layout-grid.mjs';
import List from 'lucide-react-native/dist/esm/icons/list.mjs';
import LocateFixed from 'lucide-react-native/dist/esm/icons/locate-fixed.mjs';
import MapPin from 'lucide-react-native/dist/esm/icons/map-pin.mjs';
import Mic from 'lucide-react-native/dist/esm/icons/mic.mjs';
import Minus from 'lucide-react-native/dist/esm/icons/minus.mjs';
import Navigation from 'lucide-react-native/dist/esm/icons/navigation.mjs';
import Package from 'lucide-react-native/dist/esm/icons/package.mjs';
import Pencil from 'lucide-react-native/dist/esm/icons/pencil.mjs';
import Phone from 'lucide-react-native/dist/esm/icons/phone.mjs';
import Plus from 'lucide-react-native/dist/esm/icons/plus.mjs';
import Receipt from 'lucide-react-native/dist/esm/icons/receipt.mjs';
import Search from 'lucide-react-native/dist/esm/icons/search.mjs';
import Share2 from 'lucide-react-native/dist/esm/icons/share-2.mjs';
import ShoppingBag from 'lucide-react-native/dist/esm/icons/shopping-bag.mjs';
import ShoppingBasket from 'lucide-react-native/dist/esm/icons/shopping-basket.mjs';
import ShoppingCart from 'lucide-react-native/dist/esm/icons/shopping-cart.mjs';
import Store from 'lucide-react-native/dist/esm/icons/store.mjs';
import Tag from 'lucide-react-native/dist/esm/icons/tag.mjs';
import User from 'lucide-react-native/dist/esm/icons/user.mjs';
import X from 'lucide-react-native/dist/esm/icons/x.mjs';
import Zap from 'lucide-react-native/dist/esm/icons/zap.mjs';
import type { LucideIcon } from 'lucide-react-native';
import { theme } from '@haala/design-tokens';

/**
 * The single icon surface for both apps.
 *
 * Lucide (stroke-based, 24px grid, uniform 2px stroke) replaced Ionicons
 * because Onyx & Ink is a thin-line system and Ionicons mixes filled and
 * outline shapes at inconsistent weights.
 *
 * Names are kept in the old Ionicons vocabulary deliberately: every call site
 * and every stored icon name in the notification map keeps working, and this
 * file is the only place that knows what draws them. Lucide renames icons
 * between majors — v1 alone moved `circle-help` to `circle-question-mark` and
 * `check-circle-2` to `circle-check-big` — so containing that churn to one
 * module is the point.
 *
 * The imports are **per-icon file paths, not `from 'lucide-react-native'`**.
 * Metro does not tree-shake, so the barrel import pulled all 1770 icons in for
 * the 42 we draw: measured at +1.78MB on the Android bundle (4.24MB -> 6.02MB).
 * The package's own `./icons/*` subpath would be tidier, but resolving it needs
 * Metro package exports, which Expo SDK 52 leaves off by default — so these
 * reach the physical files. Revisit when package exports become the default.
 *
 * Lucide has no filled/outline pair for most glyphs, so an `-outline` alias
 * resolves to the same drawing. Where a filled/unfilled distinction carries
 * meaning (tab focus, favourites) use `strokeWidth` or `fill`, not the name.
 */
type IconComponent = LucideIcon;

/**
 * `satisfies` rather than a type annotation, so `keyof typeof ICONS` below is
 * the union of the names actually present.
 *
 * It used to be annotated `Record<string, IconComponent>`, which made
 * `IconName` widen to `string` — every name typechecked, present or not, and a
 * missing one hit the `!Glyph` guard and rendered **nothing**. Four call sites
 * across the auth and checkout screens were asking for `mail-outline` and
 * `call-outline`, neither of which was in this map, so those rows simply had no
 * icon and the code gave no hint of it. A missing icon is now a compile error.
 */
const ICONS = {
  'add': Plus,
  'alert-circle-outline': CircleAlert,
  'arrow-back': ArrowLeft,
  'arrow-forward': ArrowRight,
  'bag-handle-outline': ShoppingBag,
  'basket-outline': ShoppingBasket,
  'bicycle-outline': Bike,
  'briefcase': Briefcase,
  'briefcase-outline': Briefcase,
  'business-outline': Building2,
  'call': Phone,
  'call-outline': Phone,
  'card-outline': CreditCard,
  'cart': ShoppingCart,
  'cart-outline': ShoppingCart,
  'cash-outline': Banknote,
  'checkmark': Check,
  'checkmark-circle': CircleCheckBig,
  'checkmark-circle-outline': CircleCheck,
  'chevron-down': ChevronDown,
  'chevron-forward': ChevronRight,
  'close': X,
  'close-circle': CircleX,
  'close-circle-outline': CircleX,
  'cube-outline': Package,
  'eye-off-outline': EyeOff,
  'eye-outline': Eye,
  'flash-outline': Zap,
  'grid': LayoutGrid,
  'grid-outline': LayoutGrid,
  'heart': Heart,
  'heart-outline': Heart,
  'help-circle-outline': CircleQuestionMark,
  'home': House,
  'home-outline': House,
  'information-circle-outline': Info,
  'list': List,
  'list-outline': List,
  'mail-outline': Mail,
  'locate': LocateFixed,
  'location': MapPin,
  'location-outline': MapPin,
  'mic-outline': Mic,
  'navigate': Navigation,
  'navigate-outline': Navigation,
  'notifications': Bell,
  'notifications-outline': Bell,
  'pencil': Pencil,
  'person': User,
  'person-outline': User,
  'pricetag': Tag,
  'pricetag-outline': Tag,
  'receipt-outline': Receipt,
  'remove': Minus,
  'search': Search,
  'search-outline': Search,
  'share-outline': Share2,
  'shield-checkmark-outline': ShieldCheck,
  'storefront-outline': Store,
  'time': Clock,
  'time-outline': Clock,
} satisfies Record<string, IconComponent>;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  /** Lucide's own default is 2. Raise it to weight a focused tab. */
  strokeWidth?: number;
  /** Fills the glyph — for favourites and other on/off states. */
  fill?: string;
}

export function Icon({
  name,
  size = 22,
  color = theme.colors.textPrimary,
  strokeWidth = 2,
  fill = 'none',
}: IconProps) {
  const Glyph = ICONS[name];
  if (!Glyph) return null;
  return <Glyph size={size} color={color} strokeWidth={strokeWidth} fill={fill} />;
}
