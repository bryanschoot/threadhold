import { browser } from 'wxt/browser';
import type { Draft } from './contracts';
import type { MonacoBinding, MonacoContext, MonacoRequest, MonacoResponse } from './monaco-types';
import { t } from './i18n';
export type { MonacoBinding } from './monaco-types';

async function request(command: MonacoRequest): Promise<MonacoBinding[]> {
  const response: MonacoResponse = await browser.runtime.sendMessage({ channel: 'threadhold-monaco', request: command });
  if (!response?.ok) throw new Error(response?.error.message ?? t('The native Monaco editor is unavailable.', 'De native Monaco-editor is niet bereikbaar.'));
  return response.bindings ?? [];
}
export function readMonacoBindings(context: MonacoContext): Promise<MonacoBinding[]> {
  return request({ action: 'read', context: { scope: context.scope, sourceCommit: context.sourceCommit, targetCommit: context.targetCommit, latestIteration: context.latestIteration } });
}
export async function syncMonacoDraftSlots(context: MonacoContext): Promise<void> {
  await request({ action: 'sync', context: { scope: context.scope, sourceCommit: context.sourceCommit, targetCommit: context.targetCommit, latestIteration: context.latestIteration } });
}
export async function openMonacoDraftEditor(draft: Draft): Promise<void> {
  await request({ action: 'open', scope: draft.scope, id: draft.id });
}
