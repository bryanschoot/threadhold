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

In Azure DevOps, posting feedback one comment at a time can notify the author before you've finished reviewing. Threadhold lets you save inline comments, general comments and replies as local drafts in the native editor. You can revisit them after reloading the page and publish them together when you're ready.

## How it works

1. **Write.** Open an Azure DevOps PR and write in its native comment editor.
2. **Hold.** Choose **Save as draft**. Your comment appears alongside the conversation with a **Draft** badge, a Markdown preview and its original code selection for inline comments. Use the draft's edit or delete controls to refine your review.
3. **Share.** When you're ready, choose **Publish drafts (n)** next to **Approve**, or next to **Publish** on a draft PR. Confirm to send the saved drafts to Azure DevOps.

Saving a draft does **not** post an Azure DevOps comment. Ordinary Azure DevOps comment actions still work as usual; Threadhold does not turn them into draft actions.

Use **Draft help** for the available controls, including how to work with a browser agent.

## Get started

**Download the extension from [GitHub Releases](https://github.com/bryanschoot/threadhold/releases/latest).** Under **Assets**, choose `threadhold-<version>-chrome-mv3.zip`, not a source-code archive.

You need **Chrome or Edge 124+**. No Node.js installation is required.

1. Extract the ZIP into a permanent folder; `manifest.json` is at its root.
2. Open `chrome://extensions` or `edge://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select the extracted folder.
4. Open the Threadhold extension popup, enter `dev.azure.com` or your specific `organization.visualstudio.com` host, and grant access.
5. Open or refresh an Azure DevOps PR. **Save as draft** appears beside the native comment actions.

See the [installation and usage guide](docs/installation.md) for manual updates, supported languages and troubleshooting.

## Local by design

Drafts are stored in your browser profile, scoped to your account and pull request. They are not synced or backed up; removing the extension can erase them. If publication can't be confirmed, use **Check publication** rather than posting again. See [privacy and recovery](docs/installation.md#privacy-and-recovery).
