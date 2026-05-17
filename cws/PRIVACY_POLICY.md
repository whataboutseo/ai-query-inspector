---
permalink: /privacy/
title: Privacy Policy — AI Query Inspector
---

# Privacy Policy — AI Query Inspector

**Effective date:** 2026-05-17

AI Query Inspector ("the extension") is a local-only browser extension that helps you inspect ChatGPT conversation payloads and capture Google, Bing, and DuckDuckGo search results pages so you can compare what an AI assistant cites against what organic search ranks. It is designed so that **no information ever leaves your device.**

## What the extension reads

The extension only reads data that is already visible to you in your own browser tabs:

- **ChatGPT conversation payloads.** When you have a ChatGPT conversation open at `chatgpt.com` or `chat.openai.com`, the extension can fetch the conversation JSON from ChatGPT's own backend using your existing logged-in session — the same payload your browser already loaded to render the page. This includes your prompts, the assistant's responses, the model name, fan-out queries, and the URLs ChatGPT cited or considered.
- **Search engine results pages.** On a Google, Bing, or DuckDuckGo search results page, the extension reads the DOM to extract result rankings, page titles, snippets, and SERP features (AI Overviews, Featured Snippets, People Also Ask, etc.).
- **The current tab URL** when you open the extension popup, so the extension can decide whether the active tab is a ChatGPT conversation, a search results page, or something else.

The extension does not read anything from any other website.

## What the extension stores

Everything the extension captures is stored in `chrome.storage.local` on your device:

- The most recent ChatGPT conversation snapshot and the most recent search results page snapshot.
- A timestamped archive of past captures (default cap: 200 newest entries; user-configurable).
- A comparison history of paired ChatGPT-vs-search runs (default cap: 100 entries).
- User preferences: auto-capture toggle, retention caps, theme choice, registered-domain matching toggle, auto-refresh interval.

You can wipe all captured data at any time via **Settings → Reset all data**, or by uninstalling the extension.

## What the extension transmits

**Nothing.** The extension makes zero outbound network requests. It does not call any analytics endpoint, telemetry endpoint, cloud sync service, or third-party API. It does not load any external resources at runtime — fonts, scripts, and styles are bundled with the extension package.

The only network traffic the extension generates is:

1. The conversation JSON fetch from ChatGPT's own backend at `chatgpt.com` / `chat.openai.com`, which uses your existing browser session and is identical to a request your browser would already make to render the conversation. This stays inside ChatGPT's domain.
2. Whatever your browser already does when you navigate to a search engine results page. The extension only reads the DOM after your browser has loaded the page.

## Auto-capture, and how to turn it off

By default, when you open a ChatGPT conversation in a tab, the extension's background service worker captures the conversation payload and saves it to `chrome.storage.local`. This is convenient but happens silently.

**You can turn auto-capture off at any time** from **Settings → Privacy & safety → Auto-capture ChatGPT conversations**. With auto-capture off, the extension only reads conversation data when you explicitly open the popup and click **Refresh**.

## Permissions the extension declares, and why

| Permission | Why |
|---|---|
| `activeTab` | Read the URL and inject the read-only content script into the tab the user is currently viewing. |
| `scripting` | Inject the page-context functions that fetch the ChatGPT conversation payload or parse the search results DOM. |
| `storage` | Persist captures, comparison history, and user preferences locally via `chrome.storage.local`. |
| `tabs` | Open a Google search tab from the ChatGPT view (the "Capture Google SERP" handoff feature). |
| Host: `https://chatgpt.com/*`, `https://chat.openai.com/*` | Fetch the conversation JSON from ChatGPT's backend using the user's existing session, so the popup can show fan-out queries and cited sources. |
| Host: `https://*.google.com/*` | Read the SERP DOM on Google so the extension can compare ChatGPT's cited domains against Google's organic ranking. |
| Host: `https://www.bing.com/*` | Same, on Bing. |
| Host: `https://duckduckgo.com/*` | Same, on DuckDuckGo. |

## Third parties

The extension does not share data with any third party. There is no analytics provider, no error reporting service, and no cloud backup. The author of the extension cannot see what you have captured.

## Children's privacy

The extension is a developer / SEO research tool and is not directed at children under 13. It does not knowingly collect any data from anyone, including children, since all data stays on the user's device.

## Changes to this policy

If this policy ever changes (for example, if a future version of the extension introduces a feature that does transmit data — which is not currently planned), the change will be announced in the extension's release notes on the Chrome Web Store and a new effective date will be recorded above. The extension will not begin transmitting any new category of data without an explicit version note.

## Contact

For questions about this policy, open an issue at [https://github.com/whataboutseo/ai-query-inspector](https://github.com/whataboutseo/ai-query-inspector) or email [simpleseotool@gmail.com](mailto:simpleseotool@gmail.com).
