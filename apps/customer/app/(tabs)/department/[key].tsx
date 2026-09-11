import { useLocalSearchParams } from 'expo-router';
import { DepartmentScreen } from '../../../src/screens/DepartmentScreen';
import { ClothingScreen } from '../../../src/screens/clothing/ClothingScreen';

/**
 * One department's storefront.
 *
 * A route rather than a tab, because departments are data: the marketplace home
 * lists whatever `business_types` holds, and a new one must not need a new
 * screen. `key` is the business-type key — `grocery`, `bakery`, `clothing`.
 *
 * The screen itself is the shell that used to be Home, now scoped to whichever
 * department the key names. A department with no stock is not reachable from
 * the home rail; it says "coming soon" in the departments sheet instead.
 */
export default function DepartmentRoute() {
  const { key, brand } = useLocalSearchParams<{ key?: string; brand?: string }>();
  // Clothing is a filter-driven listing, not grocery's hero-and-rails
  // storefront — same components, a different shell. `brand` preselects the
  // brand filter when arriving from the Brands directory or a brand rail.
  if (key === 'clothing') return <ClothingScreen initialBrand={brand} />;
  // Falling back to grocery rather than rendering an unscoped shop: an absent
  // key can only come from a malformed link, and the unscoped screen — every
  // department's products under one heading — is the bug this replaced.
  return <DepartmentScreen department={key ?? 'grocery'} />;
}
