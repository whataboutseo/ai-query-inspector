# AI Query Inspector

A reworked build of the original AI Query Inspector extension. Designed to coexist with the original (different icon and install path) so both can be loaded unpacked side-by-side for comparison.

A local-only browser extension for:
- inspecting the current ChatGPT conversation payload
- capturing the current Google search results page locally (Mode A)
- comparing ChatGPT-cited domains against Google domains in a combined view

## Features
- Model badge, fan-outs, cited sources, unique sites, and search-origin inference
- Google local capture from a normal Google results page on your device
- Combined overlap view between ChatGPT-cited sites and Google result sites
- Full CSV export for ChatGPT, Google, and Combined views
- Local-only storage for the last captured ChatGPT and Google datasets

## Privacy
- Auto-captures ChatGPT conversations by default. The extension has declared host access to chatgpt.com and chat.openai.com; on every conversation load it fetches the conversation JSON from ChatGPT's own backend using your existing session — nothing is sent off-device.
- **Opt out at any time:** toggle *Auto-capture ChatGPT conversations* off in the **Privacy & safety** card in the popup. When it's off, no conversation data is read until you open the popup and click **Refresh**.
- Search pages (Google / Bing / DuckDuckGo) are captured either when you open the popup on that tab, or when you use the *Open Google for prompt* handoff. The extension declares host permission for `*.google.com`, `www.bing.com`, and `duckduckgo.com` so the handoff can auto-capture the SERP without a second click; the extension still never sends anything off-device.
- Stores the last captured ChatGPT conversation (including prompts, responses, and cited URLs) and the last SERP result set locally on this device for comparison.
- Sends nothing off-device. No analytics. No cloud sync.

## Notes
- ChatGPT parsing depends on internal payload structure and may need updates if the site changes
- Google capture is heuristic and may miss or misclassify results if Google changes its markup
- Gemini conversations are detected but not yet parsed — support is scaffolded for a future release


## Phase 2
- Added overlap score summary
- Added rank comparison table for ChatGPT vs Google
- Added a missed-opportunity section for Google-ranked domains not cited by ChatGPT


Phase 3 + 4 additions:
- SERP snapshot CSV export with ChatGPT overlap columns
- Combined dataset CSV now includes engine and SERP features
- Local SERP feature detection
- Local multi-engine capture for Google, Bing, and DuckDuckGo


Version 1.6 adds local history, SERP drift tracking, page-context export fields, and Google handoff based on the latest detected user prompt.
