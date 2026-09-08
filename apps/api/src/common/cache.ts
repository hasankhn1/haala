import { logger } from './logger';
import { redis } from '../redis/client';

/**
 * A read-through cache for responses that are expensive and rarely change.
 *
 * **It fails open, and that is the whole design.** Every Redis call here is
 * wrapped: a timeout, a connection drop, a full instance, a serialisation
 * problem — any of them and the request computes its answer and returns it. A
 * cache that can take the home screen down is strictly worse than no cache,
 * because it converts a performance concern into an availability one.
 *
 * The corollary is that nothing may depend on a value being cached. These
 * helpers are an optimisation and must stay one.
 */

/**
 * How long any single cache operation may take before we give up on it.
 *
 * **This is the second half of failing open, and it is the half that is easy to
 * miss.** Returning the right answer eventually is not enough. ioredis queues
 * commands while it is disconnected and retries the connection with a growing
 * backoff, so with Redis stopped the endpoint kept answering 200 with correct
 * data — in 1.2s, then 4.5s, then 7.8s, climbing with every request. Correct
 * and unusable: past a few seconds the gateway times out and the shopper sees
 * the same blank screen a 500 would have given them.
 *
 * A local Redis answers in single-digit milliseconds and a managed one across a
 * network hop in tens, so this is generous by an order of magnitude while still
 * sitting far below anything a person notices.
 */
const CACHE_TIMEOUT_MS = 150;

/**
 * Resolve to `null` rather than hang, whatever Redis is doing.
 *
 * The timer is cleared on both paths — an uncleared `setTimeout` per request
 * holds the event loop open and leaks under load.
 */
async function withTimeout<T>(work: Promise<T>, label: string): Promise<T | null> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          logger.warn({ label, ms: CACHE_TIMEOUT_MS }, 'Cache operation timed out; continuing');
          resolve(null);
        }, CACHE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Long enough to matter under a burst, short enough that staleness is dull. */
export const HOME_TTL_SECONDS = 300;

/**
 * Namespaced so `invalidate` can clear a family without a pattern that might
 * match somebody else's keys — sessions and refresh tokens live in this Redis
 * too, and a careless `del` here would sign everybody out.
 */
export const cacheKey = (...parts: Array<string | number>): string =>
  ['cache', ...parts].join(':');

export async function cached<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
  try {
    const hit = await withTimeout(redis.get(key), `get ${key}`);
    if (hit) return JSON.parse(hit) as T;
  } catch (e) {
    // Warn rather than throw: a cache miss caused by Redis being unwell is a
    // slow request, not a failed one.
    logger.warn({ err: e, key }, 'Cache read failed; computing fresh');
  }

  const value = await compute();

  try {
    // Errors are never cached — `compute` throwing means we never reach here,
    // which is deliberate: caching a failure would turn a blip into five
    // minutes of outage.
    await withTimeout(redis.set(key, JSON.stringify(value), 'EX', ttlSeconds), `set ${key}`);
  } catch (e) {
    logger.warn({ err: e, key }, 'Cache write failed; serving uncached');
  }

  return value;
}

/**
 * Drop every key under a prefix.
 *
 * `SCAN` rather than `KEYS`: `KEYS` walks the whole keyspace in one blocking
 * call, and this Redis also holds refresh tokens — a slow `KEYS` here would
 * stall sign-ins. Scanning is cooperative and the extra round trips do not
 * matter on a write path measured in single-digit calls per day.
 */
export async function invalidate(prefix: string): Promise<void> {
  try {
    let cursor = '0';
    do {
      // A timed-out scan yields null, which ends the loop rather than retrying
      // it — otherwise a dead Redis turns one admin save into an endless walk.
      const page = await withTimeout(
        redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200),
        `scan ${prefix}`,
      );
      if (!page) break;
      const [next, keys] = page;
      cursor = next;
      if (keys.length > 0) await withTimeout(redis.del(...keys), `del ${prefix}`);
    } while (cursor !== '0');
  } catch (e) {
    /*
     * Swallowed on purpose, and it is the one swallow worth arguing about.
     * A failed invalidation means stale content for up to the TTL — five
     * minutes of an old banner. Throwing instead would fail the ops write that
     * had already succeeded in the database, leaving the editor to believe
     * their change was rejected when it was saved.
     */
    logger.warn({ err: e, prefix }, 'Cache invalidation failed; entries will expire on TTL');
  }
}
