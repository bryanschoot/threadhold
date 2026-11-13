import { browser } from 'wxt/browser';
import { DraftStoreError, validateDraftRequest, type DraftStore } from './draft-store';
import type { MonacoCommand, MonacoContext, MonacoRequest, MonacoResponse } from './monaco-types';
import { t } from './i18n';

/** The ordinary draft validator remains the single scope/ID validation boundary. */
export function validateMonacoRequest(value: unknown): MonacoRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('action' in value)) throw new DraftStoreError('INVALID_REQUEST', 'Invalid Monaco request.');
  const request = value as Record<string, unknown>;
  const allowed = request.action === 'open' ? ['action', 'scope', 'id'] : ['action', 'context'];
  if (Object.keys(request).some(key => !allowed.includes(key))) throw new DraftStoreError('INVALID_REQUEST', 'Unsupported Monaco request fields.');
  if (request.action === 'open') {
    validateDraftRequest({ action: 'get', scope: request.scope, id: request.id });
    return request as unknown as MonacoRequest;
  }
  if (request.action !== 'read' && request.action !== 'sync') throw new DraftStoreError('INVALID_REQUEST', 'Unsupported Monaco action.');
  const context = request.context;
  if (!context || typeof context !== 'object' || Array.isArray(context)) throw new DraftStoreError('INVALID_REQUEST', 'Invalid Monaco context.');
  const data = context as Record<string, unknown>;
  if (Object.keys(data).some(key => !['scope', 'sourceCommit', 'targetCommit', 'latestIteration'].includes(key)) ||
      typeof data.sourceCommit !== 'string' || !/^[a-f0-9]{40}$/i.test(data.sourceCommit) ||
      typeof data.targetCommit !== 'string' || !/^[a-f0-9]{40}$/i.test(data.targetCommit) ||
      typeof data.latestIteration !== 'number' || !Number.isSafeInteger(data.latestIteration) || data.latestIteration < 1) {
    throw new DraftStoreError('INVALID_REQUEST', 'Invalid Monaco commit or iteration context.');
  }
  validateDraftRequest({ action: 'list', scope: data.scope });
  return request as unknown as MonacoRequest;
}

export async function executeMonacoRequest(store: DraftStore, tabId: number, request: MonacoRequest): Promise<MonacoResponse> {
  let command: MonacoCommand;
  if (request.action === 'open') {
    const result = await store.execute({ action: 'get', scope: request.scope, id: request.id });
    if (!('draft' in result) || result.draft.anchor.kind !== 'inline') throw new DraftStoreError('INVALID_REQUEST', t('Only an inline draft can open a Monaco range.', 'Alleen een inline draft kan een Monaco-bereik openen.'));
    command = { action: 'open', scope: request.scope, anchor: result.draft.anchor };
  } else {
    // Explicitly copy metadata: no identities, draft bodies, or store access enter MAIN.
    const context: MonacoContext = { scope: request.context.scope, sourceCommit: request.context.sourceCommit, targetCommit: request.context.targetCommit, latestIteration: request.context.latestIteration };
    if (request.action === 'read') command = { action: 'read', context };
    else {
      const result = await store.execute({ action: 'list', scope: context.scope });
      if (!('drafts' in result)) throw new DraftStoreError('INTERNAL_ERROR', t('Invalid local draft list.', 'Ongeldige lokale draftlijst.'));
      command = { action: 'sync', context, slots: result.drafts.filter(draft => draft.anchor.kind === 'inline').map(draft => ({ id: draft.id, anchor: draft.anchor })) };
    }
  }
  const results = await browser.scripting.executeScript({
    target: { tabId, frameIds: [0] }, world: 'MAIN', args: [command, t('Refresh this PR to activate the early native Monaco integration.', 'Ververs deze PR om de vroege native Monaco-koppeling te activeren.')],
    func: async (command: MonacoCommand, unavailableMessage: string) => {
      if (!window.__threadholdMonaco) throw new Error(unavailableMessage);
      return { completed: true, bindings: await window.__threadholdMonaco.execute(command) };
    },
  });
  const result = results.find(item => item.frameId === 0);
  if (!result?.result?.completed) throw new DraftStoreError('NATIVE_EDITOR_UNAVAILABLE', t('The native Monaco integration is unavailable. Refresh this PR.', 'De native Monaco-koppeling is niet beschikbaar. Ververs deze PR.'));
  return { ok: true, bindings: Array.isArray(result.result.bindings) ? result.result.bindings : undefined };
}
