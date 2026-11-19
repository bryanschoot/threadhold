# Changelog

## Unreleased

- Tag-triggered GitHub Releases with a built Chrome/Edge extension ZIP, gated by version matching, type checking and unit tests.
- Download-first installation and manual update instructions; no Node.js required for release downloads.
- Keep drafts until Azure DevOps confirms the exact thread and comment IDs returned by publication. Saved IDs survive interruptions for **Check publication**; missing IDs never fall back to matching comment text.
- Local design artifacts excluded from version control; installation documentation focuses on supported behavior and verification limits.
- Removed unused save-control API and unreachable publication branching; exact Monaco range capture no longer deduplicates all decorations.
- Browser tests configure their language explicitly instead of deriving it from test titles.

## 0.1.0

- English product-facing README and documentation, with reusable SVG logo assets for light and dark backgrounds.
- Symbol-only extension icons for the browser toolbar and extension manager in 16, 32, 48 and 128 px sizes.
- Browser-only Chrome/Edge extension for local Azure DevOps PR drafts.
- English interface as the default/fallback, with Dutch selected from the browser language.
- Durable general/inline/reply CRUD with account/PR scope, revisions and multi-tab conflict detection.
- Draft cards among native comments; no extra tab. Native avatar, typography and edit/delete icons.
- The pencil also opens the collapsed general native editor; Save and Ctrl+Enter update the draft locally. Cancel preserves the saved version.
- Exact multi-line Monaco anchors with start/end columns; reserved viewzones with bounded interactive overlays above the code layer.
- Native All Changes selections preserve side, lines and UTF-16 columns before opening the editor. All negative temporary thread IDs are supported; ambiguous selections are not guessed.
- Anonymous original Monaco models are linked only through their own commit-checked diff partner. Native reopening uses the visible selection button and also preserves collapsed anchors.
- Native Comment selected text supports the mouse, keyboard activation and F4, including a full line without a selection. Suggestions preserve their original Markdown through local saving, reloading, editing and publishing.
- All Changes columns count source code only; hidden accessibility labels such as Plus do not shift the selection.
- Narrow DevOps screens use a separate native comment panel outside Monaco. Drafts bind that panel to the exact native selection marker, including multi-line suggestions and native reopening; ambiguous editor locations are rejected.
- The hidden Bolt measurement textarea is explicitly excluded, even when DevOps does not set aria-hidden.
- Publish drafts beside Approve, or beside Publish on draft PRs, with confirmation, a durable publication journal and remote ID verification. No automatic retry, approval or resolution.
- Built-in English/Dutch Draft help with local browser-agent CRUD, verifiable storage results and an explicit publication boundary; accessible by keyboard and screen reader.
- Local Markdown rendering with sanitization, safe links and readable DevOps mention references; source content remains exactly preserved for editing and publishing.
- General drafts appear as a native card near the composer; avatar selection requires a matching identity and times are displayed relatively.
- Unpacked distribution; no published Chrome/Edge store listing.
