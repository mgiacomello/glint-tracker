require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const { v4: uuidv4 } = require('uuid');
const { AsyncLocalStorage } = require('async_hooks');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const USERS_PATH = path.join(__dirname, 'data', 'users.json');
const SYSTEM_TOKEN = process.env.SYSTEM_TOKEN || 'glint-system-2026';

// Per-request user context (avoids passing uid to every function)
const als = new AsyncLocalStorage();
function getCurrentUid() { return als.getStore()?.uid || null; }
function getCurrentUser() { return als.getStore() || {}; }

app.set('trust proxy', 1); // Railway/Render/Heroku sono dietro reverse proxy
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
const SESSION_DIR = path.join(__dirname, 'data', 'sessions');
fs.mkdirSync(SESSION_DIR, { recursive: true });

// Session store: file-based con fallback memory se il disco non è disponibile
let sessionStore;
try {
  sessionStore = new FileStore({ path: SESSION_DIR, ttl: 30 * 24 * 3600, reapInterval: 3600, logFn: () => {} });
} catch (e) {
  console.warn('⚠️  File session store non disponibile, uso memory store (non persistente)');
  sessionStore = undefined; // express-session usa MemoryStore di default
}

app.use(session({
  ...(sessionStore ? { store: sessionStore } : {}),
  secret: process.env.SESSION_SECRET || 'glint-tracker-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
}));
app.use(express.static('public'));

// ── Auth middleware ───────────────────────────────────────────────────────────
const PUBLIC_API = ['/auth/google', '/api/me', '/api/logout', '/api/health'];
app.use((req, res, next) => {
  // System token bypass (for scheduled tasks)
  const authHeader = req.headers.authorization || '';
  if (authHeader === `Bearer ${SYSTEM_TOKEN}`) {
    const uid = req.headers['x-user-id'];
    if (uid) return als.run({ uid }, next);
  }

  // Session auth for API routes
  if (req.path.startsWith('/api/') && !PUBLIC_API.some(p => req.path.startsWith(p))) {
    const uid = req.session?.userId;
    if (!uid) return res.status(401).json({ error: 'Not authenticated', loginUrl: '/login.html' });
    const u = req.session;
    // Precarica dati utente da Redis se necessario (asincrono, poi esegue next)
    preloadUserFromRedis(uid).then(() => {
      als.run({ uid, email: u.userEmail, name: u.userName, picture: u.userPicture }, next);
    }).catch(() => {
      als.run({ uid, email: u.userEmail, name: u.userName, picture: u.userPicture }, next);
    });
    return;
  }

  // If logged in, inject context for non-API routes too
  if (req.session?.userId) {
    const u = req.session;
    preloadUserFromRedis(u.userId).catch(() => {});
    return als.run({ uid: u.userId, email: u.userEmail, name: u.userName, picture: u.userPicture }, next);
  }

  next();
});

// ── Users registry ─────────────────────────────────────────────────────────────
// ── Storage layer: Upstash Redis (prod) + file system (dev) ──────────────────
const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL   || process.env.UPSTASH_REDIS_URL   || '';
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_TOKEN || '';
const USE_REDIS = !!(UPSTASH_URL && UPSTASH_TOKEN);

if (USE_REDIS) console.log('💾  Storage: Upstash Redis');
else           console.log('💾  Storage: filesystem locale');

// In-memory write-behind cache per ridurre le chiamate Redis
const _redisCache = new Map();

async function redisGet(key) {
  if (_redisCache.has(key)) return _redisCache.get(key);
  try {
    const r = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
    });
    const j = await r.json();
    const val = j.result ? JSON.parse(j.result) : null;
    if (val) _redisCache.set(key, val);
    return val;
  } catch (e) { console.error('Redis GET error:', e.message); return null; }
}

async function redisSet(key, value) {
  _redisCache.set(key, value);
  try {
    await fetch(`${UPSTASH_URL}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(value) })
    });
  } catch (e) { console.error('Redis SET error:', e.message); }
}

// ── Users registry ────────────────────────────────────────────────────────────
const _usersCache = { data: null };

function readUsers() {
  if (USE_REDIS) {
    // Redis: sincrono via cache (aggiornato da writeUsers)
    return _usersCache.data || {};
  }
  if (!fs.existsSync(USERS_PATH)) { fs.writeFileSync(USERS_PATH, '{}'); return {}; }
  try { return JSON.parse(fs.readFileSync(USERS_PATH, 'utf8')); } catch { return {}; }
}

function writeUsers(u) {
  _usersCache.data = u;
  if (USE_REDIS) {
    redisSet('glint:users', u).catch(() => {});
    return;
  }
  fs.writeFileSync(USERS_PATH, JSON.stringify(u, null, 2));
}

// Inizializza cache utenti da Redis all'avvio
if (USE_REDIS) {
  redisGet('glint:users').then(u => { if (u) _usersCache.data = u; }).catch(() => {});
}

// ── DB helpers ────────────────────────────────────────────────────────────────
const EMPTY_DB = () => ({ days: {}, months: {}, contacts: {}, projects: [], pipeline: { deals: [], invoices: [], targets: [] }, tasks: [], lists: [] });

function userDbPath(uid) {
  return uid ? path.join(__dirname, 'data', 'users', uid, 'db.json') : DB_PATH;
}

function readDBForUid(uid) {
  if (!uid) return EMPTY_DB();
  if (USE_REDIS) {
    return _redisCache.get(`glint:user:${uid}`) || EMPTY_DB();
  }
  const p = userDbPath(uid);
  if (!fs.existsSync(p)) {
    const empty = EMPTY_DB();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(empty, null, 2));
    return empty;
  }
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return EMPTY_DB(); }
}

function writeDBForUid(uid, data) {
  if (!uid) return;
  if (USE_REDIS) {
    redisSet(`glint:user:${uid}`, data).catch(() => {});
    return;
  }
  const p = userDbPath(uid);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

// Precarica DB utente da Redis quando la sessione inizia
async function preloadUserFromRedis(uid) {
  if (!USE_REDIS || !uid) return;
  if (_redisCache.has(`glint:user:${uid}`)) return;
  const data = await redisGet(`glint:user:${uid}`);
  if (data) _redisCache.set(`glint:user:${uid}`, data);
}

function readDB() { return readDBForUid(getCurrentUid()); }
function writeDB(data) { writeDBForUid(getCurrentUid(), data); }

// ── Shared store (task sharing + calendar sharing + notifications) ─────────────
const SHARED_PATH = path.join(__dirname, 'data', 'shared.json');

function readShared() {
  if (!fs.existsSync(SHARED_PATH)) {
    const e = { tasks: {}, calendarShares: {}, notifications: {} };
    fs.mkdirSync(path.dirname(SHARED_PATH), { recursive: true });
    fs.writeFileSync(SHARED_PATH, JSON.stringify(e, null, 2));
    return e;
  }
  try { return JSON.parse(fs.readFileSync(SHARED_PATH, 'utf8')); }
  catch { return { tasks: {}, calendarShares: {}, notifications: {} }; }
}

function writeShared(d) {
  fs.mkdirSync(path.dirname(SHARED_PATH), { recursive: true });
  fs.writeFileSync(SHARED_PATH, JSON.stringify(d, null, 2));
}

function createNotification(uid, type, title, data) {
  if (!uid) return;
  const s = readShared();
  if (!s.notifications[uid]) s.notifications[uid] = [];
  s.notifications[uid].unshift({ id: uuidv4(), type, title, data: data || {}, read: false, createdAt: new Date().toISOString() });
  if (s.notifications[uid].length > 50) s.notifications[uid] = s.notifications[uid].slice(0, 50);
  writeShared(s);
}

function getTaskPermission(task, uid) {
  if (!uid) return null;
  if (task.ownerId === uid) return 'owner';
  if (task.permissions && task.permissions[uid]) return task.permissions[uid];
  if ((task.assignedTo || []).includes(uid)) return 'editor';
  if ((task.sharedWith || []).some(s => (typeof s === 'string' ? s : s.userId) === uid)) return 'viewer';
  return null;
}

function syncTaskToShared(task) {
  const s = readShared();
  const isShared = (task.assignedTo && task.assignedTo.length > 0) || (task.sharedWith && task.sharedWith.length > 0);
  if (isShared) { s.tasks[task.id] = { ...task }; }
  else { delete s.tasks[task.id]; }
  writeShared(s);
}

function ensureDay(db, date) {
  if (!db.days[date]) {
    db.days[date] = { events: [], tasks: [], items: {}, reflection: '', briefing: '' };
  }
  return db.days[date];
}

function ensureMonth(db, ym) {
  if (!db.months[ym]) {
    db.months[ym] = { kpis: [], objectives: [], completedItems: 0, totalItems: 0 };
  }
  return db.months[ym];
}

// ── DAY ROUTES ────────────────────────────────────────────────────────────────

// GET /api/day/:date  → full day data
app.get('/api/day/:date', (req, res) => {
  const db = readDB();
  const day = db.days[req.params.date] || { events: [], tasks: [], items: {}, reflection: '', briefing: '' };
  res.json(day);
});

// POST /api/day/:date/populate  → called by scheduled task to seed the day
app.post('/api/day/:date/populate', (req, res) => {
  const db = readDB();
  const day = ensureDay(db, req.params.date);
  const { events = [], tasks = [], briefing = '' } = req.body;

  // Merge: keep existing item states, add new events/tasks
  day.briefing = briefing;

  events.forEach(evt => {
    const exists = day.events.find(e => e.id === evt.id);
    if (!exists) day.events.push(evt);
    if (!day.items[evt.id]) {
      day.items[evt.id] = { done: false, comment: '', actionPoints: [], quadrant: evt.quadrant || 'Q2', type: 'event' };
    }
  });

  tasks.forEach(task => {
    const exists = day.tasks.find(t => t.id === task.id);
    if (!exists) day.tasks.push(task);
    if (!day.items[task.id]) {
      day.items[task.id] = { done: false, comment: '', actionPoints: (task.actionPoints || []).map((t,i) => ({ id: `ap-${Date.now()}-${i}`, text: t, done: false })), quadrant: task.quadrant || 'Q1', type: 'task' };
    }
  });

  writeDB(db);
  res.json({ ok: true, day });
});

// POST /api/day/:date/item/:id  → update item state (done, comment, actionPoints)
app.post('/api/day/:date/item/:id', (req, res) => {
  const db = readDB();
  const day = ensureDay(db, req.params.date);
  const ym = req.params.date.slice(0, 7);
  const month = ensureMonth(db, ym);

  if (!day.items[req.params.id]) {
    day.items[req.params.id] = { done: false, comment: '', actionPoints: [], quadrant: 'Q2', type: 'event' };
  }

  const item = day.items[req.params.id];
  const wasDone = item.done;

  Object.assign(item, req.body);

  // Update monthly completion counters
  if (!wasDone && item.done) month.completedItems = (month.completedItems || 0) + 1;
  if (wasDone && !item.done) month.completedItems = Math.max(0, (month.completedItems || 1) - 1);

  writeDB(db);
  res.json({ ok: true, item });
});

// POST /api/day/:date/reflection  → save daily reflection
app.post('/api/day/:date/reflection', (req, res) => {
  const db = readDB();
  const day = ensureDay(db, req.params.date);
  day.reflection = req.body.reflection || '';
  writeDB(db);
  res.json({ ok: true });
});

// POST /api/day/:date/item/:id/action-point  → add action point
app.post('/api/day/:date/item/:id/action-point', (req, res) => {
  const db = readDB();
  const day = ensureDay(db, req.params.date);
  if (!day.items[req.params.id]) {
    day.items[req.params.id] = { done: false, comment: '', actionPoints: [], quadrant: 'Q2', type: 'event' };
  }
  const ap = { id: Date.now().toString(), text: req.body.text, done: false, createdAt: new Date().toISOString() };
  day.items[req.params.id].actionPoints.push(ap);
  writeDB(db);
  res.json({ ok: true, actionPoint: ap });
});

// PATCH /api/day/:date/item/:itemId/action-point/:apId  → toggle action point
app.patch('/api/day/:date/item/:itemId/action-point/:apId', (req, res) => {
  const db = readDB();
  const day = ensureDay(db, req.params.date);
  const item = day.items[req.params.itemId];
  if (item) {
    const ap = item.actionPoints.find(a => a.id === req.params.apId);
    if (ap) ap.done = req.body.done !== undefined ? req.body.done : !ap.done;
  }
  writeDB(db);
  res.json({ ok: true });
});

// POST /api/day/:date/item/:id/analyze-recap → extract action points from a Gemini recap via Claude
app.post('/api/day/:date/item/:id/analyze-recap', async (req, res) => {
  const cfg = readConfig();
  if (!cfg.anthropicApiKey) return res.status(400).json({ error: 'No API key configured' });

  const db = readDB();
  const day = ensureDay(db, req.params.date);

  // Find the item (event or task)
  const allItems = [...(day.events || []), ...(day.tasks || [])];
  const item = allItems.find(it => it.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const briefText = item.brief || item.description || item.body || '';
  if (!briefText || briefText.length < 20) {
    return res.status(400).json({ error: 'Nessun testo sufficiente da analizzare' });
  }

  try {
    const { Anthropic } = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: cfg.anthropicApiKey });

    const prompt = `Sei un assistente che analizza trascrizioni e note di riunioni in italiano.
Leggi il seguente recap/nota della call e identifica TUTTI gli action points (cose da fare / decisioni da implementare).
Per ciascuno estrai:
- "text": descrizione chiara e concisa dell'azione (in italiano)
- "who": chi deve farla ("Marco", "Team", nome cliente, o "" se non specificato)
- "deadline": scadenza se menzionata (es. "entro venerdì", "entro il 20 marzo"), altrimenti null
- "priority": "high" | "medium" | "low" in base all'urgenza o importanza

Rispondi SOLO con un array JSON valido, senza testo aggiuntivo prima o dopo.
Se non ci sono action points, rispondi: []

RECAP DA ANALIZZARE:
${briefText.slice(0, 6000)}`;

    const response = await client.messages.create({
      model: cfg.aiModel || 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });

    const raw = (response.content[0]?.text || '[]').trim();
    let extracted = [];
    try {
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch (e) { extracted = []; }

    // Persist new action points
    if (!day.items[req.params.id]) {
      day.items[req.params.id] = { done: false, comment: '', actionPoints: [], quadrant: 'Q2' };
    }
    if (!Array.isArray(day.items[req.params.id].actionPoints)) {
      day.items[req.params.id].actionPoints = [];
    }

    const newAps = extracted.map(ex => {
      const suffix = [
        ex.who ? `(@${ex.who})` : '',
        ex.deadline ? `[${ex.deadline}]` : ''
      ].filter(Boolean).join(' ');
      return {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        text: ex.text + (suffix ? ' ' + suffix : ''),
        done: false,
        createdAt: new Date().toISOString(),
        fromRecap: true,
        priority: ex.priority || 'medium'
      };
    });

    newAps.forEach(ap => day.items[req.params.id].actionPoints.push(ap));
    writeDB(db);
    res.json({ ok: true, actionPoints: newAps, count: newAps.length });

  } catch (err) {
    console.error('analyze-recap error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── INSIGHTS / FAMILY / NETWORK ───────────────────────────────────────────

// POST /api/day/:date/insights  → save day-type, drive files, study items
app.post('/api/day/:date/insights', (req, res) => {
  const db = readDB();
  const day = ensureDay(db, req.params.date);
  day.insights = req.body;
  writeDB(db);
  res.json({ ok: true });
});

// PATCH /api/day/:date/study-item/:idx/done  → toggle done flag on a studyItem
app.patch('/api/day/:date/study-item/:idx/done', (req, res) => {
  const db  = readDB();
  const day = db.days[req.params.date];
  if (!day?.insights?.studyItems) return res.status(404).json({ error: 'not found' });
  const idx = parseInt(req.params.idx);
  const item = day.insights.studyItems[idx];
  if (!item) return res.status(404).json({ error: 'item not found' });
  item.done   = req.body.done ?? !item.done;
  item.doneAt = item.done ? new Date().toISOString() : null;
  writeDB(db);
  res.json({ ok: true, item });
});

// GET /api/browser-tabs  → get saved browser tabs
app.get('/api/browser-tabs', (req, res) => {
  const db = readDB();
  res.json(db.browserTabs || []);
});

// POST /api/browser-tabs  → save/replace browser tabs list
app.post('/api/browser-tabs', (req, res) => {
  const db = readDB();
  const tabs = Array.isArray(req.body) ? req.body : req.body.tabs || [];
  db.browserTabs = tabs.map(t => ({
    url:     t.url   || '',
    title:   t.title || '',
    brief:   t.brief || '',
    hint:    t.hint  || '',
    addedAt: t.addedAt || new Date().toISOString()
  }));
  writeDB(db);
  res.json({ ok: true, count: db.browserTabs.length });
});

// POST /api/day/:date/family  → save Alessandra events + Tommaso alerts
app.post('/api/day/:date/family', (req, res) => {
  const db = readDB();
  const day = ensureDay(db, req.params.date);
  day.family = req.body;
  writeDB(db);
  res.json({ ok: true });
});

// PATCH /api/day/:date/family/task/:id/done  → toggle done + archive tommaso task
app.patch('/api/day/:date/family/task/:id/done', (req, res) => {
  const db  = readDB();
  const day = db.days[req.params.date];
  if (!day?.family?.tommasoTasks) return res.status(404).json({ error: 'not found' });
  const task = day.family.tommasoTasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'task not found' });
  task.done   = req.body.done ?? !task.done;
  task.doneAt = task.done ? new Date().toISOString() : null;
  writeDB(db);
  res.json({ ok: true, task });
});

// PATCH /api/day/:date/family/alert/:id/done  → toggle done on a tommasoAlert
app.patch('/api/day/:date/family/alert/:id/done', (req, res) => {
  const db  = readDB();
  const day = db.days[req.params.date];
  if (!day?.family?.tommasoAlerts) return res.status(404).json({ error: 'not found' });
  const alert = day.family.tommasoAlerts.find(a => a.id === req.params.id);
  if (!alert) return res.status(404).json({ error: 'alert not found' });
  alert.done   = req.body.done ?? !alert.done;
  alert.doneAt = alert.done ? new Date().toISOString() : null;
  writeDB(db);
  res.json({ ok: true, alert });
});

// ── CONTACTS ──────────────────────────────────────────────────────────────

// Extract people from task titles (format: "Name · description" or "Company · Name · desc")
function extractContactsFromTasks(db) {
  const contactMap = {};

  // Skip tokens that are companies or keywords, not people
  const skipWords = ['SellRapido','Domopay','Rockin','Springer','ONBIT','Takeda','Notaio','PEC','FG','GDA','Comune',
    'Intranet','Supabase','Glint','Papyro','Airness','SIAE','RETE','STEAM','ITACA','DOCU','OME','RAI','GAIP',
    'Galileo','Ravarino','UniSalento','Marcella','Rolla','Protocollo','Utopia','Lina','Valentina','Alessio'];

  // Extra skip: short ambiguous single names
  const skipSingleNames = ['Maria','Giulia','Martina','Luca','Marco','Paolo','Anna','Laura','Sara','Elena','Gianni','SNG','Golinelli'];

  function tryAddContact(name, date, item, day, allowSingle) {
    name = name.trim().replace(/[\/·\s]+$/, '').trim(); // strip trailing / · spaces
    if (!name) return;
    if (!allowSingle && name.split(' ').length < 2) return; // need at least 2 words unless flagged
    if (allowSingle && skipSingleNames.includes(name)) return; // skip ambiguous single names
    if (skipWords.some(function(s){ return name.startsWith(s) || name.includes(s); })) return;
    if (!/^[A-ZÀÈÉÙÌ]/.test(name)) return; // must start with capital
    if (!contactMap[name]) contactMap[name] = { name, mentions: [], tasks: [] };
    contactMap[name].mentions.push(date);
    contactMap[name].tasks.push({
      date, title: item.title || '',
      quadrant: (day.items[item.id] || {}).quadrant || 'Q2',
      done: (day.items[item.id] || {}).done || false
    });
  }

  Object.entries(db.days || {}).forEach(function(entry) {
    const date = entry[0];
    const day = entry[1];
    (day.tasks || []).concat(day.events || []).forEach(function(item) {
      const raw = (item.title || '').replace(/^🗂\s*/, '').trim();

      // Pattern 1: "Name · task"  or  "Name / task"
      const p1 = raw.match(/^([A-ZÀÈÉÙÌ][a-zA-Zàèéùì]+(?: [A-ZÀÈÉÙÌ][a-zA-Zàèéùì]+){0,3})\s*[·]/);
      if (p1) tryAddContact(p1[1], date, item, day);

      // Pattern 2: "Company / Person Name · task"  (e.g. "Takeda / Alessandra Borgia · TPRM")
      const p2 = raw.match(/[\/]\s*([A-ZÀÈÉÙÌ][a-zA-Zàèéùì]+(?: [A-ZÀÈÉÙÌ][a-zA-Zàèéùì]+){1,3})\s*·/);
      if (p2) tryAddContact(p2[1], date, item, day);

      // Pattern 3: "(Name)" at end  e.g. "Leggere SIAL Weekly Bulletin (Tommaso)"
      const p3 = raw.match(/\(([A-ZÀÈÉÙÌ][a-zA-Zàèéùì]+(?:\s+[A-ZÀÈÉÙÌ][a-zA-Zàèéùì]+)?)\)\s*$/);
      if (p3) tryAddContact(p3[1], date, item, day, true); // allow single names in parentheses

      // Pattern 4: "Firstname Lastname ·" or "Firstname Lastname /" anywhere in string
      const p4 = raw.match(/([A-ZÀÈÉÙÌ][a-zA-Zàèéùì]+ [A-ZÀÈÉÙÌ][a-zA-Zàèéùì]+)\s*[·\/]/g);
      if (p4) p4.forEach(function(m) {
        const nm = m.replace(/\s*·.*/, '').trim();
        tryAddContact(nm, date, item, day);
      });
    });
  });

  // Also check stored contacts for manual additions
  Object.keys(db.contacts || {}).forEach(function(name) {
    if (!contactMap[name]) contactMap[name] = { name, mentions: [], tasks: [] };
  });

  // Sort mentions by date, pick last
  return Object.values(contactMap).map(function(c) {
    c.mentions.sort();
    c.lastMention = c.mentions[c.mentions.length - 1];
    c.urgentTasks = c.tasks.filter(function(t){ return (t.quadrant === 'Q1' || t.quadrant === 'Q2') && !t.done; });
    return c;
  }).filter(function(c){ return c.mentions.length > 0; })
    .sort(function(a, b){ return b.lastMention.localeCompare(a.lastMention); });
}

// GET /api/contacts  → all persistent contacts + auto-extracted from tasks
app.get('/api/contacts', (req, res) => {
  const db = readDB();
  const extracted = extractContactsFromTasks(db);
  const stored = db.contacts || {};

  // Merge stored with extracted
  const merged = extracted.map(function(c) {
    const s = stored[c.name] || {};
    return Object.assign({}, c, {
      company:    s.company    || guessCompany(c.tasks),
      role:       s.role       || '',
      notes:      s.notes      || '',
      lastContact:s.lastContact|| c.lastMention,
      tags:       s.tags       || [],
      pinned:     s.pinned     || false,
    });
  });

  // Add stored contacts not found in tasks
  Object.entries(stored).forEach(function(entry) {
    const name = entry[0]; const s = entry[1];
    if (!merged.find(function(c){ return c.name === name; })) {
      merged.push(Object.assign({ name, mentions: [], tasks: [], urgentTasks: [] }, s));
    }
  });

  res.json(merged);
});

function guessCompany(tasks) {
  // Try to extract company from task title: "Company · Person · task"
  for (let t of tasks) {
    const parts = t.title.split(/\s*·\s*/);
    if (parts.length >= 2) {
      const first = parts[0].replace(/^🗂\s*/, '').trim();
      // If first part looks like company (all caps or known company)
      if (/^[A-Z][A-Z0-9]+$/.test(first) || ['Takeda','Intranet.ai','Supabase','Glint'].includes(first)) {
        return first;
      }
    }
  }
  return '';
}

// PATCH /api/contacts/:name  → update stored contact data
app.patch('/api/contacts/:name', (req, res) => {
  const db = readDB();
  if (!db.contacts) db.contacts = {};
  const name = decodeURIComponent(req.params.name);
  db.contacts[name] = Object.assign(db.contacts[name] || {}, req.body);
  writeDB(db);
  res.json({ ok: true });
});

// ── TRAVEL / TRANSFERS ────────────────────────────────────────────────────────

// checkInMin = time to be at airport before departure (security + gate buffer)
// transitMin = realistic door-to-airport transit time from city home base
// safetyMin  = always added as extra buffer (built into departBy = flight - checkIn - transit - 15min)
// ── USER PREFERENCE: always 90 min at airport, 30 min at train station ────────
const AIRPORT_CHECKIN_MIN = 90;  // user rule: 1.5h before any flight
const TRAIN_STATION_MIN   = 30;  // user rule: 30 min before any train

// checkInMin = fixed at 90 for all airports per user preference
// transitMin = realistic door-to-airport travel time from city home base
const AIRPORT_LOGISTICS = {
  // ── ITALY ──────────────────────────────────────────────────────────────────
  malpensa:  { code:'MXP', city:'Milano',  country:'IT', checkInMin:90, transitMin:60,
               transport:'Malpensa Express da Centrale: ~50min (€13) | Taxi/Uber: ~€80-100, 50-60min' },
  linate:    { code:'LIN', city:'Milano',  country:'IT', checkInMin:90, transitMin:25,
               transport:'Metro M4 diretta: ~12min | Bus ATM 73: ~25min | Taxi: ~€20-25' },
  fiumicino: { code:'FCO', city:'Roma',    country:'IT', checkInMin:90, transitMin:45,
               transport:'Leonardo Express da Termini: ~32min (€14) | Taxi tariffa fissa €48 | FL1 regionale: ~35min (€8)' },
  ciampino:  { code:'CIA', city:'Roma',    country:'IT', checkInMin:90, transitMin:50,
               transport:'Bus Terravision da Termini: ~40min (€7) | SIT Bus: €7 | Taxi: ~€30-35' },
  orio:      { code:'BGY', city:'Milano',  country:'IT', checkInMin:90, transitMin:70,
               transport:'Orio Shuttle da Centrale: ~60min (€10) | Terravision: €10 | Taxi: ~€85-100' },
  venezia:   { code:'VCE', city:'Venezia', country:'IT', checkInMin:90, transitMin:35,
               transport:'Bus ATVO da Piazzale Roma: ~20min | Alilaguna: ~70min | Taxi acqueo: ~€15' },
  napoli:    { code:'NAP', city:'Napoli',  country:'IT', checkInMin:90, transitMin:30,
               transport:'Metro L1 (dir. Piscinola): ~15min | Taxi: ~€20-25 | Alibus da Centro: ~20min' },
  torino:    { code:'TRN', city:'Torino',  country:'IT', checkInMin:90, transitMin:45,
               transport:'Bus Sadem da Porta Nuova: ~40min (€8) | Taxi: ~€35-45' },
  bologna:   { code:'BLQ', city:'Bologna', country:'IT', checkInMin:90, transitMin:25,
               transport:'Marconi Express: ~7min (€4.50) | Taxi: ~€15-20' },
  // ── UNITED KINGDOM ─────────────────────────────────────────────────────────
  luton:     { code:'LTN', city:'London',  country:'UK', checkInMin:90, transitMin:55,
               transport:'🟢 OTTIMALE — Mildmay line → King\'s Cross → Thameslink LTN (~55min, £22-26 | TrainPal per split-ticket)\n🟡 ECONOMICO — National Express da Victoria (~90min, £4-8 prenota in anticipo)\n🔴 DIRETTO — Uber/Bolt (~55-65min, £55-75 M1)' },
  heathrow:  { code:'LHR', city:'London',  country:'UK', checkInMin:90, transitMin:55,
               transport:'🟢 OTTIMALE — Elizabeth Line da Paddington (~30min, £12.80 contactless)\n🟡 ECONOMICO — Piccadilly line da King\'s Cross (~55min, £6 Oyster)\n🔴 DIRETTO — Heathrow Express da Paddington (~15min, £25-37)' },
  gatwick:   { code:'LGW', city:'London',  country:'UK', checkInMin:90, transitMin:50,
               transport:'🟢 OTTIMALE — Thameslink da City Thameslink/Farringdon (~45min, £12)\n🟡 ECONOMICO — easyBus da Baker St (~75min, £3.99-8)\n🔴 PREMIUM — Gatwick Express da Victoria (~30min, £19.90)' },
  stansted:  { code:'STN', city:'London',  country:'UK', checkInMin:90, transitMin:65,
               transport:'🟢 OTTIMALE — Stansted Express da Liverpool St (~47min, £20 | split-ticket su TrainPal)\n🟡 ECONOMICO — National Express da Victoria (~75min, £6-12)\n🔴 DIRETTO — Uber/Bolt (~65-80min, £65-90 M11)' },
  manchester:{ code:'MAN', city:'Manchester', country:'UK', checkInMin:90, transitMin:30,
               transport:'🟢 OTTIMALE — Metrolink da Piccadilly: ~20min (£3.50)\n🔴 DIRETTO — Taxi: ~£30-40' },
  edinburgh: { code:'EDI', city:'Edinburgh', country:'UK', checkInMin:90, transitMin:35,
               transport:'🟢 OTTIMALE — Tram da St Andrews Square: ~35min (£7.50)\n🔴 DIRETTO — Taxi: ~£28-35' },
};

// ── WOLFE HOUSE, LONDON — step-by-step routes per airport ────────────────────
// Wolfe House, Canonbury, Islington N1 — nearest stations: Canonbury (Mildmay), Highbury & Islington
const WOLFE_HOUSE_ROUTES = {
  luton: {
    steps: [
      { icon:'🚶', text:'Walk 5 min → Canonbury station (Mildmay/Overground line)' },
      { icon:'🚇', text:'Mildmay line → Highbury & Islington (1 stop, 2 min)' },
      { icon:'🚇', text:'Victoria line southbound → King\'s Cross St Pancras (1 stop, 3 min)' },
      { icon:'🚶', text:'Walk 3 min → St Pancras International (Thameslink entrance)' },
      { icon:'🚂', text:'Thameslink → Luton Airport Parkway (35-45 min, £19.80 one-way)' },
      { icon:'🚌', text:'Shuttle bus to Luton terminal (10 min, £2.40 or included)' },
    ],
    totalMin: 62,
    cost: '~£23-26 (treno)',
    trainpalUrl: 'https://www.mytrainpal.com/train-journey/london-st-pancras-international-to-luton-airport-parkway',
    nationalExpressUrl: 'https://www.nationalexpress.com/en/destinations/london-luton-airport',
    rttUrl: 'https://www.realtimetrains.co.uk/search/detailed/gb-nr:STP/2026-03-18/',
    alternatives: [
      { name:'🟡 National Express (più economico)', desc:'Bus 4/19/73 → King\'s Cross/Victoria → National Express coach a LTN', cost:'£6-10 totale', time:'~1h 45min', url:'https://www.nationalexpress.com' },
      { name:'🔴 Uber/Bolt (più veloce)', desc:'Diretto da casa, M1 motorway', cost:'£55-75', time:'~55-65min', url:'https://bolt.eu/en-gb/' }
    ],
    tip:'💡 TrainPal split-ticket: St Pancras → Harpenden + Harpenden → LTN può risparmiare £3-6'
  },
  heathrow: {
    steps: [
      { icon:'🚶', text:'Walk 10 min → Highbury & Islington (Victoria line + Mildmay)' },
      { icon:'🚇', text:'Victoria line → King\'s Cross St Pancras' },
      { icon:'🚇', text:'Victoria line → Paddington (cambio a Oxford Circus o diretto)' },
      { icon:'🚂', text:'Elizabeth line da Paddington → Heathrow T2/3 (30 min, £12.80 contactless)' },
    ],
    totalMin: 55,
    cost:'~£15-18',
    tip:'💡 Piccadilly line alternativa: Highbury & Islington → King\'s Cross → Piccadilly diretto LHR (55min, £6 Oyster) — più lento ma molto più economico'
  },
  gatwick: {
    steps: [
      { icon:'🚶', text:'Walk/bus → Farringdon (Thameslink)' },
      { icon:'🚂', text:'Thameslink → Gatwick South terminal (45 min, £12-14 Thameslink)' },
    ],
    totalMin: 60,
    cost:'~£15-18',
    tip:'💡 easyBus alternativa: da Baker Street → LGW, da £3.99 prenotato — aggiunge ~30min ma risparmia £8-10'
  },
  stansted: {
    steps: [
      { icon:'🚇', text:'Mildmay line → Dalston Kingsland → Liverpool Street (Overground, ~25min)' },
      { icon:'🚂', text:'Stansted Express da Liverpool Street → STN (47 min, £20)' },
    ],
    totalMin: 75,
    cost:'~£22-25',
    trainpalUrl:'https://www.mytrainpal.com/train-journey/london-liverpool-street-to-stansted-airport',
    tip:'💡 National Express da Victoria ~£6-10, ma aggiunge ~20min per arrivare a Victoria'
  }
};

// Only explicit travel keywords — city names alone do NOT trigger detection
const TRAVEL_RX = /\b(volo|flight|aereo|aeroporto|airport|malpensa|linate|fiumicino|ciampino|orio al serio|luton|ltn|heathrow|lhr|gatwick|lgw|stansted|stn|manchester airport|man airport|edinburgh airport|wizz air|wizz|ryanair|easyjet|british airways|ita airways|lufthansa|alitalia|frecciarossa|frecciargento|trenitalia|italo treno|check-in online|boarding|imbarco|itinerario wizz|itinerario ryanair)\b/i;

function detectTravelInDay(day) {
  const results = [];
  // Only scan EVENTS for travel — tasks are too noisy (city names in task titles)
  const allItems = [...(day.events||[])];
  // Also include tasks that have explicit flight/train carrier names
  const travelTasks = (day.tasks||[]).filter(t => {
    const txt = ((t.title||'') + ' ' + (t.brief||'')).toLowerCase();
    return /\b(wizz air|ryanair|easyjet|ita airways|lufthansa|alitalia|trenitalia|italo treno|frecciarossa|itinerario wizz|itinerario ryanair|volo|aereo|treno|flight|train)\b/.test(txt);
  });
  allItems.push(...travelTasks);

  for (const item of allItems) {
    const text = ((item.title||'') + ' ' + (item.brief||'')).toLowerCase();
    if (!TRAVEL_RX.test(text)) continue;
    const isFlight = /\b(volo|flight|aereo|malpensa|linate|fiumicino|ciampino|orio al serio|luton|ltn|heathrow|lhr|gatwick|lgw|stansted|stn|wizz|ryanair|easyjet|british airways|ita airways|lufthansa|alitalia|imbarco|boarding|itinerario wizz|itinerario ryanair)\b/.test(text);
    const isTrain  = /\b(treno|train|trenitalia|italo treno|frecciarossa|frecciargento)\b/.test(text);
    if (!isFlight && !isTrain) continue;

    const timeMatch = (item.time||'').match(/(\d{1,2}):(\d{2})/);
    const time = timeMatch ? `${timeMatch[1].padStart(2,'0')}:${timeMatch[2]}` : null;

    // flight code (e.g. W6 1234, FR 5432, TS8L9H)
    const codeMatch = (item.title||'').match(/\b([A-Z0-9]{2,3}\s*[A-Z0-9]{3,6})\b/);
    const flightCode = codeMatch ? codeMatch[1].replace(/\s+/,'') : null;

    // destination & departure airport detection
    // Strategy: find all airports mentioned in text, then determine which is departure vs arrival.
    // Typically the FIRST mentioned airport in title order is departure → second is arrival.
    const CITY_MAP = [
      ['london','London'],['londra','London'],['luton','London'],['heathrow','London'],['gatwick','London'],['stansted','London'],
      ['malpensa','Milano'],['linate','Milano'],['orio al serio','Milano'],
      ['milano','Milano'],['milan','Milano'],
      ['fiumicino','Roma'],['ciampino','Roma'],['roma','Roma'],['rome','Roma'],
      ['fco','Roma'],['mxp','Milano'],['ltn','London'],['lhr','London'],['lgw','London'],['stn','London'],
      ['venezia','Venezia'],['venice','Venezia'],['vce','Venezia'],
      ['napoli','Napoli'],['naples','Napoli'],['nap','Napoli'],
      ['torino','Torino'],['bgy','Milano'],
      ['bologna','Bologna'],['blq','Bologna'],['firenze','Firenze'],
      ['parigi','Parigi'],['paris','Parigi'],['cdg','Parigi'],['ory','Parigi'],
      ['berlino','Berlino'],['berlin','Berlino'],['ber','Berlino'],
      ['amsterdam','Amsterdam'],['ams','Amsterdam'],
      ['bruxelles','Bruxelles'],['brussels','Bruxelles'],['bru','Bruxelles'],
      ['madrid','Madrid'],['mad','Madrid'],
      ['barcellona','Barcellona'],['barcelona','Barcellona'],['bcn','Barcellona'],
      ['manchester','Manchester'],['man','Manchester'],
      ['edinburgh','Edinburgh'],['edi','Edinburgh'],
      ['dublino','Dublino'],['dublin','Dublino'],['dub','Dublino'],
      ['lisbona','Lisbona'],['lisbon','Lisbona'],['lis','Lisbona'],
    ];

    let airport = item.airport || null;  // explicitly set field takes priority
    let destination = null;
    let originCity = null;

    // Find all airports in the text
    const detectedAirports = [];
    for (const ap of Object.keys(AIRPORT_LOGISTICS)) {
      if (text.includes(ap)) detectedAirports.push(ap);
    }

    if (airport && AIRPORT_LOGISTICS[airport]) {
      // Explicitly set airport field: use AIRPORT_LOGISTICS city as origin,
      // then find destination city from other airports/keywords
      originCity = AIRPORT_LOGISTICS[airport].city;
      // Look for other airports mentioned → that's the destination
      const otherAp = detectedAirports.find(a => a !== airport);
      if (otherAp) destination = AIRPORT_LOGISTICS[otherAp].city;
    } else if (detectedAirports.length >= 2) {
      // Multiple airports: first one = departure, second = destination
      airport = detectedAirports[0];
      originCity = AIRPORT_LOGISTICS[airport].city;
      destination = AIRPORT_LOGISTICS[detectedAirports[1]].city;
    } else if (detectedAirports.length === 1) {
      airport = detectedAirports[0];
      originCity = AIRPORT_LOGISTICS[airport].city;
      // destination is somewhere else — look for "→" in title
      const arrowMatch = (item.title||'').match(/[→>]\s*(.+)/);
      if (arrowMatch) {
        const afterArrow = arrowMatch[1].toLowerCase();
        for (const [kw, city] of CITY_MAP) {
          if (afterArrow.includes(kw) && city !== originCity) { destination = city; break; }
        }
      }
    }

    if (!destination) {
      // Fallback: find any city keyword in the text
      for (const [kw, city] of CITY_MAP) {
        if (text.includes(kw) && city !== originCity) { destination = city; break; }
      }
    }
    if (!destination && originCity) destination = originCity; // last resort: same as origin

    // departBy = flight_time − checkInMin − transitMin − 15min safety
    // This is the time to LEAVE HOME/CURRENT LOCATION, not to arrive at airport
    let logistics = null;
    if (time && airport && AIRPORT_LOGISTICS[airport]) {
      const ap = AIRPORT_LOGISTICS[airport];
      const [h, m] = time.split(':').map(Number);
      const flightMinutes = h * 60 + m;
      const departMinutes = flightMinutes - ap.checkInMin - (ap.transitMin || 0) - 15; // 15min safety buffer
      const dH = Math.floor(Math.max(0, departMinutes) / 60);
      const dM = Math.max(0, departMinutes) % 60;
      const arriveAtAirport = flightMinutes - ap.checkInMin;
      const aH = Math.floor(arriveAtAirport / 60), aM = arriveAtAirport % 60;
      logistics = {
        departBy: `${String(dH).padStart(2,'0')}:${String(dM).padStart(2,'0')}`,
        arriveBy: `${String(aH).padStart(2,'0')}:${String(aM).padStart(2,'0')}`,
        transport: ap.transport,
        country: ap.country || 'IT',
        tips: [
          `Essere in aeroporto entro le ${String(aH).padStart(2,'0')}:${String(aM).padStart(2,'0')} (${ap.checkInMin} min prima del decollo)`,
          'Verifica check-in online se non ancora fatto',
          isFlight && /wizz|ryanair|easyjet/.test(text) ? '⚠️ Low-cost: bagaglio a mano incluso — verifica dimensioni (40×30×20 Wizz, 40×20×25 Ryanair) e peso' : ''
        ].filter(Boolean)
      };
    } else if (isTrain && time) {
      const [h, m] = time.split(':').map(Number);
      // 30 min at station (user rule) + 15 min transit safety = 45 min before departure
      const departMinutes = h * 60 + m - TRAIN_STATION_MIN - 15;
      const dH = Math.floor(Math.max(0, departMinutes) / 60), dM = Math.max(0, departMinutes) % 60;
      const arriveMin = h * 60 + m - TRAIN_STATION_MIN;
      const aH = Math.floor(arriveMin / 60), aM = arriveMin % 60;
      logistics = {
        departBy: `${String(dH).padStart(2,'0')}:${String(dM).padStart(2,'0')}`,
        arriveBy: `${String(aH).padStart(2,'0')}:${String(aM).padStart(2,'0')}`,
        transport: 'In stazione almeno 30 min prima della partenza',
        tips: ['Scarica biglietto su app Trenitalia/Italo prima di partire', 'Controlla binario su display in stazione']
      };
    }

    results.push({ id: item.id, date: day.date, type: isFlight ? 'flight' : 'train',
      title: item.title, time, destination, airport, flightCode, logistics,
      sourceType: day.events?.find(e => e.id === item.id) ? 'event' : 'task' });
  }
  return results;
}

// GET /api/track/flight/:code  → real-time flight status
// Uses AviationStack if key configured (100 req/month free), else returns links only
app.get('/api/track/flight/:code', async (req, res) => {
  const code = req.params.code.toUpperCase().replace(/\s+/,'');
  const cfg  = readConfig();
  const date = req.query.date || new Date().toISOString().slice(0,10);

  // Build useful deep-link URLs (no API key needed)
  const links = {
    flightradar24: `https://www.flightradar24.com/${code.toLowerCase()}`,
    flightaware:   `https://www.flightaware.com/live/flight/${code}`,
    fr24_short:    `https://fr24.com/${code.toLowerCase()}`
  };

  // Try AviationStack if key is configured
  if (cfg.aviationstackKey) {
    try {
      const url = `http://api.aviationstack.com/v1/flights?access_key=${cfg.aviationstackKey}&flight_iata=${code}&flight_date=${date}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (data.data && data.data.length > 0) {
        const f = data.data[0];
        return res.json({
          source: 'aviationstack',
          status: f.flight_status,          // scheduled|active|landed|cancelled|diverted
          departure: {
            airport: f.departure?.airport,
            iata:    f.departure?.iata,
            scheduled: f.departure?.scheduled,
            actual:    f.departure?.actual,
            estimated: f.departure?.estimated,
            delay:     f.departure?.delay,
            gate:      f.departure?.gate,
            terminal:  f.departure?.terminal,
          },
          arrival: {
            airport: f.arrival?.airport,
            iata:    f.arrival?.iata,
            scheduled: f.arrival?.scheduled,
            estimated: f.arrival?.estimated,
            delay:     f.arrival?.delay,
          },
          airline: f.airline?.name,
          aircraft: f.aircraft?.registration,
          links
        });
      }
    } catch(e) {
      console.error('[track/flight]', e.message);
    }
  }

  // Fallback: try OpenSky Network (free, no key, position only when airborne)
  let openSkyData = null;
  try {
    const callsign = code.padEnd(8, ' '); // OpenSky callsigns are 8 chars padded
    const osResp = await fetch(`https://opensky-network.org/api/states/all`, { signal: AbortSignal.timeout(4000) });
    if (osResp.ok) {
      const osData = await osResp.json();
      const flight = (osData.states || []).find(s => s[1]?.trim().toUpperCase() === code);
      if (flight) {
        openSkyData = {
          callsign:  flight[1]?.trim(),
          lat:       flight[6],
          lon:       flight[5],
          altitude:  flight[7] ? Math.round(flight[7]) + 'm' : null,
          speed:     flight[9] ? Math.round(flight[9] * 3.6) + ' km/h' : null,
          heading:   flight[10] ? Math.round(flight[10]) + '°' : null,
          onGround:  flight[8],
          squawk:    flight[14]
        };
      }
    }
  } catch(e) { /* OpenSky offline or timed out */ }

  res.json({ source: openSkyData ? 'opensky' : 'links_only', openSkyData, links, note: 'Aggiungi aviationstackKey in config.json per dati completi (status, gate, ritardo).' });
});

// GET /api/track/train/:number  → real-time train status
// Supports: ViaggiaTreno (IT, no key), Realtime Trains (UK, optional key)
app.get('/api/track/train/:number', async (req, res) => {
  const trainNumber = req.params.number;
  const country     = (req.query.country || 'IT').toUpperCase();
  const cfg         = readConfig();

  if (country === 'UK') {
    // Realtime Trains API (free registration at api.rtt.io)
    if (cfg.rttUser && cfg.rttPass) {
      try {
        const crs  = req.query.crs || 'STP';
        const date = req.query.date || new Date().toISOString().slice(0,10).replace(/-/g,'/');
        const url  = `https://api.rtt.io/api/v1/json/search/${crs}`;
        const resp = await fetch(url, {
          headers: { Authorization: 'Basic ' + Buffer.from(`${cfg.rttUser}:${cfg.rttPass}`).toString('base64') }
        });
        const data = await resp.json();
        const services = (data.services || []).filter(s =>
          s.trainIdentity === trainNumber || s.serviceUid === trainNumber
        );
        return res.json({ source:'realtime_trains', services, rttUrl:`https://www.realtimetrains.co.uk/search/detailed/gb-nr:${crs}/${date.replace(/\//g,'-')}/` });
      } catch(e) { console.error('[track/train/UK]', e.message); }
    }
    return res.json({
      source: 'links_only',
      links: {
        rtt: `https://www.realtimetrains.co.uk/search/detailed/gb-nr:STP/${new Date().toISOString().slice(0,10)}/`,
        nationalRail: 'https://www.nationalrail.co.uk/journey-information/live-train-times/',
        trainline: `https://www.thetrainline.com/trains/great-britain/live-trains`
      },
      note: 'Aggiungi rttUser e rttPass in config.json per dati live UK (gratis su api.rtt.io)'
    });
  }

  // Italian trains — ViaggiaTreno (Trenitalia, no key needed)
  try {
    // Step 1: resolve origin station from train number
    const autoResp = await fetch(
      `http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/cercaNumeroTrenoTrenoAutocomplete/${trainNumber}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!autoResp.ok) throw new Error('ViaggiaTreno unavailable');
    const autoText = await autoResp.text();
    // Format: "12279 - VENEZIA SANTA LUCIA|12279-S09218"
    const parts = autoText.trim().split('|');
    if (!parts[1]) throw new Error('Train not found');
    const stationId = parts[1].split('-')[1];

    // Step 2: get real-time status
    const today = new Date(); today.setHours(0,0,0,0);
    const statusResp = await fetch(
      `http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/andamentoTreno/${stationId}/${trainNumber}/${today.getTime()}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (statusResp.status === 204) return res.json({ source:'viaggiatreno', status:'not_running', note:'Treno non in circolazione oggi' });
    const trainData = await statusResp.json();

    // Extract key info
    const stops = (trainData.fermate || []).map(f => ({
      name:     f.stazione,
      platform: f.binarioProgrammatoArrivoDescrizione || f.binarioEffettivoArrivoDescrizione || null,
      scheduled:f.programmataPartenza || f.programmataArrivo,
      actual:   f.effettivaPartenza   || f.effettivaArrivo,
      delay:    f.ritardoPartenza     || f.ritardoArrivo || 0,
      passed:   f.transitato
    }));

    return res.json({
      source:      'viaggiatreno',
      trainNumber: trainData.numeroTreno,
      origin:      trainData.origineDescrizione,
      destination: trainData.destinazioneDescrizione,
      delay:       trainData.ritardo || 0,
      status:      trainData.tipoTreno,
      lastUpdate:  trainData.oraUltimoRilevamento,
      lastStation: trainData.stazioneUltimoRilevamento,
      stops:       stops.slice(0, 20),
      links: {
        viaggiatreno: `https://www.viaggiatreno.it/infomobilita/p/it/cerca/treno/${trainNumber}`,
        trenitalia:   `https://www.trenitalia.com/it/informazioni/Orari-e-acquisto.html`
      }
    });
  } catch(e) {
    console.error('[track/train/IT]', e.message);
    return res.json({
      source: 'links_only',
      links: {
        viaggiatreno: `https://www.viaggiatreno.it/infomobilita/p/it/cerca/treno/${trainNumber}`,
        trenitalia:   'https://www.trenitalia.com'
      },
      note: 'ViaggiaTreno non disponibile al momento'
    });
  }
});

// GET /api/home-location/wolfe-house/route/:airport → step-by-step directions
app.get('/api/home-location/wolfe-house/route/:airport', (req, res) => {
  const airport = req.params.airport.toLowerCase();
  const route   = WOLFE_HOUSE_ROUTES[airport];
  if (!route) return res.json({ available: false, airport, message: 'Nessun percorso specifico configurato per questo aeroporto da Wolfe House' });
  res.json({ available: true, airport, home: 'Wolfe House, Canonbury, London N1', ...route });
});

// GET /api/transfers/week/:date → all travel for the 2-week window around :date
app.get('/api/transfers/week/:date', (req, res) => {
  const db = readDB();
  const ref = new Date(req.params.date + 'T12:00:00Z');
  const dow = (ref.getUTCDay() + 6) % 7;
  const mon = new Date(ref); mon.setUTCDate(ref.getUTCDate() - dow);
  const dates = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(mon); d.setUTCDate(mon.getUTCDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  const transfers = [];
  for (const date of dates) {
    const day = db.days[date]; if (!day) continue;
    detectTravelInDay({ ...day, date }).forEach(t => transfers.push(t));
  }
  res.json(transfers);
});

// GET /api/network/location-intel/:date → contacts matching Marco's location that day
app.get('/api/network/location-intel/:date', (req, res) => {
  const db = readDB();
  const date = req.params.date;
  const contacts = extractContactsFromTasks(db);
  const stored = db.contacts || {};

  // Determine Marco's city today: check travel events this day and next 2 days
  const ref = new Date(date + 'T12:00:00Z');
  let marcoCity = 'Bologna'; // home base
  let travelToday = null;
  for (let offset = -1; offset <= 2; offset++) {
    const d = new Date(ref); d.setUTCDate(ref.getUTCDate() + offset);
    const ds = d.toISOString().slice(0, 10);
    const day = db.days[ds]; if (!day) continue;
    const travels = detectTravelInDay({ ...day, date: ds });
    if (travels.length > 0) {
      if (offset === 0) travelToday = travels[0];
      if (offset >= 0 && travels[0].destination) { marcoCity = travels[0].destination; break; }
    }
  }

  const enriched = contacts.map(c => ({
    ...c,
    city:  stored[c.name]?.city  || null,
    notes: stored[c.name]?.notes || '',
    tags:  stored[c.name]?.tags  || [],
    linkedinUrl: stored[c.name]?.linkedinUrl || null
  }));

  const sameCity = enriched.filter(c => c.city && marcoCity &&
    c.city.toLowerCase().includes(marcoCity.toLowerCase().split(' ')[0]));

  res.json({ marcoCity, travelToday, sameCity, allContacts: enriched });
});

// GET /api/day/:date/briefing/generate → rich AI executive daily brief
app.get('/api/day/:date/briefing/generate', async (req, res) => {
  const db = readDB();
  const date = req.params.date;
  const day = db.days[date] || { tasks: [], events: [], items: {}, health: {} };

  const tasks   = day.tasks  || [];
  const items   = day.items  || {};
  const health  = day.health || {};
  const events  = day.events || [];

  const pendingTasks   = tasks.filter(t => !items[t.id]?.done);
  const completedTasks = tasks.filter(t => items[t.id]?.done);
  const q1 = pendingTasks.filter(t => (t.quadrant||'Q2').toUpperCase() === 'Q1');
  const q2 = pendingTasks.filter(t => (t.quadrant||'Q2').toUpperCase() === 'Q2');
  const carried = tasks.filter(t => t.carriedFrom).length;

  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  // Separate calendar events from transfers
  const TRANSFER_TITLE_SV = /\b(volo|flight|aereo|malpensa|linate|fiumicino|ciampino|luton|heathrow|gatwick|stansted|wizz|ryanair|easyjet|british airways|ita airways|lufthansa|alitalia|frecciarossa|frecciargento|trenitalia|imbarco|boarding)\b/i;
  const calEvents   = events.filter(e => e.type !== 'transfer' && !TRANSFER_TITLE_SV.test(e.title||''));
  const todayTravels = detectTravelInDay({ ...day, date });

  // Open action points count
  const openAPs = Object.values(items)
    .flatMap(i => (i.actionPoints||[]).filter(ap => !ap.done)).length;

  // Contacts needing follow-up
  const contactsData = extractContactsFromTasks(db);
  const urgentContacts = contactsData.filter(c => c.urgentTasks.length > 0).slice(0, 5);

  // ── Build a fallback text briefing (shown if AI is unavailable) ───────────
  const lines = [`📅 ${dateLabel}`];
  if (health.sleepScore || health.sleepDuration) {
    lines.push(`🛌 Sonno: ${health.sleepDuration||''}${health.sleepScore ? ' · Score '+health.sleepScore : ''}${health.readiness ? ' · Readiness '+health.readiness : ''}`.trim());
  }
  lines.push(`📋 ${pendingTasks.length} task aperti (${carried} riportati) · ${completedTasks.length} completati`);
  if (q1.length) lines.push(`🔴 Q1: ${q1.slice(0,3).map(t=>t.title.replace(/^🗂\s*/,'').split('·')[0].trim()).join(' / ')}`);
  if (q2.length) lines.push(`🟡 Q2: ${q2.slice(0,3).map(t=>t.title.replace(/^🗂\s*/,'').split('·')[0].trim()).join(' / ')}`);
  if (calEvents.length) lines.push(`📆 ${calEvents.length} riunioni: ${calEvents.slice(0,3).map(e=>`${e.time||''} ${e.title}`).join(' / ')}`);
  if (todayTravels.length) {
    const t = todayTravels[0];
    lines.push(`✈️ ${t.type==='flight'?'Volo':'Treno'} per ${t.destination||'?'} alle ${t.time||'?'}`);
    if (t.logistics?.departBy) lines.push(`🚕 Parti da casa entro le ${t.logistics.departBy} (arrivo in aeroporto: ${t.logistics.arriveBy||'?'})`);
  }
  if (urgentContacts.length) lines.push(`👤 Follow-up urgenti: ${urgentContacts.map(c=>c.name).join(', ')}`);
  const briefing = lines.join('\n');

  // ── AI Executive Daily Brief ──────────────────────────────────────────────
  let narrative = null;
  const cfg = readConfig();
  if (cfg.anthropicApiKey) {
    try {
      const { default: Anthropic } = require('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: cfg.anthropicApiKey });

      // Build structured context
      const taskDetail = pendingTasks.slice(0, 20).map(t => {
        const q = (t.quadrant||'Q2').toUpperCase();
        const aps = (items[t.id]?.actionPoints||[]).filter(ap=>!ap.done).length;
        return `[${q}] ${t.title.replace(/^🗂\s*/,'').trim()}${aps>0?` (${aps} AP aperti)`:''}${t.carriedFrom?' ← RIPORTATO':''}`;
      }).join('\n');

      const evtDetail = calEvents.map(e =>
        `• ${e.time||'orario da conf.'} — ${e.title}${e.participants?' (con: '+e.participants.split(',')[0]+')':''}`
      ).join('\n');

      let travelDetail = '';
      if (todayTravels.length > 0) {
        const t = todayTravels[0];
        const ap = t.airport ? AIRPORT_LOGISTICS[t.airport] : null;
        travelDetail = `
TRASFERIMENTO OGGI:
• ${t.type==='flight'?'Volo':'Treno'}: ${t.title||''} — decollo ${t.time||'?'} ora locale
• Destinazione: ${t.destination||'?'}${ap ? ` (${ap.code})` : ''}
• PARTIRE DA CASA entro le: ${t.logistics?.departBy||'calcolo non disponibile'}
• Essere in aeroporto entro: ${t.logistics?.arriveBy||'?'}
• Come arrivare: ${t.logistics?.transport||''}
• IMPORTANTE: pianifica le attività mattutine in modo da chiuderle PRIMA della partenza`;
      }

      const healthDetail = [
        health.sleepScore ? `Sleep score: ${health.sleepScore}/100` : '',
        health.sleepDuration ? `Durata sonno: ${health.sleepDuration}` : '',
        health.readiness ? `Readiness: ${health.readiness}` : '',
        health.hrv ? `HRV: ${health.hrv}` : ''
      ].filter(Boolean).join(' · ');

      const followUpDetail = urgentContacts.length > 0
        ? urgentContacts.map(c => `• ${c.name}: ${c.urgentTasks[0]?.title||''}`).join('\n')
        : 'Nessuno urgente';

      const prompt = `Sei il chief of staff di Marco Giacomello — managing partner, imprenditore con portfolio di aziende, base tra Milano e Londra. Ogni mattina scrivi il suo daily brief: un testo discorsivo, denso, operativo — non motivazionale.

DATA: ${dateLabel}
${healthDetail ? 'STATO FISICO: ' + healthDetail : ''}

AGENDA OGGI:
${evtDetail || '— Nessuna riunione in calendario'}
${travelDetail}

TASK IN SOSPESO (${pendingTasks.length} totali, ${carried} riportati da giorni precedenti):
${taskDetail || '— Nessun task'}

ACTION POINTS APERTI: ${openAPs}

FOLLOW-UP PRIORITARI:
${followUpDetail}

Scrivi un daily brief in italiano, in prosa continua, 3-4 paragrafi, 200-280 parole. Il brief deve:

1. QUADRO DELLA GIORNATA: Che tipo di giornata è (operativa, strategica, in movimento)? Qual è il livello di carico e sforzo reale richiesto?

2. SEQUENZA TEMPORALE: Descrivi come si articola la giornata nell'ordine giusto. Se c'è un trasferimento, costruisci il ritmo attorno ad esso — cosa deve succedere PRIMA e cosa può aspettare. Sii preciso sugli orari.

3. PRIORITÀ E STRATEGIA: Dei task aperti, quali sono quelli che Marco deve chiudere OGGI con ragionamento concreto (impatto, scadenza, bloccante per altri). Cosa si può delegare, spostare o eliminare.

4. FOCUS: Chiudi con una frase tagliente su dove concentrare l'energia — non generica, specifica alla situazione di oggi.

Tono: diretto, da pari a pari — non servile. Come un ottimo COO che parla al CEO. Zero luoghi comuni, zero bullet points, solo prosa.`;

      const resp = await client.messages.create({
        model: cfg.aiModel || 'claude-3-5-sonnet-20241022',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }]
      });
      narrative = resp.content[0]?.text || null;
    } catch(e) {
      console.error('[Briefing AI]', e.message);
    }
  }

  res.json({ briefing, narrative });
});

// POST /api/day/:date/network  → save detected city + networking events
app.post('/api/day/:date/network', (req, res) => {
  const db = readDB();
  const day = ensureDay(db, req.params.date);
  day.network = req.body;
  writeDB(db);
  res.json({ ok: true });
});

// POST /api/day/:date/health  → save/merge health data from Apple Health (via Shortcut)
app.post('/api/day/:date/health', (req, res) => {
  const db = readDB();
  const day = ensureDay(db, req.params.date);
  // Merge so Shortcut raw metrics + SKILL recommendations coexist
  day.health = Object.assign({}, day.health || {}, req.body);
  writeDB(db);
  res.json({ ok: true });
});

// ── STATS ─────────────────────────────────────────────────────────────────

// GET /api/stats/week/:date  → weekly task completion (Target 100)
app.get('/api/stats/week/:date', (req, res) => {
  const db = readDB();
  const monday = isoWeekStart(req.params.date);
  let total = 0, done = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday + 'T12:00:00');
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const day = db.days[dateStr];
    if (!day) continue;
    (day.tasks || []).forEach(task => {
      total++;
      if ((day.items[task.id] || {}).done) done++;
    });
  }
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  res.json({ week: monday, total, done, pct });
});

function isoWeekStart(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// POST /api/carry-forward  → move incomplete tasks to tomorrow
// POST /api/auto-carry-forward/:date  → find last day with tasks and carry forward to :date
app.post('/api/auto-carry-forward/:date', (req, res) => {
  const toDate = req.params.date;
  const db = readDB();
  const toDay = ensureDay(db, toDate);

  // Already has tasks → nothing to do
  if (toDay.tasks.length > 0) return res.json({ ok: true, carried: 0, fromDate: null });

  // Find the most recent previous day with tasks (look back up to 30 days)
  const sorted = Object.keys(db.days).filter(d => d < toDate).sort().reverse();
  const fromDate = sorted.find(d => (db.days[d].tasks?.length || 0) > 0);
  if (!fromDate) return res.json({ ok: true, carried: 0, fromDate: null });

  const fromDay = db.days[fromDate];
  let carried = 0;
  fromDay.tasks.forEach(task => {
    const state = fromDay.items[task.id];
    if (!state || !state.done) {
      const exists = toDay.tasks.find(t => t.id === task.id);
      if (!exists) {
        toDay.tasks.push({ ...task, carriedFrom: fromDate });
        toDay.items[task.id] = { done: false, comment: state?.comment || '', actionPoints: state?.actionPoints || [], quadrant: state?.quadrant || 'Q1', type: 'task' };
        carried++;
      }
    }
  });

  writeDB(db);
  res.json({ ok: true, carried, fromDate });
});

app.post('/api/carry-forward', (req, res) => {
  const { fromDate, toDate } = req.body;
  const db = readDB();
  const fromDay = db.days[fromDate];
  if (!fromDay) return res.json({ ok: true, carried: 0 });

  const toDay = ensureDay(db, toDate);
  let carried = 0;

  fromDay.tasks.forEach(task => {
    const state = fromDay.items[task.id];
    if (!state || !state.done) {
      const exists = toDay.tasks.find(t => t.id === task.id);
      if (!exists) {
        toDay.tasks.push({ ...task, carriedFrom: fromDate });
        toDay.items[task.id] = { done: false, comment: '', actionPoints: [], quadrant: state?.quadrant || 'Q1', type: 'task' };
        carried++;
      }
    }
  });

  writeDB(db);
  res.json({ ok: true, carried });
});

// ── MONTH ROUTES ──────────────────────────────────────────────────────────────

// GET /api/month/:ym  → month summary + KPIs + objectives
app.get('/api/month/:ym', (req, res) => {
  const db = readDB();
  const month = db.months[req.params.ym] || { kpis: [], objectives: [], completedItems: 0, totalItems: 0 };

  // Compute totalItems from all days in this month
  const total = Object.entries(db.days)
    .filter(([d]) => d.startsWith(req.params.ym))
    .reduce((sum, [, day]) => sum + Object.keys(day.items || {}).length, 0);
  const completed = Object.entries(db.days)
    .filter(([d]) => d.startsWith(req.params.ym))
    .reduce((sum, [, day]) => sum + Object.values(day.items || {}).filter(i => i.done).length, 0);

  res.json({ ...month, totalItems: total, completedItems: completed });
});

// POST /api/month/:ym/kpi  → add KPI
app.post('/api/month/:ym/kpi', (req, res) => {
  const db = readDB();
  const month = ensureMonth(db, req.params.ym);
  const kpi = { id: Date.now().toString(), name: req.body.name, target: req.body.target, current: req.body.current || 0, unit: req.body.unit || '' };
  month.kpis.push(kpi);
  writeDB(db);
  res.json({ ok: true, kpi });
});

// PATCH /api/month/:ym/kpi/:id  → update KPI current value
app.patch('/api/month/:ym/kpi/:id', (req, res) => {
  const db = readDB();
  const month = ensureMonth(db, req.params.ym);
  const kpi = month.kpis.find(k => k.id === req.params.id);
  if (kpi) Object.assign(kpi, req.body);
  writeDB(db);
  res.json({ ok: true, kpi });
});

// DELETE /api/month/:ym/kpi/:id  → delete KPI
app.delete('/api/month/:ym/kpi/:id', (req, res) => {
  const db = readDB();
  const month = ensureMonth(db, req.params.ym);
  month.kpis = month.kpis.filter(k => k.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// POST /api/month/:ym/objective  → add objective
app.post('/api/month/:ym/objective', (req, res) => {
  const db = readDB();
  const month = ensureMonth(db, req.params.ym);
  const obj = { id: Date.now().toString(), name: req.body.name, status: req.body.status || 'todo', notes: '' };
  month.objectives.push(obj);
  writeDB(db);
  res.json({ ok: true, objective: obj });
});

// PATCH /api/month/:ym/objective/:id  → update objective
app.patch('/api/month/:ym/objective/:id', (req, res) => {
  const db = readDB();
  const month = ensureMonth(db, req.params.ym);
  const obj = month.objectives.find(o => o.id === req.params.id);
  if (obj) Object.assign(obj, req.body);
  writeDB(db);
  res.json({ ok: true, objective: obj });
});

// DELETE /api/month/:ym/objective/:id  → delete objective
app.delete('/api/month/:ym/objective/:id', (req, res) => {
  const db = readDB();
  const month = ensureMonth(db, req.params.ym);
  month.objectives = month.objectives.filter(o => o.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// ── PROJECTS ──────────────────────────────────────────────────────────────────

function getProjects(db) {
  if (!db.projects) db.projects = [];
  return db.projects;
}

// GET /api/projects
app.get('/api/projects', (req, res) => {
  const db = readDB();
  res.json(getProjects(db));
});

// POST /api/projects
app.post('/api/projects', (req, res) => {
  const db = readDB();
  const projects = getProjects(db);
  const proj = {
    id: 'proj-' + Date.now(),
    title: req.body.title || 'Nuovo progetto',
    client: req.body.client || '',
    color: req.body.color || '#7c6af7',
    status: req.body.status || 'active',
    description: req.body.description || '',
    tasks: [],
    notes: req.body.notes || '',
    links: [],
    fromItemId: req.body.fromItemId || null,
    createdAt: new Date().toISOString().slice(0, 10)
  };
  projects.push(proj);
  writeDB(db);
  res.json({ ok: true, project: proj });
});

// PATCH /api/projects/:id
app.patch('/api/projects/:id', (req, res) => {
  const db = readDB();
  const proj = getProjects(db).find(p => p.id === req.params.id);
  if (!proj) return res.status(404).json({ error: 'not found' });
  const allowed = ['title','client','color','status','description','notes'];
  allowed.forEach(k => { if (req.body[k] !== undefined) proj[k] = req.body[k]; });
  writeDB(db);
  res.json({ ok: true, project: proj });
});

// DELETE /api/projects/:id
app.delete('/api/projects/:id', (req, res) => {
  const db = readDB();
  db.projects = getProjects(db).filter(p => p.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// POST /api/projects/:id/task
app.post('/api/projects/:id/task', (req, res) => {
  const db = readDB();
  const proj = getProjects(db).find(p => p.id === req.params.id);
  if (!proj) return res.status(404).json({ error: 'not found' });
  const task = { id: 'pt-' + Date.now(), text: req.body.text, done: false, createdAt: new Date().toISOString() };
  proj.tasks.push(task);
  writeDB(db);
  res.json({ ok: true, task });
});

// PATCH /api/projects/:id/task/:tid
app.patch('/api/projects/:id/task/:tid', (req, res) => {
  const db = readDB();
  const proj = getProjects(db).find(p => p.id === req.params.id);
  const task = proj?.tasks.find(t => t.id === req.params.tid);
  if (task) Object.assign(task, req.body);
  writeDB(db);
  res.json({ ok: true });
});

// DELETE /api/projects/:id/task/:tid
app.delete('/api/projects/:id/task/:tid', (req, res) => {
  const db = readDB();
  const proj = getProjects(db).find(p => p.id === req.params.id);
  if (proj) proj.tasks = proj.tasks.filter(t => t.id !== req.params.tid);
  writeDB(db);
  res.json({ ok: true });
});

// POST /api/projects/:id/link
app.post('/api/projects/:id/link', (req, res) => {
  const db = readDB();
  const proj = getProjects(db).find(p => p.id === req.params.id);
  if (!proj) return res.status(404).json({ error: 'not found' });
  const link = { id: 'lnk-' + Date.now(), label: req.body.label || '', url: req.body.url };
  proj.links.push(link);
  writeDB(db);
  res.json({ ok: true, link });
});

// DELETE /api/projects/:id/link/:lid
app.delete('/api/projects/:id/link/:lid', (req, res) => {
  const db = readDB();
  const proj = getProjects(db).find(p => p.id === req.params.id);
  if (proj) proj.links = proj.links.filter(l => l.id !== req.params.lid);
  writeDB(db);
  res.json({ ok: true });
});

// ── PIPELINE ───────────────────────────────────────────────────────────────────

function getPipeline(db) {
  if (!db.pipeline) db.pipeline = { deals: [], invoices: [] };
  return db.pipeline;
}

// GET /api/pipeline
app.get('/api/pipeline', (req, res) => {
  const db = readDB();
  res.json(getPipeline(db));
});

// POST /api/pipeline/deal
app.post('/api/pipeline/deal', (req, res) => {
  const db = readDB();
  const pipeline = getPipeline(db);
  const deal = {
    id: 'deal-' + Date.now(),
    title: req.body.title || 'Nuovo deal',
    client: req.body.client || '',
    value: Number(req.body.value) || 0,
    stage: req.body.stage || 'prospect',
    probability: Number(req.body.probability) || 50,
    expectedClose: req.body.expectedClose || '',
    notes: req.body.notes || '',
    createdAt: new Date().toISOString().slice(0, 10)
  };
  pipeline.deals.push(deal);
  writeDB(db);
  res.json({ ok: true, deal });
});

// PATCH /api/pipeline/deal/:id
app.patch('/api/pipeline/deal/:id', (req, res) => {
  const db = readDB();
  const deal = getPipeline(db).deals.find(d => d.id === req.params.id);
  if (!deal) return res.status(404).json({ error: 'not found' });
  Object.assign(deal, req.body);
  writeDB(db);
  res.json({ ok: true, deal });
});

// DELETE /api/pipeline/deal/:id
app.delete('/api/pipeline/deal/:id', (req, res) => {
  const db = readDB();
  const pipeline = getPipeline(db);
  pipeline.deals = pipeline.deals.filter(d => d.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// POST /api/pipeline/invoices  → replace/merge invoices (key = uid if present, else number+year)
app.post('/api/pipeline/invoices', (req, res) => {
  const db = readDB();
  const pipeline = getPipeline(db);
  const incoming = Array.isArray(req.body) ? req.body : [];
  // Merge by uid (number-year) for multi-year support, fallback to number
  incoming.forEach(inv => {
    const key = inv.uid || inv.number;
    const idx = pipeline.invoices.findIndex(i => (i.uid || i.number) === key);
    if (idx >= 0) pipeline.invoices[idx] = inv;
    else pipeline.invoices.push(inv);
  });
  writeDB(db);
  res.json({ ok: true, count: incoming.length });
});

// DELETE /api/pipeline/invoices  → clear all invoices
app.delete('/api/pipeline/invoices', (req, res) => {
  const db = readDB();
  getPipeline(db).invoices = [];
  writeDB(db);
  res.json({ ok: true });
});

// POST /api/pipeline/target  → save annual revenue target
app.post('/api/pipeline/target', (req, res) => {
  const db = readDB();
  const pipeline = getPipeline(db);
  if (!pipeline.targets) pipeline.targets = {};
  pipeline.targets[String(req.body.year)] = Number(req.body.amount);
  writeDB(db);
  res.json({ ok: true });
});

// DELETE /api/pipeline/target/:year  → remove target for a year
app.delete('/api/pipeline/target/:year', (req, res) => {
  const db = readDB();
  const pipeline = getPipeline(db);
  if (pipeline.targets) delete pipeline.targets[req.params.year];
  writeDB(db);
  res.json({ ok: true });
});

// ── GOOGLE OAUTH (Fit + Classroom) ────────────────────────────────────────────

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/auth/google/callback`;
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/fitness.body.read',
  'https://www.googleapis.com/auth/fitness.sleep.read',
  'https://www.googleapis.com/auth/fitness.activity.read',
  'https://www.googleapis.com/auth/fitness.heart_rate.read',
  'https://www.googleapis.com/auth/fitness.reproductive_health.read',
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.students.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
  'https://www.googleapis.com/auth/classroom.announcements.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/drive.readonly',
  'openid', 'email', 'profile'
].join(' ');

// Redirect to Google OAuth consent
app.get('/auth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(503).send(
    '<h2>⚙️ Configura Google OAuth</h2>' +
    '<p>Imposta le variabili d\'ambiente <strong>GOOGLE_CLIENT_ID</strong> e <strong>GOOGLE_CLIENT_SECRET</strong> ' +
    'nel launchd plist, poi riavvia il server.</p>'
  );
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID, redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code', scope: GOOGLE_SCOPES,
    access_type: 'offline', prompt: 'consent'
  });
  res.redirect(url);
});

// OAuth callback — exchange code for tokens, identify user, create session
app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing code');
  try {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: GOOGLE_REDIRECT_URI, grant_type: 'authorization_code' })
    });
    const tokens = await resp.json();

    // Get Google profile to identify the user
    const profileResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const profile = await profileResp.json();
    const uid = profile.id;
    if (!uid) return res.status(400).send('Could not identify Google user');

    // Register user in global registry
    const users = readUsers();
    users[uid] = {
      id: uid, email: profile.email, name: profile.name, picture: profile.picture,
      lastLogin: new Date().toISOString(),
      createdAt: users[uid]?.createdAt || new Date().toISOString()
    };
    writeUsers(users);

    // Store Google tokens in user's own DB
    const userDb = readDBForUid(uid);
    userDb.googleTokens = {
      refresh_token: tokens.refresh_token || userDb.googleTokens?.refresh_token,
      access_token: tokens.access_token,
      expires_at: Date.now() + (tokens.expires_in || 3600) * 1000
    };
    writeDBForUid(uid, userDb);

    // Create session — salva esplicitamente prima del redirect (critico in produzione)
    req.session.userId = uid;
    req.session.userEmail = profile.email;
    req.session.userName = profile.name;
    req.session.userPicture = profile.picture;

    req.session.save(err => {
      if (err) console.error('Session save error:', err);
      res.redirect('/app.html');
    });
  } catch (e) { res.status(500).send('Errore login: ' + e.message); }
});

// GET /auth/google/status  → is Google connected for current user?
app.get('/auth/google/status', (req, res) => {
  const uid = req.session?.userId;
  if (!uid) return res.json({ connected: false });
  const db = readDBForUid(uid);
  res.json({ connected: !!db.googleTokens?.refresh_token, lastSync: db.googleLastSync || null });
});

// DELETE /auth/google  → disconnect Google for current user
app.delete('/auth/google', (req, res) => {
  const db = readDB();
  delete db.googleTokens;
  delete db.googleLastSync;
  writeDB(db);
  res.json({ ok: true });
});

// GET /api/health  → always 200, for Render health checks
app.get('/api/health', (req, res) => res.json({ ok: true }));

// GET /api/me  → current session user
app.get('/api/me', (req, res) => {
  const uid = req.session?.userId;
  if (!uid) return res.status(401).json({ error: 'Not authenticated' });
  const users = readUsers();
  const u = users[uid] || {};
  res.json({ uid, email: req.session.userEmail, name: req.session.userName, picture: req.session.userPicture, googleConnected: !!readDBForUid(uid).googleTokens?.refresh_token });
});

// GET /api/users  → all registered users (for team task assignment)
app.get('/api/users', (req, res) => {
  const users = readUsers();
  res.json(Object.values(users).map(u => ({ id: u.id, name: u.name, email: u.email, picture: u.picture })));
});

// POST /api/logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

async function getGoogleAccessToken() {
  const db = readDB();
  const tokens = db.googleTokens;
  if (!tokens?.refresh_token || !GOOGLE_CLIENT_ID) {
    console.log('[Auth] No refresh_token or no CLIENT_ID — skip');
    return null;
  }
  if (!tokens.access_token || Date.now() > (tokens.expires_at || 0) - 300000) {
    console.log('[Auth] Refreshing access token...');
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ refresh_token: tokens.refresh_token, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, grant_type: 'refresh_token' })
    });
    const refreshed = await resp.json();
    console.log('[Auth] Refresh result:', refreshed.access_token ? 'OK' : JSON.stringify(refreshed.error || refreshed));
    if (!refreshed.access_token) return null;
    tokens.access_token = refreshed.access_token;
    tokens.expires_at   = Date.now() + (refreshed.expires_in || 3600) * 1000;
    const freshDb = readDB();
    freshDb.googleTokens = tokens;
    writeDB(freshDb);
  }
  return tokens.access_token;
}

// ── Google Fit poller ─────────────────────────────────────────────────────────

async function pollGoogleFit() {
  const token = await getGoogleAccessToken();
  if (!token) return;
  const today   = new Date();
  const dateStr = today.toISOString().slice(0, 10);
  // Activity window: midnight Italian time → +24h
  const startMs = new Date(dateStr + 'T00:00:00+01:00').getTime();
  const endMs   = startMs + 86400000;
  // Sleep window: starts 20:00 previous calendar day Italian time (captures full night)
  // Derive prevDate directly from dateStr to avoid timezone-offset off-by-one
  const _pd = new Date(dateStr + 'T12:00:00Z'); _pd.setDate(_pd.getDate() - 1);
  const prevDate    = _pd.toISOString().slice(0, 10);
  const sleepStart  = new Date(prevDate + 'T20:00:00+01:00').getTime();
  const sleepEnd    = new Date(dateStr  + 'T14:00:00+01:00').getTime();

  // Also fetch last 7 days for trends
  const weekStartMs = startMs - 6 * 86400000;

  try {
    // Helper: safe Fit aggregate (skips forbidden types)
    const fitAggregate = async (aggregateBy, bucketByTime, startMs, endMs) => {
      const resp = await fetch('https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ aggregateBy, bucketByTime, startTimeMillis: startMs, endTimeMillis: endMs })
      });
      const data = await resp.json();
      if (data.error) {
        // If a single type blocked the call, retry with that type removed
        if (data.error.code === 403 && data.error.message?.includes('Cannot read data of type')) {
          const blocked = data.error.message.match(/com\.google\.\S+/)?.[0];
          console.log('[Fit] Removing blocked type:', blocked);
          const filtered = aggregateBy.filter(a => a.dataTypeName !== blocked);
          if (filtered.length === 0) return null;
          return fitAggregate(filtered, bucketByTime, startMs, endMs);
        }
        console.error('[Fit] API error:', JSON.stringify(data.error));
        return null;
      }
      return data;
    };

    // ── today single-day bucket ─────────────────────────────────────────────
    const todayData = await fitAggregate([
      { dataTypeName: 'com.google.heart_rate.bpm' },
      { dataTypeName: 'com.google.step_count.delta' },
      { dataTypeName: 'com.google.calories.expended' },
      { dataTypeName: 'com.google.distance.delta' },
      { dataTypeName: 'com.google.active_minutes' },
      { dataTypeName: 'com.google.weight' },
    ], { durationMillis: endMs - startMs }, startMs, endMs);
    if (!todayData) return;

    // ── 7-day daily buckets for trends ──────────────────────────────────────
    const trendData = await fitAggregate([
      { dataTypeName: 'com.google.heart_rate.bpm' },
      { dataTypeName: 'com.google.step_count.delta' },
      { dataTypeName: 'com.google.calories.expended' },
      { dataTypeName: 'com.google.active_minutes' },
    ], { durationMillis: 86400000 }, weekStartMs, endMs);

    // ── Sleep: raw RingConn dataset (aggregate doesn't return sleep segments)
    // Use string concatenation to avoid float precision loss (ms→ns = append 6 zeros)
    const sleepDsId    = 'raw:com.google.sleep.segment:com.gdjztech.ringconn:health_platform';
    const sleepStartNs = sleepStart.toString() + '000000';
    const sleepEndNs   = sleepEnd.toString()   + '000000';
    const sleepRaw = await fetch(
      `https://www.googleapis.com/fitness/v1/users/me/dataSources/${sleepDsId}/datasets/${sleepStartNs}-${sleepEndNs}`,
      { headers: { Authorization: `Bearer ${token}` } }
    ).then(r => r.json()).catch(() => null);

    // ── Resting HR: dedicated derived source
    const restingDsId = 'derived:com.google.heart_rate.bpm:com.google.android.gms:resting_heart_rate';
    const restingRaw = await fetch(
      `https://www.googleapis.com/fitness/v1/users/me/dataSources/${restingDsId}/datasets/${startMs.toString() + '000000'}-${endMs.toString() + '000000'}`,
      { headers: { Authorization: `Bearer ${token}` } }
    ).then(r => r.json()).catch(() => null);

    const health = extractFitData(todayData);

    // Merge sleep from raw RingConn points
    // Types: 1=awake, 2=sleep(summary), 3=out-of-bed, 4=light, 5=deep, 6=rem, 7=light2
    // Use only detailed stages (4,5,6,7) to avoid double-counting with the type=2 envelope
    // Also filter by the actual sleep window to avoid stale data
    if (sleepRaw?.point?.length > 0) {
      let totalMin = 0, deepMin = 0, remMin = 0;
      // Filter to only points that START within the sleep window
      const windowPts = sleepRaw.point.filter(p => {
        const startNs = BigInt(p.startTimeNanos);
        return startNs >= BigInt(sleepStartNs) && startNs < BigInt(sleepEndNs);
      });
      const hasDetailedStages = windowPts.some(p => [4,5,6,7].includes(p.value?.[0]?.intVal));
      for (const p of windowPts) {
        const type   = p.value?.[0]?.intVal;
        const durMin = (Number(p.endTimeNanos) - Number(p.startTimeNanos)) / 1e9 / 60;
        // If detailed stages exist, count only those; otherwise fall back to type=2
        if (hasDetailedStages ? [4,5,6,7].includes(type) : type === 2) totalMin += durMin;
        if (type === 5) deepMin += durMin;
        if (type === 6) remMin  += durMin;
      }
      if (totalMin > 0) {
        const toHHMM = m => `${Math.floor(m/60)}h ${Math.round(m%60)}m`;
        health.sleepMin      = Math.round(totalMin);
        health.sleepDuration = toHHMM(totalMin);
        health.sleepScore    = Math.min(100, Math.round(totalMin / 480 * 100));
        if (deepMin > 0) health.deepSleep = toHHMM(deepMin);
        if (remMin  > 0) health.remSleep  = toHHMM(remMin);
      }
    }

    // Merge resting HR
    if (restingRaw?.point?.length > 0) {
      const lastPt = restingRaw.point[restingRaw.point.length - 1];
      const rhr = lastPt?.value?.[0]?.fpVal;
      if (rhr) health.restingHR = Math.round(rhr);
    }

    if (Object.keys(health).length > 0) {
      const db  = readDB();
      const day = ensureDay(db, dateStr);
      day.health = Object.assign({}, day.health || {}, health, { recordedAt: new Date().toISOString(), source: 'google_fit' });
      if (trendData) db.fitTrends = extractFitTrends(trendData);
      db.googleLastSync = new Date().toISOString();
      writeDB(db);
      console.log(`[Fit] Synced ${dateStr}: steps=${health.steps||0} hr=${health.hrAvg||0}bpm kcal=${health.calories||0} sleep=${health.sleepDuration||'–'}`);
    } else {
      console.log('[Fit] No health data extracted from API response');
    }
  } catch (e) { console.error('[Fit] Error:', e.message); }
}

function extractFitData(fitResponse) {
  const h = {};
  (fitResponse?.bucket || []).forEach(bucket => {
    (bucket.dataset || []).forEach(ds => {
      const src = ds.dataSourceId || '';
      (ds.point || []).forEach(pt => {
        const vals = pt.value || [];
        const v0f  = vals[0]?.fpVal;
        const v0i  = vals[0]?.intVal;

        if (src.includes('heart_rate')) {
          // aggregate returns [avg, max, min]
          const avg = v0f || v0i;
          const max = vals[1]?.fpVal || vals[1]?.intVal;
          const min = vals[2]?.fpVal || vals[2]?.intVal;
          if (avg) h.hrAvg = Math.round(avg);
          if (max) h.hrMax = Math.round(max);
          if (min) h.hrMin = Math.round(min);
          // resting HR approximation: take min if < 80, else avg
          if (min && min < 80) h.restingHR = Math.round(min);
          else if (avg)        h.restingHR = Math.round(avg);
        }
        if (src.includes('step_count')) {
          const v = v0i ?? v0f;
          if (v) h.steps = (h.steps || 0) + Math.round(v);
        }
        if (src.includes('calories')) {
          const v = v0f ?? v0i;
          if (v) h.calories = Math.round((h.calories || 0) + v);
        }
        if (src.includes('distance')) {
          const v = v0f ?? v0i;
          if (v) h.distanceM = Math.round((h.distanceM || 0) + v);
        }
        if (src.includes('active_minutes')) {
          const v = v0i ?? v0f;
          if (v) h.activeMin = (h.activeMin || 0) + Math.round(v);
        }
        if (src.includes('weight')) {
          const v = v0f ?? v0i;
          if (v) h.weightKg = Math.round(v * 10) / 10;
        }
        if (src.includes('sleep')) {
          const type   = v0i;
          const durMin = (Number(pt.endTimeNanos) - Number(pt.startTimeNanos)) / 1e9 / 60;
          if (type === 5) h._deepMin  = (h._deepMin  || 0) + durMin;
          if (type === 6) h._remMin   = (h._remMin   || 0) + durMin;
          if ([2,4,5,6,7].includes(type)) h._totalMin = (h._totalMin || 0) + durMin;
        }
      });
    });
  });

  const toHHMM = m => `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;
  if (h._totalMin) {
    h.sleepMin      = Math.round(h._totalMin);
    h.sleepDuration = toHHMM(h._totalMin);
    h.sleepScore    = Math.min(100, Math.round(h._totalMin / 480 * 100));
    delete h._totalMin;
  }
  if (h._deepMin)  { h.deepSleep = toHHMM(h._deepMin);  delete h._deepMin; }
  if (h._remMin)   { h.remSleep  = toHHMM(h._remMin);   delete h._remMin;  }
  if (h.distanceM) h.distanceKm = Math.round(h.distanceM / 100) / 10;

  return h;
}

function extractFitTrends(trendResponse) {
  const days = [];
  (trendResponse?.bucket || []).forEach(bucket => {
    const dateMs = Number(bucket.startTimeMillis);
    const d = { date: new Date(dateMs).toISOString().slice(0, 10) };
    (bucket.dataset || []).forEach(ds => {
      const src = ds.dataSourceId || '';
      (ds.point || []).forEach(pt => {
        const vals = pt.value || [];
        if (src.includes('heart_rate')) { const v = vals[0]?.fpVal; if (v) d.hrAvg = Math.round(v); }
        if (src.includes('step_count')) { const v = vals[0]?.intVal ?? vals[0]?.fpVal; if (v) d.steps = Math.round(v); }
        if (src.includes('calories'))   { const v = vals[0]?.fpVal; if (v) d.calories = Math.round(v); }
        if (src.includes('active_min')) { const v = vals[0]?.intVal; if (v) d.activeMin = v; }
      });
    });
    if (Object.keys(d).length > 1) days.push(d);
  });
  return days;
}

// ── Google Classroom poller ───────────────────────────────────────────────────

async function pollGoogleClassroom() {
  const token = await getGoogleAccessToken();
  if (!token) return;
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();

  try {
    const coursesResp = await fetch('https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const { courses = [] } = await coursesResp.json();
    const assignments = [];

    for (const course of courses.slice(0, 15)) {
      try {
        const cwResp = await fetch(`https://classroom.googleapis.com/v1/courses/${course.id}/courseWork?courseWorkStates=PUBLISHED&orderBy=updateTime+desc&pageSize=25`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const { courseWork = [] } = await cwResp.json();
        courseWork.forEach(cw => {
          if (cw.updateTime < cutoff) return;
          assignments.push({
            id: cw.id, courseId: course.id, course: course.name, section: course.section || '',
            title: cw.title, description: (cw.description || '').slice(0, 400),
            dueDate: cw.dueDate ? `${cw.dueDate.year}-${String(cw.dueDate.month).padStart(2,'0')}-${String(cw.dueDate.day).padStart(2,'0')}` : null,
            link: cw.alternateLink, type: cw.workType, updatedAt: cw.updateTime
          });
        });
        const annResp = await fetch(`https://classroom.googleapis.com/v1/courses/${course.id}/announcements?announcementStates=PUBLISHED&orderBy=updateTime+desc&pageSize=10`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const { announcements = [] } = await annResp.json();
        announcements.forEach(ann => {
          if (ann.updateTime < cutoff) return;
          assignments.push({ id: ann.id, courseId: course.id, course: course.name, section: course.section || '', title: (ann.text || '').slice(0, 120), description: '', dueDate: null, link: ann.alternateLink, type: 'ANNOUNCEMENT', updatedAt: ann.updateTime });
        });
      } catch (e) { /* skip single course errors */ }
    }

    const db = readDB();
    db.classroom = { courses: courses.map(c => ({ id: c.id, name: c.name, section: c.section || '' })), assignments: assignments.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')), updatedAt: new Date().toISOString() };
    db.googleLastSync = new Date().toISOString();
    writeDB(db);
    console.log(`[Classroom] ${courses.length} corsi, ${assignments.length} assignments`);
  } catch (e) { console.error('[Classroom] Error:', e.message); }
}

// GET /api/classroom → return classroom data
app.get('/api/classroom', (req, res) => {
  const db = readDB();
  res.json(db.classroom || { courses: [], assignments: [], updatedAt: null });
});

// GET /api/fit-trends → last 7 days of Fit data
app.get('/api/fit-trends', (req, res) => {
  const db = readDB();
  res.json(db.fitTrends || []);
});

// ── Gmail Classroom guardian email reader ──────────────────────────────────────
// Email scolastica di Tommaso (inoltro automatico da questo indirizzo a marco@)
const TOMMASO_SCHOOL_EMAIL = process.env.TOMMASO_SCHOOL_EMAIL || '';

async function pollGmailClassroom() {
  const token = await getGoogleAccessToken();
  if (!token) return;
  try {
    // Query: email dirette da Google Classroom + eventuali inoltri da Tommaso
    const clasSenders = 'from:(googleclassroom-noreply@google.com OR classroom-noreply@google.com OR no-reply@classroom.google.com)';
    const tomForward  = TOMMASO_SCHOOL_EMAIL ? `OR from:${TOMMASO_SCHOOL_EMAIL}` : '';
    // Also catch forwarded Classroom notifications by subject keywords
    const subjKeywords = 'subject:(Classroom OR "compito" OR "materiale" OR "annuncio" OR "scadenza" OR "incarico" OR "SIAL" OR "Silla") newer_than:30d';
    const q = encodeURIComponent(`(${clasSenders} ${tomForward} OR ${subjKeywords})`);

    const listResp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=30`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const listData = await listResp.json();
    if (listData.error) { console.error('[Gmail/Classroom]', listData.error.message); return; }

    const messages = listData.messages || [];
    const emails = [];

    for (const msg of messages.slice(0, 20)) {
      const msgResp = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=From`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const msgData = await msgResp.json();
      const headers  = msgData.payload?.headers || [];
      const subject  = headers.find(h => h.name === 'Subject')?.value || '';
      const from     = headers.find(h => h.name === 'From')?.value || '';
      const date     = headers.find(h => h.name === 'Date')?.value || '';
      const snippet  = msgData.snippet || '';
      const dateMs   = Number(msgData.internalDate) || 0;
      const dateISO  = dateMs ? new Date(dateMs).toISOString() : null;

      // Tag: detect if it's a forwarded Classroom email or direct
      const isForward  = subject.toLowerCase().startsWith('fwd:') || subject.toLowerCase().startsWith('i:');
      const isDirect   = from.includes('classroom') || from.includes('googleclassroom');
      const isTommaso  = TOMMASO_SCHOOL_EMAIL && from.includes(TOMMASO_SCHOOL_EMAIL.split('@')[0]);

      // Parse due date from snippet (patterns like "Scade il 15 mar" or "due Mar 15")
      const dueMatch = snippet.match(/[Ss]cade?\s+il\s+(\d{1,2}\s+\w+)|due\s+(\w+\s+\d{1,2})/);
      const due = dueMatch ? dueMatch[0] : null;

      // Clean subject (remove Fwd: / I: prefix)
      const cleanSubject = subject.replace(/^(Fwd?:|I:)\s*/i, '').trim();

      emails.push({
        id: msg.id,
        subject: cleanSubject,
        rawSubject: subject,
        from, date: dateISO, snippet,
        due,
        tag: isTommaso ? 'inoltro-tommaso' : isDirect ? 'classroom-diretto' : isForward ? 'inoltro' : 'correlato',
        link: `https://mail.google.com/mail/u/0/#inbox/${msg.id}`
      });
    }

    // Sort by date desc
    emails.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const db = readDB();
    db.classroomEmails = emails;
    db.classroomEmailsUpdatedAt = new Date().toISOString();
    writeDB(db);
    console.log(`[Gmail/Classroom] ${emails.length} email trovate (dirette: ${emails.filter(e=>e.tag==='classroom-diretto').length}, inoltri Tommaso: ${emails.filter(e=>e.tag==='inoltro-tommaso').length})`);
  } catch (e) { console.error('[Gmail/Classroom] Error:', e.message); }
}

app.get('/api/classroom-emails', (req, res) => {
  const db = readDB();
  res.json(db.classroomEmails || []);
});

// ── Google Calendar sync ───────────────────────────────────────────────────────
async function pollGoogleCalendar(date) {
  const token = await getGoogleAccessToken();
  if (!token) return { count: 0, skipped: 0, error: 'Not authenticated' };
  try {
    const tzOffset = '+01:00'; // CET — adjust if needed
    const timeMin = encodeURIComponent(new Date(date + 'T00:00:00' + tzOffset).toISOString());
    const timeMax = encodeURIComponent(new Date(date + 'T23:59:59' + tzOffset).toISOString());
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=25`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await resp.json();
    if (data.error) { console.error('[Calendar]', data.error.message); return { count: 0, error: data.error.message }; }

    const db  = readDB();
    const day = ensureDay(db, date);
    const existingIds = new Set(day.events.map(e => e.id));
    const TRANSFER_CAL_RX = /\b(volo|flight|aereo|luton|heathrow|gatwick|stansted|malpensa|linate|fiumicino|wizz|ryanair|easyjet|boarding|imbarco)\b/i;

    let added = 0, skipped = 0;
    for (const item of (data.items || [])) {
      if (item.status === 'cancelled') continue;
      if (existingIds.has(item.id)) { skipped++; continue; }

      const startRaw = item.start?.dateTime || item.start?.date;
      const endRaw   = item.end?.dateTime   || item.end?.date;
      const startD   = startRaw ? new Date(startRaw) : null;
      const endD     = endRaw   ? new Date(endRaw)   : null;
      const timeStr  = startD ? startD.toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' }) : '';
      const endStr   = endD   ? endD.toLocaleTimeString('it-IT',   { hour:'2-digit', minute:'2-digit' }) : '';
      const attendees = (item.attendees || []).filter(a => !a.self).map(a => a.displayName || a.email).slice(0,4).join(', ');
      const isTransfer = TRANSFER_CAL_RX.test(item.summary || '');

      day.events.push({
        id:           item.id,
        title:        item.summary || 'Evento senza titolo',
        time:         timeStr + (endStr && endStr !== timeStr ? ' – ' + endStr : ''),
        participants: attendees,
        quadrant:     'Q2',
        link:         item.htmlLink || '',
        ...(isTransfer ? { type: 'transfer' } : {}),
        description:  (item.description || '').slice(0, 300),
        location:     item.location || '',
        calendarSync: true
      });
      existingIds.add(item.id);
      added++;
    }
    writeDB(db);
    console.log(`[Calendar] ${date}: ${added} nuovi eventi, ${skipped} già presenti`);
    return { count: added, skipped };
  } catch(e) {
    console.error('[Calendar]', e.message);
    return { count: 0, error: e.message };
  }
}

// ── Gmail inbox sync — recent important emails → tasks ─────────────────────────
async function pollGmailInbox(date) {
  const token = await getGoogleAccessToken();
  if (!token) return { count: 0, error: 'Not authenticated' };
  try {
    // Fetch unread or starred emails from the past 24h, exclude automated/noreply
    const q = encodeURIComponent(
      '(is:unread OR is:starred) -from:noreply -from:no-reply -from:mailer-daemon -from:googleclassroom newer_than:1d category:primary'
    );
    const listResp = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=20`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const listData = await listResp.json();
    if (listData.error) { console.error('[Gmail]', listData.error.message); return { count: 0, error: listData.error.message }; }

    const db  = readDB();
    const day = ensureDay(db, date);
    const existingIds = new Set(day.tasks.map(t => t.id));

    let added = 0;
    for (const msg of (listData.messages || []).slice(0, 15)) {
      const taskId = 'mail-' + msg.id;
      if (existingIds.has(taskId)) continue;

      const msgResp = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const msgData = await msgResp.json();
      const hdrs    = msgData.payload?.headers || [];
      const subject = hdrs.find(h => h.name === 'Subject')?.value || '(nessun oggetto)';
      const from    = hdrs.find(h => h.name === 'From')?.value || '';
      const snippet = msgData.snippet || '';

      // Clean sender name
      const senderMatch = from.match(/^"?([^"<]+)"?\s*<?/);
      const senderName  = senderMatch ? senderMatch[1].trim() : from.split('@')[0];

      day.tasks.push({
        id:       taskId,
        title:    subject.replace(/^(Re:|Fwd?:|I:)\s*/i,'').trim().slice(0, 100),
        due:      `Da leggere · ${senderName}`,
        brief:    `Da: ${from}\n\n${snippet}`,
        source:   'gmail',
        quadrant: 'Q3',
        link:     `https://mail.google.com/mail/u/0/#inbox/${msg.id}`,
        gmailSync: true
      });
      existingIds.add(taskId);
      added++;
    }
    writeDB(db);
    console.log(`[Gmail] ${date}: ${added} nuove email → task`);
    return { count: added };
  } catch(e) {
    console.error('[Gmail]', e.message);
    return { count: 0, error: e.message };
  }
}

// POST /api/google/sync → manual sync trigger (all: Fit + Calendar + Gmail + Classroom)
app.post('/api/google/sync', async (req, res) => {
  const token = await getGoogleAccessToken();
  if (!token) return res.status(401).json({ error: 'Google non connesso. Apri /auth/google per connettere.' });
  const date = req.query.date || new Date().toISOString().slice(0,10);
  const [fitResult, calResult, gmailResult] = await Promise.all([
    pollGoogleFit(),
    pollGoogleCalendar(date),
    pollGmailInbox(date),
    pollGoogleClassroom(),
    pollGmailClassroom()
  ]);
  const db = readDB();
  db.googleLastSync = new Date().toISOString();
  writeDB(db);
  res.json({ ok: true, synced: db.googleLastSync, calendar: calResult, gmail: gmailResult });
});

// POST /api/day/:date/briefing/refresh → clear cached briefing + regenerate
app.post('/api/day/:date/briefing/refresh', async (req, res) => {
  const db   = readDB();
  const date = req.params.date;
  if (db.days[date]) {
    delete db.days[date].briefing;
    delete db.days[date].narrative;
    writeDB(db);
  }
  // Redirect to generate endpoint by calling it internally
  try {
    const genResp = await fetch(`http://localhost:${PORT}/api/day/${date}/briefing/generate`);
    const gen     = await genResp.json();
    if (gen.briefing || gen.narrative) {
      const db2 = readDB();
      if (!db2.days[date]) db2.days[date] = { events:[], tasks:[], items:{} };
      if (gen.briefing)  db2.days[date].briefing  = gen.briefing;
      if (gen.narrative) db2.days[date].narrative = gen.narrative;
      writeDB(db2);
    }
    res.json({ ok: true, ...gen });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Hourly auto-sync if connected
setInterval(async () => {
  const db = readDB();
  if (db.googleTokens?.refresh_token && GOOGLE_CLIENT_ID) {
    await pollGoogleFit();
    await pollGoogleClassroom();
    await pollGmailClassroom();
  }
}, 3600000);

// ── AI ASSISTANT ──────────────────────────────────────────────────────────────

const CONFIG_PATH = path.join(__dirname, 'config.json');

function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch(e) { return {}; }
}

function writeConfig(data) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
}

// GET /api/ai/status
app.get('/api/ai/status', (req, res) => {
  const cfg = readConfig();
  res.json({ configured: !!(cfg.anthropicApiKey), model: cfg.aiModel || 'claude-3-5-haiku-20241022' });
});

// POST /api/ai/config → save API key
app.post('/api/ai/config', (req, res) => {
  const { apiKey, model } = req.body;
  const cfg = readConfig();
  if (apiKey !== undefined) cfg.anthropicApiKey = apiKey;
  if (model) cfg.aiModel = model;
  writeConfig(cfg);
  res.json({ ok: true });
});

const AI_TOOLS = [
  {
    name: 'get_day_status',
    description: 'Ottieni lo stato completo di una giornata: task (con stati completato/non), eventi, briefing, salute. Usa per capire la situazione attuale prima di agire.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Data YYYY-MM-DD (default: oggi)' }
      }
    }
  },
  {
    name: 'add_task',
    description: 'Aggiungi un nuovo task alla giornata. Quadranti Eisenhower: q1=urgente+importante, q2=importante non urgente (pianificato), q3=urgente non importante (delegabile), q4=né urgente né importante.',
    input_schema: {
      type: 'object',
      properties: {
        date:     { type: 'string', description: 'Data YYYY-MM-DD (default: oggi)' },
        title:    { type: 'string', description: 'Titolo del task' },
        quadrant: { type: 'string', enum: ['q1','q2','q3','q4'], description: 'Quadrante Eisenhower' },
        type:     { type: 'string', enum: ['email','meeting','phone','task','personal'], description: 'Tipo di task' }
      },
      required: ['title']
    }
  },
  {
    name: 'complete_task',
    description: 'Segna un task come completato o non completato. Usa get_day_status prima per trovare il task_id corretto.',
    input_schema: {
      type: 'object',
      properties: {
        date:    { type: 'string', description: 'Data YYYY-MM-DD (default: oggi)' },
        task_id: { type: 'string', description: 'ID del task (es. t-abc123)' },
        done:    { type: 'boolean', description: 'true = completato, false = da fare' }
      },
      required: ['task_id']
    }
  },
  {
    name: 'move_task_quadrant',
    description: 'Sposta un task in un quadrante Eisenhower diverso per riprioritizzare.',
    input_schema: {
      type: 'object',
      properties: {
        date:     { type: 'string', description: 'Data YYYY-MM-DD (default: oggi)' },
        task_id:  { type: 'string', description: 'ID del task' },
        quadrant: { type: 'string', enum: ['q1','q2','q3','q4'] }
      },
      required: ['task_id', 'quadrant']
    }
  },
  {
    name: 'get_network_contacts',
    description: 'Ottieni la lista completa dei contatti della rete professionale con urgenza, task recenti, note e interazioni.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'save_contact_note',
    description: 'Aggiorna le note o i tag di un contatto nella rubrica professionale.',
    input_schema: {
      type: 'object',
      properties: {
        name:  { type: 'string', description: 'Nome del contatto' },
        notes: { type: 'string', description: 'Note da salvare' },
        tags:  { type: 'array', items: { type: 'string' }, description: 'Tag es. ["cliente","priority","follow-up"]' }
      },
      required: ['name']
    }
  },
  {
    name: 'add_project',
    description: 'Crea un nuovo progetto nella tab Progetti.',
    input_schema: {
      type: 'object',
      properties: {
        title:       { type: 'string', description: 'Nome del progetto' },
        client:      { type: 'string', description: 'Cliente o azienda' },
        description: { type: 'string', description: 'Descrizione del progetto' },
        color:       { type: 'string', description: 'Colore hex es. #7c6af7' }
      },
      required: ['title']
    }
  },
  {
    name: 'add_pipeline_deal',
    description: 'Aggiunge un deal/opportunità commerciale nella pipeline.',
    input_schema: {
      type: 'object',
      properties: {
        title:          { type: 'string', description: 'Nome del deal' },
        client:         { type: 'string', description: 'Nome cliente' },
        value:          { type: 'number', description: 'Valore stimato in €' },
        stage:          { type: 'string', enum: ['prospect','proposta','negoziazione','chiuso'] },
        expected_close: { type: 'string', description: 'Data chiusura attesa YYYY-MM-DD' },
        notes:          { type: 'string', description: 'Note sul deal' }
      },
      required: ['title', 'client']
    }
  },
  {
    name: 'save_insight',
    description: 'Salva un insight, coaching tip, o nota nella sezione Crescita della giornata.',
    input_schema: {
      type: 'object',
      properties: {
        date:  { type: 'string', description: 'Data YYYY-MM-DD (default: oggi)' },
        text:  { type: 'string', description: "Testo dell'insight" },
        field: { type: 'string', description: 'Campo: growthBrief o eveningInsight. Default: growthBrief' }
      },
      required: ['text']
    }
  }
];

async function executeAiTool(toolName, toolInput, db, today) {
  const date = toolInput.date || today;

  switch (toolName) {
    case 'get_day_status': {
      const day = db.days[date] || { events: [], tasks: [], items: {}, reflection: '', briefing: '' };
      const tasksWithStatus = day.tasks.map(t => ({
        id: t.id, title: t.title, quadrant: t.quadrant || 'q2', type: t.type,
        done:      !!(day.items?.[t.id]?.done),
        deferred:  !!(day.items?.[t.id]?.deferred),
        actionPoint: day.items?.[t.id]?.actionPoint || null
      }));
      const done  = tasksWithStatus.filter(t => t.done).length;
      const total = tasksWithStatus.length;
      return { date, progress: `${done}/${total} task completati`, tasks: tasksWithStatus, events: day.events || [], briefing: day.briefing || '', reflection: day.reflection || '', insights: day.insights || {} };
    }

    case 'add_task': {
      const day = ensureDay(db, date);
      const newTask = {
        id: 't-' + Date.now().toString(36) + Math.random().toString(36).slice(2,5),
        title: toolInput.title,
        quadrant: toolInput.quadrant || 'q2',
        type: toolInput.type || 'task',
        addedByAI: true
      };
      day.tasks.push(newTask);
      writeDB(db);
      return { ok: true, task_id: newTask.id, message: `Task "${newTask.title}" aggiunto nel quadrante ${newTask.quadrant}` };
    }

    case 'complete_task': {
      const day = db.days[date];
      if (!day) return { error: `Nessun dato per il ${date}` };
      const task = day.tasks.find(t => t.id === toolInput.task_id);
      if (!task) return { error: `Task ${toolInput.task_id} non trovato. Usa get_day_status per ottenere gli ID corretti.` };
      if (!day.items) day.items = {};
      if (!day.items[task.id]) day.items[task.id] = {};
      day.items[task.id].done = toolInput.done !== false;
      writeDB(db);
      return { ok: true, task: task.title, done: day.items[task.id].done };
    }

    case 'move_task_quadrant': {
      const day = db.days[date];
      if (!day) return { error: `Nessun dato per il ${date}` };
      const task = day.tasks.find(t => t.id === toolInput.task_id);
      if (!task) return { error: `Task ${toolInput.task_id} non trovato.` };
      const oldQ = task.quadrant;
      task.quadrant = toolInput.quadrant;
      writeDB(db);
      return { ok: true, task: task.title, from: oldQ, to: toolInput.quadrant };
    }

    case 'get_network_contacts': {
      const contacts = extractContactsFromTasks(db);
      const stored = db.contacts || {};
      const merged = contacts.map(c => ({ ...c, ...(stored[c.name] || {}) }));
      return { contacts: merged.slice(0, 30) };
    }

    case 'save_contact_note': {
      if (!db.contacts) db.contacts = {};
      if (!db.contacts[toolInput.name]) db.contacts[toolInput.name] = {};
      if (toolInput.notes !== undefined) db.contacts[toolInput.name].notes = toolInput.notes;
      if (toolInput.tags)  db.contacts[toolInput.name].tags = toolInput.tags;
      db.contacts[toolInput.name].updatedAt = new Date().toISOString();
      writeDB(db);
      return { ok: true, contact: toolInput.name, saved: true };
    }

    case 'add_project': {
      if (!db.projects) db.projects = [];
      const proj = {
        id: 'proj-' + Date.now().toString(36),
        title: toolInput.title,
        client: toolInput.client || '',
        color: toolInput.color || '#7c6af7',
        status: 'active',
        description: toolInput.description || '',
        tasks: [], notes: '', links: [],
        createdAt: today,
        addedByAI: true
      };
      db.projects.push(proj);
      writeDB(db);
      return { ok: true, project_id: proj.id, title: proj.title };
    }

    case 'add_pipeline_deal': {
      if (!db.pipeline) db.pipeline = { deals: [], invoices: [] };
      if (!db.pipeline.deals) db.pipeline.deals = [];
      const stageProbability = { prospect: 20, proposta: 40, negoziazione: 70, chiuso: 100 };
      const deal = {
        id: 'deal-' + Date.now().toString(36),
        title: toolInput.title,
        client: toolInput.client,
        value: toolInput.value || 0,
        stage: toolInput.stage || 'prospect',
        probability: stageProbability[toolInput.stage] || 20,
        expectedClose: toolInput.expected_close || '',
        notes: toolInput.notes || '',
        createdAt: today,
        addedByAI: true
      };
      db.pipeline.deals.push(deal);
      writeDB(db);
      return { ok: true, deal_id: deal.id, title: deal.title, stage: deal.stage };
    }

    case 'save_insight': {
      const day = ensureDay(db, date);
      if (!day.insights) day.insights = {};
      const field = toolInput.field || 'growthBrief';
      day.insights[field] = toolInput.text;
      writeDB(db);
      return { ok: true, date, field, preview: toolInput.text.substring(0, 80) };
    }

    default:
      return { error: `Tool "${toolName}" non riconosciuto` };
  }
}

// POST /api/ai/chat → agentic conversation with tool use
app.post('/api/ai/chat', async (req, res) => {
  const cfg = readConfig();
  const apiKey = cfg.anthropicApiKey;
  if (!apiKey) {
    return res.status(400).json({ error: 'API key Anthropic non configurata. Clicca su ⚙️ per aggiungerla.' });
  }

  const { messages = [], date } = req.body;
  const today = date || new Date().toISOString().slice(0, 10);
  const db = readDB();

  // Build context snapshot for system prompt
  const todayData = db.days[today] || { tasks: [], events: [], items: {} };
  const taskLines = todayData.tasks.slice(0, 30).map(t => {
    const done = todayData.items?.[t.id]?.done ? '✓' : '○';
    return `  ${done} [${t.quadrant || 'q2'}] (id:${t.id}) ${t.title}`;
  }).join('\n');
  // Filter out transfer events from AI context — they show separately in Trasferimenti
  const TRANSFER_AI_RX = /\b(volo|flight|aereo|malpensa|linate|fiumicino|ciampino|wizz|ryanair|easyjet|ita airways|lufthansa|alitalia|frecciarossa|frecciargento|trenitalia|imbarco|boarding)\b/i;
  const calEventsAI = (todayData.events || []).filter(e => e.type !== 'transfer' && !TRANSFER_AI_RX.test(e.title||''));
  const transferEventsAI = (todayData.events || []).filter(e => e.type === 'transfer' || TRANSFER_AI_RX.test(e.title||''));
  const evtLines = calEventsAI.slice(0, 10).map(e =>
    `  ${e.time || ''} ${e.title}`
  ).join('\n');
  const transferLines = transferEventsAI.map(e =>
    `  ✈️ ${e.time || ''} ${e.title}`
  ).join('\n');

  const systemPrompt = `Sei l'assistente AI personale di Marco, integrato nel Daily Tracker.
Data corrente: ${today} (${new Date(today + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })})

Puoi SOLO eseguire azioni sulla piattaforma Daily Tracker tramite i tool disponibili.
Non puoi accedere a internet, email esterne, o sistemi al di fuori di questa piattaforma.

── SNAPSHOT GIORNATA CORRENTE (${today}) ──
Task (${todayData.tasks.length} totali, ${todayData.tasks.filter(t => todayData.items?.[t.id]?.done).length} completati):
${taskLines || '  Nessun task'}

Riunioni/eventi:
${evtLines || '  Nessun evento'}
${transferLines ? `\nTrasferimenti:\n${transferLines}` : ''}
Briefing: ${(todayData.briefing || 'Non disponibile').substring(0, 300)}

── ISTRUZIONI ──
- Rispondi SEMPRE in italiano, tono professionale ma diretto
- Prima di modificare task, usa get_day_status per avere gli ID aggiornati
- Per prioritizzare: q1=urgente+importante (fai subito), q2=pianificato, q3=delegabile, q4=elimina
- Dopo ogni azione conferma brevemente cosa hai fatto
- Puoi concatenare più tool call in una risposta
- Sii proattivo: se vedi opportunità di ottimizzazione, suggeriscile
- Formato numeri: usa € per i valori monetari`;

  // Convert client messages to Anthropic format (only user/assistant text)
  const anthropicMsgs = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: String(m.content || m.text || '') }));

  try {
    const { default: Anthropic } = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    let msgs = [...anthropicMsgs];

    // Agentic loop: iterate until end_turn (max 10 tool-use rounds)
    for (let round = 0; round < 10; round++) {
      const response = await client.messages.create({
        model: cfg.aiModel || 'claude-3-5-haiku-20241022',
        max_tokens: 2048,
        system: systemPrompt,
        tools: AI_TOOLS,
        messages: msgs
      });

      msgs.push({ role: 'assistant', content: response.content });

      if (response.stop_reason === 'end_turn') {
        const text = response.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('\n');
        return res.json({ reply: text });
      }

      if (response.stop_reason === 'tool_use') {
        const toolResults = [];
        for (const block of response.content.filter(b => b.type === 'tool_use')) {
          console.log(`[AI] Tool call: ${block.name}`, JSON.stringify(block.input));
          const result = await executeAiTool(block.name, block.input, db, today);
          console.log(`[AI] Tool result: ${block.name}`, JSON.stringify(result).slice(0, 200));
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result)
          });
        }
        msgs.push({ role: 'user', content: toolResults });
        continue;
      }

      break; // max_tokens or other stop reason
    }

    // Fallback: extract last text from history
    const lastAss = [...msgs].reverse().find(m => m.role === 'assistant');
    const fallbackText = Array.isArray(lastAss?.content)
      ? lastAss.content.filter(b => b.type === 'text').map(b => b.text).join('')
      : '';
    return res.json({ reply: fallbackText || 'Operazione completata.' });

  } catch (e) {
    console.error('[AI Chat]', e.message);
    if (e.status === 401) return res.status(401).json({ error: 'API key non valida. Controlla le impostazioni.' });
    if (e.status === 429) return res.status(429).json({ error: 'Troppe richieste. Riprova tra qualche secondo.' });
    return res.status(500).json({ error: 'Errore AI: ' + e.message });
  }
});

// ── TASKS (Microsoft To Do style) ────────────────────────────────────────────

const DEFAULT_LISTS = [
  { id: 'my-day',   name: 'Il mio giorno', icon: '☀️',  smart: true },
  { id: 'important',name: 'Importante',    icon: '⭐',  smart: true },
  { id: 'planned',  name: 'Pianificato',   icon: '📅',  smart: true },
  { id: 'all',      name: 'Attività',      icon: '✓',   smart: true },
  { id: 'shared',   name: 'Assegnati a me',icon: '👥',  smart: true },
  { id: 'briefing', name: 'Briefing',      icon: '✦',   smart: true },
];

function getTaskLists(db) {
  const custom = db.taskLists || [];
  return [...DEFAULT_LISTS, ...custom];
}

// GET /api/todo/lists
app.get('/api/todo/lists', (req, res) => {
  const db = readDB();
  res.json(getTaskLists(db));
});

// POST /api/todo/lists
app.post('/api/todo/lists', (req, res) => {
  const db = readDB();
  if (!db.taskLists) db.taskLists = [];
  const list = { id: uuidv4(), name: req.body.name, icon: req.body.icon || '📋', smart: false, createdAt: new Date().toISOString() };
  db.taskLists.push(list);
  writeDB(db);
  res.json(list);
});

// PATCH /api/todo/lists/:id
app.patch('/api/todo/lists/:id', (req, res) => {
  const db = readDB();
  const list = (db.taskLists || []).find(l => l.id === req.params.id);
  if (!list) return res.status(404).json({ error: 'Not found' });
  Object.assign(list, req.body);
  writeDB(db);
  res.json(list);
});

// DELETE /api/todo/lists/:id
app.delete('/api/todo/lists/:id', (req, res) => {
  const db = readDB();
  db.taskLists = (db.taskLists || []).filter(l => l.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// GET /api/todo/tasks
app.get('/api/todo/tasks', (req, res) => {
  const db = readDB();
  const uid = getCurrentUid();
  const { listId, date } = req.query;
  const ownTasks = db.todoTasks || [];

  // briefing: early return (no shared tasks here)
  if (listId === 'briefing') {
    const today = date || new Date().toISOString().slice(0, 10);
    const day = db.days?.[today] || {};
    return res.json((day.tasks || []).map(t => ({
      id: t.id, title: t.title, done: !!(day.items?.[t.id]?.done),
      important: (t.quadrant === 'Q1'), listId: 'briefing',
      due: t.due, quadrant: t.quadrant, brief: t.brief, link: t.link,
      actionPoints: day.items?.[t.id]?.actionPoints || [],
      source: 'briefing'
    })));
  }

  // Collect incoming shared/assigned tasks from other users
  const sharedStore = readShared();
  const users = readUsers();
  const incoming = Object.values(sharedStore.tasks).filter(t => {
    if (t.ownerId === uid) return false;
    return getTaskPermission(t, uid) !== null;
  }).map(t => {
    const owner = users[t.ownerId] || {};
    return { ...t, _permission: getTaskPermission(t, uid), _isShared: true, _ownerName: owner.name || owner.email || 'Utente', _ownerPicture: owner.picture || null };
  });

  // 'shared' smart list: only incoming tasks
  if (listId === 'shared') {
    return res.json(incoming.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  }

  // Apply list filter to own tasks
  let filtered;
  let filteredShared;
  if (listId === 'my-day') {
    filtered = ownTasks.filter(t => t.myDay && !t.done);
    filteredShared = incoming.filter(t => t.myDay && !t.done);
  } else if (listId === 'important') {
    filtered = ownTasks.filter(t => t.important && !t.done);
    filteredShared = incoming.filter(t => t.important && !t.done);
  } else if (listId === 'planned') {
    filtered = ownTasks.filter(t => t.dueDate && !t.done);
    filteredShared = incoming.filter(t => t.dueDate && !t.done);
    const all = [...filtered, ...filteredShared].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return res.json(all);
  } else if (listId && listId !== 'all') {
    filtered = ownTasks.filter(t => t.listId === listId);
    filteredShared = []; // custom lists: own tasks only
  } else {
    // 'all': own + all shared
    filtered = ownTasks;
    filteredShared = incoming;
  }

  const all = [...filtered, ...filteredShared];
  res.json(all.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.important !== b.important) return b.important ? 1 : -1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  }));
});

// POST /api/todo/tasks
app.post('/api/todo/tasks', (req, res) => {
  const db = readDB();
  const uid = getCurrentUid();
  if (!db.todoTasks) db.todoTasks = [];
  const assignedTo = req.body.assignedTo || [];
  const sharedWith = req.body.sharedWith || [];
  const permissions = {};
  permissions[uid] = 'owner';
  assignedTo.forEach(aId => { permissions[aId] = 'editor'; });
  sharedWith.forEach(sId => {
    const id = typeof sId === 'string' ? sId : sId.userId;
    const role = typeof sId === 'object' ? (sId.role || 'viewer') : 'viewer';
    permissions[id] = role;
  });
  const task = {
    id: uuidv4(),
    title: req.body.title,
    listId: req.body.listId || 'all',
    done: false,
    important: req.body.important || false,
    myDay: req.body.myDay || false,
    dueDate: req.body.dueDate || null,
    reminder: req.body.reminder || null,
    steps: [],
    notes: req.body.notes || '',
    assignedTo,
    sharedWith,
    permissions,
    ownerId: uid,
    createdAt: new Date().toISOString(),
    createdBy: uid,
    repeat: req.body.repeat || null,
  };
  db.todoTasks.push(task);
  writeDB(db);
  // Propagate to shared store + notify
  syncTaskToShared(task);
  const allUsers = readUsers();
  const ownerName = allUsers[uid]?.name || 'Qualcuno';
  assignedTo.forEach(aId => {
    createNotification(aId, 'task_assigned', `${ownerName} ti ha assegnato: "${task.title}"`, { taskId: task.id, fromUid: uid });
  });
  sharedWith.forEach(sId => {
    const id = typeof sId === 'string' ? sId : sId.userId;
    createNotification(id, 'task_shared', `${ownerName} ha condiviso con te: "${task.title}"`, { taskId: task.id, fromUid: uid });
  });
  res.json(task);
});

// PATCH /api/todo/tasks/:id
app.patch('/api/todo/tasks/:id', (req, res) => {
  const db = readDB();
  const uid = getCurrentUid();

  // briefing tasks live in day.items
  if (req.body.source === 'briefing' || req.query.source === 'briefing') {
    const today = new Date().toISOString().slice(0, 10);
    const day = db.days?.[today];
    if (day && day.items?.[req.params.id]) {
      Object.assign(day.items[req.params.id], req.body);
      writeDB(db);
      return res.json({ ok: true });
    }
  }

  // Own task
  const task = (db.todoTasks || []).find(t => t.id === req.params.id);
  if (task) {
    Object.assign(task, req.body);
    // Rebuild permissions if sharing changed
    if (req.body.assignedTo !== undefined || req.body.sharedWith !== undefined) {
      task.permissions = {};
      task.permissions[task.ownerId || uid] = 'owner';
      (task.assignedTo || []).forEach(aId => { task.permissions[aId] = 'editor'; });
      (task.sharedWith || []).forEach(sId => {
        const id = typeof sId === 'string' ? sId : sId.userId;
        task.permissions[id] = typeof sId === 'object' ? (sId.role || 'viewer') : 'viewer';
      });
      const allUsers = readUsers();
      const ownerName = allUsers[uid]?.name || 'Qualcuno';
      if (req.body.assignedTo) {
        req.body.assignedTo.forEach(aId => {
          createNotification(aId, 'task_assigned', `${ownerName} ti ha assegnato: "${task.title}"`, { taskId: task.id, fromUid: uid });
        });
      }
      if (req.body.sharedWith) {
        req.body.sharedWith.forEach(sId => {
          const id = typeof sId === 'string' ? sId : sId.userId;
          createNotification(id, 'task_shared', `${ownerName} ha condiviso con te: "${task.title}"`, { taskId: task.id, fromUid: uid });
        });
      }
    }
    writeDB(db);
    syncTaskToShared(task);
    return res.json(task);
  }

  // Shared task (editor/owner via shared store)
  const sharedStore = readShared();
  const sharedTask = sharedStore.tasks[req.params.id];
  if (sharedTask) {
    const perm = getTaskPermission(sharedTask, uid);
    if (perm === 'viewer') return res.status(403).json({ error: 'Permesso insufficiente: sei in sola lettura' });
    if (!perm) return res.status(403).json({ error: 'Accesso negato' });
    Object.assign(sharedTask, req.body);
    writeShared(sharedStore);
    // Mirror update in owner's db
    const ownerDb = readDBForUid(sharedTask.ownerId);
    const ownerTask = (ownerDb.todoTasks || []).find(t => t.id === req.params.id);
    if (ownerTask) { Object.assign(ownerTask, req.body); writeDBForUid(sharedTask.ownerId, ownerDb); }
    // Notify owner
    if (sharedTask.ownerId && sharedTask.ownerId !== uid) {
      const allUsers = readUsers();
      const editorName = allUsers[uid]?.name || 'Un utente';
      createNotification(sharedTask.ownerId, 'task_updated', `${editorName} ha aggiornato: "${sharedTask.title}"`, { taskId: sharedTask.id, fromUid: uid });
    }
    return res.json(sharedTask);
  }

  return res.status(404).json({ error: 'Not found' });
});

// DELETE /api/todo/tasks/:id
app.delete('/api/todo/tasks/:id', (req, res) => {
  const db = readDB();
  const uid = getCurrentUid();
  const ownTask = (db.todoTasks || []).find(t => t.id === req.params.id);
  if (ownTask && (ownTask.ownerId === uid || !ownTask.ownerId)) {
    db.todoTasks = db.todoTasks.filter(t => t.id !== req.params.id);
    writeDB(db);
    const s = readShared(); delete s.tasks[req.params.id]; writeShared(s);
    return res.json({ ok: true });
  }
  // Shared task: non-owner removes themselves
  const s = readShared();
  const sharedTask = s.tasks[req.params.id];
  if (sharedTask) {
    const perm = getTaskPermission(sharedTask, uid);
    if (perm === 'owner') {
      delete s.tasks[req.params.id]; writeShared(s);
      const ownerDb = readDBForUid(sharedTask.ownerId);
      ownerDb.todoTasks = (ownerDb.todoTasks || []).filter(t => t.id !== req.params.id);
      writeDBForUid(sharedTask.ownerId, ownerDb);
      return res.json({ ok: true });
    }
    if (perm) {
      sharedTask.assignedTo = (sharedTask.assignedTo || []).filter(id => id !== uid);
      sharedTask.sharedWith = (sharedTask.sharedWith || []).filter(s => (typeof s === 'string' ? s : s.userId) !== uid);
      delete (sharedTask.permissions || {})[uid];
      const stillShared = (sharedTask.assignedTo.length > 0) || (sharedTask.sharedWith.length > 0);
      if (!stillShared) delete s.tasks[req.params.id]; else s.tasks[req.params.id] = sharedTask;
      writeShared(s);
      const ownerDb = readDBForUid(sharedTask.ownerId);
      const ownerTask = (ownerDb.todoTasks || []).find(t => t.id === req.params.id);
      if (ownerTask) { ownerTask.assignedTo = sharedTask.assignedTo; ownerTask.sharedWith = sharedTask.sharedWith; ownerTask.permissions = sharedTask.permissions; writeDBForUid(sharedTask.ownerId, ownerDb); }
      return res.json({ ok: true });
    }
  }
  // Fallback: delete from own db anyway
  db.todoTasks = (db.todoTasks || []).filter(t => t.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// POST /api/todo/tasks/:id/step
app.post('/api/todo/tasks/:id/step', (req, res) => {
  const db = readDB();
  const task = (db.todoTasks || []).find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Not found' });
  const step = { id: uuidv4(), text: req.body.text, done: false };
  task.steps = task.steps || [];
  task.steps.push(step);
  writeDB(db);
  res.json(step);
});

// PATCH /api/todo/tasks/:id/step/:sid
app.patch('/api/todo/tasks/:id/step/:sid', (req, res) => {
  const db = readDB();
  const task = (db.todoTasks || []).find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Not found' });
  const step = (task.steps || []).find(s => s.id === req.params.sid);
  if (!step) return res.status(404).json({ error: 'Step not found' });
  Object.assign(step, req.body);
  writeDB(db);
  res.json(step);
});

// DELETE /api/todo/tasks/:id/step/:sid
app.delete('/api/todo/tasks/:id/step/:sid', (req, res) => {
  const db = readDB();
  const task = (db.todoTasks || []).find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Not found' });
  task.steps = (task.steps || []).filter(s => s.id !== req.params.sid);
  writeDB(db);
  res.json({ ok: true });
});

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────

app.get('/api/notifications', (req, res) => {
  const uid = getCurrentUid();
  const s = readShared();
  res.json(s.notifications[uid] || []);
});

app.patch('/api/notifications/:id/read', (req, res) => {
  const uid = getCurrentUid();
  const s = readShared();
  const n = (s.notifications[uid] || []).find(n => n.id === req.params.id);
  if (n) { n.read = true; writeShared(s); }
  res.json({ ok: true });
});

app.post('/api/notifications/read-all', (req, res) => {
  const uid = getCurrentUid();
  const s = readShared();
  (s.notifications[uid] || []).forEach(n => { n.read = true; });
  writeShared(s);
  res.json({ ok: true });
});

// ── CALENDAR SHARING ──────────────────────────────────────────────────────────

// Share my calendar with another user
app.post('/api/calendar/share', (req, res) => {
  const uid = getCurrentUid();
  const { targetId } = req.body;
  if (!targetId || targetId === uid) return res.status(400).json({ error: 'targetId non valido' });
  const allUsers = readUsers();
  if (!allUsers[targetId]) return res.status(404).json({ error: 'Utente non trovato' });
  const s = readShared();
  if (!s.calendarShares[uid]) s.calendarShares[uid] = [];
  if (!s.calendarShares[uid].find(cs => cs.targetId === targetId)) {
    s.calendarShares[uid].push({ targetId, since: new Date().toISOString() });
    const ownerName = allUsers[uid]?.name || 'Qualcuno';
    createNotification(targetId, 'calendar_shared', `${ownerName} ha condiviso il calendario con te`, { fromUid: uid });
  }
  writeShared(s);
  res.json({ ok: true });
});

// Revoke calendar share
app.delete('/api/calendar/share/:targetId', (req, res) => {
  const uid = getCurrentUid();
  const s = readShared();
  if (s.calendarShares[uid]) {
    s.calendarShares[uid] = s.calendarShares[uid].filter(cs => cs.targetId !== req.params.targetId);
  }
  writeShared(s);
  res.json({ ok: true });
});

// Who I share with + who shares with me
app.get('/api/calendar/shares', (req, res) => {
  const uid = getCurrentUid();
  const s = readShared();
  const allUsers = readUsers();
  const myShares = (s.calendarShares[uid] || []).map(cs => ({
    ...cs,
    user: allUsers[cs.targetId] ? { id: cs.targetId, name: allUsers[cs.targetId].name, email: allUsers[cs.targetId].email, picture: allUsers[cs.targetId].picture } : { id: cs.targetId }
  }));
  const sharedWithMe = [];
  Object.entries(s.calendarShares).forEach(([ownerId, shares]) => {
    if (ownerId === uid) return;
    const share = shares.find(cs => cs.targetId === uid);
    if (!share) return;
    sharedWithMe.push({ ...share, ownerId, user: allUsers[ownerId] ? { id: ownerId, name: allUsers[ownerId].name, email: allUsers[ownerId].email, picture: allUsers[ownerId].picture } : { id: ownerId } });
  });
  res.json({ myShares, sharedWithMe });
});

// Get shared calendar events from all users sharing with me (optionally filtered by ?date=YYYY-MM)
app.get('/api/calendar/shared', (req, res) => {
  const uid = getCurrentUid();
  const { date } = req.query;
  const s = readShared();
  const allUsers = readUsers();
  const now = new Date().toISOString().slice(0, 10);
  const allEvents = [];
  Object.entries(s.calendarShares).forEach(([ownerId, shares]) => {
    if (ownerId === uid) return;
    if (!shares.some(cs => cs.targetId === uid)) return;
    const ownerDb = readDBForUid(ownerId);
    const ownerName = allUsers[ownerId]?.name || 'Utente';
    Object.entries(ownerDb.days || {}).forEach(([dayDate, day]) => {
      if (date && !dayDate.startsWith(date)) return;
      if (!date && dayDate < now) return;
      (day.events || []).forEach(evt => {
        allEvents.push({ ...evt, date: dayDate, sharedBy: ownerName, sharedByUid: ownerId, sharedByPicture: allUsers[ownerId]?.picture || null });
      });
    });
  });
  allEvents.sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  res.json(allEvents);
});

// Get specific user's shared calendar events
app.get('/api/calendar/shared/:userId', (req, res) => {
  const uid = getCurrentUid();
  const targetId = req.params.userId;
  const { date } = req.query;
  const s = readShared();
  if (!(s.calendarShares[targetId] || []).some(cs => cs.targetId === uid)) {
    return res.status(403).json({ error: 'Calendario non condiviso con te' });
  }
  const targetDb = readDBForUid(targetId);
  const allUsers = readUsers();
  const ownerName = allUsers[targetId]?.name || 'Utente';
  const now = new Date().toISOString().slice(0, 10);
  const events = [];
  Object.entries(targetDb.days || {}).forEach(([dayDate, day]) => {
    if (date && !dayDate.startsWith(date)) return;
    if (!date && dayDate < now) return;
    (day.events || []).forEach(evt => {
      events.push({ ...evt, date: dayDate, sharedBy: ownerName, sharedByUid: targetId });
    });
  });
  events.sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  res.json(events);
});

// ── USER SETTINGS ─────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  timezone: 'Europe/London',
  briefingEmail: '',
  briefingTime: '06:30',
  primaryEmail: '',
  additionalCalendars: [],
  excludedCalendars: [],
  familyMembers: [],
  homeCity: '',
  interests: ['business', 'AI', 'leadership', 'startup', 'tecnologia'],
  perplexityApiKey: '',
  sendBriefingEmail: true,
  userName: ''
};

// GET /api/user/settings
app.get('/api/user/settings', (req, res) => {
  const db = readDB();
  const uid = getCurrentUid();
  const users = readUsers();
  const user = users[uid] || {};
  const merged = {
    ...DEFAULT_SETTINGS,
    userName: user.name || '',
    briefingEmail: user.email || '',
    primaryEmail: user.email || '',
    ...(db.userSettings || {})
  };
  res.json(merged);
});

// PUT /api/user/settings
app.put('/api/user/settings', (req, res) => {
  const db = readDB();
  db.userSettings = { ...(db.userSettings || {}), ...req.body };
  writeDB(db);
  res.json({ ok: true, settings: db.userSettings });
});

// ── MORNING AGENT ──────────────────────────────────────────────────────────────

// POST /api/morning-agent/:date/run  → run the full 9-step morning briefing
app.post('/api/morning-agent/:date/run', async (req, res) => {
  const uid = getCurrentUid();
  if (!uid) return res.status(401).json({ error: 'Non autenticato' });

  const date = req.params.date;
  const cfg  = readConfig();
  if (!cfg.anthropicApiKey) return res.status(400).json({ error: 'Anthropic API key non configurata. Vai in Impostazioni AI.' });

  const db    = readDB();
  const users = readUsers();
  const user  = users[uid] || {};

  const settings = {
    ...DEFAULT_SETTINGS,
    userName: user.name || '',
    briefingEmail: user.email || '',
    primaryEmail: user.email || '',
    ...(db.userSettings || {})
  };

  // Stream progress via SSE
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = (obj) => {
    try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch(e) { /* client disconnected */ }
  };

  try {
    const { runMorningAgent } = require('./agent/morning-agent');

    const force = req.query.force === 'true' || req.body?.force === true;
    if (force) send({ log: '⚡ Force refresh: rianalisi completa' });

    const result = await als.run({ uid }, () => runMorningAgent({
      uid, date, settings,
      readDBForUid, writeDBForUid,
      googleClientId: GOOGLE_CLIENT_ID,
      googleClientSecret: GOOGLE_CLIENT_SECRET,
      anthropicApiKey: cfg.anthropicApiKey,
      perplexityApiKey: settings.perplexityApiKey || process.env.PERPLEXITY_API_KEY || '',
      force,
      log: (msg) => send({ log: msg })
    }));

    send({ done: true, summary: result.summary });
  } catch(e) {
    console.error('[MorningAgent]', e.message);
    send({ error: e.message });
  }

  res.end();
});

// GET /api/morning-agent/status  → last run info for current user
app.get('/api/morning-agent/status', (req, res) => {
  const db = readDB();
  const today = new Date().toISOString().slice(0, 10);
  const day = db.days?.[today];
  res.json({
    lastRun: db.morningAgentLastRun || null,
    todayPopulated: !!(day?.tasks?.length || day?.events?.length),
    dayType: day?.insights?.dayType || null
  });
});

// ── DEBUG (solo in development) ───────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  // GET /dev-login  → crea sessione demo senza OAuth (solo sviluppo)
  app.get('/dev-login', (req, res) => {
    const DEV_UID = 'dev-preview-user';
    req.session.userId = DEV_UID;
    req.session.userName = 'Preview User';
    req.session.userEmail = 'preview@glint.local';
    req.session.userPicture = '';
    // Assicura che esista un DB minimo per l'utente dev
    const devDbPath = path.join(__dirname, 'data', 'users', DEV_UID, 'db.json');
    if (!fs.existsSync(devDbPath)) {
      fs.mkdirSync(path.dirname(devDbPath), { recursive: true });
      const today = new Date().toISOString().slice(0, 10);
      fs.writeFileSync(devDbPath, JSON.stringify({
        userSettings: { name: 'Preview User', email: 'preview@glint.local', timezone: 'Europe/Rome' },
        googleTokens: null,
        days: {
          [today]: {
            events: [
              { id: 'ev1', title: 'Chiamata con cliente', time: '10:00', duration: 60, location: 'Google Meet' },
              { id: 'ev2', title: 'Pranzo di team', time: '13:00', duration: 90 }
            ],
            tasks: [
              { id: 'task-1', title: 'Revisione proposta commerciale', quadrant: 'Q1', priority: 1, done: false, brief: 'Documento da revisionare prima della call delle 10.', actionPoints: ['Aprire la bozza su Drive', 'Verificare i prezzi', 'Inviare per approvazione'] },
              { id: 'task-2', title: 'Aggiornare roadmap Q3', quadrant: 'Q2', priority: 2, done: false, brief: 'Pianificazione strategica del prossimo trimestre.', actionPoints: ['Raccogliere input dal team', 'Inserire milestone'] },
              { id: 'mail-1', title: 'Email: Richiesta preventivo da Fornitore XYZ', quadrant: 'Q1', priority: 1, done: false, brief: 'Il fornitore ha inviato una richiesta urgente di preventivo per la fornitura di materiali.', actionPoints: ['Rispondere entro oggi', 'Allegare listino prezzi', 'CC responsabile acquisti'], link: '#' }
            ],
            items: {},
            insights: { dayType: 'mixed', studyItems: [{ title: 'Articolo: Leadership nei team distribuiti', url: '#', source: 'Newsletter' }] },
            family: { alessandraEvents: [{ title: 'Visita medica', time: '15:30' }], tommasoAlerts: [{ title: 'Compiti matematica da controllare' }] },
            network: { city: 'Milano', events: [{ title: 'Aperitivo startup community', time: '19:00', location: 'Brera' }] },
            brief: 'Oggi è una giornata intensa ma ben strutturata. La mattinata è dedicata alla call con il cliente, preceduta dalla revisione della proposta. Nel pomeriggio c\'è spazio per la pianificazione strategica del Q3. Ricordati di rispondere al preventivo di Fornitore XYZ entro fine giornata.',
            agentRanAt: new Date().toISOString()
          }
        }
      }, null, 2));
    }
    res.redirect('/app.html');
  });

  // GET /api/debug/day  → dump day data for current user (last 3 days)
  app.get('/api/debug/day', (req, res) => {
    const uid = getCurrentUid();
    if (!uid) return res.status(401).json({ error: 'non autenticato' });
    const db = readDB();
    const today = new Date().toISOString().slice(0, 10);
    const days = {};
    for (let i = 0; i < 3; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const day = db.days?.[ds];
      if (day) days[ds] = {
        events: day.events?.length || 0,
        tasks: day.tasks?.length || 0,
        taskIds: (day.tasks || []).map(t => t.id),
        insights: { dayType: day.insights?.dayType, studyItems: day.insights?.studyItems?.length || 0 },
        family: { alessandra: day.family?.alessandraEvents?.length || 0, tommaso: day.family?.tommasoAlerts?.length || 0 },
        network: { city: day.network?.city || '', events: day.network?.events?.length || 0 }
      };
    }
    res.json({ uid, days, googleTokens: db.googleTokens ? 'present' : 'MISSING', userSettings: db.userSettings || {} });
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// ── WELLNESS MODULE: Oura Ring + Mendi + Brain Training ──────────────────────
// ══════════════════════════════════════════════════════════════════════════════

const OURA_CLIENT_ID = process.env.OURA_CLIENT_ID || '';
const OURA_CLIENT_SECRET = process.env.OURA_CLIENT_SECRET || '';
const OURA_REDIRECT_URI = process.env.OURA_REDIRECT_URI || `http://localhost:${process.env.PORT || 3000}/auth/oura/callback`;
const OURA_AUTH_URL = 'https://cloud.ouraring.com/oauth/authorize';
const OURA_TOKEN_URL = 'https://api.ouraring.com/oauth/token';
const OURA_API = 'https://api.ouraring.com/v2';

// ── Oura OAuth ────────────────────────────────────────────────────────────────
app.get('/auth/oura', (req, res) => {
  const uid = req.session?.userId;
  if (!uid) return res.redirect('/login.html');
  if (!OURA_CLIENT_ID) return res.status(400).send('OURA_CLIENT_ID non configurato nelle variabili d\'ambiente.');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: OURA_CLIENT_ID,
    redirect_uri: OURA_REDIRECT_URI,
    scope: 'daily heartrate workout session personal',
    state: uid
  });
  res.redirect(`${OURA_AUTH_URL}?${params}`);
});

app.get('/auth/oura/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.redirect('/wellness.html?oura=error');
  try {
    const resp = await fetch(OURA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: OURA_REDIRECT_URI,
        client_id: OURA_CLIENT_ID,
        client_secret: OURA_CLIENT_SECRET
      })
    });
    const tokens = await resp.json();
    if (!tokens.access_token) throw new Error('No access_token');
    await als.run({ uid: state }, () => {
      const db = readDB();
      db.ouraTokens = { ...tokens, connectedAt: new Date().toISOString() };
      writeDB(db);
    });
    res.redirect('/wellness.html?oura=connected');
  } catch (e) {
    console.error('Oura OAuth error:', e);
    res.redirect('/wellness.html?oura=error');
  }
});

// ── Oura token refresh ────────────────────────────────────────────────────────
async function refreshOuraToken(db) {
  if (!db.ouraTokens?.refresh_token) return null;
  try {
    const resp = await fetch(OURA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: db.ouraTokens.refresh_token,
        client_id: OURA_CLIENT_ID,
        client_secret: OURA_CLIENT_SECRET
      })
    });
    const tokens = await resp.json();
    if (tokens.access_token) {
      db.ouraTokens = { ...db.ouraTokens, ...tokens };
      writeDB(db);
      return tokens.access_token;
    }
  } catch (e) { console.error('Oura refresh error:', e); }
  return null;
}

async function ouraFetch(path, db) {
  let token = db.ouraTokens?.access_token;
  if (!token) return null;
  let resp = await fetch(`${OURA_API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (resp.status === 401) {
    token = await refreshOuraToken(db);
    if (!token) return null;
    resp = await fetch(`${OURA_API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  }
  if (!resp.ok) return null;
  return resp.json();
}

// ── GET /api/oura/status ──────────────────────────────────────────────────────
app.get('/api/oura/status', (req, res) => {
  const db = readDB();
  res.json({
    connected: !!db.ouraTokens?.access_token,
    connectedAt: db.ouraTokens?.connectedAt || null,
    lastSync: db.ouraLastSync || null
  });
});

// ── POST /api/oura/sync ───────────────────────────────────────────────────────
app.post('/api/oura/sync', async (req, res) => {
  const db = readDB();
  if (!db.ouraTokens?.access_token) return res.status(400).json({ error: 'Oura non connesso' });

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const params = `?start_date=${weekAgo}&end_date=${today}`;

  try {
    const [readiness, sleep, activity, hrv] = await Promise.all([
      ouraFetch(`/usercollection/daily_readiness${params}`, db),
      ouraFetch(`/usercollection/daily_sleep${params}`, db),
      ouraFetch(`/usercollection/daily_activity${params}`, db),
      ouraFetch(`/usercollection/heartrate?start_datetime=${weekAgo}T00:00:00&end_datetime=${today}T23:59:59`, db)
    ]);

    if (!db.ouraData) db.ouraData = {};

    // Index readiness by date
    (readiness?.data || []).forEach(d => {
      const date = d.day;
      if (!db.ouraData[date]) db.ouraData[date] = {};
      db.ouraData[date].readiness = {
        score: d.score,
        hrv_balance: d.contributors?.hrv_balance,
        recovery_index: d.contributors?.recovery_index,
        resting_heart_rate: d.contributors?.resting_heart_rate,
        sleep_balance: d.contributors?.sleep_balance,
        body_temperature: d.temperature_deviation
      };
    });

    // Index sleep by date
    (sleep?.data || []).forEach(d => {
      const date = d.day;
      if (!db.ouraData[date]) db.ouraData[date] = {};
      db.ouraData[date].sleep = {
        score: d.score,
        total_sleep: Math.round((d.contributors?.total_sleep || 0)),
        efficiency: d.contributors?.efficiency,
        rem_sleep: d.contributors?.rem_sleep,
        deep_sleep: d.contributors?.deep_sleep,
        latency: d.contributors?.latency,
        timing: d.contributors?.timing
      };
    });

    // Index activity by date
    (activity?.data || []).forEach(d => {
      const date = d.day;
      if (!db.ouraData[date]) db.ouraData[date] = {};
      db.ouraData[date].activity = {
        score: d.score,
        steps: d.steps,
        active_calories: d.active_calories,
        total_calories: d.total_calories,
        met_minutes: d.met?.average,
        sedentary_minutes: d.sedentary_time ? Math.round(d.sedentary_time / 60) : null
      };
    });

    // Compute daily avg HRV from heartrate stream
    if (hrv?.data?.length) {
      const hrvByDay = {};
      hrv.data.forEach(h => {
        const day = h.timestamp?.slice(0, 10);
        if (!day) return;
        if (!hrvByDay[day]) hrvByDay[day] = [];
        if (h.bpm) hrvByDay[day].push(h.bpm);
      });
      Object.entries(hrvByDay).forEach(([day, vals]) => {
        if (!db.ouraData[day]) db.ouraData[day] = {};
        db.ouraData[day].hrv_avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
      });
    }

    db.ouraLastSync = new Date().toISOString();
    writeDB(db);
    res.json({ ok: true, days: Object.keys(db.ouraData).length, lastSync: db.ouraLastSync });
  } catch (e) {
    console.error('Oura sync error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/oura/data?days=7 ─────────────────────────────────────────────────
app.get('/api/oura/data', (req, res) => {
  const db = readDB();
  const days = parseInt(req.query.days || '7');
  const result = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    if (db.ouraData?.[d]) result[d] = db.ouraData[d];
  }
  res.json({ data: result, lastSync: db.ouraLastSync || null });
});

// ── Mendi Sessions ────────────────────────────────────────────────────────────
// GET /api/mendi/sessions?days=30
app.get('/api/mendi/sessions', (req, res) => {
  const db = readDB();
  const days = parseInt(req.query.days || '30');
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const sessions = (db.mendiSessions || []).filter(s => s.date >= cutoff);
  res.json({ sessions });
});

// POST /api/mendi/sessions  { date, time, duration, score, mode, notes }
app.post('/api/mendi/sessions', (req, res) => {
  const { date, time, duration, score, mode, notes } = req.body;
  if (!date || score == null) return res.status(400).json({ error: 'date e score obbligatori' });
  const db = readDB();
  if (!db.mendiSessions) db.mendiSessions = [];
  const session = {
    id: uuidv4(),
    date,
    time: time || new Date().toTimeString().slice(0, 5),
    duration: duration || 20,
    score: Math.min(100, Math.max(0, Number(score))),
    mode: mode || 'focus',
    notes: notes || '',
    createdAt: new Date().toISOString()
  };
  db.mendiSessions.unshift(session);
  writeDB(db);
  res.json({ ok: true, session });
});

// DELETE /api/mendi/sessions/:id
app.delete('/api/mendi/sessions/:id', (req, res) => {
  const db = readDB();
  db.mendiSessions = (db.mendiSessions || []).filter(s => s.id !== req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// ── Brain Training ────────────────────────────────────────────────────────────
const Anthropic = require('@anthropic-ai/sdk');

// GET /api/brain/today  → restituisce (o genera) il piano di allenamento di oggi
app.get('/api/brain/today', async (req, res) => {
  const db = readDB();
  const today = new Date().toISOString().slice(0, 10);

  // Ritorna cached se già generato oggi
  if (db.brainTraining?.[today]?.exercises?.length) {
    return res.json({ date: today, ...db.brainTraining[today] });
  }

  // Costruisce contesto dai dati Oura
  const oura = db.ouraData?.[today] || db.ouraData?.[Object.keys(db.ouraData || {}).sort().pop()] || {};
  const mendiRecent = (db.mendiSessions || []).slice(0, 5);
  const mendiAvg = mendiRecent.length ? Math.round(mendiRecent.reduce((a, b) => a + b.score, 0) / mendiRecent.length) : null;

  const context = `
Dati biometrici utente (oggi o ultimo disponibile):
- Readiness Oura: ${oura.readiness?.score ?? 'N/D'}/100
- Sleep Oura: ${oura.sleep?.score ?? 'N/D'}/100 (totale ${oura.sleep?.total_sleep ?? '?'} min)
- HRV medio: ${oura.hrv_avg ?? 'N/D'} ms
- Activity: ${oura.activity?.score ?? 'N/D'}/100, passi: ${oura.activity?.steps ?? 'N/D'}
- Mendi score medio (ultime 5 sessioni): ${mendiAvg ?? 'N/D'}/100
`;

  try {
    const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await ai.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `Sei un coach neurocognitivo. Basandoti sui seguenti dati biometrici, crea un piano di allenamento cerebrale personalizzato per oggi.

${context}

Genera un piano con esattamente 4 esercizi cognitivi, bilanciati in base allo stato biometrico (se readiness è bassa, privilegia esercizi leggeri; se è alta, sfida cognitiva più intensa).

Rispondi SOLO con JSON valido in questo formato:
{
  "neuroscore": <numero 0-100 composito basato sui dati>,
  "neurostate": "<stato in 2-3 parole, es. 'Mente acuta', 'Recupero attivo', 'Focus elevato'>",
  "recommendation": "<frase di 1-2 righe su come approcciarsi alla giornata mentalmente>",
  "exercises": [
    {
      "id": "ex-1",
      "category": "<Memoria|Focus|Creatività|Problem Solving|Mindfulness>",
      "title": "<titolo esercizio>",
      "description": "<descrizione chiara di come eseguirlo, 2-3 righe>",
      "duration_minutes": <5-15>,
      "difficulty": "<Leggero|Medio|Intenso>",
      "icon": "<emoji>",
      "tip": "<consiglio scientifico breve>"
    }
  ]
}`
      }]
    });

    const raw = msg.content[0]?.text || '';
    let plan = null;
    try { plan = JSON.parse(raw.trim()); } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) try { plan = JSON.parse(m[0]); } catch {}
    }

    if (!plan) throw new Error('Parse fallito');

    if (!db.brainTraining) db.brainTraining = {};
    db.brainTraining[today] = {
      ...plan,
      completed: [],
      generatedAt: new Date().toISOString()
    };
    writeDB(db);
    res.json({ date: today, ...db.brainTraining[today] });
  } catch (e) {
    console.error('Brain training gen error:', e);
    // Fallback statico
    const fallback = {
      neuroscore: 70,
      neurostate: 'Modalità standard',
      recommendation: 'Inizia con qualcosa di leggero e aumenta gradualmente l\'intensità cognitiva.',
      exercises: [
        { id: 'ex-1', category: 'Focus', title: 'Respirazione 4-7-8', description: 'Inspira per 4 secondi, trattieni per 7, espira per 8. Ripeti 4 volte. Attiva il sistema parasimpatico.', duration_minutes: 5, difficulty: 'Leggero', icon: '🌬️', tip: 'Riduce il cortisolo del 23% in media.' },
        { id: 'ex-2', category: 'Memoria', title: 'Metodo dei loci', description: 'Visualizza il tuo percorso casa-lavoro e posiziona mentalmente 5 oggetti da ricordare oggi in punti precisi del tragitto.', duration_minutes: 8, difficulty: 'Medio', icon: '🧠', tip: 'Tecnica usata dai campioni di memoria mondiali.' },
        { id: 'ex-3', category: 'Problem Solving', title: 'Reverse thinking', description: 'Prendi il problema più complesso che hai oggi e chiediti: come potrei PEGGIORARLO? Poi inverti le risposte per trovare soluzioni.', duration_minutes: 10, difficulty: 'Medio', icon: '🔄', tip: 'Tecnica usata da Jeff Bezos per l\'innovazione.' },
        { id: 'ex-4', category: 'Mindfulness', title: 'Body scan cognitivo', description: 'Chiudi gli occhi, porta l\'attenzione da testa a piedi, nota le sensazioni senza giudicarle. Poi identifica 3 pensieri ricorrenti di oggi.', duration_minutes: 7, difficulty: 'Leggero', icon: '🔍', tip: 'Aumenta la metacognizione e la consapevolezza emotiva.' }
      ],
      completed: [],
      generatedAt: new Date().toISOString(),
      isFallback: true
    };
    if (!db.brainTraining) db.brainTraining = {};
    db.brainTraining[today] = fallback;
    writeDB(db);
    res.json({ date: today, ...fallback });
  }
});

// POST /api/brain/complete  { exerciseId }
app.post('/api/brain/complete', (req, res) => {
  const { exerciseId } = req.body;
  const db = readDB();
  const today = new Date().toISOString().slice(0, 10);
  if (!db.brainTraining?.[today]) return res.status(404).json({ error: 'Piano non trovato' });
  const completed = db.brainTraining[today].completed || [];
  if (!completed.includes(exerciseId)) completed.push(exerciseId);
  db.brainTraining[today].completed = completed;
  if (completed.length === db.brainTraining[today].exercises?.length) {
    db.brainTraining[today].completedAllAt = new Date().toISOString();
  }
  writeDB(db);
  // Calcola streak
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const day = db.brainTraining?.[d];
    if (day?.completedAllAt || (day?.completed?.length && day?.completed?.length >= (day?.exercises?.length || 4))) streak++;
    else break;
  }
  res.json({ ok: true, completed, streak });
});

// GET /api/brain/stats  → streak, history
app.get('/api/brain/stats', (req, res) => {
  const db = readDB();
  const days = 30;
  const history = [];
  let streak = 0;
  let streakBroken = false;

  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const day = db.brainTraining?.[d];
    const total = day?.exercises?.length || 0;
    const done = day?.completed?.length || 0;
    const complete = total > 0 && done >= total;
    history.push({ date: d, neuroscore: day?.neuroscore || null, done, total, complete });
    if (i === 0 || !streakBroken) {
      if (complete) streak++;
      else if (i > 0) streakBroken = true;
    }
  }
  res.json({ streak, history: history.reverse() });
});

// ── GET /api/wellness/summary ─────────────────────────────────────────────────
app.get('/api/wellness/summary', (req, res) => {
  const db = readDB();
  const today = new Date().toISOString().slice(0, 10);
  const oura = db.ouraData?.[today] || null;
  const mendiRecent = (db.mendiSessions || []).slice(0, 7);
  const mendiAvg7 = mendiRecent.length ? Math.round(mendiRecent.reduce((a, b) => a + b.score, 0) / mendiRecent.length) : null;
  const brain = db.brainTraining?.[today] || null;

  // Composite wellness score
  const scores = [];
  if (oura?.readiness?.score) scores.push(oura.readiness.score);
  if (oura?.sleep?.score) scores.push(oura.sleep.score);
  if (mendiAvg7) scores.push(mendiAvg7);
  if (brain?.neuroscore) scores.push(brain.neuroscore);
  const composite = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  res.json({
    composite,
    ouraConnected: !!db.ouraTokens?.access_token,
    ouraLastSync: db.ouraLastSync || null,
    oura: oura || null,
    mendiSessionsTotal: (db.mendiSessions || []).length,
    mendiAvg7,
    brain: brain ? { neuroscore: brain.neuroscore, neurostate: brain.neurostate, exercisesTotal: brain.exercises?.length, exercisesDone: brain.completed?.length } : null
  });
});

// ── START ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Daily Tracker running → http://localhost:${PORT}`);
});
