import {
  CART_TTL_DAYS,
  deliveryFeeFor,
  type AddCartItemInput,
  type CartMergeResult,
  type CartsView,
  type CartView,
  type MergeCartInput,
} from '@haala/shared';
import { AppError } from '../../common/errors';
import { availableToSell, inventoryRepository } from '../inventory/inventory.repository';
import { catalogRepository } from '../catalog/catalog.repository';
import { cartRepository } from './cart.repository';

const staleCutoff = () => new Date(Date.now() - CART_TTL_DAYS * 24 * 60 * 60 * 1000);

export const cartService = {
  /**
   * Every basket the customer holds, with expired ones swept first.
   *
   * The sweep lives on the read path rather than in a scheduled job: there is
   * no scheduler in this deployment, and a basket only matters at the moment
   * somebody looks at it. The cost is one indexed query per cart read.
   */
  async getBaskets(userId: string): Promise<CartsView> {
    const expired = new Set(await cartRepository.clearStale(userId, staleCutoff()));
    const carts = await cartRepository.listByUser(userId);

    const baskets = await Promise.all(
      carts.map(async (c) => {
        const view = await this.viewOf(c);
        return expired.has(c.id) ? { ...view, expired: true } : view;
      }),
    );

    // Empty baskets are dropped from the switcher — a department the customer
    // once looked at should not sit there forever as a tab with nothing in it.
    // The one exception is a basket that just expired, which has something to
    // say before it goes.
    return { baskets: baskets.filter((b) => b.items.length > 0 || b.expired) };
  },

  async getCart(userId: string, department: string): Promise<CartView> {
    const cart = await cartRepository.getOrCreate(userId, department);
    return this.viewOf(cart);
  },

  async viewOf(cart: { id: string; departmentKey: string; storeId: string | null }): Promise<CartView> {
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
      // The basket already knows; the line carries it so a *guest* basket, which
      // is a flat list with no baskets to belong to, can group the same way.
      departmentKey: cart.departmentKey,
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
      departmentKey: cart.departmentKey,
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
  async totals(userId: string, department: string): Promise<{ subtotal: number; deliveryFee: number }> {
    // One basket, because a promo applies to the order it is placed against and
    // an order draws from one department. Quoting a code against the combined
    // total would discount an order that was never placed.
    const cart = await this.getCart(userId, department);
    return { subtotal: cart.subtotal, deliveryFee: deliveryFeeFor(cart.subtotal) };
  },

  async addItem(userId: string, input: AddCartItemInput): Promise<CartView> {
    const variant = await catalogRepository.findVariantForStore(input.variantId, input.storeId);
    if (!variant) throw AppError.notFound('This size is not available at this store');

    // Which basket this belongs in is a fact about the product, read from the
    // database — never a field on the request. Accepting one would let a caller
    // drop a shirt into the grocery basket and break the split at its root.
    const department = await cartRepository.departmentForVariant(input.variantId);
    if (!department) throw AppError.notFound('This size is not available at this store');

    const cart = await cartRepository.getOrCreate(userId, department);

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
    await cartRepository.touch(cart.id);
    return this.getCart(userId, department);
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
    const skipped: CartMergeResult['skipped'] = [];
    const adjusted: CartMergeResult['adjusted'] = [];
    /*
     * A guest basket can hold several departments, so this fans out across
     * baskets rather than filling one. Each is resolved lazily and remembered,
     * so a device holding six grocery lines still creates one basket.
     */
    const touched = new Map<string, { id: string; storeId: string | null }>();
    let replacedOtherStore = false;

    const basketFor = async (department: string) => {
      const known = touched.get(department);
      if (known) return known;

      const cart = await cartRepository.getOrCreate(userId, department);
      // An order cannot span two stores. The basket they were just filling is
      // the one they meant, so it wins — but the caller is told it happened.
      if (cart.storeId && cart.storeId !== input.storeId) {
        replacedOtherStore = true;
        await cartRepository.clear(cart.id);
      }
      if (cart.storeId !== input.storeId) await cartRepository.setStore(cart.id, input.storeId);

      const entry = { id: cart.id, storeId: input.storeId };
      touched.set(department, entry);
      return entry;
    };

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

      const department = await cartRepository.departmentForVariant(line.variantId);
      if (!department) {
        skipped.push({ variantId: line.variantId, reason: 'No longer available at this store' });
        continue;
      }
      const cart = await basketFor(department);

      const existing = await cartRepository.findItem(cart.id, line.variantId);
      const wanted = (existing?.quantity ?? 0) + line.quantity;
      const quantity = Math.min(wanted, available);
      if (quantity < wanted) {
        adjusted.push({ variantId: line.variantId, requested: wanted, added: quantity });
      }

      await cartRepository.upsertItem(cart.id, line.variantId, quantity, Number(variant.price));
    }

    for (const { id } of touched.values()) await cartRepository.touch(id);

    return { baskets: (await this.getBaskets(userId)).baskets, skipped, adjusted, replacedOtherStore };
  },

  /**
   * The department is looked up rather than required from the caller.
   *
   * A quantity stepper knows a variant, not a department, and asking the client
   * to supply one it would have to derive is an invitation to derive it wrong.
   */
  async basketHolding(userId: string, variantId: string) {
    for (const cart of await cartRepository.listByUser(userId)) {
      const item = await cartRepository.findItem(cart.id, variantId);
      if (item) return { cart, item };
    }
    throw AppError.notFound('Item not in cart');
  },

  async updateItem(userId: string, variantId: string, quantity: number): Promise<CartView> {
    const { cart, item: existing } = await this.basketHolding(userId, variantId);

    if (quantity === 0) {
      await cartRepository.removeItem(cart.id, variantId);
      await cartRepository.touch(cart.id);
      await this.resetStoreIfEmpty(cart.id);
      return this.getCart(userId, cart.departmentKey);
    }

    if (cart.storeId) {
      const inv = await inventoryRepository.findForStoreVariant(cart.storeId, variantId);
      if (!inv || availableToSell(inv) < quantity) {
        throw AppError.outOfStock('Requested quantity is not available');
      }
    }
    await cartRepository.upsertItem(cart.id, variantId, quantity, existing.unitPrice);
    await cartRepository.touch(cart.id);
    return this.getCart(userId, cart.departmentKey);
  },

  async removeItem(userId: string, variantId: string): Promise<CartView> {
    const { cart } = await this.basketHolding(userId, variantId);
    await cartRepository.removeItem(cart.id, variantId);
    await cartRepository.touch(cart.id);
    await this.resetStoreIfEmpty(cart.id);
    return this.getCart(userId, cart.departmentKey);
  },

  /** Empties one department's basket. The others are untouched. */
  async clear(userId: string, department: string): Promise<CartView> {
    const cart = await cartRepository.getOrCreate(userId, department);
    await cartRepository.clear(cart.id);
    await cartRepository.setStore(cart.id, null);
    await cartRepository.touch(cart.id);
    return this.getCart(userId, department);
  },

  async resetStoreIfEmpty(cartId: string): Promise<void> {
    const remaining = await cartRepository.items(cartId);
    if (remaining.length === 0) await cartRepository.setStore(cartId, null);
  },
};
