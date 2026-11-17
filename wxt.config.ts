import { defineConfig } from 'wxt';

const icons = {
  16: 'icon/16.png',
  32: 'icon/32.png',
  48: 'icon/48.png',
  128: 'icon/128.png',
};

export default defineConfig({
  manifest: {
    minimum_chrome_version: '124',
    name: 'Threadhold',
    description: 'Keep local drafts in the native Azure DevOps pull request editor.',
    icons,
    permissions: ['storage', 'scripting'],
    optional_host_permissions: ['https://dev.azure.com/*', 'https://*.visualstudio.com/*'],
    action: { default_title: 'Threadhold', default_icon: icons },
  },
  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      // WXT infers required hosts even for runtime scripts; access must remain opt-in.
      delete manifest.host_permissions;
    },
  },
  webExt: { disabled: true },
});
