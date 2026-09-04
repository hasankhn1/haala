import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { Icon, type IconName, theme } from '@haala/ui';
import { useCart } from '../../src/hooks/useCart';


/**
 * Basket navigation: a plain white bar with a hairline top border. The active
 * tab is signalled by the icon and label turning ember, and by a slightly
 * heavier stroke — nothing else. The 2px "ink bar" this used to draw was an
 * Onyx rule; Basket's comp has no such marker.
 */
const tabIcon =
  (name: IconName, focusedName: IconName) =>
  ({ focused, color, size }: { focused: boolean; color: string; size: number }) => (
    <Icon
      name={focused ? focusedName : name}
      size={size}
      color={color}
      strokeWidth={focused ? 2.4 : 1.8}
    />
  );

/**
 * The shop, open to everybody.
 *
 * There used to be a `<Redirect href="/login" />` here, which put the entire
 * app — home, search, basket, account — behind a sign-in. The design's first
 * rule is the opposite: guests browse, fill a basket, pick a store, and are
 * asked for nothing until checkout, where an account is genuinely needed to
 * place an order.
 *
 * The basket is safe to show either way: `useCart` reads the device's basket
 * while signed out and the server's once signed in, and hands back the same
 * shape, so the badge below needs no branch of its own.
 */
export default function TabsLayout() {
  const cart = useCart();
  const itemCount = cart.data?.itemCount ?? 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: styles.bar,
        tabBarItemStyle: styles.item,
        tabBarLabelStyle: styles.label,
        tabBarBadgeStyle: styles.badge,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: tabIcon('home-outline', 'home') }}
      />
      <Tabs.Screen
        name="search"
        options={{ title: 'Search', tabBarIcon: tabIcon('search-outline', 'search') }}
      />
      <Tabs.Screen
        name="categories"
        options={{ title: 'Categories', tabBarIcon: tabIcon('grid-outline', 'grid') }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Cart',
          tabBarIcon: tabIcon('cart-outline', 'cart'),
          tabBarBadge: itemCount > 0 ? itemCount : undefined,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: 'Profile', tabBarIcon: tabIcon('person-outline', 'person') }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    height: 64,
    paddingTop: 0,
  },
  item: { paddingTop: 0 },
  label: {
    fontFamily: theme.typography.fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 0.2,
  },
  badge: {
    backgroundColor: theme.colors.primary,
    color: theme.colors.onPrimary,
    fontFamily: theme.typography.fontFamily.bold,
    fontSize: 10,
  },
});
