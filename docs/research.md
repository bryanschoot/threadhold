# Research: a browser extension for Azure DevOps draft comments

Research date: November 13, 2026. The user explicitly chose the delivery format: **a browser extension that extends the existing Azure DevOps comment editor, and nothing else**. No separate review app or CLI.

## Findings

**Not demonstrated natively; partial external solutions exist.** The public Azure DevOps contracts examined did not expose a private draft-comment resource with CRUD and a separate submit-review operation. VS Code and terminal tools do offer local drafts. Browser extensions for Azure DevOps reviews also exist, but the full requested combination was not established in the sources examined. This does not prove universal absence.

## Native capabilities

Microsoft documents comments, replies, editing/deletion and votes. The guide shows the existing inline editor: enter text, then choose **Comment**. A draft PR concerns the PR itself, not one reviewer's private review. [Review guide](https://learn.microsoft.com/en-us/azure/devops/repos/git/review-pull-requests?view=azure-devops), [draft PR](https://learn.microsoft.com/en-us/azure/devops/repos/git/pull-requests?view=azure-devops#create-draft-prs).

The thread status `pending` means: “The issue in this comment is under review and awaits something else.” It is not a privacy or publication status. [Comment status](https://learn.microsoft.com/en-us/azure/devops/repos/git/review-pull-requests?view=azure-devops#change-comment-status).

REST 7.1 provides thread create/get/list/update and comment create/get/list/update/delete. The model contains `publishedDate`, `status`, `properties`, context and `isDeleted`, but no explicit draft/private visibility. `properties` is not access control; deletion is soft deletion. [Threads](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-threads?view=azure-devops-rest-7.1), [comments](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-thread-comments?view=azure-devops-rest-7.1), [models](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-threads/create?view=azure-devops-rest-7.1).

A search result claimed that **Save all comments** provides a native private-review workflow. That claim was **not adopted**: the Microsoft guide consulted does not describe the feature or document a corresponding private resource. Unsent editor text is not a proven durable agent-CRUD contract either.

## Browser alternatives

| Solution | Demonstrated capability | Not demonstrated |
| --- | --- | --- |
| DevOps PR View | Browser extension with additional fullscreen buttons, code zoom, comment highlights and scrolling improvements | Durable private draft-comment CRUD |
| Markdown PR — Azure DevOps PR Comments | Comments on rendered Markdown, inline threads, replies and edit/delete; the listing says it uses the existing session | A general durable draft layer across all native comment editors with agent CRUD |
| assist | Browser buttons for agent workflows; Azure DevOps checkout and address-comments | Browser-only private draft-comment CRUD without a local server |

[DevOps PR View: README and source](https://github.com/unimorphic/DevOpsPrView), [Markdown PR: Web Store](https://chromewebstore.google.com/detail/markdown-pr-%E2%80%94-azure-devop/habbfnkhgmnkhlbakjlnapadamjijbdh), [Markdown PR: source](https://github.com/chienyuanchang/rich-diff-comments), [assist: own documentation](https://staffordwilliams.com/assist/browser-extension/).

Markdown PR mentions “without closing drafts” when switching themes. This demonstrates preservation of open editor state, not independently the requested persistent create/read/update/delete lifecycle after a browser restart. The listing was not functionally tested live.

## Other environments: available, but outside the chosen format

| Solution | Finding |
| --- | --- |
| vscode-pr-azdo | Local draft comments and replies; UI edit/delete/publication; agent creation through VS Code language-model tools. Full agent list/update/delete not established |
| pr-review-ai | Internal `DraftCommentManager` with list/add/edit/remove/clearAll and local persistence; no external agent-CRUD interface established |
| tuicr | Agent-facing JSON CLI with create/read/delete and local sessions; separate update not documented |
| Microsoft Azure DevOps MCP / ado-axi | Tools for ordinary Azure DevOps comments; no private draft backend found |

[vscode-pr-azdo](https://github.com/vinaychandra/vscode-pr-azdo), [agent tool registration](https://github.com/vinaychandra/vscode-pr-azdo/blob/HEAD/src/chat/copilotReviewTools.ts), [pr-review-ai CRUD](https://github.com/Munikumar09/pr-review-ai/blob/HEAD/src/review/DraftCommentManager.ts), [tuicr CLI](https://github.com/agavra/tuicr/blob/HEAD/docs/REVIEW_CLI.md), [tuicr Azure limitations](https://github.com/agavra/tuicr/blob/HEAD/docs/AZURE.md), [Microsoft remote MCP](https://learn.microsoft.com/en-us/azure/devops/mcp-server/remote-mcp-server?view=azure-devops#repos), [ado-axi PR source](https://github.com/jeffreyhaen/ado-axi/blob/main/src/commands/pr.ts).

Important: tuicr documents that `:submit draft` on Azure DevOps performs ordinary publication. That command is therefore not a safe alternative to local storage.

## Browser platform: supporting evidence

- Content scripts can read/extend the DOM and send messages to the extension. Their JavaScript runs in isolation by default, but the DOM is shared. There is no automatic privacy guarantee for text displayed on the page. [Content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts).
- Web storage used from a content script accesses the website origin, not the extension origin. IndexedDB in the extension service worker is extension storage; IndexedDB is available there. Therefore, do not use `window.localStorage` or page-origin IndexedDB for drafts. [Storage and cookies](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies).
- `chrome.storage.local` is local; `sync` can synchronize data across browsers. Local data disappears when the extension is removed. Use `storage.local` only for small settings; use IndexedDB transactions for draft revisions and multiple tabs. [Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage).
- Service workers can stop; durable state must not live only in globals. [Lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).

## Risks of deferred publication

Inline feedback uses a side, positions, diff iterations and `changeTrackingId`; reusing an old line number can point to the wrong code. The definition specifies 1-based lines and 0-based offsets; the effective selection must be demonstrated through targeted checks. [Thread models](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-threads/create?view=azure-devops-rest-7.1), [iteration changes](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-iteration-changes/get?view=azure-devops-rest-7.1).

A comment may already have been published when a client sees an error or timeout. The create contracts examined do not document an exactly-once guarantee or atomic batch review. **[INFERENCE]** blindly republishing may create duplicates. Service hooks may already have forwarded the content; publishing and then deleting is not a private draft. [Create](https://learn.microsoft.com/en-us/rest/api/azure/devops/git/pull-request-threads/create?view=azure-devops-rest-7.1), [comment event](https://learn.microsoft.com/en-us/azure/devops/service-hooks/events?view=azure-devops#pull-request-commented-on).

## Design implications and reuse

Build a narrow Manifest V3 browser extension that preserves the existing comment editor and adds draft controls. Draft data stays in extension storage. The existing Azure DevOps publication step remains explicit and separate; no custom authentication backend or general-purpose PR client.

The earlier option of extending tuicr is dropped: it does not meet the browser-only requirement. Existing browser extensions are references for DOM integration, not proven replacements. Check their current licenses and maintenance status before reusing code; no source code has been copied or forked at this stage.

## Research boundaries

No authenticated tenant inspection, extension installation, multi-user privacy check or live Azure DevOps mutation was performed for this research. Public default branches may differ from released versions. Exact current DOM selectors, account context, session behavior and native submit-success detection must be investigated in an authorized environment before implementation. The UI sketch is based on Microsoft's published editor image, not a live capture from the user.
