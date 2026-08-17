import { scaffoldRouter } from '../../common/scaffold';

export const notificationsRoutes = scaffoldRouter('notifications', [
  { method: 'GET', path: '/notifications', desc: 'List the current user’s notifications' },
  { method: 'POST', path: '/notifications/:id/read', desc: 'Mark one as read' },
  { method: 'POST', path: '/notifications/read-all', desc: 'Mark all as read' },
]);
