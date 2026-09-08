import { boolean, index, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { pk, timestamps } from './_helpers';

/**
 * The promotional cards on the marketplace home.
 *
 * Content, not configuration — which is why this is a table and not a constant.
 * The row a banner occupies is the one thing on that screen with no data behind
 * it otherwise, and ops needs to change it without a deploy.
 *
 * **`departmentKey` is a plain key, not a foreign key to `business_types`.**
 * Deliberate: a banner is editorial and may point at a department that is later
 * renamed, disabled, or does not exist yet, and none of those should cascade
 * into deleting somebody's artwork. The home endpoint resolves the key against
 * the live departments and simply skips a banner whose department is gone —
 * failing quietly is right for decoration, where it would be wrong for stock.
 * `null` means the banner belongs to the marketplace rather than to one trade.
 *
 * `imageKey` is an R2 object key under the `home/` prefix, not a URL. Same
 * reasoning as brand media: keys are re-signable and survive a bucket or CDN
 * move, where a stored URL does not.
 */
export const homeBanners = pgTable(
  'home_banners',
  {
    id: pk(),
    /** Business-type key this promotes, or null for the whole marketplace. */
    departmentKey: text(),
    title: text().notNull(),
    /** The sun-coloured pill — "Up to 30% off". Optional; most say nothing. */
    badge: text(),
    /** R2 object key under `home/`. */
    imageKey: text(),
    /**
     * Where tapping it goes. A department key today; a path later. Kept as free
     * text so an editor is never blocked by a link shape nobody anticipated.
     */
    linkTo: text(),
    isActive: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    // The home endpoint reads exactly this: active banners in order. It is the
    // most-hit query in the app and it should never table-scan.
    index('home_banners_active_order_idx').on(t.isActive, t.sortOrder),
  ],
);

export type HomeBanner = typeof homeBanners.$inferSelect;
export type NewHomeBanner = typeof homeBanners.$inferInsert;
