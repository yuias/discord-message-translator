import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: '__MSG_extensionName__',
    version: '1.4.0',
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
});
