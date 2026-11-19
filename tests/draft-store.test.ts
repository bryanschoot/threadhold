import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { DraftStore } from '../src/draft-store';
import type { Anchor, Draft, DraftRequest, Scope } from '../src/contracts';

const scope: Scope = {
  route: {
    origin: 'https://dev.azure.com', organization: 'acme', project: 'Platform', repository: 'app', pullRequestId: 42,
    organizationUrl: 'https://dev.azure.com/acme', prUrl: 'https://dev.azure.com/acme/Platform/_git/app/pullrequest/42',
  },
  projectId: 'project-id', repositoryId: 'repository-id', userId: 'user-id',
};
const anchor: Anchor = {
  kind: 'general', editorKey: 'general', pageUrl: scope.route.prUrl,
  sourceCommit: 'a'.repeat(40), targetCommit: 'b'.repeat(40),
};
const stores: DraftStore[] = [];
function open(name = crypto.randomUUID()) {
  const store = new DraftStore(name);
  stores.push(store);
  return store;
}
async function draft(store: DraftStore, request: DraftRequest, documentId?: string): Promise<Draft> {
  const result = await store.execute(request, documentId);
  if (!('draft' in result)) throw new Error('Expected a draft result');
  return result.draft;
}
const create = (body = 'Saved text', requestId: string = crypto.randomUUID()): DraftRequest => ({ action: 'create', scope, anchor, body, requestId });
afterEach(async () => { await Promise.all(stores.splice(0).map(store => store.close())); });

describe('durable draft CRUD', () => {
  it('survives closing and reopening without changing identity or text', async () => {
    const name = crypto.randomUUID();
    const first = open(name);
    const saved = await draft(first, create());
    await first.close();
    const reopened = open(name);
    expect(await draft(reopened, { action: 'get', scope, id: saved.id })).toEqual(saved);
    expect(await reopened.execute({ action: 'list', scope })).toEqual({ drafts: [saved] });
  });

  it('isolates accounts, projects, repositories, organizations and PRs', async () => {
    const store = open();
    const saved = await draft(store, create());
    const otherPr: Scope = { ...scope, route: { ...scope.route, pullRequestId: 43, prUrl: scope.route.prUrl.replace('/42', '/43') } };
    const otherOrg: Scope = { ...scope, route: { ...scope.route, organization: 'other', organizationUrl: 'https://dev.azure.com/other', prUrl: scope.route.prUrl.replace('/acme/', '/other/') } };
    for (const different of [{ ...scope, userId: 'another-user' }, { ...scope, projectId: 'another-project' }, { ...scope, repositoryId: 'another-repo' }, otherPr, otherOrg]) {
      expect(await store.execute({ action: 'list', scope: different })).toEqual({ drafts: [] });
      await expect(store.execute({ action: 'get', scope: different, id: saved.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    }
  });

  it('atomically accepts only one concurrent compare-and-swap update', async () => {
    const name = crypto.randomUUID();
    const first = open(name);
    const second = open(name);
    const saved = await draft(first, create());
    const outcomes = await Promise.allSettled([
      first.execute({ action: 'update', scope, id: saved.id, ifRevision: 1, body: 'First edit' }),
      second.execute({ action: 'update', scope, id: saved.id, ifRevision: 1, body: 'Second edit' }),
    ]);
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(result => result.status === 'rejected')).toEqual([expect.objectContaining({ reason: expect.objectContaining({ code: 'CONFLICT' }) })]);
    const updated = await draft(first, { action: 'get', scope, id: saved.id });
    expect(updated.id).toBe(saved.id);
    expect(updated.revision).toBe(2);
    await expect(first.execute({ action: 'delete', scope, id: saved.id, ifRevision: 1 })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await first.execute({ action: 'delete', scope, id: saved.id, ifRevision: 2 })).toEqual({ deleted: true });
  });

  it('replays matching creates but rejects changed body, anchor and deleted request IDs', async () => {
    const name = crypto.randomUUID();
    const store = open(name);
    const request = create('Original body', 'request-1');
    const saved = await draft(store, request);
    expect(await draft(store, request)).toEqual(saved);
    await expect(store.execute(create('Changed body', 'request-1'))).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(store.execute({ ...request, action: 'create', scope, body: 'Original body', requestId: 'request-1', anchor: { ...anchor, editorKey: 'other' } })).rejects.toMatchObject({ code: 'CONFLICT' });
    await store.execute({ action: 'delete', scope, id: saved.id, ifRevision: 1 });
    await store.close();
    await expect(open(name).execute(request)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('round trips complete inline and reply locations', async () => {
    const store = open();
    const inline: Anchor = {
      ...anchor, kind: 'inline', editorKey: 'diff-right', filePath: '/src/app.ts', side: 'right',
      start: { line: 10, offset: 1 }, end: { line: 12, offset: 3 },
      firstIteration: 1, secondIteration: 2, changeTrackingId: 4,
    };
    const reply: Anchor = { ...anchor, kind: 'reply', editorKey: 'thread-23', threadId: 23 };
    for (const location of [inline, reply]) {
      const saved = await draft(store, { action: 'create', scope, anchor: location, body: 'Location-specific text', requestId: crypto.randomUUID() });
      expect((await draft(store, { action: 'get', scope, id: saved.id })).anchor).toEqual(location);
    }
  });

  it('rejects malformed requests before changing persisted data', async () => {
    const store = open();
    for (const invalid of [
      { ...create(), body: ' \n ' }, { ...create(), body: 'a'.repeat(1024 * 1024 + 1) },
      { ...create(), body: '😀'.repeat(262145) }, { ...create(), scope: { ...scope, userId: '' } },
      { ...create(), anchor: { ...anchor, kind: 'inline' } },
      { ...create(), anchor: { ...anchor, pageUrl: 'https://evil.example/' } },
      { ...create(), anchor: { ...anchor, start: { line: 0, offset: 1 } } },
      { ...create(), unexpected: true }, { action: 'delete', scope, id: 'id', ifRevision: 0 },
    ]) {
      await expect(store.execute(invalid as DraftRequest)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    }
    expect(await store.execute({ action: 'list', scope })).toEqual({ drafts: [] });
  });
});

describe('durable native submission journal', () => {
  const documentId = 'publishing-document';

  it('snapshots exact submission text and blocks concurrent mutation', async () => {
    const store = open();
    const saved = await draft(store, create());
    const sending = await draft(store, { action: 'beginSubmit', scope, id: saved.id, ifRevision: saved.revision, body: 'Native editor text' }, documentId);
    expect(sending.state).toBe('sending');
    expect(sending.body).toBe('Native editor text');
    expect(sending.submission?.body).toBe('Native editor text');
    expect(sending.revision).toBe(2);
    expect((await draft(store, { action: 'get', scope, id: saved.id })).state).toBe('sending');
    for (const request of [
      { action: 'update', scope, id: saved.id, ifRevision: 2, body: 'Unsafe edit' },
      { action: 'delete', scope, id: saved.id, ifRevision: 2 },
      { action: 'beginSubmit', scope, id: saved.id, ifRevision: 2, body: 'Duplicate post' },
    ] as DraftRequest[]) await expect(store.execute(request, documentId)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    const restored = await draft(store, { action: 'finishSubmit', scope, id: saved.id, ifRevision: 2, outcome: 'failed' });
    expect(restored).toMatchObject({ state: 'saved', body: 'Native editor text', revision: 3 });
    expect(restored.submission).toBeUndefined();
  });

  it('recovers interrupted sending once on startup without treating ordinary reads as crashes', async () => {
    const name = crypto.randomUUID();
    const original = open(name);
    const saved = await draft(original, create());
    await original.execute({ action: 'beginSubmit', scope, id: saved.id, ifRevision: 1, body: 'Possibly published' }, documentId);
    await original.close();
    const restarted = open(name);
    await restarted.recoverSubmissions();
    const unknown = await draft(restarted, { action: 'get', scope, id: saved.id });
    expect(unknown).toMatchObject({ state: 'unknown', body: 'Possibly published', revision: 3, submission: { body: 'Possibly published' } });
    await expect(restarted.execute({ action: 'update', scope, id: saved.id, ifRevision: 3, body: 'Unsafe' })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await restarted.recoverSubmissions();
    expect(await draft(restarted, { action: 'get', scope, id: saved.id })).toEqual(unknown);
    const failed = await draft(restarted, { action: 'finishSubmit', scope, id: saved.id, ifRevision: 3, outcome: 'failed' });
    await restarted.execute({ action: 'beginSubmit', scope, id: saved.id, ifRevision: failed.revision, body: 'Explicitly checked and retried' }, documentId);
    await expect(restarted.execute({ action: 'recordSubmitReceipt', scope, id: saved.id, attempt: 2, receipt: { threadId: 23, commentId: 4 } }, documentId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await restarted.recoverSubmissions();
    expect((await draft(restarted, { action: 'get', scope, id: saved.id })).state).toBe('sending');
  });

  it('preserves an unknown draft and only removes it for IDs matching the stored receipt', async () => {
    const store = open();
    const request = create();
    const saved = await draft(store, request);
    const sending = await draft(store, { action: 'beginSubmit', scope, id: saved.id, ifRevision: 1, body: saved.body }, documentId);
    const receipt = { threadId: 100, commentId: 7 };
    await store.execute({ action: 'recordSubmitReceipt', scope, id: saved.id, attempt: sending.revision, receipt }, documentId);
    await store.execute({ action: 'completeSubmit', scope, id: saved.id, attempt: sending.revision }, documentId);
    const unknown = await draft(store, { action: 'get', scope, id: saved.id });
    expect(unknown.state).toBe('unknown');
    const finish = { action: 'finishSubmit', scope, id: saved.id, ifRevision: unknown.revision, outcome: 'published' } as const;
    await expect(store.execute({ ...finish, remoteThreadId: 0, remoteCommentId: 7 })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(store.execute({ ...finish, remoteThreadId: 100, remoteCommentId: 8 })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(await store.execute({ ...finish, remoteThreadId: 100, remoteCommentId: 7 })).toEqual({ deleted: true });
    expect(await store.execute({ action: 'list', scope })).toEqual({ drafts: [] });
    await expect(store.execute(request)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects missing and malformed receipts without enabling automatic draft removal', async () => {
    const store = open();
    const saved = await draft(store, create());
    const sending = await draft(store, { action: 'beginSubmit', scope, id: saved.id, ifRevision: saved.revision, body: saved.body }, documentId);
    for (const receipt of [undefined, { threadId: 12 }, { threadId: '12', commentId: 7 }, { threadId: 12, commentId: 9007199254740992 }]) {
      const request = { action: 'recordSubmitReceipt', scope, id: saved.id, attempt: sending.revision, receipt };
      await expect(store.execute(request as DraftRequest, documentId)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    }
    await store.execute({ action: 'completeSubmit', scope, id: saved.id, attempt: sending.revision }, documentId);
    const unknown = await draft(store, { action: 'get', scope, id: saved.id });
    await expect(store.execute({ action: 'finishSubmit', scope, id: saved.id, ifRevision: unknown.revision, outcome: 'published', remoteThreadId: 12, remoteCommentId: 7 })).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(await draft(store, { action: 'get', scope, id: saved.id })).toEqual(unknown);
  });

  it('accepts a late receipt after worker recovery only for the exact original reply attempt and document', async () => {
    const name = crypto.randomUUID();
    const original = open(name);
    const replyAnchor: Anchor = { ...anchor, kind: 'reply', editorKey: 'thread-23', threadId: 23 };
    const saved = await draft(original, { action: 'create', scope, anchor: replyAnchor, body: 'Reply in thread 23', requestId: 'original-reply' });
    const sending = await draft(original, { action: 'beginSubmit', scope, id: saved.id, ifRevision: saved.revision, body: saved.body }, documentId);
    await original.close();

    const restarted = open(name);
    await restarted.recoverSubmissions();
    expect(await draft(restarted, { action: 'get', scope, id: saved.id })).toMatchObject({ state: 'unknown' });

    const receipt = { threadId: 23, commentId: 4 };
    const record = { action: 'recordSubmitReceipt', scope, id: saved.id, attempt: sending.revision, receipt } as const;
    await expect(restarted.execute(record, 'different-document')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(restarted.execute({ ...record, id: 'different-draft' }, documentId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(restarted.execute({ ...record, scope: { ...scope, userId: 'different-account' } }, documentId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(restarted.execute({ ...record, receipt: { ...receipt, threadId: 24 } }, documentId)).rejects.toMatchObject({ code: 'INVALID_STATE' });
    await restarted.execute(record, documentId);
    await restarted.close();

    const reopened = open(name);
    await reopened.recoverSubmissions();
    const unknown = await draft(reopened, { action: 'get', scope, id: saved.id });
    expect(unknown).toMatchObject({ state: 'unknown', anchor: replyAnchor, submission: { receipt } });
    const complete = { action: 'completeSubmit', scope, id: saved.id, attempt: sending.revision, verified: receipt } as const;
    await expect(reopened.execute(complete, 'different-document')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await reopened.execute(complete, documentId)).toEqual({ deleted: true });
  });

  it('allows explicit CAS deletion of an uncertain local draft without publishing', async () => {
    const store = open();
    const saved = await draft(store, create());
    await store.execute({ action: 'beginSubmit', scope, id: saved.id, ifRevision: 1, body: saved.body }, documentId);
    await store.execute({ action: 'completeSubmit', scope, id: saved.id, attempt: 2 }, documentId);
    const unknown = await draft(store, { action: 'get', scope, id: saved.id });
    await expect(store.execute({ action: 'delete', scope, id: saved.id, ifRevision: 2 })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await store.execute({ action: 'delete', scope, id: saved.id, ifRevision: unknown.revision })).toEqual({ deleted: true });
  });
});
