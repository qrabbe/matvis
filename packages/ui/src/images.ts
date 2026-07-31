/**
 * Ask for a width-capped rendition of a catalog image.
 *
 * The catalog's projector already normalizes Coop's images to
 * `…/image/upload/f_auto,q_auto/…` so the CDN serves a web format instead of the
 * multi-megabyte TIFF original. That still delivers full resolution, which is
 * ~1 MB a row — far too much for a 20-row thumbnail grid. Cloudinary chains
 * transform segments, so putting `w_<width>/` in front keeps the format choice
 * and adds the size (a 120px thumbnail comes back around 9 KB).
 *
 * Anything that is not a Cloudinary upload URL is returned untouched.
 *
 * Lives here because it is a URL shape the app and the catalog portal must agree
 * on: both render the same catalog images.
 */
export function sizedImageUrl(
  url: string | undefined,
  width: number,
): string | undefined {
  if (!url) return undefined;
  return url.replace(
    /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)/i,
    `$1w_${width}/`,
  );
}
