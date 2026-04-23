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

  tabButtons: Array.from(document.querySelectorAll('.tab-btn')),
  tabPanels: {
    chatgpt: document.getElementById('panelChatgpt'),
    google: document.getElementById('panelGoogle'),
    combined: document.getElementById('panelCombined'),
    history: document.getElementById('panelHistory')
  },

  // ChatGPT
  modelBadge: document.getElementById('modelBadge'),
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
  promptIntentBadge: document.getElementById('promptIntentBadge'),
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

  // History
  historyRunCount: document.getElementById('historyRunCount'),
  historyQueryCount: document.getElementById('historyQueryCount'),
  historyEngineCount: document.getElementById('historyEngineCount'),
  historyLatestOverlap: document.getElementById('historyLatestOverlap'),
  historySummary: document.getElementById('historySummary'),
  historyEmpty: document.getElementById('historyEmpty'),
  historyWrap: document.getElementById('historyWrap'),
  exportHistoryCsvBtn: document.getElementById('exportHistoryCsvBtn'),
  clearHistoryBtn: document.getElementById('clearHistoryBtn')
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

function maybeSetFullPageClass() {
  if (isFullPage) document.body.classList.add('full-page');
}

function applyTheme(mode = 'dark') {
  themeMode = mode === 'light' ? 'light' : 'dark';
  document.body.classList.toggle('light-mode', themeMode === 'light');
  if (els.themeToggleBtn) els.themeToggleBtn.textContent = themeMode === 'light' ? 'Dark mode' : 'Light mode';
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

function isSearchUrl(url = '') {
  return /^https:\/\/((([a-z0-9-]+\.)*google\.)|(([a-z0-9-]+\.)*bing\.com)|duckduckgo\.com)/i.test(url);
}

function isInspectableUrl(url = '') {
  return isChatgptUrl(url) || isSearchUrl(url);
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

function titleCaseEngine(engine) {
  const map = { google: 'Google', bing: 'Bing', duckduckgo: 'DuckDuckGo' };
  return map[engine] || 'Unknown';
}

function getBrowserLabel() {
  const ua = navigator.userAgent || '';
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari';
  return 'Browser';
}

function normalizeFeatureList(features) {
  if (!Array.isArray(features)) return [];
  return [...new Set(features.map((v) => sanitizeString(v, 120)).filter(Boolean))].slice(0, 20);
}

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
  if (!queries.length) {
    els.queryExpansionWrap.textContent = 'No fan-out queries found in this conversation payload.';
    els.queryExpansionWrap.className = 'expansion-tree empty-state';
    return;
  }

  els.queryExpansionWrap.className = 'expansion-tree';

  // Stage 3.2: multi-turn conversations render as a tree of turns, each
  // turn showing prompt -> fan-out queries -> domain chips. A
  // conversation with only one turn (or where turn metadata is missing)
  // falls back to the previous flat prompt-plus-queries layout.
  const turns = Array.isArray(data?.conversationTurns) ? data.conversationTurns : [];
  const hasRichTurns = turns.length > 1 && turns.some((t) => (t.queries || []).length > 0);

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

  if (hasRichTurns) {
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
  } else {
    // Single-turn fallback (original layout, preserved for small
    // conversations where a tree would just be visual noise).
    const node = document.createElement('div');
    node.className = 'expansion-node';
    const promptLabel = document.createElement('div');
    promptLabel.className = 'expansion-node-label';
    promptLabel.textContent = 'Prompt';
    const promptBox = document.createElement('div');
    promptBox.className = 'expansion-root-title';
    promptBox.textContent = prompt;
    const fanoutLabel = document.createElement('div');
    fanoutLabel.className = 'expansion-node-label';
    fanoutLabel.textContent = 'Fan-out queries';
    node.appendChild(promptLabel);
    node.appendChild(promptBox);
    node.appendChild(fanoutLabel);
    appendQueryList(node, queries);
    tree.appendChild(node);
  }

  els.queryExpansionWrap.appendChild(tree);
}

function renderCitationStrength(data) {
  const domainCounts = data?.domainCounts || [];
  els.citationStrengthWrap.innerHTML = '';
  els.citationStrengthEmpty.classList.toggle('hidden', domainCounts.length > 0);
  els.citationStrengthWrap.classList.toggle('hidden', domainCounts.length === 0);
  els.citationStrengthSummary.classList.toggle('hidden', domainCounts.length === 0);
  if (!domainCounts.length) {
    els.citationStrengthSummary.textContent = '';
    return;
  }
  const maxCount = Math.max(...domainCounts.map((item) => item.count), 1);
  els.citationStrengthSummary.textContent = `${data.citedSources} total citations across ${data.uniqueDomains.length} sites`;
  domainCounts.forEach(({ domain, count }) => {
    const row = document.createElement('div');
    row.className = 'strength-row';

    const top = document.createElement('div');
    top.className = 'strength-top';

    const name = document.createElement('div');
    name.className = 'strength-domain';
    name.textContent = domain;

    const pill = document.createElement('span');
    pill.className = 'site-count';
    pill.textContent = `${count} ${count === 1 ? 'citation' : 'citations'}`;

    const track = document.createElement('div');
    track.className = 'strength-bar-track';
    const fill = document.createElement('div');
    fill.className = 'strength-bar-fill';
    fill.style.width = `${Math.max(8, Math.round((count / maxCount) * 100))}%`;
    track.appendChild(fill);

    top.appendChild(name);
    top.appendChild(pill);
    row.appendChild(top);
    row.appendChild(track);
    els.citationStrengthWrap.appendChild(row);
  });
}

// ============================================================================
// 5. RENDERERS — one per tab panel plus shared sub-renderers. Every
//    render* function reads module-scope state set by section 4 (parsed
//    payload) or section 9 (inspection results).
// ============================================================================
function renderChatgpt(data) {
  els.modelBadge.textContent = data?.model || 'Unknown';
  els.modelBadge.classList.toggle('muted', !data?.model);
  els.fanoutCount.textContent = String(data?.queries?.length || 0);
  els.sourceCount.textContent = String(data?.citedSources || 0);
  els.siteCount.textContent = String(data?.uniqueDomains?.length || 0);
  els.utmCoverage.textContent = `${data?.utmCount || 0} / ${data?.totalUrls || 0}`;
  els.retrievalIntensityValue.textContent = `${data?.queries?.length || 0} / ${data?.citedSources || 0} / ${data?.uniqueDomains?.length || 0}`;
  els.retrievalIntensityMeta.textContent = 'Fan-outs / citations / sites';

  const origin = data?.searchOrigin || { label: 'Unknown', confidence: '', tone: 'muted' };
  els.searchOriginBadge.textContent = origin.label;
  els.searchOriginBadge.className = `origin-badge ${origin.tone || 'muted'}`;
  els.searchOriginConfidence.textContent = origin.confidence ? `${origin.confidence} confidence` : '';
  els.searchOriginConfidence.classList.toggle('hidden', !origin.confidence);

  // Prompt intent classification (stage 3.3). Keyword-based, fast; shows
  // '—' with muted styling when no prompt has been captured yet.
  if (els.promptIntentBadge) {
    const intent = self.AIQIShared.classifyPromptIntent(data?.latestUserPrompt || '');
    if (intent) {
      els.promptIntentBadge.textContent = intent.label;
      els.promptIntentBadge.className = `origin-badge ${intent.tone || 'muted'}`;
      els.promptIntentBadge.title = intent.description;
    } else {
      els.promptIntentBadge.textContent = '—';
      els.promptIntentBadge.className = 'origin-badge muted';
      els.promptIntentBadge.title = 'No prompt captured yet.';
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
  els.sourcesWrap.innerHTML = '';
  els.sourcesEmpty.classList.toggle('hidden', sources.length > 0);
  els.sourcesWrap.classList.toggle('hidden', sources.length === 0);
  els.sourcesSummary.classList.toggle('hidden', sources.length === 0);
  els.sourcesSummary.textContent = sources.length ? `${sources.length} unique source links captured` : '';

  sources.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'result-row';
    const top = document.createElement('div');
    top.className = 'result-top';
    const domain = document.createElement('span');
    domain.className = 'domain-tag';
    domain.textContent = item.domain || 'source';
    const count = document.createElement('span');
    count.className = 'site-count';
    count.textContent = `${item.count} ${item.count === 1 ? 'mention' : 'mentions'}`;
    const status = document.createElement('span');
    status.className = `source-status ${item.status === 'considered' ? 'considered' : 'cited'}`;
    status.textContent = item.statusLabel || (item.status === 'considered' ? 'Considered source' : 'Cited source');
    top.appendChild(domain);
    top.appendChild(status);
    top.appendChild(count);

    const title = document.createElement('div');
    title.className = 'result-title';
    title.textContent = item.title || item.url;

    const url = document.createElement('div');
    url.className = 'result-url';
    url.textContent = item.url;

    row.appendChild(top);
    row.appendChild(title);
    row.appendChild(url);
    els.sourcesWrap.appendChild(row);
  });
}

function parseGooglePayload(raw, fallbackQuery = '') {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Search payload is invalid.');
  const results = Array.isArray(raw.results) ? raw.results : [];
  const cleanedResults = results.map((item) => ({
    rank: Number(item.rank) || 0,
    title: sanitizeString(item.title, 300),
    url: sanitizeString(item.url, 1000),
    domain: normalizeDomain(item.domain || ''),
    snippet: sanitizeString(item.snippet, 500)
  })).filter((item) => item.rank > 0 && item.title && item.url && item.domain).slice(0, 20);

  const uniqueDomains = [...new Set(cleanedResults.map((item) => item.domain))];
  const engine = sanitizeString(raw.engine || '', 80).toLowerCase() || 'google';
  const serpFeatures = normalizeFeatureList(raw.serpFeatures || []);
  return {
    engine,
    engineLabel: titleCaseEngine(engine),
    query: sanitizeString(raw.query || fallbackQuery || '', 300),
    captureMode: `Local ${titleCaseEngine(engine)} page`,
    resultCount: cleanedResults.length,
    uniqueDomains,
    serpFeatures,
    results: cleanedResults,
    capturedAt: new Date().toISOString()
  };
}

function renderGoogle(data) {
  els.googleQueryLabel.textContent = data?.query || 'None';
  els.googleResultCount.textContent = String(data?.resultCount || 0);
  els.googleSiteCount.textContent = String(data?.uniqueDomains?.length || 0);
  els.googleCaptureMode.textContent = data?.captureMode || 'Local page';
  els.googleEngineLabel.textContent = data?.engineLabel || 'Unknown';
  els.googleFeatureCount.textContent = String(data?.serpFeatures?.length || 0);

  const domainCounts = (data?.results || []).reduce((acc, item) => {
    acc[item.domain] = (acc[item.domain] || 0) + 1;
    return acc;
  }, {});
  const siteRows = Object.entries(domainCounts)
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));
  els.googleSitesWrap.innerHTML = '';
  els.googleSitesEmpty.classList.toggle('hidden', siteRows.length > 0);
  els.googleSitesWrap.classList.toggle('hidden', siteRows.length === 0);
  els.googleSitesSummary.classList.toggle('hidden', siteRows.length === 0);
  els.googleSitesSummary.textContent = siteRows.length ? `${data?.resultCount || 0} results across ${data?.uniqueDomains?.length || 0} sites` : '';
  siteRows.forEach(({ domain, count }) => {
    const row = document.createElement('div');
    row.className = 'site-row';
    const name = document.createElement('div');
    name.className = 'site-name';
    name.textContent = domain;
    const meta = document.createElement('div');
    meta.className = 'site-meta';
    const countPill = document.createElement('span');
    countPill.className = 'site-count';
    countPill.textContent = `${count} ${count === 1 ? 'result' : 'results'}`;
    meta.appendChild(countPill);
    row.appendChild(name);
    row.appendChild(meta);
    els.googleSitesWrap.appendChild(row);
  });

  els.googleFeaturesWrap.innerHTML = '';
  const features = data?.serpFeatures || [];
  els.googleFeaturesEmpty.classList.toggle('hidden', features.length > 0);
  els.googleFeaturesWrap.classList.toggle('hidden', features.length === 0);
  els.googleFeaturesSummary.classList.toggle('hidden', features.length === 0);
  els.googleFeaturesSummary.textContent = features.length ? `${features.length} detected on this ${data?.engineLabel || 'SERP'}` : '';
  features.forEach((feature) => {
    const chip = document.createElement('span');
    chip.className = 'feature-chip';
    chip.textContent = feature;
    els.googleFeaturesWrap.appendChild(chip);
  });

  els.googleResultsWrap.innerHTML = '';
  const results = data?.results || [];
  els.googleEmpty.classList.toggle('hidden', results.length > 0);
  els.googleResultsWrap.classList.toggle('hidden', results.length === 0);

  results.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'result-row';

    const top = document.createElement('div');
    top.className = 'result-top';
    const rank = document.createElement('span');
    rank.className = 'result-rank';
    rank.textContent = `#${item.rank}`;
    const domain = document.createElement('span');
    domain.className = 'domain-tag';
    domain.textContent = item.domain;
    top.appendChild(rank);
    top.appendChild(domain);

    const title = document.createElement('div');
    title.className = 'result-title';
    title.textContent = item.title;

    const snippet = document.createElement('div');
    snippet.className = 'result-snippet';
    snippet.textContent = item.snippet || item.url;

    const resultUrl = document.createElement('div');
    resultUrl.className = 'result-url';
    resultUrl.textContent = item.url;

    row.appendChild(top);
    row.appendChild(title);
    row.appendChild(snippet);
    row.appendChild(resultUrl);
    els.googleResultsWrap.appendChild(row);
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

  comparisonHistory = [entry, ...comparisonHistory.filter((item) => item.id !== entry.id)].slice(0, 100);
  lastSavedFingerprint = fingerprint;
  saveLocalState().catch(() => {});
}

function renderHistory() {
  const history = comparisonHistory || [];
  els.historyRunCount.textContent = String(history.length);
  els.historyQueryCount.textContent = String(new Set(history.map((h) => h.query).filter(Boolean)).size);
  els.historyEngineCount.textContent = String(new Set(history.map((h) => h.engineLabel || h.engine).filter(Boolean)).size);
  els.historyLatestOverlap.textContent = history.length ? `${history[0].overlapScore}%` : '0%';
  els.historyWrap.innerHTML = '';
  els.historyEmpty.classList.toggle('hidden', history.length > 0);
  els.historyWrap.classList.toggle('hidden', history.length === 0);
  els.historySummary.classList.toggle('hidden', history.length === 0);
  els.historySummary.textContent = history.length ? `${history.length} saved local comparison${history.length === 1 ? '' : 's'}` : '';

  history.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'result-row history-card';

    const top = document.createElement('div');
    top.className = 'history-top';
    const titleWrap = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'history-title';
    title.textContent = item.query || 'Untitled query';
    const meta = document.createElement('div');
    meta.className = 'history-meta';
    meta.textContent = `${item.engineLabel || item.engine || 'Search'} • ${item.model || 'Unknown model'} • ${new Date(item.savedAt).toLocaleString()}`;
    titleWrap.appendChild(title);
    titleWrap.appendChild(meta);

    const overlap = document.createElement('span');
    overlap.className = 'site-count';
    overlap.textContent = `${item.overlapScore}% overlap`;
    top.appendChild(titleWrap);
    top.appendChild(overlap);

    const badges = document.createElement('div');
    badges.className = 'history-badges';
    [
      `${item.googleResultCount} results`,
      `${item.chatgptDomains.length} ChatGPT sites`,
      `${item.googleDomains.length} search sites`,
      `${item.serpFeatures.length} features`,
      item.browser
    ].forEach((label) => {
      const chip = document.createElement('span');
      chip.className = 'history-badge';
      chip.textContent = label;
      badges.appendChild(chip);
    });

    const drift = document.createElement('div');
    drift.className = 'history-drift';
    drift.textContent = item.drift.added || item.drift.removed
      ? `Drift vs prior ${item.engineLabel || item.engine} capture for this query: +${item.drift.added} / -${item.drift.removed}`
      : 'No drift detected versus the prior saved capture of this query.';

    const hint = document.createElement('div');
    hint.className = 'history-drift';
    hint.textContent = 'Each row is a saved local snapshot of one ChatGPT + search comparison.';

    card.appendChild(top);
    card.appendChild(badges);
    card.appendChild(drift);
    card.appendChild(hint);
    els.historyWrap.appendChild(card);
  });
}

function renderCombined() {
  const data = buildCombinedData();
  els.combinedWrap.innerHTML = '';
  els.missedOpportunitiesWrap.innerHTML = '';
  if (!data) {
    els.combinedOverlapScore.textContent = '0%';
    els.combinedOverlapMeta.textContent = '0 of 0 ChatGPT sites appear in search results';
    if (els.combinedPrecisionScore) els.combinedPrecisionScore.textContent = '0%';
    if (els.combinedRecallScore) els.combinedRecallScore.textContent = '0%';
    if (els.combinedJaccardScore) els.combinedJaccardScore.textContent = '0%';
    els.combinedOverlapCount.textContent = '0';
    els.combinedChatgptOnlyCount.textContent = '0';
    els.combinedGoogleOnlyCount.textContent = '0';
    els.combinedQueryLabel.textContent = 'None';
    els.combinedEmpty.classList.remove('hidden');
    els.combinedWrap.classList.add('hidden');
    els.missedOpportunitiesEmpty.classList.remove('hidden');
    els.missedOpportunitiesWrap.classList.add('hidden');
    els.missedOpportunitiesSummary.classList.add('hidden');
    return;
  }

  // Headline is F1, which is a better "how similar are these sets" number
  // than raw precision (the old overlapScore). The breakdown below shows
  // precision + recall + Jaccard so users can see where the disagreement is.
  els.combinedOverlapScore.textContent = `${data.f1Score}%`;
  els.combinedOverlapMeta.textContent = data.overlapMeta;
  if (els.combinedPrecisionScore) els.combinedPrecisionScore.textContent = `${data.precisionScore}%`;
  if (els.combinedRecallScore) els.combinedRecallScore.textContent = `${data.recallScore}%`;
  if (els.combinedJaccardScore) els.combinedJaccardScore.textContent = `${data.jaccardScore}%`;
  els.combinedOverlapCount.textContent = String(data.overlap.length);
  els.combinedChatgptOnlyCount.textContent = String(data.chatOnly.length);
  els.combinedGoogleOnlyCount.textContent = String(data.googleOnly.length);
  els.combinedQueryLabel.textContent = data.query || 'None';
  els.combinedEmpty.classList.add('hidden');
  els.combinedWrap.classList.remove('hidden');

  const table = document.createElement('div');
  table.className = 'comparison-table';
  const header = document.createElement('div');
  header.className = 'comparison-row comparison-header';
  ['Domain', 'ChatGPT', 'Google', 'Title', 'Overlap'].forEach((label) => {
    const cell = document.createElement('div');
    cell.className = 'comparison-cell';
    cell.textContent = label;
    header.appendChild(cell);
  });
  table.appendChild(header);

  data.rows.forEach((rowData) => {
    const row = document.createElement('div');
    row.className = 'comparison-row';

    const domain = document.createElement('div');
    domain.className = 'comparison-cell domain-cell';
    domain.textContent = rowData.domain;

    const chat = document.createElement('div');
    chat.className = 'comparison-cell';
    chat.textContent = rowData.inChatgpt ? `${rowData.chatgptCitations} citation${rowData.chatgptCitations === 1 ? '' : 's'}` : '—';

    const google = document.createElement('div');
    google.className = 'comparison-cell';
    google.textContent = rowData.inGoogle ? `#${rowData.googleRank}` : '—';

    const title = document.createElement('div');
    title.className = 'comparison-cell title-cell';
    title.textContent = rowData.googleTitle || '—';

    const overlap = document.createElement('div');
    overlap.className = 'comparison-cell';
    const tag = document.createElement('span');
    tag.className = `overlap-tag ${rowData.inChatgpt && rowData.inGoogle ? 'shared' : rowData.inChatgpt ? 'chatgpt-only' : 'google-only'}`;
    tag.textContent = rowData.overlapLabel;
    overlap.appendChild(tag);

    [domain, chat, google, title, overlap].forEach((cell) => row.appendChild(cell));
    table.appendChild(row);
  });

  els.combinedWrap.appendChild(table);

  const missed = data.missedOpportunities || [];
  els.missedOpportunitiesEmpty.classList.toggle('hidden', missed.length > 0);
  els.missedOpportunitiesWrap.classList.toggle('hidden', missed.length === 0);
  els.missedOpportunitiesSummary.classList.toggle('hidden', missed.length === 0);
  els.missedOpportunitiesSummary.textContent = missed.length ? `${missed.length} Google-ranked domains not cited by ChatGPT` : '';

  missed.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'result-row';
    const top = document.createElement('div');
    top.className = 'result-top';
    const rank = document.createElement('span');
    rank.className = 'result-rank';
    rank.textContent = item.googleRank ? `#${item.googleRank}` : '—';
    const domain = document.createElement('span');
    domain.className = 'domain-tag';
    domain.textContent = item.domain;
    top.appendChild(rank);
    top.appendChild(domain);

    const title = document.createElement('div');
    title.className = 'result-title';
    title.textContent = item.googleTitle || 'Untitled result';

    row.appendChild(top);
    row.appendChild(title);
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

async function fetchSearchResultsInPage() {
  const clean = (value, maxLen = 500) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLen) : '';
  const norm = (host) => clean(host || '', 255).toLowerCase().replace(/^www\./, '');
  try {
    const url = new URL(window.location.href);
    const host = norm(url.hostname);
    const featureSet = new Set();
    // Helper: detect a SERP feature by trying each selector in `selectors`.
    // DOM-based detection replaces the old bodyText regex approach, which
    // produced false positives whenever a user's query contained phrases
    // like "top stories" or "featured snippet". Selectors are lenient
    // against Google markup drift — we list a few alternative hooks per
    // feature and any match wins.
    const hasAny = (selectors) => selectors.some((sel) => {
      try { return !!document.querySelector(sel); } catch { return false; }
    });
    const seen = new Set();
    let engine = '';
    let query = '';
    const candidates = [];

    const pushCandidate = (title, href, domain, snippet) => {
      const safeTitle = clean(title, 300);
      const safeHref = clean(href, 1200);
      const safeDomain = norm(domain);
      const safeSnippet = clean(snippet, 420);
      if (!safeTitle || !safeHref || !safeDomain) return;
      const key = `${safeDomain}||${safeTitle}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push({ title: safeTitle, url: safeHref, domain: safeDomain, snippet: safeSnippet });
    };

    // Helper: pick the first organic-looking anchor (href starts with http,
    // excludes the engine's own domain, and isn't a webcache/translate/image
    // proxy) from within a container. Returns { anchor, h3 } or null.
    const pickOrganicAnchor = (container, ownDomainPattern) => {
      const h3 = container.querySelector('a h3');
      if (!h3) return null;
      const anchor = h3.closest('a');
      if (!anchor) return null;
      const href = anchor.href || '';
      if (!href.startsWith('http')) return null;
      let parsed;
      try { parsed = new URL(href); } catch { return null; }
      const domain = norm(parsed.hostname);
      if (!domain || ownDomainPattern.test(domain)) return null;
      // Skip Google's URL wrappers (already handled by href resolution) and
      // non-result paths (maps, images, shopping product pages, etc.).
      if (/^(webcache|translate|images|maps|shopping)\./i.test(domain)) return null;
      return { anchor, h3, href, domain, parsed };
    };

    // Container-class tokens that indicate a SERP feature rather than an
    // organic result. We match against a lowercased className string.
    const nonOrganicClassTokens = [
      'related-question-pair', 'ulsxyf', 'kno-kp', 'g-blk', 'knowledge-panel',
      'kp-blk', 'knavi', 'carousel', 'mnr-c', 'commercial-unit', 'obcontainer'
    ];
    const hasNonOrganicClass = (el) => {
      const cls = typeof el?.className === 'string' ? el.className.toLowerCase() : '';
      if (!cls) return false;
      return nonOrganicClassTokens.some((t) => cls.includes(t));
    };

    if (/(^|\.)google\./i.test(host) && url.pathname.startsWith('/search')) {
      engine = 'google';
      query = clean(document.querySelector('textarea[name="q"], input[name="q"]')?.value || url.searchParams.get('q') || '', 300);
      // Organic results live under #rso as direct-child containers. Iterating
      // containers (rather than every `a h3` on the page) gives true organic
      // rank and skips sitelinks, People-Also-Ask, knowledge panels, etc.
      const rso = document.querySelector('#rso') || document.querySelector('#search');
      if (rso) {
        const containers = Array.from(rso.querySelectorAll(':scope > div'));
        for (const container of containers) {
          if (hasNonOrganicClass(container)) continue;
          // Also skip if the container itself is or wraps a People-Also-Ask module.
          if (container.querySelector('[jsname="Cpkphb"], [data-initq], .related-question-pair')) continue;
          const picked = pickOrganicAnchor(container, /(^|\.)google\./i);
          if (!picked) continue;
          const snippet = clean((container.innerText || '').replace(picked.h3.textContent || '', ''), 420);
          pushCandidate(picked.h3.textContent || '', picked.href, picked.domain, snippet);
        }
      }
      // Google SERP-feature detection via DOM hooks. We prefer structural
      // selectors over text scanning so a user's own query can't trigger
      // false positives.
      if (hasAny([
        '#ai-overview', '#AI-Overview', '[data-attrid="AIOverviewTitle"]',
        '[aria-label*="AI Overview" i]', 'div[data-attrid*="overview" i]',
        'div[jscontroller][data-q]'
      ])) featureSet.add('AI Overview');
      if (hasAny([
        '.hgKElc', '.xpdopen .DKV0Md', '[data-attrid="wa:/description"]',
        '.ifM9O', '.kp-blk > div:first-child'
      ])) featureSet.add('Featured Snippet');
      if (hasAny([
        'g-section-with-header[data-hveid]', 'g-news-card',
        'div[data-attrid*="news" i]', '.WlydOe'
      ])) featureSet.add('Top Stories');
      if (hasAny([
        '.commercial-unit-desktop-top', '.sh-dgr__content',
        'g-scrolling-carousel[data-attrid*="shopping" i]', '.pla-unit'
      ])) featureSet.add('Shopping');
      if (hasAny([
        'video-voyager', 'a[href*="youtube.com/watch"]',
        'g-scrolling-carousel[data-attrid*="video" i]', '#videobox'
      ])) featureSet.add('Videos');
      if (hasAny(['.related-question-pair', '[jsname="Cpkphb"]']))
        featureSet.add('People Also Ask');
      if (hasAny([
        '.knowledge-panel', '.kno-kp', '.kp-blk',
        '[data-attrid*="kc:/common/topic"]'
      ])) featureSet.add('Knowledge Panel');
      if (hasAny(['#imagebox_bigimages', 'g-section-with-header g-img', '.isv-r']))
        featureSet.add('Images Pack');
      if (hasAny(['.rllt__details', '[data-attrid*="kc:/location"]']))
        featureSet.add('Local Pack');
    } else if (/(^|\.)bing\.com$/i.test(host)) {
      engine = 'bing';
      query = clean(document.querySelector('textarea[name="q"], input[name="q"], #sb_form_q')?.value || url.searchParams.get('q') || '', 300);
      // Bing organic results are in li.b_algo within #b_results. Iterate
      // containers so rank is the organic list position, and take the first
      // h2 > a per container (deep links live in .b_deep and are ignored).
      document.querySelectorAll('#b_results > li.b_algo').forEach((container) => {
        const anchor = container.querySelector('h2 a');
        if (!anchor) return;
        const href = anchor.href || '';
        if (!href.startsWith('http')) return;
        let parsed;
        try { parsed = new URL(href); } catch { return; }
        const domain = norm(parsed.hostname);
        if (!domain || /bing\.com/i.test(domain)) return;
        const snippet = clean(container.querySelector('.b_caption p')?.innerText || container.innerText || '', 420).replace(clean(anchor.textContent || '', 300), '');
        pushCandidate(anchor.textContent || '', href, domain, snippet);
      });
      // Bing SERP-feature detection.
      if (hasAny([
        'cib-serp-main', 'div.codex-sky-answer',
        '[class*="copilot" i]', '[class*="cib" i]'
      ])) featureSet.add('AI Answer');
      if (hasAny(['div[data-feedbk-ids*="News"]', '.news-card', 'li.b_ans .b_algoheader'])) featureSet.add('Top Stories');
      if (hasAny(['.slide[data-ptype="Shopping"]', '.pa_content.shop', '[data-partnertag="shopping"]'])) featureSet.add('Shopping');
      if (hasAny(['.vrhdata', '.mc_vtvc', '.video_card'])) featureSet.add('Videos');
      if (hasAny(['.b_ans', '.b_answer', '.b_expPag', '.tbcont'])) featureSet.add('Featured Snippet');
    } else if (host === 'duckduckgo.com' && (url.pathname.startsWith('/') || url.pathname.startsWith('/html'))) {
      engine = 'duckduckgo';
      query = clean(document.querySelector('input[name="q"], textarea[name="q"]')?.value || url.searchParams.get('q') || '', 300);
      // DDG organic results: [data-testid="result"] (modern) or .result:not(.result--ad) (lite).
      const ddgContainers = document.querySelectorAll('[data-testid="result"], .result:not(.result--ad):not(.result--sidebar)');
      ddgContainers.forEach((container) => {
        // Skip containers that are clearly ads (belt-and-suspenders).
        const cls = typeof container.className === 'string' ? container.className.toLowerCase() : '';
        if (cls.includes('result--ad')) return;
        const anchor = container.querySelector('h2 a, .result__title a');
        if (!anchor) return;
        const href = anchor.href || '';
        if (!href.startsWith('http')) return;
        let parsed;
        try { parsed = new URL(href); } catch { return; }
        const domain = norm(parsed.hostname);
        if (!domain || /duckduckgo\.com/i.test(domain)) return;
        const snippet = clean(container.querySelector('[data-result="snippet"], .result__snippet')?.innerText || container.innerText || '', 420).replace(clean(anchor.textContent || '', 300), '');
        pushCandidate(anchor.textContent || '', href, domain, snippet);
      });
      // DuckDuckGo SERP-feature detection.
      if (hasAny(['article[data-testid="news-results"]', '.news-card', '.module--news'])) featureSet.add('News Module');
      if (hasAny(['.module--videos', '.tile--vid', 'article[data-testid="videos-results"]'])) featureSet.add('Videos');
      if (hasAny(['.module--shopping', 'article[data-testid="shopping-results"]'])) featureSet.add('Shopping');
      if (hasAny(['.ai-assist', '[data-testid="ai-assist"]'])) featureSet.add('AI Answer');
    } else {
      return { error: 'This page is not a supported Google, Bing, or DuckDuckGo results page.' };
    }

    const results = candidates.slice(0, 10).map((item, index) => ({ rank: index + 1, ...item }));
    return { engine, query, serpFeatures: [...featureSet], results, pageUrl: window.location.href };
  } catch (error) {
    return { error: `Search page read failed: ${error?.message || 'Unknown error'}` };
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
    if (/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(tab.url)) {
      const injectionResults = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: fetchConversationPayloadInPage });
      const result = injectionResults?.[0]?.result;
      if (!result) return setStatus('No data returned from the page.', 'error');
      if (result.error) return setStatus(result.error, 'error');
      lastChatgptData = { ...parseChatgptPayload(result.payload), conversationId: result.conversationId, pageUrl: result.pageUrl || tab.url || '', browser: getBrowserLabel(), capturedAt: new Date().toISOString() };
      await self.AIQIShared.storage.savePendingChatgptSnapshot(lastChatgptData);
      await saveLocalState();
      renderChatgpt(lastChatgptData);
      renderCombined();
      renderHistory();
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
      await self.AIQIShared.storage.clearPendingGoogleQuery();
      await saveLocalState();
      renderChatgpt(lastChatgptData);
      renderGoogle(lastGoogleData);
      renderCombined();
      renderHistory();
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
  await openFullPageDashboard(true, googleTab?.id || currentTab?.id || 0, 'google');
  setStatus('Opened Google and dashboard.', 'ok');
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
  els.copySitesBtn.addEventListener('click', async () => {
    if (!lastChatgptData?.domainCounts?.length) return setStatus('There are no cited sites to copy.', 'error');
    await copyText(lastChatgptData.domainCounts.map(({ domain, count }) => `${domain} (${count})`).join('\n'), 'Sites copied to system clipboard.');
  });
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

  // React to settings changes made from another popup instance (e.g.
  // the full-page dashboard open in another tab flipping the toggle).
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[self.AIQIShared.SETTINGS_KEY]) return;
    const newValue = changes[self.AIQIShared.SETTINGS_KEY].newValue || {};
    currentSettings = { ...self.AIQIShared.DEFAULT_SETTINGS, ...newValue };
    if (autoToggle) autoToggle.checked = !!currentSettings.autoCaptureChatgpt;
    if (regDomainToggle) regDomainToggle.checked = currentSettings.matchByRegisteredDomain !== false;
    if (autoRefreshSelect) autoRefreshSelect.value = String(currentSettings.autoRefreshSeconds || 0);
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
  const params = new URLSearchParams(window.location.search);
  const requestedView = params.get('view');
  if (requestedView && els.tabPanels[requestedView]) activeView = requestedView;
  renderChatgpt(lastChatgptData);
  renderGoogle(lastGoogleData);
  renderCombined();
  renderHistory();
  switchTab(activeView);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const K = self.AIQIShared.STORAGE_KEYS;
    let shouldRender = false;
    if (changes[K.CHATGPT_DATA]) { lastChatgptData = changes[K.CHATGPT_DATA].newValue || null; shouldRender = true; }
    if (changes[K.GOOGLE_DATA]) { lastGoogleData = changes[K.GOOGLE_DATA].newValue || null; shouldRender = true; }
    if (changes[K.HISTORY]) { comparisonHistory = Array.isArray(changes[K.HISTORY].newValue) ? changes[K.HISTORY].newValue : []; shouldRender = true; }
    if (changes[K.ACTIVE_VIEW]) { activeView = changes[K.ACTIVE_VIEW].newValue || activeView; }
    if (shouldRender) {
      renderChatgpt(lastChatgptData);
      renderGoogle(lastGoogleData);
      renderCombined();
      renderHistory();
      switchTab(activeView);
    }
  });
  await inspectCurrentTab();
}

document.addEventListener('DOMContentLoaded', init);
