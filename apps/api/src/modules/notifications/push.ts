import { logger } from '../../common/logger';

/**
 * Expo push transport.
 *
 * Deliberately plain `fetch` against Expo's HTTP API rather than the SDK — the
 * payload is small, the batching rule is one line, and the SDK would be a
 * dependency for something we call in exactly one place.
 *
 * Nothing here throws to the caller: a notification is a courtesy, and Expo
 * being slow or down must never fail the order operation that triggered it.
 */
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Expo accepts at most 100 messages per request. */
const BATCH_SIZE = 100;

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default';
  /** Android channel; must match one registered by the app. */
  channelId?: string;
}

export interface PushOutcome {
  sent: number;
  /** Tokens Expo says are dead — the caller should delete these rows. */
  invalidTokens: string[];
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/**
 * Expo's token format. Checked before sending because a malformed token makes
 * Expo reject the whole batch, which would silently drop notifications for
 * every other recipient in it.
 */
export const isExpoPushToken = (token: string): boolean =>
  /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token) || /^[a-zA-Z0-9_-]{22,}$/.test(token);

export const sendPush = async (messages: PushMessage[]): Promise<PushOutcome> => {
  const valid = messages.filter((m) => isExpoPushToken(m.to));
  const malformed = messages.filter((m) => !isExpoPushToken(m.to)).map((m) => m.to);
  if (malformed.length > 0) {
    logger.warn({ count: malformed.length }, 'Dropping malformed push tokens');
  }
  if (valid.length === 0) return { sent: 0, invalidTokens: malformed };

  const invalidTokens = [...malformed];
  let sent = 0;

  for (const batch of chunk(valid, BATCH_SIZE)) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(batch.map((m) => ({ sound: 'default', ...m }))),
      });

      if (!res.ok) {
        logger.warn({ status: res.status }, 'Expo push request failed');
        continue;
      }

      const json = (await res.json()) as { data?: ExpoTicket[] };
      const tickets = json.data ?? [];

      tickets.forEach((ticket, i) => {
        if (ticket.status === 'ok') {
          sent += 1;
          return;
        }
        // A reinstalled or wiped app leaves a token that will never deliver
        // again. Collecting these lets the caller prune the table instead of
        // retrying them on every future order.
        if (ticket.details?.error === 'DeviceNotRegistered') {
          const token = batch[i]?.to;
          if (token) invalidTokens.push(token);
        } else {
          logger.warn({ error: ticket.details?.error, message: ticket.message }, 'Push ticket error');
        }
      });
    } catch (err) {
      logger.warn({ err }, 'Expo push transport error');
    }
  }

  return { sent, invalidTokens };
};
