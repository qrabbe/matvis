import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  framework: '@storybook/react-vite',

  // Do not include original wordpress components/stories
  stories: ['../src/**/*.story.@(tsx|mdx)'],
  addons: ['@storybook/addon-a11y'],
  core: { disableTelemetry: true },
};

export default config;
