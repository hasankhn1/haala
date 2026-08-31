import { Router } from 'express';
import { asyncHandler } from '../../common/http';
import { uploadService } from './upload.service';

/**
 * Serves an uploaded image when the bucket has no public access.
 *
 * Deliberately unauthenticated: these are product photos meant for shoppers,
 * and the customer app has no session when it paints a catalogue card. The key
 * carries a uuid, so it is not enumerable, and `uploadService.stream` refuses
 * anything outside the `brands/` prefix.
 *
 * This is the fallback, not the plan. Set `R2_PUBLIC_BASE_URL` and new images
 * are addressed straight at Cloudflare's edge instead of costing the API a
 * megabyte per view — but until that switch is flipped, uploads still work.
 */
const router: Router = Router();

router.get(
  '/*',
  asyncHandler(async (req, res) => {
    const key = (req.params as unknown as string[])[0] ?? '';
    const { body, contentType, bytes } = await uploadService.stream(key);

    res.setHeader('content-type', contentType);
    // Immutable: a key contains a uuid and its object is never rewritten.
    res.setHeader('cache-control', 'public, max-age=31536000, immutable');
    if (bytes !== undefined) res.setHeader('content-length', String(bytes));
    body.pipe(res);
  }),
);

export const mediaRoutes = router;
