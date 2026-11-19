import { isPositiveId, scopeKey, type Draft, type PublicationReceipt } from './contracts';
import type { PrContext, RemoteThread } from './ado-context';
import { t } from './i18n';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Called only after explicit publication consent and a durable beginSubmit snapshot. Never retries. */
export async function postDraft(draft: Draft, context: PrContext, threads: RemoteThread[]): Promise<PublicationReceipt> {
  if (scopeKey(draft.scope) !== scopeKey(context.scope) || draft.state !== 'sending' || !draft.submission || draft.submission.receipt) {
    throw new Error(t('No valid publication snapshot for this PR and user.', 'Geen geldige publicatiesnapshot voor deze PR en gebruiker.'));
  }
  const { route, repositoryId } = context.scope;
  const base = `${route.organizationUrl}/${encodeURIComponent(route.project)}/_apis/git/repositories/${encodeURIComponent(repositoryId)}/pullRequests/${route.pullRequestId}/threads`;
  const anchor = draft.anchor;
  const comment = { content: draft.submission.body, parentCommentId: 0, commentType: 1 };
  let url = base;
  let body: object;
  let replyThreadId: number | undefined;
  if (anchor.kind === 'reply') {
    if (!isPositiveId(anchor.threadId)) throw new Error(t('The original thread is no longer available.', 'De oorspronkelijke discussie is niet meer beschikbaar.'));
    replyThreadId = anchor.threadId;
    const thread = threads.find(item => item.id === replyThreadId && !item.isDeleted);
    const parent = thread?.comments.find(item => item.id === 1) ?? thread?.comments.find(item => !item.isDeleted);
    if (!parent || !isPositiveId(parent.id)) throw new Error(t('The original thread is no longer available.', 'De oorspronkelijke discussie is niet meer beschikbaar.'));
    url += `/${replyThreadId}/comments`;
    body = { ...comment, parentCommentId: parent.id };
  } else if (anchor.kind === 'inline') {
    if (!anchor.filePath || !anchor.side || !anchor.start || !anchor.end || !anchor.firstIteration || !anchor.secondIteration || anchor.sourceCommit !== context.sourceCommit || anchor.targetCommit !== context.targetCommit) {
      throw new Error(t('The file location is incomplete or outdated.', 'De bestandslocatie is onvolledig of verouderd.'));
    }
    body = {
      comments: [comment], status: 1,
      threadContext: {
        filePath: anchor.filePath,
        [anchor.side === 'left' ? 'leftFileStart' : 'rightFileStart']: anchor.start,
        [anchor.side === 'left' ? 'leftFileEnd' : 'rightFileEnd']: anchor.end,
      },
      pullRequestThreadContext: {
        ...(anchor.changeTrackingId === undefined ? {} : { changeTrackingId: anchor.changeTrackingId }),
        iterationContext: { firstComparingIteration: anchor.firstIteration, secondComparingIteration: anchor.secondIteration },
      },
    };
  } else body = { comments: [comment], status: 1 };
  const response = await fetch(`${url}?api-version=7.1`, {
    method: 'POST', credentials: 'same-origin', redirect: 'error',
    signal: AbortSignal.timeout(15_000),
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(t(`Azure DevOps publication not confirmed (HTTP ${response.status}). Check the thread before publishing again.`, `Azure DevOps-publicatie niet bevestigd (HTTP ${response.status}). Controleer de discussie voordat je opnieuw publiceert.`));
  // Thread creation returns a thread with its initial comment; reply creation returns the comment itself.
  const result: unknown = await response.json().catch(() => undefined);
  if (record(result) && isPositiveId(result.id)) {
    if (replyThreadId !== undefined) {
      if (!('comments' in result)) return { threadId: replyThreadId, commentId: result.id };
    } else if (Array.isArray(result.comments) && result.comments.length === 1) {
      const created: unknown = result.comments[0];
      if (record(created) && isPositiveId(created.id)) return { threadId: result.id, commentId: created.id };
    }
  }
  throw new Error(t('Azure DevOps did not return valid publication IDs. Check the discussion before publishing again.', 'Azure DevOps gaf geen geldige publicatie-ID’s. Controleer de discussie voordat je opnieuw publiceert.'));
}
