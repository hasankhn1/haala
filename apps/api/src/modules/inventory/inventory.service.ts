import { AppError } from '../../common/errors';
import { availableToSell, inventoryRepository } from './inventory.repository';

export const inventoryService = {
  async getAvailability(
    storeId: string,
    variantId: string,
  ): Promise<{ storeId: string; variantId: string; available: number }> {
    const row = await inventoryRepository.findForStoreVariant(storeId, variantId);
    if (!row) throw AppError.notFound('Product not stocked at this store');
    return { storeId, variantId, available: availableToSell(row) };
  },
};
