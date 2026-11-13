import type { Draft } from './contracts';
import { t } from './i18n';

export interface DraftUiActions {
  edit(draft: Draft): void | Promise<void>;
  remove(draft: Draft): void | Promise<void>;
  locate(draft: Draft): void | Promise<void>;
  check(draft: Draft): void | Promise<void>;
  reanchor(draft: Draft): void | Promise<void>;
  reset(draft: Draft): void | Promise<void>;
}

type Action = 'save' | 'edit' | 'delete' | 'locate' | 'check' | 'reanchor' | 'reset';

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

function authorAvatar(author: string): HTMLElement {
  const avatar = element('div', 'bolt-coin flex-noshrink repos-comment-header-persona size24');
  avatar.setAttribute('aria-hidden', 'true');
  const identity = author.trim().toLocaleLowerCase();
  const coins = document.querySelectorAll<HTMLElement>('.repos-discussion-thread-reply .bolt-coin[aria-label], .repos-discussion-comment .bolt-coin[aria-label]');
  for (const coin of coins) {
    if (coin.closest('[data-threadhold-card]')) continue;
    const label = coin.getAttribute('aria-label')?.trim().toLocaleLowerCase();
    if (!identity || !label || !(label === identity || label.startsWith(`${identity}-`) || label.startsWith(`${identity} -`))) continue;
    const image = coin.querySelector('img');
    if (!image || new URL(image.currentSrc || image.src, document.baseURI).origin !== location.origin) continue;
    const copy = element('img', 'bolt-coin-content using-image size24');
    copy.src = image.currentSrc || image.src;
    copy.alt = '';
    avatar.append(copy);
    avatar.setAttribute('aria-label', coin.getAttribute('aria-label') || author);
    return avatar;
  }
  avatar.classList.add('th-avatar-fallback');
  avatar.textContent = author.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toLocaleUpperCase() || '?';
  return avatar;
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
  const card = element('article', 'th-card repos-comment-viewer');
  card.dataset.threadholdCard = '';
  bindDraft(card, draft);
  card.setAttribute('aria-label', t(`Draft by ${author}`, `Draft van ${author}`));
  const comment = element('div', 'repos-discussion-comment flex-column');
  const row = element('div', 'flex-row');
  const avatar = authorAvatar(author);
  const displayAuthor = avatar.getAttribute('aria-label') || author;
  card.setAttribute('aria-label', t(`Draft by ${displayAuthor}`, `Draft van ${displayAuthor}`));
  const content = element('div', 'th-comment-content repos-comment-editor-fit flex-column flex-grow scroll-hidden padding-left-8');
  const header = element('div', 'repos-discussion-comment-header flex-row flex-grow flex-center rhythm-horizontal-4 margin-bottom-8');
  const identity = element('div', 'scroll-hidden flex-row flex-center');
  identity.append(element('span', 'font-weight-semibold padding-right-8 text-ellipsis', displayAuthor));
  const timestamp = element('time', 'body-s secondary-text margin-right-4 bolt-time-item white-space-nowrap');
  timestamp.dateTime = draft.updatedAt;
  timestamp.textContent = new Date(draft.updatedAt).toLocaleString(globalThis.navigator?.language);
  const badge = element('span', 'th-badge', t('Draft', 'Draft'));
  badge.title = t('Saved locally · only visible to you', 'Lokaal opgeslagen · alleen voor jou');
  const toolbar = element('div', 'flex-row flex-grow flex-noshrink justify-end flex-center');
  toolbar.setAttribute('role', 'group');
  toolbar.setAttribute('aria-label', t('Draft actions', 'Draftacties'));
  header.append(identity, timestamp, badge, toolbar);
  const body = element('div', 'th-body markdown-content markdown-editor-preview repos-comment-editor-max-width markdown-preview-checkbox-indent', draft.body);
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
  status: HTMLElement;
  setBinding(draft?: Draft): void;
  setBusy(busy: boolean): void;
  setEditing(editing: boolean): void;
  report(message: string, error?: boolean): void;
}
export function createSaveControl(onSave: () => void | Promise<void>): SaveControl {
  const container = element('div', 'th-save');
  const button = actionButton(t('Save as draft', 'Opslaan als draft'), 'save');
  button.title = t('Save locally as a draft · only visible to you', 'Lokaal opslaan als draft · alleen voor jou');
  const status = liveStatus();
  container.append(button, status);
  let binding: Draft | undefined;
  let externalBusy = false;
  let saving = false;
  let editing = false;
  function update(): void {
    button.classList.toggle('primary', editing && binding !== undefined);
    button.textContent = editing && binding ? t('Save', 'Opslaan') : binding ? t('Update draft', 'Draft bijwerken') : t('Save as draft', 'Opslaan als draft');
    button.disabled = externalBusy || saving || (binding !== undefined && binding.state !== 'saved');
    container.setAttribute('aria-busy', String(externalBusy || saving));
  }
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (button.disabled) return;
    saving = true;
    update();
    report(status, t('Saving draft…', 'Draft opslaan…'));
    void (async () => {
      try {
        await onSave();
        if (status.textContent === t('Saving draft…', 'Draft opslaan…')) report(status, t('Saved', 'Opgeslagen'));
      } catch (error) {
        report(status, errorMessage(error), true);
      } finally {
        saving = false;
        update();
      }
    })();
  });
  return {
    element: container,
    button,
    status,
    setBinding(draft) {
      binding = draft;
      bindDraft(container, draft);
      bindDraft(button, draft);
      const blocked = draft !== undefined && draft.state !== 'saved';
      button.title = blocked ? t('Editing is disabled until the publication status has been checked.', 'Bewerken is uitgeschakeld totdat de publicatiestatus is gecontroleerd.') : t('Save locally as a draft · only visible to you', 'Lokaal opslaan als draft · alleen voor jou');
      if (blocked) report(status, button.title);
      update();
    },
    setEditing(value) {
      editing = value;
      update();
    },
    setBusy(busy) {
      externalBusy = busy;
      update();
    },
    report(message, error = false) {
      const saved = !error && /\b(saved|opgeslagen)\b/i.test(message);
      status.title = saved ? message : '';
      report(status, saved ? t('Saved', 'Opgeslagen') : message, error);
    },
  };
}
