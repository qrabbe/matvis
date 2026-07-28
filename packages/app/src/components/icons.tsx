/** Inline SVG icons for `@wordpress/ui`'s `IconButton` (`icon` wants a bare
 * `<svg>` element). Kept local and self-contained so we don't pull in
 * `@wordpress/icons` as a dependency. All use `currentColor` so they inherit
 * the button's tone. */

export const copyIcon = (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path
      fill="currentColor"
      d="M16 3H6c-1.1 0-2 .9-2 2v11h2V5h10V3zm3 4h-9c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h9c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zm0 12h-9V9h9v10z"
    />
  </svg>
);

export const checkIcon = (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" />
  </svg>
);
