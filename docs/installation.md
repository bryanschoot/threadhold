# Install Threadhold

## Source code and unpacked extension

Requirements: Node.js 22 or later, npm, and Chrome/Edge 124 or later. The repository is private; your GitHub account must have access.

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
| Publish drafts (n) | Drafts plaatsen (n) |
| Draft help | Drafthulp |

The instructions below use English extension labels.

- Write in the **native editor** and choose **Save as draft**. The editor closes and the draft card appears only after durable local storage succeeds. The card renders Markdown locally with sanitization; the original Markdown remains the exact source for editing and publishing. DevOps mention references remain readable without external identity resolution.
- The **Edit** pencil opens the original native editor with the saved text, even when the general composer is collapsed. Other existing editor content is not overwritten. **Save** and Ctrl+Enter update the local draft; its ID stays the same and its revision increases.
- **Cancel** discards only the unsaved edit. The last saved draft remains.
- The **Delete draft** trash icon asks for confirmation and removes only the local draft.
- There is no draft tab or navigation index. Drafts appear alongside ordinary comments. An unmounted or outdated location gets a recovery card among the Overview comments.
- After code changes, use the relinking action, open the intended new native editor and confirm attaching the draft there. There is no automatic line remapping.
- **Publish drafts (n)** beside **Approve**, or beside the native **Publish** action on a draft PR, asks for confirmation and then publishes the saved drafts one at a time. This does not approve the PR, publish the draft PR itself or resolve threads.
- If a publication result cannot be verified, the draft is retained as unknown and the batch stops. **Check publication** makes GET requests only. **Edit again** requires explicit acknowledgment that publication may be duplicated. There is no automatic retry.

## Native views and compatibility

General comments, replies and inline drafts use the existing Azure DevOps editor. Single- and multi-line anchors preserve start and end lines and columns, in inline view and on both sides of side-by-side view. In **All Changes**, the extension captures the native side/line selection before focus and DOM replacement; temporary negative thread IDs are not limited to `-1`. The Monaco single-file editor uses the public editor API for selection, viewzone spacing and bounded interactive overlays above the code layer, not hidden React state. An anonymous original model is linked only through its unique modified partner within the same diff, with the repository and source commit checked.

Azure DevOps does not provide a stable contract for this DOM extension. Unknown or ambiguous locations do not receive a guessed draft binding. A UI update may require adapter changes. Ordinary native publication without a draft binding remains unchanged.

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

- Drafts live in IndexedDB in the **extension origin**, separated by organization, project, repository, PR and stable user ID.
- No PAT, external backend, telemetry or browser sync. Context is read through GET requests using the existing browser session. Only the explicitly confirmed publication action sends comment POST requests to the same Azure DevOps origin.
- Threadhold does not encrypt the database. Scripts on the Azure DevOps page can read draft text displayed there. “Local only” does not mean “invisible to page code.”
- Multi-tab updates use revision checks. A conflict does not overwrite another revision; the native editor retains the text.
- Interrupted publication becomes unknown when the service worker restarts. There is no automatic retry or exactly-once guarantee.
- Removing the extension or losing the browser profile can irreversibly erase drafts. There is no cloud backup.

## Verification boundaries

- The branding update passed type checking and a production build. The generated manifest includes symbol-only toolbar and extension-manager icons at 16, 32, 48 and 128 px. The README and logo were visually inspected in a browser; no test suites or live Azure DevOps publication checks were run for this update.
- The narrow native comment panel recovery work was verified with type checking, a production build and 28 passing targeted browser cases. The full unit and browser suites were not rerun for that work.
- All Changes has eight selection cases: inline/split, left/right, single-/multi-line, including refresh, native editing and exact publication coordinates against the test backend. Additional cases check keyboard activation and safely rejecting a selection across both sides without losing text.
- Six additional cases run a real Monaco 0.57 editor in the observed textarea input mode. They check refresh, mouse-clickable Edit/Delete, local editing/cancellation, panel boundaries, horizontal and vertical scrollbar interaction, wheel scrolling and narrowing in inline right and split left/right.
- Ten real-Monaco cases check Comment selected text through the mouse, Enter and F4 in inline right and split left/right, plus F4 without a selection for a full line. Native Insert a suggestion is saved locally, reloaded and edited; exact Markdown and selection coordinates are checked during publication against the isolated test backend. All Changes fixtures also contain the hidden Plus accessibility label to catch shifted source columns.
- Twelve additional cases use the live-observed narrow panel structure outside Monaco: inline right and split left/right, single-line comments and multi-line suggestions through F4, the mouse and Enter. They check saving, reloading, native reopening, Ctrl+Enter and exact payloads against the test backend. Desktop and panel fixtures include a Bolt measurement textarea without aria-hidden; it must not introduce an extra draft button or bind to the wrong input.
- The draft-PR header and collapsed general composer have regression coverage. English/Dutch preview tests check Markdown, unsafe HTML/URLs, preserved source content, mention references, avatar identity, relative time and card placement.
- Browser cases load the real unpacked extension in isolated profiles with a test backend. The real Monaco surface was visually inspected; the test host does not include full DevOps styling. This is not a pixel comparison with the current Azure DevOps UI or a stable DOM contract.
- Previously, a fresh browser agent without repository knowledge discovered Draft help and performed local CRUD while preserving IDs/revisions and making zero write requests. The current suite retains the help/CRUD regressions.
- User-provided live DOM readings showed two native variants: a bolt-panel outside Monaco on narrow screens, and a zone-widget inside Monaco on desktop. The new panel regression failed before the fix because Save as draft was missing and passed afterward. After reloading Threadhold, the user reported “Seems to work now” (translated from Dutch). This is a positive user observation, not an independent full live recheck: navigation from that agent session continued to fail with relay extension disconnected. No browser/tab close commands were issued through the relay; automated checks use disposable test profiles only.
- No real Azure DevOps comments were published, threads changed or attachments uploaded during that recovery work. Live server publication, full DevOps mention-name resolution and store installation are not claimed as verified.
