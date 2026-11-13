import type { Anchor, Draft } from './contracts';
import type { PrContext, RemoteThread } from './ado-context';
import { openMonacoDraftEditor, readMonacoBindings } from './monaco-client';
import type { MonacoBinding } from './monaco-types';
import { t } from './i18n';

export interface NativeEditor {
  textarea: HTMLTextAreaElement;
  root: HTMLElement;
  actions: HTMLElement;
  publish: HTMLButtonElement;
  secondaryPublish?: HTMLButtonElement;
  cancel?: HTMLButtonElement;
  anchor: Anchor;
}
function threadId(element: Element): number | undefined {
  for (const name of element.classList) {
    const match = /^threadId-(-?\d+)$/.exec(name);
    if (match) return Number(match[1]);
  }
}
const nativeThreadIds = new WeakMap<HTMLElement, number>();
const monacoAnchors = new WeakMap<HTMLTextAreaElement, Anchor>();

function blankGeneralThread(element: Element): HTMLElement | undefined {
  const root = element.closest<HTMLElement>('.repos-discussion-thread');
  if (!root?.closest('.activity-feed-list') || root.closest('.monaco-editor, .repos-summary-header') || root.querySelector('.repos-comment-viewer:not([data-threadhold-card])')) return;
  const inputs = [...root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('.repos-discussion-thread-reply input, .repos-discussion-thread-reply textarea')];
  if (inputs.some(input => (threadId(input) ?? 0) > 0)) return;
  if (!root.closest('.bolt-timeline-first-row') && !inputs.some(input => threadId(input) === -1)) return;
  return root;
}

function identifyThreads(threads: RemoteThread[]): void {
  for (const root of document.querySelectorAll<HTMLElement>('.repos-discussion-thread')) {
    const ids = new Set<number>();
    for (const input of root.querySelectorAll('.repos-discussion-thread-reply input[class*="threadId-"], .repos-discussion-thread-reply textarea[class*="threadId-"]')) {
      if (input.closest('.repos-discussion-thread') !== root) continue;
      const id = threadId(input);
      if (id !== undefined && id > 0) ids.add(id);
    }
    if (ids.size === 1) {
      nativeThreadIds.set(root, ids.values().next().value!);
      continue;
    }
    if (nativeThreadIds.has(root) || ids.size > 1) continue;
    const timestamps = Array.from(root.querySelectorAll<HTMLElement>('.repos-comment-viewer[id]'))
      .filter(viewer => viewer.closest('.repos-discussion-thread') === root && viewer.getClientRects().length > 0 && /^\d+$/.test(viewer.id))
      .map(viewer => Number(viewer.id));
    if (!timestamps.length) continue;
    const candidates = threads.filter(thread => thread.id > 0 && !thread.isDeleted && timestamps.every(timestamp =>
      thread.comments.some(comment => !comment.isDeleted && Math.floor(Date.parse(comment.publishedDate) / 1000) === timestamp)));
    if (candidates.length === 1) nativeThreadIds.set(root, candidates[0]!.id);
  }
}
function filePath(element: Element): string | undefined {
  const header = element.closest('.repos-summary-header');
  const path = header?.querySelector('button.bolt-card-expand-button')?.getAttribute('aria-label');
  return path?.startsWith('/') ? path : undefined;
}
function lineCell(row: Element, side: 'left' | 'right'): HTMLElement | undefined {
  return row.querySelector<HTMLElement>(`.repos-line-content[data-${side === 'right' ? 'm' : 'o'}line]`) ?? undefined;
}
function newInlineAnchor(textarea: HTMLTextAreaElement, context: PrContext): Anchor | undefined {
  const row = textarea.closest('.repos-diff-contents-row');
  const previous = row?.previousElementSibling;
  const path = filePath(textarea);
  if (!previous || !path) return;
  const left = lineCell(previous, 'left');
  const right = lineCell(previous, 'right');
  // Unchanged two-sided rows are ambiguous without an observed native side gesture.
  const side = left && !right ? 'left' : right && !left ? 'right' : undefined;
  if (!side) return;
  const cell = side === 'right' ? right! : left!;
  const line = Number(cell.getAttribute(`data-${side === 'right' ? 'm' : 'o'}line`));
  if (!Number.isSafeInteger(line) || line < 1) return;
  const params = new URLSearchParams(location.search);
  params.delete('discussionId');
  return {
    kind: 'inline', filePath: path, side, start: { line, offset: 1 }, end: { line, offset: 1 },
    sourceCommit: context.sourceCommit, targetCommit: context.targetCommit,
    firstIteration: Number(params.get('base')) || 1,
    secondIteration: Number(params.get('iteration')) || context.latestIteration,
    editorKey: `inline:${path}:${side}:${line}:${params.get('iteration') ?? ''}:${params.get('base') ?? ''}`,
    pageUrl: `${location.origin}${location.pathname}?${params}`,
  };
}
export function discoverEditors(context: PrContext, threads: RemoteThread[], bindings: MonacoBinding[] = []): NativeEditor[] {
  identifyThreads(threads);
  const editors: NativeEditor[] = [];
  for (const textarea of document.querySelectorAll<HTMLTextAreaElement>('.repos-discussion-thread-reply .repos-comment-editor-fit textarea:not([aria-hidden="true"])')) {
    if (!textarea.isConnected || !textarea.getClientRects().length) continue;
    const root = textarea.closest<HTMLElement>('.repos-comment-editor-fit');
    const publish = root?.querySelector<HTMLButtonElement>('button.bolt-button.primary:not([data-threadhold-action])') ?? root?.querySelector<HTMLButtonElement>('button[id^="__bolt-comment-"]');
    const actions = publish?.parentElement;
    const nativeThread = textarea.closest<HTMLElement>('.repos-discussion-thread');
    const id = threadId(textarea) ?? (nativeThread ? nativeThreadIds.get(nativeThread) : undefined);
    if (!root || !publish || !actions) continue;
    const nativeButtons = [...actions.querySelectorAll<HTMLButtonElement>('button')].filter(button => !button.closest('.th-save'));
    const secondaryPublish = nativeButtons.find(button =>
      button !== publish && /reply\s*(?:&|and)\s*resolve/i.test(button.textContent ?? ''));
    const cancel = nativeButtons.find(button => button !== publish && button !== secondaryPublish);
    const binding = bindings.find(item => item.textareaId === textarea.dataset.threadholdMonacoEditor);
    if (binding) monacoAnchors.set(textarea, binding.anchor);
    let anchor: Anchor | undefined;
    if (id !== undefined && id > 0) {
      anchor = { kind: 'reply', threadId: id, editorKey: `reply:${id}`, pageUrl: location.href, sourceCommit: context.sourceCommit, targetCommit: context.targetCommit };
    } else if (textarea.closest('.monaco-editor')) {
      anchor = binding?.anchor ?? monacoAnchors.get(textarea);
    } else if (blankGeneralThread(textarea)) {
      anchor = { kind: 'general', editorKey: 'general', pageUrl: `${context.scope.route.prUrl}?_a=overview`, sourceCommit: context.sourceCommit, targetCommit: context.targetCommit };
    } else if (id === -1) anchor = newInlineAnchor(textarea, context);
    if (anchor) editors.push({ textarea, root, publish, actions, secondaryPublish, cancel, anchor });
  }
  return editors;
}
export function readEditor(editor: NativeEditor): string { return editor.textarea.value; }
export function writeEditor(editor: NativeEditor, body: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (!setter) throw new Error(t('Native textarea input is unavailable.', 'Native textarea-invoer is niet beschikbaar.'));
  setter.call(editor.textarea, body);
  editor.textarea.dispatchEvent(new Event('input', { bubbles: true }));
  editor.textarea.dispatchEvent(new Event('change', { bubbles: true }));
  editor.textarea.focus();
}
function replyThread(draft: Draft): HTMLElement | undefined {
  for (const root of document.querySelectorAll<HTMLElement>('.repos-discussion-thread')) {
    if (nativeThreadIds.get(root) === draft.anchor.threadId) return root;
  }
}
export function findDraftLocation(draft: Draft, threads: RemoteThread[]): { parent: HTMLElement; before: Element | null } | undefined {
  identifyThreads(threads);
  if (draft.anchor.kind === 'general') {
    const feed = document.querySelector<HTMLElement>('.activity-feed-list');
    if (!feed) return;
    const blankThread = [...feed.querySelectorAll<HTMLElement>('.repos-discussion-thread')].find(root => blankGeneralThread(root) === root);
    if (blankThread) {
      return { parent: blankThread, before: blankThread.querySelector('.repos-discussion-thread-reply') };
    }
    return { parent: feed, before: null };
  } else if (draft.anchor.kind === 'reply') {
    const thread = replyThread(draft);
    if (thread) return { parent: thread, before: thread.querySelector('.repos-discussion-thread-reply') };
  } else {
    for (const slot of document.querySelectorAll<HTMLElement>('.th-monaco-slot[data-threadhold-slot]')) {
      if (slot.dataset.threadholdSlot === draft.id) return { parent: slot, before: null };
    }
    for (const textarea of document.querySelectorAll<HTMLTextAreaElement>('.monaco-editor .repos-discussion-thread-reply textarea')) {
      const anchor = monacoAnchors.get(textarea);
      if (!anchor || !sameEditor(anchor, draft.anchor)) continue;
      const thread = textarea.closest<HTMLElement>('.repos-discussion-thread');
      if (thread) return { parent: thread, before: thread.querySelector('.repos-discussion-thread-reply') };
    }
    const matches: HTMLElement[] = [];
    for (const header of document.querySelectorAll('.repos-summary-header')) {
      if (filePath(header) !== draft.anchor.filePath) continue;
      for (const row of header.querySelectorAll<HTMLElement>('.repos-diff-contents-row.monospaced-text')) {
        const cell = lineCell(row, draft.anchor.side!);
        if (cell && Number(cell.getAttribute(`data-${draft.anchor.side === 'right' ? 'm' : 'o'}line`)) === draft.anchor.end?.line) matches.push(row);
      }
    }
    if (matches.length === 1) return { parent: matches[0]!.parentElement!, before: matches[0]!.nextElementSibling };
  }
}
export function sameEditor(anchor: Anchor, other: Anchor): boolean {
  return (anchor.kind === 'inline' || anchor.editorKey === other.editorKey) && anchor.kind === other.kind && anchor.threadId === other.threadId && anchor.filePath === other.filePath && anchor.side === other.side && anchor.start?.line === other.start?.line && anchor.start?.offset === other.start?.offset && anchor.end?.line === other.end?.line && anchor.end?.offset === other.end?.offset && (anchor.kind !== 'inline' || (anchor.sourceCommit === other.sourceCommit && anchor.targetCommit === other.targetCommit));
}
export async function openDraftEditor(draft: Draft, context: PrContext, threads: RemoteThread[]): Promise<NativeEditor> {
  let bindings = draft.anchor.kind === 'inline' && document.querySelector('.monaco-editor') ? await readMonacoBindings(context) : [];
  const existing = discoverEditors(context, threads, bindings).find(editor => sameEditor(editor.anchor, draft.anchor));
  if (existing) return existing;
  if (draft.anchor.kind === 'inline') {
    if (document.querySelector('.monaco-editor')) {
      await openMonacoDraftEditor(draft);
      bindings = await readMonacoBindings(context);
    } else {
      const slot = findDraftLocation(draft, threads);
      const row = slot?.before?.previousElementSibling ?? slot?.parent.lastElementChild;
      const widget = row?.querySelector<HTMLElement>('.repos-add-comment-widget');
      if (!widget) throw new Error(t('Open the original file location in the native diff view first.', 'Open eerst de oorspronkelijke bestandslocatie in het native diff-overzicht.'));
      widget.click();
    }
  } else {
    const scope = draft.anchor.kind === 'reply' ? replyThread(draft) : [...document.querySelectorAll<HTMLElement>('.activity-feed-list .repos-discussion-thread')].find(root => blankGeneralThread(root) === root);
    const input = scope?.querySelector<HTMLInputElement>('.repos-discussion-thread-reply .repos-comment-editor-max-width input');
    if (!input) throw new Error(t('Open the original native reply or comment editor first.', 'Open eerst de oorspronkelijke native reply- of commenteditor.'));
    input.click();
    input.focus();
  }
  const { promise, resolve, reject } = Promise.withResolvers<NativeEditor>();
  const observer = new MutationObserver(find);
  const timer = setTimeout(() => { observer.disconnect(); reject(new Error(t('The original native editor did not become available.', 'De oorspronkelijke native editor werd niet beschikbaar.'))); }, 4000);
  function find() {
    const editor = discoverEditors(context, threads, bindings).find(item => sameEditor(item.anchor, draft.anchor));
    if (!editor) return;
    observer.disconnect(); clearTimeout(timer); resolve(editor);
  }
  observer.observe(document.querySelector('.repos-pr-details-page') ?? document.body, { childList: true, subtree: true });
  find();
  return promise;
}
