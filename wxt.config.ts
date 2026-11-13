import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    minimum_chrome_version: '124',
    name: 'Threadhold',
    description: 'Bewaar private lokale drafts naast de native Azure DevOps-commenteditor.',
    permissions: ['storage', 'scripting'],
    optional_host_permissions: ['https://dev.azure.com/*', 'https://*.visualstudio.com/*'],
    action: { default_title: 'Threadhold' },
  },
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      // WXT infers required hosts even for runtime scripts; access must remain opt-in.
      delete manifest.host_permissions;
    },
  },
  webExt: { disabled: true },
});
