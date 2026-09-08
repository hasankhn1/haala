import { useLocalSearchParams } from 'expo-router';
import { DepartmentScreen } from '../../src/screens/DepartmentScreen';

/**
 * One department's storefront.
 *
 * A route rather than a tab, because departments are data: the marketplace home
 * lists whatever `business_types` holds, and a new one must not need a new
 * screen. `key` is the business-type key — `grocery`, `bakery`, `clothing`.
 *
 * The screen itself is the grocery shell that used to be Home. Only grocery has
 * stock today, so it is the only department the home screen lets you open; the
 * rest say "coming soon" until they have something to sell.
 */
export default function DepartmentRoute() {
  // Read but not yet passed on: the shell is grocery-only until the catalogue
  // can be filtered by business type. Keeping it in the URL means the link the
  // home screen builds is already the right one.
  useLocalSearchParams<{ key?: string }>();
  return <DepartmentScreen />;
}
