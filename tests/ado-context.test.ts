import { afterEach, describe, expect, it, vi } from 'vitest';
import { findPublication, type PrContext, type RemoteThread } from '../src/ado-context';
import { parsePrRoute } from '../src/routes';
import type { Draft } from '../src/contracts';

const route = parsePrRoute('https://dev.azure.com/company/project/_git/repo/pullrequest/42')!;
const draft: Draft = {
  id: 'draft-1', scope: { route, projectId: 'project-id', repositoryId: 'repo-id', userId: 'user-1' },
  anchor: { kind: 'general', editorKey: 'general', pageUrl: route.prUrl, sourceCommit: 'source', targetCommit: 'target' },
  body: 'Review dit', revision: 2, state: 'unknown', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  submission: { body: 'Review dit', startedAt: '2026-01-01T00:00:00Z', receipt: { threadId: 11, commentId: 1 } },
};
const user = { id: 'user-1', displayName: 'Reviewer' };
const context: PrContext = { scope: draft.scope, user, sourceCommit: 'source', targetCommit: 'target', latestIteration: 1 };
const thread = (id: number, author = user, commentId = 1): RemoteThread => ({ id, comments: [{ id: commentId, content: 'Review dit', author, publishedDate: '2025-01-01T00:00:00Z' }] });
afterEach(() => vi.unstubAllGlobals());
describe('publication reconciliation', () => {
  it('never treats an existing same-body comment as the new publication', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(thread(10))));
    await expect(findPublication(draft, context)).resolves.toBeUndefined();
  });
  it('verifies the exact POST receipt with a scoped GET without trusting the client clock', async () => {
    const send = vi.fn().mockResolvedValue(Response.json(thread(11)));
    vi.stubGlobal('fetch', send);
    await expect(findPublication(draft, context)).resolves.toEqual({ threadId: 11, commentId: 1 });
    expect(send).toHaveBeenCalledExactlyOnceWith(
      'https://dev.azure.com/company/project/_apis/git/repositories/repo-id/pullRequests/42/threads/11?api-version=7.1',
      expect.objectContaining({ method: 'GET', credentials: 'same-origin' }),
    );
  });
  it('preserves a draft when only other same-body comments are present in the exact thread', async () => {
    const other = thread(11, user, 2);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...other, comments: [...other.comments, ...thread(11, user, 3).comments] })));
    await expect(findPublication(draft, context)).resolves.toBeUndefined();
  });
  it('does not reconcile another reviewer or a different reply target', async () => {
    const send = vi.fn().mockResolvedValue(Response.json(thread(11, { id: 'other', displayName: 'Other' })));
    vi.stubGlobal('fetch', send);
    await expect(findPublication(draft, context)).resolves.toBeUndefined();
    const reply: Draft = { ...draft, anchor: { ...draft.anchor, kind: 'reply', threadId: 13 } };
    await expect(findPublication(reply, context)).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('cannot reconcile a legacy journal without a receipt, even with a same-body reply', async () => {
    const send = vi.fn().mockResolvedValue(Response.json(thread(11, user, 2)));
    vi.stubGlobal('fetch', send);
    const submission = { body: draft.body, startedAt: draft.createdAt, knownCommentIds: ['11:1'] };
    const legacy: Draft = { ...draft, anchor: { ...draft.anchor, kind: 'reply', threadId: 11 }, submission };
    await expect(findPublication(legacy, context)).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });
  it('does not read a receipt in a different pull request or account', async () => {
    const send = vi.fn();
    vi.stubGlobal('fetch', send);
    await expect(findPublication(draft, { ...context, scope: { ...draft.scope, route: { ...route, pullRequestId: 43 } } })).resolves.toBeUndefined();
    await expect(findPublication(draft, { ...context, scope: { ...draft.scope, userId: 'other' }, user: { ...user, id: 'other' } })).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });
  it('requires the receipt thread to match the exact inline file, side, and range', async () => {
    const start = { line: 9, offset: 5 };
    const end = { line: 11, offset: 2 };
    const inline: Draft = {
      ...draft, anchor: { ...draft.anchor, kind: 'inline', filePath: '/src/example.ts', side: 'left', start, end, firstIteration: 1, secondIteration: 2 },
    };
    const correct = { filePath: '/src/example.ts', leftFileStart: start, leftFileEnd: end };
    const send = vi.fn();
    vi.stubGlobal('fetch', send);
    for (const threadContext of [
      undefined,
      { ...correct, filePath: '/src/other.ts' },
      { filePath: correct.filePath, rightFileStart: start, rightFileEnd: end },
      { ...correct, leftFileStart: { ...start, offset: 6 } },
      { ...correct, leftFileEnd: { ...end, line: 12 } },
    ]) {
      send.mockResolvedValueOnce(Response.json({ ...thread(11), threadContext }));
      await expect(findPublication(inline, context)).resolves.toBeUndefined();
    }
    send.mockResolvedValueOnce(Response.json({ ...thread(11), threadContext: correct }));
    await expect(findPublication(inline, context)).resolves.toEqual({ threadId: 11, commentId: 1 });
  });
});
describe('PR routing', () => {
  it('keeps organization and legacy collection boundaries explicit', () => {
    expect(parsePrRoute('https://org.visualstudio.com/DefaultCollection/p/_git/r/pullrequest/8')?.organizationUrl).toBe('https://org.visualstudio.com/DefaultCollection');
    expect(parsePrRoute('https://org.visualstudio.com/Other%20Collection/p/_git/r/pullrequest/8')?.organizationUrl).toBe('https://org.visualstudio.com/Other%20Collection');
    expect(parsePrRoute('https://dev.azure.com/org/p/_git/r/pullRequest/8')?.pullRequestId).toBe(8);
  });
  it('rejects lookalike hosts, HTTP and non-PR routes', () => {
    expect(parsePrRoute('https://dev.azure.com.evil.test/org/p/_git/r/pullrequest/8')).toBeUndefined();
    expect(parsePrRoute('http://dev.azure.com/org/p/_git/r/pullrequest/8')).toBeUndefined();
    expect(parsePrRoute('https://dev.azure.com/org/p/_git/r')).toBeUndefined();
  });
});
