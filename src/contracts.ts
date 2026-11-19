export type DraftKind = 'general' | 'inline' | 'reply';
export type DraftState = 'saved' | 'sending' | 'unknown';
export interface PrRoute {
  origin: string;
  organization: string;
  project: string;
  repository: string;
  pullRequestId: number;
  organizationUrl: string;
  prUrl: string;
}
export interface Scope {
  route: PrRoute;
  projectId: string;
  repositoryId: string;
  userId: string;
}
export interface Position { line: number; offset: number }
export interface Anchor {
  kind: DraftKind;
  filePath?: string;
  side?: 'left' | 'right';
  start?: Position;
  end?: Position;
  firstIteration?: number;
  secondIteration?: number;
  changeTrackingId?: number;
  sourceCommit: string;
  targetCommit: string;
  threadId?: number;
  editorKey: string;
  pageUrl: string;
}
export interface PublicationReceipt { threadId: number; commentId: number }
export interface Draft {
  id: string;
  scope: Scope;
  anchor: Anchor;
  body: string;
  revision: number;
  state: DraftState;
  createdAt: string;
  updatedAt: string;
  submission?: { body: string; startedAt: string; receipt?: PublicationReceipt };
}
export type DraftRequest =
  | { action: 'list'; scope: Scope }
  | { action: 'get'; scope: Scope; id: string }
  | { action: 'create'; scope: Scope; anchor: Anchor; body: string; requestId: string }
  | { action: 'update'; scope: Scope; id: string; ifRevision: number; body: string; anchor?: Anchor }
  | { action: 'delete'; scope: Scope; id: string; ifRevision: number }
  | { action: 'beginSubmit'; scope: Scope; id: string; ifRevision: number; body: string }
  | { action: 'recordSubmitReceipt'; scope: Scope; id: string; attempt: number; receipt: PublicationReceipt }
  | { action: 'completeSubmit'; scope: Scope; id: string; attempt: number; verified?: PublicationReceipt }
  | { action: 'finishSubmit'; scope: Scope; id: string; ifRevision: number; outcome: 'published' | 'failed'; remoteThreadId?: number; remoteCommentId?: number };
export type DraftResult = { drafts: Draft[] } | { draft: Draft } | { deleted: true } | { acknowledged: true };
export type ExtensionRequest = { channel: 'threadhold'; request: DraftRequest };
export type ExtensionResponse = { ok: true; result: DraftResult } | { ok: false; error: { code: string; message: string } };
export function isPositiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
export function scopeKey(scope: Scope): string {
  const { route } = scope;
  const key = [route.origin.toLowerCase(), route.organization.toLowerCase(), scope.projectId.toLowerCase(), scope.repositoryId.toLowerCase(), route.pullRequestId, scope.userId.toLowerCase()];
  // Keep the existing keys for modern and collection-less URLs.
  if (route.origin.endsWith('.visualstudio.com') && route.organizationUrl !== route.origin) key.push(route.organizationUrl.toLowerCase());
  return JSON.stringify(key);
}
