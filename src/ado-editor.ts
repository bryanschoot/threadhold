import type { Anchor, Draft, Position } from './contracts';
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

function generalComposer(element: Element): HTMLElement | undefined {
  if (!element.closest('.activity-feed-list, .bolt-timeline-first-row, .bolt-timeline-row') || element.closest('.monaco-editor, .repos-summary-header, [data-threadhold-card]')) return;
  const root = element.closest<HTMLElement>('.repos-discussion-thread');
  if (root) {
    if (nativeThreadIds.has(root) || [...root.querySelectorAll('.repos-comment-viewer')].some(viewer => !viewer.closest('[data-threadhold-card]'))) return;
    const inputs = [...root.querySelectorAll('input, textarea')].filter(input => input.closest('.repos-discussion-thread') === root);
    if (inputs.some(input => (threadId(input) ?? 0) > 0)) return;
    if (!root.closest('.bolt-timeline-first-row') && !inputs.some(input => (threadId(input) ?? 0) < 0)) return;
    return root;
  }
  if ((threadId(element) ?? 0) > 0) return;
  return element.closest<HTMLElement>('.repos-discussion-thread-reply') ?? element.closest<HTMLElement>('.repos-comment-editor-max-width') ?? element.closest<HTMLElement>('.repos-comment-editor-fit') ?? ((threadId(element) ?? 0) < 0 ? element.closest<HTMLElement>('.bolt-timeline-first-row') ?? undefined : undefined);
}

function findGeneralComposer(): { input: HTMLInputElement | HTMLTextAreaElement; root: HTMLElement } | undefined {
  const candidates = [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('.repos-comment-editor-max-width input, .bolt-timeline-first-row input[class*="threadId-"], .repos-comment-editor-fit textarea:not([aria-hidden="true"]):not(.bolt-textfield-auto-adjust-hidden)')]
    .filter(input => input.isConnected && input.getClientRects().length > 0)
    .map(input => ({ input, root: generalComposer(input) }))
    .filter((item): item is { input: HTMLInputElement | HTMLTextAreaElement; root: HTMLElement } => !!item.root);
  return candidates.length === 1 ? candidates[0] : undefined;
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
  const attribute = `data-${side === 'right' ? 'm' : 'o'}line`;
  return [...row.querySelectorAll<HTMLElement>(`.repos-line-content[${attribute}]`)].find(cell => {
    const line = Number(cell.getAttribute(attribute));
    return Number.isSafeInteger(line) && line > 0;
  });
}
type DiffSide = 'left' | 'right';
interface NativeDiffRange {
  header: HTMLElement;
  path: string;
  side: DiffSide;
  start: Position;
  end: Position;
  startRow: HTMLElement;
  endRow: HTMLElement;
  pageUrl: string;
}
interface PendingNativeDiff {
  range: NativeDiffRange;
  row: HTMLElement;
  existing: Set<HTMLTextAreaElement>;
  createdAt: number;
  anchor?: Anchor;
}
const pendingNativeDiffs = new WeakMap<HTMLElement, PendingNativeDiff>();
const nativeTableAnchors = new WeakMap<HTMLElement, Anchor>();

function diffPageUrl(): string {
  const params = new URLSearchParams(location.search);
  params.delete('discussionId');
  return `${location.origin}${location.pathname}?${params}`;
}

function rowPosition(row: Element, side: DiffSide, offset = 1): Position | undefined {
  const line = Number(lineCell(row, side)?.getAttribute(`data-${side === 'right' ? 'm' : 'o'}line`));
  if (Number.isSafeInteger(line) && line > 0) return { line, offset };
}

function rangeForRows(startRow: HTMLElement, endRow: HTMLElement, side: DiffSide, startOffset = 1, endOffset = 1): NativeDiffRange | undefined {
  const header = startRow.closest<HTMLElement>('.repos-summary-header');
  const path = filePath(startRow);
  const start = rowPosition(startRow, side, startOffset);
  const end = rowPosition(endRow, side, endOffset);
  if (!header || !path || endRow.closest('.repos-summary-header') !== header || !start || !end) return;
  const reversed = start.line > end.line || (start.line === end.line && start.offset > end.offset);
  return { header, path, side, start: reversed ? end : start, end: reversed ? start : end, startRow: reversed ? endRow : startRow, endRow: reversed ? startRow : endRow, pageUrl: diffPageUrl() };
}

function diffWidget(element: Element): { action: HTMLElement; side: DiffSide; row: HTMLElement } | undefined {
  const widget = element.closest<HTMLElement>('.repos-add-comment-widget');
  const row = widget?.closest<HTMLElement>('.repos-diff-contents-row.monospaced-text');
  if (!widget || !row || row.closest('.monaco-editor')) return;
  const identities = widget.querySelectorAll<HTMLElement>('[id^="o-diff-widget-"], [id^="m-diff-widget-"]');
  const identified = element.closest<HTMLElement>('[id^="o-diff-widget-"], [id^="m-diff-widget-"]')
    ?? (identities.length === 1 ? identities[0] : undefined);
  if (!identified || !widget.contains(identified)) return;
  const side = identified.id.startsWith('o-diff-widget-') ? 'left' : 'right';
  const action = identified.matches('button, [role="button"]') ? identified : identified.querySelector<HTMLElement>('button, [role="button"]');
  if (!action || !rowPosition(row, side)) return;
  return { action, side, row };
}

function codeTextWalker(cell: HTMLElement): TreeWalker {
  return document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, {
    acceptNode: node => node.parentElement?.closest('.screen-reader-only, [aria-hidden="true"]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
}

function selectionCell(node: Node): HTMLElement | undefined {
  const element = node instanceof Element ? node : node.parentElement;
  const cell = element?.closest<HTMLElement>('.repos-line-content');
  return cell?.closest('.repos-diff-contents-row.monospaced-text') && !cell.closest('.monaco-editor') ? cell : undefined;
}

function readNativeSelection(hint?: DiffSide): { range?: NativeDiffRange; ambiguous: boolean } {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return { ambiguous: false };
  const selected = selection.getRangeAt(0);
  const startCell = selectionCell(selected.startContainer);
  const endCell = selectionCell(selected.endContainer);
  if (!startCell && !endCell) return { ambiguous: false };
  if (!startCell || !endCell) return { ambiguous: true };
  const startRow = startCell.closest<HTMLElement>('.repos-diff-contents-row.monospaced-text')!;
  const endRow = endCell.closest<HTMLElement>('.repos-diff-contents-row.monospaced-text')!;
  const sides = (hint ? [hint] : ['left', 'right'] as const).filter(side =>
    startCell.hasAttribute(`data-${side === 'right' ? 'm' : 'o'}line`) && endCell.hasAttribute(`data-${side === 'right' ? 'm' : 'o'}line`) && rowPosition(startRow, side) && rowPosition(endRow, side));
  if (sides.length !== 1) return { ambiguous: true };
  const offset = (cell: HTMLElement, node: Node, end: number): number => {
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.setEnd(node, end);
    let length = 0;
    const walker = codeTextWalker(cell);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      if (text === node) return length + end + 1;
      const size = text.textContent?.length ?? 0;
      if (range.comparePoint(text, size) > 0) break;
      length += size;
    }
    return length + 1;
  };
  const range = rangeForRows(startRow, endRow, sides[0]!, offset(startCell, selected.startContainer, selected.startOffset), offset(endCell, selected.endContainer, selected.endOffset));
  return { range, ambiguous: !range };
}

function rangeIncludesRow(range: NativeDiffRange, row: HTMLElement, side: DiffSide): boolean {
  const position = rowPosition(row, side);
  return range.header === row.closest('.repos-summary-header') && range.side === side && !!position && position.line >= range.start.line && position.line <= range.end.line;
}

function queueNativeRange(range: NativeDiffRange, row: HTMLElement, anchor?: Anchor): void {
  pendingNativeDiffs.set(range.header, { range, row, existing: new Set(range.header.querySelectorAll<HTMLTextAreaElement>('textarea')), createdAt: performance.now(), anchor });
}

/** Capture public table-diff gestures before native focus clears the selection. */
export function installNativeDiffCapture(): () => void {
  let observed: NativeDiffRange | undefined;
  let observedBothSides: { left: NativeDiffRange; right: NativeDiffRange } | undefined;
  let pointerStart: { row: HTMLElement; side: DiffSide } | undefined;
  let opening: { action: HTMLElement; createdAt: number } | undefined;
  const headers = new Set<HTMLElement>();
  const point = (element: Element): { row: HTMLElement; side: DiffSide } | undefined => {
    const widget = diffWidget(element);
    if (widget) return widget;
    const cell = element.closest<HTMLElement>('.repos-line-content');
    const row = cell?.closest<HTMLElement>('.repos-diff-contents-row.monospaced-text');
    if (!cell || !row || row.closest('.monaco-editor')) return;
    const sides = (['left', 'right'] as const).filter(side => cell.hasAttribute(`data-${side === 'right' ? 'm' : 'o'}line`) && rowPosition(row, side));
    if (sides.length === 1) return { row, side: sides[0]! };
  };
  const activate = (event: Event, element: Element): boolean => {
    const widget = diffWidget(element);
    if (!widget) return false;
    const { row, side, action } = widget;
    const header = row.closest<HTMLElement>('.repos-summary-header');
    if (!header) return true;
    headers.add(header);
    const pending = pendingNativeDiffs.get(header);
    if (event.type === 'click' && !event.isTrusted && pending?.anchor && pending.row === row) return true;
    if (event.type === 'click' && opening?.action === action && performance.now() - opening.createdAt < 4000) return true;
    opening = { action, createdAt: performance.now() };
    const selected = readNativeSelection(side);
    let range = selected.range;
    const remembered = observed?.side === side ? observed : observedBothSides?.[side];
    if (!range && !selected.ambiguous && remembered && rangeIncludesRow(remembered, row, side)) range = remembered;
    if (!range && !selected.ambiguous) range = rangeForRows(row, row, side);
    pendingNativeDiffs.delete(header);
    if (range && rangeIncludesRow(range, row, side)) {
      observed = range;
      observedBothSides = undefined;
      queueNativeRange(range, row);
    }
    return true;
  };
  const onPointerDown = (event: PointerEvent): void => {
    if (!(event.target instanceof Element) || event.button !== 0) return;
    pointerStart = undefined;
    if (activate(event, event.target)) {
      pointerStart = point(event.target);
      return;
    }
    opening = undefined;
    observed = undefined;
    observedBothSides = undefined;
    pointerStart = point(event.target);
  };
  const onPointerUp = (event: PointerEvent): void => {
    if (!(event.target instanceof Element) || !pointerStart) return;
    const endElement = document.elementFromPoint(event.clientX, event.clientY) ?? event.target;
    const end = point(endElement);
    const selected = readNativeSelection(pointerStart.side);
    if (selected.range) {
      observed = selected.range;
      observedBothSides = undefined;
    } else if (selected.ambiguous) {
      observed = undefined;
      observedBothSides = undefined;
    } else if (end?.side === pointerStart.side && end.row !== pointerStart.row) observed = rangeForRows(pointerStart.row, end.row, end.side);
    if (opening) {
      const header = pointerStart.row.closest<HTMLElement>('.repos-summary-header');
      const pending = header ? pendingNativeDiffs.get(header) : undefined;
      if (pending && observed && rangeIncludesRow(observed, pointerStart.row, pointerStart.side)) pending.range = observed;
      else if (header) pendingNativeDiffs.delete(header);
    }
    pointerStart = undefined;
  };
  const onSelectionChange = (): void => {
    const selected = readNativeSelection(pointerStart?.side);
    if (selected.range) {
      observed = selected.range;
      observedBothSides = undefined;
    } else if (selected.ambiguous) {
      observed = undefined;
      const left = readNativeSelection('left').range;
      const right = readNativeSelection('right').range;
      // Keep columns without choosing a side on unchanged inline rows.
      observedBothSides = left && right ? { left, right } : undefined;
    } else if (document.getSelection()?.isCollapsed === false) {
      observed = undefined;
      observedBothSides = undefined;
    }
  };
  const onClick = (event: MouseEvent): void => { if (event.button === 0 && event.target instanceof Element) activate(event, event.target); };
  const onKeyDown = (event: KeyboardEvent): void => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof Element) activate(event, event.target);
  };
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointerup', onPointerUp, true);
  document.addEventListener('selectionchange', onSelectionChange, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
  return () => {
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('pointerup', onPointerUp, true);
    document.removeEventListener('selectionchange', onSelectionChange, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    for (const header of headers) pendingNativeDiffs.delete(header);
  };
}

function newInlineAnchor(textarea: HTMLTextAreaElement, context: PrContext): Anchor | undefined {
  const thread = textarea.closest<HTMLElement>('.repos-discussion-thread') ?? textarea;
  const captured = nativeTableAnchors.get(thread);
  if (captured) return captured;
  const header = textarea.closest<HTMLElement>('.repos-summary-header');
  const pending = header ? pendingNativeDiffs.get(header) : undefined;
  if (!header || !pending || pending.existing.has(textarea) || performance.now() - pending.createdAt > 4000 || pending.range.pageUrl !== diffPageUrl()) return;
  let previous = textarea.closest('.repos-diff-contents-row')?.previousElementSibling;
  while (previous && !previous.matches('.repos-diff-contents-row.monospaced-text')) previous = previous.previousElementSibling;
  if (previous !== pending.row && previous !== pending.range.endRow) return;
  const { path, side, start, end, pageUrl } = pending.range;
  const params = new URLSearchParams(location.search);
  const anchor: Anchor = pending.anchor ?? {
    kind: 'inline', filePath: path, side, start, end,
    sourceCommit: context.sourceCommit, targetCommit: context.targetCommit,
    firstIteration: Number(params.get('base')) || 1,
    secondIteration: Number(params.get('iteration')) || context.latestIteration,
    editorKey: `inline:${path}:${side}:${start.line}:${start.offset}:${end.line}:${end.offset}:${params.get('iteration') ?? ''}:${params.get('base') ?? ''}`,
    pageUrl,
  };
  nativeTableAnchors.set(thread, anchor);
  pendingNativeDiffs.delete(header);
  return anchor;
}
export function readNativeEditorActions(root: HTMLElement) {
  const publish = root.querySelector<HTMLButtonElement>('button.bolt-button.primary:not([data-threadhold-action])') ?? root.querySelector<HTMLButtonElement>('button[id^="__bolt-comment-"]');
  const actions = publish?.parentElement;
  if (!publish || !actions) return;
  const nativeButtons = [...actions.querySelectorAll<HTMLButtonElement>('button')].filter(button => !button.closest('.th-save'));
  const secondaryPublish = nativeButtons.find(button => button !== publish && /reply\s*(?:&|and)\s*resolve/i.test(button.textContent ?? ''));
  const cancel = nativeButtons.find(button => button !== publish && button !== secondaryPublish);
  return { actions, publish, secondaryPublish, cancel };
}

export function discoverEditors(context: PrContext, threads: RemoteThread[], bindings: MonacoBinding[] = []): NativeEditor[] {
  identifyThreads(threads);
  const editors: NativeEditor[] = [];
  const general = findGeneralComposer();
  for (const textarea of document.querySelectorAll<HTMLTextAreaElement>('.repos-comment-editor-fit textarea:not([aria-hidden="true"]):not(.bolt-textfield-auto-adjust-hidden)')) {
    if (!textarea.isConnected || !textarea.getClientRects().length) continue;
    const root = textarea.closest<HTMLElement>('.repos-comment-editor-fit');
    const actions = root && readNativeEditorActions(root);
    const nativeThread = textarea.closest<HTMLElement>('.repos-discussion-thread');
    const id = threadId(textarea) ?? (nativeThread ? nativeThreadIds.get(nativeThread) : undefined);
    if (!root || !actions) continue;
    const binding = bindings.find(item => item.textareaId === textarea.dataset.threadholdMonacoEditor);
    if (binding) monacoAnchors.set(textarea, binding.anchor);
    let anchor: Anchor | undefined;
    if (id !== undefined && id > 0) {
      anchor = { kind: 'reply', threadId: id, editorKey: `reply:${id}`, pageUrl: location.href, sourceCommit: context.sourceCommit, targetCommit: context.targetCommit };
    } else if (binding || monacoAnchors.has(textarea) || textarea.closest('.monaco-editor')) {
      anchor = binding?.anchor ?? monacoAnchors.get(textarea);
    } else if (general?.input === textarea) {
      anchor = { kind: 'general', editorKey: 'general', pageUrl: `${context.scope.route.prUrl}?_a=overview`, sourceCommit: context.sourceCommit, targetCommit: context.targetCommit };
    } else if (id === undefined || id < 0) anchor = newInlineAnchor(textarea, context);
    if (anchor) editors.push({ textarea, root, ...actions, anchor });
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
    const composer = findGeneralComposer();
    if (!composer) return;
    const timeline = composer.root.closest<HTMLElement>('.bolt-timeline-first-row');
    const reply = composer.root.matches('.repos-discussion-thread') ? composer.root.querySelector<HTMLElement>('.repos-discussion-thread-reply') : undefined;
    const before = timeline ?? reply ?? composer.root;
    if (before.parentElement) return { parent: before.parentElement, before };
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
function nativeDraftRange(draft: Draft): NativeDiffRange | undefined {
  const { side, start, end } = draft.anchor;
  if (!side || !start || !end) return;
  const matches: NativeDiffRange[] = [];
  for (const header of document.querySelectorAll<HTMLElement>('.repos-summary-header')) {
    if (filePath(header) !== draft.anchor.filePath) continue;
    const rows = [...header.querySelectorAll<HTMLElement>('.repos-diff-contents-row.monospaced-text')];
    const starts = rows.filter(row => rowPosition(row, side)?.line === start.line);
    const ends = rows.filter(row => rowPosition(row, side)?.line === end.line);
    if (starts.length !== 1 || ends.length !== 1) continue;
    const range = rangeForRows(starts[0]!, ends[0]!, side, start.offset, end.offset);
    if (range) matches.push(range);
  }
  return matches.length === 1 ? matches[0] : undefined;
}

function restoreNativeSelection(range: NativeDiffRange): boolean {
  const endpoint = (row: HTMLElement, offset: number): { node: Node; offset: number } | undefined => {
    const cell = lineCell(row, range.side);
    if (!cell || !Number.isSafeInteger(offset) || offset < 1) return;
    let remaining = offset - 1;
    const walker = codeTextWalker(cell);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const length = node.textContent?.length ?? 0;
      if (remaining <= length) return { node, offset: remaining };
      remaining -= length;
    }
    if (remaining === 0) return { node: cell, offset: cell.childNodes.length };
  };
  const start = endpoint(range.startRow, range.start.offset);
  const end = endpoint(range.endRow, range.end.offset);
  const selection = document.getSelection();
  if (!start || !end || !selection) return false;
  const selected = document.createRange();
  selected.setStart(start.node, start.offset);
  selected.setEnd(end.node, end.offset);
  selection.removeAllRanges();
  selection.addRange(selected);
  return true;
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
      const range = nativeDraftRange(draft);
      const widgets = range ? [...range.endRow.querySelectorAll<HTMLElement>('.repos-add-comment-widget [id^="o-diff-widget-"], .repos-add-comment-widget [id^="m-diff-widget-"]')]
        .map(element => diffWidget(element)).filter(widget => widget?.side === range.side) : [];
      if (!range || widgets.length !== 1 || !restoreNativeSelection(range)) throw new Error(t('Open the original file location in the native diff view first.', 'Open eerst de oorspronkelijke bestandslocatie in het native diff-overzicht.'));
      queueNativeRange(range, range.endRow, draft.anchor);
      widgets[0]!.action.click();
    }
  } else {
    const scope = draft.anchor.kind === 'reply' ? replyThread(draft) : undefined;
    const input = draft.anchor.kind === 'general' ? findGeneralComposer()?.input : scope?.querySelector<HTMLInputElement>('.repos-discussion-thread-reply .repos-comment-editor-max-width input');
    if (!input || !(input instanceof HTMLInputElement)) throw new Error(t('Open the original native reply or comment editor first.', 'Open eerst de oorspronkelijke native reply- of commenteditor.'));
    input.click();
    if (input.isConnected) input.focus();
  }
  const { promise, resolve, reject } = Promise.withResolvers<NativeEditor>();
  const observer = new MutationObserver(find);
  const timer = setTimeout(() => { observer.disconnect(); reject(new Error(t('The original native editor did not become available.', 'De oorspronkelijke native editor werd niet beschikbaar.'))); }, 4000);
  function find() {
    const editor = discoverEditors(context, threads, bindings).find(item => sameEditor(item.anchor, draft.anchor));
    if (!editor) return;
    observer.disconnect(); clearTimeout(timer); resolve(editor);
  }
  observer.observe(document.body, { childList: true, subtree: true });
  find();
  return promise;
}
