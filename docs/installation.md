# Install Threadhold

## Download a release

You need Chrome/Edge 124 or later. Download `threadhold-<version>-chrome-mv3.zip` from [GitHub Releases](https://github.com/bryanschoot/threadhold/releases), under **Assets**. Do not select the automatic **Source code** archives: those are not built extensions. Private-repository downloads require a GitHub account with access. If no release exists yet, build from source below.

1. Extract the ZIP into a permanent folder. It should contain `manifest.json` directly.
2. Open `chrome://extensions` or `edge://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select that folder.
4. Open the Threadhold popup, enter `dev.azure.com` or your specific `organization.visualstudio.com` host, and choose **Grant access**.
5. Open or refresh an Azure DevOps PR.

No Node.js installation is needed for this download. The ZIP is not a signed store package; developer mode remains necessary.

## Update an unpacked installation

Updates are manual. Close Azure DevOps tabs after saving any unsaved editor text, replace the contents of the existing extension folder with the extracted new release, then click **Reload** on the extension's card in `chrome://extensions` or `edge://extensions`. Reopen the PR.

Keep the same folder and browser profile, and do not remove/reinstall the extension: removing it can erase local drafts. There is no automatic update or cloud backup.

## Build from source

Requirements: Node.js 22 or later, npm, Chrome/Edge 124 or later, and access to the repository.

```sh
git clone https://github.com/bryanschoot/threadhold.git
cd threadhold
npm ci
npm run typecheck
npm test
npm run build
```

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select `.output/chrome-mv3` in the repository.
4. Open Threadhold from the extension button. Enter `dev.azure.com` or your specific `organization.visualstudio.com` host and choose **Grant access**. Confirm the browser permission.
5. Open or refresh the Azure DevOps PR. Open a native comment editor; **Save as draft** appears beside its existing actions.

Refresh an already-open tab after updating the extension. Revoking access stops new storage requests; refresh open tabs to remove their existing controls. Saved drafts remain local as long as the profile and extension are retained.

`npm run zip` creates a distribution archive in `.output`. This is not a signed store installation; extract it for **Load unpacked**. No Chrome/Edge store listing has been published.

The extension uses the approved Threadhold symbol without text for its toolbar and extension-manager icons. The README uses the full wordmark, with light- and dark-background variants.

## Controls

The extension follows the browser's `navigator.language`. English is the default and fallback; `nl`, `nl-NL` and `nl-BE` use Dutch. Buttons, the popup, accessible labels, messages and confirmations are translated. Draft content and native DevOps controls remain unchanged.

| English | Dutch |
| --- | --- |
| Save as draft | Opslaan als draft |
| Edit / Save / Cancel | Bewerken / Opslaan / Annuleren |
| Delete draft | Draft verwijderen |
| Retry | Opnieuw proberen |
| Reattach / Reattach draft here / Cancel reattach | Opnieuw koppelen / Draft hier koppelen / Koppelen annuleren |
| Publish drafts (n) | Drafts plaatsen (n) |
| Draft help | Drafthulp |

The instructions below use English extension labels.

- Write in the **native editor** and choose **Save as draft**. The draft card appears only after durable local storage succeeds. The editor closes only if it is still in the same edit session and its text has not changed during the write. The card renders Markdown locally with sanitization; the original Markdown remains the exact source for editing and publishing. DevOps mention references remain readable without external identity resolution.
- The **Edit** pencil opens the original native editor with the saved text, even when the general composer is collapsed. Other existing editor content is not overwritten. **Save** and Ctrl+Enter update the local draft; its ID stays the same and its revision increases.
- **Cancel** discards only the unsaved edit. The last saved draft remains.
- The **Delete draft** trash icon asks for confirmation and removes only the local draft.
- There is no draft tab or navigation index. Drafts appear alongside ordinary comments. An unmounted or outdated location gets a recovery card among the Overview comments.
- If a draft location is outdated, choose **Reattach** on its card, open the intended native comment editor and choose **Reattach draft here**. There is no automatic line remapping. **Cancel reattach** restores the normal draft buttons and leaves the saved draft and editor text unchanged. Switching PRs also clears reattach mode.
- **Publish drafts (n)** beside **Approve**, or beside the native **Publish** action on a draft PR, asks for confirmation and then publishes the saved drafts one at a time. This does not approve the PR, publish the draft PR itself or resolve threads.
- Threadhold keeps the draft until a GET in the original PR confirms the receipt's exact thread and comment IDs, author and content. Replies must be in their original discussion; inline comments must match the original file, side and range. Matching text alone never confirms publication.
- If publication cannot be verified, the draft is retained as unknown and the batch stops. **Check publication** makes no remote writes and can verify a saved receipt after reload. Without a valid receipt, including for older pending drafts, inspect Azure DevOps manually. **Edit again** requires explicit acknowledgment that publication may be duplicated. There is no automatic POST retry.

## Native views and compatibility

General comments, replies and inline drafts use the existing Azure DevOps editor. Single- and multi-line anchors preserve start and end lines and columns, in inline view and on both sides of side-by-side view. In **All Changes**, the extension captures the native side/line selection before focus and DOM replacement; temporary negative thread IDs are not limited to `-1`. The Monaco single-file editor uses the public editor API for selection, viewzone spacing and bounded interactive overlays above the code layer, not hidden React state. An anonymous original model is linked only through its unique modified partner within the same diff, with the repository and source commit checked.

Azure DevOps does not provide a stable contract for this DOM extension. Unknown or ambiguous locations do not receive a guessed draft binding. A UI update may require adapter changes. Ordinary native publication without a draft binding remains unchanged.

If Threadhold cannot load the PR integration or initialize local storage, choose **Retry** in its message on that PR. This does not reload the page or change native editor text. Threadhold does not retry PR requests automatically.

## Browser agents

An agent starts with **Draft help** beside the PR actions. This built-in, accessible dialog provides the CRUD procedure, verifiable storage results and the safe default instruction: local drafts only; publish solely on explicit request. No repository knowledge, CLI, MCP server or local port is required.

| Action | Control |
| --- | --- |
| Create/update | `data-threadhold-action="save"` |
| Read | `data-threadhold-card`, full `.th-body` |
| Edit | `data-threadhold-action="edit"` |
| Delete | `data-threadhold-action="delete"`, followed by visible confirmation |
| Locate | `data-threadhold-action="locate"` |
| Check publication | `data-threadhold-action="check"` |

Cards and associated controls have `data-threadhold-draft-id` and `data-threadhold-revision`. Find controls within the intended card/editor. Agent CRUD uses the draft actions; Ctrl+Enter is local only when a **draft edit** is open. Do not use that shortcut in an ordinary new comment editor: Azure DevOps still publishes there. This is not a sandbox against arbitrary native actions.

Wait for the resulting card, higher revision or removal, not a fixed sleep or merely a successful click. Cards expose `data-threadhold-state`; live status messages have `data-threadhold-status` and `role=status/alert`, and busy controls use `aria-busy`. If draft controls are missing or publication status is unknown, the agent stops and reports it, without falling back to native publication.

## Privacy and recovery

- Drafts live in IndexedDB in the **extension origin**, separated by organization (and explicit collection for legacy Visual Studio URLs), project, repository, PR and stable user ID.
- No PAT, external backend, telemetry or browser sync. Context is read through GET requests using the existing browser session. Only the explicitly confirmed publication action sends comment POST requests to the same Azure DevOps origin.
- Threadhold does not encrypt the database. Scripts on the Azure DevOps page can read draft text displayed there. “Local only” does not mean “invisible to page code.”
- Multi-tab updates use revision checks. A conflict does not overwrite another revision; the native editor retains the text.
- Switching PRs in the same browser document stops the batch from starting another POST. That document can still record and verify the original attempt; ordinary draft actions remain scoped to the current PR.
- On service-worker restart, interrupted publication becomes unknown. A receipt already stored is retained, and the original browser document can still supply a late receipt for that exact attempt. Closing or reloading the document before it can save the receipt can leave the result unknown. There is no exactly-once guarantee.
- Removing the extension or losing the browser profile can irreversibly erase drafts. There is no cloud backup.

## Verification boundaries

- Unit tests cover storage isolation, revisions, publication reconciliation, routes and exact selection ranges.
- Browser tests load the real unpacked extension in temporary profiles with an isolated test backend. They cover local CRUD, reloads, native editing, English/Dutch controls, Markdown sanitization, inline/split selections and narrow panels.
- Fixture publication checks cover request payloads, same-document PR switches and recovery after an unconfirmed GET without posting real Azure DevOps comments. They do not prove compatibility with every live Azure DevOps DOM or stylesheet.
- Live server publication, full DevOps mention-name resolution and store installation are not claimed as verified. Azure DevOps UI changes can require adapter updates.

## Releasing

The GitHub Actions release workflow runs only when a `v<version>` tag is pushed, not when a pull request is opened or merged.

1. Update `package.json` and `package-lock.json` to the release version and record the changes in `CHANGELOG.md`.
2. Merge the reviewed changes, then push a matching tag, for example `v0.1.1` for version `0.1.1`.
3. The workflow installs locked dependencies, checks the tag/version match, runs type checking and unit tests, and builds the Chrome MV3 ZIP.
4. On success, a separate publication job attaches `threadhold-<version>-chrome-mv3.zip` to a GitHub Release with generated release notes.

Only the built extension is included in the downloadable extension ZIP, not repository source, tests or local design files. GitHub also adds its own source-code archives; those are not installation packages. Browser integration tests are a separate check and do not run in this release workflow.

The workflow uses GitHub's built-in token; no personal access token or store credentials are needed. A release provides a downloadable unpacked extension, not store publication or automatic updates.
