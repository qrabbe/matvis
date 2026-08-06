import { Stack } from '@wordpress/ui';
import { Hero } from './features/Hero';
import { Portals } from './features/Portals';

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
