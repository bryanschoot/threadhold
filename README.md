<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/wordmark-dark.svg">
    <img src="docs/assets/wordmark.svg" alt="Threadhold" width="420" height="92">
  </picture>
</p>

<h1 align="center">Review now. Publish when you're ready.</h1>

<p align="center">
  Local drafts for Azure DevOps pull requests.<br>
  Write in the editor you already use. Keep your feedback until you're ready to share it.
</p>

<p align="center">
  <strong>Chrome &amp; Edge</strong> · Native comment editor · No PAT required
</p>

<p align="center">
  <a href="#get-started">Get started</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#local-by-design">Privacy</a>
</p>

---

## Your review, on your terms

A good review takes more than one pass. Threadhold lets you collect your thoughts without turning every comment into a notification.

- **Stay in the flow.** Draft inline comments, general PR comments and replies in the existing Azure DevOps editor. No separate app, tab or review panel.
- **Keep the context.** Drafts sit alongside the conversation, with Markdown previews and their original code selections.
- **Come back to it.** Saved drafts survive page reloads. Edit, cancel an edit or delete a draft before sharing it.
- **Make publishing a decision.** A dedicated **Publish drafts (n)** action asks for confirmation. It does not approve the PR or resolve threads.
- **Work with a browser agent.** Built-in **Draft help** explains how an agent can create, read, edit and delete local drafts through the same browser controls. No agent CLI or local server.

## How it works

1. **Write.** Open an Azure DevOps PR and write in its native comment editor.
2. **Hold.** Choose **Save as draft**. Once saved locally, your comment appears with a **Draft** badge. Use its edit and delete controls to refine your review.
3. **Share.** When you're ready, choose **Publish drafts (n)** next to **Approve**, or next to **Publish** on a draft PR. Confirm to send the saved drafts to Azure DevOps.

Saving a draft does **not** post an Azure DevOps comment. Ordinary Azure DevOps comment actions still work as usual; Threadhold does not turn them into draft actions.

The extension uses English by default and Dutch for Dutch browser locales.

## Get started

**Download the built extension from [GitHub Releases](https://github.com/bryanschoot/threadhold/releases).** Choose `threadhold-<version>-chrome-mv3.zip` under **Assets**, not GitHub's automatic source-code archives. If no release is available yet, use the source-build instructions below. Private-repository downloads require a GitHub account with access.

You need **Chrome or Edge 124+**. Node.js is not required for a release download. There is no Chrome Web Store or Edge Add-ons listing yet.

1. Extract the ZIP into a permanent folder; `manifest.json` is at its root.
2. Open `chrome://extensions` or `edge://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select the extracted folder.
4. Open the Threadhold extension popup, enter `dev.azure.com` or your specific `organization.visualstudio.com` host, and grant access.
5. Open or refresh an Azure DevOps PR. **Save as draft** appears beside the native comment actions.

### Build from source

For development or before the first release, install **Node.js 22+** and run:

```sh
git clone https://github.com/bryanschoot/threadhold.git
cd threadhold
npm ci
npm run build
```

Load `.output/chrome-mv3` as the unpacked extension.

For updates, recovery and detailed controls, see the [installation and usage guide](docs/installation.md).

## Local by design

- **Stored in your browser profile.** Drafts live in the extension's IndexedDB, scoped to your account and PR. They are not Azure DevOps comments until you publish them.
- **No external backend, telemetry or browser sync.** Threadhold uses your existing Azure DevOps browser session; no personal access token is needed.
- **Access is opt-in.** You choose which supported Azure DevOps host the extension can access.

Local does not mean encrypted or invisible: Threadhold does not encrypt its database, and scripts with access to the Azure DevOps page can read draft text displayed there. Removing the extension or losing your browser profile can erase your drafts. There is no cloud backup.

Publishing is not guaranteed exactly once. If a result cannot be verified, Threadhold keeps the draft with an unknown status and stops the batch rather than retrying automatically. See [privacy and recovery](docs/installation.md#privacy-and-recovery) for details.

## Project status

Threadhold **0.1.0** is a working unpacked Chrome/Edge extension, not a published store release. It extends the Azure DevOps page UI; Azure DevOps changes can require compatibility updates.

The name comes from holding a review thread until you're ready to publish. Domain availability and trademark rights have not been verified.

## Documentation & development

- [Installation, usage, browser agents and privacy](docs/installation.md)
- [Changelog](CHANGELOG.md)
- [Research and existing solutions](docs/research.md)
- [Technical approach and implementation plan](docs/implementation-plan.md)
- Brand assets: [symbol](docs/assets/logo.svg), [light-background wordmark](docs/assets/wordmark.svg), [dark-background wordmark](docs/assets/wordmark-dark.svg)

Built with TypeScript and WXT. Use `npm run dev` for development, `npm run typecheck` for type checking, `npm test` for unit tests, and `npm run test:browser` for the isolated browser suite. `npm run zip` creates an unpacked distribution archive; it is not a signed store package.

Releases are built by GitHub Actions when a `v<version>` tag is pushed. The tag must match `package.json`; type checking and unit tests must pass before the extension ZIP is published. See [release and update instructions](docs/installation.md#releasing).
