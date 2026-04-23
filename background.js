/**
 * background.js (MV3 service worker)
 * ----------------------------------
 * Auto-captures ChatGPT conversations as they finish loading. Parsing
 * helpers now live in shared.js so the popup and the background stay
 * in lockstep.
 */
importScripts('shared.js');

const {
  parseChatgptPayload,
  parseGooglePayload,
  fetchSearchResultsInPage,
  isSearchEngineUrl,
  getSettings,
  storage,
  ORCHESTRATION_TTL_MS,
} = self.AIQIShared;

function isChatgptUrl(url = '') {
  return /^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(url);
}

async function maybeCaptureTab(tabId, url) {
  try {
    if (!isChatgptUrl(url)) return;
    // Honour the user's auto-capture preference. When disabled, the popup
    // still works — it falls back to on-demand capture via Refresh.
    const settings = await getSettings();
    if (!settings.autoCaptureChatgpt) return;
    const res = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: function fetchConversationPayloadInPage() {
        const sanitizeString = (value, maxLen = 500) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLen) : '';
        return (async () => {
          try {
            const url = window.location.pathname.includes('/c/') ? window.location.href : '';
            const match = window.location.pathname.match(/\/c\/([^/?#]+)/);
            if (!match) return { error: 'Open a single ChatGPT conversation first.' };
            const cid = sanitizeString(match[1], 200);
            const sessionResp = await fetch('/api/auth/session', { credentials: 'include' });
            if (!sessionResp.ok) return { error: `Session request failed (${sessionResp.status}).` };
            const session = await sessionResp.json();
            if (!session?.accessToken) return { error: 'Could not access your current ChatGPT session token.' };
            const convoResp = await fetch('/backend-api/conversation/' + encodeURIComponent(cid), {
              credentials: 'include',
              headers: { Authorization: 'Bearer ' + session.accessToken },
            });
            if (!convoResp.ok) return { error: `Conversation request failed (${convoResp.status}).` };
            const payload = await convoResp.json();
            return { conversationId: cid, payload, pageUrl: url || window.location.href };
          } catch (error) {
            return { error: `Page fetch failed: ${error?.message || 'Unknown error'}` };
          }
        })();
      },
    });
    const result = res?.[0]?.result;
    if (result && !result.error && result.payload) {
      const parsed = parseChatgptPayload(result.payload, {
        conversationId: result.conversationId,
        pageUrl: result.pageUrl || url,
        browser: 'Background capture',
        capturedAt: new Date().toISOString(),
      });
      if (parsed) {
        await storage.saveChatgptData(parsed);
        // skipIfUnchanged avoids spamming the archive when chrome.tabs
        // onUpdated fires multiple `complete` events for a single page
        // load (the conversation content is identical across those).
        await storage.appendChatgptCapture(parsed, {
          skipIfUnchanged: true,
          cap: Number(settings?.archiveRetention) || undefined,
        });
      }
    }
  } catch {
    // Ignore: auto-capture is best-effort; users can always click Refresh.
  }
}

/**
 * Orchestrated Google SERP capture.
 *
 * The popup's "Open Google for prompt" handoff opens a new Google tab
 * and writes a PENDING_GOOGLE_ORCHESTRATION marker containing the
 * target tabId + query. When that specific tab finishes loading, we
 * inject the SERP scraper, parse the result, and save to GOOGLE_DATA
 * + the Google archive. The dashboard listens on chrome.storage
 * changes and re-renders automatically — no second user click.
 */
async function maybeOrchestrateGoogleCapture(tabId, url) {
  try {
    if (!isSearchEngineUrl(url)) return;
    const orch = await storage.loadPendingGoogleOrchestration();
    if (!orch) return;
    // TTL guard — clear stale markers so a tab the user closed or a
    // crashed listener doesn't leave a permanent trigger behind.
    if (!orch.createdAt || (Date.now() - Number(orch.createdAt)) > ORCHESTRATION_TTL_MS) {
      await storage.clearPendingGoogleOrchestration();
      return;
    }
    if (orch.tabId !== tabId) return;
    const res = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: fetchSearchResultsInPage,
    });
    const result = res?.[0]?.result;
    if (!result || result.error) {
      // Clear so we don't keep retrying on the same failed page. The
      // user can still click Refresh manually if they want to retry.
      await storage.clearPendingGoogleOrchestration();
      return;
    }
    const parsed = parseGooglePayload(result, orch.query || '');
    const record = {
      ...parsed,
      pageUrl: result.pageUrl || url || '',
      browser: 'Background capture',
    };
    await storage.saveGoogleData(record);
    const settings = await getSettings();
    await storage.appendGoogleCapture(record, {
      cap: Number(settings?.archiveRetention) || undefined,
    });
    await storage.clearPendingGoogleOrchestration();
  } catch {
    // Best-effort: swallow so a single failure can't break the worker.
    try { await storage.clearPendingGoogleOrchestration(); } catch {}
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab?.url) return;
  if (isChatgptUrl(tab.url)) {
    maybeCaptureTab(tabId, tab.url);
    return;
  }
  if (isSearchEngineUrl(tab.url)) {
    maybeOrchestrateGoogleCapture(tabId, tab.url);
  }
});

// If the user closes the orchestrated Google tab before it loaded,
// drop the stale marker so a future handoff starts clean.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    const orch = await storage.loadPendingGoogleOrchestration();
    if (orch && orch.tabId === tabId) {
      await storage.clearPendingGoogleOrchestration();
    }
  } catch {}
});

chrome.runtime.onInstalled.addListener(() => {});
