import { afterEach, describe, expect, it, vi } from 'vitest';
import { postDraft } from '../src/ado-publish';
import { parsePrRoute } from '../src/routes';
import type { Draft } from '../src/contracts';
import { isStale, type PrContext, type RemoteThread } from '../src/ado-context';

const route = parsePrRoute('https://dev.azure.com/org/project/_git/repo/pullrequest/42')!;
const context: PrContext = { scope: { route, projectId: 'p', repositoryId: 'r', userId: 'u' }, user: { id: 'u', displayName: 'Reviewer' }, sourceCommit: 's', targetCommit: 't', latestIteration: 2 };
const draft: Draft = { id: 'd', scope: context.scope, body: 'Not the frozen snapshot', state: 'sending', revision: 2, createdAt: '', updatedAt: '', anchor: { kind: 'general', editorKey: 'general', pageUrl: route.prUrl, sourceCommit: 's', targetCommit: 't' }, submission: { body: 'Frozen café 🧵', startedAt: '' } };
afterEach(() => vi.unstubAllGlobals());
describe('explicit publication', () => {
  it('posts the frozen snapshot to this PR using the existing browser session', async () => {
    const send = vi.fn().mockResolvedValue(Response.json({ id: 23, comments: [{ id: 1 }] }));
    vi.stubGlobal('fetch', send);
    await expect(postDraft(draft, context, [])).resolves.toEqual({ threadId: 23, commentId: 1 });
    const [url, options] = send.mock.calls[0]!;
    expect(url).toBe('https://dev.azure.com/org/project/_apis/git/repositories/r/pullRequests/42/threads?api-version=7.1');
    expect(options.credentials).toBe('same-origin');
    expect(JSON.parse(options.body)).toEqual({ comments: [{ content: 'Frozen café 🧵', parentCommentId: 0, commentType: 1 }], status: 1 });
  });
  it('replies inside the original discussion without changing its status', async () => {
    const send = vi.fn().mockResolvedValue(Response.json({ id: 4, parentCommentId: 1 }));
    vi.stubGlobal('fetch', send);
    const threads: RemoteThread[] = [{ id: 7, comments: [{ id: 1, content: 'Original', publishedDate: '', author: context.user }] }];
    await expect(postDraft({ ...draft, anchor: { ...draft.anchor, kind: 'reply', threadId: 7 } }, context, threads)).resolves.toEqual({ threadId: 7, commentId: 4 });
    const [url, options] = send.mock.calls[0]!;
    expect(url).toContain('/threads/7/comments?');
    expect(JSON.parse(options.body)).toEqual({ content: 'Frozen café 🧵', parentCommentId: 1, commentType: 1 });
  });
  it('uses a surviving comment when the original reply parent was deleted', async () => {
    const send = vi.fn().mockResolvedValue(Response.json({ id: 5 }));
    vi.stubGlobal('fetch', send);
    const original = { id: 1, content: '', publishedDate: '', author: context.user, isDeleted: true };
    const threads = [{ id: 7, comments: [original, { ...original, id: 4, isDeleted: false }] }];
    await postDraft({ ...draft, anchor: { ...draft.anchor, kind: 'reply', threadId: 7 } }, context, threads);
    expect(JSON.parse(send.mock.calls[0]![1].body).parentCommentId).toBe(4);
  });
  it('marks a discussion without a surviving parent as stale and never sends the reply', async () => {
    const send = vi.fn();
    vi.stubGlobal('fetch', send);
    const threads = [{ id: 7, comments: [{ id: 1, content: '', publishedDate: '', author: context.user, isDeleted: true }] }];
    const reply: Draft = { ...draft, anchor: { ...draft.anchor, kind: 'reply', threadId: 7 } };
    expect(isStale(reply, context, threads)).toBe(true);
    await expect(postDraft(reply, context, threads)).rejects.toThrow('original thread');
    expect(send).not.toHaveBeenCalled();
  });
  it('keeps the captured left/right selection and iteration context', async () => {
    const send = vi.fn().mockResolvedValue(Response.json({ id: 23, comments: [{ id: 1 }] }));
    vi.stubGlobal('fetch', send);
    await postDraft({ ...draft, anchor: { ...draft.anchor, kind: 'inline', filePath: '/src/a.ts', side: 'left', start: { line: 3, offset: 1 }, end: { line: 4, offset: 5 }, firstIteration: 1, secondIteration: 2, changeTrackingId: 9 } }, context, []);
    const body = JSON.parse(send.mock.calls[0]![1].body);
    expect(body.threadContext).toEqual({ filePath: '/src/a.ts', leftFileStart: { line: 3, offset: 1 }, leftFileEnd: { line: 4, offset: 5 } });
    expect(body.pullRequestThreadContext).toEqual({ changeTrackingId: 9, iterationContext: { firstComparingIteration: 1, secondComparingIteration: 2 } });
  });
  it('does not send stale code or another account snapshot', async () => {
    const send = vi.fn(); vi.stubGlobal('fetch', send);
    await expect(postDraft({ ...draft, scope: { ...draft.scope, userId: 'other' } }, context, [])).rejects.toThrow();
    await expect(postDraft({ ...draft, anchor: { ...draft.anchor, kind: 'inline', sourceCommit: 'old' } }, context, [])).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it('never retries an ambiguous network failure', async () => {
    const send = vi.fn().mockRejectedValue(new TypeError('Connection lost')); vi.stubGlobal('fetch', send);
    await expect(postDraft(draft, context, [])).rejects.toThrow('Connection lost');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it.each([
    '<html>unexpected login page</html>',
    '{}',
    '{"id":23,"comments":[]}',
    '{"id":23,"comments":[{"id":1},{"id":2}]}',
    '{"id":"23","comments":[{"id":1}]}',
    '{"id":23,"comments":[{"id":0}]}',
    '{"id":23,"comments":[{"id":1.5}]}',
  ])('rejects a malformed thread receipt without repeating the POST: %s', async body => {
    const send = vi.fn().mockResolvedValue(new Response(body));
    vi.stubGlobal('fetch', send);
    await expect(postDraft(draft, context, [])).rejects.toThrow('did not return valid publication IDs');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('does not accept a thread-shaped reply response as a comment ID', async () => {
    const send = vi.fn().mockResolvedValue(Response.json({ id: 7, comments: [{ id: 4 }] }));
    vi.stubGlobal('fetch', send);
    const threads: RemoteThread[] = [{ id: 7, comments: [{ id: 1, content: 'Original', publishedDate: '', author: context.user }] }];
    await expect(postDraft({ ...draft, anchor: { ...draft.anchor, kind: 'reply', threadId: 7 } }, context, threads)).rejects.toThrow('did not return valid publication IDs');
    expect(send).toHaveBeenCalledTimes(1);
  });
});
