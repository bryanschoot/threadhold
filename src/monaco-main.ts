import { parsePrRoute } from './routes';
import { captureDiscussionRange, equalMonacoRange, validMonacoRange } from './monaco-range';
import type { Anchor, Scope } from './contracts';
import type { MonacoBinding, MonacoCommand, MonacoContext, MonacoEditor, MonacoModel, MonacoNamespace, MonacoRange, MonacoViewZone } from './monaco-types';
import { t } from './i18n';

interface CapturedEditor { editor: MonacoEditor; root: HTMLElement; dispose(): void }
interface NativeSnapshot { root: HTMLElement; uri: string; range?: MonacoRange }
interface DraftZone { editor: MonacoEditor; id: string; node: HTMLElement; zone: MonacoViewZone; resize: ResizeObserver }
interface ModelIdentity { repositoryId: string; commit: string; filePath: string }
const nativeSelector = '.repos-discussion-thread-reply .repos-comment-editor-fit textarea[class*="threadId--"]:not([aria-hidden="true"])';

export function parseMonacoModelUri(uri: string): ModelIdentity | undefined {
  try {
    const url = new URL(uri);
    if (url.protocol !== 'inmemory:' || url.hostname !== 'model') return;
    const match = /^\/git\/([^/]+)\/GC([a-f0-9]{40})\/(.+)$/i.exec(decodeURIComponent(url.pathname));
    if (!match) return;
    return { repositoryId: match[1]!, commit: match[2]!, filePath: `/${match[3]!}` };
  } catch { return; }
}
function sideOf(root: HTMLElement): 'left' | 'right' | undefined {
  if (root.classList.contains('modified-in-monaco-diff-editor')) return 'right';
  if (root.classList.contains('original-in-monaco-diff-editor')) return 'left';
}
function rangeOf(anchor: Anchor): MonacoRange | undefined {
  if (!anchor.start || !anchor.end) return;
  const range = { startLineNumber: anchor.start.line, startColumn: anchor.start.offset, endLineNumber: anchor.end.line, endColumn: anchor.end.offset };
  return validMonacoRange(range) ? range : undefined;
}
function sameLocation(left: Anchor, right: Anchor): boolean {
  const a = rangeOf(left), b = rangeOf(right);
  return !!a && !!b && left.filePath === right.filePath && left.side === right.side && left.sourceCommit === right.sourceCommit && left.targetCommit === right.targetCommit && equalMonacoRange(a, b);
}
/** One-shot initialization hook. Restore the ordinary property before invoking consumers. */
function whenAssigned(target: object, key: string, accept: (value: unknown) => boolean, ready: (value: unknown) => void): void {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  const value = Reflect.get(target, key);
  if (accept(value)) { ready(value); return; }
  if (descriptor && (!descriptor.configurable || descriptor.get || descriptor.set || descriptor.writable === false)) return;
  Object.defineProperty(target, key, {
    configurable: true, enumerable: descriptor?.enumerable ?? true,
    get: () => value,
    set(next: unknown) {
      Object.defineProperty(target, key, { configurable: true, enumerable: descriptor?.enumerable ?? true, writable: true, value: next });
      if (accept(next)) ready(next);
    },
  });
}

export function installMonacoController(): void {
  if (window.__threadholdMonaco) return;
  let namespace: MonacoNamespace | undefined;
  let activeContext: MonacoContext | undefined;
  let activeRoute = '';
  let desiredSlots: { id: string; anchor: Anchor }[] = [];
  let scheduled = false;
  const captured = new Set<CapturedEditor>();
  const snapshots = new WeakMap<HTMLTextAreaElement, NativeSnapshot>();
  const pending = new Map<MonacoEditor, Anchor>();
  const openings = new WeakMap<HTMLElement, { uri: string; range: MonacoRange }>();
  const zones = new Map<string, DraftZone>();

  function removeZone(id: string) {
    const item = zones.get(id);
    if (!item) return;
    zones.delete(id); item.resize.disconnect();
    try { item.editor.changeViewZones(accessor => accessor.removeZone(item.id)); } catch { /* Already disposed. */ }
    item.node.remove();
  }
  function clear() {
    for (const id of zones.keys()) removeZone(id);
    desiredSlots = []; activeContext = undefined; pending.clear();
  }
  function guard(scope: Scope) {
    const route = parsePrRoute(location.href);
    if (!route || route.origin !== scope.route.origin || route.organization.toLowerCase() !== scope.route.organization.toLowerCase() ||
        route.project.toLowerCase() !== scope.route.project.toLowerCase() || route.repository.toLowerCase() !== scope.route.repository.toLowerCase() || route.pullRequestId !== scope.route.pullRequestId) {
      clear(); throw new Error(t('The native editor does not belong to this PR.', 'De native editor hoort niet bij deze PR.'));
    }
    const key = JSON.stringify([route.prUrl, scope.repositoryId, scope.userId]);
    if (activeRoute !== key) { clear(); activeRoute = key; }
  }
  function modelFor(root: HTMLElement): MonacoModel | undefined {
    const instance = [...captured].find(item => item.root === root)?.editor.getModel();
    if (instance) return instance;
    const uri = root.getAttribute('data-uri');
    const models = namespace?.getModels().filter(model => model.uri.toString() === uri) ?? [];
    return models.length === 1 ? models[0] : undefined;
  }
  function identityFor(root: HTMLElement, sourceCommit: string, targetCommit: string): ModelIdentity | undefined {
    const model = modelFor(root);
    if (!model) return;
    const uri = model.uri.toString();
    const direct = parseMonacoModelUri(uri);
    if (direct) return direct;
    // ADO gives the original split model an anonymous URI. Resolve only through
    // its own diff's unique, commit-qualified modified model, never another file.
    if (sideOf(root) !== 'left' || !/^inmemory:\/\/model\/\d+$/.test(uri)) return;
    const diff = root.closest('.monaco-diff-editor');
    const siblings = diff && [...diff.querySelectorAll<HTMLElement>('.modified-in-monaco-diff-editor')]
      .filter(item => item.closest('.monaco-diff-editor') === diff);
    if (!siblings || siblings.length !== 1) return;
    const modified = modelFor(siblings[0]!);
    const identity = modified && parseMonacoModelUri(modified.uri.toString());
    if (!identity || identity.commit.toLowerCase() !== sourceCommit.toLowerCase()) return;
    return { ...identity, commit: targetCommit };
  }
  function captureNativeEditors() {
    if (!parsePrRoute(location.href)) return;
    for (const textarea of document.querySelectorAll<HTMLTextAreaElement>(nativeSelector)) {
      if (snapshots.has(textarea)) continue;
      const root = textarea.closest<HTMLElement>('.monaco-editor');
      if (!root || !sideOf(root)) continue;
      const model = modelFor(root);
      if (!model) continue;
      const instance = [...captured].find(item => item.root === root)?.editor;
      if (!instance) continue;
      const requested = pending.get(instance);
      const opening = openings.get(root);
      const openedRange = opening?.uri === model.uri.toString() ? opening.range : undefined;
      const range = requested ? rangeOf(requested) : openedRange ?? captureDiscussionRange(model.getAllDecorations(), instance.getSelection());
      if (!range) continue;
      snapshots.set(textarea, { root, uri: model.uri.toString(), range });
      textarea.dataset.threadholdMonacoEditor = crypto.randomUUID();
      if (instance && requested) pending.delete(instance);
      openings.delete(root);
    }
  }
  function bindings(context: MonacoContext): MonacoBinding[] {
    captureNativeEditors();
    const result: MonacoBinding[] = [];
    for (const textarea of document.querySelectorAll<HTMLTextAreaElement>(nativeSelector)) {
      if (!textarea.getClientRects().length) continue;
      const snapshot = snapshots.get(textarea);
      if (!snapshot?.range || !textarea.dataset.threadholdMonacoEditor) continue;
      const { root, uri, range } = snapshot;
      const model = modelFor(root);
      const identity = identityFor(root, context.sourceCommit, context.targetCommit);
      const side = sideOf(root);
      if (!model || model.uri.toString() !== uri || !identity || !side || identity.repositoryId.toLowerCase() !== context.scope.repositoryId.toLowerCase() ||
          identity.commit.toLowerCase() !== (side === 'right' ? context.sourceCommit : context.targetCommit).toLowerCase()) continue;
      const params = new URLSearchParams(location.search); params.delete('discussionId');
      const anchor: Anchor = {
        kind: 'inline', filePath: identity.filePath, side,
        start: { line: range.startLineNumber, offset: range.startColumn }, end: { line: range.endLineNumber, offset: range.endColumn },
        sourceCommit: context.sourceCommit, targetCommit: context.targetCommit,
        firstIteration: Number(params.get('base')) || 1, secondIteration: Number(params.get('iteration')) || context.latestIteration,
        editorKey: `monaco:${identity.filePath}:${side}:${range.startLineNumber}:${range.startColumn}:${range.endLineNumber}:${range.endColumn}:${params.get('iteration') ?? ''}:${params.get('base') ?? ''}`,
        pageUrl: `${location.origin}${location.pathname}?${params}`,
      };
      result.push({ textareaId: textarea.dataset.threadholdMonacoEditor, anchor, uri });
    }
    return result;
  }
  function matchingEditor(scope: Scope, anchor: Anchor): CapturedEditor | undefined {
    if (anchor.kind !== 'inline') return;
    const range = rangeOf(anchor);
    if (!range) return;
    const currentPath = new URLSearchParams(location.search).get('path');
    if (currentPath && currentPath !== anchor.filePath) return;
    const matches = [...captured].filter(item => {
      if (!item.root.isConnected || !item.root.getClientRects().length || sideOf(item.root) !== anchor.side) return false;
      const model = item.editor.getModel();
      const identity = identityFor(item.root, anchor.sourceCommit ?? '', anchor.targetCommit ?? '');
      if (!model || !identity || identity.repositoryId.toLowerCase() !== scope.repositoryId.toLowerCase() || identity.filePath !== anchor.filePath ||
          identity.commit.toLowerCase() !== (anchor.side === 'right' ? anchor.sourceCommit : anchor.targetCommit).toLowerCase()) return false;
      return range.endLineNumber <= model.getLineCount() && range.startColumn <= model.getLineMaxColumn(range.startLineNumber) && range.endColumn <= model.getLineMaxColumn(range.endLineNumber);
    });
    return matches.length === 1 ? matches[0] : undefined;
  }
  function reconcile() {
    scheduled = false;
    if (!activeContext) return;
    try { guard(activeContext.scope); } catch { return; }
    if (!activeContext) return;
    const context = activeContext;
    const native = bindings(context);
    const keep = new Set<string>();
    for (const slot of desiredSlots) {
      if (slot.anchor.sourceCommit !== context.sourceCommit || slot.anchor.targetCommit !== context.targetCommit) continue;
      const match = matchingEditor(context.scope, slot.anchor);
      if (!match) continue;
      // The native editor already owns a viewzone for this exact range. The isolated
      // adapter mounts the card in its native thread instead of duplicating the zone.
      if (native.some(binding => sameLocation(binding.anchor, slot.anchor))) continue;
      keep.add(slot.id);
      const old = zones.get(slot.id);
      if (old?.editor === match.editor && old.node.isConnected) continue;
      removeZone(slot.id);
      const node = document.createElement('div');
      node.className = 'th-monaco-slot repos-discussion-thread'; node.dataset.threadholdSlot = slot.id;
      node.style.width = '100%'; node.style.boxSizing = 'border-box';
      const host = document.createElement('div'); host.append(node);
      const zone: MonacoViewZone = { afterLineNumber: slot.anchor.end!.line, heightInPx: 1, domNode: host, suppressMouseDown: false };
      let zoneId = '';
      match.editor.changeViewZones(accessor => { zoneId = accessor.addZone(zone); });
      const resize = new ResizeObserver(() => {
        const height = Math.max(1, Math.ceil(node.scrollHeight));
        if (zone.heightInPx === height) return;
        zone.heightInPx = height;
        try { match.editor.changeViewZones(accessor => accessor.layoutZone(zoneId)); } catch { removeZone(slot.id); }
      });
      zones.set(slot.id, { editor: match.editor, id: zoneId, node, zone, resize }); resize.observe(node);
    }
    for (const id of zones.keys()) if (!keep.has(id)) removeZone(id);
  }
  function schedule() {
    captureNativeEditors();
    if (!scheduled) { scheduled = true; queueMicrotask(reconcile); }
  }
  function capture(editor: MonacoEditor) {
    if (!parsePrRoute(location.href) || [...captured].some(item => item.editor === editor)) return;
    const root = editor.getDomNode();
    if (!root) return;
    const modelChange = editor.onDidChangeModel(() => { for (const [id, zone] of zones) if (zone.editor === editor) removeZone(id); pending.delete(editor); schedule(); });
    const item: CapturedEditor = { editor, root, dispose() { modelChange.dispose(); disposed.dispose(); captured.delete(item); pending.delete(editor); for (const [id, zone] of zones) if (zone.editor === editor) removeZone(id); } };
    const disposed = editor.onDidDispose(() => item.dispose());
    captured.add(item); schedule();
  }
  function attach(value: unknown) {
    const api = value as MonacoNamespace;
    if (typeof api.onDidCreateEditor !== 'function' || typeof api.getModels !== 'function') return;
    // Older ADO Monaco fires during construction, before its DOM node exists.
    namespace = api; api.onDidCreateEditor(editor => queueMicrotask(() => capture(editor)));
    if (typeof api.getEditors === 'function') for (const editor of api.getEditors()) capture(editor);
    schedule();
  }
  const object = (value: unknown): value is object => typeof value === 'object' && value !== null;
  whenAssigned(window, 'monaco', object, value => {
    whenAssigned(value as object, 'editor', object, editor => {
      if (typeof Reflect.get(editor as object, 'onDidCreateEditor') === 'function') attach(editor);
      else whenAssigned(editor as object, 'onDidCreateEditor', value => typeof value === 'function', () => attach(editor));
    });
  });
  const observer = new MutationObserver(schedule);
  function rememberNativeRange(event: Event) {
    if (!parsePrRoute(location.href) || !(event.target instanceof Element)) return;
    if (event.type === 'click' && event instanceof MouseEvent && event.detail !== 0) return;
    const button = event.target.closest('[widgetid$=":AddCommentGutterWidget"] button.repos-add-comment-button, [widgetid$=":AddCommentWidget"] button.repos-add-comment-button');
    const root = button?.closest<HTMLElement>('.monaco-editor');
    const editor = root && [...captured].find(item => item.root === root)?.editor;
    const model = editor?.getModel(), selection = editor?.getSelection();
    if (!root || !model || !selection || !validMonacoRange(selection)) return;
    openings.set(root, { uri: model.uri.toString(), range: { startLineNumber: selection.startLineNumber, startColumn: selection.startColumn, endLineNumber: selection.endLineNumber, endColumn: selection.endColumn } });
  }
  document.addEventListener('pointerdown', rememberNativeRange, true);
  document.addEventListener('click', rememberNativeRange, true);
  observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-uri'] });
  window.addEventListener('popstate', schedule);
  window.addEventListener('pagehide', () => {
    clear(); observer.disconnect();
    document.removeEventListener('pointerdown', rememberNativeRange, true);
    document.removeEventListener('click', rememberNativeRange, true);
    for (const item of [...captured]) item.dispose();
  }, { once: true });

  async function open(scope: Scope, anchor: Anchor) {
    const match = matchingEditor(scope, anchor);
    const range = rangeOf(anchor);
    if (!match || !range) throw new Error(t('Open the original Monaco file version first. The exact range is not available here.', 'Open eerst de oorspronkelijke Monaco-bestandsversie. De exacte range is hier niet beschikbaar.'));
    pending.set(match.editor, anchor);
    let selection = range;
    // A collapsed gutter anchor has no selection widget. Select its line only
    // to open the native editor; pending retains the draft's exact coordinates.
    if (range.startLineNumber === range.endLineNumber && range.startColumn === range.endColumn) {
      const model = match.editor.getModel()!;
      const line = range.startLineNumber, endColumn = model.getLineMaxColumn(line);
      if (endColumn > 1) selection = { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn };
      else if (line < model.getLineCount()) selection = { ...range, endLineNumber: line + 1, endColumn: 1 };
      else if (line > 1) selection = { ...range, startLineNumber: line - 1, startColumn: model.getLineMaxColumn(line - 1) };
    }
    match.editor.setSelection(selection); match.editor.revealRangeInCenter(selection); match.editor.focus();
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    let clicked = false;
    const wait = new MutationObserver(find);
    const timer = setTimeout(() => { wait.disconnect(); pending.delete(match.editor); reject(new Error(t('The native comment editor did not become available.', 'De native commenteditor werd niet beschikbaar.'))); }, 4000);
    function find() {
      if (!match!.root.isConnected || !parsePrRoute(location.href)) return;
      captureNativeEditors();
      const available = [...match!.root.querySelectorAll<HTMLTextAreaElement>(nativeSelector)].some(textarea => {
        const snapshot = snapshots.get(textarea);
        return snapshot?.range && equalMonacoRange(snapshot.range, range!);
      });
      if (available) { wait.disconnect(); clearTimeout(timer); resolve(); return; }
      if (clicked) return;
      const label = anchor.side === 'right' ? 'Modified' : 'Original';
      for (const widget of ['AddCommentWidget', 'AddCommentGutterWidget']) {
        const buttons = [...match!.root.querySelectorAll<HTMLButtonElement>(`[widgetid$="${label}:${widget}"] button.repos-add-comment-button`)]
          .filter(button => {
            const rect = button.getBoundingClientRect();
            return !button.disabled && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && getComputedStyle(button).visibility === 'visible';
          });
        if (buttons.length !== 1) continue;
        clicked = true; buttons[0]!.click(); return;
      }
    }
    wait.observe(match.root, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'disabled', 'hidden'] });
    find(); await promise;
  }
  window.__threadholdMonaco = {
    async execute(command: MonacoCommand) {
      const scope = command.action === 'open' ? command.scope : command.context.scope;
      guard(scope);
      if (command.action === 'open') { await open(scope, command.anchor); return; }
      activeContext = command.context;
      if (command.action === 'read') return bindings(command.context);
      desiredSlots = command.slots; reconcile();
    },
  };
}
