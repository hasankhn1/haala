import type { SavedCardDto } from '@haala/shared';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import { userRepository } from '../users/user.repository';
import { safepayWallet } from './providers/safepay.provider';

/**
 * The cards Safepay is holding for a customer.
 *
 * **The customer token is read from the user's own row and never from the
 * request.** It is the only thing separating one person's wallet from another's
 * — a `cus_…` accepted as a parameter would list, and delete, anybody's cards
 * for whoever could guess one. Same rule as `brandScope`: the tenant comes from
 * the verified token, not the payload.
 *
 * Nothing here caches. A wallet is read on a screen a customer opened
 * deliberately, and showing a card that was deleted a minute ago on another
 * device is worse than the request.
 */
export const walletService = {
  /**
   * Empty for anyone who has never paid online — that is the normal state for
   * most customers, not an error, so it is not a 404.
   */
  async list(userId: string): Promise<SavedCardDto[]> {
    const user = await userRepository.findById(userId);
    if (!user) throw AppError.notFound('User not found');
    if (!user.safepayCustomerToken) return [];

    try {
      return await safepayWallet.list(user.safepayCustomerToken);
    } catch (err) {
      /*
       * A gateway that is down must not take the account screen with it. An
       * empty list reads as "no saved cards", which is wrong but harmless and
       * self-correcting; a 500 is a broken page.
       */
      logger.warn({ err, userId }, 'Could not read the Safepay wallet');
      return [];
    }
  },

  async remove(userId: string, paymentMethodToken: string): Promise<void> {
    const user = await userRepository.findById(userId);
    if (!user) throw AppError.notFound('User not found');

    /*
     * 404, not 403 — and not "you have no cards" either. Somebody probing with
     * a token they found should not learn whether it exists, and a customer
     * with no wallet asking to delete a card is in the same position as one
     * asking to delete somebody else's.
     */
    if (!user.safepayCustomerToken) throw AppError.notFound('Card not found');

    const cards = await safepayWallet.list(user.safepayCustomerToken);
    if (!cards.some((c) => c.token === paymentMethodToken)) {
      /*
       * The authorization check, and it has to be this way round. Their delete
       * endpoint takes the customer and the instrument as two parameters and
       * will happily accept a mismatched pair; confirming the card is in *this*
       * customer's wallet first is what stops one customer deleting another's.
       */
      throw AppError.notFound('Card not found');
    }

    await safepayWallet.remove(user.safepayCustomerToken, paymentMethodToken);
    logger.info({ userId }, 'Saved card removed');
  },
};
