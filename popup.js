/* ============================================================================
 * popup.js — entry point for both the 430px popup and the full-page dashboard
 * ----------------------------------------------------------------------------
 * File structure (skim these banners to find code quickly):
 *   1. IMPORTS         — shared helpers + storage from shared.js
 *   2. DOM REFERENCES  — els.* map and module-scope state variables
 *   3. UTILITIES       — toasts, status messages, modal, theme, slugify, csv
 *   4. PARSING WRAPPER — parseChatgptPayload(strict:true) pass-through
 *   5. RENDERERS       — renderChatgpt, renderGoogle, renderCombined,
 *                        renderHistory + their sub-rendering helpers
 *   6. DATA BUILDERS   — buildCombinedData, buildGoogleData, fingerprinting
 *   7. EXPORTS         — exportChatgptCsv/GoogleCsv/CombinedCsv/HistoryCsv,
 *                        exportFullDataset
 *   8. PAGE INJECTION  — fetchConversationPayloadInPage,
 *                        fetchSearchResultsInPage (run in MAIN world)
 *   9. INSPECTION      — inspectCurrentTab, openGoogleForQuery,
 *                        openFullPageDashboard
 *  10. EVENT BINDINGS  — bindEvents, handleTabKeydown, switchTab
 *  11. SETTINGS        — hydrateSettingsUI
 *  12. INIT            — init() + DOMContentLoaded wiring
 *
 * A future refactor may split sections 7–9 into their own files. For now
 * the module globals in section 2 are referenced from most other sections,
 * so splitting would require heavy parameter plumbing.
 * ========================================================================= */

// ============================================================================
// 1. IMPORTS — parsing helpers and storage live in shared.js (loaded by
//    popup.html before this file) so background.js and popup.js cannot
//    drift. Destructure once here; every local usage below binds against
//    these constants.
// ============================================================================
const {
  sanitizeString,
  normalizeDomain,
  extractMessageText,
  scanForSourceItems,
  getSearchOrigin,
  sortConversationPath,
  aggregateSourceItems,
  buildConversationTurns,
  parseGooglePayload,
  fetchSearchResultsInPage,
} = self.AIQIShared;

// ============================================================================
// 4. PARSING WRAPPER — the popup historically threw on malformed payloads
//    and relied on the catch block in inspectCurrentTab() to surface the
//    error to the user. Preserve that behavior via strict:true.
// ============================================================================
function parseChatgptPayload(raw) {
  return self.AIQIShared.parseChatgptPayload(raw, { strict: true });
}

// ============================================================================
// 2. DOM REFERENCES — cached on popup load. Any element not available at
//    parse time (e.g. modal children) is looked up lazily inside its
//    consumer function instead.
// ============================================================================
const els = {
  statusText: document.getElementById('statusText'),
  refreshBtn: document.getElementById('refreshBtn'),
  openFullPageBtn: document.getElementById('openFullPageBtn'),
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  exportAllBtn: document.getElementById('exportAllBtn'),
  toast: document.getElementById('toast'),

  tabButtons: Array.from(document.querySelectorAll('.dash-tab')),
  tabPanels: {
    chatgpt: document.getElementById('panelChatgpt'),
    google: document.getElementById('panelGoogle'),
    combined: document.getElementById('panelCombined'),
    history: document.getElementById('panelHistory')
  },

  // ChatGPT (stage 5.3 prompt-hero + kpi-strip + sections)
  promptEyebrow: document.getElementById('promptEyebrow'),
  promptQuote: document.getElementById('promptQuote'),
  promptCapturedAt: document.getElementById('promptCapturedAt'),
  promptCtaStatus: document.getElementById('promptCtaStatus'),
  modelBadge: document.getElementById('modelBadge'),
  modelBadgeText: document.getElementById('modelBadgeText'),
  fanoutCount: document.getElementById('fanoutCount'),
  sourceCount: document.getElementById('sourceCount'),
  siteCount: document.getElementById('siteCount'),
  utmCoverage: document.getElementById('utmCoverage'),
  retrievalIntensityValue: document.getElementById('retrievalIntensityValue'),
  retrievalIntensityMeta: document.getElementById('retrievalIntensityMeta'),
  latestPromptText: document.getElementById('latestPromptText'),
  queryExpansionWrap: document.getElementById('queryExpansionWrap'),
  citationStrengthWrap: document.getElementById('citationStrengthWrap'),
  citationStrengthEmpty: document.getElementById('citationStrengthEmpty'),
  citationStrengthSummary: document.getElementById('citationStrengthSummary'),
  searchOriginBadge: document.getElementById('searchOriginBadge'),
  searchOriginBadgeText: document.getElementById('searchOriginBadgeText'),
  promptIntentBadge: document.getElementById('promptIntentBadge'),
  promptIntentBadgeText: document.getElementById('promptIntentBadgeText'),
  searchOriginConfidence: document.getElementById('searchOriginConfidence'),
  fanoutsList: document.getElementById('fanoutsList'),
  fanoutsEmpty: document.getElementById('fanoutsEmpty'),
  sitesWrap: document.getElementById('sitesWrap'),
  sitesEmpty: document.getElementById('sitesEmpty'),
  sitesSummary: document.getElementById('sitesSummary'),
  turnsWrap: document.getElementById('turnsWrap'),
  turnsEmpty: document.getElementById('turnsEmpty'),
  turnsSummary: document.getElementById('turnsSummary'),
  sourcesWrap: document.getElementById('sourcesWrap'),
  sourcesEmpty: document.getElementById('sourcesEmpty'),
  sourcesSummary: document.getElementById('sourcesSummary'),
  copyQueriesBtn: document.getElementById('copyQueriesBtn'),
  copySitesBtn: document.getElementById('copySitesBtn'),
  copySourcesBtn: document.getElementById('copySourcesBtn'),
  exportChatgptCsvBtn: document.getElementById('exportChatgptCsvBtn'),
  openGoogleBtn: document.getElementById('openGoogleBtn'),
  openGoogleBtnBottom: document.getElementById('openGoogleBtnBottom'),
  chatgptCompareCta: document.getElementById('chatgptCompareCta'),
  jumpToCompareLink: document.getElementById('jumpToCompareLink'),

  // Google
  googleQueryLabel: document.getElementById('googleQueryLabel'),
  googleResultCount: document.getElementById('googleResultCount'),
  googleSiteCount: document.getElementById('googleSiteCount'),
  googleCaptureMode: document.getElementById('googleCaptureMode'),
  googleEngineLabel: document.getElementById('googleEngineLabel'),
  googleFeatureCount: document.getElementById('googleFeatureCount'),
  googleFeaturesWrap: document.getElementById('googleFeaturesWrap'),
  googleFeaturesEmpty: document.getElementById('googleFeaturesEmpty'),
  googleFeaturesSummary: document.getElementById('googleFeaturesSummary'),
  googleSitesWrap: document.getElementById('googleSitesWrap'),
  googleSitesEmpty: document.getElementById('googleSitesEmpty'),
  googleSitesSummary: document.getElementById('googleSitesSummary'),
  googleResultsWrap: document.getElementById('googleResultsWrap'),
  googleEmpty: document.getElementById('googleEmpty'),
  copyGoogleBtn: document.getElementById('copyGoogleBtn'),
  exportGoogleCsvBtn: document.getElementById('exportGoogleCsvBtn'),
  openGoogleManualBtn: document.getElementById('openGoogleManualBtn'),

  // Combined
  combinedOverlapScore: document.getElementById('combinedOverlapScore'),
  combinedOverlapMeta: document.getElementById('combinedOverlapMeta'),
  combinedPrecisionScore: document.getElementById('combinedPrecisionScore'),
  combinedRecallScore: document.getElementById('combinedRecallScore'),
  combinedJaccardScore: document.getElementById('combinedJaccardScore'),
  combinedOverlapCount: document.getElementById('combinedOverlapCount'),
  combinedChatgptOnlyCount: document.getElementById('combinedChatgptOnlyCount'),
  combinedGoogleOnlyCount: document.getElementById('combinedGoogleOnlyCount'),
  combinedQueryLabel: document.getElementById('combinedQueryLabel'),
  combinedWrap: document.getElementById('combinedWrap'),
  combinedEmpty: document.getElementById('combinedEmpty'),
  missedOpportunitiesWrap: document.getElementById('missedOpportunitiesWrap'),
  missedOpportunitiesEmpty: document.getElementById('missedOpportunitiesEmpty'),
  missedOpportunitiesSummary: document.getElementById('missedOpportunitiesSummary'),
  copyCombinedBtn: document.getElementById('copyCombinedBtn'),
  exportCombinedCsvBtn: document.getElementById('exportCombinedCsvBtn'),
  exportSeoToolCsvBtn: document.getElementById('exportSeoToolCsvBtn'),
  aioCrossrefCard: document.getElementById('aioCrossrefCard'),
  aioCrossrefSummary: document.getElementById('aioCrossrefSummary'),
  aioCrossrefWrap: document.getElementById('aioCrossrefWrap'),

  // History
  historyRunCount: document.getElementById('historyRunCount'),
  historyQueryCount: document.getElementById('historyQueryCount'),
  historyEngineCount: document.getElementById('historyEngineCount'),
  historyLatestOverlap: document.getElementById('historyLatestOverlap'),
  historySummary: document.getElementById('historySummary'),
  historyEmpty: document.getElementById('historyEmpty'),
  historyWrap: document.getElementById('historyWrap'),
  historySearchInput: document.getElementById('historySearchInput'),
  historySearchMeta: document.getElementById('historySearchMeta'),
  exportHistoryCsvBtn: document.getElementById('exportHistoryCsvBtn'),
  clearHistoryBtn: document.getElementById('clearHistoryBtn'),
  historyRetentionSelect: document.getElementById('historyRetentionSelect'),
  archiveRetentionSelect: document.getElementById('archiveRetentionSelect'),
  clearChatgptArchiveBtn: document.getElementById('clearChatgptArchiveBtn'),
  clearGoogleArchiveBtn: document.getElementById('clearGoogleArchiveBtn'),

  // Stage 4.2 capture pickers
  chatgptPickerCard: document.getElementById('chatgptPickerCard'),
  chatgptPickerSelect: document.getElementById('chatgptPickerSelect'),
  chatgptPickerNote: document.getElementById('chatgptPickerNote'),
  googlePickerCard: document.getElementById('googlePickerCard'),
  googlePickerSelect: document.getElementById('googlePickerSelect'),
  googlePickerNote: document.getElementById('googlePickerNote'),
};

let toastTimer = null;
const isFullPage = new URLSearchParams(window.location.search).get('full') === '1';
let lastChatgptData = null;
let lastGoogleData = null;
let activeView = 'chatgpt';
let comparisonHistory = [];
let lastSavedFingerprint = '';
let themeMode = 'dark';
// Cached snapshot of user preferences, hydrated from chrome.storage in
// hydrateSettingsUI(). Keeping it in a module-scope variable lets
// buildCombinedData() (a synchronous function called by every renderer)
// read the current value without awaiting storage on every invocation.
let currentSettings = { ...self.AIQIShared.DEFAULT_SETTINGS };
// Handle for the auto-refresh setInterval; null when the feature is off.
let autoRefreshTimer = null;

// Stage 4.2 capture picker state. Archive caches mirror chrome.storage
// and are refreshed lazily on storage.onChanged. userPickedXxxId is
// non-null iff the user manually selected a non-latest entry — in that
// case, incoming live CHATGPT_DATA/GOOGLE_DATA storage events do NOT
// stomp their view.
let chatgptArchive = [];
let googleArchive = [];
let userPickedChatgptId = null;
let userPickedGoogleId = null;
// Stage 4.4 history filter. Lowercased for case-insensitive matching.
let historySearchTerm = '';
// Stage 5.6 two-level History: null = list view, bucket key = detail view.
let selectedConversationKey = null;

function maybeSetFullPageClass() {
  if (isFullPage) document.body.classList.add('full-page');
}

function applyTheme(mode = 'dark') {
  themeMode = mode === 'light' ? 'light' : 'dark';
  document.body.classList.toggle('light-mode', themeMode === 'light');
  // Stage 5.1: drive the design-system tokens via data-theme on <html>.
  // The legacy .light-mode body class stays around so existing popup.css
  // rules keep working until each panel is migrated off them.
  document.documentElement.setAttribute('data-theme', themeMode);
  // Theme button stays an icon — update the tooltip/aria-label only, so
  // the SVG inside isn't wiped out by a textContent write.
  if (els.themeToggleBtn) {
    const next = themeMode === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
    els.themeToggleBtn.title = next;
    els.themeToggleBtn.setAttribute('aria-label', next);
  }
}

async function toggleThemeMode() {
  applyTheme(themeMode === 'light' ? 'dark' : 'light');
  await self.AIQIShared.storage.saveThemeMode(themeMode);
}

function setupCollapsibleSections() {
  if (!isFullPage) return;
  document.querySelectorAll('.collapsible-section').forEach((section) => {
    if (section.dataset.collapsibleReady === '1') return;
    const head = section.querySelector('.section-head');
    if (!head) return;
    const actions = head.querySelector('.section-actions') || head;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ghost-btn collapse-toggle';
    btn.textContent = 'Collapse';
    btn.addEventListener('click', () => {
      const collapsed = section.classList.toggle('collapsed');
      btn.textContent = collapsed ? 'Expand' : 'Collapse';
    });
    actions.appendChild(btn);
    section.dataset.collapsibleReady = '1';
  });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function isChatgptUrl(url = '') {
  return /^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(url);
}

// Stage 3.1: detect Gemini conversation tabs. Parsing Gemini's
// conversation payload is a planned feature — for now we recognise the
// tab so we can show a dedicated "not yet implemented" status rather
// than "Open a ChatGPT or search page first".
function isGeminiUrl(url = '') {
  return /^https:\/\/gemini\.google\.com\//.test(url);
}

function isSearchUrl(url = '') {
  return /^https:\/\/((([a-z0-9-]+\.)*google\.)|(([a-z0-9-]+\.)*bing\.com)|duckduckgo\.com)/i.test(url);
}

function isInspectableUrl(url = '') {
  return isChatgptUrl(url) || isSearchUrl(url) || isGeminiUrl(url);
}

async function getInspectionTargetTab() {
  const params = new URLSearchParams(window.location.search);
  const sourceTabId = Number(params.get('sourceTabId') || 0);
  if (sourceTabId) {
    try {
      const tab = await chrome.tabs.get(sourceTabId);
      if (tab?.id && tab.url && isInspectableUrl(tab.url)) return tab;
    } catch {}
  }

  const active = await getActiveTab();
  if (active?.id && active.url && isInspectableUrl(active.url)) return active;

  const tabs = await chrome.tabs.query({ currentWindow: true }).catch(() => []);
  const candidates = (tabs || []).filter((tab) => tab?.id && tab.url && isInspectableUrl(tab.url));
  if (candidates.length) {
    candidates.sort((a, b) => {
      const aScore = (a.active ? 100 : 0) + (a.lastAccessed || 0);
      const bScore = (b.active ? 100 : 0) + (b.lastAccessed || 0);
      return bScore - aScore;
    });
    return candidates[0];
  }

  const broader = await chrome.tabs.query({}).catch(() => []);
  const broaderCandidates = (broader || []).filter((tab) => tab?.id && tab.url && isInspectableUrl(tab.url));
  broaderCandidates.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  return broaderCandidates[0] || active || null;
}

// ============================================================================
// 3. UTILITIES — status text, toasts, modal, theme, slugify, csv escape,
//    download helpers, formatting. Kept at the top because every other
//    section uses at least one of them.
// ============================================================================
function setStatus(message, kind = 'warn') {
  els.statusText.textContent = message;
  els.statusText.className = kind === 'ok' ? 'status-ok' : kind === 'error' ? 'status-error' : 'status-warn';
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 1400);
}

/**
 * Accessible replacement for window.prompt(). Resolves to the entered
 * string, or null if the user cancels / dismisses. Behaviour:
 *   - Enter submits, Escape cancels, click-outside-the-dialog cancels.
 *   - Focus is trapped on the input while open, restored on close.
 *   - Multiple concurrent calls queue — we only show one modal at a time.
 */
let promptModalQueue = Promise.resolve();
function openPromptModal({ title = 'Enter value', message = '', label = 'Value', initialValue = '', okLabel = 'OK', cancelLabel = 'Cancel' } = {}) {
  const run = () => new Promise((resolve) => {
    const modal = document.getElementById('promptModal');
    const input = document.getElementById('promptModalInput');
    const okBtn = document.getElementById('promptModalOk');
    const cancelBtn = document.getElementById('promptModalCancel');
    const titleEl = document.getElementById('promptModalTitle');
    const messageEl = document.getElementById('promptModalMessage');
    const labelEl = document.getElementById('promptModalLabel');
    if (!modal || !input || !okBtn || !cancelBtn) {
      // Fallback if the modal markup is missing (shouldn't happen in the
      // shipped extension; defensive for unit-test harnesses).
      resolve(window.prompt(message || title, initialValue) || null);
      return;
    }

    titleEl.textContent = title;
    messageEl.textContent = message;
    messageEl.classList.toggle('hidden', !message);
    labelEl.textContent = label;
    okBtn.textContent = okLabel;
    cancelBtn.textContent = cancelLabel;
    input.value = initialValue;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const cleanup = (value) => {
      modal.classList.add('hidden');
      modal.setAttribute('hidden', '');
      okBtn.removeEventListener('click', handleOk);
      cancelBtn.removeEventListener('click', handleCancel);
      modal.removeEventListener('click', handleBackdropClick);
      input.removeEventListener('keydown', handleKey);
      document.removeEventListener('keydown', handleEscape, true);
      try { previouslyFocused?.focus?.(); } catch {}
      resolve(value);
    };

    const handleOk = () => cleanup(input.value.trim() || null);
    const handleCancel = () => cleanup(null);
    const handleBackdropClick = (ev) => {
      if (ev.target instanceof HTMLElement && ev.target.dataset.promptDismiss !== undefined) cleanup(null);
    };
    const handleKey = (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); handleOk(); }
    };
    const handleEscape = (ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); cleanup(null); }
    };

    okBtn.addEventListener('click', handleOk);
    cancelBtn.addEventListener('click', handleCancel);
    modal.addEventListener('click', handleBackdropClick);
    input.addEventListener('keydown', handleKey);
    document.addEventListener('keydown', handleEscape, true);

    modal.classList.remove('hidden');
    modal.removeAttribute('hidden');
    // Defer focus so the browser has a chance to paint before we move focus
    // into the input; otherwise select() occasionally no-ops.
    requestAnimationFrame(() => {
      try { input.focus(); input.select(); } catch {}
    });
  });

  // Serialize concurrent calls so we never stack two dialogs on top of each
  // other. The queue is a single chain of promises.
  const next = promptModalQueue.then(run);
  promptModalQueue = next.catch(() => null);
  return next;
}

function slugify(value, fallback = 'export') {
  const clean = sanitizeString(value, 80).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return clean || fallback;
}

function getBrowserLabel() {
  const ua = navigator.userAgent || '';
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari';
  return 'Browser';
}

// titleCaseEngine and normalizeFeatureList now live in shared.js, used
// internally by parseGooglePayload — no longer referenced directly in popup.js.

function csvEscape(value) {
  const str = String(value ?? '');
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function openFullPageDashboard(focus = true, sourceTabId = 0, initialView = '') {
  const params = new URLSearchParams({ full: '1' });
  if (sourceTabId) params.set('sourceTabId', String(sourceTabId));
  if (initialView) params.set('view', initialView);
  const targetUrl = chrome.runtime.getURL(`popup.html?${params.toString()}`);
  const existing = await chrome.tabs.query({ url: [chrome.runtime.getURL('popup.html*')] }).catch(() => []);
  if (existing && existing.length) {
    await chrome.tabs.update(existing[0].id, { url: targetUrl, active: !!focus });
    return existing[0];
  }
  return chrome.tabs.create({ url: targetUrl, active: !!focus });
}

function rowsToDelimited(rows, delimiter='\t') {
  return rows.map((row) => row.map((cell) => {
    const str = String(cell ?? '');
    if (delimiter === '\t') return str.replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
    return csvEscape(str);
  }).join(delimiter)).join('\n');
}

// ============================================================================
// 7. EXPORTS — CSV and full-dataset dumps. Each tab's export lives near
//    its renderer later in the file; exportFullDataset is the aggregate
//    "dump everything" button.
// ============================================================================
function exportFullDataset() {
  const combined = buildCombinedData();
  const baseName = slugify(lastChatgptData?.latestUserPrompt || lastGoogleData?.query || 'inspector-export', 'inspector-export');
  const turns = Array.isArray(lastChatgptData?.conversationTurns) ? lastChatgptData.conversationTurns : [];

  const chatRows = [
    ['record_type','turn_index','turn_prompt','field','value','domain','title','url','status','count','extra']
  ];

  chatRows.push(['summary','','','model', lastChatgptData?.model || '','','','','','','']);
  chatRows.push(['summary','','','latest_prompt', lastChatgptData?.latestUserPrompt || '','','','','','','']);
  chatRows.push(['summary','','','search_origin', lastChatgptData?.searchOrigin?.label || '','','','','','','']);
  chatRows.push(['summary','','','search_confidence', lastChatgptData?.searchOrigin?.confidence || '','','','','','','']);
  chatRows.push(['summary','','','fanouts', String(lastChatgptData?.queries?.length || 0),'','','','','','']);
  chatRows.push(['summary','','','cited_sources', String(lastChatgptData?.citedSources || 0),'','','','','','']);
  chatRows.push(['summary','','','unique_sites', String(lastChatgptData?.uniqueDomains?.length || 0),'','','','','','']);
  chatRows.push(['summary','','','utm_coverage', `${lastChatgptData?.utmCount || 0} / ${lastChatgptData?.totalUrls || 0}`,'','','','','','']);
  chatRows.push(['summary','','','turn_count', String(turns.length),'','','','','','']);

  (lastChatgptData?.queries || []).forEach((q, i) => {
    chatRows.push(['latest_turn_query','', lastChatgptData?.latestUserPrompt || '', `query_${i + 1}`, q.q || '', '', '', '', '', '', (q.domains || []).join('; ')]);
  });

  (lastChatgptData?.domainCounts || []).forEach((d) => {
    chatRows.push(['latest_turn_site','', lastChatgptData?.latestUserPrompt || '', 'site', '', d.domain || '', '', '', '', String(d.count || 0), '']);
  });

  (lastChatgptData?.sources || []).forEach((s) => {
    chatRows.push(['latest_turn_source','', lastChatgptData?.latestUserPrompt || '', 'source', '', s.domain || '', s.title || '', s.url || '', s.statusLabel || '', String(s.count || 0), `cited_mentions=${s.citedCount || 0}`]);
  });

  turns.forEach((t) => {
    chatRows.push(['turn_summary', String(t.index || ''), t.prompt || '', 'turn', '', '', '', '', '', '', `queries=${t.queryCount || 0}; cited_sources=${t.citedSourceCount || 0}; unique_sites=${t.uniqueSiteCount || 0}; unique_sources=${t.uniqueSourceCount || 0}`]);

    (t.queries || []).forEach((q, i) => {
      chatRows.push(['turn_query', String(t.index || ''), t.prompt || '', `query_${i + 1}`, q.q || '', '', '', '', '', '', (q.domains || []).join('; ')]);
    });

    (t.sources || []).forEach((s) => {
      chatRows.push(['turn_source', String(t.index || ''), t.prompt || '', 'source', '', s.domain || '', s.title || '', s.url || '', s.statusLabel || '', String(s.count || 0), `cited_mentions=${s.citedCount || 0}`]);
    });
  });

  const googleRows = [
    ['record_type','field','value','domain','title','url','rank','snippet','extra']
  ];
  googleRows.push(['summary','query', lastGoogleData?.query || '','','','','','','']);
  googleRows.push(['summary','engine', lastGoogleData?.engineLabel || '','','','','','','']);
  googleRows.push(['summary','capture_mode', lastGoogleData?.captureMode || '','','','','','','']);
  googleRows.push(['summary','organic_results', String(lastGoogleData?.resultCount || 0),'','','','','','']);
  googleRows.push(['summary','unique_sites', String(lastGoogleData?.uniqueDomains?.length || 0),'','','','','','']);
  googleRows.push(['summary','serp_features', (lastGoogleData?.serpFeatures || []).join('; '),'','','','','','']);
  (lastGoogleData?.results || []).forEach((r) => {
    googleRows.push(['result','','', r.domain || '', r.title || '', r.url || '', String(r.rank || ''), r.snippet || '', '']);
  });

  const combinedRows = [
    ['record_type','field','value','domain','title','url','rank','count','status','extra']
  ];
  combinedRows.push(['summary','compared_query', combined?.query || '','','','','','','']);
  combinedRows.push(['summary','overlap_score', combined ? `${combined.overlapScore}%` : '','','','','','','']);
  combinedRows.push(['summary','overlap_sites', String(combined?.overlap?.length || 0),'','','','','','']);
  combinedRows.push(['summary','chatgpt_only_sites', String(combined?.chatOnly?.length || 0),'','','','','','']);
  combinedRows.push(['summary','google_only_sites', String(combined?.googleOnly?.length || 0),'','','','','','']);
  (combined?.rows || []).forEach((r) => {
    combinedRows.push(['comparison','','', r.domain || '', r.googleTitle || '', r.googleUrl || '', String(r.googleRank || ''), String(r.chatgptCitations || 0), r.overlapLabel || '', r.googleSnippet || '']);
  });
  (combined?.missedOpportunities || []).forEach((r) => {
    combinedRows.push(['missed','','', r.domain || '', r.googleTitle || '', r.googleUrl || '', String(r.googleRank || ''), '', 'Missed by ChatGPT', '']);
  });
  (comparisonHistory || []).forEach((h) => {
    combinedRows.push(['history', 'saved_at', h.savedAt || '', '', '', '', '', '', '', `${h.query || ''} | ${h.prompt || ''} | ${h.engineLabel || h.engine || ''} | ${h.model || ''} | ${h.overlapScore || 0}% | +${h.drift?.added || 0}/-${h.drift?.removed || 0}`]);
  });

  downloadFile(`${baseName}-chatgpt.csv`, rowsToDelimited(chatRows, ','), 'text/csv;charset=utf-8');
  setTimeout(() => downloadFile(`${baseName}-google.csv`, rowsToDelimited(googleRows, ','), 'text/csv;charset=utf-8'), 120);
  setTimeout(() => downloadFile(`${baseName}-combined.csv`, rowsToDelimited(combinedRows, ','), 'text/csv;charset=utf-8'), 240);
  showToast('CSV exports saved');
}



async function saveLocalState() {
  const K = self.AIQIShared.STORAGE_KEYS;
  await self.AIQIShared.storage.saveBatch({
    [K.CHATGPT_DATA]: lastChatgptData,
    [K.GOOGLE_DATA]: lastGoogleData,
    [K.ACTIVE_VIEW]: activeView,
    [K.HISTORY]: comparisonHistory,
    [K.LAST_HISTORY_FINGERPRINT]: lastSavedFingerprint,
    [K.THEME_MODE]: themeMode,
  });
}

async function loadLocalState() {
  const K = self.AIQIShared.STORAGE_KEYS;
  const state = await self.AIQIShared.storage.loadSnapshot();
  lastChatgptData = state[K.CHATGPT_DATA] || state[K.PENDING_CHATGPT_SNAPSHOT] || null;
  lastGoogleData = state[K.GOOGLE_DATA] || null;
  comparisonHistory = Array.isArray(state[K.HISTORY]) ? state[K.HISTORY] : [];
  lastSavedFingerprint = state[K.LAST_HISTORY_FINGERPRINT] || '';
  activeView = state[K.ACTIVE_VIEW] || 'chatgpt';
  applyTheme(state[K.THEME_MODE] || 'dark');
  return state[K.PENDING_GOOGLE_QUERY] || '';
}

function switchTab(tabName) {
  activeView = tabName;
  // Update both visual state and ARIA state. aria-selected drives screen
  // reader output; tabindex implements the APG roving-tabindex pattern
  // (only the active tab is tabbable, the others are reached via arrows).
  els.tabButtons.forEach((btn) => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    btn.setAttribute('tabindex', isActive ? '0' : '-1');
  });
  Object.entries(els.tabPanels).forEach(([name, panel]) => panel.classList.toggle('hidden', name !== tabName));
  // Stage 5.9.4: drive picker visibility off the active tab. CSS rules
  // hide the ChatGPT picker on the Google tab, the Google picker on
  // the ChatGPT tab, both on History (where the user is browsing
  // saved pairs, not picking a live capture).
  document.body.dataset.activeView = tabName;
  saveLocalState().catch(() => {});
}

// ARIA Authoring Practices Guide (APG) tab pattern: Left/Right arrows
// cycle through tabs, Home/End jump to first/last. Activation on arrow
// movement keeps focus and selection in sync (the "automatic activation"
// variant, appropriate here because switching tabs is cheap).
function handleTabKeydown(event) {
  const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  event.preventDefault();
  const buttons = els.tabButtons;
  const currentIndex = buttons.findIndex((b) => b.dataset.tab === activeView);
  let next = currentIndex;
  if (event.key === 'ArrowLeft')  next = (currentIndex - 1 + buttons.length) % buttons.length;
  if (event.key === 'ArrowRight') next = (currentIndex + 1) % buttons.length;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End')  next = buttons.length - 1;
  const target = buttons[next];
  if (!target) return;
  switchTab(target.dataset.tab);
  target.focus();
}


function renderQueryExpansion(data) {
  const prompt = data?.latestUserPrompt || 'No prompt detected yet.';
  els.latestPromptText.textContent = prompt;
  els.queryExpansionWrap.innerHTML = '';

  const queries = data?.queries || [];
  const turns = Array.isArray(data?.conversationTurns) ? data.conversationTurns : [];
  const hasRichTurns = turns.length > 1 && turns.some((t) => (t.queries || []).length > 0);

  // Hide the whole Fan-out tree card in single-turn mode — the prompt is
  // already in the General information card and the queries are already
  // listed in the Fan-out queries card below, so a tree view of one turn
  // would just be visual noise.
  const card = document.getElementById('queryExpansionCard');
  if (card) card.classList.toggle('hidden', !hasRichTurns);
  if (!hasRichTurns) return;

  els.queryExpansionWrap.className = 'expansion-tree';

  const tree = document.createElement('div');
  tree.className = 'expansion-tree-wrap';

  const appendQueryList = (container, queryList) => {
    const list = document.createElement('div');
    list.className = 'expansion-query-list';
    queryList.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'expansion-query-item';
      const qText = document.createElement('div');
      qText.className = 'expansion-query-text';
      qText.textContent = `${index + 1}. ${item.q}`;
      row.appendChild(qText);
      if (Array.isArray(item.domains) && item.domains.length) {
        const chips = document.createElement('div');
        chips.className = 'expansion-domain-chips';
        item.domains.slice(0, 10).forEach((d) => {
          const chip = document.createElement('span');
          chip.className = 'expansion-domain-chip';
          chip.textContent = d;
          chips.appendChild(chip);
        });
        row.appendChild(chips);
      }
      list.appendChild(row);
    });
    container.appendChild(list);
  };

  // Multi-turn: one expansion-turn block per turn, each with a pill
  // header, prompt, and numbered fan-out query list.
  turns.forEach((turn) => {
    const turnNode = document.createElement('div');
    turnNode.className = 'expansion-turn';

    const turnHead = document.createElement('div');
    turnHead.className = 'expansion-turn-head';
    const turnPill = document.createElement('span');
    turnPill.className = 'expansion-turn-pill';
    turnPill.textContent = `Turn ${turn.index}`;
    const turnMeta = document.createElement('span');
    turnMeta.className = 'expansion-turn-meta';
    turnMeta.textContent = `${turn.queryCount || (turn.queries || []).length} queries · ${turn.citedSourceCount || 0} cited · ${turn.uniqueSiteCount || 0} sites`;
    turnHead.appendChild(turnPill);
    turnHead.appendChild(turnMeta);
    turnNode.appendChild(turnHead);

    if (turn.prompt) {
      const promptLabel = document.createElement('div');
      promptLabel.className = 'expansion-node-label';
      promptLabel.textContent = 'Prompt';
      const promptBox = document.createElement('div');
      promptBox.className = 'expansion-root-title';
      promptBox.textContent = turn.prompt;
      turnNode.appendChild(promptLabel);
      turnNode.appendChild(promptBox);
    }

    const fanoutLabel = document.createElement('div');
    fanoutLabel.className = 'expansion-node-label';
    fanoutLabel.textContent = (turn.queries || []).length ? 'Fan-out queries' : 'No fan-out detected for this turn';
    turnNode.appendChild(fanoutLabel);

    if ((turn.queries || []).length) appendQueryList(turnNode, turn.queries);
    tree.appendChild(turnNode);
  });

  els.queryExpansionWrap.appendChild(tree);
}

function renderCitationStrength(data) {
  // Design-system .bars chart: 3-column grid (domain | track | count)
  // with accent-teal fill scaled to the row's count.
  const domainCounts = data?.domainCounts || [];
  const wrap = els.citationStrengthWrap;
  if (!wrap) return;
  wrap.innerHTML = '';
  if (els.citationStrengthEmpty) els.citationStrengthEmpty.hidden = domainCounts.length > 0;
  wrap.hidden = domainCounts.length === 0;
  if (els.citationStrengthSummary) {
    els.citationStrengthSummary.textContent = domainCounts.length
      ? `${data.citedSources} CITATIONS · ${data.uniqueDomains.length} SITES`
      : 'HOW OFTEN EACH DOMAIN WAS CITED';
  }
  if (!domainCounts.length) return;
  const maxCount = Math.max(...domainCounts.map((item) => item.count), 1);
  domainCounts.forEach(({ domain, count }) => {
    const dom = document.createElement('div');
    dom.className = 'row-domain';
    dom.textContent = domain;

    const track = document.createElement('div');
    track.className = 'row-track';
    const fill = document.createElement('div');
    fill.className = 'row-fill';
    fill.style.width = `${Math.max(8, Math.round((count / maxCount) * 100))}%`;
    track.appendChild(fill);

    const countEl = document.createElement('div');
    countEl.className = 'row-count';
    countEl.textContent = String(count);

    wrap.appendChild(dom);
    wrap.appendChild(track);
    wrap.appendChild(countEl);
  });
}

// ============================================================================
// 5. RENDERERS — one per tab panel plus shared sub-renderers. Every
//    render* function reads module-scope state set by section 4 (parsed
//    payload) or section 9 (inspection results).
// ============================================================================

// --- Stage 4.2 capture picker helpers -------------------------------------

function formatPickerTimestamp(iso) {
  if (!iso) return 'Unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return time;
  const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${date} ${time}`;
}

function buildChatgptPickerLabel(entry, isLatest) {
  const stamp = formatPickerTimestamp(entry?.capturedAt);
  // Prefer the ChatGPT sidebar title (stable across turns) over the
  // last-turn prompt. Fall back to the prompt for legacy entries that
  // pre-date title capture, then to the conversationId as a last
  // resort so we never render a bare timestamp.
  const raw = entry?.title || entry?.latestUserPrompt || entry?.conversationId || 'Untitled conversation';
  const label = sanitizeString(raw, 60);
  const suffix = isLatest ? ' · Latest' : '';
  return `${stamp} — ${label}${suffix}`;
}

function buildGooglePickerLabel(entry, isLatest) {
  const stamp = formatPickerTimestamp(entry?.capturedAt);
  const engine = entry?.engineLabel || titleCaseEngine(entry?.engine || '');
  const query = sanitizeString(entry?.query || 'No query', 60);
  const suffix = isLatest ? ' · Latest' : '';
  return `${stamp} — ${engine}: ${query}${suffix}`;
}

function findArchiveEntryById(archive, id) {
  if (!id) return null;
  return archive.find((entry) => entry?.id === id) || null;
}

// Stage 5.9: paint the prominent picker bar with the currently-shown
// capture's title + mono timestamp chip. Short-circuits renderChatgpt
// being about to overwrite the same surface — the picker needs its own
// always-up-to-date reflection of the selection.
function paintChatgptPickerCurrent(entry, isLatest) {
  const currentEl = document.getElementById('chatgptPickerCurrent');
  const stampEl = document.getElementById('chatgptPickerStamp');
  if (currentEl) {
    const label = sanitizeString(entry?.title || entry?.latestUserPrompt || entry?.conversationId || 'Untitled conversation', 120);
    currentEl.textContent = label;
  }
  if (stampEl) {
    const stamp = formatPickerTimestamp(entry?.capturedAt);
    stampEl.textContent = isLatest ? `${stamp} · LATEST` : stamp;
  }
}

function paintGooglePickerCurrent(entry, isLatest) {
  const currentEl = document.getElementById('googlePickerCurrent');
  const stampEl = document.getElementById('googlePickerStamp');
  if (currentEl) {
    const engine = entry?.engineLabel || titleCaseEngine(entry?.engine || '');
    const query = sanitizeString(entry?.query || 'No query', 120);
    currentEl.textContent = engine ? `${engine}: ${query}` : query;
  }
  if (stampEl) {
    const stamp = formatPickerTimestamp(entry?.capturedAt);
    stampEl.textContent = isLatest ? `${stamp} · LATEST` : stamp;
  }
}

function renderChatgptPicker() {
  const select = els.chatgptPickerSelect;
  const card = els.chatgptPickerCard;
  if (!select || !card) return;
  if (!Array.isArray(chatgptArchive) || chatgptArchive.length === 0) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  const currentId = userPickedChatgptId || lastChatgptData?.id || chatgptArchive[0]?.id || '';
  select.innerHTML = '';
  let currentEntry = null;
  chatgptArchive.forEach((entry, idx) => {
    if (!entry?.id) return;
    const opt = document.createElement('option');
    opt.value = entry.id;
    opt.textContent = buildChatgptPickerLabel(entry, idx === 0);
    if (entry.id === currentId) { opt.selected = true; currentEntry = entry; }
    select.appendChild(opt);
  });
  const activeEntry = currentEntry || chatgptArchive[0];
  const isLatest = chatgptArchive[0]?.id === activeEntry?.id;
  paintChatgptPickerCurrent(activeEntry, isLatest);
  updateChatgptPickerNote();
}

function renderGooglePicker() {
  const select = els.googlePickerSelect;
  const card = els.googlePickerCard;
  if (!select || !card) return;
  if (!Array.isArray(googleArchive) || googleArchive.length === 0) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  const currentId = userPickedGoogleId || lastGoogleData?.id || googleArchive[0]?.id || '';
  select.innerHTML = '';
  let currentEntry = null;
  googleArchive.forEach((entry, idx) => {
    if (!entry?.id) return;
    const opt = document.createElement('option');
    opt.value = entry.id;
    opt.textContent = buildGooglePickerLabel(entry, idx === 0);
    if (entry.id === currentId) { opt.selected = true; currentEntry = entry; }
    select.appendChild(opt);
  });
  const activeEntry = currentEntry || googleArchive[0];
  const isLatest = googleArchive[0]?.id === activeEntry?.id;
  paintGooglePickerCurrent(activeEntry, isLatest);
  updateGooglePickerNote();
}

function updateChatgptPickerNote() {
  const note = els.chatgptPickerNote;
  if (!note) return;
  if (userPickedChatgptId) {
    note.hidden = false;
    note.textContent = 'Viewing an archived capture. New captures stay queued — open the dropdown to return to Latest.';
  } else {
    note.hidden = true;
    note.textContent = '';
  }
}

function updateGooglePickerNote() {
  const note = els.googlePickerNote;
  if (!note) return;
  if (userPickedGoogleId) {
    note.hidden = false;
    note.textContent = 'Viewing an archived SERP capture. New captures stay queued — open the dropdown to return to Latest.';
  } else {
    note.hidden = true;
    note.textContent = '';
  }
}

function handleChatgptPickerChange(selectedId) {
  if (!selectedId) return;
  const entry = findArchiveEntryById(chatgptArchive, selectedId);
  if (!entry) return;
  const isLatest = chatgptArchive[0]?.id === selectedId;
  userPickedChatgptId = isLatest ? null : selectedId;
  lastChatgptData = entry;
  renderChatgpt(lastChatgptData);
  renderCombined();
  renderHistory();
  populatePopup();
  paintChatgptPickerCurrent(entry, isLatest);
  updateChatgptPickerNote();
}

function handleGooglePickerChange(selectedId) {
  if (!selectedId) return;
  const entry = findArchiveEntryById(googleArchive, selectedId);
  if (!entry) return;
  const isLatest = googleArchive[0]?.id === selectedId;
  userPickedGoogleId = isLatest ? null : selectedId;
  lastGoogleData = entry;
  renderGoogle(lastGoogleData);
  renderCombined();
  renderHistory();
  populatePopup();
  paintGooglePickerCurrent(entry, isLatest);
  updateGooglePickerNote();
}

async function refreshChatgptArchive() {
  chatgptArchive = await self.AIQIShared.storage.loadChatgptArchive();
  // If the user had picked an entry that has since been trimmed out of
  // the archive, drop the pin so they start tracking live again rather
  // than staring at an orphan id.
  if (userPickedChatgptId && !findArchiveEntryById(chatgptArchive, userPickedChatgptId)) {
    userPickedChatgptId = null;
  }
  renderChatgptPicker();
}

async function refreshGoogleArchive() {
  googleArchive = await self.AIQIShared.storage.loadGoogleArchive();
  if (userPickedGoogleId && !findArchiveEntryById(googleArchive, userPickedGoogleId)) {
    userPickedGoogleId = null;
  }
  renderGooglePicker();
}

// --- end picker helpers ---------------------------------------------------

// --- Stage 4.4 history / retention helpers --------------------------------

function removeHistoryEntry(matchKey) {
  if (!matchKey) return;
  const before = comparisonHistory.length;
  comparisonHistory = comparisonHistory.filter((h) => (h.id || h.savedAt) !== matchKey);
  if (comparisonHistory.length === before) return;
  // Clear the fingerprint so the next capture of the same query is
  // re-saved rather than suppressed by the dedup check.
  lastSavedFingerprint = '';
  renderHistory();
  saveLocalState().catch(() => {});
  showToast('Saved comparison removed');
}

async function handleHistoryRetentionChange(value) {
  const cap = Number(value) || 100;
  currentSettings = await self.AIQIShared.setSettings({ historyRetention: cap });
  if (Array.isArray(comparisonHistory) && comparisonHistory.length > cap) {
    comparisonHistory = comparisonHistory.slice(0, cap);
    renderHistory();
    await saveLocalState();
    showToast(`Trimmed to the ${cap} most recent comparisons`);
  } else {
    showToast(`History cap set to ${cap}`);
  }
}

async function handleArchiveRetentionChange(value) {
  const cap = Number(value) || 200;
  currentSettings = await self.AIQIShared.setSettings({ archiveRetention: cap });
  // Trim in-place so the user sees the new limit immediately, not
  // only when the next capture lands.
  await self.AIQIShared.storage.trimChatgptArchive(cap);
  await self.AIQIShared.storage.trimGoogleArchive(cap);
  await refreshChatgptArchive();
  await refreshGoogleArchive();
  showToast(`Archive cap set to ${cap} per engine`);
}

async function handleClearChatgptArchive() {
  await self.AIQIShared.storage.clearChatgptArchive();
  await refreshChatgptArchive();
  // Drop any pin that was pointing into the now-empty archive.
  userPickedChatgptId = null;
  showToast('ChatGPT archive cleared');
}

async function handleClearGoogleArchive() {
  await self.AIQIShared.storage.clearGoogleArchive();
  await refreshGoogleArchive();
  userPickedGoogleId = null;
  showToast('Google archive cleared');
}

// --- end history / retention helpers --------------------------------------

// --- Stage 5.7 popup-shell renderer ---------------------------------------

// Writes lastChatgptData + lastGoogleData into the compact popup DOM
// (id="popupShell"). The dashboard renderers run as well — this just
// paints the different shell the user sees when the extension is
// opened as a browser popup rather than the full-page dashboard.
function populatePopup() {
  if (typeof document === 'undefined') return;
  const shell = document.getElementById('popupShell');
  if (!shell) return;

  const prompt = lastChatgptData?.latestUserPrompt || '';
  const quote = document.getElementById('popupQuote');
  const eyebrow = document.getElementById('popupEyebrow');
  if (quote) quote.textContent = prompt || 'Open a ChatGPT conversation to see it here.';
  if (eyebrow) {
    const title = sanitizeString(lastChatgptData?.title || '', 80);
    eyebrow.textContent = title ? `CHAT · ${title.toUpperCase()}` : (prompt ? 'LAST PROMPT' : 'NO PROMPT YET');
  }

  // Brand model pill — short for 580px layout.
  const modelPill = document.getElementById('popupModelPill');
  if (modelPill) {
    const model = sanitizeString(lastChatgptData?.model || '', 60);
    modelPill.textContent = model || 'claude';
  }

  // Hero retrieval intensity.
  const q = lastChatgptData?.queries?.length || 0;
  const c = lastChatgptData?.citedSources || 0;
  const s = lastChatgptData?.uniqueDomains?.length || 0;
  const heroValue = document.getElementById('popupHeroValue');
  const heroSub = document.getElementById('popupHeroSub');
  if (heroValue) heroValue.textContent = String(q);
  if (heroSub) heroSub.textContent = `fan-outs · ${c} cites · ${s} sites`;

  // Mini-stats strip — 3 cells. F1 was removed (lived as a fourth
  // cell) because users without the precision/recall context found
  // the headline number opaque. F1 still surfaces on the Compare tab
  // where the .precision-strip explains its meaning inline.
  const miniFan = document.getElementById('popupMiniFanouts');
  const miniCites = document.getElementById('popupMiniCites');
  const miniSites = document.getElementById('popupMiniSites');
  if (miniFan) miniFan.textContent = String(q);
  if (miniCites) miniCites.textContent = String(c);
  if (miniSites) miniSites.textContent = String(s);

  // Fan-out queries pop-section.
  const fanoutList = document.getElementById('popupFanoutList');
  const fanoutEmpty = document.getElementById('popupFanoutEmpty');
  const fanoutMeta = document.getElementById('popupFanoutMeta');
  const queries = lastChatgptData?.queries || [];
  if (fanoutList) {
    fanoutList.innerHTML = '';
    queries.slice(0, 5).forEach((item, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display: grid; grid-template-columns: 22px 1fr; gap: 8px; align-items: baseline; padding: 6px 0; border-bottom: 1px dashed var(--border); font-size: var(--fs-body-sm);';
      if (i === Math.min(queries.length - 1, 4)) row.style.borderBottom = 'none';
      const idx = document.createElement('span');
      idx.style.cssText = 'font-family: var(--font-mono); font-size: var(--fs-eyebrow); color: var(--ink-4); text-align: right;';
      idx.textContent = String(i + 1).padStart(2, '0');
      const text = document.createElement('span');
      text.style.color = 'var(--ink)';
      text.textContent = item.q;
      row.appendChild(idx);
      row.appendChild(text);
      fanoutList.appendChild(row);
    });
  }
  if (fanoutEmpty) fanoutEmpty.hidden = queries.length > 0;
  if (fanoutMeta) fanoutMeta.textContent = queries.length
    ? `${queries.length} QUERIES${queries.length > 5 ? ' · TOP 5' : ''}`
    : 'NONE';

  // Top cited sources pop-section — design-system .src-row markup.
  const sourcesList = document.getElementById('popupSourcesList');
  const sourcesEmpty = document.getElementById('popupSourcesEmpty');
  const sourcesMeta = document.getElementById('popupSourcesMeta');
  const sources = (lastChatgptData?.sources || []).slice(0, 5);
  if (sourcesList) {
    sourcesList.innerHTML = '';
    sources.forEach((src) => {
      const row = document.createElement('div');
      row.className = 'src-row';
      const fav = document.createElement('span');
      fav.className = 'fav';
      fav.setAttribute('aria-hidden', 'true');
      const body = document.createElement('div');
      const domain = document.createElement('div');
      domain.className = 'domain';
      domain.textContent = src.domain || 'source';
      const title = document.createElement('div');
      title.style.cssText = 'color: var(--ink-2); font-size: var(--fs-body-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 380px;';
      title.textContent = src.title || src.url || '';
      body.appendChild(domain);
      body.appendChild(title);
      const type = document.createElement('span');
      const cited = (src.citedCount || 0) > 0;
      type.className = `type ${cited ? 'type-cited' : 'type-considered'}`;
      type.textContent = cited ? 'CITED' : 'CONS.';
      const mentions = document.createElement('span');
      mentions.className = 'mentions';
      mentions.textContent = `${src.count || 0}×`;
      row.appendChild(fav);
      row.appendChild(body);
      row.appendChild(type);
      row.appendChild(mentions);
      sourcesList.appendChild(row);
    });
  }
  if (sourcesEmpty) sourcesEmpty.hidden = sources.length > 0;
  if (sourcesMeta) {
    const totalSources = lastChatgptData?.sources?.length || 0;
    sourcesMeta.textContent = totalSources
      ? `${totalSources} TOTAL${totalSources > 5 ? ' · TOP 5' : ''}`
      : 'NONE';
  }

  // Compare-with-Google prominent section meta.
  const compareMeta = document.getElementById('popupCompareMeta');
  const compareCopy = document.getElementById('popupCompareCopy');
  if (lastGoogleData?.resultCount) {
    const combined = buildCombinedData();
    if (compareMeta) compareMeta.textContent = combined ? `${combined.f1Score}% F1` : 'Captured';
    if (compareCopy) compareCopy.textContent = combined
      ? `${combined.overlap.length} of ${combined.overlap.length + combined.chatOnly.length} ChatGPT sites also appear in Google. Open Compare for details.`
      : 'SERP captured. Open the dashboard for the breakdown.';
  } else {
    if (compareMeta) compareMeta.textContent = 'Not captured';
    if (compareCopy) compareCopy.textContent = 'Open the latest prompt on Google and see overlap, precision, and missed citations.';
  }
}

// --- end popup-shell renderer ---------------------------------------------

function formatRelativeCapturedAt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'captured just now';
  if (mins < 60) return `captured ${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `captured ${hrs}h ago`;
  return `captured ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

function renderChatgpt(data) {
  // Prompt-hero (stage 5.3): quote + model chip + origin chip + intent
  // chip + captured-at chip. Legacy #infoPromptText / #latestPromptText
  // are kept as visually-hidden mirrors for renderers that still read
  // the DOM for the prompt text.
  const prompt = data?.latestUserPrompt || '';
  if (els.promptQuote) {
    els.promptQuote.textContent = prompt || 'Open a ChatGPT conversation to see it here.';
    els.promptQuote.classList.toggle('empty', !prompt);
  }
  if (els.promptEyebrow) {
    const title = sanitizeString(data?.title || '', 80);
    const turns = Array.isArray(data?.conversationTurns) ? data.conversationTurns.length : 0;
    const turnLabel = turns > 1 ? `TURN ${turns} OF ${turns}` : turns === 1 ? 'TURN 1' : '';
    els.promptEyebrow.textContent = [title ? `CHAT · ${title.toUpperCase()}` : 'LAST PROMPT', turnLabel].filter(Boolean).join(' · ');
  }
  const infoPrompt = document.getElementById('infoPromptText');
  if (infoPrompt) infoPrompt.textContent = prompt || 'No prompt detected yet.';
  if (els.latestPromptText) els.latestPromptText.textContent = prompt || 'No prompt detected yet.';

  // Captured-at chip in the prompt-hero meta row.
  if (els.promptCapturedAt) {
    els.promptCapturedAt.textContent = formatRelativeCapturedAt(data?.capturedAt);
  }

  // Model chip — inner text in #modelBadgeText, chip dot toggles with
  // whether we actually have a model value.
  if (els.modelBadgeText) els.modelBadgeText.textContent = data?.model || 'Unknown';
  if (els.modelBadge) els.modelBadge.classList.toggle('muted', !data?.model);

  // KPI strip.
  els.fanoutCount.textContent = String(data?.queries?.length || 0);
  els.sourceCount.textContent = String(data?.citedSources || 0);
  els.siteCount.textContent = String(data?.uniqueDomains?.length || 0);
  if (els.utmCoverage) els.utmCoverage.textContent = `${data?.utmCount || 0} / ${data?.totalUrls || 0}`;
  els.retrievalIntensityValue.textContent = `${data?.queries?.length || 0} / ${data?.citedSources || 0} / ${data?.uniqueDomains?.length || 0}`;
  els.retrievalIntensityMeta.textContent = 'Fan-outs / citations / sites';

  // Fan-out section count pill.
  const fanoutBadge = document.getElementById('fanoutBadgeCount');
  if (fanoutBadge) fanoutBadge.textContent = String(data?.queries?.length || 0);

  // Prompt-cta inline status + bottom compare-cta visibility.
  const hasGoogle = !!lastGoogleData?.resultCount;
  if (els.promptCtaStatus) {
    els.promptCtaStatus.textContent = hasGoogle
      ? `SERP captured · ${lastGoogleData.resultCount} results`
      : 'No SERP captured yet';
  }
  if (els.chatgptCompareCta) {
    // Show the bottom CTA once a prompt exists, regardless of whether
    // the SERP is already captured — it's the bridge to the Compare tab.
    els.chatgptCompareCta.hidden = !prompt;
  }

  // Search origin chip.
  const origin = data?.searchOrigin || { label: 'Unknown', confidence: '', tone: 'muted' };
  if (els.searchOriginBadgeText) els.searchOriginBadgeText.textContent = origin.label;
  if (els.searchOriginBadge) els.searchOriginBadge.classList.toggle('mono', false);
  if (els.searchOriginConfidence) els.searchOriginConfidence.textContent = origin.confidence ? `${origin.confidence} confidence` : '';

  // Prompt intent chip — shown only when classifier returned a bucket.
  if (els.promptIntentBadge) {
    const intent = self.AIQIShared.classifyPromptIntent(prompt);
    if (intent) {
      if (els.promptIntentBadgeText) els.promptIntentBadgeText.textContent = `Intent · ${intent.label}`;
      els.promptIntentBadge.classList.remove('hidden');
      els.promptIntentBadge.title = intent.description;
    } else {
      els.promptIntentBadge.classList.add('hidden');
    }
  }

  els.fanoutsList.innerHTML = '';
  const queries = data?.queries || [];
  els.fanoutsEmpty.classList.toggle('hidden', queries.length > 0);
  els.fanoutsList.classList.toggle('hidden', queries.length === 0);
  queries.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'query-item';
    const query = document.createElement('p');
    query.className = 'query-text';
    query.textContent = item.q;
    li.appendChild(query);
    if (item.domains.length) {
      const domainTags = document.createElement('div');
      domainTags.className = 'domain-tags';
      item.domains.forEach((domain) => {
        const tag = document.createElement('span');
        tag.className = 'domain-tag';
        tag.textContent = domain;
        domainTags.appendChild(tag);
      });
      li.appendChild(domainTags);
    }
    els.fanoutsList.appendChild(li);
  });

  renderQueryExpansion(data);
  renderCitationStrength(data);

  els.sitesWrap.innerHTML = '';
  const domainCounts = data?.domainCounts || [];
  els.sitesEmpty.classList.toggle('hidden', domainCounts.length > 0);
  els.sitesWrap.classList.toggle('hidden', domainCounts.length === 0);
  els.sitesSummary.classList.toggle('hidden', domainCounts.length === 0);
  els.sitesSummary.textContent = domainCounts.length ? `${data.citedSources} total citations across ${data.uniqueDomains.length} sites` : '';

  domainCounts.forEach(({ domain, count }) => {
    const row = document.createElement('div');
    row.className = 'site-row';
    const name = document.createElement('div');
    name.className = 'site-name';
    name.textContent = domain;
    const meta = document.createElement('div');
    meta.className = 'site-meta';
    const countPill = document.createElement('span');
    countPill.className = 'site-count';
    countPill.textContent = `${count} ${count === 1 ? 'hit' : 'hits'}`;
    meta.appendChild(countPill);
    row.appendChild(name);
    row.appendChild(meta);
    els.sitesWrap.appendChild(row);
  });

  renderConversationTurns(data);
  renderSources(data);
}


function renderConversationTurns(data) {
  const turns = data?.conversationTurns || [];
  if (!els.turnsWrap) return;
  els.turnsWrap.innerHTML = '';
  els.turnsEmpty.classList.toggle('hidden', turns.length > 0);
  els.turnsWrap.classList.toggle('hidden', turns.length === 0);
  els.turnsSummary.classList.toggle('hidden', turns.length === 0);
  els.turnsSummary.textContent = turns.length ? `${turns.length} prompt turn${turns.length === 1 ? '' : 's'} detected` : '';
  turns.forEach((turn) => {
    const details = document.createElement('details');
    details.className = 'turn-card';
    details.open = !isFullPage && turn.index === turns.length;
    const summary = document.createElement('summary');
    summary.className = 'turn-summary';
    const left = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'turn-title';
    title.textContent = `Prompt ${turn.index}: ${turn.prompt}`;
    left.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'turn-meta';
    [
      `${turn.queryCount || 0} fan-outs`,
      `${turn.citedSourceCount || 0} cited sources`,
      `${turn.uniqueSourceCount || 0} sources`,
      `${turn.uniqueSiteCount || 0} sites`
    ].forEach((text) => {
      const pill = document.createElement('span');
      pill.className = 'turn-pill';
      pill.textContent = text;
      meta.appendChild(pill);
    });
    left.appendChild(meta);

    const right = document.createElement('span');
    right.className = 'turn-pill';
    right.textContent = details.open ? 'Expanded' : 'Collapsed';
    details.addEventListener('toggle', () => { right.textContent = details.open ? 'Expanded' : 'Collapsed'; });
    summary.appendChild(left);
    summary.appendChild(right);
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'turn-body';

    const queries = document.createElement('div');
    queries.className = 'turn-subgrid';
    queries.innerHTML = `<div class="expansion-label">Queries for this turn</div>`;
    const qList = document.createElement('div');
    qList.className = 'turn-list';
    (turn.queries || []).forEach((q) => {
      const row = document.createElement('div');
      row.className = 'turn-list-item';
      row.textContent = q.domains?.length ? `${q.q} [${q.domains.join(', ')}]` : q.q;
      qList.appendChild(row);
    });
    if (!turn.queries?.length) {
      const row = document.createElement('div');
      row.className = 'turn-list-item';
      row.textContent = 'No explicit fan-out queries captured for this turn.';
      qList.appendChild(row);
    }
    queries.appendChild(qList);

    const sources = document.createElement('div');
    sources.className = 'turn-subgrid';
    sources.innerHTML = `<div class="expansion-label">Sources for this turn</div>`;
    const sList = document.createElement('div');
    sList.className = 'turn-list';
    (turn.sources || []).slice(0, 8).forEach((s) => {
      const row = document.createElement('div');
      row.className = 'turn-list-item';
      row.textContent = `${s.statusLabel || 'Source'} · ${s.domain || 'source'}${s.title ? ' · ' + s.title : ''}`;
      sList.appendChild(row);
    });
    if (!turn.sources?.length) {
      const row = document.createElement('div');
      row.className = 'turn-list-item';
      row.textContent = 'No source objects captured for this turn.';
      sList.appendChild(row);
    }
    sources.appendChild(sList);

    body.appendChild(queries);
    body.appendChild(sources);
    details.appendChild(body);
    els.turnsWrap.appendChild(details);
  });
}

function renderSources(data) {
  const sources = data?.sources || [];
  const tbody = els.sourcesWrap;
  if (!tbody) return;
  tbody.innerHTML = '';
  const empty = els.sourcesEmpty;
  const summary = els.sourcesSummary;
  // Hide/show the empty-state + the <tbody> parent table wrapper.
  const tableWrap = tbody.closest('.table-wrap');
  if (empty) empty.hidden = sources.length > 0;
  if (tableWrap) tableWrap.hidden = sources.length === 0;
  if (summary) summary.textContent = sources.length
    ? `${sources.length} UNIQUE SOURCE LINKS CAPTURED`
    : 'ALL DOMAINS, URLS AND TITLES';

  sources.forEach((item, idx) => {
    const tr = document.createElement('tr');

    const rank = document.createElement('td');
    rank.className = 'rank';
    rank.textContent = String(idx + 1).padStart(2, '0');

    const domainCell = document.createElement('td');
    const domainWrap = document.createElement('div');
    domainWrap.className = 'domain-cell';
    const fav = document.createElement('span');
    fav.className = 'fav';
    fav.setAttribute('aria-hidden', 'true');
    const domainText = document.createElement('span');
    domainText.className = 'domain';
    domainText.textContent = item.domain || 'source';
    domainWrap.appendChild(fav);
    domainWrap.appendChild(domainText);
    domainCell.appendChild(domainWrap);

    const titleCell = document.createElement('td');
    const titleWrap = document.createElement('div');
    titleWrap.className = 'title';
    titleWrap.textContent = item.title || item.url || '';
    const urlSub = document.createElement('span');
    urlSub.className = 'sub';
    urlSub.textContent = item.url || '';
    titleWrap.appendChild(urlSub);
    titleCell.appendChild(titleWrap);

    const typeCell = document.createElement('td');
    typeCell.className = 'type-cell';
    const typePill = document.createElement('span');
    const isCited = item.status !== 'considered' && (item.citedCount || 0) > 0;
    typePill.className = `type ${isCited ? 'type-cited' : 'type-considered'}`;
    typePill.textContent = isCited ? 'CITED' : 'CONSIDERED';
    typeCell.appendChild(typePill);

    const countCell = document.createElement('td');
    countCell.className = 'count-cell';
    countCell.textContent = String(item.count || 0);

    tr.appendChild(rank);
    tr.appendChild(domainCell);
    tr.appendChild(titleCell);
    tr.appendChild(typeCell);
    tr.appendChild(countCell);
    tbody.appendChild(tr);
  });
}

function renderGoogle(data) {
  // Stage 5.4: two-state panel. If no SERP yet, show the empty-state
  // hero + preview cards; else render the prompt-hero + kpi-strip +
  // serp-layout with ranked results and the aside cards.
  const emptyState = document.getElementById('googleEmptyState');
  const capturedState = document.getElementById('googleCapturedState');
  const hasCapture = !!data?.resultCount;
  if (emptyState) emptyState.hidden = hasCapture;
  if (capturedState) capturedState.hidden = !hasCapture;
  if (!hasCapture) return;

  // Prompt-hero: SERP query as the quote.
  if (els.googleQueryLabel) els.googleQueryLabel.textContent = data?.query || '—';
  const capturedAtChip = document.getElementById('googleCapturedAt');
  if (capturedAtChip) capturedAtChip.textContent = formatRelativeCapturedAt(data?.capturedAt);
  if (els.googleEngineLabel) els.googleEngineLabel.textContent = data?.engineLabel || 'Unknown';
  if (els.googleCaptureMode) els.googleCaptureMode.textContent = data?.captureMode || 'Local page';

  // KPI strip.
  if (els.googleResultCount) els.googleResultCount.textContent = String(data?.resultCount || 0);
  if (els.googleSiteCount) els.googleSiteCount.textContent = String(data?.uniqueDomains?.length || 0);
  if (els.googleFeatureCount) els.googleFeatureCount.textContent = String(data?.serpFeatures?.length || 0);
  const engineKpi = document.getElementById('googleEngineKpi');
  if (engineKpi) engineKpi.textContent = data?.engineLabel || '—';

  // Aside: sites found (domain frequency).
  const domainCounts = (data?.results || []).reduce((acc, item) => {
    acc[item.domain] = (acc[item.domain] || 0) + 1;
    return acc;
  }, {});
  const siteRows = Object.entries(domainCounts)
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));
  const sitesWrap = els.googleSitesWrap;
  const sitesEmpty = els.googleSitesEmpty;
  if (sitesWrap) {
    sitesWrap.innerHTML = '';
    if (sitesEmpty) sitesEmpty.hidden = siteRows.length > 0;
    siteRows.forEach(({ domain, count }) => {
      const row = document.createElement('div');
      row.className = 'f-item';
      const k = document.createElement('span');
      k.className = 'k';
      k.textContent = domain;
      const v = document.createElement('span');
      v.className = 'v';
      v.textContent = String(count);
      row.appendChild(k);
      row.appendChild(v);
      sitesWrap.appendChild(row);
    });
  }

  // Aside: SERP features detected.
  const featuresWrap = els.googleFeaturesWrap;
  const featuresEmpty = els.googleFeaturesEmpty;
  const features = data?.serpFeatures || [];
  if (featuresWrap) {
    featuresWrap.innerHTML = '';
    if (featuresEmpty) featuresEmpty.hidden = features.length > 0;
    features.forEach((feature) => {
      const row = document.createElement('div');
      row.className = 'f-item';
      const k = document.createElement('span');
      k.className = 'k';
      k.textContent = feature;
      const v = document.createElement('span');
      v.className = 'v';
      v.textContent = '✓';
      row.appendChild(k);
      row.appendChild(v);
      featuresWrap.appendChild(row);
    });
  }

  // Main column: ranked .serp-result rows. Flagged with .in-ai when
  // the domain also shows up in the current ChatGPT citation set.
  const resultsWrap = els.googleResultsWrap;
  if (!resultsWrap) return;
  resultsWrap.innerHTML = '';
  const results = data?.results || [];
  if (els.googleEmpty) els.googleEmpty.hidden = results.length > 0;

  const chatDomainFold = currentSettings?.matchByRegisteredDomain !== false
    ? self.AIQIShared.registeredDomain
    : self.AIQIShared.normalizeDomain;
  const chatSet = new Set((lastChatgptData?.uniqueDomains || []).map((d) => chatDomainFold(d)).filter(Boolean));

  results.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'serp-result';

    const rank = document.createElement('div');
    rank.className = 'serp-rank';
    rank.textContent = String(item.rank).padStart(2, '0');

    const main = document.createElement('div');
    const siteLine = document.createElement('div');
    siteLine.className = 'site-line';
    const fav = document.createElement('span');
    fav.className = 'fav';
    fav.setAttribute('aria-hidden', 'true');
    const site = document.createElement('span');
    site.className = 'site';
    site.textContent = item.domain;
    siteLine.appendChild(fav);
    siteLine.appendChild(site);

    const h = document.createElement('h4');
    const link = document.createElement('a');
    link.href = item.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = item.title;
    h.appendChild(link);

    const snippet = document.createElement('div');
    snippet.className = 'snippet';
    snippet.textContent = item.snippet || item.url;

    const badges = document.createElement('div');
    badges.className = 'badges';
    const rankBadge = document.createElement('span');
    rankBadge.className = 'badge';
    rankBadge.textContent = `RANK ${item.rank}`;
    badges.appendChild(rankBadge);
    if (chatSet.has(chatDomainFold(item.domain))) {
      const aiBadge = document.createElement('span');
      aiBadge.className = 'badge in-ai';
      aiBadge.textContent = 'Cited by ChatGPT';
      badges.appendChild(aiBadge);
    }

    main.appendChild(siteLine);
    main.appendChild(h);
    main.appendChild(snippet);
    main.appendChild(badges);

    row.appendChild(rank);
    row.appendChild(main);
    resultsWrap.appendChild(row);
  });
}

// ============================================================================
// 6. DATA BUILDERS — derive presentation-ready records from the raw
//    ChatGPT + Google state. Consumed by both renderers and exporters.
// ============================================================================
function buildCombinedData() {
  if (!lastChatgptData || !lastGoogleData) return null;

  // When matchByRegisteredDomain is on, collapse `en.wikipedia.org` and
  // `wikipedia.org` to the same key before set operations — otherwise
  // the overlap score under-counts every multi-subdomain site.
  const byReg = currentSettings?.matchByRegisteredDomain !== false;
  const fold = (host) => byReg
    ? self.AIQIShared.registeredDomain(host || '')
    : self.AIQIShared.normalizeDomain(host || '');

  const chatSet = new Set((lastChatgptData.uniqueDomains || []).map(fold).filter(Boolean));
  const googleSet = new Set((lastGoogleData.uniqueDomains || []).map(fold).filter(Boolean));
  const overlap = [...chatSet].filter((domain) => googleSet.has(domain)).sort();
  const chatOnly = [...chatSet].filter((domain) => !googleSet.has(domain)).sort();
  const googleOnly = [...googleSet].filter((domain) => !chatSet.has(domain)).sort();
  // Overlap is a set-comparison problem; report it through the standard IR
  // lenses so users can see which kind of agreement they're getting:
  //   precision = |A∩B| / |A|   — of the sites ChatGPT cited, share also on SERP
  //   recall    = |A∩B| / |B|   — of the SERP domains, share ChatGPT cited
  //   f1        = 2PR / (P+R)   — harmonic mean; headline score
  //   jaccard   = |A∩B| / |A∪B| — symmetric set similarity
  // `overlapScore` retains its historical meaning (precision) for the
  // CSV history column — we don't want to silently change persisted
  // numbers — while the UI headline is now F1, which is what users
  // actually want ("how similar are these two sets?").
  const unionSize = new Set([...chatSet, ...googleSet]).size;
  const precisionScore = chatSet.size ? Math.round((overlap.length / chatSet.size) * 100) : 0;
  const recallScore    = googleSet.size ? Math.round((overlap.length / googleSet.size) * 100) : 0;
  const jaccardScore   = unionSize ? Math.round((overlap.length / unionSize) * 100) : 0;
  const f1Score = (precisionScore + recallScore) > 0
    ? Math.round((2 * precisionScore * recallScore) / (precisionScore + recallScore))
    : 0;
  const overlapScore = precisionScore;

  // Fold ChatGPT citation counts and Google results by the same key we
  // used for the set operations. Multiple subdomains under the same
  // registered domain sum their counts; Google rank folds to the best
  // (lowest) rank across any subdomain match.
  const chatCountByFolded = new Map();
  (lastChatgptData.domainCounts || []).forEach((item) => {
    const key = fold(item.domain || '');
    if (!key) return;
    chatCountByFolded.set(key, (chatCountByFolded.get(key) || 0) + (item.count || 0));
  });
  const googleByFolded = new Map();
  (lastGoogleData.results || []).forEach((item) => {
    const key = fold(item.domain || '');
    if (!key) return;
    const existing = googleByFolded.get(key);
    if (!existing || (item.rank || 999) < (existing.rank || 999)) {
      googleByFolded.set(key, item);
    }
  });

  const rows = [];
  const allDomains = [...new Set([...chatSet, ...googleSet])].sort((a, b) => {
    const aGoogle = googleByFolded.get(a)?.rank || 999;
    const bGoogle = googleByFolded.get(b)?.rank || 999;
    const aChat = chatCountByFolded.get(a) || 0;
    const bChat = chatCountByFolded.get(b) || 0;
    return aGoogle - bGoogle || bChat - aChat || a.localeCompare(b);
  });
  allDomains.forEach((domain) => {
    const chatCount = chatCountByFolded.get(domain) || 0;
    const googleResult = googleByFolded.get(domain);
    rows.push({
      domain,
      inChatgpt: chatSet.has(domain),
      chatgptCitations: chatCount,
      inGoogle: googleSet.has(domain),
      googleRank: googleResult?.rank || '',
      googleTitle: googleResult?.title || '',
      googleUrl: googleResult?.url || '',
      googleSnippet: googleResult?.snippet || '',
      overlapLabel: chatSet.has(domain) && googleSet.has(domain) ? 'Shared' : chatSet.has(domain) ? 'ChatGPT only' : 'Google only'
    });
  });

  const missedOpportunities = googleOnly.map((domain) => {
    const googleResult = googleByFolded.get(domain);
    return {
      domain,
      googleRank: googleResult?.rank || '',
      googleTitle: googleResult?.title || '',
      googleUrl: googleResult?.url || ''
    };
  }).sort((a, b) => (a.googleRank || 999) - (b.googleRank || 999) || a.domain.localeCompare(b.domain));

  return {
    query: lastGoogleData.query || lastChatgptData.latestUserPrompt || lastChatgptData.queries?.[0]?.q || '',
    overlap,
    chatOnly,
    googleOnly,
    overlapScore,       // alias for precisionScore (preserved for history/CSV compatibility)
    precisionScore,
    recallScore,
    f1Score,
    jaccardScore,
    overlapMeta: `${overlap.length} of ${chatSet.size} ChatGPT sites appear in ${lastGoogleData.engineLabel || 'search'} results`,
    engine: lastGoogleData.engine || 'google',
    engineLabel: lastGoogleData.engineLabel || 'Google',
    serpFeatures: lastGoogleData.serpFeatures || [],
    missedOpportunities,
    rows
  };
}

function makeHistoryFingerprint(data) {
  return [lastChatgptData?.conversationId || '', lastChatgptData?.capturedAt || '', lastGoogleData?.capturedAt || '', data.query || '', data.engine || ''].join('||');
}

function persistHistorySnapshot() {
  const data = buildCombinedData();
  if (!data) return;
  const fingerprint = makeHistoryFingerprint(data);
  if (!fingerprint || fingerprint === lastSavedFingerprint) return;

  const prior = comparisonHistory.find((item) => item.query === data.query && item.engine === data.engine);
  const currentGoogle = new Set(data.rows.filter((r) => r.inGoogle).map((r) => r.domain));
  const priorGoogle = new Set((prior?.googleDomains || []));
  const addedDomains = [...currentGoogle].filter((d) => !priorGoogle.has(d)).sort();
  const removedDomains = [...priorGoogle].filter((d) => !currentGoogle.has(d)).sort();

  const entry = {
    id: fingerprint,
    savedAt: new Date().toISOString(),
    query: data.query,
    prompt: lastChatgptData?.latestUserPrompt || '',
    conversationTitle: lastChatgptData?.title || '',
    engine: data.engine,
    engineLabel: data.engineLabel,
    model: lastChatgptData?.model || '',
    browser: getBrowserLabel(),
    overlapScore: data.overlapScore,
    overlapCount: data.overlap.length,
    chatgptOnlyCount: data.chatOnly.length,
    googleOnlyCount: data.googleOnly.length,
    fanoutCount: lastChatgptData?.queries?.length || 0,
    citedSources: lastChatgptData?.citedSources || 0,
    chatgptDomains: lastChatgptData?.uniqueDomains || [],
    googleDomains: lastGoogleData?.uniqueDomains || [],
    serpFeatures: lastGoogleData?.serpFeatures || [],
    googleResultCount: lastGoogleData?.resultCount || 0,
    drift: { added: addedDomains.length, removed: removedDomains.length, addedDomains, removedDomains },
    pageContext: {
      chatgptPageUrl: lastChatgptData?.pageUrl || '',
      searchPageUrl: lastGoogleData?.pageUrl || '',
      chatgptCapturedAt: lastChatgptData?.capturedAt || '',
      searchCapturedAt: lastGoogleData?.capturedAt || ''
    }
  };

  const historyCap = Number(currentSettings?.historyRetention) || 100;
  comparisonHistory = [entry, ...comparisonHistory.filter((item) => item.id !== entry.id)].slice(0, historyCap);
  lastSavedFingerprint = fingerprint;
  saveLocalState().catch(() => {});
}

/**
 * Build a tiny inline-SVG sparkline of overlap scores over time for a
 * given history query. Returns an <svg> element (or null if there are
 * fewer than 2 data points). Used by renderHistory() per card to give
 * users a glance view of how ChatGPT's citations track search over
 * repeated captures. Stage 3.5.
 */
function buildOverlapSparkline(seriesAsc) {
  if (!Array.isArray(seriesAsc) || seriesAsc.length < 2) return null;
  const W = 140;
  const H = 36;
  const P = 3; // padding so dots at y=0/y=100 don't clip the frame
  const xmlns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(xmlns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', String(W));
  svg.setAttribute('height', String(H));
  svg.setAttribute('class', 'history-spark');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Overlap trend: ${seriesAsc.map((v) => v + '%').join(' -> ')}`);

  // Baseline at 50% to give context to the trend.
  const base = document.createElementNS(xmlns, 'line');
  base.setAttribute('x1', '0'); base.setAttribute('x2', String(W));
  const baseY = P + (H - 2 * P) * (1 - 0.5);
  base.setAttribute('y1', String(baseY)); base.setAttribute('y2', String(baseY));
  base.setAttribute('stroke', 'rgba(255,255,255,0.1)');
  base.setAttribute('stroke-dasharray', '2 3');
  svg.appendChild(base);

  const points = seriesAsc.map((v, i) => {
    const x = seriesAsc.length === 1 ? W / 2 : (i / (seriesAsc.length - 1)) * W;
    const clamped = Math.min(100, Math.max(0, Number(v) || 0));
    const y = P + (H - 2 * P) * (1 - clamped / 100);
    return { x, y, v: clamped };
  });

  const line = document.createElementNS(xmlns, 'polyline');
  line.setAttribute('points', points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', 'var(--accent, #78a8ff)');
  line.setAttribute('stroke-width', '1.5');
  line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(line);

  // Highlight the latest point.
  const last = points[points.length - 1];
  const dot = document.createElementNS(xmlns, 'circle');
  dot.setAttribute('cx', last.x.toFixed(1));
  dot.setAttribute('cy', last.y.toFixed(1));
  dot.setAttribute('r', '2.6');
  dot.setAttribute('fill', 'var(--accent, #78a8ff)');
  svg.appendChild(dot);

  return svg;
}

// Stage 5.6: key a history entry into a "conversation" bucket. Prefer
// the ChatGPT sidebar title (stable across turns); fall back to the
// first seen query so older pre-title entries still group sanely.
function historyConversationKey(entry) {
  const title = sanitizeString(entry?.conversationTitle || '', 120);
  if (title) return `t:${title.toLowerCase()}`;
  const q = sanitizeString(entry?.query || '', 120);
  if (q) return `q:${q.toLowerCase()}`;
  return 'unknown';
}

function bucketHistoryByConversation(history) {
  const buckets = new Map();
  history.forEach((entry) => {
    const key = historyConversationKey(entry);
    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        title: entry.conversationTitle || entry.query || 'Untitled conversation',
        runs: [],
      });
    }
    buckets.get(key).runs.push(entry);
  });
  // Sort runs within each bucket newest-first (history is already
  // newest-first globally, but stable-sort for safety).
  for (const b of buckets.values()) {
    b.runs.sort((a, b2) => String(b2.savedAt || '').localeCompare(String(a.savedAt || '')));
    const latest = b.runs[0];
    b.latestOverlap = Number(latest?.overlapScore) || 0;
    b.latestEngine = latest?.engineLabel || latest?.engine || '';
    b.latestModel = latest?.model || '';
    b.latestPrompt = latest?.prompt || '';
    b.latestSavedAt = latest?.savedAt || '';
    b.earliestSavedAt = b.runs[b.runs.length - 1]?.savedAt || '';
    const prev = Number(b.runs[1]?.overlapScore) || null;
    b.driftDelta = prev == null ? null : b.latestOverlap - prev;
    b.engines = new Set(b.runs.map((r) => r.engineLabel || r.engine).filter(Boolean));
    b.queries = new Set(b.runs.map((r) => r.query).filter(Boolean));
  }
  return [...buckets.values()].sort((a, b) => String(b.latestSavedAt || '').localeCompare(String(a.latestSavedAt || '')));
}

function renderHistory() {
  const history = comparisonHistory || [];

  // Headline KPI cards (always reflect the full history, not the filter).
  if (els.historyRunCount) els.historyRunCount.textContent = String(history.length);
  const allBuckets = bucketHistoryByConversation(history);
  if (els.historyQueryCount) els.historyQueryCount.textContent = String(allBuckets.length);
  if (els.historyEngineCount) els.historyEngineCount.textContent = String(new Set(history.map((h) => h.engineLabel || h.engine).filter(Boolean)).size);
  if (els.historyLatestOverlap) els.historyLatestOverlap.textContent = history.length ? `${history[0].overlapScore}%` : '0%';
  const totalChip = document.getElementById('historyTotalChip');
  if (totalChip) totalChip.textContent = `${history.length} run${history.length === 1 ? '' : 's'}`;

  // If the user drilled into a conversation but it disappeared (trim,
  // delete), snap back to the list view.
  if (selectedConversationKey && !allBuckets.some((b) => b.key === selectedConversationKey)) {
    selectedConversationKey = null;
  }

  const listView = document.querySelector('#panelHistory .history-view[data-history="list"]');
  const detailView = document.querySelector('#panelHistory .history-view[data-history="detail"]');
  if (listView) { listView.classList.toggle('active', !selectedConversationKey); listView.hidden = !!selectedConversationKey; }
  if (detailView) { detailView.classList.toggle('active', !!selectedConversationKey); detailView.hidden = !selectedConversationKey; }

  if (selectedConversationKey) {
    renderHistoryDetail(allBuckets.find((b) => b.key === selectedConversationKey));
  } else {
    renderHistoryList(allBuckets);
  }
}

function renderHistoryList(buckets) {
  const wrap = els.historyWrap;
  if (!wrap) return;
  wrap.innerHTML = '';
  const term = historySearchTerm.trim().toLowerCase();
  const matches = term
    ? buckets.filter((b) => {
        const haystack = [
          b.title, b.latestPrompt, b.latestEngine, b.latestModel,
          ...[...b.queries], ...[...b.engines],
          ...b.runs.flatMap((r) => [
            ...(Array.isArray(r.googleDomains) ? r.googleDomains : []),
            ...(Array.isArray(r.chatgptDomains) ? r.chatgptDomains : []),
            r.browser,
          ]),
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(term);
      })
    : buckets;

  const hasAny = buckets.length > 0;
  const hasVisible = matches.length > 0;
  if (els.historyEmpty) els.historyEmpty.hidden = hasAny;
  wrap.hidden = !hasVisible;
  if (els.historySummary) {
    els.historySummary.textContent = hasAny
      ? `${matches.length} OF ${buckets.length} · NEWEST FIRST`
      : 'NEWEST FIRST';
  }
  if (els.historySearchMeta) {
    if (term && hasAny) {
      els.historySearchMeta.hidden = false;
      els.historySearchMeta.textContent = hasVisible ? `${matches.length} match${matches.length === 1 ? '' : 'es'}` : 'No matches';
    } else {
      els.historySearchMeta.hidden = true;
      els.historySearchMeta.textContent = '';
    }
  }

  matches.forEach((bucket) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'conv-item';
    item.setAttribute('aria-label', `Open ${bucket.title}`);

    const left = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'conv-title';
    title.textContent = bucket.title;
    const prompt = document.createElement('div');
    prompt.className = 'conv-prompt';
    prompt.textContent = bucket.latestPrompt || [...bucket.queries].join(' · ') || '—';
    left.appendChild(title);
    left.appendChild(prompt);

    const runs = document.createElement('div');
    runs.className = 'conv-runs';
    const runsBig = document.createElement('span');
    runsBig.className = 'big';
    runsBig.textContent = String(bucket.runs.length);
    const runsSmall = document.createElement('span');
    runsSmall.className = 'small';
    runsSmall.textContent = bucket.runs.length === 1 ? 'SAVED RUN' : 'SAVED RUNS';
    runs.appendChild(runsBig);
    runs.appendChild(runsSmall);

    const overlap = document.createElement('div');
    overlap.className = 'conv-overlap';
    const pct = document.createElement('span');
    pct.className = 'pct';
    pct.innerHTML = `${bucket.latestOverlap}<span class="u">%</span>`;
    overlap.appendChild(pct);
    if (bucket.driftDelta != null) {
      const drift = document.createElement('span');
      const cls = bucket.driftDelta > 0 ? 'up' : bucket.driftDelta < 0 ? 'down' : 'flat';
      drift.className = `drift ${cls}`;
      drift.textContent = bucket.driftDelta > 0 ? `+${bucket.driftDelta}` : String(bucket.driftDelta);
      overlap.appendChild(drift);
    }

    const arrow = document.createElement('div');
    arrow.className = 'arrow';
    arrow.textContent = '→';

    item.appendChild(left);
    item.appendChild(runs);
    item.appendChild(overlap);
    item.appendChild(arrow);

    item.addEventListener('click', () => {
      selectedConversationKey = bucket.key;
      renderHistory();
    });

    wrap.appendChild(item);
  });
}

function renderHistoryDetail(bucket) {
  if (!bucket) { selectedConversationKey = null; return; }
  const eyebrow = document.getElementById('convDetailEyebrow');
  const titleEl = document.getElementById('convDetailTitle');
  const engineChip = document.getElementById('convDetailEngineChip');
  const modelChip = document.getElementById('convDetailModelChip');
  const spanChip = document.getElementById('convDetailSpanChip');
  const runsEl = document.getElementById('convDetailRuns');
  const queriesEl = document.getElementById('convDetailQueries');
  const enginesEl = document.getElementById('convDetailEngines');
  const latestEl = document.getElementById('convDetailLatestOverlap');
  const timeline = document.getElementById('convDetailTimeline');

  if (eyebrow) eyebrow.textContent = 'CONVERSATION · ' + (bucket.runs.length === 1 ? '1 RUN' : `${bucket.runs.length} RUNS`);
  if (titleEl) titleEl.textContent = bucket.title;
  if (engineChip) engineChip.textContent = bucket.latestEngine || 'Unknown engine';
  if (modelChip) modelChip.textContent = bucket.latestModel || 'Unknown model';
  if (spanChip) {
    const first = bucket.earliestSavedAt ? new Date(bucket.earliestSavedAt) : null;
    const last = bucket.latestSavedAt ? new Date(bucket.latestSavedAt) : null;
    spanChip.textContent = first && last
      ? `${first.toLocaleDateString()} → ${last.toLocaleDateString()}`
      : '—';
  }
  if (runsEl) runsEl.textContent = String(bucket.runs.length);
  if (queriesEl) queriesEl.textContent = String(bucket.queries.size);
  if (enginesEl) enginesEl.textContent = String(bucket.engines.size);
  if (latestEl) latestEl.textContent = `${bucket.latestOverlap}%`;

  if (!timeline) return;
  timeline.innerHTML = '';
  bucket.runs.forEach((run, idx) => {
    const card = document.createElement('div');
    card.className = 'tl-item' + (idx === 0 ? '' : ' past');

    const left = document.createElement('div');
    const date = document.createElement('div');
    date.className = 'date';
    date.textContent = run.savedAt ? new Date(run.savedAt).toLocaleString() : '—';
    const prompt = document.createElement('div');
    prompt.className = 'tl-prompt';
    prompt.textContent = run.query || run.prompt || 'Untitled run';
    const meta = document.createElement('div');
    meta.className = 'tl-meta';
    [
      run.engineLabel || run.engine,
      run.model,
      `${run.googleResultCount || 0} results`,
      `${(run.chatgptDomains || []).length} ChatGPT sites`,
      `${(run.googleDomains || []).length} search sites`,
      run.browser,
    ].filter(Boolean).forEach((text, i) => {
      const s = document.createElement('span');
      if (i === 1 || i === 5) s.className = 'mono';
      s.textContent = text;
      meta.appendChild(s);
    });
    left.appendChild(date);
    left.appendChild(prompt);
    left.appendChild(meta);

    const right = document.createElement('div');
    right.className = 'tl-right';
    const overlap = document.createElement('div');
    overlap.className = 'tl-overlap';
    overlap.innerHTML = `${run.overlapScore}<span class="u">%</span>`;
    right.appendChild(overlap);
    const priorRun = bucket.runs[idx + 1];
    if (priorRun) {
      const delta = Number(run.overlapScore) - Number(priorRun.overlapScore);
      const cls = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
      const drift = document.createElement('span');
      drift.className = `tl-drift ${cls}`;
      drift.textContent = delta > 0 ? `+${delta}` : String(delta);
      right.appendChild(drift);
    }
    // Per-run delete (stage 4.4 — preserved).
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'history-delete-btn';
    deleteBtn.setAttribute('aria-label', `Delete this run from ${bucket.title}`);
    deleteBtn.title = 'Delete this run';
    deleteBtn.textContent = '×';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeHistoryEntry(run.id || run.savedAt);
    });
    right.appendChild(deleteBtn);

    card.appendChild(left);
    card.appendChild(right);
    timeline.appendChild(card);
  });
}

function renderCombined() {
  const data = buildCombinedData();
  // Preserve the rank-compare head and wipe just the rows (after .head).
  const rankWrap = els.combinedWrap;
  if (rankWrap) {
    rankWrap.querySelectorAll('.rank-row').forEach((r) => r.remove());
  }
  if (els.missedOpportunitiesWrap) els.missedOpportunitiesWrap.innerHTML = '';

  const setVennCounts = (chatOnly, overlap, googleOnly) => {
    const co = document.getElementById('vennChatOnly');
    const ov = document.getElementById('vennOverlap');
    const go = document.getElementById('vennGoogleOnly');
    if (co) co.textContent = String(chatOnly);
    if (ov) ov.textContent = String(overlap);
    if (go) go.textContent = String(googleOnly);
  };
  const setCapturedChip = (id, iso, label) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (!iso) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = `${label} · ${formatRelativeCapturedAt(iso)}`;
  };

  if (!data) {
    if (els.combinedOverlapScore) els.combinedOverlapScore.textContent = '0';
    if (els.combinedOverlapMeta) {
      els.combinedOverlapMeta.innerHTML = 'Capture both sides to see how ChatGPT&rsquo;s citations compare with the top <em>Google</em> results.';
    }
    if (els.combinedPrecisionScore) els.combinedPrecisionScore.textContent = '0';
    if (els.combinedRecallScore) els.combinedRecallScore.textContent = '0';
    if (els.combinedJaccardScore) els.combinedJaccardScore.textContent = '0';
    if (els.combinedOverlapCount) els.combinedOverlapCount.textContent = '0';
    if (els.combinedChatgptOnlyCount) els.combinedChatgptOnlyCount.textContent = '0';
    if (els.combinedGoogleOnlyCount) els.combinedGoogleOnlyCount.textContent = '0';
    if (els.aioCrossrefCard) els.aioCrossrefCard.hidden = true;
    if (els.combinedQueryLabel) els.combinedQueryLabel.textContent = 'Capture both a ChatGPT conversation and a Google SERP.';
    if (els.combinedEmpty) els.combinedEmpty.hidden = false;
    if (rankWrap) rankWrap.hidden = true;
    setVennCounts(0, 0, 0);
    setCapturedChip('combinedChatCapturedChip', null);
    setCapturedChip('combinedSerpCapturedChip', null);
    if (els.missedOpportunitiesEmpty) els.missedOpportunitiesEmpty.hidden = false;
    return;
  }

  // Populated state.
  if (els.combinedOverlapScore) els.combinedOverlapScore.textContent = String(data.f1Score);
  if (els.combinedOverlapMeta) els.combinedOverlapMeta.textContent = data.overlapMeta;
  if (els.combinedPrecisionScore) els.combinedPrecisionScore.textContent = String(data.precisionScore);
  if (els.combinedRecallScore) els.combinedRecallScore.textContent = String(data.recallScore);
  if (els.combinedJaccardScore) els.combinedJaccardScore.textContent = String(data.jaccardScore);
  if (els.combinedOverlapCount) els.combinedOverlapCount.textContent = String(data.overlap.length);
  if (els.combinedChatgptOnlyCount) els.combinedChatgptOnlyCount.textContent = String(data.chatOnly.length);
  if (els.combinedGoogleOnlyCount) els.combinedGoogleOnlyCount.textContent = String(data.googleOnly.length);
  if (els.combinedQueryLabel) els.combinedQueryLabel.textContent = data.query || 'None';
  if (els.combinedEmpty) els.combinedEmpty.hidden = true;
  if (rankWrap) rankWrap.hidden = false;
  setVennCounts(data.chatOnly.length, data.overlap.length, data.googleOnly.length);
  setCapturedChip('combinedChatCapturedChip', lastChatgptData?.capturedAt, 'ChatGPT');
  setCapturedChip('combinedSerpCapturedChip', lastGoogleData?.capturedAt, 'SERP');

  // Stage 3.4: AI Overview cross-reference. When the captured SERP had
  // an AI Overview, show each of its citation sources and flag the
  // ones ChatGPT also cited. Uses the same fold as buildCombinedData
  // so the membership check matches the Combined tab's numbers.
  if (els.aioCrossrefCard) {
    const aio = Array.isArray(lastGoogleData?.aioSources) ? lastGoogleData.aioSources : [];
    if (aio.length === 0) {
      els.aioCrossrefCard.hidden = true;
    } else {
      const byReg = currentSettings?.matchByRegisteredDomain !== false;
      const fold = (host) => byReg
        ? self.AIQIShared.registeredDomain(host || '')
        : self.AIQIShared.normalizeDomain(host || '');
      const chatSet = new Set((lastChatgptData?.uniqueDomains || []).map(fold).filter(Boolean));
      let matches = 0;
      els.aioCrossrefWrap.innerHTML = '';
      aio.forEach((src) => {
        const folded = fold(src.domain);
        const shared = chatSet.has(folded);
        if (shared) matches += 1;
        const row = document.createElement('a');
        row.className = 'aio-row' + (shared ? ' aio-row--shared' : '');
        row.href = src.url;
        row.target = '_blank';
        row.rel = 'noopener noreferrer';
        const mark = document.createElement('span');
        mark.className = 'aio-row__mark';
        mark.textContent = shared ? '✓' : '·';
        mark.title = shared ? 'Also cited by ChatGPT' : 'Not cited by ChatGPT';
        const body = document.createElement('div');
        body.className = 'aio-row__body';
        const title = document.createElement('div');
        title.className = 'aio-row__title';
        title.textContent = src.title || src.domain;
        const meta = document.createElement('div');
        meta.className = 'aio-row__meta';
        meta.textContent = folded;
        body.appendChild(title);
        body.appendChild(meta);
        row.appendChild(mark);
        row.appendChild(body);
        els.aioCrossrefWrap.appendChild(row);
      });
      els.aioCrossrefSummary.textContent = `${matches} OF ${aio.length} ALSO CITED BY CHATGPT`;
      els.aioCrossrefCard.hidden = false;
    }
  }

  // Render one .rank-row per unique domain: left cell = ChatGPT,
  // mid cell = match indicator, right cell = Google rank/title. The
  // .match modifier highlights rows where both sides have the domain.
  data.rows.forEach((rowData) => {
    const row = document.createElement('div');
    row.className = 'rank-row' + (rowData.inChatgpt && rowData.inGoogle ? ' match' : '');

    const gpt = document.createElement('div');
    gpt.className = 'cell';
    if (rowData.inChatgpt) {
      const dom = document.createElement('span');
      dom.className = 'domain' + (rowData.inChatgpt && rowData.inGoogle ? ' match' : '');
      dom.textContent = rowData.domain;
      const meta = document.createElement('span');
      meta.className = 'rank-num';
      meta.textContent = `${rowData.chatgptCitations}×`;
      gpt.appendChild(dom);
      gpt.appendChild(meta);
    } else {
      gpt.textContent = '—';
    }

    const mid = document.createElement('div');
    mid.className = 'cell mid';
    mid.textContent = rowData.inChatgpt && rowData.inGoogle
      ? '✓'
      : rowData.inChatgpt ? '← GPT only' : 'Goog only →';

    const goog = document.createElement('div');
    goog.className = 'cell goog';
    if (rowData.inGoogle) {
      const rank = document.createElement('span');
      rank.className = 'rank-num';
      rank.textContent = `#${rowData.googleRank}`;
      const dom = document.createElement('span');
      dom.className = 'domain' + (rowData.inChatgpt && rowData.inGoogle ? ' match' : '');
      dom.textContent = rowData.domain;
      goog.appendChild(rank);
      goog.appendChild(dom);
    } else {
      goog.textContent = '—';
    }

    row.appendChild(gpt);
    row.appendChild(mid);
    row.appendChild(goog);
    rankWrap.appendChild(row);
  });

  // "Missed by ChatGPT" — emit .src-row lines (design-system popup
  // source row pattern) since each line is 1-3 short pieces of info.
  const missed = data.missedOpportunities || [];
  if (els.missedOpportunitiesEmpty) els.missedOpportunitiesEmpty.hidden = missed.length > 0;
  if (els.missedOpportunitiesSummary) {
    els.missedOpportunitiesSummary.textContent = missed.length
      ? `${missed.length} GOOGLE-RANKED DOMAINS NOT CITED`
      : 'GOOGLE-RANKED DOMAINS NOT CITED BY CHATGPT';
  }

  missed.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'src-row';
    const fav = document.createElement('span');
    fav.className = 'fav';
    fav.setAttribute('aria-hidden', 'true');
    const domainWrap = document.createElement('div');
    const domain = document.createElement('div');
    domain.className = 'domain';
    domain.textContent = item.domain;
    const title = document.createElement('div');
    title.className = 't-meta';
    title.textContent = item.googleTitle || 'Untitled result';
    domainWrap.appendChild(domain);
    domainWrap.appendChild(title);
    const rank = document.createElement('span');
    rank.className = 'mentions';
    rank.textContent = item.googleRank ? `#${item.googleRank}` : '—';
    row.appendChild(fav);
    row.appendChild(domainWrap);
    row.appendChild(rank);
    els.missedOpportunitiesWrap.appendChild(row);
  });
  persistHistorySnapshot();
  renderHistory();
}

async function copyText(text, successLabel) {
  try {
    await navigator.clipboard.writeText(text);
    setStatus(successLabel, 'ok');
    showToast('Copied');
  } catch (error) {
    setStatus(`Copy failed: ${error.message}`, 'error');
  }
}

function exportChatgptCsv() {
  if (!lastChatgptData) return setStatus('Nothing to export yet.', 'error');
  const d = lastChatgptData;
  const convId = d.conversationId || '';
  const pageUrl = d.pageUrl || '';
  const browser = d.browser || getBrowserLabel();
  const capturedAt = d.capturedAt || '';
  const model = d.model || '';
  const prompt = d.latestUserPrompt || '';
  const originLabel = d.searchOrigin?.label || '';
  const originConfidence = d.searchOrigin?.confidence || '';

  const rows = [[
    'record_type','conversation_id','page_url','browser','captured_at','model','prompt',
    'search_origin','search_confidence','index','query','domains','domain','count',
    'title','url','status','mentions','cited_mentions','extra'
  ]];
  const base = [convId, pageUrl, browser, capturedAt, model, prompt, originLabel, originConfidence];
  const empty = (n) => Array(n).fill('');

  rows.push([
    'summary', ...base, '', '', '', '', '', '', '', '', '', '',
    `cited_sources=${d.citedSources || 0}; utm_count=${d.utmCount || 0}; total_urls=${d.totalUrls || 0}; fanouts=${(d.queries || []).length}; unique_sites=${(d.uniqueDomains || []).length}`
  ]);

  (d.queries || []).forEach((q, i) => {
    rows.push(['fanout', ...base, String(i + 1), q.q || '', (q.domains || []).join('; '), ...empty(9)]);
  });

  (d.domainCounts || []).forEach((item) => {
    rows.push(['cited_domain', ...base, '', '', '', item.domain || '', String(item.count ?? ''), ...empty(6)]);
  });

  (d.sources || []).forEach((s) => {
    rows.push([
      'source', ...base, '', '', '',
      s.domain || '', '',
      s.title || '', s.url || '', s.statusLabel || '',
      String(s.count ?? ''), String(s.citedCount ?? ''), ''
    ]);
  });

  (d.conversationTurns || []).forEach((t) => {
    rows.push([
      'turn_summary', ...base, String(t.index || ''), t.prompt || '', '', '', '', '', '', '', '', '',
      `queries=${t.queryCount || 0}; cited_sources=${t.citedSourceCount || 0}; unique_sites=${t.uniqueSiteCount || 0}`
    ]);
    (t.queries || []).forEach((q, i) => {
      rows.push(['turn_query', ...base, `${t.index || ''}.${i + 1}`, q.q || '', (q.domains || []).join('; '), ...empty(9)]);
    });
    (t.sources || []).forEach((s) => {
      rows.push([
        'turn_source', ...base, String(t.index || ''), '', '',
        s.domain || '', '',
        s.title || '', s.url || '', s.statusLabel || '',
        String(s.count ?? ''), String(s.citedCount ?? ''), ''
      ]);
    });
  });

  downloadFile(`chatgpt-inspector-${convId || 'conversation'}.csv`, rows.map((r) => r.map(csvEscape).join(',')).join('\n'), 'text/csv;charset=utf-8');
  showToast('ChatGPT CSV exported');
}

function exportGoogleCsv() {
  if (!lastGoogleData) return setStatus('Nothing to export yet.', 'error');
  const chatMap = Object.fromEntries((lastChatgptData?.domainCounts || []).map((item) => [item.domain, item.count]));
  const rows = [['query', 'page_url', 'browser', 'engine', 'capture_mode', 'serp_features', 'rank', 'domain', 'title', 'url', 'snippet', 'cited_by_chatgpt', 'chatgpt_citation_count', 'captured_at']];
  lastGoogleData.results.forEach((item) => rows.push([
    lastGoogleData.query,
    lastGoogleData.pageUrl || '',
    lastGoogleData.browser || getBrowserLabel(),
    lastGoogleData.engineLabel || lastGoogleData.engine || '',
    lastGoogleData.captureMode,
    (lastGoogleData.serpFeatures || []).join('; '),
    item.rank,
    item.domain,
    item.title,
    item.url,
    item.snippet,
    chatMap[item.domain] ? 'yes' : 'no',
    chatMap[item.domain] || 0,
    lastGoogleData.capturedAt || ''
  ]));
  downloadFile(`serp-snapshot-${slugify(lastGoogleData.query, 'search')}.csv`, rows.map((r) => r.map(csvEscape).join(',')).join('\n'), 'text/csv;charset=utf-8');
  showToast('SERP snapshot exported');
}

function exportCombinedCsv() {
  const data = buildCombinedData();
  if (!data) return setStatus('Capture both ChatGPT and Google data first.', 'error');
  const rows = [['query', 'engine', 'serp_features', 'domain', 'in_chatgpt', 'chatgpt_citations', 'in_google', 'google_rank', 'google_title', 'google_url', 'google_snippet', 'overlap_label', 'overlap_score', 'captured_at']];
  data.rows.forEach((item) => rows.push([
    data.query,
    data.engineLabel,
    data.serpFeatures.join('; '),
    item.domain,
    item.inChatgpt ? 'yes' : 'no',
    item.chatgptCitations,
    item.inGoogle ? 'yes' : 'no',
    item.googleRank,
    item.googleTitle,
    item.googleUrl,
    item.googleSnippet,
    item.overlapLabel,
    `${data.overlapScore}%`,
    lastGoogleData?.capturedAt || ''
  ]));
  downloadFile(`combined-local-comparison-${slugify(data.query, 'comparison')}.csv`, rows.map((r) => r.map(csvEscape).join(',')).join('\n'), 'text/csv;charset=utf-8');
  showToast('Combined dataset exported');
}

/**
 * SEO-tool-compatible CSV export (stage 3.6).
 *
 * Produces a single table in the column shape that Ahrefs Rank Tracker
 * and SEMrush Position Tracking both accept as import. Every row
 * represents one SERP result with ChatGPT-overlap columns appended so
 * you can filter "rank better than X and ChatGPT also cites" or
 * "appears in ChatGPT but not in top-10 SERP" in Excel/Sheets.
 *
 * Column choices (common subset of Ahrefs + SEMrush):
 *   Keyword            — the query
 *   URL                — result URL
 *   Domain             — registered domain (honours the reg-domain toggle)
 *   Position           — SERP rank
 *   Previous Position  — blank (we don't track SERP drift per-URL)
 *   Change             — blank
 *   Search Volume      — blank (we don't have keyword data)
 *   Traffic %          — blank
 *   Title              — result title
 *   Snippet            — result snippet
 *   AI_Cited           — yes/no
 *   AI_Citation_Count  — how many times ChatGPT cited this domain
 *   AI_Rank            — rank by citation count (1 = most cited)
 *   Overlap_Flag       — "shared" / "serp_only" / "ai_only"
 *   Engine             — google / bing / duckduckgo
 *   Captured_At        — ISO timestamp
 */
function exportSeoToolCsv() {
  if (!lastGoogleData?.results?.length) return setStatus('Capture a search results page first.', 'error');

  const byReg = currentSettings?.matchByRegisteredDomain !== false;
  const fold = (host) => byReg
    ? self.AIQIShared.registeredDomain(host || '')
    : self.AIQIShared.normalizeDomain(host || '');

  // Aggregate ChatGPT citation counts by folded domain.
  const chatByFolded = new Map();
  (lastChatgptData?.domainCounts || []).forEach((item) => {
    const key = fold(item.domain || '');
    if (!key) return;
    chatByFolded.set(key, (chatByFolded.get(key) || 0) + (item.count || 0));
  });
  // Derive AI-rank ordering: 1 = most cited, ties by alpha.
  const aiRanked = [...chatByFolded.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const aiRankByDomain = new Map(aiRanked.map(([dom], i) => [dom, i + 1]));

  // Track which folded domains appear in the SERP so we can emit AI-only
  // rows afterwards.
  const serpFoldedDomains = new Set();
  const rows = [[
    'Keyword', 'URL', 'Domain', 'Position', 'Previous Position', 'Change',
    'Search Volume', 'Traffic %', 'Title', 'Snippet',
    'AI_Cited', 'AI_Citation_Count', 'AI_Rank', 'Overlap_Flag',
    'Engine', 'Captured_At',
  ]];

  const keyword = lastGoogleData.query || lastChatgptData?.latestUserPrompt || '';
  const engine = lastGoogleData.engineLabel || lastGoogleData.engine || '';
  const capturedAt = lastGoogleData.capturedAt || '';

  (lastGoogleData.results || []).forEach((r) => {
    const folded = fold(r.domain);
    serpFoldedDomains.add(folded);
    const aiCount = chatByFolded.get(folded) || 0;
    const aiRank = aiRankByDomain.get(folded) || '';
    rows.push([
      keyword,
      r.url || '',
      folded,
      r.rank || '',
      '', // Previous Position — not tracked
      '', // Change
      '', // Search Volume
      '', // Traffic %
      r.title || '',
      r.snippet || '',
      aiCount > 0 ? 'yes' : 'no',
      aiCount,
      aiRank,
      aiCount > 0 ? 'shared' : 'serp_only',
      engine,
      capturedAt,
    ]);
  });

  // Emit AI-only rows (ChatGPT cited these but SERP didn't rank them in
  // the top 10). These have blank Position columns; SEO tools handle
  // empty Position as "not ranking".
  [...chatByFolded.entries()]
    .filter(([dom]) => !serpFoldedDomains.has(dom))
    .sort((a, b) => b[1] - a[1])
    .forEach(([dom, count]) => {
      rows.push([
        keyword, '', dom, '', '', '', '', '', '', '',
        'yes', count, aiRankByDomain.get(dom) || '', 'ai_only',
        engine, capturedAt,
      ]);
    });

  const filename = `seo-tool-export-${slugify(keyword, 'comparison')}.csv`;
  downloadFile(filename, rows.map((r) => r.map(csvEscape).join(',')).join('\n'), 'text/csv;charset=utf-8');
  showToast('SEO tool CSV exported');
}

function exportHistoryCsv() {
  if (!comparisonHistory.length) return setStatus('No history to export yet.', 'error');
  const rows = [['saved_at', 'query', 'prompt', 'engine', 'model', 'browser', 'overlap_score', 'overlap_sites', 'chatgpt_only_sites', 'google_only_sites', 'fanouts', 'cited_sources', 'google_results', 'serp_features', 'chatgpt_page_url', 'search_page_url', 'chatgpt_captured_at', 'search_captured_at', 'drift_added', 'drift_removed', 'drift_added_domains', 'drift_removed_domains']];
  comparisonHistory.forEach((item) => rows.push([
    item.savedAt || '',
    item.query || '',
    item.prompt || '',
    item.engineLabel || item.engine || '',
    item.model || '',
    item.browser || '',
    `${item.overlapScore ?? 0}%`,
    item.overlapCount ?? 0,
    item.chatgptOnlyCount ?? 0,
    item.googleOnlyCount ?? 0,
    item.fanoutCount ?? 0,
    item.citedSources ?? 0,
    item.googleResultCount ?? 0,
    (item.serpFeatures || []).join('; '),
    item.pageContext?.chatgptPageUrl || '',
    item.pageContext?.searchPageUrl || '',
    item.pageContext?.chatgptCapturedAt || '',
    item.pageContext?.searchCapturedAt || '',
    item.drift?.added ?? 0,
    item.drift?.removed ?? 0,
    (item.drift?.addedDomains || []).join('; '),
    (item.drift?.removedDomains || []).join('; ')
  ]));
  downloadFile(`comparison-history-${new Date().toISOString().slice(0, 10)}.csv`, rows.map((r) => r.map(csvEscape).join(',')).join('\n'), 'text/csv;charset=utf-8');
  showToast('History CSV exported');
}

// ============================================================================
// 8. PAGE INJECTION — functions serialised into chrome.scripting.execute-
//    Script({world:'MAIN'}) and run *in the target tab's page context*.
//    They must not reference any outer closures beyond built-ins; they
//    can only return structured-clonable values.
// ============================================================================
async function fetchConversationPayloadInPage() {
  const localSanitizeString = (value, maxLen = 500) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLen) : '';
  try {
    const pathname = window.location.pathname;
    const match = pathname.match(/\/c\/([^/]+)/);
    if (!match) return { error: 'This page does not appear to be a ChatGPT conversation URL.' };
    const conversationId = localSanitizeString(match[1], 200);
    const sessionResp = await fetch('/api/auth/session', { credentials: 'include' });
    if (!sessionResp.ok) return { error: `Session request failed: ${sessionResp.status}` };
    const sessionJson = await sessionResp.json();
    const accessToken = typeof sessionJson?.accessToken === 'string' ? sessionJson.accessToken : '';
    if (!accessToken) return { error: 'No access token found in session response.' };
    const convResp = await fetch(`/backend-api/conversation/${conversationId}`, { credentials: 'include', headers: { Authorization: `Bearer ${accessToken}` } });
    if (!convResp.ok) return { error: `Conversation request failed: ${convResp.status}` };
    const payload = await convResp.json();
    return { conversationId, payload, pageUrl: window.location.href };
  } catch (error) {
    return { error: `Page fetch failed: ${error?.message || 'Unknown error'}` };
  }
}

// ============================================================================
// 9. INSPECTION — glue code: identify the active tab, inject the
//    page-context function, parse the result, persist to storage, and
//    kick off renderers. Plus helpers for the "Open Google for prompt"
//    workflow and opening the full-page dashboard.
// ============================================================================
async function inspectCurrentTab() {
  const tab = await getInspectionTargetTab();
  if (!tab?.id || !tab.url) return setStatus('No ChatGPT or search tab found to inspect.', 'error');

  try {
    // Stage 3.1: recognise Gemini tabs and surface an honest
    // "not yet implemented" message instead of silently failing. A
    // proper parser needs access to Gemini's internal conversation
    // payload, which we don't yet have a reverse-engineered schema
    // for. Until then, the presence of this branch at least tells the
    // user the extension is aware of their tab.
    if (isGeminiUrl(tab.url)) {
      return setStatus(
        'Gemini capture is planned but not yet implemented in this version. ChatGPT and search-page capture continue to work as usual.',
        'warn'
      );
    }

    if (/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(tab.url)) {
      const injectionResults = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: fetchConversationPayloadInPage });
      const result = injectionResults?.[0]?.result;
      if (!result) return setStatus('No data returned from the page.', 'error');
      if (result.error) return setStatus(result.error, 'error');
      lastChatgptData = { ...parseChatgptPayload(result.payload), conversationId: result.conversationId, pageUrl: result.pageUrl || tab.url || '', browser: getBrowserLabel(), capturedAt: new Date().toISOString() };
      const archivedChatgpt = await self.AIQIShared.storage.appendChatgptCapture(lastChatgptData, { cap: Number(currentSettings?.archiveRetention) || undefined });
      if (archivedChatgpt?.id) lastChatgptData.id = archivedChatgpt.id;
      await self.AIQIShared.storage.savePendingChatgptSnapshot(lastChatgptData);
      await saveLocalState();
      renderChatgpt(lastChatgptData);
      renderCombined();
      renderHistory();
      populatePopup();
      setStatus(`Loaded ChatGPT conversation.${lastChatgptData.hiddenLikely ? ' Some live tool calls may still be missing from this payload.' : ''}`, 'ok');
      if (!isFullPage) switchTab('chatgpt');
      return;
    }

    if (/^https:\/\/((([a-z0-9-]+\.)*google\.)|(([a-z0-9-]+\.)*bing\.com)|duckduckgo\.com)/i.test(tab.url)) {
      const K = self.AIQIShared.STORAGE_KEYS;
      const snap = await self.AIQIShared.storage.get([K.PENDING_GOOGLE_QUERY, K.PENDING_CHATGPT_SNAPSHOT]);
      const pendingGoogleQuery = snap[K.PENDING_GOOGLE_QUERY] || '';
      const pendingChatgptSnapshot = snap[K.PENDING_CHATGPT_SNAPSHOT] || null;
      if (!lastChatgptData && pendingChatgptSnapshot) lastChatgptData = pendingChatgptSnapshot;
      renderChatgpt(lastChatgptData);
      const injectionResults = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: fetchSearchResultsInPage });
      const result = injectionResults?.[0]?.result;
      if (!result) return setStatus('No data returned from the search page.', 'error');
      if (result.error) return setStatus(result.error, 'error');
      lastGoogleData = { ...parseGooglePayload(result, pendingGoogleQuery), pageUrl: result.pageUrl || tab.url || '', browser: getBrowserLabel() };
      const archivedGoogle = await self.AIQIShared.storage.appendGoogleCapture(lastGoogleData, { cap: Number(currentSettings?.archiveRetention) || undefined });
      if (archivedGoogle?.id) lastGoogleData.id = archivedGoogle.id;
      await self.AIQIShared.storage.clearPendingGoogleQuery();
      await saveLocalState();
      renderChatgpt(lastChatgptData);
      renderGoogle(lastGoogleData);
      renderCombined();
      renderHistory();
      populatePopup();
      setStatus(`Captured ${lastGoogleData.resultCount} ${lastGoogleData.engineLabel || 'search'} results locally.`, 'ok');
      if (!isFullPage) switchTab('google');
      return;
    }

    setStatus('Open a ChatGPT conversation or a Google, Bing, or DuckDuckGo results page first.', 'error');
  } catch (error) {
    setStatus(`Extension error: ${error?.message || 'Unknown error'}`, 'error');
  }
}

async function openGoogleForQuery(query) {
  const cleanQuery = sanitizeString(query, 300);
  if (!cleanQuery) return setStatus('No query available to open in Google.', 'error');
  activeView = 'google';
  const currentTab = await getInspectionTargetTab();
  const K = self.AIQIShared.STORAGE_KEYS;
  await self.AIQIShared.storage.saveBatch({
    [K.PENDING_GOOGLE_QUERY]: cleanQuery,
    [K.PENDING_CHATGPT_SNAPSHOT]: lastChatgptData,
    [K.ACTIVE_VIEW]: 'google',
  });
  const googleTab = await chrome.tabs.create({
    url: `https://www.google.com/search?q=${encodeURIComponent(cleanQuery)}`,
    active: false
  });
  // Orchestration marker: tells the service worker to auto-capture
  // this specific tab when it finishes loading, so the dashboard
  // populates without a second user action. Stored alongside the
  // existing PENDING_GOOGLE_QUERY, which stays as-is for back-compat.
  if (googleTab?.id) {
    await self.AIQIShared.storage.savePendingGoogleOrchestration({
      tabId: googleTab.id,
      query: cleanQuery,
      createdAt: Date.now(),
    });
  }
  await openFullPageDashboard(true, googleTab?.id || currentTab?.id || 0, 'google');
  setStatus('Opened Google and dashboard. Capturing once the page finishes loading…', 'ok');
  showToast('Opened Google and dashboard');
}

// ============================================================================
// 10. EVENT BINDINGS — wire every button click, keyboard interaction,
//     and storage change listener. Called once from init(); never again.
// ============================================================================
function bindEvents() {
  els.tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    btn.addEventListener('keydown', handleTabKeydown);
  });
  if (els.refreshBtn) els.refreshBtn.addEventListener('click', inspectCurrentTab);
  if (els.chatgptPickerSelect) {
    els.chatgptPickerSelect.addEventListener('change', (e) => handleChatgptPickerChange(e.target.value));
  }
  if (els.googlePickerSelect) {
    els.googlePickerSelect.addEventListener('change', (e) => handleGooglePickerChange(e.target.value));
  }
  if (els.historySearchInput) {
    els.historySearchInput.addEventListener('input', (e) => {
      historySearchTerm = String(e.target.value || '');
      renderHistory();
    });
  }
  const backLink = document.getElementById('historyBackLink');
  if (backLink) {
    backLink.addEventListener('click', (e) => {
      e.preventDefault();
      selectedConversationKey = null;
      renderHistory();
    });
  }

  // Stage 5.7: popup-shell action wiring. These buttons mirror the
  // dashboard actions but live on the compact popup-only layout.
  const popupRefresh = document.getElementById('popupRefreshBtn');
  if (popupRefresh) popupRefresh.addEventListener('click', inspectCurrentTab);
  const popupExport = document.getElementById('popupExportBtn');
  if (popupExport) popupExport.addEventListener('click', exportFullDataset);
  const popupFullPage = document.getElementById('popupFullPageBtn');
  if (popupFullPage) popupFullPage.addEventListener('click', async () => {
    const currentTab = await getInspectionTargetTab();
    await openFullPageDashboard(true, currentTab?.id || 0, activeView);
  });
  const popupOpenDash = document.getElementById('popupOpenDashBtn');
  if (popupOpenDash) popupOpenDash.addEventListener('click', async () => {
    const currentTab = await getInspectionTargetTab();
    await openFullPageDashboard(true, currentTab?.id || 0, activeView);
  });
  const popupTheme = document.getElementById('popupThemeBtn');
  if (popupTheme) popupTheme.addEventListener('click', toggleThemeMode);
  const popupCapture = document.getElementById('popupCaptureGoogleBtn');
  if (popupCapture) popupCapture.addEventListener('click', async () => {
    const query = lastChatgptData?.latestUserPrompt || lastChatgptData?.queries?.[0]?.q;
    await openGoogleForQuery(query);
  });
  // Stage 5.9.1: quick Google-capture button inside the hero-stat.
  const popupHeroCapture = document.getElementById('popupHeroCaptureBtn');
  if (popupHeroCapture) popupHeroCapture.addEventListener('click', async () => {
    const query = lastChatgptData?.latestUserPrompt || lastChatgptData?.queries?.[0]?.q;
    await openGoogleForQuery(query);
  });
  // Popup section collapse (design-system pop-section pattern).
  document.querySelectorAll('.pop-section[data-pop-collapse] .pop-section-head').forEach((head) => {
    head.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      head.parentElement.classList.toggle('collapsed');
    });
  });

  // Stage 5.8 settings modal open/close.
  const settingsModal = document.getElementById('settingsModal');
  const openSettingsModal = () => {
    if (!settingsModal) return;
    settingsModal.hidden = false;
    document.body.classList.add('settings-open');
    // Give the dialog focus for keyboard dismissal.
    const closeBtn = document.getElementById('settingsModalClose');
    if (closeBtn) closeBtn.focus();
  };
  const closeSettingsModal = () => {
    if (!settingsModal) return;
    settingsModal.hidden = true;
    document.body.classList.remove('settings-open');
  };
  const settingsOpenBtns = [document.getElementById('settingsBtn'), document.getElementById('popupSettingsBtn')].filter(Boolean);
  settingsOpenBtns.forEach((btn) => btn.addEventListener('click', openSettingsModal));
  if (settingsModal) {
    settingsModal.addEventListener('click', (e) => {
      if (e.target.closest('[data-settings-dismiss]')) closeSettingsModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !settingsModal.hidden) closeSettingsModal();
    });
  }
  if (els.clearChatgptArchiveBtn) {
    els.clearChatgptArchiveBtn.addEventListener('click', handleClearChatgptArchive);
  }
  if (els.clearGoogleArchiveBtn) {
    els.clearGoogleArchiveBtn.addEventListener('click', handleClearGoogleArchive);
  }
  if (els.openFullPageBtn) els.openFullPageBtn.addEventListener('click', async () => {
    const currentTab = await getInspectionTargetTab();
    await openFullPageDashboard(true, currentTab?.id || 0, activeView);
  });
  if (els.themeToggleBtn) els.themeToggleBtn.addEventListener('click', toggleThemeMode);
  if (els.exportAllBtn) els.exportAllBtn.addEventListener('click', exportFullDataset);
  els.openGoogleBtn.addEventListener('click', async () => {
    const query = lastChatgptData?.latestUserPrompt || lastChatgptData?.queries?.[0]?.q;
    await openGoogleForQuery(query);
  });
  if (els.openGoogleBtnBottom) {
    els.openGoogleBtnBottom.addEventListener('click', async () => {
      const query = lastChatgptData?.latestUserPrompt || lastChatgptData?.queries?.[0]?.q;
      await openGoogleForQuery(query);
    });
  }
  if (els.jumpToCompareLink) {
    els.jumpToCompareLink.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('combined');
    });
  }
  // Stage 5.3 design-system section collapse. Click on .section-head
  // toggles .collapsed on the parent .section — except when the click
  // originates inside a <button> (onclick="event.stopPropagation()" on
  // those is not strictly required thanks to this .closest check, but
  // we keep it as a safety net per the design-system doc).
  document.querySelectorAll('.section[data-collapse] .section-head').forEach((head) => {
    head.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      head.parentElement.classList.toggle('collapsed');
    });
  });
  els.openGoogleManualBtn.addEventListener('click', async () => {
    const manual = await openPromptModal({
      title: 'Open a manual search',
      message: 'The query will open in a new tab on Google, Bing, or DuckDuckGo depending on your current default engine for the extension.',
      label: 'Search query',
      initialValue: lastChatgptData?.latestUserPrompt || lastChatgptData?.queries?.[0]?.q || '',
      okLabel: 'Open search',
    });
    if (!manual) return;
    await openGoogleForQuery(manual);
  });
  els.copyQueriesBtn.addEventListener('click', async () => {
    if (!lastChatgptData?.queries?.length) return setStatus('There are no fan-out queries to copy.', 'error');
    await copyText(lastChatgptData.queries.map((q, i) => `${i + 1}. ${q.q}${q.domains.length ? ` [${q.domains.join(', ')}]` : ''}`).join('\n'), 'Fan-out queries copied to system clipboard.');
  });
  if (els.copySitesBtn) {
    els.copySitesBtn.addEventListener('click', async () => {
      if (!lastChatgptData?.domainCounts?.length) return setStatus('There are no cited sites to copy.', 'error');
      await copyText(lastChatgptData.domainCounts.map(({ domain, count }) => `${domain} (${count})`).join('\n'), 'Sites copied to system clipboard.');
    });
  }
  els.copySourcesBtn.addEventListener('click', async () => {
    if (!lastChatgptData?.sources?.length) return setStatus('There are no captured source links to copy.', 'error');
    await copyText(lastChatgptData.sources.map((s) => `${s.domain || 'source'} | ${s.title || s.url} | ${s.url} | ${s.count}`).join('\n'), 'Source links copied to system clipboard.');
  });
  els.copyGoogleBtn.addEventListener('click', async () => {
    if (!lastGoogleData?.results?.length) return setStatus('There are no Google results to copy.', 'error');
    await copyText(lastGoogleData.results.map((r) => `#${r.rank} ${r.domain} — ${r.title}`).join('\n'), 'Google results copied to system clipboard.');
  });
  els.copyCombinedBtn.addEventListener('click', async () => {
    const data = buildCombinedData();
    if (!data) return setStatus('Capture both ChatGPT and Google data first.', 'error');
    await copyText(data.rows.map((r) => `${r.domain} | ChatGPT: ${r.inChatgpt ? r.chatgptCitations : 0} | Google: ${r.inGoogle ? '#' + r.googleRank : 'no'} | ${r.overlapLabel}`).join('\n'), 'Combined rows copied to system clipboard.');
  });
  els.exportChatgptCsvBtn.addEventListener('click', exportChatgptCsv);
  els.exportGoogleCsvBtn.addEventListener('click', exportGoogleCsv);
  els.exportCombinedCsvBtn.addEventListener('click', exportCombinedCsv);
  if (els.exportSeoToolCsvBtn) els.exportSeoToolCsvBtn.addEventListener('click', exportSeoToolCsv);
  els.exportHistoryCsvBtn.addEventListener('click', exportHistoryCsv);
  els.clearHistoryBtn.addEventListener('click', async () => {
    comparisonHistory = [];
    lastSavedFingerprint = '';
    await saveLocalState();
    renderHistory();
    showToast('History cleared');
  });
}

// ============================================================================
// 11. SETTINGS — hydrate preference toggles (auto-capture, reg-domain
//     matching) from chrome.storage.local and keep them in sync with
//     changes made from another popup instance.
// ============================================================================
/**
 * Start or stop the auto-refresh timer based on currentSettings
 * .autoRefreshSeconds. Called on init, whenever the setting flips, and
 * when the popup is about to unload (to avoid timer leaks in the
 * full-page context where the page can live for hours).
 */
function applyAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
  const seconds = Number(currentSettings?.autoRefreshSeconds || 0);
  if (!seconds || seconds < 1) return;
  // 1s minimum guard; UI offers 15s as the lowest choice so this is
  // belt-and-suspenders against a hand-edited settings record.
  const ms = Math.max(1000, seconds * 1000);
  autoRefreshTimer = setInterval(() => {
    // inspectCurrentTab handles its own error reporting; we don't
    // surface failures via toast here because the user didn't click
    // anything — they'd just see intermittent toasts.
    inspectCurrentTab().catch(() => {});
  }, ms);
}

async function hydrateSettingsUI() {
  currentSettings = await self.AIQIShared.getSettings();

  const autoToggle = document.getElementById('autoCaptureToggle');
  if (autoToggle) {
    autoToggle.checked = !!currentSettings.autoCaptureChatgpt;
    autoToggle.addEventListener('change', async () => {
      currentSettings = await self.AIQIShared.setSettings({ autoCaptureChatgpt: autoToggle.checked });
      showToast(autoToggle.checked
        ? 'Auto-capture enabled for ChatGPT conversations.'
        : 'Auto-capture disabled. Click Refresh to capture manually.');
    });
  }

  const regDomainToggle = document.getElementById('regDomainToggle');
  if (regDomainToggle) {
    regDomainToggle.checked = currentSettings.matchByRegisteredDomain !== false;
    regDomainToggle.addEventListener('change', async () => {
      currentSettings = await self.AIQIShared.setSettings({ matchByRegisteredDomain: regDomainToggle.checked });
      // The combined tab's numbers change materially when this toggle
      // flips, so re-render immediately.
      renderCombined();
      showToast(regDomainToggle.checked
        ? 'Matching by registered domain (subdomains grouped).'
        : 'Matching by exact hostname (subdomains kept separate).');
    });
  }

  const autoRefreshSelect = document.getElementById('autoRefreshSelect');
  if (autoRefreshSelect) {
    autoRefreshSelect.value = String(currentSettings.autoRefreshSeconds || 0);
    autoRefreshSelect.addEventListener('change', async () => {
      const seconds = Number(autoRefreshSelect.value) || 0;
      currentSettings = await self.AIQIShared.setSettings({ autoRefreshSeconds: seconds });
      applyAutoRefresh();
      showToast(seconds > 0
        ? `Auto-refreshing every ${seconds < 60 ? seconds + 's' : (seconds / 60) + 'm'}.`
        : 'Auto-refresh turned off.');
    });
  }

  if (els.historyRetentionSelect) {
    els.historyRetentionSelect.value = String(currentSettings.historyRetention || 100);
    els.historyRetentionSelect.addEventListener('change', () => handleHistoryRetentionChange(els.historyRetentionSelect.value));
  }
  if (els.archiveRetentionSelect) {
    els.archiveRetentionSelect.value = String(currentSettings.archiveRetention || 200);
    els.archiveRetentionSelect.addEventListener('change', () => handleArchiveRetentionChange(els.archiveRetentionSelect.value));
  }

  // React to settings changes made from another popup instance (e.g.
  // the full-page dashboard open in another tab flipping the toggle).
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[self.AIQIShared.SETTINGS_KEY]) return;
    const newValue = changes[self.AIQIShared.SETTINGS_KEY].newValue || {};
    currentSettings = { ...self.AIQIShared.DEFAULT_SETTINGS, ...newValue };
    if (autoToggle) autoToggle.checked = !!currentSettings.autoCaptureChatgpt;
    if (regDomainToggle) regDomainToggle.checked = currentSettings.matchByRegisteredDomain !== false;
    if (autoRefreshSelect) autoRefreshSelect.value = String(currentSettings.autoRefreshSeconds || 0);
    if (els.historyRetentionSelect) els.historyRetentionSelect.value = String(currentSettings.historyRetention || 100);
    if (els.archiveRetentionSelect) els.archiveRetentionSelect.value = String(currentSettings.archiveRetention || 200);
    applyAutoRefresh();
    renderCombined();
  });

  // Kick the timer now that settings are hydrated.
  applyAutoRefresh();
  // Clean up when the popup is torn down. MV3 popups unload aggressively
  // so this matters mainly for the full-page dashboard.
  window.addEventListener('pagehide', () => {
    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer);
      autoRefreshTimer = null;
    }
  });
}

// ============================================================================
// 12. INIT — single entry point for both popup and full-page contexts.
// ============================================================================
async function init() {
  maybeSetFullPageClass();
  bindEvents();
  setupCollapsibleSections();
  await hydrateSettingsUI();
  await loadLocalState();
  // Hydrate picker caches before first render so the dropdowns populate
  // on open, not on the next capture.
  await refreshChatgptArchive();
  await refreshGoogleArchive();
  const params = new URLSearchParams(window.location.search);
  const requestedView = params.get('view');
  if (requestedView && els.tabPanels[requestedView]) activeView = requestedView;
  renderChatgpt(lastChatgptData);
  renderGoogle(lastGoogleData);
  renderCombined();
  renderHistory();
  populatePopup();
  switchTab(activeView);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const K = self.AIQIShared.STORAGE_KEYS;
    let shouldRender = false;
    // Live single-slot updates are suppressed while the user is viewing
    // an archived entry — otherwise a fresh background capture would
    // yank them back to the latest without warning.
    if (changes[K.CHATGPT_DATA] && !userPickedChatgptId) {
      lastChatgptData = changes[K.CHATGPT_DATA].newValue || null;
      shouldRender = true;
    }
    if (changes[K.GOOGLE_DATA] && !userPickedGoogleId) {
      lastGoogleData = changes[K.GOOGLE_DATA].newValue || null;
      shouldRender = true;
    }
    if (changes[K.HISTORY]) { comparisonHistory = Array.isArray(changes[K.HISTORY].newValue) ? changes[K.HISTORY].newValue : []; shouldRender = true; }
    if (changes[K.ACTIVE_VIEW]) { activeView = changes[K.ACTIVE_VIEW].newValue || activeView; }
    // Archive changes: refresh the picker dropdown options.
    if (changes[K.CHATGPT_ARCHIVE]) { refreshChatgptArchive(); }
    if (changes[K.GOOGLE_ARCHIVE]) { refreshGoogleArchive(); }
    if (shouldRender) {
      renderChatgpt(lastChatgptData);
      renderGoogle(lastGoogleData);
      renderCombined();
      renderHistory();
      populatePopup();
      switchTab(activeView);
    }
  });
  await inspectCurrentTab();
}

document.addEventListener('DOMContentLoaded', init);
