import { scaffoldRouter } from '../../common/scaffold';

export const analyticsRoutes = scaffoldRouter('analytics', [
  { method: 'GET', path: '/analytics/overview', desc: 'Ops dashboard: orders, GMV, avg delivery time (admin)' },
]);
