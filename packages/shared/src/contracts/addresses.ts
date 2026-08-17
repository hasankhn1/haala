import { z } from 'zod';
import { AddressLabel } from '../enums';

export const createAddressSchema = z.object({
  label: z.enum([AddressLabel.Home, AddressLabel.Work, AddressLabel.Other]).default('home'),
  line1: z.string().min(3).max(160),
  line2: z.string().max(160).optional(),
  area: z.string().min(2).max(120),
  city: z.string().min(2).max(80),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  notes: z.string().max(240).optional(),
  isDefault: z.boolean().optional(),
});
export type CreateAddressInput = z.infer<typeof createAddressSchema>;

export const updateAddressSchema = createAddressSchema.partial();
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;

export interface AddressView {
  id: string;
  label: string;
  line1: string;
  line2: string | null;
  area: string;
  city: string;
  latitude: number;
  longitude: number;
  notes: string | null;
  isDefault: boolean;
}
