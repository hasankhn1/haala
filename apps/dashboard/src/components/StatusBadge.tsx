/**
 * Status chip. Tonal rather than vivid, matching the Onyx rule that status is
 * information and not a traffic light — only completion and failure earn
 * colour.
 */
const TONE: Record<string, string> = {
  placed: 'neutral',
  confirmed: 'ink',
  preparing: 'ink',
  packed: 'dark',
  picked_up: 'ink',
  en_route_to_store: 'ink',
  at_store: 'ink',
  en_route_to_customer: 'ink',
  arrived: 'ink',
  out_for_delivery: 'dark',
  delivered: 'good',
  completed: 'good',
  cancelled: 'bad',
  failed: 'bad',
  rejected: 'bad',
  available: 'good',
  busy: 'warn',
  offline: 'neutral',
};

const LABEL: Record<string, string> = {
  placed: 'Placed',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  packed: 'Packed',
  picked_up: 'Picked up',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  failed: 'Failed',
  available: 'Available',
  busy: 'On a delivery',
  offline: 'Offline',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge ${TONE[status] ?? 'neutral'}`}>
      {LABEL[status] ?? status.replace(/_/g, ' ')}
    </span>
  );
}
