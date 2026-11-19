import type { Draft } from './contracts';
import { t } from './i18n';
import { renderMarkdown } from './markdown';

export interface DraftUiActions {
  edit(draft: Draft): void | Promise<void>;
  remove(draft: Draft): void | Promise<void>;
  locate(draft: Draft): void | Promise<void>;
  check(draft: Draft): void | Promise<void>;
  reanchor(draft: Draft): void | Promise<void>;
  reset(draft: Draft): void | Promise<void>;
}

type Action = 'save' | 'edit' | 'delete' | 'locate' | 'check' | 'reanchor' | 'reset' | 'help' | 'retry' | 'cancel-reanchor';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function bindDraft(node: HTMLElement, draft?: Draft): void {
  if (draft) {
    node.dataset.threadholdDraftId = draft.id;
    node.dataset.threadholdRevision = String(draft.revision);
  } else {
    delete node.dataset.threadholdDraftId;
    delete node.dataset.threadholdRevision;
  }
}

function actionButton(label: string, action: Action, draft?: Draft): HTMLButtonElement {
  const button = element('button', 'th-button bolt-button enabled bolt-focus-treatment', label);
  button.type = 'button';
  button.dataset.threadholdAction = action;
  bindDraft(button, draft);
  return button;
}

function liveStatus(): HTMLElement {
  const status = element('p', 'th-status');
  status.dataset.threadholdStatus = '';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  return status;
}

function report(status: HTMLElement, message: string, error = false): void {
  status.classList.toggle('th-status-error', error);
  status.setAttribute('role', error ? 'alert' : 'status');
  status.setAttribute('aria-live', error ? 'assertive' : 'polite');
  status.textContent = message;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return t('The action failed. Please try again.', 'De actie is mislukt. Probeer het opnieuw.');
}

export interface ActionNotice {
  element: HTMLElement;
  button: HTMLButtonElement;
  report(message: string, error?: boolean): void;
}

export function createActionNotice(label: string, action: 'retry' | 'cancel-reanchor', onClick: () => void): ActionNotice {
  const container = element('div', 'th-save');
  const status = liveStatus();
  const button = actionButton(label, action);
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!button.disabled && button.getAttribute('aria-disabled') !== 'true') onClick();
  });
  container.append(status, button);
  return { element: container, button, report: (message: string, error = false) => report(status, `Threadhold: ${message}`, error) };
}

function anchorDescription(draft: Draft): string {
  const anchor = draft.anchor;
  const parts = [anchor.kind === 'general' ? t('General comment', 'Algemene opmerking') : anchor.kind === 'reply' ? t('Reply', 'Antwoord') : t('File comment', 'Bestandsopmerking')];
  if (anchor.threadId !== undefined) parts.push(t(`Thread ${anchor.threadId}`, `Discussie ${anchor.threadId}`));
  if (anchor.filePath) parts.push(anchor.filePath);
  if (anchor.side) parts.push(anchor.side === 'left' ? t('Left side', 'Linkerkant') : t('Right side', 'Rechterkant'));
  if (anchor.start) {
    const start = `${anchor.start.line}:${anchor.start.offset}`;
    const end = anchor.end ? `${anchor.end.line}:${anchor.end.offset}` : start;
    parts.push(start === end ? t(`Line ${start}`, `Regel ${start}`) : t(`Lines ${start}–${end}`, `Regels ${start}–${end}`));
  }
  return parts.join(' · ');
}

function localState(draft: Draft): string {
  const state = draft.state === 'saved'
    ? t('Saved locally', 'Lokaal opgeslagen')
    : draft.state === 'sending'
      ? t('Checking publication', 'Publicatie wordt gecontroleerd')
      : t('Publication status unknown', 'Publicatiestatus onbekend');
  return t(`${state} · revision ${draft.revision}`, `${state} · revisie ${draft.revision}`);
}

function normalizedIdentity(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function imageIdentifiesUser(image: HTMLImageElement, userId: string): boolean {
  try {
    const url = new URL(image.currentSrc || image.src, document.baseURI);
    if (url.origin !== location.origin) return false;
    const identity = userId.toLowerCase();
    if (url.pathname.split('/').some(part => decodeURIComponent(part).toLowerCase() === identity)) return true;
    for (const [key, value] of url.searchParams) {
      const parameter = key.toLowerCase();
      if ((parameter === 'id' || parameter === 'userid' || parameter === 'identityid')
        && value.toLowerCase() === identity) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function authorPersona(author: string, userId: string): { avatar: HTMLElement; displayName: string } {
  const avatar = element('div', 'bolt-coin flex-noshrink repos-comment-header-persona size24');
  avatar.setAttribute('aria-hidden', 'true');
  const identity = normalizedIdentity(author);
  const candidates = document.querySelectorAll<HTMLElement>('.bolt-coin[aria-label], .ms-Persona[aria-label]');
  for (const coin of candidates) {
    if (coin.closest('[data-threadhold-card]')) continue;
    const label = coin.getAttribute('aria-label')?.trim() || '';
    const image = coin.querySelector('img');
    const identityNode = coin.closest<HTMLElement>('[data-user-id], [data-identity-id]');
    const nativeId = identityNode?.dataset.userId || identityNode?.dataset.identityId;
    if (nativeId && nativeId.toLowerCase() !== userId.toLowerCase()) continue;
    const matchesId = Boolean(userId) && (nativeId?.toLowerCase() === userId.toLowerCase()
      || Boolean(image && imageIdentifiesUser(image, userId)));
    // A name prefix is not identity proof: it can belong to another reviewer.
    if (!matchesId && (!identity || normalizedIdentity(label) !== identity)) continue;
    let displayName = label || author;
    const nativeComment = coin.closest('.repos-discussion-comment, .repos-discussion-thread-reply, .ms-Persona');
    const nativeName = nativeComment?.querySelector<HTMLElement>('.repos-discussion-comment-header .font-weight-semibold, .ms-Persona-primaryText')?.textContent?.trim();
    if (nativeName && (matchesId || normalizedIdentity(nativeName) === identity)) displayName = nativeName;
    if (image) {
      try {
        const url = new URL(image.currentSrc || image.src, document.baseURI);
        if (url.origin === location.origin && (url.protocol === 'https:' || url.protocol === 'http:')) {
          const copy = element('img', 'bolt-coin-content using-image size24');
          copy.src = url.href;
          copy.alt = '';
          avatar.append(copy);
          return { avatar, displayName };
        }
      } catch {
        // Invalid or cross-origin native images are not copied.
      }
    }
    avatar.classList.add('th-avatar-fallback');
    avatar.textContent = displayName.split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join('').toLocaleUpperCase() || '?';
    return { avatar, displayName };
  }
  avatar.classList.add('th-avatar-fallback');
  avatar.textContent = author.trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join('').toLocaleUpperCase() || '?';
  return { avatar, displayName: author };
}

function updateTimestamp(timestamp: HTMLTimeElement): void {
  const elapsed = Math.max(0, Date.now() - Date.parse(timestamp.dateTime));
  const minutes = Math.floor(elapsed / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const text = minutes < 1 ? t('Just now', 'Zojuist')
    : hours < 1 ? t(`${minutes}m ago`, `${minutes}m geleden`)
      : days < 1 ? t(`${hours}h ago`, `${hours}u geleden`)
        : t(`${days}d ago`, `${days}d geleden`);
  if (timestamp.textContent !== text) timestamp.textContent = text;
}

let timestampRefresh: number | undefined;

function scheduleTimestampRefresh(): void {
  if (timestampRefresh !== undefined) return;
  timestampRefresh = window.setTimeout(() => {
    timestampRefresh = undefined;
    const timestamps = document.querySelectorAll<HTMLTimeElement>('.th-card .th-timestamp');
    for (const timestamp of timestamps) updateTimestamp(timestamp);
    if (timestamps.length > 0) scheduleTimestampRefresh();
  }, 60_000);
}

function iconButton(label: string, action: 'edit' | 'delete', icon: 'Edit' | 'Delete', draft: Draft): HTMLButtonElement {
  const button = actionButton(label, action, draft);
  button.className = 'th-button bolt-button bolt-icon-button enabled subtle icon-only bolt-focus-treatment';
  button.textContent = '';
  button.setAttribute('aria-label', label);
  button.title = label;
  const wrapper = element('span', 'fluent-icons-enabled');
  const glyph = element('span', `left-icon flex-noshrink fabric-icon ms-Icon--${icon} medium`);
  glyph.setAttribute('aria-hidden', 'true');
  wrapper.append(glyph);
  button.append(wrapper);
  return button;
}

export function createDraftCard(draft: Draft, author: string, stale: boolean, actions: DraftUiActions): HTMLElement {
  const general = draft.anchor.kind === 'general';
  const card = element('article', general
    ? 'th-card th-card-general repos-comment-viewer bolt-card bolt-card-white depth-8 flex-column'
    : 'th-card repos-comment-viewer');
  card.dataset.threadholdCard = '';
  card.dataset.threadholdState = draft.state;
  bindDraft(card, draft);
  card.setAttribute('aria-label', t(`Draft by ${author}`, `Draft van ${author}`));
  const comment = element('div', general
    ? 'th-card-frame bolt-card-content repos-discussion-comment flex-column'
    : 'repos-discussion-comment flex-column');
  const row = element('div', 'th-comment-row flex-row');
  const { avatar, displayName: displayAuthor } = authorPersona(author, draft.scope.userId);
  card.setAttribute('aria-label', t(`Draft by ${displayAuthor}`, `Draft van ${displayAuthor}`));
  const content = element('div', 'th-comment-content repos-comment-editor-fit flex-column flex-grow scroll-hidden padding-left-8');
  const header = element('div', 'th-comment-header repos-discussion-comment-header flex-row flex-grow flex-center rhythm-horizontal-4 margin-bottom-8');
  const identity = element('div', 'th-author scroll-hidden flex-row flex-center');
  identity.append(element('span', 'font-weight-semibold padding-right-8 text-ellipsis', displayAuthor));
  const timestamp = element('time', 'th-timestamp body-s secondary-text margin-right-4 bolt-time-item white-space-nowrap');
  timestamp.dateTime = draft.updatedAt;
  timestamp.title = new Date(draft.updatedAt).toLocaleString(globalThis.navigator?.language);
  updateTimestamp(timestamp);
  scheduleTimestampRefresh();
  const badge = element('span', 'th-badge', t('Draft', 'Draft'));
  badge.title = t('Saved locally · only visible to you', 'Lokaal opgeslagen · alleen voor jou');
  const toolbar = element('div', 'th-toolbar flex-row flex-noshrink justify-end flex-center');
  toolbar.setAttribute('role', 'group');
  toolbar.setAttribute('aria-label', t('Draft actions', 'Draftacties'));
  header.append(identity, timestamp, badge, toolbar);
  const body = element('div', 'th-body markdown-content markdown-editor-preview repos-comment-editor-max-width markdown-preview-checkbox-indent');
  body.append(renderMarkdown(draft.body));
  const recovery = element('div', 'th-actions');
  const edit = iconButton(t('Edit', 'Bewerken'), 'edit', 'Edit', draft);
  const remove = iconButton(t('Delete draft', 'Draft verwijderen'), 'delete', 'Delete', draft);
  const locate = actionButton(t('Open location', 'Locatie openen'), 'locate', draft);
  const check = actionButton(t('Check publication', 'Publicatie controleren'), 'check', draft);
  const reanchor = actionButton(t('Reattach', 'Opnieuw koppelen'), 'reanchor', draft);
  const reset = actionButton(t('Edit again', 'Opnieuw bewerken'), 'reset', draft);
  const editBlocked = stale || draft.state !== 'saved';
  const reason = stale
    ? t('Editing is disabled: the code or location has changed. Open the location to view this draft.', 'Bewerken is uitgeschakeld: de code of locatie is gewijzigd. Open de locatie om deze draft te bekijken.')
    : draft.state !== 'saved'
      ? t('Editing is disabled until the publication status has been checked.', 'Bewerken is uitgeschakeld totdat de publicatiestatus is gecontroleerd.')
      : '';
  edit.disabled = editBlocked;
  if (reason) edit.title = reason;

  const confirmation = element('div', 'th-confirmation');
  confirmation.hidden = true;
  confirmation.setAttribute('role', 'group');
  confirmation.setAttribute('aria-label', t('Confirm deletion', 'Verwijderen bevestigen'));
  const prompt = element('p', 'th-confirmation-text', t('Permanently delete this local draft?', 'Deze lokale draft definitief verwijderen?'));
  const confirm = actionButton(t('Yes, delete draft', 'Ja, draft verwijderen'), 'delete', draft);
  confirm.classList.add('th-button-danger');
  const cancel = element('button', 'th-button bolt-button enabled bolt-focus-treatment', t('Cancel', 'Annuleren'));
  cancel.type = 'button';
  confirmation.append(prompt, confirm, cancel);
  const status = liveStatus();
  toolbar.append(edit, remove);
  if (stale || draft.state !== 'saved') recovery.append(locate);
  if (draft.state === 'unknown' || draft.state === 'sending') recovery.append(check);
  if (stale && draft.state === 'saved') recovery.append(reanchor);
  if (draft.state === 'unknown') recovery.append(reset);
  content.append(header, body);
  if (stale || draft.state !== 'saved') {
    content.append(element('p', 'th-location', anchorDescription(draft)), element('p', 'th-meta', localState(draft)));
  }
  if (reason) content.append(element('p', 'th-notice', reason));
  content.append(confirmation, status);
  if (recovery.childElementCount > 0) content.append(recovery);
  row.append(avatar, content);
  comment.append(row);
  card.append(comment);

  let pending = false;
  let deleted = false;
  const buttons = [edit, remove, locate, check, reanchor, reset, confirm, cancel];
  function updateButtons(): void {
    for (const button of buttons) button.disabled = pending || deleted || (button === edit && editBlocked);
    card.setAttribute('aria-busy', String(pending));
  }
  async function run(action: () => void | Promise<void>, success: string, deleting = false): Promise<void> {
    if (pending || deleted) return;
    pending = true;
    updateButtons();
    report(status, t('Please wait…', 'Even geduld…'));
    try {
      await action();
      if (deleting) {
        deleted = true;
        confirmation.hidden = true;
      }
      report(status, success);
    } catch (error) {
      report(status, errorMessage(error), true);
    } finally {
      pending = false;
      updateButtons();
    }
  }
  function onClick(button: HTMLButtonElement, action: () => void): void {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!button.disabled) action();
    });
  }
  onClick(edit, () => { void run(() => actions.edit(draft), t('Draft opened for editing.', 'Draft geopend om te bewerken.')); });
  onClick(locate, () => { void run(() => actions.locate(draft), t('Draft location opened.', 'Draftlocatie geopend.')); });
  onClick(check, () => { void run(() => actions.check(draft), t('Publication check completed.', 'Publicatiecontrole voltooid.')); });
  onClick(reanchor, () => { void run(() => actions.reanchor(draft), t('Choose the correct native editor and confirm the new location.', 'Kies de juiste native editor en bevestig de nieuwe locatie.')); });
  onClick(reset, () => { void run(() => actions.reset(draft), t('Draft can be edited again.', 'Draft kan opnieuw worden bewerkt.')); });
  onClick(remove, () => {
    confirmation.hidden = false;
    remove.setAttribute('aria-expanded', 'true');
    confirm.focus();
  });
  onClick(cancel, () => {
    confirmation.hidden = true;
    remove.setAttribute('aria-expanded', 'false');
    remove.focus();
  });
  onClick(confirm, () => { void run(() => actions.remove(draft), t('Draft deleted.', 'Draft verwijderd.'), true); });
  remove.setAttribute('aria-expanded', 'false');
  return card;
}

export function createPublishControl(drafts: Draft[], onPublish: () => void | Promise<void>): HTMLButtonElement {
  const button = element('button', 'th-publish bolt-button enabled bolt-focus-treatment');
  button.type = 'button';
  button.dataset.threadholdAction = 'publish';
  const label = drafts.length > 0 ? t(`Publish drafts (${drafts.length})`, `Drafts plaatsen (${drafts.length})`) : t('Publish drafts', 'Drafts plaatsen');
  const title = drafts.length > 0 ? t('Publish local drafts on this pull request', 'Lokale drafts op deze pull request plaatsen') : t('No local drafts to publish', 'Geen lokale drafts om te plaatsen');
  button.textContent = label;
  button.title = title;
  button.disabled = drafts.length === 0;
  button.setAttribute('aria-live', 'polite');
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (button.disabled) return;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = t('Publishing drafts…', 'Drafts plaatsen…');
    button.title = t('Drafts are being published…', 'Drafts worden geplaatst…');
    void (async () => {
      try {
        await onPublish();
        button.title = title;
        button.removeAttribute('aria-label');
      } catch (error) {
        const message = errorMessage(error);
        button.title = message;
        button.setAttribute('aria-label', `${label}: ${message}`);
      } finally {
        button.textContent = label;
        button.disabled = drafts.length === 0;
        button.setAttribute('aria-busy', 'false');
      }
    })();
  });
  return button;
}

export interface SaveControl {
  element: HTMLElement;
  button: HTMLButtonElement;
  setBinding(draft?: Draft): void;
  setEditing(editing: boolean): void;
  resetSave(): void;
  setReattach(action?: () => Promise<void>): void;
  report(message: string, error?: boolean): void;
}
export function createSaveControl(onSave: (isCurrent: () => boolean) => Promise<void>): SaveControl {
  const container = element('div', 'th-save');
  const button = actionButton(t('Save as draft', 'Opslaan als draft'), 'save');
  const status = liveStatus();
  container.append(button, status);
  let binding: Draft | undefined;
  let reattach: (() => Promise<void>) | undefined;
  let pending: { action: typeof onSave } | undefined;
  let editing = false;
  function update(): void {
    const blocked = binding !== undefined && binding.state !== 'saved';
    button.classList.toggle('primary', !reattach && editing && binding !== undefined);
    button.textContent = reattach ? t('Reattach draft here', 'Draft hier koppelen') : editing && binding ? t('Save', 'Opslaan') : binding ? t('Update draft', 'Draft bijwerken') : t('Save as draft', 'Opslaan als draft');
    button.title = blocked ? t('Editing is disabled until the publication status has been checked.', 'Bewerken is uitgeschakeld totdat de publicatiestatus is gecontroleerd.') : reattach ? button.textContent : t('Save locally as a draft · only visible to you', 'Lokaal opslaan als draft · alleen voor jou');
    button.disabled = !!pending || blocked;
    container.setAttribute('aria-busy', String(!!pending));
  }
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (button.disabled) return;
    const operation = { action: reattach ?? onSave };
    pending = operation;
    update();
    const waiting = reattach ? t('Checking the new location…', 'Nieuwe locatie wordt gecontroleerd…') : t('Saving draft…', 'Draft opslaan…');
    report(status, waiting);
    void (async () => {
      try {
        await operation.action();
        if (pending === operation && status.textContent === waiting) report(status, '');
      } catch (error) {
        if (pending === operation) report(status, errorMessage(error), true);
      } finally {
        if (pending === operation) {
          pending = undefined;
          update();
        }
      }
    })();
  });
  update();
  return {
    element: container,
    button,
    setBinding(draft) {
      binding = draft;
      bindDraft(container, draft);
      bindDraft(button, draft);
      update();
      if (draft && draft.state !== 'saved') report(status, button.title);
    },
    setEditing(value) {
      editing = value;
      update();
    },
    resetSave() {
      if (pending?.action === onSave) pending = undefined;
      if (!pending) {
        status.title = '';
        report(status, '');
      }
      update();
    },
    setReattach(action) {
      if (action === reattach) return;
      if (reattach) {
        if (pending?.action === reattach) pending = undefined;
        if (!pending) report(status, '');
      }
      reattach = action;
      update();
    },
    report(message, error = false) {
      const saved = !error && /\b(saved|opgeslagen)\b/i.test(message);
      status.title = saved ? message : '';
      report(status, saved ? t('Saved', 'Opgeslagen') : message, error);
    },
  };
}

export function createDraftHelp(): { button: HTMLButtonElement; dispose(): void } {
  const button = actionButton(t('Draft help', 'Drafthulp'), 'help');
  button.classList.add('th-help-button');
  button.setAttribute('aria-haspopup', 'dialog');
  const dialog = element('dialog', 'th-help');
  const title = element('h2', '', t('Draft help', 'Drafthulp'));
  title.id = 'threadhold-help-title';
  dialog.setAttribute('aria-labelledby', title.id);
  const intro = element('p', '', t(
    'Threadhold keeps drafts private in this browser profile, for the current account and pull request. Refreshing the page keeps saved drafts.',
    'Threadhold bewaart drafts privé in dit browserprofiel, voor het huidige account en de huidige pull request. Opgeslagen drafts blijven na verversen behouden.',
  ));
  const instruction = element('blockquote', '', t(
    'Agent instruction: create, read, edit and delete local drafts only. Publish drafts only when the user explicitly asks you to publish.',
    'Agentinstructie: maak, lees, bewerk en verwijder alleen lokale drafts. Publiceer drafts alleen wanneer de gebruiker expliciet om publicatie vraagt.',
  ));
  const steps = element('ol', '');
  const items = [
    t('Create: open a normal comment or reply editor, enter text and choose Save as draft. Wait for a Draft comment containing your text.', 'Maken: open een normale opmerking- of antwoordeditor, voer tekst in en kies Opslaan als draft. Wacht op een Draft-opmerking met je tekst.'),
    t('Read: find Draft comments among the existing comments, not in a separate tab. After refreshing, verify the same draft ID and text.', 'Lezen: zoek Draft-opmerkingen tussen de bestaande opmerkingen, niet in een apart tabblad. Controleer na verversen hetzelfde draft-ID en dezelfde tekst.'),
    t('Edit: choose the pencil on the draft, edit in the normal editor and choose Save. Verify the same draft ID, changed text and a higher revision. Cancel keeps the previous saved version.', 'Bewerken: kies het potlood bij de draft, wijzig de tekst in de normale editor en kies Opslaan. Controleer hetzelfde draft-ID, de gewijzigde tekst en een hogere revisie. Annuleren behoudt de vorige opgeslagen versie.'),
    t('Delete: choose the trash icon on the draft, then Yes, delete draft. Wait until that draft is absent. Existing Azure DevOps comments are unchanged.', 'Verwijderen: kies de prullenbak bij de draft en daarna Ja, draft verwijderen. Wacht totdat die draft verdwenen is. Bestaande Azure DevOps-opmerkingen blijven ongewijzigd.'),
  ];
  for (const item of items) steps.append(element('li', '', item));
  const safety = element('p', '', t(
    'In a new editor, Comment, Reply, Reply & resolve and Ctrl+Enter can publish immediately: use Save as draft instead. If draft controls are missing or publication status is unknown, stop and report it; do not fall back to publishing.',
    'In een nieuwe editor kunnen Comment, Reply, Reply & resolve en Ctrl+Enter direct publiceren: gebruik Opslaan als draft. Ontbreken draftknoppen of is de publicatiestatus onbekend, stop dan en meld dit; val niet terug op publiceren.',
  ));
  const details = element('details', '');
  details.append(element('summary', '', t('Browser-agent controls', 'Bediening voor browseragents')));
  const selectors = element('p', '', t(
    'Use accessible button names, or these stable DOM attributes. Scope edit/delete actions to the intended draft card. A click is not a storage confirmation: wait for the resulting card, revision or removal. Status messages use data-threadhold-status and role=status/alert; busy controls expose aria-busy.',
    'Gebruik toegankelijke knopnamen of deze stabiele DOM-attributen. Beperk bewerk- en verwijderacties tot de bedoelde draftkaart. Een klik is geen opslagbevestiging: wacht op de resulterende kaart, revisie of verwijdering. Statusmeldingen gebruiken data-threadhold-status en role=status/alert; bezette bediening gebruikt aria-busy.',
  ));
  const attributes = element('pre', '');
  attributes.textContent = '[data-threadhold-card]\n  data-threadhold-draft-id: stable ID\n  data-threadhold-revision: saved revision\n  data-threadhold-state: saved | sending | unknown\n  .th-body: rendered saved Markdown (edit in the native editor)\n[data-threadhold-action="save"]\n[data-threadhold-action="edit"]\n[data-threadhold-action="delete"]';
  const deletion = element('p', '', t(
    'Both the trash button and its initially hidden confirmation use the delete action. Choose the visible, named Delete draft button, then Yes, delete draft; do not click an unfiltered delete selector.',
    'De prullenbak en de aanvankelijk verborgen bevestiging gebruiken beide de delete-actie. Kies de zichtbare knop Draft verwijderen en daarna Ja, draft verwijderen; klik niet op een ongefilterde delete-selector.',
  ));
  const shortcut = element('p', '', t(
    'Ctrl+Enter saves locally only while editing an existing draft. Publish drafts opens a separate confirmation; this help is not authorization to publish.',
    'Ctrl+Enter slaat alleen lokaal op tijdens het bewerken van een bestaande draft. Drafts plaatsen opent een aparte bevestiging; deze hulp is geen toestemming om te publiceren.',
  ));
  details.append(selectors, attributes, deletion, shortcut);
  const close = element('button', 'bolt-button enabled bolt-focus-treatment', t('Close', 'Sluiten'));
  close.type = 'button';
  close.autofocus = true;
  close.addEventListener('click', () => dialog.close());
  button.addEventListener('click', () => { if (!dialog.open) dialog.showModal(); });
  dialog.append(title, intro, instruction, steps, safety, details, close);
  document.body.append(dialog);
  return { button, dispose() { dialog.close(); dialog.remove(); button.remove(); } };
}
