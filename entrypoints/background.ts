import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import { DraftStore, DraftStoreError, validateDraftRequest } from '../src/draft-store';
import { parsePrRoute, samePrRoute } from '../src/routes';
import type { ExtensionResponse, Scope } from '../src/contracts';
import type { MonacoResponse } from '../src/monaco-types';
import { executeMonacoRequest, validateMonacoRequest } from '../src/monaco-worker';
import { syncContentScripts } from '../src/registration';
import { t } from '../src/i18n';

export default defineBackground(() => {
  const store = new DraftStore();
  // Register the listener synchronously, but never admit a request before crash recovery.
  // The first valid request after a failed startup may retry initialization.
  void store.recoverSubmissions().catch(() => undefined);
  let registrationSync = Promise.resolve();
  function syncRegistration() {
    registrationSync = registrationSync.catch(() => undefined).then(syncContentScripts);
    return registrationSync;
  }
  void syncRegistration().catch(error => console.error('Threadhold hostregistratie mislukt:', String(error)));
  browser.permissions.onRemoved.addListener(() => { void syncRegistration().catch(error => console.error('Threadhold hostregistratie mislukt:', String(error))); });

  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (typeof message === 'object' && message !== null && 'channel' in message && message.channel === 'threadhold-access') {
      if (sender.id !== browser.runtime.id || sender.url !== browser.runtime.getURL('/popup.html')) return;
      void syncRegistration().then(() => sendResponse({ ok: true }), error => sendResponse({ ok: false, error: String(error) }));
      return true;
    }
    if (typeof message !== 'object' || message === null || !('channel' in message) || (message.channel !== 'threadhold' && message.channel !== 'threadhold-monaco')) return;
    const respond = async (): Promise<ExtensionResponse | MonacoResponse> => {
      try {
        if (sender.id !== browser.runtime.id || sender.frameId !== 0 || !sender.tab || typeof sender.tab.id !== 'number' || typeof sender.url !== 'string') {
          throw new DraftStoreError('FORBIDDEN', t('Draft requests must originate in this extension’s top-level PR content script.', 'Draftverzoeken moeten afkomstig zijn van het content-script van deze extensie op de bovenste PR-pagina.'));
        }
        if (Object.keys(message).some(key => key !== 'channel' && key !== 'request') || !('request' in message)) {
          throw new DraftStoreError('INVALID_REQUEST', 'Unsupported extension message fields.');
        }
        let scope: Scope;
        let execute: () => Promise<ExtensionResponse | MonacoResponse>;
        if (message.channel === 'threadhold-monaco') {
          const request = validateMonacoRequest(message.request);
          scope = request.action === 'open' ? request.scope : request.context.scope;
          execute = () => executeMonacoRequest(store, sender.tab!.id!, request);
        } else {
          validateDraftRequest(message.request);
          const request = message.request;
          scope = request.scope;
          execute = async () => ({ ok: true, result: await store.execute(request) });
        }
        // The sender URL can still be the document's original URL after history.pushState.
        // Check its origin, then validate the exact PR against the tab's committed URL.
        const source = new URL(sender.url);
        if (source.protocol !== 'https:' || source.origin !== scope.route.origin ||
            (sender.origin !== undefined && sender.origin !== source.origin)) {
          throw new DraftStoreError('FORBIDDEN', t('Draft scope does not match the sender’s origin.', 'De draftcontext komt niet overeen met de oorsprong van de afzender.'));
        }
        if (!await browser.permissions.contains({ origins: [`${source.origin}/*`] })) {
          throw new DraftStoreError('FORBIDDEN', t('The extension does not have access to this Azure DevOps origin.', 'De extensie heeft geen toegang tot deze Azure DevOps-oorsprong.'));
        }
        await store.recoverSubmissions();
        const route = parsePrRoute((await browser.tabs.get(sender.tab.id)).url ?? '');
        if (!route || !samePrRoute(route, scope.route)) {
          throw new DraftStoreError('FORBIDDEN', t('Draft scope does not match the sender’s PR route.', 'De draftcontext komt niet overeen met de PR-route van de afzender.'));
        }
        return await execute();
      } catch (error) {
        return {
          ok: false,
          error: error instanceof DraftStoreError
            ? { code: error.code, message: error.message }
            : { code: 'INTERNAL_ERROR', message: t('The local draft request could not be completed.', 'Het lokale draftverzoek kon niet worden voltooid.') },
        };
      }
    };
    void respond().then(sendResponse);
    return true;
  });
});
