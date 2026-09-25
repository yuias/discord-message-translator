import { defineConfig } from 'wxt';
import { resolve } from 'node:path';

export default defineConfig({
  srcDir: '.',
  entrypointsDir: 'entrypoints',
  manifest: {
    name: '__MSG_extensionName__',
    version: '1.3.0',
    description: '__MSG_extensionDescription__',
    default_locale: 'en',
    permissions: ['storage', 'alarms'],
    host_permissions: [
      'https://discord.com/*',
      'https://*.discord.com/*',
    ],
    icons: {
      16: '/icons/icon16.png',
      48: '/icons/icon48.png',
      128: '/icons/icon128.png',
    },
  },
  alias: {
    '@': resolve(__dirname),
  },
});
