/** The width segment has to go in front of the projector's `f_auto,q_auto`, not
 * replace it, or the CDN serves the multi-megabyte TIFF original. */
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
