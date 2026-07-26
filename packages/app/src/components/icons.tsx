/** Inline SVG icons for `@wordpress/ui`'s `IconButton` (`icon` wants a bare
 * `<svg>` element). Kept local and self-contained so we don't pull in
 * `@wordpress/icons` as a dependency. All use `currentColor` so they inherit
 * the button's tone. */

export const eyeIcon = (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path
      fill="currentColor"
      d="M12 5c-4.5 0-8.3 2.9-9.8 7 1.5 4.1 5.3 7 9.8 7s8.3-2.9 9.8-7C20.3 7.9 16.5 5 12 5zm0 12c-2.8 0-5-2.2-5-5s2.2-5 5-5 5 2.2 5 5-2.2 5-5 5zm0-8c-1.7 0-3 1.3-3 3s1.3 3 3 3 3-1.3 3-3-1.3-3-3-3z"
    />
  </svg>
);

export const eyeOffIcon = (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path
      fill="currentColor"
      d="M12 7c2.8 0 5 2.2 5 5 0 .6-.1 1.2-.3 1.8l2.9 2.9c1.5-1.3 2.7-2.9 3.4-4.7-1.6-4.1-5.6-7-10.3-7-1.3 0-2.5.2-3.7.6l2.2 2.2c.6-.2 1.2-.3 1.8-.3zM2 4.3l2.3 2.3.5.5C3.1 8.4 1.8 10.1 1 12c1.6 4.1 5.6 7 10.3 7 1.5 0 2.9-.3 4.2-.8l.4.4L18.7 22 20 20.7 3.3 3 2 4.3zm5.5 5.5 1.5 1.5c0 .2-.1.3-.1.5 0 1.7 1.3 3 3 3 .2 0 .3 0 .5-.1l1.5 1.5c-.6.3-1.3.5-2 .5-2.8 0-5-2.2-5-5 0-.7.2-1.4.5-2zm4.3-.8 3.1 3.1v-.2c0-1.7-1.3-3-3-3h-.1z"
    />
  </svg>
);

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
