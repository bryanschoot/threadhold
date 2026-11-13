import { scopeKey, type Draft } from './contracts';
import type { PrContext, RemoteThread } from './ado-context';
import { t } from './i18n';

/** Called only after explicit publication consent and a durable beginSubmit snapshot. Never retries. */
export async function postDraft(draft: Draft, context: PrContext, threads: RemoteThread[]): Promise<void> {
  if (scopeKey(draft.scope) !== scopeKey(context.scope) || draft.state !== 'sending' || !draft.submission) {
    throw new Error(t('No valid publication snapshot for this PR and user.', 'Geen geldige publicatiesnapshot voor deze PR en gebruiker.'));
  }
  const { route, repositoryId } = context.scope;
  const base = `${route.organizationUrl}/${encodeURIComponent(route.project)}/_apis/git/repositories/${encodeURIComponent(repositoryId)}/pullRequests/${route.pullRequestId}/threads`;
  const anchor = draft.anchor;
  const comment = { content: draft.submission.body, parentCommentId: 0, commentType: 1 };
  let url = base;
  let body: object;
  if (anchor.kind === 'reply') {
    const thread = threads.find(item => item.id === anchor.threadId && !item.isDeleted);
    const parent = thread?.comments.find(item => item.id === 1) ?? thread?.comments.find(item => !item.isDeleted);
    if (!parent) throw new Error(t('The original thread is no longer available.', 'De oorspronkelijke discussie is niet meer beschikbaar.'));
    url += `/${anchor.threadId}/comments`;
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
  // A successful HTTP response alone does not remove the local draft: GET reconciliation does.
}
