'use strict';

/**
 * Morning Agent — orchestratore del briefing quotidiano
 * Esegue i 9 step definiti nel prompt di sistema per ogni utente.
 * È completamente multi-utente: riceve uid + settings, non usa global state.
 */

const Anthropic = require('@anthropic-ai/sdk');

// ── AI client factory: Gemini (gratis) o Anthropic (a pagamento) ──────────────
function makeAIClient({ anthropicApiKey, geminiApiKey, groqApiKey }) {

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

  // ── Gemini — gratis con chiave AI Studio ──────────────────────────────────────
  if (geminiApiKey) {
    return {
      _provider: 'gemini',
      messages: {
        create: async ({ messages, max_tokens = 4096 }) => {
          const parts = messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }]
          }));
          const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: parts, generationConfig: { maxOutputTokens: max_tokens, temperature: 0.3 } }),
              signal: AbortSignal.timeout(60000) }
          );
          const data = await resp.json();
          if (data.error) throw new Error(`${data.error.code} ${JSON.stringify(data.error)}`);
          return { content: [{ type: 'text', text: data.candidates?.[0]?.content?.parts?.[0]?.text || '' }] };
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

  throw new Error('Aggiungi GROQ_API_KEY (gratis su console.groq.com) nelle variabili Railway.');
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

  // ── STEP 3: Gmail full inbox analysis ─────────────────────────────────────────
  emit('[3/9] Analisi inbox Gmail...');
  // If force=true, clear previous email tasks so they get re-analyzed
  if (force && dbNow.days?.[date]?.tasks) {
    dbNow.days[date].tasks = (dbNow.days[date].tasks || []).filter(t => !t.id.startsWith('mail-'));
    emit('  ↳ Force refresh: task email precedenti rimossi per rianalisi');
  }
  const existingTaskIds = new Set((dbNow.days?.[date]?.tasks || []).map(t => t.id));

  let inboxRaw = [];
  try {
    // Query ampia: tutte le email inbox non lette o recenti degli ultimi 7 giorni
    // L'AI decide quali richiedono azione — non filtriamo in anticipo
    inboxRaw = await gmailSearch(token, 'in:inbox newer_than:7d', 50);
    emit(`  ↳ ${inboxRaw.length} messaggi trovati in inbox (ultimi 7 giorni)`);
    // Se 0, proviamo senza filtro data
    if (inboxRaw.length === 0) {
      inboxRaw = await gmailSearch(token, 'in:inbox', 50);
      emit(`  ↳ Fallback: ${inboxRaw.length} messaggi totali in inbox`);
    }
  } catch(e) {
    emit(`  ↳ ERRORE Gmail search: ${e.message}`);
  }

  const emailsData = [];
  let skippedExisting = 0;
  for (const msg of inboxRaw.slice(0, 35)) {
    if (existingTaskIds.has(`mail-${msg.id}`)) { skippedExisting++; continue; }
    try {
      const full = await gmailGetMessage(token, msg.id);
      const h = gmailHeaders(full);
      emailsData.push({
        id: msg.id,
        from: h.from || '',
        subject: h.subject || '(no subject)',
        date: h.date || '',
        body: gmailBody(full, 1200)
      });
    } catch(e) { emit(`  ↳ Skip email ${msg.id}: ${e.message}`); }
  }
  if (skippedExisting > 0) emit(`  ↳ ${skippedExisting} email già elaborate in precedenza (skippate)`);

  let emailTasks = [];
  if (emailsData.length > 0) {
    emit(`  ↳ Analisi AI di ${emailsData.length} email nuove...`);
    try {
      const emailList = emailsData.map((e, i) =>
        `EMAIL_${i + 1} [id:${e.id}]\nDa: ${e.from}\nOggetto: ${e.subject}\nData: ${e.date}\n${e.body}`
      ).join('\n\n---\n\n');

      const resp = await claude.messages.create({
        model: claude._provider === 'gemini' ? 'gemini-1.5-flash' : claude._provider === 'groq' ? 'llama-3.3-70b-versatile' : 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: `Sei l'assistente personale di ${settings.userName || 'Marco'} (${settings.primaryEmail || ''}).
Data oggi: ${date}. Analizza queste email e identifica SOLO quelle che richiedono un'azione concreta.

Per ogni email che richiede azione, crea un oggetto JSON:
{
  "id": "id dell'email (quello tra [id:...])",
  "title": "titolo task max 60 caratteri: [Verbo] [oggetto] – [nome contatto]",
  "quadrant": "Q1|Q2|Q3|Q4",
  "brief": "CONTESTO: ...\\nSVILUPPO: ...\\nACTION: cosa fare esattamente (max 200 parole totali)",
  "actionPoints": ["azione concreta 1 (<15 min)", "azione concreta 2", "azione concreta 3"],
  "from": "email mittente"
}

Quadranti: Q1=urgente+importante, Q2=importante non urgente, Q3=urgente non importante, Q4=bassa priorità.
Ignora newsletter, ricevute automatiche, notifiche sistemi. Rispondi SOLO con array JSON.

EMAIL:\n${emailList}`
        }]
      });

      const rawText = resp.content[0]?.text || '[]';
      emailTasks = safeJsonParse(rawText, []);
      if (!Array.isArray(emailTasks)) {
        emit(`  ↳ WARN: risposta AI non è array, testo: ${rawText.slice(0, 200)}`);
        emailTasks = [];
      }
    } catch(e) { emit(`  ↳ Errore analisi AI: ${e.message}\n${e.stack?.slice(0,300)}`); }
  } else {
    emit(`  ↳ Nessuna email nuova da analizzare (inboxRaw: ${inboxRaw.length})`);
  }

  result.tasks = emailTasks.map(t => ({
    id: `mail-${t.id}`,
    title: t.title || t.subject || 'Email',
    due: `Oggi · ${t.from || ''}`,
    quadrant: t.quadrant || 'Q2',
    brief: t.brief || '',
    link: `https://mail.google.com/mail/u/0/#inbox/${t.id}`,
    actionPoints: Array.isArray(t.actionPoints) ? t.actionPoints : []
  }));

  emit(`  ↳ ${result.tasks.length} task email identificati`);

  // ── STEP 3b: Newsletter / growth material ──────────────────────────────────────
  emit('[3b] Scansione newsletter e aggiornamenti...');
  const studyItems = [];
  try {
    const socialRaw = await gmailSearch(token, 'category:social OR category:updates', 30);
    const socialData = [];
    for (const msg of socialRaw.slice(0, 20)) {
      try {
        const full = await gmailGetMessage(token, msg.id);
        const h = gmailHeaders(full);
        socialData.push({ id: msg.id, from: h.from || '', subject: h.subject || '', body: gmailBody(full, 600) });
      } catch(e) { /* skip */ }
    }

    if (socialData.length > 0) {
      const interests = (settings.interests || ['business', 'AI', 'leadership', 'startup', 'tecnologia']).join(', ');
      const resp = await claude.messages.create({
        model: claude._provider === 'gemini' ? 'gemini-1.5-flash' : claude._provider === 'groq' ? 'llama-3.3-70b-versatile' : 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Seleziona i 5 contenuti più rilevanti per la crescita di ${settings.userName || 'Marco'}.
Aree di interesse: ${interests}

Per ognuno dei 5 più rilevanti:
{"title":"...","summary":"sintesi 2-3 frasi","source":"Newsletter · mittente","link":"https://mail.google.com/mail/u/0/#inbox/ID","recommendation":"Cosa fare con questa info"}

EMAIL:\n${socialData.map((e, i) => `[${i + 1}|id:${e.id}] Da: ${e.from}\nOggetto: ${e.subject}\n${e.body}`).join('\n---\n')}

Rispondi SOLO con array JSON.`
        }]
      });
      const parsed = safeJsonParse(resp.content[0]?.text || '[]', []);
      studyItems.push(...parsed.slice(0, 5));
    }
  } catch(e) { emit(`  ↳ Errore 3b: ${e.message}`); }
  emit(`  ↳ ${studyItems.length} study items selezionati`);

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
        model: claude._provider === 'gemini' ? 'gemini-1.5-flash' : claude._provider === 'groq' ? 'llama-3.3-70b-versatile' : 'claude-sonnet-4-6',
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

  // ── STEP 6b: Networking events via Perplexity ──────────────────────────────────
  emit('[6b] Ricerca eventi networking...');
  const networkEvents = [];
  if (detectedCity && perplexityApiKey) {
    try {
      const cityQuery = /london/i.test(detectedCity)
        ? `networking events London entrepreneurs this week OR next week`
        : `networking eventi Milano imprenditori questa settimana prossima settimana`;

      const pResp = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${perplexityApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'sonar-pro',
          messages: [{
            role: 'user',
            content: `Find 3-5 networking events in ${detectedCity} this week or next week.
For each: title, date (dd month yyyy · HH:MM), description (1 sentence), registration link, tags array.
Respond as valid JSON array only.`
          }],
          search_recency_filter: 'week'
        }),
        signal: AbortSignal.timeout(15000)
      });
      const pData = await pResp.json();
      const pText = pData.choices?.[0]?.message?.content || '[]';
      networkEvents.push(...safeJsonParse(pText, []).slice(0, 5));
      emit(`  ↳ ${networkEvents.length} eventi trovati in ${detectedCity}`);
    } catch(e) { emit(`  ↳ Errore Perplexity: ${e.message}`); }
  } else if (detectedCity) {
    emit(`  ↳ Posizione: ${detectedCity} (Perplexity non configurata — aggiungi API key nelle impostazioni)`);
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
      model: claude._provider === 'gemini' ? 'gemini-1.5-flash' : claude._provider === 'groq' ? 'llama-3.3-70b-versatile' : 'claude-sonnet-4-6',
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
  saveDb.days[date].family   = { alessandraEvents, tommasoAlerts };
  saveDb.days[date].network  = { city: detectedCity, events: networkEvents };
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

  const studySection = studyItems.length ? `
    ${h3('📚', 'Crescita · Da leggere')}
    ${studyItems.map(s => `<div style="margin-bottom:12px;">
      <strong style="color:#a78bfa;">${s.title}</strong>&nbsp;<small style="color:#9ca3af;">${s.source || ''}</small><br/>
      ${s.summary || ''}<br/>
      <em style="color:#6ee7b7;">→ ${s.recommendation || ''}</em>
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

module.exports = { runMorningAgent };
