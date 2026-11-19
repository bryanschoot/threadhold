import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { scopeKey, type Draft, type DraftRequest, type DraftResult, type ExtensionResponse, type PrRoute } from '../src/contracts';
import { findPublication, isStale, loadPrContext, readThreads, type PrContext, type RemoteThread } from '../src/ado-context';
import { parsePrRoute } from '../src/routes';
import { discoverEditors, findDraftLocation, installNativeDiffCapture, openDraftEditor, readEditor, sameEditor, writeEditor, type NativeEditor } from '../src/ado-editor';
import { createActionNotice, createDraftCard, createDraftHelp, createPublishControl, createSaveControl, type ActionNotice, type DraftUiActions, type SaveControl } from '../src/ui';
import { postDraft } from '../src/ado-publish';
import { readMonacoBindings, syncMonacoDraftSlots, type MonacoBinding } from '../src/monaco-client';
import { t } from '../src/i18n';
import '../src/content.css';

type EditorState = { editor: NativeEditor; controls: SaveControl; draft?: Draft; requestId: string; editing: boolean; dispose(): void };
type Reattach = { draft: Draft; scope: string; generation: number; notice: ActionNotice; committing: boolean };

export default defineContentScript({
  matches: ['https://dev.azure.com/*', 'https://*.visualstudio.com/*'],
  registration: 'runtime',
  main(ctx) {
    const disposeNativeDiffCapture = installNativeDiffCapture();
    let context: PrContext | undefined;
    let threads: RemoteThread[] = [];
    let drafts: Draft[] = [];
    let routeKey = '';
    let generation = 0;
    let refreshing: number | undefined;
    let publishControl: HTMLButtonElement | undefined;
    let draftHelp: ReturnType<typeof createDraftHelp> | undefined;
    let batchPublishing = false;
    let notice: HTMLElement | undefined;
    let routeNotice: ActionNotice | undefined;
    const editors = new Map<HTMLTextAreaElement, EditorState>();
    const cards = new Map<string, HTMLElement>();
    let disposed = false;
    let reanchor: Reattach | undefined;
    let monacoBindings: MonacoBinding[] = [];
    let monacoSignature = '';
    let monacoPending = false;
    function onRoute(version: number): boolean {
      return !disposed && version === generation && routeKey === location.origin + location.pathname;
    }
    function mountActionNotices() {
      if (!routeNotice && !reanchor) return;
      const page = document.querySelector('.repos-pr-details-page');
      const parent = page?.querySelector('.page-content') ?? page;
      if (!parent) return;
      if (routeNotice && routeNotice.element.parentElement !== parent) parent.prepend(routeNotice.element);
      if (reanchor && reanchor.notice.element.parentElement !== parent) parent.prepend(reanchor.notice.element);
    }
    function show(message: string, error = false) {
      const page = document.querySelector('.repos-pr-details-page');
      if (!page) return;
      if (!notice?.isConnected) {
        notice = document.createElement('p'); notice.className = 'th-save';
        notice.dataset.threadholdStatus = '';
        notice.tabIndex = -1;
        notice.setAttribute('aria-atomic', 'true');
        (page.querySelector('.page-content') ?? page).prepend(notice);
      }
      notice.setAttribute('role', error ? 'alert' : 'status');
      notice.setAttribute('aria-live', error ? 'assertive' : 'polite');
      notice.textContent = `Threadhold: ${message}`;
      notice.dataset.error = String(error);
      return notice;
    }
    async function request(command: DraftRequest): Promise<DraftResult> {
      const response: ExtensionResponse = await browser.runtime.sendMessage({ channel: 'threadhold', request: command });
      if (!response?.ok) throw new Error(response?.error.message ?? t('Local extension storage is unavailable. Your editor text has not been changed.', 'De lokale extensieopslag is niet bereikbaar. Je editortekst is niet gewijzigd.'));
      return response.result;
    }
    async function current(): Promise<PrContext> {
      const active = context;
      const version = generation;
      if (!active || !onRoute(version)) throw new Error(t('No recognized PR context.', 'Geen herkende PR-context.'));
      const fresh = await loadPrContext(active.scope.route);
      if (!onRoute(version)) throw new Error(t('The PR context changed.', 'De PR-context is gewijzigd.'));
      if (scopeKey(active.scope) !== scopeKey(fresh.scope)) {
        const error = new Error(t('The Azure DevOps account or PR context changed.', 'Het Azure DevOps-account of de PR-context is gewijzigd.'));
        const nextVersion = ++generation;
        reset();
        routeFailed(active.scope.route, nextVersion, error);
        throw error;
      }
      context = fresh;
      return fresh;
    }
    function reset() {
      for (const state of editors.values()) state.dispose();
      editors.clear();
      for (const card of cards.values()) card.remove();
      cards.clear(); publishControl?.remove(); publishControl = undefined; notice?.remove(); notice = undefined;
      draftHelp?.dispose(); draftHelp = undefined;
      routeNotice?.element.remove(); routeNotice = undefined;
      reanchor?.notice.element.remove(); reanchor = undefined;
      drafts = []; context = undefined; threads = [];
      monacoBindings = []; monacoSignature = '';
    }
    async function listDrafts(active: PrContext): Promise<Draft[]> {
      const result = await request({ action: 'list', scope: active.scope });
      if (!('drafts' in result)) throw new Error(t('Draft list unavailable.', 'Draftlijst niet beschikbaar.'));
      return result.drafts;
    }
    async function refresh() {
      if (!context || !onRoute(generation) || refreshing === generation) return;
      const version = generation;
      refreshing = version;
      const active = context;
      try {
        const listed = await listDrafts(active);
        if (!onRoute(version)) return;
        drafts = listed;
        for (const state of editors.values()) {
          if (!state.draft) continue;
          const saved = drafts.find(draft => draft.id === state.draft!.id);
          // Do not adopt a newer revision over local edits; CAS must surface the conflict.
          if (!saved) { finishEditing(state, false); }
        }
        render();
        scheduleMonaco();
      } catch (error) { if (onRoute(version)) show(String(error), true); }
      finally { if (refreshing === version) refreshing = undefined; }
    }
    const actions: DraftUiActions = {
      async edit(draft) {
        const fresh = await current();
        threads = await readThreads(fresh);
        if (draft.state !== 'saved' || isStale(draft, fresh, threads)) throw new Error(t('This draft cannot be safely attached to its original location.', 'Deze draft kan niet veilig aan de oorspronkelijke locatie worden gekoppeld.'));
        const editor = await openDraftEditor(draft, fresh, threads);
        if (editor.textarea.closest('.monaco-editor')) monacoBindings = await readMonacoBindings(fresh);
        const text = readEditor(editor);
        if (text.trim() && text !== draft.body) throw new Error(t('The native editor contains different text. Save or remove that text yourself first.', 'De native editor bevat andere tekst. Bewaar of verwijder die tekst eerst zelf.'));
        mountEditors();
        const state = editors.get(editor.textarea);
        if (!state) throw new Error(t('This native editor is not recognized.', 'Deze native editor wordt niet herkend.'));
        state.draft = draft; state.controls.setBinding(draft);
        state.editing = true; state.controls.setEditing(true);
        editor.root.classList.add('th-draft-editing');
        editor.publish.classList.add('th-native-publish-hidden');
        editor.secondaryPublish?.classList.add('th-native-publish-hidden');
        const card = cards.get(draft.id);
        if (card) card.hidden = true;
        writeEditor(editor, draft.body);
        editor.root.scrollIntoView({ block: 'center' });
      },
      async remove(draft) {
        const fresh = await current();
        await request({ action: 'delete', scope: fresh.scope, id: draft.id, ifRevision: draft.revision });
        await refresh();
        show(t('Draft deleted locally. Azure DevOps comments have not been changed.', 'Draft lokaal verwijderd. Azure DevOps-comments zijn niet gewijzigd.'));
      },
      async locate(draft) {
        await current();
        const card = cards.get(draft.id);
        if (card?.isConnected) { card.scrollIntoView({ block: 'center' }); card.tabIndex = -1; card.focus(); return; }
        const url = new URL(draft.anchor.pageUrl);
        url.searchParams.delete('discussionId');
        if (draft.anchor.kind === 'reply') url.searchParams.set('discussionId', String(draft.anchor.threadId));
        // Location is always a validated same-PR URL from the extension store.
        location.assign(url.href);
      },
      async check(draft) {
        const fresh = await current();
        threads = await readThreads(fresh);
        const found = findPublication(draft, threads, fresh.user);
        if (!found) throw new Error(t('No unique new comment with this exact author, content, and location was confirmed. The draft is retained; check for duplicates before publishing again.', 'Geen unieke nieuwe comment met exact deze auteur, inhoud en locatie bevestigd. Draft blijft behouden; publiceer niet opnieuw zonder controle op duplicaten.'));
        await request({ action: 'finishSubmit', scope: fresh.scope, id: draft.id, ifRevision: draft.revision, outcome: 'published', remoteThreadId: found.threadId, remoteCommentId: found.commentId });
        await refresh();
        show(t('Publication confirmed; local draft removed.', 'Publicatie bevestigd; lokale draft opgeruimd.'));
      },
      reanchor(draft) {
        const version = generation;
        const scope = scopeKey(draft.scope);
        if (!context || !onRoute(version) || scope !== scopeKey(context.scope)) throw new Error(t('The PR context changed.', 'De PR-context is gewijzigd.'));
        if (reanchor?.committing) throw new Error(t('A new draft location is already being saved.', 'Er wordt al een nieuwe draftlocatie opgeslagen.'));
        const reattachNotice = createActionNotice(t('Cancel reattach', 'Koppelen annuleren'), 'cancel-reanchor', () => {
          if (!isReattaching(selection) || selection.committing) return;
          setReattach();
          const status = show(t('Reattach cancelled. The draft and editor text are unchanged.', 'Koppelen geannuleerd. Draft en editortekst zijn ongewijzigd.'));
          const origin = cards.get(draft.id)?.querySelector<HTMLButtonElement>('[data-threadhold-action="reanchor"]');
          (origin ?? status)?.focus();
        });
        const selection: Reattach = { draft, scope, generation: version, notice: reattachNotice, committing: false };
        setReattach(selection);
        reattachNotice.report(t('Open the correct native comment location and choose Reattach draft here. The original draft is retained until the new location is confirmed.', 'Open de juiste native commentlocatie en kies Draft hier koppelen. De oorspronkelijke draft blijft bewaard tot de nieuwe locatie is bevestigd.'));
      },
      async reset(draft) {
        const fresh = await current();
        if (!window.confirm(t('This comment may already have been published. Check Azure DevOps first: publishing again may create a duplicate. Edit again anyway?', 'Deze comment kan al gepubliceerd zijn. Controleer Azure DevOps eerst: opnieuw publiceren kan een duplicaat maken. Toch opnieuw bewerken?'))) throw new Error(t('Draft retained unchanged.', 'Draft ongewijzigd behouden.'));
        await request({ action: 'finishSubmit', scope: fresh.scope, id: draft.id, ifRevision: draft.revision, outcome: 'failed' });
        await refresh();
      },
    };
    function headerActionAnchor(): HTMLElement | undefined {
      const page = document.querySelector('.repos-pr-details-page');
      const vote = page?.querySelector<HTMLElement>('.repos-pr-header-vote-button');
      if (vote) return vote.closest<HTMLElement>('.bolt-split-button') ?? vote;
      const publish = [...(page?.querySelectorAll<HTMLButtonElement>('button:not([data-threadhold-action])') ?? [])].find(button =>
        !button.closest('.repos-comment-editor-fit,.repos-discussion-thread,.activity-feed-list') &&
        /^(publish|publiceren)$/i.test(button.getAttribute('aria-label')?.trim() || button.textContent?.trim() || ''));
      return publish?.closest<HTMLElement>('.bolt-split-button') ?? publish;
    }
    function render() {
      if (!context) return;
      publishControl?.remove();
      publishControl = createPublishControl(drafts, async () => {
        try { await publishAll(); }
        catch (error) { show(String(error), true); throw error; }
      });
      publishControl.disabled ||= batchPublishing;
      headerActionAnchor()?.after(publishControl);
      draftHelp ??= createDraftHelp();
      if (publishControl.isConnected) publishControl.after(draftHelp.button);
      for (const card of cards.values()) card.remove();
      cards.clear();
      const feed = document.querySelector<HTMLElement>('.activity-feed-list');
      for (const draft of drafts) {
        const stale = isStale(draft, context, threads);
        const slot = stale && draft.anchor.kind === 'inline' ? undefined : findDraftLocation(draft, threads);
        // Unmounted or stale file drafts remain readable among overview comments, never in a separate tab.
        const parent = slot?.parent ?? feed;
        if (!parent) continue;
        const card = createDraftCard(draft, context.user.displayName, stale, actions);
        card.hidden = Array.from(editors.values()).some(state => state.editing && state.draft?.id === draft.id);
        if (!slot) {
          card.dataset.threadholdRecovery = '';
          const location = document.createElement('p');
          location.className = 'th-location';
          location.textContent = draft.anchor.filePath ?? (draft.anchor.kind === 'reply' ? t(`Reply in thread ${draft.anchor.threadId}`, `Antwoord in discussie ${draft.anchor.threadId}`) : t('General comment', 'Algemene opmerking'));
          card.querySelector('.th-comment-content')?.prepend(location);
        }
        parent.insertBefore(card, slot?.before ?? null);
        cards.set(draft.id, card);
      }
    }
    async function publishAll() {
      if (batchPublishing) throw new Error(t('Publication is already in progress.', 'Er loopt al een publicatie.'));
      const fresh = await current();
      threads = await readThreads(fresh);
      const listed = await request({ action: 'list', scope: fresh.scope });
      if (!('drafts' in listed)) throw new Error(t('Draft list unavailable.', 'Draftlijst niet beschikbaar.'));
      const selected = listed.drafts;
      if (!selected.length) return;
      if (selected.some(draft => draft.state !== 'saved' || isStale(draft, fresh, threads))) throw new Error(t('First check drafts with an uncertain publication status or changed location. Nothing has been posted.', 'Controleer eerst drafts met een onbekende publicatiestatus of gewijzigde locatie. Er is niets geplaatst.'));
      for (const state of editors.values()) {
        if (state.draft && readEditor(state.editor) !== state.draft.body) throw new Error(t('Save your changed editor text as a draft first. Nothing has been posted.', 'Sla eerst je gewijzigde editortekst op als draft. Er is niets geplaatst.'));
      }
      if (!window.confirm(t(`Publish ${selected.length} draft(s) now as visible Azure DevOps comments? This does not approve the PR or resolve threads.`, `${selected.length} draft(s) nu plaatsen als zichtbare Azure DevOps-comments? Dit keurt de PR niet goed en lost discussies niet op.`))) return;
      batchPublishing = true;
      render();
      let completed = 0;
      try {
        for (const draft of selected) {
          const active = await current();
          threads = await readThreads(active);
          if (isStale(draft, active, threads)) throw new Error(t('The original location has changed. Remaining drafts have been retained.', 'De oorspronkelijke locatie is gewijzigd. Resterende drafts zijn behouden.'));
          const result = await request({ action: 'beginSubmit', scope: active.scope, id: draft.id, ifRevision: draft.revision, body: draft.body, knownCommentIds: threads.flatMap(thread => thread.comments.map(comment => `${thread.id}:${comment.id}`)) });
          if (!('draft' in result)) throw new Error(t('No durable publication journal; nothing has been published.', 'Geen duurzaam publicatiejournal; er is niet gepubliceerd.'));
          const journal = result.draft;
          try {
            await postDraft(journal, active, threads);
            const deadline = Date.now() + 12_000;
            let found: { threadId: number; commentId: number } | undefined;
            do {
              threads = await readThreads(active);
              found = findPublication(journal, threads, active.user);
              if (found || disposed) break;
              const wait = Promise.withResolvers<void>();
              ctx.setTimeout(wait.resolve, 700);
              await wait.promise;
            } while (Date.now() < deadline);
            await request({ action: 'finishSubmit', scope: active.scope, id: journal.id, ifRevision: journal.revision, outcome: found ? 'published' : 'unknown', remoteThreadId: found?.threadId, remoteCommentId: found?.commentId });
            if (!found) throw new Error(t('Publication could not be uniquely confirmed. Check the thread; remaining drafts have not been posted.', 'Publicatie niet uniek bevestigd. Controleer de discussie; overige drafts zijn niet geplaatst.'));
            completed++;
          } catch (error) {
            try { await request({ action: 'finishSubmit', scope: active.scope, id: journal.id, ifRevision: journal.revision, outcome: 'unknown' }); }
            catch { /* Already reconciled, or the durable sending snapshot will recover as unknown. */ }
            throw error;
          }
        }
        show(t(`${completed} draft(s) posted. Refresh the PR to see the server comments in DevOps.`, `${completed} draft(s) geplaatst. Ververs de PR om de servercomments in DevOps te zien.`));
      } catch (error) {
        show(t(`${completed} draft(s) confirmed. ${String(error)} No automatic retry.`, `${completed} draft(s) bevestigd. ${String(error)} Geen automatische herhaling.`), true);
        throw error;
      } finally {
        batchPublishing = false;
        await refresh();
      }
    }
    function finishEditing(state: EditorState, collapse: boolean) {
      state.editing = false;
      state.editor.root.classList.remove('th-draft-editing');
      state.draft = undefined;
      state.requestId = crypto.randomUUID();
      state.controls.setEditing(false);
      state.controls.setBinding();
      state.editor.publish.classList.remove('th-native-publish-hidden');
      state.editor.secondaryPublish?.classList.remove('th-native-publish-hidden');
      if (collapse) state.editor.cancel?.click();
    }
    function isReattaching(selection: Reattach): boolean {
      return reanchor === selection && onRoute(selection.generation) && !!context && scopeKey(context.scope) === selection.scope;
    }
    function bindReattach(state: EditorState) {
      const selection = reanchor;
      state.controls.setReattach(selection && (() => confirmReattach(selection, state)));
    }
    function setReattach(selection?: Reattach) {
      reanchor?.notice.element.remove();
      reanchor = selection;
      for (const state of editors.values()) bindReattach(state);
      mountActionNotices();
    }
    function validateAnchor(editor: NativeEditor, fresh: PrContext, activeThreads: RemoteThread[]) {
      if (editor.anchor.kind === 'inline' && (editor.anchor.sourceCommit !== fresh.sourceCommit || editor.anchor.targetCommit !== fresh.targetCommit)) throw new Error(t('The code changed since the editor was opened. Refresh the diff first; your text is retained.', 'De code veranderde sinds het openen van de editor. Ververs eerst de diff; je tekst blijft behouden.'));
      if (editor.anchor.kind === 'reply' && !activeThreads.some(thread => thread.id === editor.anchor.threadId && !thread.isDeleted)) throw new Error(t('The original thread no longer exists.', 'De oorspronkelijke thread bestaat niet meer.'));
    }
    async function confirmReattach(selection: Reattach, state: EditorState) {
      if (!isReattaching(selection)) return;
      const editor = state.editor;
      const fresh = await current();
      if (!isReattaching(selection) || scopeKey(fresh.scope) !== selection.scope) return;
      const loadedThreads = await readThreads(fresh);
      if (!isReattaching(selection)) return;
      if (selection.committing) throw new Error(t('A new draft location is already being saved.', 'Er wordt al een nieuwe draftlocatie opgeslagen.'));
      if (!editor.textarea.isConnected || editors.get(editor.textarea) !== state) throw new Error(t('The editor is no longer available.', 'De editor is niet meer beschikbaar.'));
      validateAnchor(editor, fresh, loadedThreads);
      const { draft } = selection;
      const text = readEditor(editor);
      if (text.trim() && text !== draft.body) throw new Error(t('This editor contains different text. Save or remove that text yourself first.', 'Deze editor bevat andere tekst. Bewaar of verwijder die eerst zelf.'));

      // Cancellation is safe until the local storage write is dispatched.
      selection.committing = true;
      selection.notice.button.disabled = true;
      try {
        const result = await request({ action: 'update', scope: fresh.scope, id: draft.id, ifRevision: draft.revision, body: draft.body, anchor: { ...editor.anchor, sourceCommit: fresh.sourceCommit, targetCommit: fresh.targetCommit } });
        if (!isReattaching(selection)) return;
        if (!('draft' in result)) throw new Error(t('No durable storage confirmation.', 'Geen duurzame opslagbevestiging.'));
        threads = loadedThreads;
        setReattach();
        if (editor.textarea.isConnected && editors.get(editor.textarea) === state) {
          state.draft = result.draft;
          state.controls.setBinding(result.draft);
          // The user may have typed while the storage write was pending.
          if (readEditor(editor) === text) writeEditor(editor, result.draft.body);
          state.controls.report(t('New native location confirmed; draft ID retained.', 'Nieuwe native locatie bevestigd; draft-ID behouden.'));
        }
        await refresh();
      } finally {
        if (isReattaching(selection)) {
          selection.committing = false;
          selection.notice.button.disabled = false;
        }
      }
    }
    function mountEditors() {
      if (!context) return;
      for (const [element, state] of editors) if (!element.isConnected) { state.dispose(); editors.delete(element); }
      for (const editor of discoverEditors(context, threads, monacoBindings)) {
        const existing = editors.get(editor.textarea);
        if (existing && sameEditor(existing.editor.anchor, editor.anchor)) {
          existing.editor = editor;
          if (existing.controls.element.parentElement !== editor.actions) editor.actions.prepend(existing.controls.element);
          if (existing.editing) {
            editor.publish.classList.add('th-native-publish-hidden');
            editor.secondaryPublish?.classList.add('th-native-publish-hidden');
          }
          continue;
        }
        if (existing) { existing.dispose(); editors.delete(editor.textarea); }
        const controls = createSaveControl(async () => {
          const fresh = await current();
          threads = await readThreads(fresh);
          validateAnchor(editor, fresh, threads);
          if (state.draft && isStale(state.draft, fresh, threads)) throw new Error(t('Location is outdated. Draft text is retained; explicitly choose a new native location.', 'Locatie verouderd. Drafttekst blijft bewaard; kies expliciet een nieuwe native locatie.'));
          if (!editor.textarea.isConnected) throw new Error(t('The editor is no longer available.', 'De editor is niet meer beschikbaar.'));
          const body = readEditor(editor);
          const result = state.draft
            ? await request({ action: 'update', scope: fresh.scope, id: state.draft.id, ifRevision: state.draft.revision, body })
            : await request({ action: 'create', scope: fresh.scope, anchor: { ...editor.anchor, sourceCommit: fresh.sourceCommit, targetCommit: fresh.targetCommit }, body, requestId: state.requestId });
          if (!('draft' in result)) throw new Error(t('No durable storage confirmation received.', 'Geen duurzame opslagbevestiging ontvangen.'));
          state.draft = result.draft; controls.setBinding(result.draft);
          controls.report(t('Saved', 'Opgeslagen'));
          finishEditing(state, true);
          await refresh();
          show(t(`Draft saved locally · revision ${result.draft.revision}.`, `Draft lokaal opgeslagen · revisie ${result.draft.revision}.`));
        });
        const state: EditorState = { editor, controls, requestId: crypto.randomUUID(), editing: false, dispose() {
          editor.root.removeEventListener('click', onClick, true); editor.root.removeEventListener('keydown', onKey, true);
          state.editor.root.classList.remove('th-draft-editing');
          state.editor.publish.classList.remove('th-native-publish-hidden'); state.editor.secondaryPublish?.classList.remove('th-native-publish-hidden');
          controls.element.remove();
        } };
        function onClick(event: MouseEvent) {
          if (!(event.target instanceof Element)) return;
          const button = event.target.closest('button');
          if (button === state.editor.cancel && state.editing) {
            finishEditing(state, false);
            render();
            return;
          }
          if (!state.editing || (button !== state.editor.publish && button !== state.editor.secondaryPublish)) return;
          event.preventDefault(); event.stopImmediatePropagation();
          controls.button.click();
        }
        function onKey(event: KeyboardEvent) {
          if (!state.editing || event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
          event.preventDefault(); event.stopImmediatePropagation();
          controls.button.click();
        }
        editor.root.addEventListener('click', onClick, true); editor.root.addEventListener('keydown', onKey, true);
        editor.actions.prepend(controls.element); editors.set(editor.textarea, state);
        bindReattach(state);
      }
    }
    function scheduleMonaco() {
      if (!context || monacoPending || !document.querySelector('.monaco-editor[data-uri]')) return;
      const roots = Array.from(document.querySelectorAll('.monaco-editor[data-uri]'), root => root.getAttribute('data-uri'));
      const nativeEditors = Array.from(document.querySelectorAll('.repos-comment-editor-fit textarea[class*="threadId--"]:not([aria-hidden="true"]):not(.bolt-textfield-auto-adjust-hidden)'), textarea => textarea.id);
      const signature = JSON.stringify([scopeKey(context.scope), context.sourceCommit, context.targetCommit, roots, nativeEditors, drafts.map(draft => [draft.id, draft.revision])]);
      if (signature === monacoSignature) return;
      monacoSignature = signature;
      monacoPending = true;
      const active = context;
      const version = generation;
      void (async () => {
        try {
          await syncMonacoDraftSlots(active);
          if (!onRoute(version)) return;
          const bindings = await readMonacoBindings(active);
          if (!onRoute(version)) return;
          monacoBindings = bindings;
          mountEditors();
          render();
        } catch (error) {
          if (onRoute(version)) show(t(`The exact code comment location is unavailable: ${String(error)} Your text is retained.`, `De exacte codecommentlocatie is niet beschikbaar: ${String(error)} Je tekst blijft behouden.`), true);
        } finally {
          monacoPending = false;
          if (onRoute(generation)) scheduleMonaco();
        }
      })();
    }
    function routeFailed(route: PrRoute, version: number, error: unknown) {
      const retry = routeNotice ??= createActionNotice(t('Retry', 'Opnieuw proberen'), 'retry', () => {
        if (!onRoute(version)) return;
        retry.button.setAttribute('aria-disabled', 'true');
        retry.report(t('Reconnecting to this PR…', 'Opnieuw verbinden met deze PR…'));
        void integrate(route, version);
      });
      retry.button.removeAttribute('aria-disabled');
      mountActionNotices();
      retry.report(t(`Integration unavailable: ${String(error)} Editor text remains unchanged.`, `Integratie niet beschikbaar: ${String(error)} Editortekst blijft ongewijzigd.`), true);
    }
    async function integrate(route: PrRoute, version: number) {
      try {
        const fresh = await loadPrContext(route);
        if (!onRoute(version)) return;
        const loadedThreads = await readThreads(fresh);
        if (!onRoute(version)) return;
        const listed = await listDrafts(fresh);
        if (!onRoute(version)) return;
        context = fresh; threads = loadedThreads; drafts = listed;
        render();
        mountEditors();
        scheduleMonaco();
        if (routeNotice) {
          const focused = document.activeElement === routeNotice.button;
          routeNotice.element.remove(); routeNotice = undefined;
          const status = show(t('Draft integration restored.', 'Draftintegratie hersteld.'));
          if (focused) status?.focus();
        }
      } catch (error) {
        if (onRoute(version)) routeFailed(route, version, error);
      }
    }
    function routeChanged() {
      const route = parsePrRoute(location.href);
      const key = route?.prUrl ?? '';
      if (disposed || key === routeKey) return;
      routeKey = key;
      const version = ++generation;
      reset();
      if (route) void integrate(route, version);
    }
    let scheduled = false;
    const observer = new MutationObserver((records) => {
      if (scheduled || records.every(record => record.target instanceof Element && record.target.closest('.th-card,.th-save,.th-publish,.th-help,.th-help-button'))) return;
      scheduled = true;
      ctx.requestAnimationFrame(() => {
        scheduled = false;
        mountActionNotices();
        mountEditors();
        scheduleMonaco();
        if (context && (((!publishControl?.isConnected || !draftHelp?.button.isConnected) && headerActionAnchor()) || drafts.some(draft => !cards.get(draft.id)?.isConnected && (findDraftLocation(draft, threads) || document.querySelector('.activity-feed-list'))))) render();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    function refreshCurrent() {
      const version = generation;
      if (!context || !onRoute(version)) return;
      void current().then(() => { if (onRoute(version)) return refresh(); }).catch(error => { if (onRoute(version)) show(String(error), true); });
    }
    ctx.addEventListener(window.navigation, 'currententrychange', routeChanged);
    ctx.addEventListener(window, 'focus', refreshCurrent);
    ctx.addEventListener(document, 'visibilitychange', () => { if (!document.hidden) refreshCurrent(); });
    ctx.onInvalidated(() => { disposed = true; generation++; observer.disconnect(); disposeNativeDiffCapture(); reset(); });
    routeChanged();
  },
});
