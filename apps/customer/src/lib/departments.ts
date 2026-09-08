import { BusinessTypeKey, departmentCopy, type DepartmentView } from '@haala/shared';
import { theme, type IconName } from '@haala/ui';

/**
 * Turning a department the API returned into one the home screen can draw.
 *
 * Three registries meet here and each owns one thing: the API says which
 * departments exist and whether they have stock, `departmentCopy` says what
 * they are called and what is inside, and `departmentTints` says what colour
 * they are. Nothing here decides any of that — it only joins them, and falls
 * back safely for a department the apps have not been taught yet.
 *
 * That fallback is the point. A new row in `business_types` shows up on this
 * screen immediately, in neutral clay with its own name and no examples line,
 * rather than crashing or being silently dropped. Teaching it a colour and a
 * sentence is then a follow-up, not a prerequisite.
 */
const GLYPHS: Record<string, IconName> = {
  [BusinessTypeKey.Grocery]: 'basket-outline',
  [BusinessTypeKey.Bakery]: 'cake-outline',
  [BusinessTypeKey.Clothing]: 'shirt-outline',
  [BusinessTypeKey.FreshProduce]: 'apple-outline',
  [BusinessTypeKey.FrozenFood]: 'snowflake-outline',
  [BusinessTypeKey.Gifts]: 'gift-outline',
};

export interface Department {
  key: string;
  name: string;
  isLive: boolean;
  tint: string;
  icon: IconName;
  examples: string;
  cta: string;
  flag?: string;
}

export function toDepartment(d: DepartmentView): Department {
  const copy = departmentCopy[d.key as BusinessTypeKey] as
    | (typeof departmentCopy)[BusinessTypeKey]
    | undefined;

  return {
    key: d.key,
    name: d.name,
    isLive: d.isLive,
    // A department with nothing to sell wears the muted ground whatever its
    // own colour is: a full-strength card that opens onto "coming soon" reads
    // as a broken link rather than a promise.
    tint: d.isLive
      ? (theme.departmentTints[d.key] ?? theme.departmentTintMuted)
      : theme.departmentTintMuted,
    icon: GLYPHS[d.key] ?? 'storefront-outline',
    examples: copy?.examples ?? '',
    cta: copy?.cta ?? `Shop ${d.name}`,
    ...(copy?.flag && d.isLive ? { flag: copy.flag } : {}),
  };
}
