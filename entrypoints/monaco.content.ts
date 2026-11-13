import { defineContentScript } from 'wxt/utils/define-content-script';
import { installMonacoController } from '../src/monaco-main';

export default defineContentScript({
  matches: ['https://dev.azure.com/*', 'https://*.visualstudio.com/*'],
  registration: 'runtime',
  world: 'MAIN',
  runAt: 'document_start',
  main: installMonacoController,
});
