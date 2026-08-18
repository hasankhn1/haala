import { deliveryFeeFor, type AddCartItemInput, type CartView } from '@haala/shared';
import { AppError } from '../../common/errors';
import { availableToSell, inventoryRepository } from '../inventory/inventory.repository';
import { catalogRepository } from '../catalog/catalog.repository';
import { cartRepository } from './cart.repository';

export const cartService = {
  async getCart(userId: string): Promise<CartView> {
    const cart = await cartRepository.getOrCreate(userId);
    const items = await cartRepository.items(cart.id);

    // Availability at the cart's store, to flag lines that can't be checked out.
    const stockByProduct = new Map<string, number>();
    if (cart.storeId && items.length > 0) {
      const rows = await inventoryRepository.findManyForStore(
        cart.storeId,
        items.map((i) => i.productId),
      );
      for (const r of rows) stockByProduct.set(r.productId, availableToSell(r));
    }

    const viewItems = items.map((i) => ({
      productId: i.productId,
      name: i.product.name,
      unit: i.product.unit,
      imageUrl: i.product.imageUrl,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.unitPrice * i.quantity,
      inStock: (stockByProduct.get(i.productId) ?? 0) >= i.quantity,
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
    const product = await catalogRepository.findProductForStore(input.productId, input.storeId);
    if (!product) throw AppError.notFound('Product not available at this store');

    const cart = await cartRepository.getOrCreate(userId);

    // A cart holds items from a single store. Switching stores resets it.
    if (cart.storeId && cart.storeId !== input.storeId) {
      await cartRepository.clear(cart.id);
      await cartRepository.setStore(cart.id, input.storeId);
    } else if (!cart.storeId) {
      await cartRepository.setStore(cart.id, input.storeId);
    }

    const existing = await cartRepository.findItem(cart.id, input.productId);
    const desiredQty = (existing?.quantity ?? 0) + input.quantity;
    if (desiredQty > Number(product.availableQty)) {
      throw AppError.outOfStock(`Only ${product.availableQty} in stock`);
    }

    await cartRepository.upsertItem(cart.id, input.productId, desiredQty, Number(product.price));
    return this.getCart(userId);
  },

  async updateItem(userId: string, productId: string, quantity: number): Promise<CartView> {
    const cart = await cartRepository.getOrCreate(userId);
    const existing = await cartRepository.findItem(cart.id, productId);
    if (!existing) throw AppError.notFound('Item not in cart');

    if (quantity === 0) {
      await cartRepository.removeItem(cart.id, productId);
      await this.resetStoreIfEmpty(cart.id);
      return this.getCart(userId);
    }

    if (cart.storeId) {
      const inv = await inventoryRepository.findForStoreProduct(cart.storeId, productId);
      if (!inv || availableToSell(inv) < quantity) {
        throw AppError.outOfStock('Requested quantity is not available');
      }
    }
    await cartRepository.upsertItem(cart.id, productId, quantity, existing.unitPrice);
    return this.getCart(userId);
  },

  async removeItem(userId: string, productId: string): Promise<CartView> {
    const cart = await cartRepository.getOrCreate(userId);
    await cartRepository.removeItem(cart.id, productId);
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
