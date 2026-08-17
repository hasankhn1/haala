import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { tokenStore } from '../auth/tokenStore';
import { API_URL } from '../config';

interface OrderStatusEvent {
  orderId: string;
  status: string;
  at: string;
}

interface RiderLocationEvent {
  orderId: string;
  riderId: string;
  lat: number;
  lng: number;
  at: string;
}

export interface LiveRiderPosition {
  latitude: number;
  longitude: number;
  at: string;
}

/**
 * Live updates for one order.
 *
 * Two streams arrive on the same socket and are handled differently on purpose:
 *
 * - **status changes** are rare and change what's rendered, so they call back
 *   and let the screen refetch the order.
 * - **rider positions** arrive every few seconds and only move a map pin, so
 *   they're kept in local state here. Refetching the whole order on each ping
 *   would be a lot of traffic to move one dot.
 */
export function useOrderSocket(
  orderId: string | null,
  onStatus: (status: string) => void,
): LiveRiderPosition | null {
  const handler = useRef(onStatus);
  handler.current = onStatus;
  const [riderPosition, setRiderPosition] = useState<LiveRiderPosition | null>(null);

  useEffect(() => {
    if (!orderId) return;
    let socket: Socket | null = null;
    let cancelled = false;

    // A different order means the previous rider's position is meaningless.
    setRiderPosition(null);

    (async () => {
      const tokens = await tokenStore.load();
      if (!tokens || cancelled) return;
      socket = io(API_URL, {
        auth: { token: tokens.accessToken },
        transports: ['websocket'],
      });
      socket.on('connect', () => socket?.emit('order:subscribe', orderId));

      socket.on('order:status_updated', (payload: OrderStatusEvent) => {
        if (payload.orderId === orderId) handler.current(payload.status);
      });
      socket.on('delivery:status_updated', (payload: OrderStatusEvent) => {
        if (payload.orderId === orderId) handler.current(payload.status);
      });
      socket.on('rider:location_updated', (payload: RiderLocationEvent) => {
        if (payload.orderId !== orderId) return;
        setRiderPosition({ latitude: payload.lat, longitude: payload.lng, at: payload.at });
      });
    })();

    return () => {
      cancelled = true;
      socket?.emit('order:unsubscribe', orderId);
      socket?.disconnect();
    };
  }, [orderId]);

  return riderPosition;
}
