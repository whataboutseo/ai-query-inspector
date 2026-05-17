# Chrome Web Store listing — AI Query Inspector

Source-of-truth copy for the CWS Developer Dashboard. Update this file when listing copy changes; the dashboard is the live deliverable.

---

## Single purpose

> Inspect ChatGPT conversation payloads and capture Google, Bing, or DuckDuckGo search results locally, so you can compare what AI cites against what search ranks — entirely on-device.

This is the line to paste into the "Single purpose" field in the dashboard.

---

## Short description (132 chars max)

> Compare what ChatGPT cites against Google, Bing, or DuckDuckGo rankings — locally, on-device, with zero data leaving your browser.

(124 characters.)

---

## Detailed description

> AI Query Inspector turns your browser into a side-by-side workbench for AI search and organic search.
>
> Open a ChatGPT conversation and the extension reads its native payload — fan-out queries, cited sources, considered sources, and the model used. Open Google, Bing, or DuckDuckGo and the extension captures the results page locally. The Compare tab pairs the two so you can see which domains ChatGPT cited that Google ranks, which it cited that Google doesn't, and which Google ranks that ChatGPT missed.
>
> Built for SEOs, content strategists, and AI researchers who want a fast, private feedback loop on AI citation behavior — without sending anything to a SaaS dashboard.
>
> **What you get**
> • Fan-out tree view of every retrieval query ChatGPT issued, per turn
> • Citation strength chart and cited-vs-considered source counts
> • Local SERP capture from Google, Bing, and DuckDuckGo
> • Precision / recall / F1 / Jaccard overlap between ChatGPT and the SERP
> • Rank-comparison table with directional arrows for each domain
> • Per-conversation history with named runs, tags, notes, and run-vs-run diff
> • Full snapshot export and import for backup or moving between devices
> • Light and dark mode, single-pane popup, full-page dashboard
>
> **Privacy by design**
> • Nothing leaves your device. No analytics. No cloud sync. No third-party endpoints.
> • Auto-capture is on by default and can be turned off in Settings.
> • All data lives in chrome.storage.local. Reset everything with one click.
> • Fonts and assets are bundled — the extension makes zero external requests at runtime.
>
> **Permissions**
> • Reads the ChatGPT conversation JSON from chatgpt.com / chat.openai.com using your existing logged-in session.
> • Reads the SERP DOM on google.com, bing.com, and duckduckgo.com to extract rankings and SERP features.
> • Persists captures and preferences locally via chrome.storage.local.
> • Opens a search tab when you use the "Capture Google SERP" handoff button.
>
> See the in-app **Settings → Privacy & safety** card for the full opt-out, and the privacy policy linked from the Chrome Web Store listing for the full data inventory.

---

## Category

**Productivity** (primary). Optionally also list under **Developer Tools** if multi-category is allowed.

---

## Permission justifications

The dashboard requires a one-line justification for each permission the manifest declares. Use these:

| Permission | Justification |
|---|---|
| `activeTab` | The extension reads the URL and conversation/SERP content of the tab the user is actively viewing when they open the popup or click Refresh. |
| `scripting` | The extension injects a small page-context function to fetch the ChatGPT conversation JSON via the user's session, or to parse the SERP DOM on Google/Bing/DuckDuckGo. The injected function only reads data — it does not modify the page or persist anything. |
| `storage` | The extension persists captured payloads, the comparison history, and user preferences in `chrome.storage.local` on the user's device. |
| `tabs` | The "Capture Google SERP" handoff button opens a new Google search tab seeded with the prompt from the ChatGPT conversation. The extension uses `chrome.tabs.create` for this and `chrome.tabs.onUpdated` to know when the SERP has finished loading so it can auto-capture. |

| Host permission | Justification |
|---|---|
| `https://chatgpt.com/*` and `https://chat.openai.com/*` | The extension fetches the conversation JSON from ChatGPT's own backend using the user's existing logged-in session, so the popup can display fan-out queries, cited sources, and the model name. The same payload the user's browser would already have loaded to render the conversation. |
| `https://*.google.com/*` | Read the SERP DOM on Google to extract organic result rankings, titles, snippets, and SERP features (AI Overviews, Featured Snippets, etc.) for comparison against ChatGPT's cited domains. |
| `https://www.bing.com/*` | Same as Google but for Bing. |
| `https://duckduckgo.com/*` | Same as Google but for DuckDuckGo. |

---

## Privacy / data usage disclosures

The CWS Developer Dashboard asks you to declare what categories of data the extension collects. Tick:

- [x] **Website content** — the extension reads ChatGPT conversation JSON and search results page DOM.

Do **not** tick: Personally identifiable information / Health information / Financial / Authentication / Personal communications / Location / Web history / User activity. The extension does not read any of these in a way that leaves the user's device.

For each category ticked, also confirm:
- [x] Is not being sold to third parties.
- [x] Is not being used or transferred for purposes that are unrelated to the item's single purpose.
- [x] Is not being used or transferred to determine creditworthiness or for lending purposes.

---

## Privacy policy URL

Paste into the dashboard:

> https://github.com/whataboutseo/ai-query-inspector/blob/main/cws/PRIVACY_POLICY.md

This is GitHub's rendered-markdown URL — stable, public, and accepted by CWS reviewers. The policy file has Jekyll `permalink: /privacy/` front matter so if Pages is enabled later, the prettier URL `https://whataboutseo.github.io/ai-query-inspector/privacy/` will also work and can be swapped in.

---

## Screenshots and promotional images

Required screenshots (1280 x 800 or 640 x 400 PNG/JPEG, at least one):

- [ ] Popup with a ChatGPT conversation loaded, showing the fan-out queries and cited sources sections.
- [ ] Full-page dashboard, ChatGPT tab — fan-out tree + citation strength + captured sources sections visible.
- [ ] Compare tab — overlap percentage with the Venn, the precision strip, and the rank-compare table populated.
- [ ] History tab — conversation list with at least one expanded conversation showing the timeline + tags + notes.
- [ ] Settings modal — Privacy & safety card with the auto-capture toggle and the export/import buttons.

Optional (but boosts CWS placement):

- [ ] 440 x 280 small promotional tile.
- [ ] 920 x 680 large promotional tile.
- [ ] 1400 x 560 marquee tile (only used if the extension is featured).

The icon set in `icons/` is already 16/32/48/128px and meets the CWS icon requirement.

---

## Submission checklist

- [ ] Bump `manifest.json` to the version intended for this submission.
- [ ] Run `build-cws.ps1` to produce `AI-Query-Inspector-cws-v<version>.zip`.
- [ ] Verify the zip contents — no `cws/`, `README.md`, `CLAUDE.md`, `DESIGN_SYSTEM.md`, `build-cws.ps1`, or `.git*`.
- [ ] Publish `PRIVACY_POLICY.md` to a public URL and paste it into the dashboard.
- [ ] Single purpose, short description, detailed description, category — paste from this file.
- [ ] Screenshots uploaded (at least one).
- [ ] Permission and host-permission justifications pasted.
- [ ] Data disclosures ticked correctly.
- [ ] Upload zip via the dashboard, submit for review.

Review takes anywhere from a few hours to a few weeks depending on permissions and load. Watch the dashboard email for follow-up requests; reviewers commonly ask for clarification on host permissions or for a specific screenshot of the in-app privacy controls.
