import { Stack } from '@wordpress/ui';
import { Hero } from './features/Hero';
import { Portals } from './features/Portals';

// The distributor page: one column of sections, same width and rhythm as the
// portals it links to, so the whole site reads as one product.
export function App() {
  return (
    <Stack
      direction="column"
      gap="2xl"
      render={<main />}
      style={{ maxWidth: 860, margin: '0 auto', padding: '64px 20px' }}
    >
      <Hero />
      <Portals />
    </Stack>
  );
}
