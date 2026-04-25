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

  /**
   * Pragmatic public-suffix list. A full PSL is ~10k entries and changes
   * weekly; bundling it is overkill here. Instead we hard-code the
   * two-label suffixes users actually hit in SEO analysis. Anything not
   * listed falls back to "last two labels" — which is correct for
   * .com/.org/.net/.io/.ai/etc.
   */
  const TWO_LABEL_PUBLIC_SUFFIXES = new Set([
    'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'ltd.uk', 'plc.uk',
    'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp', 'ed.jp', 'gr.jp',
    'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'id.au',
    'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br',
    'co.in', 'net.in', 'org.in', 'gov.in', 'ac.in',
    'co.nz', 'net.nz', 'org.nz', 'govt.nz', 'ac.nz',
    'co.za', 'org.za', 'web.za', 'net.za', 'gov.za',
    'com.sg', 'com.mx', 'com.ar', 'com.tr', 'com.hk', 'com.tw',
    'com.ph', 'com.my', 'com.co', 'com.ve', 'com.pe', 'com.pk',
    'com.vn', 'com.eg', 'com.sa', 'com.ng', 'com.kw',
    'co.id', 'or.id', 'ac.id', 'go.id',
    'co.kr', 'ne.kr', 'or.kr', 'ac.kr', 'go.kr',
    'co.il', 'org.il', 'ac.il', 'gov.il',
    'co.th', 'in.th', 'or.th', 'ac.th', 'go.th',
  ]);

  /**
   * Fold a hostname down to its registered (buyable) domain, a.k.a.
   * eTLD+1. "en.wikipedia.org" -> "wikipedia.org"; "gov.bbc.co.uk" ->
   * "bbc.co.uk". Returns the input unchanged if it has no dots.
   */
  function registeredDomain(host) {
    const normalized = normalizeDomain(host || '');
    if (!normalized) return '';
    const labels = normalized.split('.').filter(Boolean);
    if (labels.length <= 2) return normalized;
    const lastTwo = labels.slice(-2).join('.');
    if (TWO_LABEL_PUBLIC_SUFFIXES.has(lastTwo)) {
      return labels.slice(-3).join('.');
    }
    return lastTwo;
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

  /**
   * Classify a user prompt into a coarse intent bucket. Used to give
   * context to the fan-out results ("this was a comparison query, so
   * precision over SERP matters more than recall"). Rules are
   * lightweight — no ML, no external calls. Order matters: more
   * specific patterns win over generic ones.
   *
   * Returns { label, tone, description } or null if no prompt given.
   * Tone maps to the CSS palette used by the origin badge.
   */
  const INTENT_RULES = [
    // Troubleshooting first — "docker error" or "build crashed" should
    // classify as troubleshooting even though the same sentence may
    // contain how-to verbs like "deploy" or "install".
    {
      label: 'Troubleshooting',
      tone: 'unclear',
      description: 'Diagnosing an error, bug, or unexpected behaviour.',
      patterns: [
        /\b(not working|does\s*n[’']?t work|broken|error|failed|fix|debug|troubleshoot|crash|crashes|crashed)\b/i,
        /\bwhy (?:is|does|does\s*n[’']?t|wo\s*n[’']?t|can\s*n[’']?t|isn[’']?t|won[’']?t|cant|isnt|wont)\b/i,
      ],
    },
    {
      label: 'Comparison',
      tone: 'likely',
      description: 'Direct comparison between two or more named options.',
      patterns: [
        /\b(vs\.?|versus|compared? (?:to|with)|or\s+better|which is better)\b/i,
        /\b(pros and cons|pros vs cons|tradeoffs?|trade-offs?)\b/i,
        /\b(best of|head to head|head-to-head)\b/i,
      ],
    },
    {
      label: 'How-to',
      tone: 'search',
      description: 'Step-by-step or procedural instruction request.',
      patterns: [
        /^\s*(how to|how do i|how can i|how should i)\b/i,
        /\b(step[- ]by[- ]step|tutorial|walkthrough|guide to)\b/i,
        /\b(set up|configure|install|deploy|implement|build a)\b/i,
      ],
    },
    {
      label: 'Research',
      tone: 'likely',
      description: 'Open-ended research or background understanding.',
      patterns: [
        /\b(what is|what are|what does|explain|overview of|introduction to|history of)\b/i,
        /\b(why (?:is|does|do|are)|meaning of|definition of)\b/i,
        /\b(research|studies?|papers?|evidence)\b/i,
      ],
    },
    {
      label: 'Transactional',
      tone: 'search',
      description: 'Intent to buy, subscribe, sign up, or download.',
      patterns: [
        /\b(buy|purchase|order|price of|how much (?:is|does|do)|cost of|subscribe|sign up|download|get a)\b/i,
        /\b(coupon|discount|deal|cheapest|best price)\b/i,
      ],
    },
    {
      label: 'Local',
      tone: 'likely',
      description: 'Location-scoped question ("near me", city-specific).',
      patterns: [
        /\bnear\s+me\b/i,
        /\bin\s+(?:my\s+)?(?:area|city|neighborhood|town)\b/i,
        /\b(?:closest|nearest)\s+\w+/i,
      ],
    },
    {
      label: 'Navigational',
      tone: 'likely',
      description: 'Looking for a specific brand, site, or product page.',
      patterns: [
        /\b(official|login|sign in|homepage|website|\.com|\.org|\.io)\b/i,
      ],
    },
    {
      label: 'Recommendation',
      tone: 'search',
      description: 'Asking for a shortlist of options or best picks.',
      patterns: [
        /\b(best\s+\w+|top\s+\d+|recommend|suggestions?|picks?|which\s+should\s+i)\b/i,
      ],
    },
  ];

  function classifyPromptIntent(prompt) {
    const text = sanitizeString(prompt, 2000);
    if (!text) return null;
    for (const rule of INTENT_RULES) {
      if (rule.patterns.some((re) => re.test(text))) {
        return { label: rule.label, tone: rule.tone, description: rule.description };
      }
    }
    return { label: 'General', tone: 'training', description: 'No specific intent keywords detected.' };
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

  /**
   * Extract fan-out queries from a single tool/assistant message payload.
   *
   * ChatGPT has shipped several payload shapes for its web-search tool
   * calls over time. We try each in priority order; first non-empty
   * result wins. Callers pass in:
   *   - `text`  — the content.text string (JSON blob in most cases)
   *   - `contentType` — e.g. 'code', 'search', 'tether_browsing_code',
   *                     'tether_browsing_display'
   */
  const QUERY_REGEXES = [
    // search("foo")  /  search('foo')
    /\bsearch\s*\(\s*["'](.+?)["']\s*\)/g,
    // search_web("foo")  /  web.search("foo")  /  browser.search("foo")
    /\b(?:search_web|web\.search|browser\.search|web_search)\s*\(\s*["'](.+?)["']\s*\)/g,
    // browse("https://...")  /  open_url("https://...")  — treat URL as the query literal
    /\b(?:browse|open_url|click)\s*\(\s*["'](.+?)["']\s*\)/g,
  ];

  function parseFanoutQueries(text, contentType = '') {
    const out = [];
    if (typeof text !== 'string' || !text) return out;

    const pushQuery = (q, domains) => {
      const clean = sanitizeString(q, 500);
      if (!clean) return;
      const doms = Array.isArray(domains)
        ? domains.map(normalizeDomain).filter(Boolean).slice(0, 20)
        : [];
      out.push({ q: clean, domains: doms });
    };

    // Shape 1 — JSON blob. The current (2024-present) shape is
    //   {"search_query": [{"q": "...", "domains": [...]}, ...]}
    // but older/alt shapes exist:
    //   {"queries": ["..."]}
    //   {"q": "..."}  (single)
    //   {"prompt": "...", "queries": [{"q":"..."}]}
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.search_query)) {
          parsed.search_query.forEach((sq) => {
            if (sq && typeof sq === 'object') pushQuery(sq.q, sq.domains || []);
          });
        }
        if (Array.isArray(parsed.queries)) {
          parsed.queries.forEach((sq) => {
            if (typeof sq === 'string') pushQuery(sq, []);
            else if (sq && typeof sq === 'object') pushQuery(sq.q || sq.query || sq.text, sq.domains || []);
          });
        }
        if (typeof parsed.q === 'string') pushQuery(parsed.q, parsed.domains || []);
        if (typeof parsed.query === 'string' && !out.length) pushQuery(parsed.query, []);
        if (out.length) return out;
      }
    } catch {
      // Not JSON — fall through to regex extraction.
    }

    // Shape 2 — a call expression inside a code block. Covers the
    // legacy browsing plugin (`tether_browsing_code`) and any
    // free-form assistant message that mentions a search invocation.
    // Use matchAll so we catch multiple calls within the same block
    // (ChatGPT sometimes emits 3–5 search() calls in one code cell).
    for (const regex of QUERY_REGEXES) {
      const matches = text.matchAll(new RegExp(regex.source, regex.flags));
      for (const m of matches) {
        if (m[1]) pushQuery(m[1], []);
      }
    }

    // Shape 3 — bare URL list inside a `tether_browsing_display`
    // block. Users occasionally want to see which URLs ChatGPT opened;
    // treat each as a domain-scoped query for aggregation purposes.
    if (!out.length && /tether_browsing/i.test(contentType || '')) {
      const urlMatches = text.match(/https?:\/\/[^\s"'<>]+/g) || [];
      urlMatches.slice(0, 20).forEach((url) => pushQuery(url, []));
    }

    // Dedupe by (q, domains) — the generic `search(...)` regex will
    // double-match specialised forms like `web.search(...)` because
    // both patterns are attempted. Callers expect one entry per unique
    // query string.
    if (out.length > 1) {
      const seen = new Map();
      for (const item of out) {
        const key = `${item.q}||${(item.domains || []).join(',')}`;
        if (!seen.has(key)) seen.set(key, item);
      }
      return [...seen.values()];
    }
    return out;
  }

  /**
   * Is this message a fan-out carrier? We look at role, recipient, and
   * content_type because ChatGPT has used different fields to mark tool
   * calls across versions:
   *   - role: 'tool' (newer)  /  'assistant' with recipient: 'web'
   *   - content_type: 'code', 'search', 'tether_browsing_*'
   */
  function isFanoutMessage(message) {
    if (!message || typeof message !== 'object') return false;
    const role = message.author?.role;
    const recipient = (message.recipient || message.author?.name || '').toLowerCase();
    const ct = (message.content?.content_type || '').toLowerCase();
    if (role === 'tool') return true;
    if (recipient === 'web' || recipient === 'browser' || /browsing|web_search|web_browser/.test(recipient)) return true;
    if (ct === 'code' || ct === 'search' || ct.startsWith('tether_browsing')) return true;
    return false;
  }

  function buildConversationTurns(raw) {
    const orderedNodes = sortConversationPath(raw);
    const turns = [];
    let currentTurn = null;

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
      // Accept any non-user message that could carry a fan-out or source
      // (assistant replies, tool invocations, browsing display blocks).
      // The `isFanoutMessage` check widens the net beyond role=assistant.
      if (role === 'user' || !currentTurn) return;
      if (role !== 'assistant' && !isFanoutMessage(message)) return;

      const text = typeof content.text === 'string' ? content.text : '';
      const ct = content.content_type || '';
      parseFanoutQueries(text, ct).forEach((q) => currentTurn.queries.push(q));

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

      // Fan-out detection — broadened in stage 2.4 to cover tool-role
      // messages, alternate JSON shapes, and multiple call-expression
      // formats. See parseFanoutQueries for the priority order.
      if (text && (content?.content_type === 'code' || isFanoutMessage(message))) {
        const parsed = parseFanoutQueries(text, content?.content_type || '');
        if (parsed.length) {
          hiddenLikely = false;
          parsed.slice(0, 100).forEach((sq) => tryAddQuery(sq.q, sq.domains || []));
        }
      }

      // Collect source items from assistant *and* tool messages. Tool
      // messages occasionally carry the raw search results in their
      // metadata before the assistant turns them into citations.
      if (message.author?.role === 'assistant' || isFanoutMessage(message)) {
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
    // ChatGPT surfaces the conversation's name on the raw payload as
    // `title`. Preferred over the last-turn prompt when present — users
    // think of conversations by the sidebar name, not by whatever they
    // most recently typed.
    const title = sanitizeString(raw.title || '', 200) || '';
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
      title,
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

  /**
   * SERP helpers — shared between popup.js (direct capture from the
   * active tab) and background.js (orchestrated auto-capture triggered
   * by the "Open Google for prompt" handoff).
   */
  function titleCaseEngine(engine) {
    const map = { google: 'Google', bing: 'Bing', duckduckgo: 'DuckDuckGo' };
    return map[engine] || 'Unknown';
  }

  function normalizeFeatureList(features) {
    if (!Array.isArray(features)) return [];
    return [...new Set(features.map((v) => sanitizeString(v, 120)).filter(Boolean))].slice(0, 20);
  }

  function parseGooglePayload(raw, fallbackQuery = '') {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Search payload is invalid.');
    const results = Array.isArray(raw.results) ? raw.results : [];
    const cleanedResults = results.map((item) => ({
      rank: Number(item.rank) || 0,
      title: sanitizeString(item.title, 300),
      url: sanitizeString(item.url, 1000),
      domain: normalizeDomain(item.domain || ''),
      snippet: sanitizeString(item.snippet, 500),
    })).filter((item) => item.rank > 0 && item.title && item.url && item.domain).slice(0, 20);

    const uniqueDomains = [...new Set(cleanedResults.map((item) => item.domain))];
    const engine = sanitizeString(raw.engine || '', 80).toLowerCase() || 'google';
    const serpFeatures = normalizeFeatureList(raw.serpFeatures || []);

    const rawAio = Array.isArray(raw.aioSources) ? raw.aioSources : [];
    const aioSeen = new Set();
    const aioSources = [];
    for (const item of rawAio) {
      const domain = normalizeDomain(item?.domain || '');
      const title = sanitizeString(item?.title || '', 300);
      const url = sanitizeString(item?.url || '', 1500);
      if (!domain || !url) continue;
      const key = `${domain}||${title}`;
      if (aioSeen.has(key)) continue;
      aioSeen.add(key);
      aioSources.push({ domain, title, url });
      if (aioSources.length >= 20) break;
    }

    return {
      engine,
      engineLabel: titleCaseEngine(engine),
      query: sanitizeString(raw.query || fallbackQuery || '', 300),
      captureMode: `Local ${titleCaseEngine(engine)} page`,
      resultCount: cleanedResults.length,
      uniqueDomains,
      serpFeatures,
      results: cleanedResults,
      aioSources,
      capturedAt: new Date().toISOString(),
    };
  }

  /**
   * MAIN-world SERP scraper. Chrome serialises this function to a
   * string and injects it into the target tab — it therefore cannot
   * reference any outer scope (sanitizeString, normalizeDomain, etc.).
   * All helpers are inlined on purpose.
   */
  function fetchSearchResultsInPage() {
    const clean = (value, maxLen = 500) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLen) : '';
    const norm = (host) => clean(host || '', 255).toLowerCase().replace(/^www\./, '');
    try {
      const url = new URL(window.location.href);
      const host = norm(url.hostname);
      const featureSet = new Set();
      const aioSources = [];
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
        if (/^(webcache|translate|images|maps|shopping)\./i.test(domain)) return null;
        return { anchor, h3, href, domain, parsed };
      };

      const nonOrganicClassTokens = [
        'related-question-pair', 'ulsxyf', 'kno-kp', 'g-blk', 'knowledge-panel',
        'kp-blk', 'knavi', 'carousel', 'mnr-c', 'commercial-unit', 'obcontainer',
      ];
      const hasNonOrganicClass = (el) => {
        const cls = typeof el?.className === 'string' ? el.className.toLowerCase() : '';
        if (!cls) return false;
        return nonOrganicClassTokens.some((t) => cls.includes(t));
      };

      if (/(^|\.)google\./i.test(host) && url.pathname.startsWith('/search')) {
        engine = 'google';
        query = clean(document.querySelector('textarea[name="q"], input[name="q"]')?.value || url.searchParams.get('q') || '', 300);
        const rso = document.querySelector('#rso') || document.querySelector('#search');
        if (rso) {
          const containers = Array.from(rso.querySelectorAll(':scope > div'));
          for (const container of containers) {
            if (hasNonOrganicClass(container)) continue;
            if (container.querySelector('[jsname="Cpkphb"], [data-initq], .related-question-pair')) continue;
            const picked = pickOrganicAnchor(container, /(^|\.)google\./i);
            if (!picked) continue;
            const snippet = clean((container.innerText || '').replace(picked.h3.textContent || '', ''), 420);
            pushCandidate(picked.h3.textContent || '', picked.href, picked.domain, snippet);
          }
        }
        const aioSelectors = [
          '#ai-overview', '#AI-Overview', '[data-attrid="AIOverviewTitle"]',
          '[aria-label*="AI Overview" i]', 'div[data-attrid*="overview" i]',
          'div[jscontroller][data-q]',
        ];
        if (hasAny(aioSelectors)) featureSet.add('AI Overview');

        const aioContainer = aioSelectors.map((s) => {
          try { return document.querySelector(s); } catch { return null; }
        }).find(Boolean);
        if (aioContainer) {
          const anchors = aioContainer.querySelectorAll('a[href^="http"]');
          let added = 0;
          for (const a of anchors) {
            if (added >= 20) break;
            const href = a.href || '';
            if (!href) continue;
            let parsed;
            try { parsed = new URL(href); } catch { continue; }
            const domain = norm(parsed.hostname);
            if (!domain || /(^|\.)google\./i.test(domain)) continue;
            const title = clean(a.textContent || a.getAttribute('aria-label') || '', 300);
            if (!title) continue;
            aioSources.push({ title, url: href, domain });
            added += 1;
          }
        }
        if (hasAny([
          '.hgKElc', '.xpdopen .DKV0Md', '[data-attrid="wa:/description"]',
          '.ifM9O', '.kp-blk > div:first-child',
        ])) featureSet.add('Featured Snippet');
        if (hasAny([
          'g-section-with-header[data-hveid]', 'g-news-card',
          'div[data-attrid*="news" i]', '.WlydOe',
        ])) featureSet.add('Top Stories');
        if (hasAny([
          '.commercial-unit-desktop-top', '.sh-dgr__content',
          'g-scrolling-carousel[data-attrid*="shopping" i]', '.pla-unit',
        ])) featureSet.add('Shopping');
        if (hasAny([
          'video-voyager', 'a[href*="youtube.com/watch"]',
          'g-scrolling-carousel[data-attrid*="video" i]', '#videobox',
        ])) featureSet.add('Videos');
        if (hasAny(['.related-question-pair', '[jsname="Cpkphb"]']))
          featureSet.add('People Also Ask');
        if (hasAny([
          '.knowledge-panel', '.kno-kp', '.kp-blk',
          '[data-attrid*="kc:/common/topic"]',
        ])) featureSet.add('Knowledge Panel');
        if (hasAny(['#imagebox_bigimages', 'g-section-with-header g-img', '.isv-r']))
          featureSet.add('Images Pack');
        if (hasAny(['.rllt__details', '[data-attrid*="kc:/location"]']))
          featureSet.add('Local Pack');
      } else if (/(^|\.)bing\.com$/i.test(host)) {
        engine = 'bing';
        query = clean(document.querySelector('textarea[name="q"], input[name="q"], #sb_form_q')?.value || url.searchParams.get('q') || '', 300);
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
        if (hasAny([
          'cib-serp-main', 'div.codex-sky-answer',
          '[class*="copilot" i]', '[class*="cib" i]',
        ])) featureSet.add('AI Answer');
        if (hasAny(['div[data-feedbk-ids*="News"]', '.news-card', 'li.b_ans .b_algoheader'])) featureSet.add('Top Stories');
        if (hasAny(['.slide[data-ptype="Shopping"]', '.pa_content.shop', '[data-partnertag="shopping"]'])) featureSet.add('Shopping');
        if (hasAny(['.vrhdata', '.mc_vtvc', '.video_card'])) featureSet.add('Videos');
        if (hasAny(['.b_ans', '.b_answer', '.b_expPag', '.tbcont'])) featureSet.add('Featured Snippet');
      } else if (host === 'duckduckgo.com' && (url.pathname.startsWith('/') || url.pathname.startsWith('/html'))) {
        engine = 'duckduckgo';
        query = clean(document.querySelector('input[name="q"], textarea[name="q"]')?.value || url.searchParams.get('q') || '', 300);
        const ddgContainers = document.querySelectorAll('[data-testid="result"], .result:not(.result--ad):not(.result--sidebar)');
        ddgContainers.forEach((container) => {
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
        if (hasAny(['article[data-testid="news-results"]', '.news-card', '.module--news'])) featureSet.add('News Module');
        if (hasAny(['.module--videos', '.tile--vid', 'article[data-testid="videos-results"]'])) featureSet.add('Videos');
        if (hasAny(['.module--shopping', 'article[data-testid="shopping-results"]'])) featureSet.add('Shopping');
        if (hasAny(['.ai-assist', '[data-testid="ai-assist"]'])) featureSet.add('AI Answer');
      } else {
        return { error: 'This page is not a supported Google, Bing, or DuckDuckGo results page.' };
      }

      const results = candidates.slice(0, 10).map((item, index) => ({ rank: index + 1, ...item }));
      return { engine, query, serpFeatures: [...featureSet], results, aioSources, pageUrl: window.location.href };
    } catch (error) {
      return { error: `Search page read failed: ${error?.message || 'Unknown error'}` };
    }
  }

  function isSearchEngineUrl(url = '') {
    return /^https:\/\/((([a-z0-9-]+\.)*google\.)|(([a-z0-9-]+\.)*bing\.com)|duckduckgo\.com)/i.test(url);
  }

  /**
   * Storage schema.
   *
   * All persisted keys live here so the popup and the service worker
   * read and write against the same names. Do NOT touch chrome.storage
   * with raw string keys outside of this file — use the helpers below.
   */
  const STORAGE_KEYS = Object.freeze({
    CHATGPT_DATA: 'chatgptInspectorData',
    GOOGLE_DATA: 'googleInspectorData',
    CHATGPT_ARCHIVE: 'chatgptInspectorArchive',
    GOOGLE_ARCHIVE: 'googleInspectorArchive',
    ACTIVE_VIEW: 'inspectorActiveView',
    PENDING_GOOGLE_QUERY: 'pendingGoogleQuery',
    PENDING_GOOGLE_ORCHESTRATION: 'pendingGoogleOrchestration',
    PENDING_CHATGPT_SNAPSHOT: 'pendingChatgptSnapshot',
    HISTORY: 'comparisonHistory',
    LAST_HISTORY_FINGERPRINT: 'lastHistoryFingerprint',
    THEME_MODE: 'inspectorThemeMode',
  });

  // Orchestrations older than this are treated as stale and cleared.
  // Tab loads shouldn't take this long; the TTL just guards against
  // ghost entries left behind by closed tabs or crashed workers.
  const ORCHESTRATION_TTL_MS = 90_000;

  // Archive retention cap per engine. chrome.storage.local quota is ~10MB;
  // an average ChatGPT capture is 20–40KB after parsing, so 200 entries
  // gives headroom without forcing a trim UI in the early releases.
  const ARCHIVE_MAX_ENTRIES = 200;

  function generateCaptureId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  // Content signatures let the auto-capture path avoid appending a
  // duplicate entry when chrome.tabs.onUpdated fires multiple times for
  // the same page load. Popup-initiated captures bypass this check —
  // those are explicit user actions and should always produce a new row.
  function chatgptCaptureSignature(record) {
    if (!record || typeof record !== 'object') return '';
    return [
      record.conversationId || '',
      record.model || '',
      (record.queries || []).length,
      record.citedSources || 0,
      record.totalUrls || 0,
      record.sources?.[0]?.url || '',
      (record.latestUserPrompt || '').slice(0, 80),
    ].join('||');
  }

  function googleCaptureSignature(record) {
    if (!record || typeof record !== 'object') return '';
    return [
      record.engine || '',
      record.query || '',
      record.resultCount || 0,
      record.results?.[0]?.url || '',
      (record.uniqueDomains || []).join(','),
    ].join('||');
  }

  // Serialise concurrent writes within a single execution context so the
  // popup's rapid-fire auto-saves (e.g. switchTab → saveLocalState) don't
  // overlap. chrome.storage is already atomic per-set, but consecutive
  // sets from the same context can still race against one another when
  // one read-modify-writes a collection (history, fingerprint).
  let writeQueue = Promise.resolve();
  function queueStorageWrite(fn) {
    const next = writeQueue.then(() => fn()).catch(() => null);
    writeQueue = next;
    return next;
  }

  const storage = {
    keys: STORAGE_KEYS,

    async get(keys) {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) return {};
      try { return await chrome.storage.local.get(keys); } catch { return {}; }
    },

    async set(patch) {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
      return queueStorageWrite(() => chrome.storage.local.set(patch));
    },

    async remove(keys) {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
      return queueStorageWrite(() => chrome.storage.local.remove(keys));
    },

    // Typed accessors — every persisted record in the extension has a
    // named setter to keep the schema discoverable.
    saveChatgptData(value) { return this.set({ [STORAGE_KEYS.CHATGPT_DATA]: value }); },
    saveGoogleData(value)  { return this.set({ [STORAGE_KEYS.GOOGLE_DATA]: value }); },

    async loadChatgptArchive() {
      const out = await this.get(STORAGE_KEYS.CHATGPT_ARCHIVE);
      return Array.isArray(out?.[STORAGE_KEYS.CHATGPT_ARCHIVE]) ? out[STORAGE_KEYS.CHATGPT_ARCHIVE] : [];
    },

    async loadGoogleArchive() {
      const out = await this.get(STORAGE_KEYS.GOOGLE_ARCHIVE);
      return Array.isArray(out?.[STORAGE_KEYS.GOOGLE_ARCHIVE]) ? out[STORAGE_KEYS.GOOGLE_ARCHIVE] : [];
    },

    // Append a captured ChatGPT snapshot to the archive. Stamps an id and
    // capturedAt if missing, trims to ARCHIVE_MAX_ENTRIES (newest first),
    // and when skipIfUnchanged is set returns the existing head entry
    // instead of appending a content-duplicate. Returns the stored entry.
    async appendChatgptCapture(record, options = {}) {
      if (!record || typeof record !== 'object') return null;
      const { skipIfUnchanged = false, cap } = options;
      const archive = await this.loadChatgptArchive();
      if (skipIfUnchanged && archive.length) {
        const prevSig = chatgptCaptureSignature(archive[0]);
        const nextSig = chatgptCaptureSignature(record);
        if (prevSig && prevSig === nextSig) return archive[0];
      }
      const entry = {
        ...record,
        id: record.id || generateCaptureId(),
        capturedAt: record.capturedAt || new Date().toISOString(),
      };
      const effectiveCap = Number.isFinite(cap) && cap > 0 ? cap : ARCHIVE_MAX_ENTRIES;
      const next = [entry, ...archive].slice(0, effectiveCap);
      await this.set({ [STORAGE_KEYS.CHATGPT_ARCHIVE]: next });
      return entry;
    },

    async appendGoogleCapture(record, options = {}) {
      if (!record || typeof record !== 'object') return null;
      const { skipIfUnchanged = false, cap } = options;
      const archive = await this.loadGoogleArchive();
      if (skipIfUnchanged && archive.length) {
        const prevSig = googleCaptureSignature(archive[0]);
        const nextSig = googleCaptureSignature(record);
        if (prevSig && prevSig === nextSig) return archive[0];
      }
      const entry = {
        ...record,
        id: record.id || generateCaptureId(),
        capturedAt: record.capturedAt || new Date().toISOString(),
      };
      const effectiveCap = Number.isFinite(cap) && cap > 0 ? cap : ARCHIVE_MAX_ENTRIES;
      const next = [entry, ...archive].slice(0, effectiveCap);
      await this.set({ [STORAGE_KEYS.GOOGLE_ARCHIVE]: next });
      return entry;
    },

    // Selective clears — do not touch the single-slot CHATGPT_DATA /
    // GOOGLE_DATA keys so the current view stays intact.
    clearChatgptArchive() { return this.remove(STORAGE_KEYS.CHATGPT_ARCHIVE); },
    clearGoogleArchive()  { return this.remove(STORAGE_KEYS.GOOGLE_ARCHIVE); },

    // Trim the archive in-place to the new cap. Used when the user
    // lowers archiveRetention from the settings UI — the caller should
    // invoke this immediately so the reduction is reflected now, not
    // only on the next capture.
    async trimChatgptArchive(cap) {
      if (!Number.isFinite(cap) || cap < 0) return;
      const archive = await this.loadChatgptArchive();
      if (archive.length <= cap) return;
      await this.set({ [STORAGE_KEYS.CHATGPT_ARCHIVE]: archive.slice(0, cap) });
    },
    async trimGoogleArchive(cap) {
      if (!Number.isFinite(cap) || cap < 0) return;
      const archive = await this.loadGoogleArchive();
      if (archive.length <= cap) return;
      await this.set({ [STORAGE_KEYS.GOOGLE_ARCHIVE]: archive.slice(0, cap) });
    },
    saveActiveView(value)  { return this.set({ [STORAGE_KEYS.ACTIVE_VIEW]: value }); },
    saveHistory(value)     { return this.set({ [STORAGE_KEYS.HISTORY]: value }); },
    saveThemeMode(value)   { return this.set({ [STORAGE_KEYS.THEME_MODE]: value }); },
    savePendingChatgptSnapshot(value) { return this.set({ [STORAGE_KEYS.PENDING_CHATGPT_SNAPSHOT]: value }); },
    savePendingGoogleQuery(value) { return this.set({ [STORAGE_KEYS.PENDING_GOOGLE_QUERY]: value }); },
    clearPendingGoogleQuery()     { return this.remove(STORAGE_KEYS.PENDING_GOOGLE_QUERY); },

    // Orchestration = "the popup just opened a Google tab for query X;
    // service worker should auto-capture when that tabId finishes
    // loading." See background.js for the onUpdated listener.
    savePendingGoogleOrchestration(value) { return this.set({ [STORAGE_KEYS.PENDING_GOOGLE_ORCHESTRATION]: value }); },
    async loadPendingGoogleOrchestration() {
      const out = await this.get(STORAGE_KEYS.PENDING_GOOGLE_ORCHESTRATION);
      const v = out?.[STORAGE_KEYS.PENDING_GOOGLE_ORCHESTRATION];
      return v && typeof v === 'object' ? v : null;
    },
    clearPendingGoogleOrchestration() { return this.remove(STORAGE_KEYS.PENDING_GOOGLE_ORCHESTRATION); },

    // Composite write used by the popup whenever the in-memory state
    // snapshot needs to persist (after a tab switch, a capture, a theme
    // toggle, etc.). Passing only the keys that changed is fine; missing
    // keys are left untouched.
    saveBatch(patch) {
      const allowed = new Set(Object.values(STORAGE_KEYS));
      const filtered = Object.fromEntries(
        Object.entries(patch || {}).filter(([k]) => allowed.has(k))
      );
      if (Object.keys(filtered).length === 0) return Promise.resolve();
      return this.set(filtered);
    },

    // Composite read — returns the full inspector snapshot used by the
    // popup's loadLocalState().
    loadSnapshot() {
      return this.get(Object.values(STORAGE_KEYS));
    },
  };

  /**
   * User preferences persisted in chrome.storage.local under the
   * `aiqiSettings` key. Centralised here so the popup and the service
   * worker agree on defaults and cannot drift.
   */
  const SETTINGS_KEY = 'aiqiSettings';
  const DEFAULT_SETTINGS = Object.freeze({
    autoCaptureChatgpt: true,
    // When true, the Combined tab compares ChatGPT citations and SERP
    // results at the registered-domain (eTLD+1) level — so `en.wiki-
    // pedia.org` and `wikipedia.org` count as the same site. When
    // false, exact hostname matching is used.
    matchByRegisteredDomain: true,
    // Auto-refresh interval in seconds (0 = disabled). Only fires
    // while the popup or full-page dashboard is open. Useful on the
    // full-page dashboard as you iterate on a ChatGPT conversation in
    // another tab: flip this on and the dashboard re-captures on a
    // timer instead of requiring you to click Refresh every minute.
    autoRefreshSeconds: 0,
    // Retention caps. User-visible in the Privacy & safety card.
    // historyRetention applies to the per-query comparison history
    // shown on the History tab. archiveRetention applies to the raw
    // per-engine capture archive (the source of the picker).
    historyRetention: 100,
    archiveRetention: 200,
  });

  async function getSettings() {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return { ...DEFAULT_SETTINGS };
    try {
      const stored = await chrome.storage.local.get(SETTINGS_KEY);
      const value = stored?.[SETTINGS_KEY];
      if (!value || typeof value !== 'object') return { ...DEFAULT_SETTINGS };
      return { ...DEFAULT_SETTINGS, ...value };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  async function setSettings(patch) {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return { ...DEFAULT_SETTINGS };
    const current = await getSettings();
    const next = { ...current, ...(patch || {}) };
    await chrome.storage.local.set({ [SETTINGS_KEY]: next });
    return next;
  }

  /**
   * Gemini payload parser — NOT YET IMPLEMENTED (stage 3.1 scaffold).
   *
   * To implement:
   *   1. Open a Gemini conversation in DevTools and inspect the XHR to
   *      gemini.google.com/_/BardChatUi/data/... (batch-execute). The
   *      relevant response contains a JSON envelope with the full
   *      conversation tree; the schema uses arrays-of-arrays rather
   *      than the tidy {mapping} Chat-GPT style.
   *   2. Extract: turn prompts, model version, fan-out queries (Gemini
   *      surfaces these as "Check it" sources), and cited URLs.
   *   3. Normalise to the same shape parseChatgptPayload returns so the
   *      rest of the popup can consume it unchanged.
   *
   * Until implemented, callers should route Gemini tabs to a
   * "not-yet-implemented" message (see inspectCurrentTab in popup.js).
   */
  function parseGeminiPayload(/* raw, options */) {
    return null;
  }

  /**
   * Stage 6 — derive a hierarchical view from the two flat archives:
   *   { conversations: [...], standaloneGoogle: [...] }
   *
   * One conversation entry per unique chatgpt.conversationId, holding all
   * captures of that conversation (newest-first) plus any Google captures
   * whose `parentConversationId` matches. Google captures with no parent
   * (manual/legacy) land in `standaloneGoogle`.
   *
   * Conversations sort newest-first by their latest ChatGPT snapshot.
   * Within a conversation, both `chatgptCaptures` and `googleCaptures`
   * are newest-first so the picker can pick the latest by index 0.
   */
  function getPairedConversations({ chatgpt = [], google = [] } = {}) {
    const ts = (entry) => {
      const t = entry?.capturedAt ? new Date(entry.capturedAt).getTime() : 0;
      return Number.isFinite(t) ? t : 0;
    };
    const convMap = new Map();
    for (const entry of chatgpt) {
      const convId = entry?.conversationId || '';
      if (!convId) continue;
      const existing = convMap.get(convId);
      if (!existing) {
        convMap.set(convId, {
          conversationId: convId,
          title: entry.title || entry.latestUserPrompt || convId,
          latestChatgptCapture: entry,
          chatgptCaptures: [entry],
          googleCaptures: [],
        });
      } else {
        existing.chatgptCaptures.push(entry);
        if (ts(entry) > ts(existing.latestChatgptCapture)) {
          existing.latestChatgptCapture = entry;
          existing.title = entry.title || entry.latestUserPrompt || existing.title;
        }
      }
    }
    const standaloneGoogle = [];
    for (const g of google) {
      const pid = g?.parentConversationId || '';
      if (pid && convMap.has(pid)) {
        convMap.get(pid).googleCaptures.push(g);
      } else {
        standaloneGoogle.push(g);
      }
    }
    for (const conv of convMap.values()) {
      conv.googleCaptures.sort((a, b) => ts(b) - ts(a));
      conv.chatgptCaptures.sort((a, b) => ts(b) - ts(a));
    }
    standaloneGoogle.sort((a, b) => ts(b) - ts(a));
    const conversations = Array.from(convMap.values()).sort(
      (a, b) => ts(b.latestChatgptCapture) - ts(a.latestChatgptCapture)
    );
    return { conversations, standaloneGoogle };
  }

  const api = Object.freeze({
    sanitizeString,
    normalizeDomain,
    registeredDomain,
    extractMessageText,
    scanForSourceItems,
    getSearchOrigin,
    classifyPromptIntent,
    sortConversationPath,
    aggregateSourceItems,
    buildConversationTurns,
    parseChatgptPayload,
    parseFanoutQueries,
    isFanoutMessage,
    parseGeminiPayload,
    getSettings,
    setSettings,
    DEFAULT_SETTINGS,
    SETTINGS_KEY,
    storage,
    STORAGE_KEYS,
    ARCHIVE_MAX_ENTRIES,
    generateCaptureId,
    chatgptCaptureSignature,
    googleCaptureSignature,
    titleCaseEngine,
    normalizeFeatureList,
    parseGooglePayload,
    fetchSearchResultsInPage,
    isSearchEngineUrl,
    ORCHESTRATION_TTL_MS,
    getPairedConversations,
  });

  root.AIQIShared = api;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
