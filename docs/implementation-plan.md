# Threadhold — browser extension and implementation

## Product contract

A Chrome/Edge extension exclusively within the existing Azure DevOps PR. No separate review app, CLI, MCP server, local server or desktop process.

- **Create:** open the native editor, write, choose **Save as draft**.
- **Read:** the full draft appears among ordinary comments; no extra tab or index.
- **Update:** the pencil opens the native editor. **Save** and Ctrl+Enter remain local. The ID stays the same and the revision increases. **Cancel** preserves the last saved version.
- **Delete:** trash icon with confirmation; local storage only.
- **Publish:** **Publish drafts (n)** beside **Approve**, with explicit confirmation. No automatic approval or resolution.

General PR comments, replies to existing threads and inline comments with multi-line selections are within this contract. A draft is not a server comment with `pending` status. Editing or deleting published comments is out of scope.

## UI

Draft cards reuse the native comment structure and Azure DevOps classes: avatar, author, time, Markdown body area and edit/delete icons in the upper-right corner. Only a small **Draft** badge distinguishes the local card. The editor, toolbar, mentions and preview remain Azure DevOps controls.

During draft editing, the read card disappears and native publication buttons are hidden. The local **Save** action replaces that operation; Ctrl+Enter is also handled locally only within that draft edit. Unbound native editors remain unchanged.

The editor closes only after storage is confirmed. Storage errors or revision conflicts preserve the editor text. A draft must not overwrite other existing editor content. Unmounted or outdated locations remain readable as recovery cards among the Overview comments.

## Technical structure

| Component | Choice and responsibility |
| --- | --- |
| Platform | Manifest V3, WXT, TypeScript; Chrome/Edge 124+ |
| Content script | Isolated world; native controls and draft cards |
| Editor adapter | DOM context, text reading/restoration, exact general/reply/inline binding |
| Monaco integration | Early MAIN-world bridge; public editor selections and viewzones |
| Service worker | Sender/scope validation, storage and authorized bridge commands |
| Draft core | CRUD, CAS revisions, idempotent creation, publication journal |
| Storage | IndexedDB in the extension origin; no website localStorage |
| Authentication | Existing Azure DevOps browser session; no PAT |
| Agents | The same visible browser controls, IDs and revisions |

The Monaco bridge receives only necessary location data, not draft bodies or database access. No public `window.postMessage` CRUD contract, hidden React state or internal Monaco services. The public API and current native DOM still present compatibility risks.

## Context and durable model

Scope consists of organization, project ID, repository ID, PR ID and stable user ID. A PR number or display name alone is insufficient. Unknown identity or an ambiguous location blocks binding.

A draft stores a UUID, scope, revision, body and timestamps, plus:

- `general`, `inline` or `reply`;
- inline: file, side, exact start/end positions, viewed iteration, source/target commit and optional changeTrackingId;
- reply: existing thread ID;
- state `saved`, `sending` or `unknown`, with a durable submission record when publishing.

Staleness is derived from the current heads/iteration or a deleted thread. No silent remapping after a push or rename. Explicit relinking preserves the ID and increases the revision.

Update and delete require the revision that was read. Multi-tab conflicts overwrite nothing. Idempotent creation uses a request ID; the same request with different content conflicts. The service worker recovers interrupted `sending` records as `unknown`.

## Publication

1. Read the current identity, PR, heads, threads and saved drafts.
2. Block stale anchors, unknown publication status and conflicting open editor content.
3. Ask for explicit confirmation of the number of saved drafts.
4. Durably store each draft's exact body and existing remote IDs as `sending` before the POST request.
5. Send one same-origin REST request: a new thread for general/inline, or a comment on the existing thread for a reply. No resolution or vote.
6. Confirm through GET a unique new remote comment with the same author, body and location. HTTP success alone is insufficient to delete the local draft.
7. On an error, timeout or ambiguity: retain as `unknown`, stop the batch and do not retry automatically.

There is no exactly-once guarantee across network interruptions. **Check publication** is read-only. Releasing a draft for editing again requires acknowledgment of the duplication risk.

Documented endpoints:

- [Create threads](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-threads/create?view=azure-devops-rest-7.1)
- [Create replies](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-thread-comments/create?view=azure-devops-rest-7.1)

## Permissions and privacy

Explicitly granted optional host permission for `dev.azure.com` or a specific legacy organization host; dynamic registration through `scripting`. No `<all_urls>`, cookies, history, debugger or nativeMessaging permission.

The service worker validates the extension sender, top-level frame, allowed origin/PR route, scope and payload. No `externally_connectable`, cloud backend, browser sync or telemetry containing bodies. Bundled scripts, no runtime CDN.

Threadhold does not encrypt local storage. Page code can read text displayed on the page. Removing the extension or losing the profile can destroy drafts. “Private” here means not published as an Azure DevOps comment, not invisible to every process or script.

## Agent controls

| Action | Visible contract |
| --- | --- |
| Create/update | `data-threadhold-action="save"` in the intended native editor |
| Read | `data-threadhold-card`, full `.th-body` |
| Edit | `data-threadhold-action="edit"` on the card |
| Delete | `data-threadhold-action="delete"`, followed by confirmation |
| Identity | `data-threadhold-draft-id` and `data-threadhold-revision` |

Agents wait for the storage result/revision, not fixed sleeps. Ctrl+Enter is local only during an open draft edit; ordinary native editors retain their own publication behavior.

## Verification and distribution

Targeted tests cover storage isolation, revision conflicts, context/anchor binding, publication payloads and preservation on failure. Browser fixtures load the real unpacked extension and exercise CRUD, reload, native draft editing and confirmed batch publication without publishing company data.

The real Azure DevOps interface also requires visual and local CRUD verification: a fixture does not prove lasting DOM compatibility. Real publication checks require separate permission; without them, no claim of live publication is made.

Deliver source code, an unpacked build and installation/privacy instructions. A ZIP is not a signed store installation. Publisher account steps and store approval do not yet constitute a published listing.
