import { randomUUID } from 'node:crypto';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';
import { AppError } from '../../common/errors';
import { config } from '../../config';

/**
 * Image uploads to Cloudflare R2.
 *
 * The browser uploads **directly to R2** with a presigned PUT, so a vendor's
 * 6MB phone photo never travels through the API. What comes back through us is
 * one HEAD to check what actually landed.
 *
 * That HEAD is not ceremony. A presigned PUT can pin the content type but
 * cannot enforce a size limit, so without checking afterwards "max 5MB" would
 * be a claim rather than a rule. `confirm` is where an oversized or wrongly
 * typed object is rejected *before* its URL is ever attached to a product.
 */

const MAX_BYTES = 5 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 300;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Where an upload may be filed. Anything else is not a thing we store. */
export const UPLOAD_KINDS = ['products', 'categories', 'brand'] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

let client: S3Client | null = null;

function s3(): S3Client {
  if (!config.r2.enabled) {
    throw AppError.serviceUnavailable(
      'Image uploads are not configured on this server. Paste a link instead.',
    );
  }
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.r2.accessKeyId as string,
        secretAccessKey: config.r2.secretAccessKey as string,
      },
    });
  }
  return client;
}

/**
 * Objects are filed under the brand that owns them.
 *
 * The brand prefix is not decoration: it means a key cannot be guessed into
 * another tenant's namespace, and that a brand's images can be found — or
 * removed — as a set when it leaves.
 */
/**
 * Where the platform's own images live.
 *
 * A home banner belongs to Haala, not to a brand, so it cannot go under
 * `brands/<id>/` — there is no id to use, and borrowing one would file editorial
 * artwork inside a tenant's namespace, to be swept up when that tenant leaves.
 *
 * Kept as a named constant because three places have to agree on it: the key
 * builder, the confirm guard and the media stream. They disagreed once for the
 * brand prefix and the symptom was a 404 nobody could explain.
 */
const HOME_PREFIX = 'home/';

function buildHomeKey(contentType: string): string {
  const ext = EXTENSIONS[contentType];
  if (!ext) {
    throw AppError.badRequest('Images must be JPEG, PNG or WebP');
  }
  return `${HOME_PREFIX}banners/${randomUUID()}.${ext}`;
}

function buildKey(brandId: string, kind: UploadKind, contentType: string): string {
  const ext = EXTENSIONS[contentType];
  if (!ext) {
    throw AppError.badRequest('Images must be JPEG, PNG or WebP');
  }
  return `brands/${brandId}/${kind}/${randomUUID()}.${ext}`;
}

/**
 * The address an image is read from.
 *
 * With public access switched on for the bucket this is a direct CDN URL. Until
 * then it points back at the API, which streams the object — slower, but it
 * means uploads are usable the moment the bucket exists rather than blocked on
 * a second piece of Cloudflare configuration.
 */
export function publicUrlFor(key: string): string {
  return config.r2.publicBaseUrl
    ? `${config.r2.publicBaseUrl}/${key}`
    : `${config.apiPrefix}/media/${key}`;
}

export const uploadService = {
  async sign(brandId: string, kind: UploadKind, contentType: string) {
    return this.signFor(buildKey(brandId, kind, contentType), contentType);
  },

  /**
   * The presign itself, given a key somebody else decided on.
   *
   * Split out so the brand and platform paths cannot drift on the parts that
   * matter — the TTL and the size the client is told to respect. Deciding
   * *which* key is the caller's job, and is where the tenancy rules live.
   */
  async signFor(key: string, contentType: string) {
    const uploadUrl = await getSignedUrl(
      s3(),
      new PutObjectCommand({
        Bucket: config.r2.bucket as string,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: SIGNED_URL_TTL_SECONDS },
    );
    return { key, uploadUrl, maxBytes: MAX_BYTES, expiresIn: SIGNED_URL_TTL_SECONDS };
  },

  /**
   * Check what actually landed, then hand back the URL to save.
   *
   * The key is re-derived from the caller's own brand rather than trusted, so a
   * confirm cannot be pointed at somebody else's object to discover whether it
   * exists.
   */
  /**
   * A presigned PUT for a home banner. Super admin only — enforced at the route,
   * because this namespace has no brand to scope it.
   */
  async signHome(contentType: string) {
    const key = buildHomeKey(contentType);
    return this.signFor(key, contentType);
  },

  /**
   * Confirm a home upload. The prefix check is the whole guard here: unlike the
   * brand path there is no id to re-derive the key from, so the only thing
   * standing between this and an arbitrary object in the bucket is that it must
   * live under `home/`.
   */
  async confirmHome(key: string) {
    if (!key.startsWith(HOME_PREFIX)) {
      throw AppError.notFound('Upload not found');
    }
    return this.head(key);
  },

  async confirm(brandId: string, key: string) {
    if (!key.startsWith(`brands/${brandId}/`)) {
      throw AppError.notFound('Upload not found');
    }
    return this.head(key);
  },

  /**
   * What actually landed in the bucket. Shared by both confirm paths so the
   * size and content-type rules cannot differ between a brand's image and the
   * platform's — the checks are the point, not the namespace.
   */
  async head(key: string) {
    let head;
    try {
      head = await s3().send(
        new HeadObjectCommand({ Bucket: config.r2.bucket as string, Key: key }),
      );
    } catch {
      throw AppError.notFound('That upload did not arrive — try again');
    }

    const size = head.ContentLength ?? 0;
    if (size === 0) throw AppError.badRequest('That file was empty');
    if (size > MAX_BYTES) {
      // Deliberately not deleted here: an oversized object is a bug worth being
      // able to look at, and the bucket lifecycle rule is the right place to
      // sweep orphans rather than a failure path that might itself fail.
      throw AppError.badRequest(
        `That image is ${Math.round(size / 1024 / 1024)}MB — the limit is ${MAX_BYTES / 1024 / 1024}MB`,
      );
    }
    const type = head.ContentType ?? '';
    if (!EXTENSIONS[type]) {
      throw AppError.badRequest('Images must be JPEG, PNG or WebP');
    }

    return { key, url: publicUrlFor(key), bytes: size, contentType: type };
  },

  /**
   * Stream an object back, for the case where the bucket has no public access.
   *
   * Unauthenticated on purpose — these are product photos shown to shoppers,
   * and the key is an unguessable uuid. Once `R2_PUBLIC_BASE_URL` is set this
   * path stops being used for new images.
   */
  async stream(key: string): Promise<{ body: Readable; contentType: string; bytes?: number }> {
    if (!key.startsWith('brands/') && !key.startsWith(HOME_PREFIX)) {
      throw AppError.notFound('Not found');
    }
    try {
      const out = await s3().send(
        new GetObjectCommand({ Bucket: config.r2.bucket as string, Key: key }),
      );
      return {
        body: out.Body as Readable,
        contentType: out.ContentType ?? 'application/octet-stream',
        bytes: out.ContentLength,
      };
    } catch {
      throw AppError.notFound('Not found');
    }
  },
};
