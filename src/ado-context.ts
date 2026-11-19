import { isPositiveId, scopeKey, type Draft, type PrRoute, type PublicationReceipt, type Scope } from './contracts';
import { t } from './i18n';

interface Identity { id: string; descriptor?: string; uniqueName?: string; displayName: string }
export interface PrContext {
  scope: Scope;
  user: Identity;
  sourceCommit: string;
  targetCommit: string;
  latestIteration: number;
}
export interface RemoteComment { id: number; content: string; publishedDate: string; isDeleted?: boolean; author: Identity }
export interface RemoteThread {
  id: number;
  isDeleted?: boolean;
  comments: RemoteComment[];
  threadContext?: {
    filePath?: string;
    leftFileStart?: { line: number; offset: number };
    leftFileEnd?: { line: number; offset: number };
    rightFileStart?: { line: number; offset: number };
    rightFileEnd?: { line: number; offset: number };
  };
}


async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    signal: AbortSignal.timeout(15_000), headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(t(`Reading Azure DevOps failed (HTTP ${response.status}).`, `Azure DevOps lezen mislukt (HTTP ${response.status}).`));
  return response.json() as Promise<T>;
}
function required(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(t(`Azure DevOps did not provide a reliable ${label}.`, `Azure DevOps geeft geen betrouwbare ${label}.`));
}
export async function loadPrContext(route: PrRoute): Promise<PrContext> {
  const base = `${route.organizationUrl}/${encodeURIComponent(route.project)}/_apis/git/repositories`;
  const [repository, connection] = await Promise.all([
    readJson<{ id: string; project: { id: string } }>(`${base}/${encodeURIComponent(route.repository)}?api-version=7.1`),
    readJson<{ authenticatedUser: { id: string; descriptor?: string; uniqueName?: string; providerDisplayName?: string; displayName?: string } }>(`${route.organizationUrl}/_apis/connectionData?api-version=7.1-preview.1`),
  ]);
  required(repository.id, t('repository ID', 'repository-ID'));
  required(repository.project?.id, t('project ID', 'project-ID'));
  required(connection.authenticatedUser?.id, t('user ID', 'gebruikers-ID'));
  const [pr, iterations] = await Promise.all([
    readJson<{ repository: { id: string; project: { id: string } }; lastMergeSourceCommit: { commitId: string }; lastMergeTargetCommit: { commitId: string } }>(`${base}/${encodeURIComponent(repository.id)}/pullRequests/${route.pullRequestId}?api-version=7.1`),
    readJson<{ value: { id: number }[] }>(`${base}/${encodeURIComponent(repository.id)}/pullRequests/${route.pullRequestId}/iterations?api-version=7.1`),
  ]);
  const latestIteration = Math.max(...iterations.value.map(iteration => iteration.id));
  if (!Number.isSafeInteger(latestIteration) || latestIteration < 1) throw new Error(t('No reliable PR iteration found.', 'Geen betrouwbare PR-iteratie gevonden.'));
  if (pr.repository?.id?.toLowerCase() !== repository.id.toLowerCase() || pr.repository.project.id.toLowerCase() !== repository.project.id.toLowerCase()) throw new Error(t('PR and repository context do not match.', 'PR en repositorycontext komen niet overeen.'));
  required(pr.lastMergeSourceCommit?.commitId, t('source commit', 'sourcecommit'));
  required(pr.lastMergeTargetCommit?.commitId, t('target commit', 'targetcommit'));
  return {
    scope: { route, projectId: repository.project.id, repositoryId: repository.id, userId: connection.authenticatedUser.id },
    user: { ...connection.authenticatedUser, displayName: connection.authenticatedUser.providerDisplayName ?? connection.authenticatedUser.displayName ?? t('You', 'Jij') },
    sourceCommit: pr.lastMergeSourceCommit.commitId, targetCommit: pr.lastMergeTargetCommit.commitId,
    latestIteration,
  };
}
function threadsUrl({ scope: { route, repositoryId } }: PrContext): string {
  return `${route.organizationUrl}/${encodeURIComponent(route.project)}/_apis/git/repositories/${encodeURIComponent(repositoryId)}/pullRequests/${route.pullRequestId}/threads`;
}
export async function readThreads(context: PrContext): Promise<RemoteThread[]> {
  const result = await readJson<{ value: RemoteThread[] }>(`${threadsUrl(context)}?api-version=7.1`);
  if (!Array.isArray(result.value)) throw new Error(t('Invalid thread response from Azure DevOps.', 'Ongeldig threadantwoord van Azure DevOps.'));
  return result.value;
}
export function isStale(draft: Draft, context: PrContext, threads: RemoteThread[]): boolean {
  if (draft.anchor.kind === 'reply') return !threads.some((thread) => thread.id === draft.anchor.threadId && !thread.isDeleted);
  return draft.anchor.kind === 'inline' && (draft.anchor.sourceCommit !== context.sourceCommit || draft.anchor.targetCommit !== context.targetCommit);
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function findPublication(draft: Draft, context: PrContext): Promise<PublicationReceipt | undefined> {
  const submission = draft.submission;
  if (!submission) return;
  const { receipt } = submission;
  if (!receipt || !isPositiveId(receipt.threadId) || !isPositiveId(receipt.commentId) || draft.state === 'saved' ||
      scopeKey(draft.scope) !== scopeKey(context.scope) ||
      (draft.anchor.kind === 'reply' && draft.anchor.threadId !== receipt.threadId)) return;

  const thread = await readJson<unknown>(`${threadsUrl(context)}/${receipt.threadId}?api-version=7.1`);
  if (!record(thread) || thread.id !== receipt.threadId || thread.isDeleted || !Array.isArray(thread.comments)) return;
  const { anchor } = draft;
  const location = thread.threadContext;
  if (anchor.kind === 'general' && record(location) && location.filePath) return;
  if (anchor.kind === 'inline') {
    if (!anchor.filePath || !anchor.side || !anchor.start || !anchor.end || !record(location) || location.filePath !== anchor.filePath) return;
    const start = anchor.side === 'left' ? location.leftFileStart : location.rightFileStart;
    const end = anchor.side === 'left' ? location.leftFileEnd : location.rightFileEnd;
    if (!record(start) || !record(end) ||
        start.line !== anchor.start.line || start.offset !== anchor.start.offset ||
        end.line !== anchor.end.line || end.offset !== anchor.end.offset) return;
  }

  const { user } = context;
  const comments: unknown[] = thread.comments;
  for (const comment of comments) {
    if (!record(comment) || comment.id !== receipt.commentId || comment.isDeleted || comment.content !== submission.body || !record(comment.author)) continue;
    if (comment.author.id === user.id || (user.descriptor && comment.author.descriptor === user.descriptor) ||
        (user.uniqueName && comment.author.uniqueName === user.uniqueName)) return receipt;
  }
}
