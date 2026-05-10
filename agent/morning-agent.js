'use strict';

/**
 * Morning Agent — orchestratore del briefing quotidiano
 * Esegue i 9 step definiti nel prompt di sistema per ogni utente.
 * È completamente multi-utente: riceve uid + settings, non usa global state.
 */

const Anthropic = require('@anthropic-ai/sdk');

// ── AI client factory: Gemini > Groq > Anthropic ─────────────────────────────
function makeAIClient({ anthropicApiKey, geminiApiKey, groqApiKey }) {

  // ── Helper Groq inline (usato anche come fallback Gemini) ────────────────────
  async function callGroq(messages, max_tokens) {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) })),
        max_tokens, temperature: 0.3
      }),
      signal: AbortSignal.timeout(60000)
    });
    const data = await resp.json();
    if (data.error) throw new Error(`Groq: ${data.error.message}`);
    return { content: [{ type: 'text', text: data.choices?.[0]?.message?.content || '' }] };
  }

  // ── Gemini Flash — con fallback automatico a Groq su quota esaurita ──────────
  if (geminiApiKey) {
    // Prova tutti i modelli Gemini disponibili in ordine
    const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];
    return {
      _provider: 'gemini',
      messages: {
        create: async ({ messages, max_tokens = 4096 }) => {
          const contents = messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }]
          }));
          // Prova ogni modello Gemini finché uno funziona
          let lastErr = null;
          for (const model of GEMINI_MODELS) {
            try {
              const resp = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
                { method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: max_tokens, temperature: 0.3 } }),
                  signal: AbortSignal.timeout(90000) }
              );
              const data = await resp.json();
              if (data.error) {
                lastErr = new Error(`Gemini/${model}: ${data.error.status} — ${data.error.message}`);
                // Su quota esaurita o modello non trovato, proviamo il successivo
                if (['RESOURCE_EXHAUSTED','NOT_FOUND','PERMISSION_DENIED'].includes(data.error.status)) continue;
                throw lastErr;
              }
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
              return { content: [{ type: 'text', text }] };
            } catch(e) {
              lastErr = e;
              if (e.message?.includes('RESOURCE_EXHAUSTED')) continue;
              throw e;
            }
          }
          // Tutti i modelli Gemini hanno quota 0 → fallback a Groq
          if (groqApiKey) {
            return callGroq(messages, max_tokens);
          }
          throw lastErr || new Error('Gemini: tutti i modelli esauriti');
        }
      }
    };
  }

  // ── Groq — gratis, 14.400 req/giorno, llama-3.3-70b ─────────────────────────
  if (groqApiKey) {
    return {
      _provider: 'groq',
      messages: {
        create: async ({ messages, max_tokens = 4096 }) => {
          const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'llama-3.3-70b-versatile',
              messages: messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) })),
              max_tokens,
              temperature: 0.3
            }),
            signal: AbortSignal.timeout(60000)
          });
          const data = await resp.json();
          if (data.error) throw new Error(`Groq: ${data.error.message}`);
          const text = data.choices?.[0]?.message?.content || '';
          return { content: [{ type: 'text', text }] };
        }
      }
    };
  }

  // ── Anthropic — a pagamento ───────────────────────────────────────────────────
  if (anthropicApiKey) {
    const client = new Anthropic({ apiKey: anthropicApiKey });
    client._provider = 'anthropic';
    return client;
  }

  throw new Error('Configura almeno una API key AI: GEMINI_API_KEY (consigliato), GROQ_API_KEY o ANTHROPIC_API_KEY.');
}

// ── Chiamata AI diretta con fallback automatico Gemini→Groq ──────────────────
async function aiCall({ geminiApiKey, groqApiKey, anthropicApiKey }, prompt, maxTokens = 2048) {
  const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];
  if (geminiApiKey) {
    for (const model of GEMINI_MODELS) {
      try {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3 } }),
            signal: AbortSignal.timeout(90000) }
        );
        const d = await r.json();
        if (d.error) {
          if (['RESOURCE_EXHAUSTED','NOT_FOUND','PERMISSION_DENIED'].includes(d.error.status)) continue;
          throw new Error(`Gemini/${model}: ${d.error.status} — ${d.error.message}`);
        }
        return d.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } catch(e) {
        if (e.message?.includes('RESOURCE_EXHAUSTED') || e.message?.includes('NOT_FOUND')) continue;
        throw e;
      }
    }
  }
  if (groqApiKey) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens, temperature: 0.3 }),
      signal: AbortSignal.timeout(60000)
    });
    const d = await r.json();
    if (d.error) throw new Error(`Groq: ${d.error.message}`);
    return d.choices?.[0]?.message?.content || '';
  }
  throw new Error('Nessuna API AI configurata');
}

// ── Google API low-level helpers ───────────────────────────────────────────────

async function gcalEvents(token, calendarId, timeMin, timeMax) {
  const url = 'https://www.googleapis.com/calendar/v3/calendars/' +
    encodeURIComponent(calendarId) + '/events?' +
    new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '100' });
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
  const d = await r.json();
  if (d.error) throw new Error(`Calendar API error: ${d.error.message}`);
  return d.items || [];
}

async function gmailSearch(token, q, maxResults = 50) {
  const url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages?' +
    new URLSearchParams({ q, maxResults: String(maxResults) });
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
  const d = await r.json();
  if (d.error) throw new Error(`Gmail search error: ${d.error.message}`);
  return d.messages || [];
}

async function gmailGetMessage(token, id) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
  return r.json();
}

async function gmailSend(token, to, subject, htmlBody) {
  const raw = [
    `To: ${to}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    '',
    htmlBody
  ].join('\r\n');
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: Buffer.from(raw).toString('base64url') }),
    signal: AbortSignal.timeout(15000)
  });
  return r.json();
}

async function gcalCreateEvent(token, event) {
  const r = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(8000)
    }
  );
  return r.json();
}

async function driveSearch(token, q, maxResults = 8) {
  const url = 'https://www.googleapis.com/drive/v3/files?' +
    new URLSearchParams({ q, pageSize: String(maxResults), fields: 'files(id,name,webViewLink,mimeType,modifiedTime)' });
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
  const d = await r.json();
  return d.files || [];
}

// ── Message parsing helpers ────────────────────────────────────────────────────

function gmailBody(message, maxLen = 2000) {
  function extract(payload) {
    if (!payload) return '';
    if (payload.body?.data) return Buffer.from(payload.body.data, 'base64').toString('utf8');
    const parts = payload.parts || [];
    const html = parts.find(p => p.mimeType === 'text/html');
    if (html?.body?.data) return Buffer.from(html.body.data, 'base64').toString('utf8');
    const plain = parts.find(p => p.mimeType === 'text/plain');
    if (plain?.body?.data) return Buffer.from(plain.body.data, 'base64').toString('utf8');
    for (const p of parts) { const r = extract(p); if (r) return r; }
    return '';
  }
  return extract(message.payload)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function gmailHeaders(message) {
  const h = {};
  (message.payload?.headers || []).forEach(x => { h[x.name.toLowerCase()] = x.value; });
  return h;
}

function toHHMM(iso, tz = 'Europe/London') {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  } catch { return iso.slice(11, 16); }
}

function dateFullIt(dateStr) {
  try {
    return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('it-IT', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  } catch { return dateStr; }
}

function dayOfWeekIt(dateStr) {
  try {
    return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('it-IT', { weekday: 'long' });
  } catch { return dateStr; }
}

function safeJsonParse(text, fallback = []) {
  if (!text) return fallback;
  // Try direct parse first
  try { return JSON.parse(text.trim()); } catch {}
  // Strip markdown code fences
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try { return JSON.parse(stripped); } catch {}
  // Extract first [...] or {...} block (greedy from last closing bracket)
  const arrMatch = stripped.match(/(\[[\s\S]*\])/);
  if (arrMatch) { try { return JSON.parse(arrMatch[1]); } catch {} }
  const objMatch = stripped.match(/(\{[\s\S]*\})/);
  if (objMatch) { try { return JSON.parse(objMatch[1]); } catch {} }
  // Recovery: extract all complete JSON objects from a potentially truncated array
  // (handles the case where maxOutputTokens cuts the response mid-array)
  const objects = [];
  const objRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)?\}/g;
  let match;
  while ((match = objRegex.exec(stripped)) !== null) {
    try { objects.push(JSON.parse(match[0])); } catch {}
  }
  if (objects.length > 0) return objects;
  return fallback;
}

// ── Token refresh for a specific uid ──────────────────────────────────────────

async function getTokenForUid(uid, { readDBForUid, writeDBForUid, googleClientId, googleClientSecret }) {
  const db = readDBForUid(uid);
  const tokens = db.googleTokens;
  if (!tokens?.refresh_token) throw new Error('Google non connesso. Vai in Impostazioni → Connetti Google.');

  if (!tokens.access_token || Date.now() > (tokens.expires_at || 0) - 300000) {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: tokens.refresh_token,
        client_id: googleClientId,
        client_secret: googleClientSecret,
        grant_type: 'refresh_token'
      })
    });
    const refreshed = await r.json();
    if (!refreshed.access_token) throw new Error('Token refresh fallito: ' + JSON.stringify(refreshed.error || refreshed));
    tokens.access_token = refreshed.access_token;
    tokens.expires_at = Date.now() + (refreshed.expires_in || 3600) * 1000;
    const fresh = readDBForUid(uid);
    fresh.googleTokens = tokens;
    writeDBForUid(uid, fresh);
  }
  return tokens.access_token;
}

// ── Main orchestrator ──────────────────────────────────────────────────────────

async function runMorningAgent({
  uid, date, settings,
  readDBForUid, writeDBForUid,
  googleClientId, googleClientSecret,
  anthropicApiKey,
  geminiApiKey = '',
  groqApiKey = '',
  perplexityApiKey = '',
  force = false,
  log = console.log
}) {
  const logs = [];
  function emit(msg) { logs.push(msg); log(msg); }

  const claude = makeAIClient({ anthropicApiKey, geminiApiKey, groqApiKey });
  emit(`  ↳ AI provider: ${claude._provider || 'anthropic'}`);
  const tz = settings.timezone || 'Europe/London';

  const result = {
    date, events: [], tasks: [], logs,
    summary: { events: 0, tasks: 0, dayType: 'focus', studyItems: 0, reminders: 0, emailSent: false }
  };

  // ── STEP 1: token ─────────────────────────────────────────────────────────────
  emit(`[1/9] Avvio agente per ${date}...`);
  const token = await getTokenForUid(uid, { readDBForUid, writeDBForUid, googleClientId, googleClientSecret });

  const todayStart = new Date(date + 'T00:00:00').toISOString();
  const todayEnd   = new Date(date + 'T23:59:59').toISOString();

  // ── STEP 2: Calendar events ────────────────────────────────────────────────────
  emit('[2/9] Lettura eventi Calendar...');
  const calendarIds = [
    'primary',
    ...(settings.additionalCalendars || [])
  ].filter(id => {
    const excluded = (settings.excludedCalendars || []).map(e => e.toLowerCase());
    return !excluded.some(ex => id.toLowerCase().includes(ex));
  });

  const allRawEvents = [];
  for (const calId of calendarIds) {
    try {
      const evts = await gcalEvents(token, calId, todayStart, todayEnd);
      allRawEvents.push(...evts);
    } catch(e) { emit(`  ↳ Errore calendario ${calId}: ${e.message}`); }
  }

  const seenIds = new Set();
  const calendarEvents = allRawEvents
    .filter(e => e.status !== 'cancelled' && !seenIds.has(e.id) && seenIds.add(e.id))
    .map(e => {
      const startIso = e.start?.dateTime || e.start?.date;
      const endIso   = e.end?.dateTime   || e.end?.date;
      const meetLink =
        e.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri ||
        (e.description || '').match(/https?:\/\/[^\s"<>]*(?:meet\.google|zoom\.us|teams\.microsoft|whereby)[^\s"<>]*/)?.[0] || '';
      return {
        id: e.id,
        title: e.summary || '(Senza titolo)',
        time: `${toHHMM(startIso, tz)} – ${toHHMM(endIso, tz)}`,
        startIso, endIso,
        participants: (e.attendees || []).map(a => a.email).join(', '),
        attendees: e.attendees || [],
        meetLink,
        description: (e.description || '').slice(0, 500),
        location: e.location || '',
        organizer: e.organizer?.email || '',
        quadrant: 'Q1',
        brief: ''
      };
    })
    .sort((a, b) => new Date(a.startIso) - new Date(b.startIso));

  result.events = calendarEvents;
  emit(`  ↳ ${calendarEvents.length} eventi trovati`);

  // ── STEP 2b: Day type ──────────────────────────────────────────────────────────
  const meetingCount = calendarEvents.filter(e =>
    e.participants || /call|meet|riunione|meeting|sync|review|interview/i.test(e.title)
  ).length;
  const dayType = meetingCount === 0 ? 'focus' : meetingCount <= 2 ? 'maker' : 'manager';
  emit(`  ↳ Tipo giornata: ${dayType.toUpperCase()} (${meetingCount} meeting)`);

  // ── STEP 2c/2d: Alessandra + location detection ────────────────────────────────
  const alessandraEvents = [];
  let detectedCity = settings.homeCity || '';
  const spouse = (settings.familyMembers || []).find(f => f.role === 'spouse');

  try {
    const weekAgo = new Date(date + 'T12:00:00Z'); weekAgo.setDate(weekAgo.getDate() - 7);
    const weekFwd = new Date(date + 'T12:00:00Z'); weekFwd.setDate(weekFwd.getDate() + 7);
    const extEvts = await gcalEvents(token, 'primary', weekAgo.toISOString(), weekFwd.toISOString());

    const LONDON = /\b(lhr|lgw|ltn|heathrow|gatwick|stansted|london)\b/i;
    const MILAN  = /\b(mxp|lin|bgy|malpensa|linate|orio|milan(?:o)?)\b/i;
    for (const e of extEvts) {
      const text = (e.summary || '') + ' ' + (e.description || '');
      if (LONDON.test(text)) { detectedCity = 'London, UK'; break; }
      if (MILAN.test(text))  { detectedCity = 'Milan, Italy'; break; }
    }
    // Fallback: inferisci città da timezone se ancora non rilevata
    if (!detectedCity) {
      if (/europe\/(rome|milan|paris|berlin|madrid|brussels|amsterdam|vienna|zurich)/i.test(tz))
        detectedCity = 'Milano, Italy';
      else if (/europe\/(london|dublin)/i.test(tz))
        detectedCity = 'London, UK';
      if (detectedCity) emit(`  ↳ Posizione inferita da timezone: ${detectedCity} (puoi sovrascriverla in Impostazioni → Home City)`);
    } else {
      emit(`  ↳ Posizione: ${detectedCity}`);
    }

    if (spouse) {
      const spouseName = spouse.name.toLowerCase();
      for (const e of extEvts) {
        const start = e.start?.dateTime || e.start?.date || '';
        if (!start.startsWith(date)) continue;
        const text = (e.summary || '').toLowerCase();
        if (text.includes(spouseName)) {
          alessandraEvents.push({
            time: toHHMM(e.start?.dateTime || e.start?.date, tz),
            title: e.summary,
            isAway: /fuori|viaggio|riunione|impegno|away|travel|office/i.test(text)
          });
        }
      }
    }
  } catch(e) { emit(`  ↳ Errore step 2c/2d: ${e.message}`); }

  // ── STEP 2e: Health data check ─────────────────────────────────────────────────
  const dbNow = readDBForUid(uid);
  const health = dbNow.days?.[date]?.health || null;
  let healthRec = null;

  if (health) {
    const s = health.sleepScore || 0;
    const stress = health.stressLevel || 'low';
    const hrv = health.hrv || 999;
    if (s < 60 || stress === 'high') {
      healthRec = {
        activity: 'Giornata leggera — camminata 20 min, niente sport intenso',
        food: 'Colazione ricca (avena, frutta, proteine), evita zuccheri. Idratazione abbondante.',
        mindset: 'Rimanda decisioni strategiche. Blocchi di focus brevi (25 min max).'
      };
    } else if (s < 76 || stress === 'medium') {
      healthRec = {
        activity: 'Camminata o yoga — mantieni movimento moderato',
        food: 'Pasto bilanciato, privilegia verdure e proteine magre',
        mindset: "Buona giornata, gestisci le priorità con attenzione all'energia pomeridiana"
      };
    } else {
      healthRec = {
        activity: 'In forma — ottimo per nuoto, palestra o corsa',
        food: 'Alimentazione normale, mantieni idratazione',
        mindset: 'Giornata ottimale per decisioni importanti e lavoro profondo'
      };
    }
    if (hrv < 35) healthRec.mindset += ' HRV basso: priorità al recupero.';

    // Persist recommendations
    try {
      const hDb = readDBForUid(uid);
      if (hDb.days?.[date]) {
        hDb.days[date].health = { ...hDb.days[date].health, recommendations: healthRec };
        writeDBForUid(uid, hDb);
      }
    } catch(e) { /* non bloccante */ }

    emit('  ↳ Dati salute trovati, raccomandazioni generate');
  } else {
    emit('  ↳ Dati salute non disponibili (Apple Shortcut non ancora eseguito)');
  }

  // ── STEP 3: Gmail — tutte le categorie ────────────────────────────────────────
  emit('[3/9] Lettura Gmail (tutte le categorie)...');
  if (force && dbNow.days?.[date]?.tasks) {
    dbNow.days[date].tasks = (dbNow.days[date].tasks || []).filter(t => !t.id.startsWith('mail-'));
    emit('  ↳ Force refresh: task email precedenti rimossi');
  }
  const existingTaskIds = new Set((dbNow.days?.[date]?.tasks || []).map(t => t.id));

  // Scarica da tutte le categorie Gmail in parallelo (100 per categoria)
  const GMAIL_CATEGORIES = [
    { label: 'Principale',   q: 'in:inbox category:primary',    max: 100 },
    { label: 'Aggiornamenti',q: 'in:inbox category:updates',    max: 100 },
    { label: 'Promozioni',   q: 'in:inbox category:promotions', max: 50  },
    { label: 'Social',       q: 'in:inbox category:social',     max: 50  },
    { label: 'Forum',        q: 'in:inbox category:forums',     max: 30  },
  ];

  const allRawByCategory = {};
  await Promise.all(GMAIL_CATEGORIES.map(async cat => {
    try {
      const msgs = await gmailSearch(token, cat.q, cat.max);
      allRawByCategory[cat.label] = msgs;
      emit(`  ↳ ${cat.label}: ${msgs.length} email`);
    } catch(e) { emit(`  ↳ ${cat.label}: errore (${e.message?.slice(0,60)})`); allRawByCategory[cat.label] = []; }
  }));

  // Scarica solo gli header (From, Subject, Date) di tutte le email non già elaborate
  // Gemini 2.0 Flash gestisce 1M token → nessun limite pratico
  const emailHeaders = [];
  let skippedExisting = 0;
  const seenMsgIds = new Set();

  for (const [catLabel, msgs] of Object.entries(allRawByCategory)) {
    for (const msg of msgs) {
      if (seenMsgIds.has(msg.id)) continue;
      seenMsgIds.add(msg.id);
      if (existingTaskIds.has(`mail-${msg.id}`)) { skippedExisting++; continue; }
      try {
        const r = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) }
        );
        const m = await r.json();
        const hdrs = m.payload?.headers || [];
        emailHeaders.push({
          id: msg.id,
          category: catLabel,
          from: hdrs.find(h => h.name === 'From')?.value || '',
          subject: hdrs.find(h => h.name === 'Subject')?.value || '(no subject)',
          date: hdrs.find(h => h.name === 'Date')?.value || ''
        });
      } catch { /* skip */ }
    }
  }
  if (skippedExisting > 0) emit(`  ↳ ${skippedExisting} email già elaborate (skip)`);
  emit(`  ↳ Totale: ${emailHeaders.length} email da analizzare`);

  const aiKeys = { geminiApiKey, groqApiKey, anthropicApiKey };

  // ── Analisi email Principale → Task ────────────────────────────────────────
  // Solo la categoria Principale viene trasformata in task.
  // Le altre categorie (Aggiornamenti, Social, Promozioni, Forum) vanno in Crescita (STEP 3b).
  let emailTasks = [];
  const principaleHeaders = emailHeaders.filter(e => e.category === 'Principale');
  emit(`  ↳ ${principaleHeaders.length} email Principale trovate`);
  if (principaleHeaders.length > 0) {
    const toAnalyze = principaleHeaders.slice(0, 100);  // fino a 100 email Principale
    emit(`  ↳ Scarico corpo di ${toAnalyze.length} email Principale...`);

    const emailsWithBody = [];
    for (const e of toAnalyze) {
      try {
        const full = await gmailGetMessage(token, e.id);
        emailsWithBody.push({ ...e, body: gmailBody(full, 600) });
      } catch { emailsWithBody.push({ ...e, body: '' }); }
    }

    emit(`  ↳ Analisi Gemini di ${emailsWithBody.length} email...`);
    try {
      const emailList = emailsWithBody.map((e, i) =>
        `EMAIL_${i+1} [id:${e.id}] [${e.category}]\nDa: ${e.from}\nOggetto: ${e.subject}\nData: ${e.date}\n${e.body}`
      ).join('\n\n---\n\n');

      const text = await aiCall(aiKeys,
        `Sei l'assistente personale di ${settings.userName||'Marco'} (${settings.primaryEmail||''}).
Data oggi: ${date}.

Analizza TUTTE queste email e per ognuna crea un task JSON. Assegna un quadrante in base a urgenza e importanza.
Per le email Principale assegna Q1 o Q2. Per Aggiornamenti usa Q3 o Q4. Per Promozioni/Social usa Q4 a meno che non siano rilevanti.

Formato JSON per ogni email (IMPORTANTE: id = solo il codice alfanumerico tra [id:...], NON le parentesi):
{"id":"SOLO_IL_CODICE_ID","title":"titolo conciso max 60 car","category":"categoria","quadrant":"Q1|Q2|Q3|Q4","brief":"Descrizione 1-2 frasi","actionPoints":["Azione 1","Azione 2"],"from":"mittente"}

Rispondi SOLO con array JSON. Sii conciso nel brief (1-2 frasi max) per non superare il limite di lunghezza.

EMAIL:\n${emailList}`, 32768);

      emit(`  ↳ Gemini risposta (prime 200 car): ${text.slice(0, 200)}`);
      emailTasks = safeJsonParse(text, []);
      if (!Array.isArray(emailTasks)) {
        emit(`  ↳ WARN: risposta non parseable come array`);
        emailTasks = [];
      }
      emit(`  ↳ ✅ ${emailTasks.length} task parsati da ${emailsWithBody.length} email`);
    } catch(e) { emit(`  ↳ Errore analisi: ${e.message?.slice(0, 300)}`); }
  } else {
    emit(`  ↳ Nessuna email Principale da analizzare`);
  }

  result.tasks = emailTasks.map(t => ({
    id: `mail-${t.id}`,
    title: t.title || t.subject || 'Email',
    due: `${t.category || 'Gmail'} · ${t.from || ''}`,
    quadrant: t.quadrant || 'Q2',
    brief: t.brief || '',
    link: `https://mail.google.com/mail/u/0/#inbox/${t.id}`,
    actionPoints: Array.isArray(t.actionPoints) ? t.actionPoints : []
  }));

  emit(`  ↳ ${result.tasks.length} task email identificati`);

  // ── STEP 3b: Crescita — Aggiornamenti + Social + Promozioni + Forum ──────────
  // Tutte le email non-Principale vengono analizzate separatamente e messe in Crescita.
  emit('[3b] Analisi email per sezione Crescita (Aggiornamenti, Social, Promozioni, Forum)...');
  const studyItems = [];
  const growthCats = ['Aggiornamenti', 'Promozioni', 'Social', 'Forum'];
  const growthHeaders = emailHeaders.filter(e => growthCats.includes(e.category));
  emit(`  ↳ ${growthHeaders.length} email totali (Aggiornamenti: ${(allRawByCategory['Aggiornamenti']||[]).length} · Social: ${(allRawByCategory['Social']||[]).length} · Promozioni: ${(allRawByCategory['Promozioni']||[]).length} · Forum: ${(allRawByCategory['Forum']||[]).length})`);

  if (growthHeaders.length > 0) {
    // Priorità: prima Aggiornamenti, poi Social, poi Promozioni, poi Forum
    const GROWTH_ORDER = ['Aggiornamenti', 'Social', 'Promozioni', 'Forum'];
    const sortedGrowth = [...growthHeaders].sort((a, b) =>
      GROWTH_ORDER.indexOf(a.category) - GROWTH_ORDER.indexOf(b.category)
    );
    const toStudy = sortedGrowth.slice(0, 80);
    emit(`  ↳ Scarico corpo di ${toStudy.length} email per Crescita...`);

    const studyWithBody = [];
    for (const e of toStudy) {
      try {
        const full = await gmailGetMessage(token, e.id);
        studyWithBody.push({ ...e, body: gmailBody(full, 400) });
      } catch { studyWithBody.push({ ...e, body: '' }); }
    }

    try {
      const interests = (settings.interests || ['business', 'AI', 'leadership', 'startup', 'tecnologia']).join(', ');
      const emailList = studyWithBody.map((e, i) =>
        `EMAIL_${i+1} [id:${e.id}] [${e.category}]\nDa: ${e.from}\nOggetto: ${e.subject}\n${e.body}`
      ).join('\n\n---\n\n');

      const studyText = await aiCall(aiKeys,
        `Sei l'assistente personale di ${settings.userName||'Marco'}.
Interessi: ${interests}.
Data oggi: ${date}.

Analizza TUTTE queste email da Aggiornamenti, Social e Promozioni.
Per OGNI email crea un record JSON:
{"id":"SOLO_IL_CODICE_ID","title":"titolo o oggetto email","summary":"sintesi 1-2 frasi del contenuto","source":"nome newsletter o mittente","recommendation":"leggi|acquista|ignora|salva|iscriviti","category":"AI|business|tool|promo|social|news|evento|marketing|finanza|altro","priority":"high|medium|low","gmailCategory":"categoria Gmail originale"}

HIGH = molto rilevante per gli interessi di Marco.
MEDIUM = interessante ma non urgente.
LOW = spam, promozioni banali, notifiche automatiche.

Includi TUTTE le email nell'array JSON. Rispondi SOLO con array JSON.

EMAIL:\n${emailList}`, 32768);

      emit(`  ↳ Gemini Crescita risposta (prime 200 car): ${studyText.slice(0, 200)}`);
      const parsed = safeJsonParse(studyText, []);
      for (const s of parsed) {
        if (!s.id) continue;
        studyItems.push({
          id: s.id,
          title: s.title || s.from || 'Aggiornamento',
          summary: s.summary || '',
          source: s.source || s.from || '',
          recommendation: s.recommendation || '',
          category: s.category || 'altro',
          gmailCategory: s.gmailCategory || '',
          priority: s.priority || 'medium',
          link: `https://mail.google.com/mail/u/0/#inbox/${s.id}`,
          done: false
        });
      }
      // Ordina: high → medium → low
      studyItems.sort((a, b) => {
        const P = { high: 0, medium: 1, low: 2 };
        return (P[a.priority] ?? 1) - (P[b.priority] ?? 1);
      });
      emit(`  ↳ ✅ ${studyItems.length} item per Crescita (${studyItems.filter(s=>s.priority==='high').length} high · ${studyItems.filter(s=>s.priority==='medium').length} medium · ${studyItems.filter(s=>s.priority==='low').length} low)`);
    } catch(e) { emit(`  ↳ Errore 3b: ${e.message?.slice(0, 300)}`); }
  } else {
    emit('  ↳ Nessuna email non-Principale trovata per Crescita');
  }

  // ── STEP 3c: School/child alerts ───────────────────────────────────────────────
  const tommasoAlerts = [];
  const schoolChild = (settings.familyMembers || []).find(f => f.role === 'child');
  if (schoolChild) {
    emit(`[3c] Comunicazioni scuola per ${schoolChild.name}...`);
    try {
      const q = [
        schoolChild.schoolEmail ? `from:${schoolChild.schoolEmail}` : '',
        schoolChild.school ? `"${schoolChild.school}"` : '',
        schoolChild.name,
        'classe OR colloquio OR gita OR recita OR circolare OR comunicazione'
      ].filter(Boolean).join(' OR ');

      const schoolMsgs = await gmailSearch(token, q, 10);
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
      for (const msg of schoolMsgs.slice(0, 5)) {
        const full = await gmailGetMessage(token, msg.id);
        const h = gmailHeaders(full);
        const msgDate = new Date(h.date || 0);
        if (msgDate < weekAgo) continue;
        tommasoAlerts.push({
          id: msg.id,
          title: h.subject || '(no subject)',
          detail: gmailBody(full, 300),
          priority: /urgent|important|scadenza|urgente/i.test(h.subject || '') ? 'high' : 'normal',
          link: `https://mail.google.com/mail/u/0/#inbox/${msg.id}`
        });
      }
      emit(`  ↳ ${tommasoAlerts.length} alert scuola`);
    } catch(e) { emit(`  ↳ Errore 3c: ${e.message}`); }
  }

  // ── STEP 5: Meeting briefs ─────────────────────────────────────────────────────
  emit('[5/9] Generazione brief riunioni...');
  const meetingEvts = calendarEvents.filter(e =>
    e.attendees?.length > 1 || /call|meet|riunione|meeting|sync|review|interview/i.test(e.title)
  );

  for (const evt of meetingEvts.slice(0, 5)) {
    try {
      let emailCtx = '';
      const extAttendees = evt.attendees.filter(a => !a.self && a.email);
      for (const att of extAttendees.slice(0, 2)) {
        const msgs = await gmailSearch(token, `from:${att.email} OR to:${att.email}`, 5);
        for (const msg of msgs.slice(0, 3)) {
          const full = await gmailGetMessage(token, msg.id);
          const h = gmailHeaders(full);
          emailCtx += `[Email con ${att.email}] ${h.subject || ''}: ${gmailBody(full, 300)}\n\n`;
        }
      }

      // Drive files for this meeting
      let driveCtx = '';
      try {
        const driveQ = evt.attendees.slice(0, 1).map(a => a.email?.split('@')[0] || '').filter(Boolean).join(' OR ');
        if (driveQ) {
          const files = await driveSearch(token, `fullText contains '${driveQ}'`, 3);
          driveCtx = files.map(f => `- ${f.name}: ${f.webViewLink}`).join('\n');
        }
      } catch(e) { /* Drive opzionale */ }

      const resp = await claude.messages.create({
        model: claude._provider === 'gemini' ? 'gemini-2.5-flash' : claude._provider === 'groq' ? 'llama-3.3-70b-versatile' : 'claude-3-5-sonnet-20241022',
        max_tokens: 700,
        messages: [{
          role: 'user',
          content: `Genera un meeting brief conciso (max 300 parole) per questa riunione di ${settings.userName || 'Marco'}.

RIUNIONE: ${evt.title}
ORARIO: ${evt.time}
PARTECIPANTI: ${evt.participants || 'interno'}
DESCRIZIONE: ${evt.description || 'nessuna'}
LINK: ${evt.meetLink || evt.location || 'non specificato'}

CONTESTO EMAIL RECENTE:
${emailCtx || '(nessuna email recente trovata con i partecipanti)'}

${driveCtx ? `DOCUMENTI DRIVE:\n${driveCtx}` : ''}

Struttura: CONTESTO → OBIETTIVO → PUNTI APERTI (2-3) → ACTION PRE-MEETING (2-3).
Rispondi in italiano.`
        }]
      });
      evt.brief = resp.content[0]?.text || '';
      emit(`  ↳ Brief generato: ${evt.title}`);
    } catch(e) {
      evt.brief = `${evt.title}\n${evt.time}\nPartecipanti: ${evt.participants}`;
    }
  }

  // ── STEP 5b: Drive files for Q1/Q2 tasks ──────────────────────────────────────
  const driveFiles = [];
  try {
    const topTasks = result.tasks.filter(t => t.quadrant === 'Q1' || t.quadrant === 'Q2').slice(0, 3);
    for (const task of topTasks) {
      const keywords = task.title.replace(/[^\w\s]/g, '').split(' ').filter(w => w.length > 4).slice(0, 2).join(' ');
      if (!keywords) continue;
      const files = await driveSearch(token, `fullText contains '${keywords}'`, 2);
      for (const f of files) {
        driveFiles.push({ name: f.name, link: f.webViewLink, relatedTask: task.title });
      }
    }
  } catch(e) { /* Drive opzionale */ }

  // ── STEP 6: Create calendar reminders for dated action points ─────────────────
  emit('[6/9] Creazione reminder in Calendar...');
  const createdReminders = [];
  const DATE_RE = /\b(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?|\d{4}-\d{2}-\d{2}|(dom|lun|mar|mer|gio|ven|sab|prossim\w+|next)\s+\w+)\b/i;

  for (const task of result.tasks.filter(t => t.quadrant === 'Q1').slice(0, 5)) {
    const datedAps = (task.actionPoints || []).filter(ap => DATE_RE.test(ap));
    for (const ap of datedAps.slice(0, 1)) {
      try {
        const d = new Date(date + 'T09:00:00');
        d.setDate(d.getDate() + 1);
        const evt = {
          summary: `⚡ ${task.title.slice(0, 60)}`,
          description: `${ap}\n\nLink: ${task.link}`,
          start: { dateTime: d.toISOString(), timeZone: tz },
          end:   { dateTime: new Date(d.getTime() + 1800000).toISOString(), timeZone: tz },
          reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 30 }] }
        };
        const created = await gcalCreateEvent(token, evt);
        if (created.id) {
          createdReminders.push({ eventId: created.id, taskTitle: task.title });
          emit(`  ↳ Reminder creato: ${task.title}`);
        }
      } catch(e) { emit(`  ↳ Errore reminder: ${e.message}`); }
    }
  }

  // ── STEP 6b: Networking events via Gemini + Google Search Grounding ────────────
  emit('[6b] Ricerca eventi networking...');
  const networkEvents = [];
  if (detectedCity && geminiApiKey) {
    try {
      const isLondon = /london/i.test(detectedCity);
      const weekFwd = new Date(date + 'T12:00:00Z'); weekFwd.setDate(weekFwd.getDate() + 7);
      const prompt = `Find 5 real upcoming networking events for entrepreneurs, founders and startup people in ${detectedCity} happening between ${date} and ${weekFwd.toISOString().slice(0,10)}.
Include: tech meetups, startup events, pitch nights, founder dinners, accelerator demo days, VC events.
For each event return a JSON object with these exact fields:
{"title":"event name","date":"dd Month yyyy","time":"HH:MM or TBD","description":"one sentence about the event","link":"https://... registration or info page","location":"venue name or area","tags":["startup","tech"]}
Return ONLY a valid JSON array. No text before or after.`;

      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            tools: [{ googleSearch: {} }],
            generationConfig: { maxOutputTokens: 2048, temperature: 0.1 }
          }),
          signal: AbortSignal.timeout(25000)
        }
      );
      const d = await r.json();
      if (d.error) {
        const code = d.error.code || '';
        const msg  = d.error.message || '';
        if (code === 429 || msg.includes('quota') || msg.includes('Quota')) {
          emit(`  ↳ ⚠️ Gemini quota esaurita (429) — abilita billing su https://ai.dev o usa una nuova API key`);
        } else {
          emit(`  ↳ ⚠️ Gemini errore ${code}: ${msg.slice(0, 200)}`);
        }
      } else {
        const text = d.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        const parsed = safeJsonParse(text, []);
        if (Array.isArray(parsed) && parsed.length > 0) {
          networkEvents.push(...parsed.slice(0, 5));
          emit(`  ↳ ✅ ${networkEvents.length} eventi trovati in ${detectedCity}`);
        } else {
          emit(`  ↳ Nessun evento strutturato trovato (risposta: ${text.slice(0,120)})`);
        }
      }
    } catch(e) { emit(`  ↳ Errore networking: ${e.message}`); }
  } else if (!detectedCity) {
    emit('  ↳ Posizione non rilevata (aggiungi homeCity in Impostazioni o voli nel Calendar)');
  } else {
    emit('  ↳ Gemini API key non configurata');
  }

  // ── STEP 6c: Local activities via Gemini + Google Search Grounding ────────────
  emit('[6c] Ricerca attività locali...');
  const localActivities = [];
  if (detectedCity && geminiApiKey) {
    try {
      const spouseName  = (settings.familyMembers || []).find(f => f.role === 'spouse')?.name || 'partner';
      const childMember = (settings.familyMembers || []).find(f => f.role === 'child');
      const childName   = childMember?.name || 'figlio';
      const childAge    = childMember?.age  || 8;
      const isLondon    = /london/i.test(detectedCity);
      const lang        = isLondon ? 'English' : 'Italian';

      // Split into 2 calls of 6 items to avoid truncation
      const activityBatches = [
        { types: `- 3 type "solo": interesting solo activities (museums, walks, experiences, cultural events)\n- 3 type "couple": romantic or fun things to do with ${spouseName} (nice restaurants, experiences, walks)`, label: 'solo+couple' },
        { types: `- 3 type "family": kid-friendly activities for a ${childAge}-year-old named ${childName} (parks, museums, fun places)\n- 3 type "restaurant": restaurant recommendations (mix: romantic, family-friendly, solo lunch spot)`, label: 'family+restaurant' }
      ];
      const fields = `{"type":"solo|couple|family|restaurant","title":"name","description":"1 sentence","category":"food|culture|outdoor|sport|art|entertainment|nature","location":"area or address","price":"€|€€|€€€","why":"why recommended","link":"https://..."}`;

      for (const batch of activityBatches) {
        const prompt = `Suggest 6 local activities in ${detectedCity} this week. Return a JSON array in ${lang}:\n${batch.types}\nEach item: ${fields}\nReal operating places only. Return ONLY a valid JSON array, no markdown.`;
        try {
          const r = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                tools: [{ googleSearch: {} }],
                generationConfig: { maxOutputTokens: 2000, temperature: 0.3 }
              }),
              signal: AbortSignal.timeout(30000)
            }
          );
          const d = await r.json();
          if (d.error) {
            const code = d.error.code || ''; const msg = d.error.message || '';
            if (code === 429 || msg.includes('quota') || msg.includes('Quota'))
              emit(`  ↳ ⚠️ Gemini quota esaurita (429) — abilita billing su https://ai.dev`);
            else emit(`  ↳ ⚠️ Gemini errore ${code}: ${msg.slice(0,200)}`);
          } else {
            const text = d.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
            const parsed = safeJsonParse(text, []);
            if (Array.isArray(parsed) && parsed.length > 0) {
              localActivities.push(...parsed);
              emit(`  ↳ ✅ batch ${batch.label}: ${parsed.length} attività`);
            } else {
              emit(`  ↳ Batch ${batch.label}: nessun risultato (${text.slice(0,80)})`);
            }
          }
        } catch(e) { emit(`  ↳ Errore batch ${batch.label}: ${e.message}`); }
      }
      if (localActivities.length > 0) {
        emit(`  ↳ ✅ ${localActivities.length} attività totali trovate in ${detectedCity}`);
      } else {
        emit(`  ↳ Nessuna attività trovata`);
      }
    } catch(e) { emit(`  ↳ Errore attività locali: ${e.message?.slice(0,100)}`); }
  } else if (!detectedCity) {
    emit('  ↳ Posizione non rilevata — configura homeCity in Impostazioni');
  } else {
    emit('  ↳ Gemini API key non configurata');
  }

  // ── STEP 7: Populate tracker ───────────────────────────────────────────────────
  emit('[7/9] Salvataggio nel tracker...');
  const saveDb = readDBForUid(uid);
  if (!saveDb.days) saveDb.days = {};
  if (!saveDb.days[date]) saveDb.days[date] = { events: [], tasks: [], items: {}, reflection: '', briefing: '' };
  const day = saveDb.days[date];

  // If force=true, clear old mail tasks and their items from saveDb too
  if (force) {
    const mailTaskIds = (day.tasks || []).filter(t => t.id.startsWith('mail-')).map(t => t.id);
    day.tasks = (day.tasks || []).filter(t => !t.id.startsWith('mail-'));
    for (const id of mailTaskIds) delete day.items[id];
    emit(`  ↳ Force: rimossi ${mailTaskIds.length} task email dal DB per sostituzione`);
  }

  day.briefing = `${dayType === 'focus' ? '🧘' : dayType === 'maker' ? '🛠️' : '👔'} ${dayType.charAt(0).toUpperCase() + dayType.slice(1)} Day · ${calendarEvents.length} eventi · ${result.tasks.length} mail da gestire`;

  for (const evt of calendarEvents) {
    if (!day.events.find(e => e.id === evt.id)) {
      day.events.push({ id: evt.id, title: evt.title, time: evt.time, participants: evt.participants, meetLink: evt.meetLink, quadrant: 'Q1', link: `https://calendar.google.com/calendar/r/eventedit/${evt.id}` });
    }
    if (!day.items[evt.id]) {
      day.items[evt.id] = { done: false, comment: '', actionPoints: [], quadrant: 'Q1', type: 'event', brief: evt.brief || '' };
    } else if (evt.brief) {
      day.items[evt.id].brief = evt.brief;
    }
  }

  for (const task of result.tasks) {
    if (!day.tasks.find(t => t.id === task.id)) {
      day.tasks.push({ id: task.id, title: task.title, due: task.due, quadrant: task.quadrant, brief: task.brief, link: task.link });
      day.items[task.id] = {
        done: false, comment: '', quadrant: task.quadrant, type: 'task',
        actionPoints: task.actionPoints.map((t, i) => ({ id: `ap-${Date.now()}-${i}`, text: t, done: false }))
      };
    }
  }

  // Growth brief
  let growthBrief = '';
  try {
    const top3 = result.tasks.filter(t => t.quadrant === 'Q1' || t.quadrant === 'Q2').slice(0, 3).map(t => t.title).join(', ');
    const sleepInfo = health ? `Sonno ${health.sleepScore || '?'}/100, Stress: ${health.stressLevel || '?'}` : 'Dati salute non disponibili';
    const resp = await claude.messages.create({
      model: claude._provider === 'gemini' ? 'gemini-2.5-flash' : claude._provider === 'groq' ? 'llama-3.3-70b-versatile' : 'claude-3-5-sonnet-20241022',
      max_tokens: 350,
      messages: [{
        role: 'user',
        content: `Scrivi un coaching brief motivante di 3-5 frasi per ${settings.userName || 'Marco'}.
Tipo giornata: ${dayType} (${meetingCount} riunioni). ${sleepInfo}.
Priorità del giorno: ${top3 || 'nessuna specificata'}.
${studyItems.length ? `Newsletter rilevanti: ${studyItems.slice(0, 2).map(s => s.title).join(', ')}` : ''}
In italiano, concreto e azionabile.`
      }]
    });
    growthBrief = resp.content[0]?.text || '';
  } catch(e) { growthBrief = `Oggi è una ${dayType} day. Buona giornata, ${settings.userName || 'Marco'}!`; }

  saveDb.days[date].insights = { dayType, growthBrief, driveFiles, studyItems };
  saveDb.days[date].family          = { alessandraEvents, tommasoAlerts };
  saveDb.days[date].network         = { city: detectedCity, events: networkEvents };
  saveDb.days[date].localActivities = { city: detectedCity, items: localActivities };
  saveDb.googleLastSync = new Date().toISOString();
  writeDBForUid(uid, saveDb);
  emit('  ↳ Dati salvati');

  // ── STEP 8: Send briefing email ────────────────────────────────────────────────
  const briefingEmail = settings.briefingEmail;
  if (briefingEmail && settings.sendBriefingEmail !== false) {
    emit(`[8/9] Invio email a ${briefingEmail}...`);
    const dayTypeLabel = { focus: '🧘 Focus Day', maker: '🛠️ Maker Day', manager: '👔 Manager Day' }[dayType];
    const subject = `☀️ Briefing ${dayOfWeekIt(date)}, ${date} — ${calendarEvents.length} impegni · ${result.tasks.length} mail · ${dayTypeLabel}`;
    const html = buildEmailHtml({
      date, dayType, dayTypeLabel, health, healthRec,
      calendarEvents, tasks: result.tasks,
      studyItems, alessandraEvents, tommasoAlerts,
      networkEvents, detectedCity, createdReminders, growthBrief,
      userName: settings.userName || 'Marco',
      appUrl: process.env.APP_URL || 'http://localhost:3000'
    });
    try {
      await gmailSend(token, briefingEmail, subject, html);
      result.summary.emailSent = true;
      emit('  ↳ Email inviata');
    } catch(e) { emit(`  ↳ Errore invio email: ${e.message}`); }
  } else {
    emit('[8/9] Email briefing disabilitata nelle impostazioni (o email non configurata)');
  }

  // ── STEP 9: Summary ───────────────────────────────────────────────────────────
  result.summary = {
    events: calendarEvents.length,
    tasks: result.tasks.length,
    dayType,
    studyItems: studyItems.length,
    tommasoAlerts: tommasoAlerts.length,
    reminders: createdReminders.length,
    emailSent: result.summary.emailSent,
    city: detectedCity,
    health: health ? { sleepScore: health.sleepScore, hrv: health.hrv, stressLevel: health.stressLevel } : null
  };

  emit(`[9/9] ✅ Completato — ${calendarEvents.length} eventi · ${result.tasks.length} task · ${dayType}`);
  return { ...result, logs };
}

// ── Email HTML builder ─────────────────────────────────────────────────────────

function buildEmailHtml({ date, dayType, dayTypeLabel, health, healthRec, calendarEvents, tasks, studyItems, alessandraEvents, tommasoAlerts, networkEvents, detectedCity, createdReminders, growthBrief, userName, appUrl }) {
  const S = `background:#111113;color:#e5e7eb;font-family:-apple-system,system-ui,sans-serif;max-width:680px;margin:0 auto;padding:24px;`;
  const Q = {
    Q1: tasks.filter(t => t.quadrant === 'Q1'),
    Q2: tasks.filter(t => t.quadrant === 'Q2'),
    Q3: tasks.filter(t => t.quadrant === 'Q3'),
    Q4: tasks.filter(t => t.quadrant === 'Q4')
  };

  const card = (content) => `<div style="background:#1a1a1c;border:1px solid #2e2e32;border-radius:8px;padding:16px;margin-bottom:12px;">${content}</div>`;
  const h3 = (icon, label, color = '#f9fafb') => `<h3 style="color:${color};margin:20px 0 8px;">${icon} ${label}</h3>`;
  const link = (href, text) => `<a href="${href || '#'}" style="color:#60a5fa;text-decoration:none;">${text}</a>`;

  const healthBlock = health && healthRec ? card(`
    <strong>🛌 Sonno · RingConn 2</strong><br/>
    Qualità: <strong>${health.sleepScore || '?'}/100</strong>&nbsp;·&nbsp;HRV: ${health.hrv || '?'} ms&nbsp;·&nbsp;Stress: ${health.stressLevel || '?'}<br/><br/>
    🏃 <em>${healthRec.activity}</em><br/>
    🥗 <em>${healthRec.food}</em><br/>
    🧠 <em>${healthRec.mindset}</em>
  `) : '';

  const growthCard = growthBrief ? `<div style="background:#1a1a1c;border-left:3px solid #6366f1;border-radius:0 8px 8px 0;padding:12px 16px;margin:16px 0;">${growthBrief}</div>` : '';

  const qSection = (label, icon, color, items) => !items.length ? '' : `
    ${h3(icon, label, color)}
    ${items.map(t => card(`
      <div style="margin-bottom:6px;">
        <strong>${link(t.link, t.title)}</strong>
        <small style="color:#9ca3af;"> — ${t.due || ''}</small>
      </div>
      ${t.brief ? `<div style="font-size:13px;color:#d1d5db;white-space:pre-wrap;margin-bottom:8px;">${t.brief}</div>` : ''}
      ${(t.actionPoints || []).length ? `
        <div style="margin-top:6px;">
          <strong style="font-size:12px;color:#a5b4fc;">📌 Azioni:</strong>
          <ul style="margin:4px 0 0 16px;padding:0;">
            ${t.actionPoints.map(ap => `<li style="font-size:12px;color:#d1d5db;margin-bottom:3px;">${ap}</li>`).join('')}
          </ul>
        </div>` : ''}
    `)).join('')}`;

  const meetingSection = calendarEvents.length ? `
    ${h3('📅', 'Meeting di oggi')}
    ${calendarEvents.map(e => card(`
      <strong>${e.time} — ${e.title}</strong><br/>
      ${e.participants ? `<small style="color:#9ca3af;">👥 ${e.participants}</small><br/>` : ''}
      ${e.meetLink ? `${link(e.meetLink, '📞 Unisciti alla call')}<br/>` : ''}
      ${e.brief ? `<pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;color:#d1d5db;margin:8px 0 0;">${e.brief}</pre>` : ''}
    `)).join('')}` : '';

  const priorityColor = { high: '#f87171', medium: '#fbbf24', low: '#9ca3af' };
  const studySection = studyItems.length ? `
    ${h3('📚', `Crescita · ${studyItems.length} contenuti`)}
    <p style="color:#9ca3af;font-size:12px;margin:0 0 12px;">
      🔴 ${studyItems.filter(s=>s.priority==='high').length} alta priorità &nbsp;·&nbsp;
      🟡 ${studyItems.filter(s=>s.priority==='medium').length} media &nbsp;·&nbsp;
      ⚫ ${studyItems.filter(s=>s.priority==='low').length} bassa
    </p>
    ${studyItems.map(s => `<div style="margin-bottom:14px;padding:10px 12px;background:#141416;border-left:3px solid ${priorityColor[s.priority||'medium']};border-radius:0 6px 6px 0;">
      <div style="margin-bottom:4px;">
        <strong>${link(s.link||'#', s.title||'')}</strong>
        ${s.category ? `<span style="font-size:10px;background:rgba(99,102,241,.15);color:#a5b4fc;padding:1px 6px;border-radius:8px;margin-left:6px;">${s.category}</span>` : ''}
        ${s.gmailCategory ? `<span style="font-size:10px;background:rgba(52,211,153,.1);color:#6ee7b7;padding:1px 6px;border-radius:8px;margin-left:4px;">${s.gmailCategory}</span>` : ''}
      </div>
      <small style="color:#9ca3af;">${s.source || ''}</small><br/>
      <span style="font-size:12px;color:#d1d5db;">${s.summary || ''}</span><br/>
      ${s.recommendation ? `<em style="font-size:12px;color:#6ee7b7;">→ ${s.recommendation}</em>` : ''}
    </div>`).join('')}` : '';

  const familySection = `
    ${h3('👨‍👩‍👦', 'Famiglia')}
    <p style="margin:4px 0;"><strong>Alessandra:</strong> ${alessandraEvents.length ? alessandraEvents.map(e => `${e.time} ${e.title}`).join(' · ') : 'Nessun impegno rilevato'}</p>
    <p style="margin:4px 0;"><strong>Tommaso:</strong> ${tommasoAlerts.length ? tommasoAlerts.map(t => link(t.link, t.title)).join(' · ') : 'Nessuna novità'}</p>`;

  const networkSection = detectedCity && networkEvents.length ? `
    ${h3('🌐', `Network · ${detectedCity}`)}
    ${networkEvents.map(e => `<div style="margin-bottom:8px;">${link(e.link || '#', e.title)}&nbsp;—&nbsp;<small style="color:#9ca3af;">${e.date || ''}</small><br/><small style="color:#6b7280;">${e.description || ''}</small></div>`).join('')}` : '';

  const remindersSection = createdReminders.length ? `
    ${h3('🗓️', 'Reminder inseriti in Calendar')}
    <ul style="margin:0;padding-left:20px;">
      ${createdReminders.map(r => `<li style="margin-bottom:4px;color:#e5e7eb;">${r.taskTitle}</li>`).join('')}
    </ul>` : '';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="${S}">
  <h2 style="color:#f9fafb;margin:0 0 4px;">Buongiorno ${userName} 🌅</h2>
  <p style="color:#9ca3af;margin:0 0 16px;"><strong>${dateFullIt(date)}</strong></p>
  <p>🎯 <strong>${dayTypeLabel}</strong></p>

  ${growthCard}
  ${healthBlock}

  ${qSection('Q1 — Urgente + Importante', '🔴', '#ef4444', Q.Q1)}
  ${qSection('Q2 — Importante (pianifica)', '🔵', '#60a5fa', Q.Q2)}
  ${qSection('Q3 — Urgente (valuta delega)', '🟠', '#f97316', Q.Q3)}
  ${qSection('Q4 — Bassa priorità', '⚫', '#6b7280', Q.Q4)}

  <hr style="border-color:#2e2e32;margin:24px 0;"/>
  ${meetingSection}
  ${studySection}
  ${familySection}
  ${networkSection}
  ${remindersSection}

  <hr style="border-color:#2e2e32;margin:24px 0;"/>
  <p>🎯 ${link(appUrl, 'Apri Daily Tracker')} — spunta gli impegni man mano che li completi.</p>
</body></html>`;
}

// ── Standalone local refresh (network + vita locale) ─────────────────────────
async function runLocalRefresh({ uid, date, settings, geminiApiKey, readDBForUid, writeDBForUid, log = console.log }) {
  const logs = [];
  function emit(msg) { logs.push(msg); log(msg); }

  const dbNow = readDBForUid(uid);
  const day   = dbNow.days?.[date] || {};

  // Cache: skip if populated in the last 3 days
  const networkAge = day.network?._refreshedAt
    ? (Date.now() - new Date(day.network._refreshedAt).getTime()) / 86400000
    : 999;
  const actAge = day.localActivities?._refreshedAt
    ? (Date.now() - new Date(day.localActivities._refreshedAt).getTime()) / 86400000
    : 999;

  // Detect city (same logic as morning agent)
  let detectedCity = settings.homeCity || '';
  if (!detectedCity) {
    const tz = settings.timezone || '';
    if (/london|europe\/london/i.test(tz))      detectedCity = 'London, UK';
    else if (/rome|milan|italy/i.test(tz))       detectedCity = 'Milano, Italy';
  }

  if (!detectedCity) {
    emit('Posizione non rilevata — imposta homeCity nelle Impostazioni');
    return { logs, networkEvents: [], localActivities: [], city: '' };
  }
  if (!geminiApiKey) {
    emit('GEMINI_API_KEY non configurata');
    return { logs, networkEvents: [], localActivities: [], city: detectedCity };
  }

  emit(`Città: ${detectedCity}`);

  // ── Network ──────────────────────────────────────────────────────────────────
  let networkEvents = day.network?.events || [];
  if (networkAge < 3) {
    emit(`Network: dati recenti (${networkAge.toFixed(1)} giorni fa), skip`);
  } else {
    emit('Ricerca eventi networking...');
    try {
      const weekFwd = new Date(date + 'T12:00:00Z'); weekFwd.setDate(weekFwd.getDate() + 7);
      const prompt = `Find 5 real upcoming networking events for entrepreneurs, founders and startup people in ${detectedCity} happening between ${date} and ${weekFwd.toISOString().slice(0,10)}.
Include: tech meetups, startup events, pitch nights, founder dinners, accelerator demo days.
Return ONLY a valid JSON array. Each item: {"title":"","date":"dd Month yyyy","time":"","description":"","link":"https://...","location":"","tags":[]}`;
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], tools: [{ googleSearch: {} }], generationConfig: { maxOutputTokens: 2048, temperature: 0.1 } }),
          signal: AbortSignal.timeout(30000) }
      );
      const d = await r.json();
      if (d.error) {
        const code = d.error.code || ''; const msg = d.error.message || '';
        if (code === 429 || msg.includes('quota') || msg.includes('Quota'))
          emit('⚠️ Gemini quota esaurita — abilita billing su https://ai.dev');
        else emit(`⚠️ Gemini errore: ${msg.slice(0, 150)}`);
      } else {
        const text = d.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        const parsed = safeJsonParse(text, []);
        if (Array.isArray(parsed) && parsed.length > 0) {
          networkEvents = parsed.slice(0, 5);
          emit(`✅ ${networkEvents.length} eventi trovati`);
        } else { emit(`Nessun evento strutturato (risposta: ${text.slice(0,100)})`); }
      }
    } catch(e) { emit(`Errore networking: ${e.message}`); }
  }

  // ── Local activities ──────────────────────────────────────────────────────────
  let localActivities = day.localActivities?.items || [];
  if (actAge < 3) {
    emit(`Attività: dati recenti (${actAge.toFixed(1)} giorni fa), skip`);
  } else {
    emit('Ricerca attività locali (2 batch)...');
    const spouseName  = (settings.familyMembers || []).find(f => f.role === 'spouse')?.name || 'partner';
    const childMember = (settings.familyMembers || []).find(f => f.role === 'child');
    const childName   = childMember?.name || 'figlio'; const childAge = childMember?.age || 8;
    const lang = /london/i.test(detectedCity) ? 'English' : 'Italian';
    const fields = `{"type":"...","title":"name","description":"1 sentence","category":"food|culture|outdoor|sport|art|entertainment|nature","location":"area","price":"€|€€|€€€","why":"why recommended","link":"https://..."}`;
    const batches = [
      { types: `- 3 type "solo": solo activities (museums, walks, cultural events)\n- 3 type "couple": things to do with ${spouseName} (restaurants, experiences)`, label: 'solo+couple' },
      { types: `- 3 type "family": kid-friendly for ${childAge}-year-old ${childName}\n- 3 type "restaurant": restaurant picks (romantic, family, solo)`, label: 'family+restaurant' }
    ];
    for (const batch of batches) {
      try {
        const prompt = `Suggest 6 activities in ${detectedCity} this week in ${lang}:\n${batch.types}\nEach: ${fields}\nReal places. Return ONLY a valid JSON array, no markdown.`;
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
          { method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ contents:[{role:'user',parts:[{text:prompt}]}], tools:[{googleSearch:{}}], generationConfig:{maxOutputTokens:2000,temperature:0.3} }),
            signal: AbortSignal.timeout(30000) }
        );
        const d = await r.json();
        if (d.error) {
          const code=d.error.code||''; const msg=d.error.message||'';
          if (code===429||msg.includes('quota')||msg.includes('Quota')) emit('⚠️ Gemini quota esaurita — abilita billing su https://ai.dev');
          else emit(`⚠️ Gemini errore: ${msg.slice(0,150)}`);
        } else {
          const text = d.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
          const parsed = safeJsonParse(text, []);
          if (Array.isArray(parsed) && parsed.length > 0) { localActivities.push(...parsed); emit(`✅ batch ${batch.label}: ${parsed.length} attività`); }
          else emit(`Batch ${batch.label}: nessun risultato (${text.slice(0,80)})`);
        }
      } catch(e) { emit(`Errore batch ${batch.label}: ${e.message}`); }
    }
    if (localActivities.length > 0) emit(`✅ ${localActivities.length} attività totali trovate in ${detectedCity}`);
    else emit('Nessuna attività trovata');
  }

  // Save
  const now = new Date().toISOString();
  const saveDb = readDBForUid(uid);
  if (!saveDb.days) saveDb.days = {};
  if (!saveDb.days[date]) saveDb.days[date] = { events:[], tasks:[], items:{}, reflection:'', briefing:'' };
  saveDb.days[date].network         = { city: detectedCity, events: networkEvents, _refreshedAt: now };
  saveDb.days[date].localActivities = { city: detectedCity, items: localActivities,  _refreshedAt: now };
  writeDBForUid(uid, saveDb);

  return { logs, networkEvents, localActivities, city: detectedCity };
}

module.exports = { runMorningAgent, runLocalRefresh };
