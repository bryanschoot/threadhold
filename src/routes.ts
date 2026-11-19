import type { PrRoute } from './contracts';

/** Only explicit-project PR routes on supported HTTPS Azure DevOps hosts. */
export function parsePrRoute(input: string): PrRoute | undefined {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return;
    const parts = url.pathname.replace(/\/$/u, '').split('/').slice(1).map(part => decodeURIComponent(part));
    if (parts.some(part => !part || /[/\\\u0000-\u001f\u007f]/u.test(part))) return;
    let organization: string;
    let organizationUrl: string;
    if (url.hostname === 'dev.azure.com') {
      if (parts.length !== 6) return;
      organization = parts.shift()!;
      organizationUrl = `${url.origin}/${encodeURIComponent(organization)}`;
    } else if (/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.visualstudio\.com$/iu.test(url.hostname)) {
      organization = url.hostname.split('.')[0]!;
      organizationUrl = url.origin;
      if (parts.length === 6) organizationUrl += `/${encodeURIComponent(parts.shift()!)}`;
      if (parts.length !== 5) return;
    } else return;
    const [project, git, repository, pullrequest, id] = parts;
    if (!project || !repository || git?.toLowerCase() !== '_git' || pullrequest?.toLowerCase() !== 'pullrequest' || !id || !/^[1-9]\d*$/u.test(id)) return;
    const pullRequestId = Number(id);
    if (!Number.isSafeInteger(pullRequestId)) return;
    return { origin: url.origin, organization, organizationUrl, project, repository, pullRequestId, prUrl: `${url.origin}${url.pathname}` };
  } catch { return; }
}

/** Compare PR identity, including an explicit legacy collection when present. */
export function samePrRoute(left: PrRoute, right: PrRoute): boolean {
  return left.origin === right.origin &&
    left.organizationUrl.toLowerCase() === right.organizationUrl.toLowerCase() &&
    left.organization.toLowerCase() === right.organization.toLowerCase() &&
    left.project.toLowerCase() === right.project.toLowerCase() &&
    left.repository.toLowerCase() === right.repository.toLowerCase() &&
    left.pullRequestId === right.pullRequestId;
}
