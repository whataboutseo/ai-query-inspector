/**
 * background.js (MV3 service worker)
 * ----------------------------------
 * Auto-captures ChatGPT conversations as they finish loading. Parsing
 * helpers now live in shared.js so the popup and the background stay
 * in lockstep.
 */
importScripts('shared.js');

const { parseChatgptPayload, getSettings, storage } = self.AIQIShared;

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
        await storage.appendChatgptCapture(parsed, { skipIfUnchanged: true });
      }
    }
  } catch {
    // Ignore: auto-capture is best-effort; users can always click Refresh.
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab?.url) return;
  if (!isChatgptUrl(tab.url)) return;
  maybeCaptureTab(tabId, tab.url);
});

chrome.runtime.onInstalled.addListener(() => {});
