import {
  deliveryFeeFor,
  type AddCartItemInput,
  type CartMergeResult,
  type CartView,
  type MergeCartInput,
} from '@haala/shared';
import { AppError } from '../../common/errors';
import { availableToSell, inventoryRepository } from '../inventory/inventory.repository';
import { catalogRepository } from '../catalog/catalog.repository';
import { cartRepository } from './cart.repository';

export const cartService = {
  async getCart(userId: string): Promise<CartView> {
    const cart = await cartRepository.getOrCreate(userId);
    const items = await cartRepository.items(cart.id);

    // Availability at the cart's store, to flag lines that can't be checked out.
    const stockByVariant = new Map<string, number>();
    if (cart.storeId && items.length > 0) {
      const rows = await inventoryRepository.findManyForStore(
        cart.storeId,
        items.map((i) => i.variantId),
      );
      for (const r of rows) stockByVariant.set(r.variantId, availableToSell(r));
    }

    const viewItems = items.map((i) => ({
      variantId: i.variantId,
      productId: i.product.id,
      name: i.product.name,
      // The size, not the product's catalogue unit — a 1kg line must not
      // render as "500 g" just because that is the product's default.
      unit: i.variant.label,
      imageUrl: i.product.imageUrl,
      unitPrice: i.unitPrice,
      // The catalogue price before any store override or promotion, so the
      // cart can state what the customer is saving. `unitPrice` is what they
      // actually pay and remains the only number used in arithmetic.
      basePrice: i.variant.basePrice,
      quantity: i.quantity,
      lineTotal: i.unitPrice * i.quantity,
      inStock: (stockByVariant.get(i.variantId) ?? 0) >= i.quantity,
    }));

    return {
      id: cart.id,
      storeId: cart.storeId,
      items: viewItems,
      itemCount: viewItems.reduce((n, i) => n + i.quantity, 0),
      subtotal: viewItems.reduce((sum, i) => sum + i.lineTotal, 0),
    };
  },

  /**
   * Server-side totals for the caller's cart. Promo validation prices against
   * this rather than a client-supplied subtotal — otherwise a crafted request
   * could quote a percentage discount against an invented total.
   */
  async totals(userId: string): Promise<{ subtotal: number; deliveryFee: number }> {
    const cart = await this.getCart(userId);
    return { subtotal: cart.subtotal, deliveryFee: deliveryFeeFor(cart.subtotal) };
  },

  async addItem(userId: string, input: AddCartItemInput): Promise<CartView> {
    const variant = await catalogRepository.findVariantForStore(input.variantId, input.storeId);
    if (!variant) throw AppError.notFound('This size is not available at this store');

    const cart = await cartRepository.getOrCreate(userId);

    // A cart holds items from a single store. Switching stores resets it.
    if (cart.storeId && cart.storeId !== input.storeId) {
      await cartRepository.clear(cart.id);
      await cartRepository.setStore(cart.id, input.storeId);
    } else if (!cart.storeId) {
      await cartRepository.setStore(cart.id, input.storeId);
    }

    const existing = await cartRepository.findItem(cart.id, input.variantId);
    const desiredQty = (existing?.quantity ?? 0) + input.quantity;
    if (desiredQty > Number(variant.availableQty)) {
      throw AppError.outOfStock(`Only ${variant.availableQty} in stock`);
    }

    await cartRepository.upsertItem(cart.id, input.variantId, desiredQty, Number(variant.price));
    return this.getCart(userId);
  },

  /**
   * Fold a device-held guest basket into this customer's cart.
   *
   * Every line is re-validated exactly as `addItem` would: the variant must
   * still be sellable at this store — which, since Phase 6 of the brands work,
   * also means its shop must still be active — and stock still caps the
   * quantity. The client's prices are not consulted at all.
   *
   * **One bad line does not lose the basket.** A guest may have added something
   * that has since sold out or whose shop was suspended; the rest still merges
   * and the result says what did not. Failing the whole request would throw
   * away the good lines, and dropping them quietly would be worse — the
   * customer would reach checkout short of items they believe they chose.
   *
   * Quantities **add** rather than replace, matching `addItem`: someone with
   * two bags of rice on their phone and one in their account wants three.
   */
  async merge(userId: string, input: MergeCartInput): Promise<CartMergeResult> {
    const cart = await cartRepository.getOrCreate(userId);

    // An order cannot span two stores. The basket they were just filling is
    // the one they meant, so it wins — but the caller is told it happened.
    const replacedOtherStore = Boolean(cart.storeId && cart.storeId !== input.storeId);
    if (replacedOtherStore) await cartRepository.clear(cart.id);
    if (cart.storeId !== input.storeId) await cartRepository.setStore(cart.id, input.storeId);

    const skipped: CartMergeResult['skipped'] = [];
    const adjusted: CartMergeResult['adjusted'] = [];

    for (const line of input.items) {
      const variant = await catalogRepository.findVariantForStore(line.variantId, input.storeId);
      if (!variant) {
        skipped.push({ variantId: line.variantId, reason: 'No longer available at this store' });
        continue;
      }

      const available = Number(variant.availableQty);
      if (available <= 0) {
        skipped.push({ variantId: line.variantId, reason: 'Out of stock' });
        continue;
      }

      const existing = await cartRepository.findItem(cart.id, line.variantId);
      const wanted = (existing?.quantity ?? 0) + line.quantity;
      const quantity = Math.min(wanted, available);
      if (quantity < wanted) {
        adjusted.push({ variantId: line.variantId, requested: wanted, added: quantity });
      }

      await cartRepository.upsertItem(cart.id, line.variantId, quantity, Number(variant.price));
    }

    return { cart: await this.getCart(userId), skipped, adjusted, replacedOtherStore };
  },

  async updateItem(userId: string, variantId: string, quantity: number): Promise<CartView> {
    const cart = await cartRepository.getOrCreate(userId);
    const existing = await cartRepository.findItem(cart.id, variantId);
    if (!existing) throw AppError.notFound('Item not in cart');

    if (quantity === 0) {
      await cartRepository.removeItem(cart.id, variantId);
      await this.resetStoreIfEmpty(cart.id);
      return this.getCart(userId);
    }

    if (cart.storeId) {
      const inv = await inventoryRepository.findForStoreVariant(cart.storeId, variantId);
      if (!inv || availableToSell(inv) < quantity) {
        throw AppError.outOfStock('Requested quantity is not available');
      }
    }
    await cartRepository.upsertItem(cart.id, variantId, quantity, existing.unitPrice);
    return this.getCart(userId);
  },

  async removeItem(userId: string, variantId: string): Promise<CartView> {
    const cart = await cartRepository.getOrCreate(userId);
    await cartRepository.removeItem(cart.id, variantId);
    await this.resetStoreIfEmpty(cart.id);
    return this.getCart(userId);
  },

  async clear(userId: string): Promise<CartView> {
    const cart = await cartRepository.getOrCreate(userId);
    await cartRepository.clear(cart.id);
    await cartRepository.setStore(cart.id, null);
    return this.getCart(userId);
  },

  async resetStoreIfEmpty(cartId: string): Promise<void> {
    const remaining = await cartRepository.items(cartId);
    if (remaining.length === 0) await cartRepository.setStore(cartId, null);
  },
};
