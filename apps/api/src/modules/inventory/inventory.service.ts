import { AppError } from '../../common/errors';
import { availableToSell, inventoryRepository } from './inventory.repository';

export const inventoryService = {
  async getAvailability(
    storeId: string,
    productId: string,
  ): Promise<{ storeId: string; productId: string; available: number }> {
    const row = await inventoryRepository.findForStoreProduct(storeId, productId);
    if (!row) throw AppError.notFound('Product not stocked at this store');
    return { storeId, productId, available: availableToSell(row) };
  },
};
