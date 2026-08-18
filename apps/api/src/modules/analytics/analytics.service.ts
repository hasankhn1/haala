import type { AnalyticsOverview, AnalyticsQuery } from '@haala/shared';
import { analyticsRepository } from './analytics.repository';

const DEFAULT_WINDOW_DAYS = 30;

export const analyticsService = {
  /**
   * One round-trip for the whole dashboard home.
   *
   * The queries are independent, so they run concurrently — seven sequential
   * aggregates would make the page feel slow for no reason. The resolved window
   * is echoed back so the UI labels exactly what it's showing rather than
   * assuming the default.
   */
  async overview(query: AnalyticsQuery): Promise<AnalyticsOverview> {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const range = { from, to, storeId: query.storeId };

    const [totals, timings, pipeline, topProducts, stores, riders, promotions] = await Promise.all([
      analyticsRepository.totals(range),
      analyticsRepository.timings(range),
      analyticsRepository.pipeline(query.storeId),
      analyticsRepository.topProducts(range),
      analyticsRepository.byStore(range),
      analyticsRepository.byRider(range),
      analyticsRepository.promotionUsage(range),
    ]);

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      totals,
      timings,
      pipeline,
      topProducts,
      stores,
      riders,
      promotions,
    };
  },
};
