import { describe, expect, it } from 'vitest';
import { findPublication, type RemoteThread } from '../src/ado-context';
import { parsePrRoute } from '../src/routes';
import type { Draft } from '../src/contracts';

const route = parsePrRoute('https://dev.azure.com/company/project/_git/repo/pullrequest/42')!;
const draft: Draft = {
  id: 'draft-1', scope: { route, projectId: 'project-id', repositoryId: 'repo-id', userId: 'user-1' },
  anchor: { kind: 'general', editorKey: 'general', pageUrl: route.prUrl, sourceCommit: 'source', targetCommit: 'target' },
  body: 'Review dit', revision: 2, state: 'unknown', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  submission: { body: 'Review dit', startedAt: '2026-01-01T00:00:00Z', knownCommentIds: ['10:1'] },
};
const user = { id: 'user-1', displayName: 'Reviewer' };
const thread = (id: number, author = user): RemoteThread => ({ id, comments: [{ id: 1, content: 'Review dit', author, publishedDate: '2025-01-01T00:00:00Z' }] });
describe('publication reconciliation', () => {
  it('never treats an existing same-body comment as the new publication', () => {
    expect(findPublication(draft, [thread(10)], user)).toBeUndefined();
  });
  it('finds one new exact comment without trusting the client clock', () => {
    expect(findPublication(draft, [thread(10), thread(11)], user)).toEqual({ threadId: 11, commentId: 1 });
  });
  it('preserves a draft when multiple new comments are indistinguishable', () => {
    expect(findPublication(draft, [thread(11), thread(12)], user)).toBeUndefined();
  });
  it('does not reconcile another reviewer or a different reply target', () => {
    expect(findPublication(draft, [thread(11, { id: 'other', displayName: 'Other' })], user)).toBeUndefined();
    const reply = { ...draft, anchor: { ...draft.anchor, kind: 'reply' as const, threadId: 13 } };
    expect(findPublication(reply, [thread(11)], user)).toBeUndefined();
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
