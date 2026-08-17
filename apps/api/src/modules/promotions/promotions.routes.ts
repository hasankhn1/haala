import { scaffoldRouter } from '../../common/scaffold';

export const promotionsRoutes = scaffoldRouter('promotions', [
  { method: 'POST', path: '/promotions/validate', desc: 'Validate a promo code against a cart' },
  { method: 'GET', path: '/promotions', desc: 'List active promotions' },
  { method: 'POST', path: '/promotions', desc: 'Create a promotion (admin)' },
]);
