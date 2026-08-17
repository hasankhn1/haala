import type { AddressView, CreateAddressInput, UpdateAddressInput } from '@haala/shared';
import { AppError } from '../../common/errors';
import { db } from '../../db/client';
import type { Address } from '../../db/schema';
import { addressRepository } from './address.repository';

const toView = (a: Address): AddressView => ({
  id: a.id,
  label: a.label,
  line1: a.line1,
  line2: a.line2,
  area: a.area,
  city: a.city,
  latitude: a.latitude,
  longitude: a.longitude,
  notes: a.notes,
  isDefault: a.isDefault,
});

export const addressService = {
  async list(userId: string): Promise<AddressView[]> {
    const rows = await addressRepository.listByUser(userId);
    return rows.map(toView);
  },

  async create(userId: string, input: CreateAddressInput): Promise<AddressView> {
    const existing = await addressRepository.listByUser(userId);
    // First address is default; otherwise honour the flag.
    const makeDefault = input.isDefault ?? existing.length === 0;

    return db.transaction(async (tx) => {
      if (makeDefault) await addressRepository.clearDefault(userId, tx);
      const created = await addressRepository.create(
        { ...input, userId, isDefault: makeDefault },
        tx,
      );
      return toView(created);
    });
  },

  async update(userId: string, id: string, input: UpdateAddressInput): Promise<AddressView> {
    return db.transaction(async (tx) => {
      const current = await addressRepository.findByIdForUser(id, userId, tx);
      if (!current) throw AppError.notFound('Address not found');
      if (input.isDefault) await addressRepository.clearDefault(userId, tx);
      const updated = await addressRepository.update(id, userId, input, tx);
      return toView(updated as Address);
    });
  },

  async remove(userId: string, id: string): Promise<void> {
    const ok = await addressRepository.delete(id, userId);
    if (!ok) throw AppError.notFound('Address not found');
  },

  async setDefault(userId: string, id: string): Promise<AddressView> {
    return db.transaction(async (tx) => {
      const current = await addressRepository.findByIdForUser(id, userId, tx);
      if (!current) throw AppError.notFound('Address not found');
      await addressRepository.clearDefault(userId, tx);
      const updated = await addressRepository.update(id, userId, { isDefault: true }, tx);
      return toView(updated as Address);
    });
  },
};
