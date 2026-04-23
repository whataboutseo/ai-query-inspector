/**
 * shared.js
 * ---------
 * Shared parsing + normalization helpers used by both `background.js`
 * (MV3 service worker) and `popup.js` (extension popup + full-page view).
 *
 * Previously these 9 functions existed in both files and had already
 * drifted in subtle ways. Consolidating them here is a precondition for
 * all downstream work (auto-capture opt-in, centralized storage,
 * broader fan-out detection, etc.) because any parsing change needs to
 * land in exactly one place.
 *
 * Loading:
 *   - popup.html loads this file with a <script> tag before popup.js.
 *   - background.js calls `importScripts('shared.js')` at the top.
 * In both cases the helpers are published on `self.AIQIShared` so
 * consumers can destructure them.
 */
(function attachShared(root) {
  'use strict';

  function sanitizeString(value, maxLen = 500) {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/\s+/g, ' ').slice(0, maxLen);
  }

  function normalizeDomain(domain) {
    return sanitizeString(domain, 255).toLowerCase().replace(/^www\./, '');
  }

  function extractMessageText(content) {
    if (!content || typeof content !== 'object') return '';
    if (typeof content.text === 'string') return sanitizeString(content.text, 1200);
    if (Array.isArray(content.parts)) {
      const joined = content.parts
        .map((part) => {
          if (typeof part === 'string') return part;
          if (part && typeof part === 'object' && typeof part.text === 'string') return part.text;
          return '';
        })
        .filter(Boolean)
        .join(' ');
      return sanitizeString(joined, 1200);
    }
    return '';
  }

  function scanForSourceItems(value, acc = []) {
    if (!value || typeof value !== 'object') return acc;
    if (Array.isArray(value)) {
      value.forEach((item) => scanForSourceItems(item, acc));
      return acc;
    }
    const url = typeof value.url === 'string' ? sanitizeString(value.url, 1500) : '';
    const title = sanitizeString(value.title || value.display_text || value.name || value.citation_text || value.text || '', 300);
    if (url && /^https?:\/\//i.test(url)) {
      let domain = '';
      try { domain = normalizeDomain(new URL(url).hostname); } catch {}
      acc.push({ url, title, domain });
    }
    Object.values(value).forEach((child) => {
      if (child && typeof child === 'object') scanForSourceItems(child, acc);
    });
    return acc;
  }

  function getSearchOrigin(explicitQueries, citedSources, utmCount, uniqueDomainCount) {
    if (explicitQueries > 0) return { label: 'Search detected', confidence: 'High', tone: 'search' };
    if (citedSources > 0 || utmCount > 0 || uniqueDomainCount >= 2) return { label: 'Search likely', confidence: 'Medium', tone: 'likely' };
    if (uniqueDomainCount === 1) return { label: 'Unclear / mixed', confidence: 'Low', tone: 'unclear' };
    return { label: 'Likely from training', confidence: 'Medium', tone: 'training' };
  }

  function sortConversationPath(raw) {
    const mapping = raw?.mapping || {};
    const currentNodeId = raw?.current_node;
    const path = [];
    const seen = new Set();
    let nodeId = currentNodeId;
    while (nodeId && mapping[nodeId] && !seen.has(nodeId)) {
      seen.add(nodeId);
      path.push(mapping[nodeId]);
      nodeId = mapping[nodeId]?.parent || null;
    }
    if (path.length) return path.reverse();
    return Object.values(mapping).sort((a, b) => {
      const ta = a?.message?.create_time || 0;
      const tb = b?.message?.create_time || 0;
      return ta - tb;
    });
  }

  function aggregateSourceItems(items = []) {
    const sourceMap = new Map();
    items.forEach((item) => {
      if (!item?.url) return;
      const key = item.url;
      const existing = sourceMap.get(key) || { url: item.url, title: item.title || '', domain: item.domain || '', count: 0, citedCount: 0 };
      existing.count += 1;
      if (item.cited) existing.citedCount += 1;
      if (!existing.title && item.title) existing.title = item.title;
      if (!existing.domain && item.domain) existing.domain = item.domain;
      sourceMap.set(key, existing);
    });
    return [...sourceMap.values()].map((item) => {
      const statusLabel = item.citedCount > 0
        ? (item.citedCount < item.count ? 'Cited + considered' : 'Cited source')
        : 'Considered source';
      return { ...item, statusLabel };
    }).sort((a, b) => b.citedCount - a.citedCount || b.count - a.count || (a.domain || '').localeCompare(b.domain || ''));
  }

  function buildConversationTurns(raw) {
    const orderedNodes = sortConversationPath(raw);
    const turns = [];
    let currentTurn = null;

    const parseQueriesFromText = (text) => {
      const found = [];
      if (!text) return found;
      try {
        const parsed = JSON.parse(text);
        if (parsed && Array.isArray(parsed.search_query)) {
          parsed.search_query.forEach((sq) => {
            if (!sq || typeof sq !== 'object') return;
            const q = sanitizeString(sq.q, 500);
            if (!q) return;
            found.push({ q, domains: Array.isArray(sq.domains) ? sq.domains.map(normalizeDomain).filter(Boolean).slice(0, 20) : [] });
          });
        }
      } catch {
        const match = text.match(/search\("([^"]+)"\)/);
        if (match) found.push({ q: sanitizeString(match[1], 500), domains: [] });
      }
      return found;
    };

    orderedNodes.forEach((node) => {
      const message = node?.message;
      if (!message || typeof message !== 'object') return;
      const content = message.content || {};
      const role = message.author?.role;
      if (role === 'user') {
        const prompt = extractMessageText(content);
        if (prompt) {
          currentTurn = {
            index: turns.length + 1,
            prompt,
            queries: [],
            sourceItems: [],
            citedSourceCount: 0,
            uniqueSiteCount: 0,
            uniqueSourceCount: 0,
            queryCount: 0,
            sources: [],
          };
          turns.push(currentTurn);
        }
        return;
      }
      if (role !== 'assistant' || !currentTurn) return;

      const text = typeof content.text === 'string' ? content.text : '';
      parseQueriesFromText(text).forEach((q) => currentTurn.queries.push(q));

      const localItems = [];
      scanForSourceItems(message.metadata || {}, localItems);
      scanForSourceItems(message.content || {}, localItems);
      const refs = message.metadata?.content_references;
      if (Array.isArray(refs)) {
        refs.forEach((ref) => {
          if (!Array.isArray(ref?.items)) return;
          ref.items.forEach((item) => {
            if (!item || typeof item.url !== 'string') return;
            const url = sanitizeString(item.url, 1500);
            let domain = '';
            try { domain = normalizeDomain(new URL(url).hostname); } catch {}
            localItems.push({
              url,
              title: sanitizeString(item.title || item.display_text || item.name || item.citation_text || '', 300),
              domain,
              cited: true,
            });
          });
        });
      }
      currentTurn.sourceItems.push(...localItems);
    });

    return turns.map((turn) => {
      const uniqueQuery = new Map();
      (turn.queries || []).forEach((q) => {
        const key = `${q.q}||${(q.domains || []).join(',')}`;
        if (!uniqueQuery.has(key)) uniqueQuery.set(key, q);
      });
      const sources = aggregateSourceItems(turn.sourceItems || []);
      const uniqueSites = [...new Set(sources.map((s) => s.domain).filter(Boolean))];
      const citedSourceCount = sources.reduce((sum, s) => sum + (s.citedCount || 0), 0);
      return {
        index: turn.index,
        prompt: turn.prompt,
        queries: [...uniqueQuery.values()].slice(0, 20),
        queryCount: uniqueQuery.size,
        sources: sources.slice(0, 20),
        citedSourceCount,
        uniqueSiteCount: uniqueSites.length,
        uniqueSourceCount: sources.length,
      };
    });
  }

  /**
   * Parse a ChatGPT conversation payload.
   *
   * The two historical callers disagreed on error handling: popup.js
   * threw on malformed shapes, while background.js silently returned
   * null. We preserve both behaviors via the `strict` option:
   *   - strict: true  → throw a descriptive Error (popup callsite)
   *   - strict: false → return null (background callsite)
   * Callers requesting metadata fields can pass `conversationId` and
   * `pageUrl`, which are copied onto the returned object.
   */
  function parseChatgptPayload(raw, options = {}) {
    const { strict = false, conversationId, pageUrl, browser, capturedAt } = options;
    const invalidRoot = !raw || typeof raw !== 'object' || Array.isArray(raw);
    const invalidMapping = !invalidRoot && (!raw.mapping || typeof raw.mapping !== 'object' || Array.isArray(raw.mapping));
    if (invalidRoot || invalidMapping) {
      if (strict) {
        throw new Error(invalidRoot
          ? 'Payload format may have changed: root payload is invalid.'
          : 'Payload format may have changed: missing conversation mapping.');
      }
      return null;
    }

    const queries = [];
    const domains = [];
    let citedSources = 0;
    let totalUrls = 0;
    let utmCount = 0;
    let hiddenLikely = true;
    let inspectedNodes = 0;
    let latestUserPrompt = '';
    const sourceItems = [];
    const citedUrlCounts = new Map();

    const tryAddQuery = (queryText, domainList = []) => {
      const q = sanitizeString(queryText, 500);
      if (!q) return;
      const normalizedDomains = Array.isArray(domainList) ? domainList.map(normalizeDomain).filter(Boolean).slice(0, 20) : [];
      queries.push({ q, domains: normalizedDomains });
    };

    for (const node of Object.values(raw.mapping)) {
      if (!node || typeof node !== 'object') continue;
      inspectedNodes += 1;
      if (inspectedNodes > 5000) break;
      const message = node.message;
      if (!message || typeof message !== 'object') continue;
      const content = message.content;
      const text = content && typeof content.text === 'string' ? content.text : '';

      if (message.author?.role === 'user') {
        const candidatePrompt = extractMessageText(content);
        if (candidatePrompt) latestUserPrompt = candidatePrompt;
      }

      if (content?.content_type === 'code' && text) {
        try {
          const parsed = JSON.parse(text);
          if (parsed && Array.isArray(parsed.search_query)) {
            hiddenLikely = false;
            parsed.search_query.slice(0, 100).forEach((sq) => {
              if (sq && typeof sq === 'object') tryAddQuery(sq.q, sq.domains || []);
            });
          }
        } catch {
          const matchSearch = text.match(/search\("([^"]+)"\)/);
          if (matchSearch) {
            hiddenLikely = false;
            tryAddQuery(matchSearch[1], []);
          }
        }
      }

      if (message.author?.role === 'assistant') {
        scanForSourceItems(message.metadata || {}, sourceItems);
        scanForSourceItems(message.content || {}, sourceItems);
      }

      const refs = message.metadata?.content_references;
      if (!Array.isArray(refs)) continue;
      refs.slice(0, 500).forEach((ref) => {
        if (!Array.isArray(ref?.items)) return;
        ref.items.slice(0, 500).forEach((item) => {
          if (!item || typeof item !== 'object' || typeof item.url !== 'string') return;
          const cleanUrl = sanitizeString(item.url, 1500);
          totalUrls += 1;
          citedSources += 1;
          citedUrlCounts.set(cleanUrl, (citedUrlCounts.get(cleanUrl) || 0) + 1);
          sourceItems.push({
            url: cleanUrl,
            title: sanitizeString(item.title || item.display_text || item.name || item.citation_text || '', 300),
            domain: '',
            cited: true,
          });
          if (cleanUrl.includes('utm_source=chatgpt')) utmCount += 1;
          try {
            const parsedUrl = new URL(cleanUrl);
            const domain = normalizeDomain(parsedUrl.hostname);
            if (domain) domains.push(domain);
          } catch {}
        });
      });
    }

    const uniqueQueryKeys = new Set();
    const dedupedQueries = queries.filter((item) => {
      const key = `${item.q}||${item.domains.join(',')}`;
      if (uniqueQueryKeys.has(key)) return false;
      uniqueQueryKeys.add(key);
      return true;
    }).slice(0, 250);

    const uniqueDomains = [...new Set(domains)].sort((a, b) => a.localeCompare(b));
    const domainCountMap = {};
    domains.forEach((domain) => { domainCountMap[domain] = (domainCountMap[domain] || 0) + 1; });
    const domainCounts = Object.entries(domainCountMap)
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain))
      .slice(0, 250);

    const conversationTurns = buildConversationTurns(raw);

    const sourceMap = new Map();
    sourceItems.forEach((item) => {
      if (!item.url) return;
      const key = item.url;
      const existing = sourceMap.get(key) || { url: item.url, title: item.title || '', domain: item.domain || '', count: 0, citedCount: 0 };
      existing.count += 1;
      if (!existing.title && item.title) existing.title = item.title;
      if (!existing.domain && item.domain) existing.domain = item.domain;
      existing.citedCount = citedUrlCounts.get(key) || existing.citedCount || 0;
      sourceMap.set(key, existing);
    });

    const sources = [...sourceMap.values()].map((item) => {
      let domain = item.domain || '';
      if (!domain && item.url) {
        try { domain = normalizeDomain(new URL(item.url).hostname); } catch {}
      }
      const cited = (item.citedCount || 0) > 0;
      return {
        ...item,
        domain,
        status: cited ? 'cited' : 'considered',
        statusLabel: cited ? 'Cited source' : 'Considered source',
      };
    }).sort((a, b) =>
      (b.citedCount || 0) - (a.citedCount || 0)
      || b.count - a.count
      || a.domain.localeCompare(b.domain)
      || a.url.localeCompare(b.url)
    ).slice(0, 500);

    const model = sanitizeString(raw.default_model_slug || '', 120) || null;
    const turnList = Array.isArray(conversationTurns) ? conversationTurns : [];
    const latestTurn = turnList.length ? turnList[turnList.length - 1] : null;

    const summaryQueries = latestTurn?.queries?.length ? latestTurn.queries : dedupedQueries;
    const summarySources = latestTurn?.sources?.length ? latestTurn.sources : sources;
    const summaryDomains = latestTurn?.uniqueSiteCount
      ? [...new Set(summarySources.map((s) => s.domain).filter(Boolean))].sort((a, b) => a.localeCompare(b))
      : uniqueDomains;
    const summaryDomainMap = {};
    summarySources.forEach((item) => {
      const domain = item?.domain || '';
      if (!domain) return;
      summaryDomainMap[domain] = (summaryDomainMap[domain] || 0) + (item.citedCount || item.count || 1);
    });
    const summaryDomainCounts = latestTurn?.uniqueSiteCount
      ? Object.entries(summaryDomainMap).map(([domain, count]) => ({ domain, count })).sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain))
      : domainCounts;
    const summaryCitedSources = latestTurn ? (latestTurn.citedSourceCount || 0) : citedSources;
    const searchOrigin = getSearchOrigin(summaryQueries.length, summaryCitedSources || summarySources.length, utmCount, summaryDomains.length);

    const result = {
      model,
      queries: summaryQueries,
      citedSources: summaryCitedSources,
      totalUrls,
      utmCount,
      uniqueDomains: summaryDomains,
      domainCounts: summaryDomainCounts,
      sources: summarySources,
      hiddenLikely,
      searchOrigin,
      latestUserPrompt: latestTurn?.prompt || latestUserPrompt || '',
      conversationTurns: turnList,
      searchSignals: {
        explicitQueries: summaryQueries.length,
        contentRefs: summaryCitedSources,
        utmRefs: utmCount,
        externalDomains: summaryDomains.length,
      },
    };

    // Background-capture callers enrich the record with metadata so the
    // service worker can persist a complete snapshot without each caller
    // reassembling the same fields.
    if (typeof conversationId === 'string' || conversationId == null) result.conversationId = conversationId || '';
    if (typeof pageUrl === 'string' || pageUrl == null) result.pageUrl = pageUrl || '';
    if (browser) result.browser = browser;
    if (capturedAt) result.capturedAt = capturedAt;

    return result;
  }

  const api = Object.freeze({
    sanitizeString,
    normalizeDomain,
    extractMessageText,
    scanForSourceItems,
    getSearchOrigin,
    sortConversationPath,
    aggregateSourceItems,
    buildConversationTurns,
    parseChatgptPayload,
  });

  root.AIQIShared = api;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
