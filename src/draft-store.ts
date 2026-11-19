import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction } from 'idb';
import { scopeKey, type Anchor, type Draft, type DraftRequest, type DraftResult, type Scope } from './contracts';
import { parsePrRoute, samePrRoute } from './routes';
import { t } from './i18n';

const MAX_BODY_BYTES = 1024 * 1024;
const encoder = new TextEncoder();

export class DraftStoreError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'DraftStoreError';
  }
}
function invalid(message: string): never { throw new DraftStoreError('INVALID_REQUEST', message); }
function object(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(`${name} must be an object.`);
}
function keys(value: Record<string, unknown>, allowed: readonly string[], name: string): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) invalid(`${name} has unsupported fields.`);
}
function text(value: unknown, name: string, max = 4096): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) invalid(`${name} must be nonempty bounded text without control characters.`);
}
function positive(value: unknown, name: string): asserts value is number {
  if (!isPositiveId(value)) invalid(`${name} must be a positive safe integer.`);
}
function body(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0') || value.length > MAX_BODY_BYTES || encoder.encode(value).byteLength > MAX_BODY_BYTES) invalid(t('Body must contain text and be at most 1 MiB in UTF-8.', 'De inhoud moet tekst bevatten en mag maximaal 1 MiB groot zijn in UTF-8.'));
}
function validateScope(value: unknown): asserts value is Scope {
  object(value, 'Scope');
  keys(value, ['route', 'projectId', 'repositoryId', 'userId'], 'Scope');
  for (const key of ['projectId', 'repositoryId', 'userId']) text(value[key], `Scope ${key}`, 256);
  object(value.route, 'Route');
  const route = value.route;
  keys(route, ['origin', 'organization', 'project', 'repository', 'pullRequestId', 'organizationUrl', 'prUrl'], 'Route');
  for (const key of ['origin', 'organization', 'project', 'repository', 'organizationUrl', 'prUrl']) text(route[key], `Route ${key}`);
  positive(route.pullRequestId, 'Pull request ID');
  const parsed = parsePrRoute(route.prUrl as string);
  if (!parsed || !samePrRoute(parsed, route as unknown as Scope['route'])) invalid('Scope must match a supported Azure DevOps PR URL.');
}
function validateAnchor(value: unknown, scope: Scope): asserts value is Anchor {
  object(value, 'Anchor');
  keys(value, ['kind', 'filePath', 'side', 'start', 'end', 'firstIteration', 'secondIteration', 'changeTrackingId', 'sourceCommit', 'targetCommit', 'threadId', 'editorKey', 'pageUrl'], 'Anchor');
  if (value.kind !== 'general' && value.kind !== 'inline' && value.kind !== 'reply') invalid('Anchor kind is unsupported.');
  for (const key of ['sourceCommit', 'targetCommit', 'editorKey', 'pageUrl']) text(value[key], `Anchor ${key}`);
  const page = parsePrRoute(value.pageUrl as string);
  if (!page || !samePrRoute(page, scope.route)) invalid('Anchor page must match the draft PR.');
  if (value.filePath !== undefined) {
    text(value.filePath, 'File path');
    if (!value.filePath.startsWith('/')) invalid('File path must be repository-relative with a leading slash.');
  }
  if (value.side !== undefined && value.side !== 'left' && value.side !== 'right') invalid('Anchor side is unsupported.');
  for (const key of ['start', 'end']) {
    if (value[key] === undefined) continue;
    object(value[key], `Anchor ${key}`);
    keys(value[key], ['line', 'offset'], `Anchor ${key}`);
    positive(value[key].line, `${key} line`);
    positive(value[key].offset, `${key} offset`);
  }
  for (const key of ['firstIteration', 'secondIteration', 'changeTrackingId', 'threadId']) if (value[key] !== undefined) positive(value[key], `Anchor ${key}`);
  if (value.kind === 'inline') {
    for (const key of ['filePath', 'side', 'start', 'end', 'firstIteration', 'secondIteration']) if (value[key] === undefined) invalid(`Inline anchor requires ${key}.`);
    const start = value.start as { line: number; offset: number };
    const end = value.end as { line: number; offset: number };
    if (end.line < start.line || (end.line === start.line && end.offset < start.offset)) invalid('Anchor end precedes its start.');
    if (value.threadId !== undefined) invalid('New inline drafts cannot have a thread ID.');
  } else {
    if (['filePath', 'side', 'start', 'end', 'firstIteration', 'secondIteration', 'changeTrackingId'].some(key => value[key] !== undefined)) invalid('Only inline anchors may contain diff coordinates.');
    if (value.kind === 'reply' && value.threadId === undefined) invalid('Reply anchor requires a thread ID.');
    if (value.kind === 'general' && value.threadId !== undefined) invalid('General anchors cannot have a thread ID.');
  }
}

/** Validate every unknown message before trusting its TypeScript contract. */
export function validateDraftRequest(value: unknown): asserts value is DraftRequest {
  object(value, 'Request');
  const action = value.action;
  let fields: string[];
  switch (action) {
    case 'list': fields = []; break;
    case 'get': fields = ['id']; break;
    case 'create': fields = ['anchor', 'body', 'requestId']; break;
    case 'update': fields = ['id', 'ifRevision', 'body', 'anchor']; break;
    case 'delete': fields = ['id', 'ifRevision']; break;
    case 'beginSubmit': fields = ['id', 'ifRevision', 'body']; break;
    case 'recordSubmitReceipt': fields = ['id', 'attempt', 'receipt']; break;
    case 'completeSubmit': fields = ['id', 'attempt', 'verified']; break;
    case 'finishSubmit': fields = ['id', 'ifRevision', 'outcome', 'remoteThreadId', 'remoteCommentId']; break;
    default: invalid('Unsupported draft action.');
  }
  keys(value, ['action', 'scope', ...fields], 'Request');
  if (action === 'recordSubmitReceipt' || (action === 'completeSubmit' && value.verified !== undefined)) {
    const receipt = action === 'recordSubmitReceipt' ? value.receipt : value.verified;
    object(receipt, 'Publication receipt');
    keys(receipt, ['threadId', 'commentId'], 'Publication receipt');
    positive(receipt.threadId, 'Receipt thread ID');
    positive(receipt.commentId, 'Receipt comment ID');
  }
  validateScope(value.scope);
  if (fields.includes('id')) text(value.id, 'Draft ID', 256);
  if (fields.includes('ifRevision')) positive(value.ifRevision, 'Revision');
  if (fields.includes('attempt')) positive(value.attempt, 'Publication attempt');
  if (fields.includes('body')) body(value.body);
  if (action === 'create') text(value.requestId, 'Request ID', 256);
  if (action === 'create' || value.anchor !== undefined) validateAnchor(value.anchor, value.scope);
  if (action === 'finishSubmit') {
    if (value.outcome !== 'published' && value.outcome !== 'failed') invalid('Submission outcome is unsupported.');
    for (const key of ['remoteThreadId', 'remoteCommentId']) if (value[key] !== undefined || value.outcome === 'published') positive(value[key], key);
    if (value.outcome !== 'published' && (value.remoteThreadId !== undefined || value.remoteCommentId !== undefined)) invalid('Remote IDs require a published outcome.');
  }
}

interface StoredDraft {
  id: string;
  scopeKey: string;
  draft: Draft;
  // The begin revision identifies this attempt even if worker startup advances the draft revision.
  continuation?: { attempt: number; documentId: string; prUrl: string };
}
interface CreateReceipt { scopeKey: string; requestId: string; draftId: string; fingerprint: string }
interface DraftDatabase extends DBSchema {
  drafts: { key: string; value: StoredDraft; indexes: { 'by-scope': string; 'by-scope-updated': [string, string] } };
  requests: { key: [string, string]; value: CreateReceipt };
}
async function migrateLegacyCollections(transaction: IDBPTransaction<DraftDatabase, ('drafts' | 'requests')[], 'versionchange'>) {
  const moved = new Map<string, string>();
  const drafts = transaction.objectStore('drafts');
  for (let cursor = await drafts.openCursor(); cursor; cursor = await cursor.continue()) {
    const stored = cursor.value;
    if (!stored.draft.scope.route.origin.endsWith('.visualstudio.com')) continue;
    const route = parsePrRoute(stored.draft.scope.route.prUrl);
    if (!route || route.organizationUrl === route.origin) continue;
    stored.draft.scope.route = route;
    stored.scopeKey = scopeKey(stored.draft.scope);
    moved.set(stored.id, stored.scopeKey);
    await cursor.update(stored);
  }
  if (!moved.size) return;
  const requests = transaction.objectStore('requests');
  for (let cursor = await requests.openCursor(); cursor; cursor = await cursor.continue()) {
    const receipt = cursor.value;
    const key = moved.get(receipt.draftId);
    if (!key || key === receipt.scopeKey) continue;
    await cursor.delete();
    await requests.add({ ...receipt, scopeKey: key });
  }
}

function canonicalAnchor(anchor: Anchor): unknown[] {
  return [anchor.kind, anchor.filePath ?? null, anchor.side ?? null, anchor.start?.line ?? null, anchor.start?.offset ?? null, anchor.end?.line ?? null, anchor.end?.offset ?? null, anchor.firstIteration ?? null, anchor.secondIteration ?? null, anchor.changeTrackingId ?? null, anchor.sourceCommit, anchor.targetCommit, anchor.threadId ?? null, anchor.editorKey, anchor.pageUrl];
}
async function fingerprint(body: string, anchor: Anchor): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify([body, canonicalAnchor(anchor)])));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
function storageError(error: unknown): DraftStoreError {
  if (error instanceof DraftStoreError) return error;
  return new DraftStoreError('STORAGE_ERROR', error instanceof Error && error.name === 'QuotaExceededError' ? t('Local draft storage is full. Your editor text has not been saved.', 'De lokale draftopslag is vol. Je editortekst is niet opgeslagen.') : t('Local draft storage could not complete the operation.', 'De lokale draftopslag kon de bewerking niet voltooien.'));
}

export class DraftStore {
  private database?: Promise<IDBPDatabase<DraftDatabase>>;
  private closed = false;
  private recovery?: Promise<void>;

  constructor(private readonly databaseName = 'threadhold') {
    text(databaseName, 'Database name', 256);
  }

  private openDatabase(): Promise<IDBPDatabase<DraftDatabase>> {
    this.database ??= openDB<DraftDatabase>(this.databaseName, 2, {
      upgrade(database, oldVersion, _newVersion, transaction) {
        if (oldVersion === 0) {
          const drafts = database.createObjectStore('drafts', { keyPath: 'id' });
          drafts.createIndex('by-scope', 'scopeKey');
          drafts.createIndex('by-scope-updated', ['scopeKey', 'draft.updatedAt']);
          database.createObjectStore('requests', { keyPath: ['scopeKey', 'requestId'] });
        } else {
          void transaction.done.catch(() => undefined);
          void migrateLegacyCollections(transaction).catch(() => {
            try { transaction.abort(); } catch { /* Already aborted. */ }
          });
        }
      },
    }).catch(error => {
      this.database = undefined;
      throw error;
    });
    return this.database;
  }

  /** Gate worker requests on one successful startup recovery. Renew only a failed attempt. */
  recoverSubmissions(): Promise<void> {
    this.recovery ??= this.recoverInterrupted().catch(error => {
      this.recovery = undefined;
      throw error;
    });
    return this.recovery;
  }

  private async recoverInterrupted(): Promise<void> {
    if (this.closed) throw new DraftStoreError('CLOSED', t('Draft storage is closed.', 'De draftopslag is gesloten.'));
    try {
      const database = await this.openDatabase();
      const transaction = database.transaction('drafts', 'readwrite');
      void transaction.done.catch(() => undefined);
      let cursor = await transaction.store.openCursor();
      while (cursor) {
        const stored = cursor.value;
        if (stored.draft.state === 'sending') {
          stored.draft.state = 'unknown';
          stored.draft.revision++;
          stored.draft.updatedAt = new Date().toISOString();
          await cursor.update(stored);
        }
        cursor = await cursor.continue();
      }
      await transaction.done;
    } catch (error) { throw storageError(error); }
  }

  async execute(command: DraftRequest, documentId?: string): Promise<DraftResult> {
    validateDraftRequest(command);
    if (this.closed) throw new DraftStoreError('CLOSED', t('Draft storage is closed.', 'De draftopslag is gesloten.'));
    // Snapshot caller-owned objects before the first await, including in direct tests/callers.
    const request = structuredClone(command);
    try {
      const hash = request.action === 'create' ? await fingerprint(request.body, request.anchor) : undefined;
      const database = await this.openDatabase();
      const key = scopeKey(request.scope);
      if (request.action === 'list' || request.action === 'get') {
        const transaction = database.transaction('drafts', 'readonly');
        if (request.action === 'list') {
          const records = await transaction.store.index('by-scope').getAll(key);
          await transaction.done;
          return { drafts: records.map(record => record.draft).sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)) };
        }
        const stored = await transaction.store.get(request.id);
        await transaction.done;
        if (!stored || stored.scopeKey !== key) throw new DraftStoreError('NOT_FOUND', t('Draft was not found in this account and pull request.', 'De draft is niet gevonden voor dit account en deze pull request.'));
        return { draft: stored.draft };
      }
      const transaction = database.transaction(['drafts', 'requests'], 'readwrite');
      const drafts = transaction.objectStore('drafts');
      const requests = transaction.objectStore('requests');
      try {
        let result: DraftResult;
        if (request.action === 'create') {
          const receipt = await requests.get([key, request.requestId]);
          if (receipt) {
            if (receipt.fingerprint !== hash) throw new DraftStoreError('CONFLICT', t('This save request ID was already used with different content or location.', 'Dit opslagverzoek-ID is al gebruikt met andere inhoud of een andere locatie.'));
            const existing = await drafts.get(receipt.draftId);
            if (!existing || existing.scopeKey !== key) throw new DraftStoreError('CONFLICT', t('This save request belongs to a removed draft. Start a new save request.', 'Dit opslagverzoek hoort bij een verwijderde draft. Start een nieuw opslagverzoek.'));
            result = { draft: existing.draft };
          } else {
            const now = new Date().toISOString();
            const draft: Draft = { id: crypto.randomUUID(), scope: request.scope, anchor: request.anchor, body: request.body, revision: 1, state: 'saved', createdAt: now, updatedAt: now };
            await drafts.add({ id: draft.id, scopeKey: key, draft });
            await requests.add({ scopeKey: key, requestId: request.requestId, draftId: draft.id, fingerprint: hash! });
            result = { draft };
          }
        } else {
          const stored = await drafts.get(request.id);
          const continuing = request.action === 'recordSubmitReceipt' || request.action === 'completeSubmit';
          if (!stored || stored.scopeKey !== key || (continuing && (
            !stored.continuation || stored.continuation.attempt !== request.attempt ||
            stored.continuation.documentId !== documentId || stored.continuation.prUrl !== request.scope.route.prUrl
          ))) {
            if (continuing) throw new DraftStoreError('FORBIDDEN', t('This document cannot complete that publication attempt.', 'Dit document kan die publicatiepoging niet afhandelen.'));
            throw new DraftStoreError('NOT_FOUND', t('Draft was not found in this account and pull request.', 'De draft is niet gevonden voor dit account en deze pull request.'));
          }
          const draft = stored.draft;
          if (!continuing && request.ifRevision !== draft.revision) throw new DraftStoreError('CONFLICT', t('Draft changed in another tab. Reload it before retrying.', 'De draft is gewijzigd in een ander tabblad. Laad de draft opnieuw voordat je het opnieuw probeert.'));
          if (request.action === 'recordSubmitReceipt') {
            if ((draft.state !== 'sending' && draft.state !== 'unknown') || !draft.submission || draft.submission.receipt ||
                (draft.anchor.kind === 'reply' && draft.anchor.threadId !== request.receipt.threadId)) {
              throw new DraftStoreError('INVALID_STATE', t('Publication receipt does not match a pending submission.', 'De ontvangstbevestiging komt niet overeen met een openstaande publicatie.'));
            }
            draft.submission.receipt = request.receipt;
            draft.revision++;
            draft.updatedAt = new Date().toISOString();
            await drafts.put(stored);
            result = { acknowledged: true };
          } else if (request.action === 'finishSubmit' || request.action === 'completeSubmit') {
            if (draft.state !== 'sending' && draft.state !== 'unknown') throw new DraftStoreError('INVALID_STATE', t('Draft has no pending submission to reconcile.', 'De draft heeft geen openstaande publicatie om te controleren.'));
            const published = request.action === 'completeSubmit' ? !!request.verified : request.outcome === 'published';
            if (published) {
              const receipt = draft.submission?.receipt;
              const threadId = request.action === 'completeSubmit' ? request.verified?.threadId : request.remoteThreadId;
              const commentId = request.action === 'completeSubmit' ? request.verified?.commentId : request.remoteCommentId;
              if (!receipt || receipt.threadId !== threadId || receipt.commentId !== commentId) {
                throw new DraftStoreError('INVALID_STATE', t('Verified publication IDs do not match the stored receipt.', 'De geverifieerde publicatie-ID’s komen niet overeen met de opgeslagen ontvangstbevestiging.'));
              }
              await drafts.delete(draft.id);
              result = { deleted: true };
            } else {
              draft.state = request.action === 'finishSubmit' ? 'saved' : 'unknown';
              if (draft.state === 'saved') delete draft.submission;
              delete stored.continuation;
              draft.revision++;
              draft.updatedAt = new Date().toISOString();
              await drafts.put(stored);
              result = request.action === 'completeSubmit' ? { acknowledged: true } : { draft };
            }
          } else {
            if (draft.state === 'sending' || (draft.state === 'unknown' && request.action !== 'delete')) throw new DraftStoreError('INVALID_STATE', t('Check the uncertain publication result before editing or submitting this draft.', 'Controleer het onzekere publicatieresultaat voordat je deze draft bewerkt of publiceert.'));
            if (request.action === 'delete') {
              await drafts.delete(draft.id);
              result = { deleted: true };
            } else {
              draft.body = request.body;
              if (request.action === 'update') {
                if (request.anchor) draft.anchor = request.anchor;
              } else {
                if (!documentId) throw new DraftStoreError('FORBIDDEN', t('Publication requires a browser document identity.', 'Publicatie vereist een browserdocumentidentiteit.'));
                stored.continuation = { attempt: draft.revision + 1, documentId, prUrl: request.scope.route.prUrl };
                draft.state = 'sending';
                draft.submission = { body: request.body, startedAt: new Date().toISOString() };
              }
              draft.revision++;
              draft.updatedAt = new Date().toISOString();
              await drafts.put(stored);
              result = { draft };
            }
          }
        }
        await transaction.done;
        return result;
      } catch (error) {
        try { transaction.abort(); } catch { /* Transaction may already be aborted. */ }
        await transaction.done.catch(() => undefined);
        throw error;
      }
    } catch (error) { throw storageError(error); }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    (await this.database?.catch(() => undefined))?.close();
  }
}
