import {
  PromotionType,
  formatPKR,
  type CreatePromotionInput,
  type PromoQuoteView,
  type PromotionView,
  type UpdatePromotionInput,
} from '@haala/shared';
import { AppError } from '../../common/errors';
import { db, type Executor } from '../../db/client';
import type { Promotion } from '../../db/schema';
import { promotionRepository } from './promotion.repository';

/** Result of pricing a promo — the view plus the id the caller needs to record. */
export interface PromoQuote extends PromoQuoteView {
  promotionId: string;
}

const toView = (p: Promotion): PromotionView => ({
  id: p.id,
  code: p.code,
  type: p.type,
  value: p.value,
  minOrderTotal: p.minOrderTotal,
  maxDiscount: p.maxDiscount,
  usageLimit: p.usageLimit,
  perUserLimit: p.perUserLimit,
  usedCount: p.usedCount,
  startsAt: p.startsAt?.toISOString() ?? null,
  endsAt: p.endsAt?.toISOString() ?? null,
  isActive: p.isActive,
  createdAt: p.createdAt.toISOString(),
});

/**
 * Turn a promotion into money off, given a cart.
 *
 * Two invariants hold for every branch:
 *  - the discount never exceeds the subtotal, so a total can't go negative;
 *  - `free_delivery` zeroes the fee instead of discounting by the fee amount,
 *    so the receipt shows "Delivery: Free" rather than a discount that happens
 *    to equal the delivery charge.
 */
const price = (
  promo: Promotion,
  subtotal: number,
  deliveryFee: number,
): { discount: number; deliveryFee: number; message: string } => {
  switch (promo.type) {
    case PromotionType.FreeDelivery:
      return {
        discount: 0,
        deliveryFee: 0,
        message: deliveryFee > 0 ? 'Free delivery applied' : 'Delivery was already free',
      };

    case PromotionType.Percentage: {
      const raw = Math.floor((subtotal * promo.value) / 100);
      const capped = promo.maxDiscount === null ? raw : Math.min(raw, promo.maxDiscount);
      const discount = Math.min(capped, subtotal);
      return {
        discount,
        deliveryFee,
        message: `${promo.value}% off — ${formatPKR(discount)} saved`,
      };
    }

    case PromotionType.FixedAmount: {
      const capped = promo.maxDiscount === null ? promo.value : Math.min(promo.value, promo.maxDiscount);
      const discount = Math.min(capped, subtotal);
      return { discount, deliveryFee, message: `${formatPKR(discount)} off` };
    }

    default:
      // Unreachable while promotionTypeEnum and PromotionType stay in step.
      throw AppError.internal(`Unknown promotion type: ${String(promo.type)}`);
  }
};

export const promotionService = {
  /**
   * Price a promo code against a cart. This is the ONLY place discounts are
   * computed — both `POST /promotions/validate` (a preview) and
   * `orderService.placeOrder` (the actual charge) call it, so the number the
   * customer sees in the cart is by construction the number they are charged.
   *
   * Pass `lock: true` from inside a placement transaction so the usage-limit
   * check and the subsequent increment can't interleave with another checkout.
   */
  async quote(
    userId: string,
    code: string,
    subtotal: number,
    deliveryFee: number,
    opts: { lock?: boolean; ex?: Executor } = {},
  ): Promise<PromoQuote> {
    const ex = opts.ex ?? db;
    const promo = opts.lock
      ? await promotionRepository.lockByCode(code, ex)
      : await promotionRepository.findByCode(code, ex);

    if (!promo) throw AppError.notFound('That promo code does not exist');
    if (!promo.isActive) throw AppError.invalidState('That promo code is no longer active');

    const now = new Date();
    if (promo.startsAt && now < promo.startsAt) {
      throw AppError.invalidState('That promo code is not active yet');
    }
    if (promo.endsAt && now > promo.endsAt) {
      throw AppError.invalidState('That promo code has expired');
    }
    if (promo.minOrderTotal !== null && subtotal < promo.minOrderTotal) {
      throw AppError.invalidState(
        `Spend at least ${formatPKR(promo.minOrderTotal)} to use this code`,
      );
    }
    if (promo.usageLimit !== null && promo.usedCount >= promo.usageLimit) {
      throw AppError.invalidState('That promo code has been fully claimed');
    }
    if (promo.perUserLimit !== null) {
      const used = await promotionRepository.redemptionCount(promo.id, userId, ex);
      if (used >= promo.perUserLimit) {
        throw AppError.invalidState('You have already used that promo code');
      }
    }

    const priced = price(promo, subtotal, deliveryFee);
    return { promotionId: promo.id, code: promo.code, type: promo.type, ...priced };
  },

  /**
   * Record a redemption. MUST run in the same transaction as the order insert —
   * the row is what makes `perUserLimit` enforceable, so an order that exists
   * without its redemption is a discount the customer can claim twice.
   */
  async redeem(
    quote: PromoQuote,
    userId: string,
    orderId: string,
    ex: Executor,
  ): Promise<void> {
    await promotionRepository.addRedemption(
      { promotionId: quote.promotionId, userId, orderId, discount: quote.discount },
      ex,
    );
    await promotionRepository.bumpUsedCount(quote.promotionId, 1, ex);
  },

  /**
   * Give the promo back when an order is cancelled — otherwise a cancelled
   * order permanently consumes a customer's one-per-person launch offer.
   */
  async releaseForOrder(orderId: string, ex: Executor): Promise<void> {
    const promotionId = await promotionRepository.removeRedemptionForOrder(orderId, ex);
    if (promotionId) await promotionRepository.bumpUsedCount(promotionId, -1, ex);
  },

  async listActive(): Promise<PromotionView[]> {
    return (await promotionRepository.listActive()).map(toView);
  },

  async listAll(): Promise<PromotionView[]> {
    return (await promotionRepository.listAll()).map(toView);
  },

  async create(input: CreatePromotionInput): Promise<PromotionView> {
    const existing = await promotionRepository.findByCode(input.code);
    if (existing) throw AppError.conflict('A promotion with that code already exists');

    const created = await promotionRepository.create({
      code: input.code,
      type: input.type,
      value: input.type === PromotionType.FreeDelivery ? 0 : input.value,
      minOrderTotal: input.minOrderTotal ?? null,
      maxDiscount: input.maxDiscount ?? null,
      usageLimit: input.usageLimit ?? null,
      perUserLimit: input.perUserLimit ?? null,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      isActive: input.isActive,
    });
    return toView(created);
  },

  async update(id: string, input: UpdatePromotionInput): Promise<PromotionView> {
    const patch: Record<string, unknown> = {};
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    if (input.usageLimit !== undefined) patch.usageLimit = input.usageLimit ?? null;
    if (input.perUserLimit !== undefined) patch.perUserLimit = input.perUserLimit ?? null;
    if (input.minOrderTotal !== undefined) patch.minOrderTotal = input.minOrderTotal ?? null;
    if (input.maxDiscount !== undefined) patch.maxDiscount = input.maxDiscount ?? null;
    if (input.endsAt !== undefined) patch.endsAt = input.endsAt ? new Date(input.endsAt) : null;

    const updated = await promotionRepository.update(id, patch);
    if (!updated) throw AppError.notFound('Promotion not found');
    return toView(updated);
  },
};

/** Exported for unit tests — the pure pricing branch, no database involved. */
export const __priceForTests = price;
