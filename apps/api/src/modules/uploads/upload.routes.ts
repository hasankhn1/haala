import { Router } from 'express';
import { z } from 'zod';
import { UserRole } from '@haala/shared';
import { asyncHandler, sendSuccess } from '../../common/http';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import { brandScope, requireBrandId } from '../../common/middleware/brand-scope';
import { validate } from '../../common/middleware/validate';
import { UPLOAD_KINDS, uploadService } from './upload.service';

/**
 * Getting a picture from a vendor's phone into their catalogue.
 *
 * Two steps, because the upload itself does not come through here:
 *
 *   1. `POST /uploads/sign`     → a presigned PUT the browser uses directly
 *   2. `POST /uploads/confirm`  → we HEAD what landed and return the URL to save
 *
 * The second step is what makes the size limit real; a presigned PUT can pin
 * the content type but not the length. It also means a URL is only ever handed
 * back for an object that actually exists and is actually an image.
 *
 * `brandScope` puts every key under the caller's own brand, so one vendor
 * cannot write into another's prefix or confirm their objects.
 */
const router: Router = Router();

router.use(
  authenticate,
  authorize(UserRole.BrandUser, UserRole.SuperAdmin, UserRole.Admin),
  brandScope,
);

const signSchema = z
  .object({
    kind: z.enum(UPLOAD_KINDS),
    contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  })
  .strict();

const confirmSchema = z.object({ key: z.string().min(1).max(300) }).strict();

router.post(
  '/sign',
  validate({ body: signSchema }),
  asyncHandler(async (req, res) => {
    const { kind, contentType } = req.body;
    sendSuccess(res, await uploadService.sign(requireBrandId(req), kind, contentType));
  }),
);

router.post(
  '/confirm',
  validate({ body: confirmSchema }),
  asyncHandler(async (req, res) => {
    sendSuccess(res, await uploadService.confirm(requireBrandId(req), req.body.key));
  }),
);

export const uploadRoutes = router;
