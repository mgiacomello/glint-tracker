/* ── Auth check ─────────────────────────────────────────────────────────── */
(async () => {
  try {
    const me = await fetch('/api/me', { credentials: 'include' }).then(r => r.ok ? r.json() : null);
    if (!me) { location.href = '/login.html'; return; }
    // Update header with user info
    const greet = document.getElementById('greeting');
    const h = new Date().getHours();
    const saluto = h < 12 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera';
    const firstName = (me.name || me.email || '').split(' ')[0];
    if (greet) greet.textContent = `${saluto}, ${firstName}`;
    const initials = document.getElementById('user-initials');
    const pic = document.getElementById('user-pic');
    if (me.picture && pic) { pic.src = me.picture; pic.style.display = 'block'; if (initials) initials.style.display = 'none'; }
    else if (initials) { initials.textContent = firstName[0]?.toUpperCase() || '?'; }
    const menuName = document.getElementById('user-menu-name');
    if (menuName) menuName.textContent = me.name || me.email;
  } catch { location.href = '/login.html'; }
})();

function toggleUserMenu() {
  const m = document.getElementById('user-menu');
  if (m) m.style.display = m.style.display === 'none' ? 'block' : 'none';
}
document.addEventListener('click', e => {
  if (!e.target.closest('#user-avatar-wrap') && !e.target.closest('#user-menu')) {
    const m = document.getElementById('user-menu'); if (m) m.style.display = 'none';
  }
});

/* ── State ───────────────────────────────────────────────────────────────── */
const API = '/api';
let currentDate  = todayStr();
let currentMonth = currentDate.slice(0, 7);
let currentWeekOffset = 0; // weeks relative to today
let dayData   = { events: [], tasks: [], items: {}, reflection: '', briefing: '' };
let monthData = { kpis: [], objectives: [], completedItems: 0, totalItems: 0 };
let activePanel = null;
let refreshInterval = null;
let countdownInterval = null;
let draggedItemId = null;

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return new Date(+y, +m - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
}

// Returns Monday of the week containing `date` (YYYY-MM-DD)
function weekStart(date, offsetWeeks = 0) {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offsetWeeks * 7);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── QUOTE OF THE DAY ───────────────────────────────────────────────────── */
const QUOTES_OF_DAY = [
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs", role: "Co-founder, Apple" },
  { text: "Whether you think you can, or you think you can't — you're right.", author: "Henry Ford", role: "Fondatore, Ford Motor Company" },
  { text: "The biggest risk is not taking any risk.", author: "Mark Zuckerberg", role: "Co-founder, Meta" },
  { text: "If you're not embarrassed by the first version of your product, you've launched too late.", author: "Reid Hoffman", role: "Co-founder, LinkedIn" },
  { text: "I never dreamed about success. I worked for it.", author: "Estée Lauder", role: "Fondatrice, Estée Lauder Companies" },
  { text: "Your most unhappy customers are your greatest source of learning.", author: "Bill Gates", role: "Co-founder, Microsoft" },
  { text: "Chase the vision, not the money; the money will end up following you.", author: "Tony Hsieh", role: "CEO, Zappos" },
  { text: "It's not about ideas. It's about making ideas happen.", author: "Scott Belsky", role: "Co-founder, Behance" },
  { text: "Business opportunities are like buses — there's always another one coming.", author: "Richard Branson", role: "Fondatore, Virgin Group" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain", role: "Autore & imprenditore" },
  { text: "Don't be afraid to give up the good to go for the great.", author: "John D. Rockefeller", role: "Fondatore, Standard Oil" },
  { text: "I find that the harder I work, the more luck I seem to have.", author: "Thomas Jefferson", role: "Presidente USA & pensatore" },
  { text: "Formal education will make you a living; self-education will make you a fortune.", author: "Jim Rohn", role: "Imprenditore & filosofo" },
  { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar", role: "Imprenditore & motivatore" },
  { text: "An entrepreneur is someone who jumps off a cliff and builds a plane on the way down.", author: "Reid Hoffman", role: "Co-founder, LinkedIn" },
  { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney", role: "Fondatore, The Walt Disney Company" },
  { text: "Risk more than others think is safe. Dream more than others think is practical.", author: "Howard Schultz", role: "Ex CEO, Starbucks" },
  { text: "If you can dream it, you can do it.", author: "Walt Disney", role: "Fondatore, The Walt Disney Company" },
  { text: "Success usually comes to those who are too busy to be looking for it.", author: "Henry David Thoreau", role: "Filosofo & scrittore" },
  { text: "It does not matter how slowly you go, as long as you do not stop.", author: "Confucio", role: "Filosofo" },
  { text: "Be so good they can't ignore you.", author: "Steve Martin", role: "Autore & imprenditore" },
  { text: "Do not go where the path may lead; go instead where there is no path and leave a trail.", author: "Ralph Waldo Emerson", role: "Filosofo & saggista" },
  { text: "In the middle of every difficulty lies opportunity.", author: "Albert Einstein", role: "Fisico & inventore" },
  { text: "I'm convinced that about half of what separates successful entrepreneurs from the non-successful ones is pure perseverance.", author: "Steve Jobs", role: "Co-founder, Apple" },
  { text: "Move fast and break things. Unless you are breaking stuff, you are not moving fast enough.", author: "Mark Zuckerberg", role: "Co-founder, Meta" },
  { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Proverbio cinese" },
  { text: "Twenty years from now you will be more disappointed by the things that you didn't do than by the ones you did.", author: "Mark Twain", role: "Autore & imprenditore" },
  { text: "Life is what happens to you while you're busy making other plans.", author: "John Lennon", role: "Musicista & imprenditore" },
  { text: "Strive not to be a success, but rather to be of value.", author: "Albert Einstein", role: "Fisico & inventore" },
  { text: "Innovation distinguishes between a leader and a follower.", author: "Steve Jobs", role: "Co-founder, Apple" },
  { text: "Everything you've ever wanted is on the other side of fear.", author: "George Addair", role: "Imprenditore" },
  { text: "People who are crazy enough to think they can change the world are the ones who do.", author: "Rob Siltanen", role: "Apple 'Think Different' Campaign" },
  { text: "The successful warrior is the average man, with laser-like focus.", author: "Bruce Lee", role: "Attore & filosofo" },
  { text: "Customer service shouldn't just be a department, it should be the entire company.", author: "Tony Hsieh", role: "CEO, Zappos" },
  { text: "Genius is one percent inspiration and ninety-nine percent perspiration.", author: "Thomas Edison", role: "Inventore & imprenditore" },
  { text: "A pessimist sees the difficulty in every opportunity; an optimist sees the opportunity in every difficulty.", author: "Winston Churchill", role: "Statista & leader" },
  { text: "It's not the strongest of the species that survive, but those most responsive to change.", author: "Charles Darwin", role: "Naturalista & scienziato" },
  { text: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", author: "Aristotele", role: "Filosofo" },
  { text: "If you want to lift yourself up, lift up someone else.", author: "Booker T. Washington", role: "Educatore & imprenditore" },
  { text: "Opportunities multiply as they are seized.", author: "Sun Tzu", role: "Stratega militare" },
  { text: "Talent wins games, but teamwork and intelligence win championships.", author: "Michael Jordan", role: "Atleta & imprenditore" },
  { text: "Whatever the mind of man can conceive and believe, it can achieve.", author: "Napoleon Hill", role: "Autore & filosofo del successo" },
  { text: "If you double the number of experiments you do per year, you're going to double your inventiveness.", author: "Jeff Bezos", role: "Fondatore, Amazon" },
  { text: "Don't let yesterday take up too much of today.", author: "Will Rogers", role: "Autore & comico" },
  { text: "You miss 100% of the shots you don't take.", author: "Wayne Gretzky", role: "Atleta & imprenditore" },
  { text: "Price is what you pay. Value is what you get.", author: "Warren Buffett", role: "CEO, Berkshire Hathaway" },
  { text: "I have not failed. I've just found 10,000 ways that won't work.", author: "Thomas Edison", role: "Inventore & imprenditore" },
  { text: "A goal is not always meant to be reached; it often serves simply as something to aim at.", author: "Bruce Lee", role: "Attore & filosofo" },
  { text: "Logic will get you from A to B. Imagination will take you everywhere.", author: "Albert Einstein", role: "Fisico & inventore" },
  { text: "If you are not willing to risk the usual, you will have to settle for the ordinary.", author: "Jim Rohn", role: "Imprenditore & filosofo" },
];

function getTodayQuote() {
  const yr = currentDate.slice(0, 4);
  const start = new Date(yr + '-01-01T12:00:00Z');
  const today = new Date(currentDate + 'T12:00:00Z');
  const dayOfYear = Math.round((today - start) / 86400000);
  return QUOTES_OF_DAY[dayOfYear % QUOTES_OF_DAY.length];
}

/* ── Init ────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  setGreeting();
  document.getElementById('date-display').textContent = fmtDate(currentDate);
  loadDay();
  setupTabs();
  setupSubTabs();
  setupCompletedToggle();
  setupPanel();
  setupAddItem();
  setupReflection();
  setupProjects();
  setupPipeline();
  setupReflectionPopup();
  initAiAssistant();
  startAutoRefresh();
});

function setGreeting() {
  const h = new Date().getHours();
  document.getElementById('greeting').textContent =
    h < 12 ? 'Buongiorno, Marco' : h < 18 ? 'Buon pomeriggio, Marco' : 'Buonasera, Marco';
}

/* ── Auto-refresh (every 30s, paused while panel is open) ────────────────── */
function startAutoRefresh() {
  refreshInterval = setInterval(() => {
    if (!activePanel) loadDay();
  }, 30000);
}

/* ── Tabs ────────────────────────────────────────────────────────────────── */
function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      tab.classList.add('active');
      const viewId = 'view-' + tab.dataset.view;
      const view = document.getElementById(viewId);
      if (view) view.classList.add('active');
      if (tab.dataset.view === 'month')    loadMonth();
      if (tab.dataset.view === 'week')   { loadWeek(); startWeekRefresh(); }
      else                                 stopWeekRefresh();
      if (tab.dataset.view === 'projects') loadProjects();
      if (tab.dataset.view === 'pipeline') loadPipeline();
    });
  });
}

/* ── DAY VIEW ────────────────────────────────────────────────────────────── */
async function loadDay() {
  dayData = await api('GET', `/day/${currentDate}`);

  // Auto carry-forward: if today is empty, bring incomplete tasks from last populated day
  if (currentDate === todayStr() && dayData.tasks.length === 0 && dayData.events.length === 0) {
    const cf = await api('POST', `/auto-carry-forward/${currentDate}`);
    if (cf?.carried > 0) {
      dayData = await api('GET', `/day/${currentDate}`);
      showCarryForwardBanner(cf.carried, cf.fromDate);
    }
  }

  // Auto-generate briefing + AI narrative if not yet present (always regenerate for today)
  if (dayData.tasks.length > 0 || dayData.events.length > 0) {
    const isToday = currentDate === todayStr();
    const needsGen = !dayData.narrative || (isToday && !dayData.briefing);
    if (needsGen) {
      try {
        const gen = await api('GET', `/day/${currentDate}/briefing/generate`);
        if (gen?.briefing)  dayData.briefing  = gen.briefing;
        if (gen?.narrative) dayData.narrative  = gen.narrative;
      } catch(e) {}
    }
  }

  renderDay();
  updateNextEventBanner();
}

function showCarryForwardBanner(count, fromDate) {
  const existing = document.getElementById('cf-banner');
  if (existing) existing.remove();
  const banner = document.createElement('div');
  banner.id = 'cf-banner';
  banner.className = 'cf-banner';
  banner.innerHTML = `<span>📋 ${count} task in sospeso riportati dal ${fmtDate(fromDate)}</span><button onclick="this.parentElement.remove()" class="btn-ghost" style="padding:2px 8px;font-size:12px">✕</button>`;
  const target = document.getElementById('sub-priority');
  if (target) target.prepend(banner);
  setTimeout(() => banner?.remove(), 8000);
}

function renderDay() {
  const bb = document.getElementById('briefing-box');
  const bc = document.getElementById('briefing-content');
  if (dayData.narrative || dayData.briefing) {
    bb.classList.remove('hidden');
    let html = '';
    if (dayData.narrative) {
      // Rich AI brief: split paragraphs, render each as a <p>
      const paras = dayData.narrative.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
      if (paras.length > 1) {
        html += `<div class="briefing-narrative">${paras.map(p => `<p>${escHtml(p).replace(/\n/g,'<br>')}</p>`).join('')}</div>`;
      } else {
        html += `<div class="briefing-narrative"><p>${escHtml(dayData.narrative).replace(/\n/g,'<br>')}</p></div>`;
      }
    } else if (dayData.briefing) {
      // Fallback: bullet summary (when AI is unavailable)
      html += `<div class="briefing-bullets">${escHtml(dayData.briefing).replace(/\n/g,'<br>')}</div>`;
    }
    bc.innerHTML = html;
  }

  const items = Object.values(dayData.items);
  const done  = items.filter(i => i.done).length;
  document.getElementById('day-progress').textContent = `${done} / ${items.length} completati`;

  // Day type badge → Quote of the Day
  renderDayTypeBadge();
  checkEveningReflectionPopup();

  // Pre-populate reflection
  const reflEl = document.getElementById('reflection-input');
  if (reflEl && dayData.reflection && !reflEl.value) reflEl.value = dayData.reflection;

  ['q1','q2','q3','q4'].forEach(q => {
    document.getElementById(`${q}-items`).innerHTML = '';
  });

  // Transfer events belong only in the Trasferimenti tab — exclude from matrix
  const TRANSFER_TITLE_RX = /\b(volo|flight|aereo|malpensa|linate|fiumicino|ciampino|wizz air|wizz|ryanair|easyjet|ita airways|lufthansa|alitalia|frecciarossa|frecciargento|trenitalia|italo treno|imbarco|boarding)\b/i;
  const nonTransferEvents = dayData.events.filter(e =>
    e.type !== 'transfer' && !TRANSFER_TITLE_RX.test(e.title || '')
  );

  const allItems = [
    ...nonTransferEvents.map(e => ({ ...e, itemType: 'event' })),
    ...dayData.tasks.map(t => ({ ...t, itemType: 'task' }))
  ];

  if (allItems.length === 0) {
    ['q1','q2','q3','q4'].forEach(q => {
      document.getElementById(`${q}-items`).innerHTML = '<div class="empty-quadrant">Nessun elemento</div>';
    });
    renderCompletedSection([]);
    return;
  }

  const pendingItems   = [];
  const completedItems = [];

  allItems.forEach(item => {
    const state = dayData.items[item.id] || { done: false, comment: '', actionPoints: [], quadrant: 'Q2' };
    if (state.done) {
      completedItems.push({ item, state });
    } else {
      pendingItems.push({ item, state });
    }
  });

  // Render pending items into quadrants
  pendingItems.forEach(({ item, state }) => {
    const q = (state.quadrant || 'Q2').toLowerCase();
    const container = document.getElementById(`${q}-items`);
    if (!container) return;
    container.appendChild(buildItemCard(item, state));
  });

  ['q1','q2','q3','q4'].forEach(q => {
    const c = document.getElementById(`${q}-items`);
    if (!c.hasChildNodes()) c.innerHTML = '<div class="empty-quadrant">Vuoto</div>';
  });

  // Render completed section separately
  renderCompletedSection(completedItems);

  setupDragDrop();
}

function buildItemCard(item, state) {
  const card = document.createElement('div');
  card.className = 'item-card' + (state.done ? ' done' : '');
  card.dataset.id = item.id;
  card.setAttribute('draggable', 'true');

  const isCarried = item.carriedFrom;
  const isTommaso = item.source === 'tommaso';
  const tagClass = isCarried ? 'tag-carried'
    : isTommaso ? 'tag-tommaso'
    : (item.itemType === 'event' ? 'tag-event' : 'tag-task');
  const tagLabel = isCarried ? 'Riportato'
    : isTommaso ? '🎒 Tommaso'
    : (item.itemType === 'event' ? 'Evento' : 'Task');
  const apCount = (state.actionPoints || []).length;
  const apDone  = (state.actionPoints || []).filter(a => a.done).length;

  card.innerHTML = `
    <div class="item-check ${state.done ? 'checked' : ''}" data-check="${item.id}"></div>
    <div class="item-body">
      <div class="item-title">${escHtml(item.title || item.summary || 'Senza titolo')}</div>
      <div class="item-meta">${escHtml(item.time || item.due || '')}</div>
      ${apCount ? `<div class="item-ap-count">${apDone}/${apCount} action point</div>` : ''}
    </div>
    <span class="item-tag ${tagClass}">${tagLabel}</span>
  `;

  card.querySelector('[data-check]').addEventListener('click', async e => {
    e.stopPropagation();
    state.done = !state.done;
    await api('POST', `/day/${currentDate}/item/${item.id}`, { done: state.done });
    renderDay();
  });

  card.addEventListener('click', () => openPanel(item, state));
  return card;
}

/* ── Next Event Banner ───────────────────────────────────────────────────── */
function updateNextEventBanner() {
  if (countdownInterval) clearInterval(countdownInterval);

  const now = new Date();
  const todayEvents = (dayData.events || []).filter(e => e.time);

  // Parse "HH:MM – HH:MM" → get start time as Date
  function parseEventStart(e) {
    const match = (e.time || '').match(/^(\d{2}):(\d{2})/);
    if (!match) return null;
    const d = new Date();
    d.setHours(+match[1], +match[2], 0, 0);
    return d;
  }

  const upcoming = todayEvents
    .map(e => ({ event: e, start: parseEventStart(e) }))
    .filter(x => x.start && x.start > now)
    .sort((a, b) => a.start - b.start);

  const banner = document.getElementById('next-event-banner');

  if (!upcoming.length) {
    banner.classList.add('hidden');
    return;
  }

  banner.classList.remove('hidden');
  const next = upcoming[0];

  document.getElementById('neb-title').textContent = next.event.title || 'Evento';

  const nebLink = document.getElementById('neb-link');
  if (next.event.link) {
    nebLink.href = next.event.link;
    nebLink.style.display = '';
  } else {
    nebLink.style.display = 'none';
  }

  function tick() {
    const diff = Math.max(0, next.start - new Date());
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    let label = '';
    if (h > 0) label = `tra ${h}h ${m}m`;
    else if (m > 0) label = `tra ${m}m ${s}s`;
    else if (diff > 0) label = `tra ${s}s`;
    else label = 'In corso';
    document.getElementById('neb-countdown').textContent = label;
    if (diff === 0) clearInterval(countdownInterval);
  }
  tick();
  countdownInterval = setInterval(tick, 1000);
}

/* ── Drag & Drop between quadrants ──────────────────────────────────────── */
function setupDragDrop() {
  document.querySelectorAll('.item-card[draggable]').forEach(card => {
    card.addEventListener('dragstart', e => {
      draggedItemId = card.dataset.id;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      draggedItemId = null;
    });
  });

  document.querySelectorAll('.quadrant-items').forEach(zone => {
    zone.addEventListener('dragover', e => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', async e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      if (!draggedItemId) return;
      const quadrant = zone.id.replace('-items', '').toUpperCase(); // q1-items → Q1
      const state = dayData.items[draggedItemId];
      if (!state || state.quadrant === quadrant) return;
      state.quadrant = quadrant;
      await api('POST', `/day/${currentDate}/item/${draggedItemId}`, { quadrant });
      renderDay();
    });
  });
}

/* ── Add item manually ───────────────────────────────────────────────────── */
function setupAddItem() {
  document.getElementById('add-item-btn').addEventListener('click', async () => {
    const title = document.getElementById('new-item-title').value.trim();
    if (!title) return;
    const quadrant = document.getElementById('new-item-quadrant').value;
    const type = document.getElementById('new-item-type').value;
    const id = 'manual-' + Date.now();
    const newItem = { id, title, time: '', itemType: type };
    if (type === 'event') dayData.events.push(newItem);
    else dayData.tasks.push(newItem);
    dayData.items[id] = { done: false, comment: '', actionPoints: [], quadrant, type };
    await api('POST', `/day/${currentDate}/populate`, {
      events: type === 'event' ? [newItem] : [],
      tasks:  type === 'task'  ? [newItem] : [],
    });
    await api('POST', `/day/${currentDate}/item/${id}`, { done: false, comment: '', actionPoints: [], quadrant, type });
    document.getElementById('new-item-title').value = '';
    loadDay();
  });
}

/* ── Reflection ──────────────────────────────────────────────────────────── */
function setupReflection() {
  const input = document.getElementById('reflection-input');
  if (dayData.reflection) input.value = dayData.reflection;
  document.getElementById('save-reflection').addEventListener('click', async () => {
    await api('POST', `/day/${currentDate}/reflection`, { reflection: input.value });
    const ind = document.getElementById('reflection-saved');
    ind.classList.remove('hidden');
    setTimeout(() => ind.classList.add('hidden'), 2000);
  });
}

/* ── EVENING REFLECTION POPUP ────────────────────────────────────────────── */
function checkEveningReflectionPopup() {
  const hour = new Date().getHours();
  if (hour < 19) return;
  const key = 'refl-shown-' + currentDate;
  if (localStorage.getItem(key)) return;
  const overlay = document.getElementById('refl-overlay');
  if (!overlay) return;
  setTimeout(openReflectionPopup, 1200);
}

function openReflectionPopup() {
  const overlay = document.getElementById('refl-overlay');
  if (!overlay) return;
  const dateLabel = document.getElementById('refl-date-label');
  if (dateLabel) dateLabel.textContent = fmtDate(currentDate);
  // Pre-fill from existing saved answers
  const ev = dayData.insights?.eveningAnswers || {};
  const q1El = document.getElementById('refl-q1');
  const q2El = document.getElementById('refl-q2');
  const q3El = document.getElementById('refl-q3');
  if (q1El) q1El.value = ev.q1 || '';
  if (q2El) q2El.value = ev.q2 || '';
  if (q3El) q3El.value = ev.q3 || '';
  // Show existing analysis if already saved
  if (dayData.insights?.eveningInsight) {
    renderAnalysisResult(dayData.insights.eveningInsight, dayData.insights.eveningTags || []);
  } else {
    const el = document.getElementById('refl-analysis-result');
    if (el) el.classList.add('hidden');
  }
  overlay.classList.remove('hidden');
  requestAnimationFrame(() => overlay.classList.add('open'));
}

function closeReflectionPopup(markShown = true) {
  const overlay = document.getElementById('refl-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  setTimeout(() => overlay.classList.add('hidden'), 220);
  if (markShown) localStorage.setItem('refl-shown-' + currentDate, '1');
}

function renderAnalysisResult(insightText, tags) {
  const el = document.getElementById('refl-analysis-result');
  if (!el) return;
  const tagsHtml = (tags || []).map(t => `<span class="refl-atag">${escHtml(t)}</span>`).join('');
  el.innerHTML = `
    <div class="refl-analysis-header">🔍 Analisi della giornata</div>
    ${tagsHtml ? `<div class="refl-tags">${tagsHtml}</div>` : ''}
    <div class="refl-analysis-text">${escHtml(insightText)}</div>`;
  el.classList.remove('hidden');
}

function analyzeReflection(answers) {
  const { q1 = '', q2 = '', q3 = '' } = answers;
  const tags = [];
  const sections = [];

  // Task completion rate
  const items = Object.values(dayData.items || {});
  const total = items.length;
  const done  = items.filter(i => i.done).length;
  if (total > 0) {
    const pct = Math.round((done / total) * 100);
    if (pct >= 80) {
      sections.push(`Hai completato il ${pct}% delle attività — una giornata ad alta produttività.`);
      tags.push('🏆 Produttivo');
    } else if (pct >= 50) {
      sections.push(`Completato il ${pct}% delle attività. Parti dai punti in sospeso domani mattina.`);
      tags.push('📊 In linea');
    } else {
      sections.push(`Solo il ${pct}% completato: valuta se riassegnare o semplificare i task residui.`);
      tags.push('⚠️ Da recuperare');
    }
  }

  // Energy level from q2
  if (q2.trim()) {
    if (/ottim|eccell|benissim|energic|caric|foric|super|al massimo/i.test(q2)) {
      sections.push('Livello di energia alto: capitalizza questo momento aumentando la profondità del lavoro nei prossimi giorni.');
      tags.push('⚡ Alta energia');
    } else if (/stanc|esaurit|stressa|pesant|fatic|difficil|basso|poco/i.test(q2)) {
      sections.push('Energia bassa oggi: priorità al recupero fisico stanotte. Considera di alleggerire l\'agenda di domani.');
      tags.push('🔋 Ricarica');
    } else {
      sections.push('Energia nella media. La disciplina batte la motivazione nel lungo periodo: mantieni la costanza.');
      tags.push('✅ Equilibrato');
    }
  }

  // Forward planning quality from q3
  if (q3.trim()) {
    if (q3.length > 40 && /\d/.test(q3)) {
      sections.push('I tuoi prossimi passi sono concreti e misurabili — ottima pianificazione operativa.');
      tags.push('🎯 Pianificato');
    } else if (q3.length > 20) {
      sections.push('Buone intenzioni nei prossimi passi. Aggiungi metriche o scadenze per renderli più azionabili.');
      tags.push('📋 Da definire');
    } else {
      sections.push('Prossimi passi sintetici: domani dedica 5 minuti a dettagliarli prima di iniziare.');
      tags.push('📌 Da espandere');
    }
  }

  // Learning detection from q1
  if (/impar|capito|scopert|realizz|compreso|insight|appreso/i.test(q1)) {
    sections.push('Hai rilevato un\'area di apprendimento: segnale di growth mindset attivo.');
    tags.push('🧠 Growth mindset');
  }

  const insightText = sections.length > 0
    ? sections.join(' ')
    : 'Ottima abitudine la riflessione serale. La consistenza nel tempo è la vera leva di crescita.';

  return { insightText, tags };
}

async function saveEveningReflection() {
  const q1 = document.getElementById('refl-q1')?.value?.trim() || '';
  const q2 = document.getElementById('refl-q2')?.value?.trim() || '';
  const q3 = document.getElementById('refl-q3')?.value?.trim() || '';
  if (!q1 && !q2 && !q3) return;

  const answers = { q1, q2, q3 };
  const { insightText, tags } = analyzeReflection(answers);

  // Save to reflection field
  const reflText = [
    q1 && `📋 Bilancio: ${q1}`,
    q2 && `⚡ Energia: ${q2}`,
    q3 && `🎯 Prossimi passi: ${q3}`
  ].filter(Boolean).join('\n\n');
  await api('POST', `/day/${currentDate}/reflection`, { reflection: reflText });

  // Merge into insights (preserve existing fields)
  const mergedInsights = {
    ...(dayData.insights || {}),
    eveningAnswers: answers,
    eveningInsight: insightText,
    eveningTags: tags
  };
  await api('POST', `/day/${currentDate}/insights`, mergedInsights);
  dayData.insights = mergedInsights;

  renderAnalysisResult(insightText, tags);
  localStorage.setItem('refl-shown-' + currentDate, '1');

  // Refresh Crescita tab if visible
  const growthTab = document.querySelector('.sub-tab[data-sub="growth"]');
  if (growthTab?.classList.contains('active')) renderInsights();
}

function setupReflectionPopup() {
  document.getElementById('refl-close')?.addEventListener('click', () => closeReflectionPopup(false));
  document.getElementById('refl-skip')?.addEventListener('click',  () => closeReflectionPopup(true));
  document.getElementById('refl-save')?.addEventListener('click',  saveEveningReflection);
  document.getElementById('refl-overlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('refl-overlay')) closeReflectionPopup(false);
  });
  document.getElementById('open-refl-btn')?.addEventListener('click', openReflectionPopup);
}

/* ── Briefing toggle ─────────────────────────────────────────────────────── */
document.getElementById('briefing-toggle').addEventListener('click', () => {
  const c = document.getElementById('briefing-content');
  const btn = document.getElementById('briefing-toggle');
  btn.textContent = c.classList.toggle('hidden') ? 'Mostra' : 'Nascondi';
});

/* ── DETAIL PANEL ────────────────────────────────────────────────────────── */
function setupPanel() {
  document.getElementById('panel-close').addEventListener('click', closePanel);
  document.getElementById('panel-overlay').addEventListener('click', closePanel);
  document.getElementById('panel-done').addEventListener('change', e => {
    document.getElementById('panel-done-label').textContent = e.target.checked ? 'Completato' : 'Da fare';
  });
  document.getElementById('panel-save').addEventListener('click', savePanel);
  document.getElementById('add-ap-btn').addEventListener('click', addActionPoint);
  document.getElementById('new-ap-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addActionPoint();
  });
}

async function openPanel(item, state) {
  activePanel = { id: item.id, item, state };

  document.getElementById('panel-title').textContent = item.title || item.summary || 'Senza titolo';
  document.getElementById('panel-subtitle').textContent = item.time || item.due || (item.itemType === 'event' ? 'Evento' : 'Task');

  // Tags row
  const tagsRow = document.getElementById('panel-tags-row');
  const q = state.quadrant || item.quadrant || 'Q2';
  const qColors = { Q1:'#f87171', Q2:'#60a5fa', Q3:'#fb923c', Q4:'#94a3b8' };
  const qLabels = { Q1:'Q1 Urgente', Q2:'Q2 Importante', Q3:'Q3 Urgente', Q4:'Q4 Bassa' };
  const typeLabel = item.itemType === 'event' ? 'Evento' : 'Task';
  tagsRow.innerHTML = `
    <span class="ptag" style="background:${qColors[q]}22;color:${qColors[q]}">${qLabels[q]||q}</span>
    <span class="ptag ptag-type">${typeLabel}</span>
    ${item.source === 'tommaso' ? '<span class="ptag ptag-tommaso">🎒 Tommaso</span>' : ''}
  `;

  // External link
  const extLink = document.getElementById('panel-ext-link');
  if (item.link) {
    extLink.href = item.link;
    extLink.textContent = item.itemType === 'event' ? '📅 Calendar ↗' : '📧 Gmail ↗';
    extLink.style.display = '';
  } else {
    extLink.style.display = 'none';
  }

  // Formatted analytical brief
  const briefField = document.getElementById('panel-brief-field');
  const briefFormatted = document.getElementById('panel-brief-formatted');
  if (item.brief) {
    briefField.style.display = '';
    briefFormatted.innerHTML = formatBrief(item.brief);
  } else {
    briefField.style.display = 'none';
    briefFormatted.innerHTML = '';
  }

  // RECAP detection — show section if this looks like a meeting recap
  renderRecapSection(item);

  // Context chips row (quadrant coaching + source)
  renderPanelContextRow(item, state);

  // Reset connections (will load async)
  const connEl = document.getElementById('panel-connections');
  connEl.innerHTML = '<div class="pconn-loading">…</div>';

  document.getElementById('panel-done').checked = state.done;
  document.getElementById('panel-done-label').textContent = state.done ? 'Completato' : 'Da fare';
  document.getElementById('panel-quadrant').value = q;
  document.getElementById('panel-comment').value = state.comment || '';
  renderActionPoints(state.actionPoints || []);

  document.getElementById('panel-overlay').classList.remove('hidden');
  const panel = document.getElementById('detail-panel');
  panel.classList.remove('hidden');
  requestAnimationFrame(() => panel.classList.add('open'));

  // Async: load connections
  loadPanelConnections(item, state);
}

/* ── Brief formatter ──────────────────────────────────────────────────────── */
function formatBrief(rawBrief) {
  if (!rawBrief) return '';
  // Parse known section headers
  const sectionDefs = [
    { rx: /^(THREAD DI .+)$/m,         icon: '📧', cls: 'pbf-thread' },
    { rx: /^Contesto[:：]?\s*/m,        icon: '🗂', label: 'Contesto',    cls: 'pbf-context' },
    { rx: /^Sviluppo[:：]?\s*/m,        icon: '📈', label: 'Sviluppo',    cls: 'pbf-dev' },
    { rx: /^Situazione[:：]?\s*/m,      icon: '📍', label: 'Situazione',  cls: 'pbf-dev' },
    { rx: /^ACTION[:：]?\s*/m,          icon: '⚡', label: 'Action',      cls: 'pbf-action' },
    { rx: /^AZIONE[:：]?\s*/m,          icon: '⚡', label: 'Azione',      cls: 'pbf-action' },
    { rx: /^URGENZA[:：]?\s*/m,         icon: '🔴', label: 'Urgenza',     cls: 'pbf-urgency' },
    { rx: /^Note[:：]?\s*/m,            icon: '📝', label: 'Note',        cls: 'pbf-notes' },
    { rx: /^Background[:：]?\s*/m,      icon: '📚', label: 'Background',  cls: 'pbf-bg' },
    { rx: /^Importo[:：]?\s*/m,         icon: '💶', label: 'Importo',     cls: 'pbf-amount' },
  ];

  // Split by double newline into paragraphs
  const paragraphs = rawBrief.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  let html = '<div class="panel-brief-body">';

  paragraphs.forEach(para => {
    // Check if this paragraph starts with a known section header
    let matched = false;
    for (const def of sectionDefs) {
      const m = para.match(def.rx);
      if (m) {
        if (def.cls === 'pbf-thread') {
          html += `<div class="pbf-meta">${escHtml(para)}</div>`;
        } else {
          const body = para.replace(def.rx, '').trim();
          html += `<div class="pbf-section ${def.cls}">
            <div class="pbf-section-label">${def.icon} ${def.label}</div>
            <div class="pbf-section-body">${escHtml(body).replace(/\n/g, '<br>')}</div>
          </div>`;
        }
        matched = true;
        break;
      }
    }
    if (!matched) {
      html += `<div class="pbf-para">${escHtml(para).replace(/\n/g, '<br>')}</div>`;
    }
  });

  html += '</div>';
  return html;
}

/* ── Panel context chips (quadrant tip + source) ─────────────────────────── */
function renderPanelContextRow(item, state) {
  const row = document.getElementById('panel-context-row');
  if (!row) return;
  const q = state.quadrant || item.quadrant || 'Q2';
  const tips = {
    Q1: { icon:'⚡', color:'#f87171', tip:'Fai ora — ogni ora di ritardo ha un costo diretto' },
    Q2: { icon:'🎯', color:'#60a5fa', tip:'Alta leva strategica — pianifica un blocco dedicato' },
    Q3: { icon:'🤝', color:'#fb923c', tip:'Urgente ma delegabile — valuta chi può gestirlo' },
    Q4: { icon:'🗑', color:'#94a3b8', tip:'Bassa priorità — considera di eliminare o rimandare' },
  };
  const t = tips[q] || tips.Q2;

  // Extract source from due field (email address)
  const emailMatch = (item.due || '').match(/[\w.-]+@[\w.-]+/);
  const sourceChip = emailMatch
    ? `<div class="pctx-chip"><span class="pctx-icon">👤</span><span class="pctx-text">${escHtml(emailMatch[0])}</span></div>`
    : '';

  // Due date urgency chip
  let dueChip = '';
  if (item.due && item.itemType !== 'event') {
    const dateMatch = (item.due || '').match(/\d{4}-\d{2}-\d{2}/);
    if (dateMatch) {
      const dueDays = Math.ceil((new Date(dateMatch[0]) - new Date(currentDate)) / 86400000);
      const urgency = dueDays < 0  ? { txt:`Scaduto ${Math.abs(dueDays)}g fa`, col:'#f87171' }
                    : dueDays === 0 ? { txt:'Scade oggi', col:'#fb923c' }
                    : dueDays <= 2  ? { txt:`Tra ${dueDays} giorni`, col:'#fbbf24' }
                    : { txt:`Tra ${dueDays} giorni`, col:'#94a3b8' };
      dueChip = `<div class="pctx-chip" style="border-color:${urgency.col}20">
        <span class="pctx-icon">📅</span>
        <span class="pctx-text" style="color:${urgency.col}">${urgency.txt}</span>
      </div>`;
    }
  }

  row.innerHTML = `
    <div class="pctx-chip pctx-q" style="border-color:${t.color}40;background:${t.color}10">
      <span class="pctx-icon">${t.icon}</span>
      <span class="pctx-text" style="color:${t.color}">${t.tip}</span>
    </div>
    ${sourceChip}
    ${dueChip}
  `;
}

/* ── Panel connections loader ─────────────────────────────────────────────── */
async function loadPanelConnections(item, state) {
  const el = document.getElementById('panel-connections');
  if (!el) return;

  // Load projects if not yet loaded
  if (!projectsData.length) {
    try { await loadProjects(); } catch(e) {}
  }

  // Load pipeline deals
  let deals = [];
  try {
    const pd = await api('GET', '/pipeline');
    deals = pd.deals || [];
  } catch(e) {}

  // Extract client name from title: patterns like "– Client (Company)" or "(Company)"
  const titleLower = (item.title || '').toLowerCase();
  const clientExtract = item.title.match(/[–—\-]\s*[^–—\-()]+?\s*\(([^)]+)\)/) ||
                        item.title.match(/\(([^)]+)\)\s*$/) ||
                        item.title.match(/[–—\-]\s*(.+)$/);
  const clientName = (clientExtract?.[1] || clientExtract?.[0] || '').trim().replace(/^[–—\-]\s*/,'').split('–')[0].split('(')[0].trim();

  // Source domain from due field
  const srcDomain = (item.due || '').match(/@([\w.-]+)/)?.[1] || '';
  const srcDomainShort = srcDomain.split('.')[0].toLowerCase();

  // Score match: returns 0–2
  const matchScore = (text1, text2) => {
    if (!text1 || !text2) return 0;
    const a = text1.toLowerCase(), b = text2.toLowerCase();
    if (a.includes(b) || b.includes(a)) return 2;
    const words = b.split(/\s+/).filter(w => w.length > 3);
    return words.some(w => a.includes(w)) ? 1 : 0;
  };

  // Match projects
  const relProjects = projectsData.filter(p => {
    const byClient = matchScore(clientName, p.client) + matchScore(srcDomainShort, p.client);
    const byTitle  = matchScore(titleLower, p.title);
    return byClient > 0 || byTitle > 0;
  }).slice(0, 3);

  // Match deals
  const relDeals = deals.filter(d => {
    const byClient = matchScore(clientName, d.client) + matchScore(srcDomainShort, d.client);
    const byTitle  = matchScore(titleLower, d.title);
    return byClient > 0 || byTitle > 0;
  }).slice(0, 3);

  // Related tasks: same source domain or same client keywords
  const allItems = [...(dayData.tasks || []), ...(dayData.events || [])];
  const relTasks = allItems.filter(t => {
    if (t.id === item.id) return false;
    if (srcDomain && (t.due || '').includes(srcDomain)) return true;
    if (clientName.length > 3 && (t.title || '').toLowerCase().includes(clientName.toLowerCase())) return true;
    return false;
  }).slice(0, 4);

  let html = '';

  // Related projects
  if (relProjects.length > 0) {
    const statusLabels = { active: '🟢', paused: '🟡', completed: '✅' };
    html += `<div class="pconn-section">
      <div class="pconn-label">📂 Progetti collegati</div>
      <div class="pconn-list">`;
    relProjects.forEach(p => {
      const doneTasks = (p.tasks||[]).filter(t=>t.done).length;
      const tot = (p.tasks||[]).length;
      html += `<div class="pconn-card pconn-project" data-proj-id="${escHtml(p.id)}">
        <div class="pconn-card-top">
          <span class="pconn-card-icon">${statusLabels[p.status]||'📂'}</span>
          <span class="pconn-card-title">${escHtml(p.title)}</span>
        </div>
        ${p.client ? `<div class="pconn-card-sub">${escHtml(p.client)}</div>` : ''}
        ${tot > 0 ? `<div class="pconn-card-prog"><div class="pconn-prog-fill" style="width:${Math.round(doneTasks/tot*100)}%"></div></div>` : ''}
      </div>`;
    });
    html += `</div></div>`;
  }

  // Related deals
  if (relDeals.length > 0) {
    const stageLabel = { prospect:'Prospect', proposta:'Proposta', negoziazione:'Negoziazione', chiuso:'Chiuso 🎉' };
    const stageColor = { prospect:'#94a3b8', proposta:'#60a5fa', negoziazione:'#fb923c', chiuso:'#34d399' };
    html += `<div class="pconn-section">
      <div class="pconn-label">💼 Pipeline collegata</div>
      <div class="pconn-list">`;
    relDeals.forEach(d => {
      const sc = stageColor[d.stage] || '#94a3b8';
      html += `<div class="pconn-card pconn-deal">
        <div class="pconn-card-top">
          <span class="pconn-stage-dot" style="background:${sc}"></span>
          <span class="pconn-card-title">${escHtml(d.title)}</span>
        </div>
        <div class="pconn-card-sub">
          ${escHtml(d.client||'')}
          ${d.value ? ` · <strong>€${Number(d.value).toLocaleString('it')}</strong>` : ''}
          · ${stageLabel[d.stage]||d.stage}
        </div>
      </div>`;
    });
    html += `</div></div>`;
  }

  // Related tasks
  if (relTasks.length > 0) {
    const qDot = { Q1:'#f87171', Q2:'#60a5fa', Q3:'#fb923c', Q4:'#94a3b8' };
    html += `<div class="pconn-section">
      <div class="pconn-label">📌 Task correlati oggi</div>
      <div class="pconn-tasks">`;
    relTasks.forEach(t => {
      const ts = dayData.items?.[t.id] || {};
      const qc = qDot[ts.quadrant||t.quadrant||'Q2'] || '#94a3b8';
      html += `<div class="pconn-task-row ${ts.done ? 'pconn-task-done' : ''}" data-open-id="${escHtml(t.id)}">
        <span class="pconn-q-dot" style="background:${qc}"></span>
        <span class="pconn-task-title">${escHtml(t.title||t.summary||'')}</span>
        ${ts.done ? '<span class="pconn-task-check">✓</span>' : ''}
      </div>`;
    });
    html += `</div></div>`;
  }

  if (!html) {
    html = `<div class="pconn-empty">Nessun elemento correlato trovato nel sistema</div>`;
  }

  el.innerHTML = html;

  // Click: open related project workspace
  el.querySelectorAll('.pconn-project[data-proj-id]').forEach(card => {
    card.addEventListener('click', () => {
      const pid = card.dataset.projId;
      closePanel();
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      const projTab = document.querySelector('.tab[data-view="projects"]');
      projTab?.classList.add('active');
      document.getElementById('view-projects')?.classList.add('active');
      loadProjects().then(() => openProjectWorkspace(pid));
    });
  });

  // Click: open related task
  el.querySelectorAll('.pconn-task-row[data-open-id]').forEach(row => {
    row.addEventListener('click', () => {
      const tid = row.dataset.openId;
      const tItem = allItems.find(t => t.id === tid);
      const tState = dayData.items?.[tid] || {};
      if (tItem) {
        closePanel();
        setTimeout(() => openPanel(tItem, tState), 300);
      }
    });
  });
}

function closePanel() {
  const panel = document.getElementById('detail-panel');
  panel.classList.remove('open');
  panel.addEventListener('transitionend', () => {
    panel.classList.add('hidden');
    document.getElementById('panel-overlay').classList.add('hidden');
  }, { once: true });
  activePanel = null;
}

async function savePanel() {
  if (!activePanel) return;
  const { id } = activePanel;
  await api('POST', `/day/${currentDate}/item/${id}`, {
    done:     document.getElementById('panel-done').checked,
    quadrant: document.getElementById('panel-quadrant').value,
    comment:  document.getElementById('panel-comment').value,
  });
  closePanel();
  loadDay();
}

/* ── RECAP detection & extraction ────────────────────────────────────────── */
const RECAP_RX = /\b(recap|call recap|meeting recap|riunione|trascrizione|transcript|gemini|note della call|note call|riepilogo della riunione|riepilogo call|riassunto riunione|meeting notes|note meeting|verbale|follow.?up call)\b/i;

function isRecap(item) {
  const hay = ((item.title || '') + ' ' + (item.summary || '') + ' ' + (item.brief || '')).toLowerCase();
  return RECAP_RX.test(hay);
}

function renderRecapSection(item) {
  const section = document.getElementById('panel-recap-section');
  const btn     = document.getElementById('recap-analyze-btn');
  const status  = document.getElementById('recap-status');

  if (!isRecap(item)) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  status.textContent = '';
  btn.disabled = false;
  btn.textContent = '✨ Estrai Action Points con AI';

  // Remove any previous listener
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  const freshStatus = document.getElementById('recap-status');

  newBtn.addEventListener('click', async () => {
    newBtn.disabled = true;
    newBtn.textContent = '⏳ Analisi in corso…';
    freshStatus.textContent = '';

    try {
      const res = await api('POST', `/day/${currentDate}/item/${activePanel.id}/analyze-recap`);
      if (res && res.ok) {
        if (res.count === 0) {
          freshStatus.textContent = '✓ Nessun action point trovato';
          newBtn.textContent = '✨ Estrai Action Points con AI';
          newBtn.disabled = false;
        } else {
          freshStatus.textContent = `✓ ${res.count} action point${res.count !== 1 ? 's' : ''} estratti`;
          newBtn.textContent = '✓ Analizzato';
          newBtn.disabled = true;
          // Merge into active panel state and re-render
          activePanel.state.actionPoints = activePanel.state.actionPoints || [];
          activePanel.state.actionPoints.push(...res.actionPoints);
          renderActionPoints(activePanel.state.actionPoints);
        }
      }
    } catch (err) {
      freshStatus.textContent = '✗ ' + (err.message || 'Errore, riprova');
      newBtn.textContent = '✨ Estrai Action Points con AI';
      newBtn.disabled = false;
    }
  });
}

function renderActionPoints(aps) {
  const list = document.getElementById('action-points-list');
  list.innerHTML = '';
  aps.forEach(ap => {
    const row = document.createElement('div');
    row.className = 'ap-item' + (ap.fromRecap ? ' from-recap' : '');
    const priorityDot = ap.fromRecap ? `<span class="ap-priority-dot ap-priority-${ap.priority || 'medium'}"></span>` : '';
    row.innerHTML = `
      <input type="checkbox" ${ap.done ? 'checked' : ''} data-ap="${ap.id}" />
      ${priorityDot}
      <span class="ap-text ${ap.done ? 'done' : ''}">${escHtml(ap.text)}</span>
    `;
    row.querySelector('input').addEventListener('change', async e => {
      await api('PATCH', `/day/${currentDate}/item/${activePanel.id}/action-point/${ap.id}`, { done: e.target.checked });
      ap.done = e.target.checked;
      renderActionPoints(activePanel.state.actionPoints);
    });
    list.appendChild(row);
  });
}

async function addActionPoint() {
  if (!activePanel) return;
  const input = document.getElementById('new-ap-input');
  const text = input.value.trim();
  if (!text) return;
  const res = await api('POST', `/day/${currentDate}/item/${activePanel.id}/action-point`, { text });
  activePanel.state.actionPoints = activePanel.state.actionPoints || [];
  activePanel.state.actionPoints.push(res.actionPoint);
  renderActionPoints(activePanel.state.actionPoints);
  input.value = '';
}

/* ── WEEKLY VIEW ─────────────────────────────────────────────────────────── */
const weekDayFull = ['Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato','Domenica'];
let weekRefreshInterval    = null;
let weekRefreshTimestamp   = null;
let weekRefreshStatusTimer = null;

function startWeekRefresh() {
  stopWeekRefresh();
  weekRefreshTimestamp = Date.now();
  updateWeekRefreshStatus();
  weekRefreshInterval = setInterval(async () => {
    await loadWeek();
    weekRefreshTimestamp = Date.now();
    updateWeekRefreshStatus();
  }, 3600000); // 1 hour
  weekRefreshStatusTimer = setInterval(updateWeekRefreshStatus, 60000);
}

function stopWeekRefresh() {
  if (weekRefreshInterval)    { clearInterval(weekRefreshInterval);    weekRefreshInterval = null; }
  if (weekRefreshStatusTimer) { clearInterval(weekRefreshStatusTimer); weekRefreshStatusTimer = null; }
}

function updateWeekRefreshStatus() {
  const el = document.getElementById('week-refresh-status');
  if (!el || !weekRefreshTimestamp) return;
  const minsAgo = Math.floor((Date.now() - weekRefreshTimestamp) / 60000);
  const minsLeft = Math.max(0, 60 - minsAgo);
  if (minsAgo < 1) el.textContent = 'Aggiornato adesso';
  else el.textContent = `Aggiornato ${minsAgo} min fa · prossimo aggiornamento tra ${minsLeft} min`;
}

async function loadWeek() {
  const monday = weekStart(todayStr(), currentWeekOffset);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const first = new Date(days[0] + 'T12:00:00');
  const last  = new Date(days[6] + 'T12:00:00');
  document.getElementById('week-title').textContent =
    `${first.getDate()} – ${last.getDate()} ${last.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}`;

  const [results, weekStats] = await Promise.all([
    Promise.all(days.map(d => api('GET', `/day/${d}`))),
    api('GET', `/stats/week/${todayStr()}`)
  ]);
  renderTarget100(weekStats);
  renderWeekMeetings(days, results);
}

function renderWeekMeetings(days, results) {
  const container = document.getElementById('week-meetings-list');
  if (!container) return;
  container.innerHTML = '';
  const today = todayStr();
  let hasAny = false;

  days.forEach((date, i) => {
    const data    = results[i];
    const d       = new Date(date + 'T12:00:00');
    const isToday = date === today;
    const isPast  = date < today;
    const events  = (data.events || []).filter(e => e.title);
    const q1tasks = (data.tasks  || []).filter(t => {
      const st = data.items?.[t.id];
      return st && st.quadrant === 'Q1' && !st.done;
    });

    if (events.length === 0 && q1tasks.length === 0) return;
    hasAny = true;

    const sec = document.createElement('div');
    sec.className = 'wm-day-section' + (isToday ? ' wm-today' : '') + (isPast ? ' wm-past' : '');

    const dow = weekDayFull[i];
    const monthName = d.toLocaleDateString('it-IT', { month: 'long' });
    const dayLabel  = isToday ? `Oggi — ${dow} ${d.getDate()} ${monthName}` : `${dow} ${d.getDate()} ${monthName}`;

    sec.innerHTML = `
      <div class="wm-day-header">
        <span class="wm-day-label">${dayLabel}</span>
        ${isToday ? '<span class="wm-today-badge">oggi</span>' : ''}
        <button class="btn-ghost btn-sm wm-goto-day" data-date="${date}">Apri giorno →</button>
      </div>
    `;

    sec.querySelector('.wm-goto-day').addEventListener('click', () => {
      currentDate = date;
      document.getElementById('date-display').textContent = fmtDate(date);
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.querySelector('.tab[data-view="day"]').classList.add('active');
      document.getElementById('view-day').classList.add('active');
      loadDay();
    });

    events.forEach(evt => {
      const state = data.items?.[evt.id] || { done: false, actionPoints: [], quadrant: 'Q2' };
      sec.appendChild(buildMeetingCard(evt, state, date, isToday));
    });

    if (q1tasks.length > 0) {
      const row = document.createElement('div');
      row.className = 'wm-tasks-row';
      row.innerHTML = `<span class="wm-tasks-label">⚡ Urgenti Q1:</span>` +
        q1tasks.slice(0, 4).map(t => `<span class="wm-task-pill">${escHtml(t.title)}</span>`).join('');
      sec.appendChild(row);
    }

    container.appendChild(sec);
  });

  if (!hasAny) {
    container.innerHTML = '<div class="empty-section" style="margin-top:32px">Nessun meeting o impegno Q1 questa settimana 🏖️</div>';
  }
}

function buildMeetingCard(evt, state, date, isToday) {
  const card = document.createElement('div');
  card.className = 'wm-meeting-card' + (state.done ? ' wm-done' : '') + (isToday ? ' wm-card-today' : '');
  const aps    = state.actionPoints || [];
  const apDone = aps.filter(a => a.done).length;

  card.innerHTML = `
    <div class="wm-card-main">
      <div class="wm-card-left">
        <div class="wm-card-time">${escHtml(evt.time || '—')}</div>
        <div class="wm-card-done-check ${state.done ? 'checked' : ''}" title="Segna completato">
          ${state.done ? '✓' : '○'}
        </div>
      </div>
      <div class="wm-card-body">
        <div class="wm-card-title">${escHtml(evt.title || 'Evento')}</div>
        ${evt.brief ? `<div class="wm-card-brief">${escHtml(evt.brief)}</div>` : ''}
        <div class="wm-card-actions">
          ${evt.link ? `<a href="${escHtml(evt.link)}" target="_blank" class="btn-ghost btn-sm">📎 Apri ↗</a>` : ''}
          <button class="btn-ghost btn-sm wm-toggle-aps">
            ✅ Preparazione ${aps.length > 0 ? `<span class="wm-ap-badge">${apDone}/${aps.length}</span>` : ''}
          </button>
        </div>
        <div class="wm-ap-panel hidden">
          <div class="wm-ap-list"></div>
          <div class="ap-add-row" style="margin-top:8px">
            <input type="text" class="wm-new-ap-input" placeholder="Nuovo action point per questa riunione…" />
            <button class="btn-primary btn-sm wm-add-ap-btn">+</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const apList  = card.querySelector('.wm-ap-list');
  const apBadge = card.querySelector('.wm-ap-badge');

  function renderAPs(arr) {
    apList.innerHTML = '';
    if (!arr.length) {
      apList.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:4px 0">Aggiungi action point per prepararti</div>';
      return;
    }
    arr.forEach(ap => {
      const row = document.createElement('div');
      row.className = 'ap-item';
      row.innerHTML = `
        <input type="checkbox" ${ap.done ? 'checked' : ''} />
        <span class="ap-text ${ap.done ? 'done' : ''}">${escHtml(ap.text)}</span>
      `;
      row.querySelector('input').addEventListener('change', async e => {
        await api('PATCH', `/day/${date}/item/${evt.id}/action-point/${ap.id}`, { done: e.target.checked });
        ap.done = e.target.checked;
        renderAPs(state.actionPoints);
        if (apBadge) {
          const d2 = state.actionPoints.filter(a => a.done).length;
          apBadge.textContent = `${d2}/${state.actionPoints.length}`;
        }
      });
      apList.appendChild(row);
    });
  }
  renderAPs(aps);

  card.querySelector('.wm-toggle-aps').addEventListener('click', function() {
    const panel = card.querySelector('.wm-ap-panel');
    panel.classList.toggle('hidden');
    this.innerHTML = panel.classList.contains('hidden')
      ? `✅ Preparazione ${aps.length > 0 ? `<span class="wm-ap-badge">${apDone}/${aps.length}</span>` : ''}`
      : '▲ Chiudi preparazione';
  });

  card.querySelector('.wm-add-ap-btn').addEventListener('click', async () => {
    const input = card.querySelector('.wm-new-ap-input');
    const text  = input.value.trim();
    if (!text) return;
    const res = await api('POST', `/day/${date}/item/${evt.id}/action-point`, { text });
    state.actionPoints = state.actionPoints || [];
    state.actionPoints.push(res.actionPoint);
    renderAPs(state.actionPoints);
    input.value = '';
  });

  card.querySelector('.wm-card-done-check').addEventListener('click', async () => {
    state.done = !state.done;
    await api('POST', `/day/${date}/item/${evt.id}`, { done: state.done });
    card.classList.toggle('wm-done', state.done);
    const chk = card.querySelector('.wm-card-done-check');
    chk.textContent = state.done ? '✓' : '○';
    chk.classList.toggle('checked', state.done);
  });

  return card;
}

// Week nav
document.getElementById('prev-week').addEventListener('click', () => { currentWeekOffset--; loadWeek(); });
document.getElementById('next-week').addEventListener('click', () => { currentWeekOffset++; loadWeek(); });
document.getElementById('week-refresh-now')?.addEventListener('click', () => {
  loadWeek();
  weekRefreshTimestamp = Date.now();
  updateWeekRefreshStatus();
});

/* ── MONTHLY VIEW ────────────────────────────────────────────────────────── */
async function loadMonth() {
  monthData = await api('GET', `/month/${currentMonth}`);
  renderMonth();
}

function renderMonth() {
  document.getElementById('month-title').textContent = monthLabel(currentMonth);
  const done  = monthData.completedItems || 0;
  const total = monthData.totalItems || 0;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

  document.getElementById('ring-pct').textContent = pct + '%';
  document.getElementById('stat-done').textContent  = done;
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-left').textContent  = Math.max(0, total - done);

  const offset = 314 - (pct / 100) * 314;
  document.getElementById('ring-progress').style.strokeDashoffset = offset;

  renderKPIs();
  renderObjectives();
}

function renderKPIs() {
  const list = document.getElementById('kpis-list');
  list.innerHTML = '';
  (monthData.kpis || []).forEach(kpi => list.appendChild(buildKPICard(kpi)));
}

function buildKPICard(kpi) {
  const pct = kpi.target > 0 ? Math.min(100, Math.round((kpi.current / kpi.target) * 100)) : 0;
  const card = document.createElement('div');
  card.className = 'kpi-card';
  card.innerHTML = `
    <div class="kpi-header">
      <span class="kpi-name">${escHtml(kpi.name)}</span>
      <div class="kpi-values">
        <span class="kpi-current">${kpi.current}</span>
        <span class="kpi-unit">${escHtml(kpi.unit)}</span>
        <span class="kpi-target">/ ${kpi.target} ${escHtml(kpi.unit)}</span>
      </div>
    </div>
    <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
    <div class="kpi-footer">
      <span>${pct}% del target</span>
      <div class="kpi-edit-row">
        <input type="number" value="${kpi.current}" placeholder="Valore attuale" data-kpi-id="${kpi.id}" style="width:110px" />
        <button class="btn-primary btn-sm" data-update-kpi="${kpi.id}">Aggiorna</button>
        <button class="btn-ghost" data-delete-kpi="${kpi.id}" style="color:#f87171">✕</button>
      </div>
    </div>
  `;
  card.querySelector(`[data-update-kpi]`).addEventListener('click', async () => {
    const val = parseFloat(card.querySelector(`[data-kpi-id="${kpi.id}"]`).value);
    await api('PATCH', `/month/${currentMonth}/kpi/${kpi.id}`, { current: val });
    loadMonth();
  });
  card.querySelector(`[data-delete-kpi]`).addEventListener('click', async () => {
    await api('DELETE', `/month/${currentMonth}/kpi/${kpi.id}`);
    loadMonth();
  });
  return card;
}

function renderObjectives() {
  const list = document.getElementById('objectives-list');
  list.innerHTML = '';
  (monthData.objectives || []).forEach(obj => list.appendChild(buildObjCard(obj)));
}

function buildObjCard(obj) {
  const statuses = ['todo', 'in_progress', 'done'];
  const labels   = { todo: 'Da fare', in_progress: 'In corso', done: 'Completato' };
  const card = document.createElement('div');
  card.className = 'obj-card';
  card.innerHTML = `
    <span class="obj-name">${escHtml(obj.name)}</span>
    <button class="obj-status ${obj.status}" data-obj-id="${obj.id}">${labels[obj.status] || 'Da fare'}</button>
    <button class="obj-delete" data-delete-obj="${obj.id}">✕</button>
  `;
  card.querySelector('[data-obj-id]').addEventListener('click', async () => {
    const next = statuses[(statuses.indexOf(obj.status) + 1) % statuses.length];
    await api('PATCH', `/month/${currentMonth}/objective/${obj.id}`, { status: next });
    loadMonth();
  });
  card.querySelector('[data-delete-obj]').addEventListener('click', async () => {
    await api('DELETE', `/month/${currentMonth}/objective/${obj.id}`);
    loadMonth();
  });
  return card;
}

document.getElementById('prev-month').addEventListener('click', () => {
  const [y, m] = currentMonth.split('-').map(Number);
  currentMonth = m === 1 ? `${y-1}-12` : `${y}-${String(m-1).padStart(2,'0')}`;
  loadMonth();
});
document.getElementById('next-month').addEventListener('click', () => {
  const [y, m] = currentMonth.split('-').map(Number);
  currentMonth = m === 12 ? `${y+1}-01` : `${y}-${String(m+1).padStart(2,'0')}`;
  loadMonth();
});

document.getElementById('add-kpi-btn').addEventListener('click', () =>
  document.getElementById('add-kpi-form').classList.toggle('hidden'));
document.getElementById('cancel-kpi').addEventListener('click', () =>
  document.getElementById('add-kpi-form').classList.add('hidden'));
document.getElementById('save-kpi').addEventListener('click', async () => {
  const name   = document.getElementById('kpi-name').value.trim();
  const target = parseFloat(document.getElementById('kpi-target').value);
  const unit   = document.getElementById('kpi-unit').value.trim();
  if (!name || !target) return;
  await api('POST', `/month/${currentMonth}/kpi`, { name, target, unit, current: 0 });
  ['kpi-name','kpi-target','kpi-unit'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('add-kpi-form').classList.add('hidden');
  loadMonth();
});

document.getElementById('add-obj-btn').addEventListener('click', () =>
  document.getElementById('add-obj-form').classList.toggle('hidden'));
document.getElementById('cancel-obj').addEventListener('click', () =>
  document.getElementById('add-obj-form').classList.add('hidden'));
document.getElementById('save-obj').addEventListener('click', async () => {
  const name = document.getElementById('obj-name').value.trim();
  if (!name) return;
  await api('POST', `/month/${currentMonth}/objective`, { name, status: 'todo' });
  document.getElementById('obj-name').value = '';
  document.getElementById('add-obj-form').classList.add('hidden');
  loadMonth();
});

/* ── COMPLETED SECTION ────────────────────────────────────────────────────── */
function renderCompletedSection(completedItems) {
  const section  = document.getElementById('completed-section');
  const list     = document.getElementById('completed-items');
  const countEl  = document.getElementById('completed-count');
  if (!section || !list || !countEl) return;

  if (completedItems.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  countEl.textContent = completedItems.length;
  list.innerHTML = '';

  completedItems.forEach(({ item, state }) => {
    list.appendChild(buildItemCard(item, state));
  });
}

// Wire up the collapse toggle (called once at init)
function setupCompletedToggle() {
  document.getElementById('completed-toggle')?.addEventListener('click', () => {
    const list    = document.getElementById('completed-items');
    const chevron = document.getElementById('completed-chevron');
    if (!list) return;
    const isHidden = list.classList.toggle('hidden');
    if (chevron) chevron.textContent = isHidden ? '›' : '‹';
  });
}

/* ── SUB-TABS (day view) ──────────────────────────────────────────────────── */
function setupSubTabs() {
  document.querySelectorAll('.sub-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.sub-view').forEach(v => v.classList.remove('active'));
      tab.classList.add('active');
      const subId = 'sub-' + tab.dataset.sub;
      document.getElementById(subId)?.classList.add('active');
      if (tab.dataset.sub === 'growth')     renderInsights();
      if (tab.dataset.sub === 'wellbeing')  renderWellbeing();
      if (tab.dataset.sub === 'family')     renderFamily();
      if (tab.dataset.sub === 'network')    renderNetwork();
      if (tab.dataset.sub === 'transfers')  renderTransfers();
    });
  });
}

/* ── DAY TYPE BADGE → QUOTE OF THE DAY ──────────────────────────────────── */
function renderDayTypeBadge() {
  const badge = document.getElementById('day-type-badge');
  if (!badge) return;
  const q = getTodayQuote();
  badge.innerHTML = `
    <div class="qod-quote">"${escHtml(q.text)}"</div>
    <div class="qod-attr">
      <span class="qod-author">— ${escHtml(q.author)}</span>
      ${q.role ? `<span class="qod-role">· ${escHtml(q.role)}</span>` : ''}
    </div>`;
  badge.className = 'qod-card';
}

/* ── CRESCITA & INSIGHTS ──────────────────────────────────────────────────── */
function renderHealthCard(health) {
  if (!health) return '';
  const score = health.sleepScore ?? health.readiness ?? null;
  let scoreEmoji = '😴', scoreColor = '#f87171', scoreLabel = 'Riposo scarso';
  if (score !== null) {
    if      (score >= 90) { scoreEmoji = '🌟'; scoreColor = '#7c6af7'; scoreLabel = 'Ottimo'; }
    else if (score >= 76) { scoreEmoji = '😊'; scoreColor = '#34d399'; scoreLabel = 'Buono'; }
    else if (score >= 60) { scoreEmoji = '😐'; scoreColor = '#fbbf24'; scoreLabel = 'Discreto'; }
    else                  { scoreEmoji = '😴'; scoreColor = '#f87171'; scoreLabel = 'Scarso'; }
  }
  const stressColors = { low: '#34d399', medium: '#fbbf24', high: '#f87171' };
  const stressLabels = { low: '🟢 Basso', medium: '🟡 Medio', high: '🔴 Alto' };
  const stressColor = stressColors[health.stressLevel] || '#888890';
  const stressLabel = stressLabels[health.stressLevel] || health.stressLevel || '—';

  const metrics = [
    health.sleepDuration  && { label: 'Sonno',     value: health.sleepDuration },
    health.deepSleep      && { label: 'Deep',       value: health.deepSleep },
    health.remSleep       && { label: 'REM',        value: health.remSleep },
    health.hrv            && { label: 'HRV',        value: health.hrv + ' ms' },
    health.restingHR      && { label: 'HR a riposo',value: health.restingHR + ' bpm' },
    health.spo2           && { label: 'SpO₂',       value: health.spo2 + '%' },
  ].filter(Boolean);

  let html = `<div class="health-card">
    <div class="health-card-header">
      <span class="health-title">🛌 Sonno & Benessere · RingConn 2</span>
      ${health.recordedAt ? `<span class="health-ts">registrato alle ${health.recordedAt.slice(11,16)}</span>` : ''}
    </div>
    <div class="health-score-row">
      ${score !== null ? `<div class="health-score" style="color:${scoreColor}">${score}</div>` : ''}
      <div>
        ${score !== null ? `<div class="health-score-label" style="color:${scoreColor}">${scoreEmoji} ${scoreLabel}</div>` : ''}
        ${health.stressLevel ? `<div class="health-stress-label">Stress: <strong style="color:${stressColor}">${stressLabel}</strong></div>` : ''}
      </div>
      ${health.sleepStart && health.sleepEnd ? `<div class="health-sleep-range">🌙 ${escHtml(health.sleepStart)} → ${escHtml(health.sleepEnd)}</div>` : ''}
    </div>`;

  if (metrics.length > 0) {
    html += `<div class="health-metrics">`;
    metrics.forEach(m => {
      html += `<div class="health-metric"><div class="health-metric-value">${escHtml(m.value)}</div><div class="health-metric-label">${escHtml(m.label)}</div></div>`;
    });
    html += `</div>`;
  }

  const recs = health.recommendations;
  if (recs?.activity || recs?.food || recs?.mindset) {
    html += `<div class="health-recs">`;
    if (recs.activity) html += `<div class="health-rec"><span class="health-rec-icon">🏃</span><span>${escHtml(recs.activity)}</span></div>`;
    if (recs.food)     html += `<div class="health-rec"><span class="health-rec-icon">🥗</span><span>${escHtml(recs.food)}</span></div>`;
    if (recs.mindset)  html += `<div class="health-rec"><span class="health-rec-icon">🧠</span><span>${escHtml(recs.mindset)}</span></div>`;
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

async function renderInsights() {
  const insights = dayData.insights;
  const container = document.getElementById('growth-content');
  if (!container) return;

  const dtConfig = {
    manager: { emoji: '👔', label: 'Manager Day', desc: '3+ riunioni — Giornata di coordinamento, decisioni e persone.' },
    maker:   { emoji: '🛠️', label: 'Maker Day',   desc: '1–2 riunioni — Spazio per lavoro profondo e creazione.' },
    focus:   { emoji: '🧘', label: 'Focus Day',   desc: 'Nessuna riunione — Dedicata totalmente alla concentrazione.' }
  };
  const dt  = insights?.dayType || 'maker';
  const dtc = dtConfig[dt] || dtConfig.maker;

  // Growth brief (coaching paragraph generated by morning briefing)
  let html = '';
  if (insights?.growthBrief) {
    html += `<div class="growth-brief-card">
      <div class="gb-label">✨ Focus del giorno</div>
      <div class="gb-text">${escHtml(insights.growthBrief)}</div>
    </div>`;
  }

  // Evening reflection insight (if already saved)
  if (insights?.eveningInsight) {
    const tagsHtml = (insights.eveningTags || [])
      .map(t => `<span class="refl-atag">${escHtml(t)}</span>`).join('');
    html += `<div class="evening-insight-card" style="margin-top:16px">
      <div class="ei-header">
        <span class="ei-icon">🌙</span>
        <span class="ei-title">Riflessione serale</span>
        <button class="btn-ghost ei-edit-btn" onclick="openReflectionPopup()">Modifica</button>
      </div>
      ${tagsHtml ? `<div class="refl-tags" style="margin-bottom:8px">${tagsHtml}</div>` : ''}
      <div class="ei-text">${escHtml(insights.eveningInsight)}</div>
    </div>`;
  }

  html += `
    <div class="insight-card day-type-card" style="margin-top:${insights?.growthBrief || insights?.eveningInsight ? '16px' : '0'}">
      <div class="dtc-header">
        <span class="dtc-emoji">${dtc.emoji}</span>
        <div>
          <div class="dtc-label">${dtc.label}</div>
          <div class="dtc-desc">${dtc.desc}</div>
        </div>
      </div>
    </div>
  `;

  // ── Study items (newsletters + recommendations) with done-flag ────────────
  const renderStudyItem = (s, idx, date, isRollover) => `
    <div class="study-card${s.done ? ' study-done' : ''}" data-study-idx="${idx}" data-study-date="${date}">
      <div class="study-header">
        <span class="study-tag">${escHtml(s.source || 'Newsletter')}</span>
        ${isRollover ? '<span class="rollover-badge">📆 Da ieri</span>' : ''}
        <div style="display:flex;gap:6px;align-items:center;margin-left:auto">
          ${s.link ? `<a href="${escHtml(s.link)}" target="_blank" class="btn-ghost study-open">Apri ↗</a>` : ''}
          <button class="study-done-btn${s.done ? ' done' : ''}" title="${s.done ? 'Segna come da fare' : 'Segna come fatto'}">${s.done ? '✅' : '⬜'}</button>
        </div>
      </div>
      <div class="study-title${s.done ? ' line-through' : ''}">${escHtml(s.title)}</div>
      <div class="study-summary">${escHtml(s.summary || '')}</div>
      ${s.recommendation ? `<div class="study-rec">💡 ${escHtml(s.recommendation)}</div>` : ''}
      ${s.done && s.doneAt ? `<div class="study-done-at">✓ Completato ${s.doneAt.slice(0,10)}</div>` : ''}
    </div>`;

  // Fetch yesterday's undone items for rollover
  const yesterday = addDays(currentDate, -1);
  let rolloverItems = [];
  try {
    const yd = await api('GET', `/day/${yesterday}`);
    rolloverItems = (yd.insights?.studyItems || [])
      .map((s, i) => ({ ...s, _origIdx: i, _origDate: yesterday }))
      .filter(s => !s.done);
  } catch (e) { /* ignore */ }

  const todayItems  = insights?.studyItems || [];
  const hasTodayStudy   = todayItems.length > 0;
  const hasRollover = rolloverItems.length > 0;

  if (hasRollover) {
    html += `<div class="section-header" style="margin-top:24px"><h2>📆 Non completato ieri · Riportato oggi</h2></div>
    <div class="study-items-list">`;
    rolloverItems.forEach(s => {
      html += renderStudyItem(s, s._origIdx, s._origDate, true);
    });
    html += `</div>`;
  }

  if (hasTodayStudy) {
    html += `<div class="section-header" style="margin-top:24px"><h2>📚 Crescita · Da leggere oggi</h2></div>
    <div class="study-items-list">`;
    todayItems.forEach((s, idx) => {
      html += renderStudyItem(s, idx, currentDate, false);
    });
    html += `</div>`;
  }

  // Chrome tabs section
  let chromeTabs = [];
  try { chromeTabs = await api('GET', '/browser-tabs'); } catch (e) {}
  if (chromeTabs.length > 0) {
    html += `<div class="section-header" style="margin-top:24px">
      <h2>🌐 Tab aperti in Chrome</h2>
      <span class="chrome-tabs-ts">aggiornato: ${chromeTabs[0]?.addedAt?.slice(0,16).replace('T',' ') || '—'}</span>
    </div>
    <div class="chrome-tabs-list">`;
    chromeTabs.forEach(t => {
      html += `<div class="chrome-tab-card">
        <div class="ct-header">
          <a href="${escHtml(t.url)}" target="_blank" class="ct-title">${escHtml(t.title || t.url)}</a>
          <a href="${escHtml(t.url)}" target="_blank" class="btn-ghost ct-open">Apri ↗</a>
        </div>
        ${t.brief ? `<div class="ct-brief">${escHtml(t.brief)}</div>` : ''}
        ${t.hint  ? `<div class="ct-hint">💡 ${escHtml(t.hint)}</div>` : ''}
      </div>`;
    });
    html += `</div>`;
  }

  if (!hasTodayStudy && !hasRollover && chromeTabs.length === 0) {
    html += `<div class="empty-section">Nessun contenuto ancora — verrà popolato dal briefing mattutino 🌅</div>`;
  }

  container.innerHTML = html;

  // Post-render: attach done-toggle handlers
  container.querySelectorAll('.study-done-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('[data-study-idx]');
      const idx  = parseInt(card.dataset.studyIdx);
      const date = card.dataset.studyDate;
      const isDone = btn.classList.contains('done');
      await api('PATCH', `/day/${date}/study-item/${idx}/done`, { done: !isDone });
      // Reload insights for the current day if the toggled item is today's
      if (date === currentDate) {
        const fresh = await api('GET', `/day/${currentDate}`);
        dayData.insights = fresh.insights;
      }
      renderInsights();
    });
  });
}

/* ── WELLBEING ────────────────────────────────────────────────────────────── */

function computeWellbeingScores(health) {
  if (!health) return { sleep: null, activity: null, recovery: null, focus: null, overall: null };

  // ── Sleep Score (0-100) ──────────────────────────────────────────────────
  let sleep = null;
  if (health.sleepScore != null) {
    sleep = Math.min(100, health.sleepScore);
  } else if (health.sleepMin != null) {
    sleep = Math.min(100, Math.round(health.sleepMin / 480 * 100));
  } else if (health.readiness != null) {
    sleep = Math.min(100, health.readiness);
  }

  // ── Activity Score (0-100) ───────────────────────────────────────────────
  let activity = null;
  const factors = [];
  if (health.steps != null) factors.push({ w: 50, s: Math.min(100, Math.round(health.steps / 100)) });
  if (health.activeMin != null) factors.push({ w: 35, s: Math.min(100, Math.round(health.activeMin / 30 * 100)) });
  if (health.calories != null) factors.push({ w: 15, s: Math.min(100, Math.round(health.calories / 25)) });
  if (factors.length > 0) {
    const tw = factors.reduce((a, f) => a + f.w, 0);
    activity = Math.round(factors.reduce((a, f) => a + f.s * f.w, 0) / tw);
  }

  // ── Recovery Score (0-100) ───────────────────────────────────────────────
  let recovery = null;
  const recFactors = [];
  const hrVal = health.restingHR ?? health.hrMin ?? health.hrAvg;
  if (hrVal != null) {
    const hr = Number(hrVal);
    const hrScore = hr < 50 ? 100 : hr < 58 ? 90 : hr < 65 ? 78 : hr < 72 ? 62 : hr < 82 ? 48 : 32;
    recFactors.push({ w: 50, s: hrScore });
  }
  if (sleep != null) recFactors.push({ w: 50, s: sleep });
  if (health.hrv != null) recFactors.push({ w: 30, s: Number(health.hrv) >= 70 ? 100 : Number(health.hrv) >= 50 ? 85 : Number(health.hrv) >= 35 ? 65 : 45 });
  if (recFactors.length > 0) {
    const tw = recFactors.reduce((a, f) => a + f.w, 0);
    recovery = Math.round(recFactors.reduce((a, f) => a + f.s * f.w, 0) / tw);
  }

  // ── Work Focus Score — composite (sleep × recovery, penalized by high HR) ──
  let focus = null;
  const available = [sleep, recovery].filter(v => v !== null);
  if (available.length > 0) {
    focus = Math.round(available.reduce((a, v) => a + v, 0) / available.length);
    // High average HR during day indicates fatigue/stress → penalty
    if (health.hrAvg != null && health.hrAvg > 90) focus = Math.max(0, focus - 15);
    if (activity != null && activity < 20) focus = Math.max(0, focus - 5); // sedentary day
  }

  const all = [sleep, activity, recovery, focus].filter(v => v !== null);
  const overall = all.length > 0 ? Math.round(all.reduce((a, v) => a + v, 0) / all.length) : null;

  return { sleep, activity, recovery, focus, overall,
    // legacy compat
    physScore: recovery, mentScore: focus };
}

function wellbeingAdvice(health, scores) {
  if (!health || !scores) return [];
  const tips = [];
  const { sleep, activity, recovery, focus, overall } = scores;
  const now = new Date().getHours();

  // ── Sleep insights ───────────────────────────────────────────────────────
  if (sleep !== null && sleep < 60) {
    const sleepStr = health.sleepDuration ? ` (${health.sleepDuration})` : '';
    tips.push({ icon: '😴', tag: 'Recupero notturno', text: `Sonno insufficiente${sleepStr}: stai vivendo un deficit cognitivo stimato del 20-30%. Prioritizza task meccanici, rimanda decisioni strategiche a domani.` });
  } else if (sleep !== null && sleep >= 85) {
    tips.push({ icon: '🌟', tag: 'Riposo ottimale', text: `Sonno eccellente${health.sleepDuration ? ' (' + health.sleepDuration + ')' : ''}! La corteccia prefrontale è in piena forma: ideale per deep work, negoziazioni e decisioni complesse.` });
  }
  if (health.deepSleep) {
    tips.push({ icon: '🌊', tag: 'Sonno profondo', text: `${health.deepSleep} di sonno profondo rilevati: fase cruciale per consolidare memoria e apprendimento. RingConn registra trend su 7 giorni.` });
  }

  // ── Activity insights ────────────────────────────────────────────────────
  if (health.steps != null) {
    const steps = health.steps;
    if (steps < 2000 && now >= 14) {
      tips.push({ icon: '🦵', tag: 'Movimento', text: `Solo ${steps.toLocaleString('it')} passi finora — sessione sedentaria. 10 minuti di camminata ora migliorano il flusso sanguigno al cervello del 15%.` });
    } else if (steps >= 8000) {
      tips.push({ icon: '🏃', tag: 'Attività buona', text: `${steps.toLocaleString('it')} passi: ottima giornata attiva! L'attività fisica costante riduce il rischio cardiovascolare del 30%.` });
    }
  }
  if (health.calories != null && health.calories > 0) {
    const kcal = health.calories;
    if (kcal < 1800) tips.push({ icon: '🔥', tag: 'Calorie', text: `${kcal} kcal bruciate finora. Ricorda: un pasto equilibrato a mezzogiorno mantiene il glucosio stabile per la concentrazione pomeridiana.` });
    else tips.push({ icon: '⚡', tag: 'Energia attiva', text: `${kcal} kcal — metabolismo attivo! Mantieni idratazione adeguata (2L/die) per sostenere le performance cognitive.` });
  }
  if (health.distanceKm != null && health.distanceKm >= 5) {
    tips.push({ icon: '📍', tag: 'Distanza', text: `${health.distanceKm} km percorsi oggi — ottima mobilità! Integra tratti a piedi negli spostamenti per automatizzare l'attività.` });
  }

  // ── Recovery / HR insights ───────────────────────────────────────────────
  if (health.hrAvg != null && health.hrAvg > 90) {
    tips.push({ icon: '💓', tag: 'FC elevata', text: `FC media di ${health.hrAvg} bpm: segnale di stress o sforzo prolungato. 5 min di respirazione 4-7-8 abbassano il cortisolo entro 10 minuti.` });
  }
  if (health.restingHR != null) {
    const rhr = health.restingHR;
    if (rhr < 60) tips.push({ icon: '❤️', tag: 'FC a riposo', text: `FC a riposo di ${rhr} bpm: eccellente! Indica buona efficienza cardiaca e recupero adeguato.` });
    else if (rhr > 75) tips.push({ icon: '❤️', tag: 'FC a riposo', text: `FC a riposo di ${rhr} bpm — leggermente elevata. Considera 10 min di stretching mattutino per ottimizzare il recupero.` });
  }
  if (health.hrv != null) {
    const hrv = Number(health.hrv);
    if (hrv < 35) tips.push({ icon: '📉', tag: 'HRV basso', text: `HRV di ${hrv} ms: sistema nervoso sotto stress. Giornata ideale per task ripetitivi; evita caffè in eccesso e allenamenti intensi.` });
    else if (hrv >= 60) tips.push({ icon: '📈', tag: 'HRV ottimo', text: `HRV di ${hrv} ms: variabilità cardiaca eccellente, piena capacità adattiva. Sfrutta questa finestra per le sfide più impegnative.` });
  }

  // ── Work Focus insights ──────────────────────────────────────────────────
  if (focus !== null) {
    if (focus >= 80) {
      tips.push({ icon: '🚀', tag: 'Peak Performance', text: `Focus Score ${focus}/100 — sei in una finestra di performance elevata. Affronta adesso i task Q1 più impegnativi. Blocca le notifiche per 90 min.` });
    } else if (focus >= 65) {
      tips.push({ icon: '🎯', tag: 'Focus buono', text: `Focus Score ${focus}/100 — buon equilibrio. Gestisci task Q1 e Q2 nella prima parte della giornata, lascia meeting e email al pomeriggio.` });
    } else if (focus < 50) {
      tips.push({ icon: '🔋', tag: 'Ricarica necessaria', text: `Focus Score ${focus}/100 — riserve basse. Usa la tecnica Pomodoro (25+5 min) per mantenere concentrazione in piccole dosi, e prioritizza riposo questa sera.` });
    }
  }

  // ── Streak / activity minutes ────────────────────────────────────────────
  if (health.activeMin != null) {
    const min = health.activeMin;
    const target = 30;
    if (min >= target) tips.push({ icon: '✅', tag: 'Obiettivo attività', text: `${min} min di attività — hai superato il target giornaliero di ${target} min! L'OMS raccomanda 150 min/settimana: sei sulla strada giusta.` });
    else if (now >= 17) tips.push({ icon: '⏱️', tag: 'Attività', text: `${min}/${target} min di attività finora. Una passeggiata di ${target - min} minuti stasera completa l'obiettivo giornaliero.` });
  }

  if (tips.length === 0) {
    tips.push({ icon: '📊', tag: 'Dati in arrivo', text: 'Google Fit è connesso. I dati appaiono dopo la prima sincronizzazione RingConn → Google Fit. Assicurati che l\'app RingConn su Android abbia Google Fit abilitato nelle impostazioni.' });
  }
  return tips;
}

async function renderWellbeing() {
  const container = document.getElementById('wellbeing-content');
  if (!container) return;

  const health = dayData.health;
  const scores = computeWellbeingScores(health);

  let gStatus = { connected: false, lastSync: null };
  try { gStatus = await api('GET', '/auth/google/status'); } catch (e) {}

  let trends = [];
  try { trends = await fetch('/api/fit-trends').then(r => r.json()); } catch (e) {}

  const scoreColor = s => s === null ? '#555566' : s >= 80 ? '#34d399' : s >= 65 ? '#60a5fa' : s >= 50 ? '#fbbf24' : '#f87171';
  const scoreLabel = s => s === null ? 'N/D' : s >= 85 ? 'Ottimo' : s >= 70 ? 'Buono' : s >= 55 ? 'Discreto' : 'Basso';
  const fmt        = (v, u='') => (v !== null && v !== undefined) ? `${typeof v === 'number' ? v.toLocaleString('it') : v}${u}` : '—';

  const syncTs = gStatus.lastSync ? gStatus.lastSync.slice(0,16).replace('T',' ') : null;
  const ts     = health?.recordedAt ? health.recordedAt.slice(0,16).replace('T',' ') : null;

  // ── Sparkline helper ────────────────────────────────────────────────────
  function sparkline(values, color = '#60a5fa', height = 28) {
    const vals = values.filter(v => v != null && v > 0);
    if (vals.length < 2) return '<span style="color:var(--text-faint);font-size:11px">nessun trend</span>';
    const mn = Math.min(...vals), mx = Math.max(...vals);
    const range = mx - mn || 1;
    const w = 6, gap = 3, W = vals.length * (w + gap) - gap;
    let bars = '';
    vals.forEach((v, i) => {
      const h = Math.max(4, Math.round((v - mn) / range * height));
      const x = i * (w + gap);
      bars += `<rect x="${x}" y="${height - h}" width="${w}" height="${h}" rx="2" fill="${color}" opacity="0.8"/>`;
    });
    return `<svg width="${W}" height="${height}" style="vertical-align:bottom">${bars}</svg>`;
  }

  let html = `
    <div class="wb-header">
      <div class="wb-source-note">
        <span>📡 Google Fit · RingConn 2 · sync oraria</span>
        <span class="wb-ts">${ts ? `Dati: ${ts}` : syncTs ? `Sync: ${syncTs}` : 'In attesa dati'}</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        ${gStatus.connected
          ? `<button class="btn-ghost btn-sm" id="wb-sync-btn">🔄 Sync ora</button>
             <button class="btn-ghost btn-sm" id="wb-disconnect-btn" style="color:#f87171;font-size:11px">Disconnetti</button>`
          : `<a href="/auth/google" target="_blank" class="btn-primary btn-sm">🔗 Connetti Google</a>`}
        <button class="btn-ghost btn-sm" id="wb-refresh-btn">↻</button>
      </div>
    </div>`;

  // ── Setup guidance when no data yet ─────────────────────────────────────
  if (!health) {
    html += `<div class="wb-nodata">
      <div class="wb-nodata-icon">📊</div>
      <div class="wb-nodata-title">${gStatus.connected ? 'Google connesso — in attesa dati' : 'Connetti Google Fit per iniziare'}</div>
      <div class="wb-nodata-sub">
        ${gStatus.connected
          ? `<ol style="text-align:left;margin:8px 0 0 16px;font-size:13px;line-height:1.8">
               <li>Apri l'app <strong>RingConn</strong> su Android</li>
               <li>Impostazioni → <strong>Sync Health App → Google Fit ✓</strong></li>
               <li>Clicca <strong>"🔄 Sync ora"</strong> qui sopra</li>
             </ol>`
          : `<ol style="text-align:left;margin:8px 0 0 16px;font-size:13px;line-height:1.8">
               <li>Clicca <strong>"🔗 Connetti Google"</strong> sopra</li>
               <li>Accedi con <strong>marco@giacomello.digital</strong></li>
               <li>In RingConn: Impostazioni → Sync Health App → <strong>Google Fit ✓</strong></li>
             </ol>`}
      </div>
    </div>`;
    container.innerHTML = html;
    setupWellbeingButtons(gStatus);
    return;
  }

  // ── Central Performance Index ────────────────────────────────────────────
  const perf = scores.overall;
  const perfC = scoreColor(perf);
  const perfLbl = scoreLabel(perf);
  html += `<div class="wb-perf-row">
    <div class="wb-perf-ring" style="--ring-color:${perfC}">
      <div class="wb-perf-value" style="color:${perfC}">${perf ?? '—'}</div>
      <div class="wb-perf-label">Performance<br>Index</div>
    </div>
    <div class="wb-perf-meta">
      <div class="wb-perf-meta-score" style="color:${perfC}">${perfLbl}</div>
      <div class="wb-perf-meta-sub">Basato su sonno · attività · recupero cardiaco</div>
      ${health.weightKg ? `<div class="wb-perf-meta-sub">⚖️ Peso: <strong>${health.weightKg} kg</strong></div>` : ''}
    </div>
  </div>`;

  // ── 4 Score cards ────────────────────────────────────────────────────────
  html += `<div class="wb-scores-row">`;
  [
    { label: 'Sonno',      score: scores.sleep,    icon: '😴', detail: health.sleepDuration || '' },
    { label: 'Attività',   score: scores.activity, icon: '🏃', detail: health.steps ? health.steps.toLocaleString('it') + ' passi' : '' },
    { label: 'Recupero',   score: scores.recovery, icon: '❤️', detail: health.restingHR ? health.restingHR + ' bpm' : '' },
    { label: 'Focus',      score: scores.focus,    icon: '🧠', detail: health.activeMin ? health.activeMin + ' min att.' : '' },
  ].forEach(({ label, score, icon, detail }) => {
    const c = scoreColor(score);
    html += `<div class="wb-score-card" style="--score-color:${c}">
      <div class="wb-score-icon">${icon}</div>
      <div class="wb-score-value" style="color:${c}">${score ?? '—'}</div>
      <div class="wb-score-label">${label}</div>
      <div class="wb-score-sub" style="color:${c}">${scoreLabel(score)}</div>
      ${detail ? `<div class="wb-score-detail">${detail}</div>` : ''}
    </div>`;
  });
  html += `</div>`;

  // ── Metrics grid ──────────────────────────────────────────────────────────
  const metrics = [
    { icon:'😴', label:'Durata sonno',   value: health.sleepDuration },
    { icon:'🌊', label:'Sonno profondo', value: health.deepSleep },
    { icon:'💤', label:'Sonno REM',      value: health.remSleep },
    { icon:'❤️', label:'FC a riposo',    value: fmt(health.restingHR, ' bpm') },
    { icon:'📊', label:'FC media',       value: fmt(health.hrAvg, ' bpm') },
    { icon:'📈', label:'FC massima',     value: fmt(health.hrMax, ' bpm') },
    { icon:'💓', label:'HRV',            value: fmt(health.hrv, ' ms') },
    { icon:'👟', label:'Passi',          value: health.steps != null ? health.steps.toLocaleString('it') : null },
    { icon:'🔥', label:'Calorie',        value: fmt(health.calories, ' kcal') },
    { icon:'📍', label:'Distanza',       value: fmt(health.distanceKm, ' km') },
    { icon:'⏱️', label:'Minuti attivi',  value: fmt(health.activeMin, ' min') },
    { icon:'⚖️', label:'Peso',           value: fmt(health.weightKg, ' kg') },
  ].filter(m => m.value && m.value !== '—');

  if (metrics.length > 0) {
    html += `<div class="section-header" style="margin-top:20px"><h2>📋 Metriche oggi</h2></div>
    <div class="wb-metrics-grid">`;
    metrics.forEach(m => {
      html += `<div class="wb-metric-item">
        <div class="wb-metric-label">${m.icon} ${m.label}</div>
        <div class="wb-metric-value">${escHtml(String(m.value))}</div>
      </div>`;
    });
    html += `</div>`;
  }

  // ── 7-day trend sparklines ────────────────────────────────────────────────
  if (trends.length >= 3) {
    const stepsVals   = trends.map(d => d.steps   || 0);
    const hrVals      = trends.map(d => d.hrAvg   || null);
    const calVals     = trends.map(d => d.calories|| 0);
    const activeVals  = trends.map(d => d.activeMin||0);
    const lastDate    = trends[trends.length-1]?.date?.slice(5) || '';
    html += `<div class="section-header" style="margin-top:20px"><h2>📈 Trend 7 giorni</h2><span class="sh-sub">fino al ${lastDate}</span></div>
    <div class="wb-trends-grid">
      <div class="wb-trend-item">
        <div class="wb-trend-label">👟 Passi</div>
        <div class="wb-trend-spark">${sparkline(stepsVals, '#60a5fa')}</div>
        <div class="wb-trend-avg">media: ${Math.round(stepsVals.filter(v=>v>0).reduce((a,b)=>a+b,0)/(stepsVals.filter(v=>v>0).length||1)).toLocaleString('it')}</div>
      </div>
      <div class="wb-trend-item">
        <div class="wb-trend-label">❤️ FC media</div>
        <div class="wb-trend-spark">${sparkline(hrVals, '#f87171')}</div>
        <div class="wb-trend-avg">media: ${Math.round(hrVals.filter(v=>v).reduce((a,b)=>a+b,0)/(hrVals.filter(v=>v).length||1))} bpm</div>
      </div>
      <div class="wb-trend-item">
        <div class="wb-trend-label">🔥 Calorie</div>
        <div class="wb-trend-spark">${sparkline(calVals, '#fbbf24')}</div>
        <div class="wb-trend-avg">media: ${Math.round(calVals.filter(v=>v>0).reduce((a,b)=>a+b,0)/(calVals.filter(v=>v>0).length||1))} kcal</div>
      </div>
      <div class="wb-trend-item">
        <div class="wb-trend-label">⏱️ Min. attivi</div>
        <div class="wb-trend-spark">${sparkline(activeVals, '#34d399')}</div>
        <div class="wb-trend-avg">media: ${Math.round(activeVals.filter(v=>v>0).reduce((a,b)=>a+b,0)/(activeVals.filter(v=>v>0).length||1))} min</div>
      </div>
    </div>`;
  }

  // ── Smart advice ──────────────────────────────────────────────────────────
  const tips = wellbeingAdvice(health, scores);
  if (tips.length > 0) {
    html += `<div class="section-header" style="margin-top:20px"><h2>💡 Consigli per oggi</h2></div>
    <div class="wb-advice-list">`;
    tips.forEach(t => {
      html += `<div class="wb-advice-card">
        <div class="wb-advice-icon">${t.icon}</div>
        <div class="wb-advice-body">
          <div class="wb-advice-tag">${escHtml(t.tag)}</div>
          <div class="wb-advice-text">${escHtml(t.text)}</div>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  html += `<div class="wb-footer">
    ${gStatus.connected
      ? `✅ Google Fit connesso · marco@giacomello.digital${syncTs ? ' · sync: ' + syncTs : ''}`
      : `⚠️ Google non connesso`}
    &nbsp;·&nbsp; 📡 RingConn 2 → Google Fit → Daily Tracker (ogni ora)
  </div>`;

  container.innerHTML = html;
  setupWellbeingButtons(gStatus);
}

function setupWellbeingButtons(gStatus) {
  document.getElementById('wb-refresh-btn')?.addEventListener('click', async () => {
    await loadDay(currentDate);
    renderWellbeing();
  });
  document.getElementById('wb-sync-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('wb-sync-btn');
    if (btn) { btn.textContent = '⏳ Sync...'; btn.disabled = true; }
    try {
      await api('POST', '/google/sync');
      await loadDay(currentDate);
    } finally { renderWellbeing(); }
  });
  document.getElementById('wb-disconnect-btn')?.addEventListener('click', async () => {
    if (!confirm('Disconnetti Google? I dati già salvati rimangono.')) return;
    await api('DELETE', '/auth/google');
    renderWellbeing();
  });
}

/* ── FAMIGLIA ─────────────────────────────────────────────────────────────── */
async function renderFamily() {
  const family = dayData.family;
  const container = document.getElementById('family-content');
  if (!container) return;

  // Detect if Marco is in London (from calendar data)
  const cityRaw = dayData.network?.city || '';
  const isInLondon = /london/i.test(cityRaw);

  let html = `<div class="section-header"><h2>💑 Alessandra</h2></div>`;

  if (family?.alessandraEvents?.length > 0) {
    html += `<div class="family-events-row">`;
    family.alessandraEvents.forEach(e => {
      html += `<div class="family-event-chip">
        ${e.time ? `<span class="fec-time">${escHtml(e.time)}</span>` : ''}
        <span class="fec-title">${escHtml(e.title)}</span>
        ${e.isAway ? `<span class="fec-away-dot" title="Non in casa">🏠</span>` : ''}
      </div>`;
    });
    html += `</div>`;
  } else {
    html += `<div class="family-empty-chip">🏠 Nessun impegno</div>`;
  }

  // ── 2. London / weekly proposals (right under Alessandra's section)
  const proposals = family?.londonProposals?.length > 0
    ? family.londonProposals
    : (isInLondon && family?.weekProposals?.length > 0 ? family.weekProposals : null);

  if (isInLondon) {
    const typeIcon = { restaurant: '🍽️', exhibition: '🎨', concert: '🎵', theater: '🎭', experience: '✨', walk: '🌳', bar: '🍸', show: '🎬' };
    html += `<div class="section-header" style="margin-top:16px">
      <h2>🇬🇧 Serate a Londra</h2>
      <span class="london-badge">Sei a Londra</span>
    </div>`;
    if (proposals?.length > 0) {
      html += `<div class="proposals-compact-list">`;
      proposals.forEach(p => {
        const icon = typeIcon[p.type] || '✨';
        html += `<div class="proposal-compact-card">
          <span class="pc-icon">${icon}</span>
          <div class="pc-body">
            <div class="pc-title">${escHtml(p.title)}</div>
            ${p.description ? `<div class="pc-desc">${escHtml(p.description)}</div>` : ''}
            <div class="pc-meta">
              ${p.date ? `<span class="pc-date">${escHtml(p.date)}</span>` : ''}
              ${p.zone ? `<span class="pc-zone">${escHtml(p.zone)}</span>` : ''}
              ${p.price ? `<span class="pc-price">${escHtml(p.price)}</span>` : ''}
            </div>
            ${(p.tags || []).length > 0 ? `<div class="proposal-tags">${p.tags.map(t => `<span class="proposal-tag">${escHtml(t)}</span>`).join('')}</div>` : ''}
          </div>
          ${p.link ? `<a href="${escHtml(p.link)}" target="_blank" class="btn-ghost pc-link">↗</a>` : ''}
        </div>`;
      });
      html += `</div>`;
    } else {
      html += `<div class="family-empty-chip" style="margin-top:6px">🌅 Proposte serate verranno generate dal briefing mattutino</div>`;
    }
  } else if (family?.weekProposals?.length > 0) {
    const typeIcon = { restaurant: '🍽️', exhibition: '🎨', concert: '🎵', theater: '🎭', experience: '✨' };
    html += `<div class="section-header" style="margin-top:16px"><h2>💑 Proposte per questa settimana</h2></div>
    <div class="proposals-compact-list">`;
    family.weekProposals.forEach(p => {
      const icon = typeIcon[p.type] || '✨';
      html += `<div class="proposal-compact-card">
        <span class="pc-icon">${icon}</span>
        <div class="pc-body">
          <div class="pc-title">${escHtml(p.title)}</div>
          ${p.description ? `<div class="pc-desc">${escHtml(p.description)}</div>` : ''}
          <div class="pc-meta">
            ${p.date ? `<span class="pc-date">${escHtml(p.date)}</span>` : ''}
            ${p.zone ? `<span class="pc-zone">${escHtml(p.zone)}</span>` : ''}
            ${p.price ? `<span class="pc-price">${escHtml(p.price)}</span>` : ''}
          </div>
        </div>
        ${p.link ? `<a href="${escHtml(p.link)}" target="_blank" class="btn-ghost pc-link">Info ↗</a>` : ''}
      </div>`;
    });
    html += `</div>`;
  }

  // ── 3. Tommaso · Classroom
  html += `<div class="section-header" style="margin-top:28px">
    <h2>🎒 Tommaso · Classroom</h2>
    <button class="btn-ghost btn-sm" id="classroom-refresh-btn">🔄</button>
  </div>`;
  html += await renderClassroom();

  // ── 4. Tommaso homework tasks (above comunicazioni)
  if (family?.tommasoTasks?.length > 0) {
    const subjIcon = { italiano: '🇮🇹', 'english-maths': '📖', ict: '💻', nuoto: '🏊', salute: '💊', scuola: '🏫', materiale: '🎒' };
    const active   = family.tommasoTasks.filter(t => !t.done);
    const archived = family.tommasoTasks.filter(t =>  t.done);
    const doneCount = archived.length;

    const renderTaskCard = (t, isDone) => {
      const icon = subjIcon[t.subject] || '📌';
      const isUrgent = t.priority === 'high' && !isDone;
      let dueLabel = '';
      if (t.dueDate && !isDone) {
        const dueDays = Math.ceil((new Date(t.dueDate) - new Date(currentDate)) / 86400000);
        dueLabel = dueDays < 0 ? '<span class="ttc-due overdue">🔴 SCADUTO</span>'
                 : dueDays === 0 ? '<span class="ttc-due today">🟠 Oggi</span>'
                 : dueDays === 1 ? '<span class="ttc-due soon">🟡 Dom.</span>'
                 : `<span class="ttc-due">${escHtml(t.dueDate.slice(5))}</span>`;
      }
      const apsHtml = !isDone && t.actionPoints?.length > 0
        ? `<details class="ttc-ap-details"><summary class="ttc-ap-toggle">${t.actionPoints.length} step</summary>
            <ul class="ttc-action-list">${t.actionPoints.map(ap => `<li>${escHtml(ap)}</li>`).join('')}</ul>
          </details>`
        : '';
      return `<div class="ttc-row${isUrgent ? ' task-urgent' : ''}${isDone ? ' task-done' : ''}" data-task-id="${escHtml(t.id)}">
        <button class="ttc-check${isDone ? ' checked' : ''}" data-id="${escHtml(t.id)}" title="${isDone ? 'Segna come da fare' : 'Segna come fatto'}">${isDone ? '✅' : '⬜'}</button>
        <span class="ttc-icon-sm">${icon}</span>
        <div class="ttc-body">
          <div class="ttc-row-main">
            <span class="ttc-title${isDone ? ' line-through' : ''}">${escHtml(t.title)}</span>
            ${dueLabel}
          </div>
          ${apsHtml}
        </div>
      </div>`;
    };

    html += `<div class="section-header" style="margin-top:20px">
      <h2>📚 Compiti & Task per Tommaso</h2>
      ${doneCount > 0 ? `<span class="ttc-archive-count">${doneCount} ✓</span>` : ''}
    </div>
    <div class="ttc-rows-list" id="tommaso-tasks-list">`;
    active.forEach(t => { html += renderTaskCard(t, false); });
    if (archived.length > 0) {
      html += `<details class="ttc-archived-section">
        <summary>Archiviati (${archived.length})</summary>
        <div class="ttc-archived-list">`;
      archived.forEach(t => { html += renderTaskCard(t, true); });
      html += `</div></details>`;
    }
    html += `</div>`;
  }

  // ── 5. Comunicazioni scuola (flaggable)
  if (family?.tommasoAlerts?.length > 0) {
    const activeAlerts   = family.tommasoAlerts.filter(a => !a.done);
    const archivedAlerts = family.tommasoAlerts.filter(a =>  a.done);
    html += `<div class="section-header" style="margin-top:20px">
      <h2>📢 Comunicazioni scuola</h2>
      ${archivedAlerts.length > 0 ? `<span class="ttc-archive-count">${archivedAlerts.length} ✓</span>` : ''}
    </div>
    <div class="ttc-rows-list" id="alerts-list">`;
    activeAlerts.forEach(a => {
      const daysLabel = a.deadlineDate ? ` · scadenza ${a.deadlineDate}` : '';
      html += `<div class="ttc-row${a.priority === 'high' ? ' task-urgent' : ''}" data-alert-id="${escHtml(a.id || '')}">
        <button class="tac-check" data-id="${escHtml(a.id || '')}" title="Segna come letto">⬜</button>
        <div class="ttc-body">
          <div class="ttc-row-main">
            <span class="ttc-title">${escHtml(a.title)}<span class="tac-deadline">${escHtml(daysLabel)}</span></span>
          </div>
          ${a.detail ? `<div class="tac-detail-compact">${escHtml(a.detail)}</div>` : ''}
          ${a.link ? `<a href="${escHtml(a.link)}" target="_blank" class="btn-ghost tac-link-sm">Apri ↗</a>` : ''}
        </div>
      </div>`;
    });
    if (archivedAlerts.length > 0) {
      html += `<details class="ttc-archived-section">
        <summary>Letti (${archivedAlerts.length})</summary>
        <div class="ttc-archived-list">`;
      archivedAlerts.forEach(a => {
        html += `<div class="ttc-row task-done" data-alert-id="${escHtml(a.id || '')}">
          <button class="tac-check checked" data-id="${escHtml(a.id || '')}" title="Segna come non letto">✅</button>
          <div class="ttc-body">
            <div class="ttc-row-main">
              <span class="ttc-title line-through">${escHtml(a.title)}</span>
            </div>
          </div>
        </div>`;
      });
      html += `</div></details>`;
    }
    html += `</div>`;
  }

  container.innerHTML = html;

  // Classroom refresh button
  document.getElementById('classroom-refresh-btn')?.addEventListener('click', async () => {
    await api('POST', '/google/sync');
    renderFamily();
  });

  // Tommaso task done/archive toggle
  document.querySelectorAll('.ttc-check').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const result = await api('PATCH', `/day/${currentDate}/family/task/${id}/done`, {});
      if (result.ok && result.task) {
        const tasks = dayData.family.tommasoTasks;
        const idx = tasks.findIndex(t => t.id === id);
        if (idx !== -1) tasks[idx] = result.task;
      }
      renderFamily();
    });
  });

  // Comunicazioni scuola toggle (flaggable)
  document.querySelectorAll('.tac-check').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (!id) return;
      const result = await api('PATCH', `/day/${currentDate}/family/alert/${id}/done`, {});
      if (result.ok && result.alert) {
        const alerts = dayData.family.tommasoAlerts;
        const idx = alerts.findIndex(a => a.id === id);
        if (idx !== -1) alerts[idx] = result.alert;
      }
      renderFamily();
    });
  });
}

async function renderClassroom() {
  let emails = [];
  let gStatus = { connected: false };
  try {
    [emails, gStatus] = await Promise.all([
      fetch('/api/classroom-emails').then(r => r.json()),
      api('GET', '/auth/google/status')
    ]);
  } catch (e) {}

  if (!gStatus.connected) {
    return `<div class="empty-section" style="padding:16px;font-size:13px;color:var(--text-muted)">Email Classroom non disponibili — Google non connesso.</div>`;
  }

  if (emails.length === 0) {
    return `<div class="empty-section" style="padding:20px">
      <div style="font-size:22px;margin-bottom:8px">📬</div>
      <div style="font-weight:600;margin-bottom:6px">Nessuna email Classroom ancora</div>
      <div style="font-size:13px;color:var(--text-muted);line-height:1.7">
        Per attivare:<br>
        1. Accedi a Gmail di Tommaso → Impostazioni → <strong>Inoltro</strong><br>
        2. Aggiungi <strong>marco@giacomello.digital</strong> come indirizzo di inoltro<br>
        3. Le email di Google Classroom arriveranno qui automaticamente
      </div>
    </div>`;
  }

  const tagColor = { 'inoltro-tommaso': '#34d399', 'classroom-diretto': '#60a5fa', 'inoltro': '#a78bfa', 'correlato': '#888890' };
  const tagLabel = { 'inoltro-tommaso': '📨 Da Tommaso', 'classroom-diretto': '🏫 Classroom', 'inoltro': '↪️ Inoltrato', 'correlato': '📧 Correlato' };

  const updatedAt = emails[0]?.date?.slice(0, 10) || '';
  let html = `<div class="classroom-sync-ts">📬 ${emails.length} email Classroom${updatedAt ? ' · ultima: ' + updatedAt : ''}</div>
  <div class="classroom-emails-list">`;

  emails.forEach(e => {
    const color = tagColor[e.tag] || '#888890';
    const label = tagLabel[e.tag] || '📧';
    const dateStr = e.date ? new Date(e.date).toLocaleDateString('it-IT', { day:'numeric', month:'short' }) : '';

    // Detect if it looks like an assignment with due date
    const hasDeadline = e.due || e.snippet?.match(/[Ss]cade|due|consegna/i);

    html += `<div class="classroom-email-card${hasDeadline ? ' has-deadline' : ''}">
      <div class="ce-header">
        <span class="ce-tag" style="background:${color}20;color:${color}">${label}</span>
        <span class="ce-subject">${escHtml(e.subject)}</span>
        <span class="ce-date">${dateStr}</span>
        <a href="${escHtml(e.link)}" target="_blank" class="btn-ghost ci-open" style="margin-left:auto">Apri ↗</a>
      </div>
      ${e.snippet ? `<div class="ce-snippet">${escHtml(e.snippet.slice(0, 160))}${e.snippet.length > 160 ? '…' : ''}</div>` : ''}
      ${e.due ? `<div class="ce-due">⏰ ${escHtml(e.due)}</div>` : ''}
    </div>`;
  });

  html += `</div>`;
  return html;
}

/* ── NETWORK ──────────────────────────────────────────────────────────────── */
async function renderNetwork() {
  const container = document.getElementById('network-content');
  if (!container) return;
  container.innerHTML = '<div class="empty-section" style="padding:32px 0">Analisi contatti in corso…</div>';

  let intel = { marcoCity: 'Bologna', travelToday: null, sameCity: [], allContacts: [] };
  try { intel = await api('GET', `/network/location-intel/${currentDate}`); } catch(e) {}

  const { marcoCity, travelToday, sameCity, allContacts } = intel;
  let html = '';

  // ── Location / travel banner ───────────────────────────────────────────────
  const cityFlag = (c) => {
    if (!c) return '📍';
    const cl = c.toLowerCase();
    if (cl.includes('london') || cl.includes('uk')) return '🇬🇧';
    if (cl.includes('paris') || cl.includes('parigi')) return '🇫🇷';
    if (cl.includes('berlin') || cl.includes('berlino')) return '🇩🇪';
    return '🇮🇹';
  };

  if (travelToday) {
    html += `<div class="loc-travel-alert">
      <div class="lta-left">
        <span class="lta-icon">${travelToday.type === 'flight' ? '✈️' : '🚄'}</span>
        <div>
          <div class="lta-title">Sei in partenza per <strong>${escHtml(travelToday.destination || '?')}</strong></div>
          <div class="lta-sub">${travelToday.time ? 'Decollo alle ' + travelToday.time + ' ora locale' : ''} ${travelToday.logistics?.departBy ? '· 🚪 Parti da casa entro le <strong>' + travelToday.logistics.departBy + '</strong>' : ''}</div>
        </div>
      </div>
      <span class="lta-badge">oggi</span>
    </div>`;
  } else {
    html += `<div class="loc-city-bar">
      <span>${cityFlag(marcoCity)}</span>
      <div>
        <span class="lcb-city">${escHtml(marcoCity)}</span>
        <span class="lcb-label"> · posizione rilevata dal calendario</span>
      </div>
    </div>`;
  }

  // ── Contacts in same city ─────────────────────────────────────────────────
  const destCity = travelToday?.destination || marcoCity;

  html += `<div class="section-header" style="margin-top:18px">
    <h2>📍 Chi puoi incontrare a ${escHtml(destCity)}?</h2>
    <span class="section-sub">Contatti salvati nella stessa città</span>
  </div>`;

  if (sameCity.length > 0) {
    html += `<div class="loc-contacts-grid">`;
    sameCity.forEach(c => {
      const initials = c.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
      const topTask  = c.urgentTasks?.[0];
      const activities = suggestActivities(c, destCity);
      html += `<div class="loc-contact-card">
        <div class="lcc-header">
          <div class="lcc-avatar">${initials}</div>
          <div class="lcc-info">
            <div class="lcc-name">${escHtml(c.name)}</div>
            ${c.company ? `<div class="lcc-company">${escHtml(c.company)}</div>` : ''}
          </div>
          <a href="https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(c.name)}" target="_blank" class="btn-ghost lcc-li-btn" title="Cerca su LinkedIn">in</a>
        </div>
        ${topTask ? `<div class="lcc-context">💼 ${escHtml(topTask.title.replace(/^🗂\s*/,'').split('·').slice(1).join('·').trim() || topTask.title.replace(/^🗂\s*/,''))}</div>` : ''}
        <div class="lcc-suggestions">${activities.map(a => `<span class="lcc-suggestion">${a}</span>`).join('')}</div>
        ${c.notes ? `<div class="lcc-notes">${escHtml(c.notes)}</div>` : ''}
      </div>`;
    });
    html += `</div>`;
  } else {
    html += `<div class="loc-empty-city">
      <div class="loc-empty-icon">🤝</div>
      <div class="loc-empty-text">Nessun contatto salvato a <strong>${escHtml(destCity)}</strong> ancora.</div>
      <div class="loc-empty-sub">Imposta la città di ogni contatto qui sotto, o chiedi all'assistente AI di farlo per te.</div>
    </div>`;
  }

  // ── All contacts with city setter ─────────────────────────────────────────
  const withTasks = allContacts.filter(c => c.urgentTasks?.length > 0);
  if (withTasks.length > 0) {
    html += `<div class="section-header" style="margin-top:28px">
      <h2>👥 Tutti i contatti attivi</h2>
      <span class="section-sub">${withTasks.length} con task aperti · imposta la loro città per il matching</span>
    </div><div class="contacts-list">`;
    withTasks.forEach(c => {
      const daysSince = c.lastMention ? Math.round((Date.now() - new Date(c.lastMention + 'T12:00:00').getTime()) / 86400000) : null;
      const urgColor  = c.urgentTasks.some(t => (t.quadrant||'').toUpperCase() === 'Q1') ? '#f87171' : '#fbbf24';
      const topTask   = c.urgentTasks[0];
      html += `<div class="contact-card">
        <div class="cc-header">
          <div class="cc-avatar">${escHtml(c.name.charAt(0))}</div>
          <div class="cc-info">
            <div class="cc-name">${escHtml(c.name)}</div>
            ${c.company ? `<div class="cc-company">${escHtml(c.company)}</div>` : ''}
          </div>
          <div class="cc-meta">
            <span class="cc-badge" style="background:${urgColor}22;color:${urgColor}">${c.urgentTasks.length} task</span>
            ${daysSince !== null ? `<span class="cc-since">${daysSince === 0 ? 'oggi' : daysSince + 'g fa'}</span>` : ''}
          </div>
        </div>
        ${topTask ? `<div class="cc-task">
          <span class="cc-task-q">${topTask.quadrant||'q2'}</span>
          <span class="cc-task-title">${escHtml(topTask.title.replace(/^🗂\s*/,'').split('·').slice(1).join('·').trim() || topTask.title.replace(/^🗂\s*/,''))}</span>
        </div>` : ''}
        <div class="cc-city-row">
          <input class="cc-city-input" type="text" placeholder="Città (es. Milano)" value="${escHtml(c.city||'')}"
            data-contact="${escHtml(c.name)}"
            onchange="saveContactCity(this.dataset.contact, this.value)"/>
          <a href="https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(c.name)}" target="_blank" class="btn-ghost cc-li-link" title="LinkedIn">in</a>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  container.innerHTML = html;
}

function suggestActivities(contact, city) {
  const s = [];
  if (contact.urgentTasks?.length > 0) s.push('☕ Allineamento rapido');
  if (contact.company) s.push('🤝 Meeting in sede');
  s.push('🍽️ Pranzo');
  if (city === 'Milano') s.push('🏙️ Aperitivo Navigli');
  else if (city === 'Roma') s.push('🏛️ Caffè storico');
  else if (city === 'Bologna') s.push('🍝 Osteria');
  return s.slice(0, 3);
}

async function saveContactCity(name, city) {
  try { await api('PATCH', `/contacts/${encodeURIComponent(name)}`, { city }); } catch(e) {}
}

/* ── TRASFERIMENTI ─────────────────────────────────────────────────────────── */

async function renderTransfers() {
  const container = document.getElementById('transfers-content');
  if (!container) return;
  container.innerHTML = '<div class="empty-section" style="padding:32px 0">Analisi calendario in corso…</div>';

  let transfers = [];
  try { transfers = await api('GET', `/transfers/week/${currentDate}`); } catch(e) {}

  let html = '';
  const todayT  = transfers.filter(t => t.date === currentDate);
  const futureT = transfers.filter(t => t.date > currentDate);
  const pastT   = transfers.filter(t => t.date < currentDate);

  todayT.forEach(t  => { html += renderTransferCard(t, true);  });
  if (futureT.length) {
    html += `<div class="section-header" style="margin-top:${todayT.length ? '24px' : '0'}">
      <h2>📅 Prossimi trasferimenti</h2><span class="section-sub">Prossime 2 settimane</span></div>`;
    futureT.forEach(t => { html += renderTransferCard(t, false); });
  }
  if (pastT.length) {
    html += `<details style="margin-top:20px"><summary class="tr-past-summary">📁 ${pastT.length} trasferimenti recenti</summary>`;
    [...pastT].reverse().forEach(t => { html += renderTransferCard(t, false); });
    html += `</details>`;
  }

  if (!transfers.length) {
    html = `<div class="tr-empty">
      <div class="tr-empty-icon">✈️</div>
      <div class="tr-empty-title">Nessun trasferimento rilevato</div>
      <div class="tr-empty-sub">Il sistema analizza automaticamente voli e treni dal tuo calendario Google.<br>
      Parole chiave cercate: <em>volo, treno, Malpensa, Linate, FCO, Wizz Air, Trenitalia, Italo…</em></div>
      <button class="btn-primary" style="margin-top:16px" onclick="syncGoogleCalendar()">🔄 Sincronizza Calendario</button>
    </div>`;
  }

  if (transfers.length > 1) html += buildWeekStrip(transfers);
  container.innerHTML = html;
}

function renderTransferCard(t, isToday) {
  const typeIcon  = t.type === 'flight' ? '✈️' : '🚄';
  const typeLabel = t.type === 'flight' ? 'Volo' : 'Treno';
  let logHtml = '';
  if (t.logistics) {
    logHtml = `<div class="tr-logistics">`;
    if (t.logistics.departBy) logHtml += `<div class="tr-log-item tr-log-depart">
      <span class="tr-log-icon">🚪</span>
      <div>
        <div class="tr-log-label">Parti da casa entro le</div>
        <div class="tr-log-value">${escHtml(t.logistics.departBy)}</div>
        ${t.logistics.arriveBy ? `<div class="tr-log-sublabel">Essere in aeroporto entro le ${escHtml(t.logistics.arriveBy)}</div>` : ''}
      </div>
    </div>`;
    if (t.logistics.transport) logHtml += `<div class="tr-log-item">
      <span class="tr-log-icon">🗺️</span>
      <div><div class="tr-log-label">Come arrivare all'aeroporto</div><div class="tr-log-value tr-log-transport">${escHtml(t.logistics.transport)}</div></div>
    </div>`;
    logHtml += `</div>`;
    if (t.logistics.tips?.length) {
      logHtml += `<div class="tr-tips">${t.logistics.tips.map(tip => `<div class="tr-tip">💡 ${escHtml(tip)}</div>`).join('')}</div>`;
    }
  }
  const tJson = JSON.stringify(t).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const trackBtn = `<button class="tr-track-btn" onclick="event.stopPropagation();openTrackingOverlay('${tJson}')">📡 Traccia</button>`;
  return `<div class="tr-card ${isToday ? 'tr-card-today' : ''}" onclick="openTrackingOverlay('${tJson}')" style="cursor:pointer">
    <div class="tr-card-header">
      <div class="tr-left">
        <span class="tr-type-icon">${typeIcon}</span>
        <div>
          <div class="tr-title">${typeLabel}${t.destination ? ' → ' + escHtml(t.destination) : ''}</div>
          <div class="tr-subtitle">${escHtml(t.title)}</div>
        </div>
      </div>
      <div class="tr-right">
        ${isToday ? `<span class="tr-today-badge">OGGI</span>` : `<span class="tr-date-badge">${escHtml(t.date?.slice(5)||'')}</span>`}
        ${t.time ? `<span class="tr-time">${escHtml(t.time)}</span>` : ''}
        ${trackBtn}
      </div>
    </div>
    ${t.flightCode ? `<div class="tr-code">Codice: <strong>${escHtml(t.flightCode)}</strong></div>` : ''}
    ${logHtml}
  </div>`;
}

function buildWeekStrip(transfers) {
  const byDate = {};
  transfers.forEach(t => { if (!byDate[t.date]) byDate[t.date] = []; byDate[t.date].push(t); });
  const dates = Object.keys(byDate).sort();
  let html = `<div class="section-header" style="margin-top:28px"><h2>🗓️ Piano spostamenti settimanale</h2></div><div class="tr-week-strip">`;
  dates.forEach(date => {
    const items = byDate[date];
    const isToday = date === currentDate;
    const dayName = new Date(date + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
    html += `<div class="tr-week-day ${isToday ? 'tr-week-today' : ''}">
      <div class="tr-week-date">${escHtml(dayName)}</div>
      ${items.map(t => `<div class="tr-week-item">${t.type === 'flight' ? '✈️' : '🚄'} ${escHtml(t.destination || t.title.slice(0,15))}</div>`).join('')}
    </div>`;
  });
  return html + `</div>`;
}

async function syncGoogleCalendar() {
  try { await api('POST', '/google/sync'); await renderTransfers(); }
  catch(e) { alert('Sincronizzazione fallita. Vai su /auth/google per connettere Google Calendar.'); }
}

/* ── TARGET 100 ───────────────────────────────────────────────────────────── */
function renderTarget100(stats) {
  const pct  = stats?.pct  || 0;
  const done  = stats?.done  || 0;
  const total = stats?.total || 0;
  const fillEl  = document.getElementById('t100-fill');
  const pctEl   = document.getElementById('t100-pct');
  const statsEl = document.getElementById('t100-stats');
  if (fillEl)  fillEl.style.width = pct + '%';
  if (pctEl)   pctEl.textContent  = pct + '%';
  if (statsEl) statsEl.textContent = `${done} / ${total} task chiuse questa settimana`;
}

/* ══════════════════════════════════════════════════════════════════════════════
   PROJECTS
══════════════════════════════════════════════════════════════════════════════ */

let projectsData = [];
let currentProjectId = null;

async function loadProjects() {
  projectsData = await api('GET', '/projects');
  renderProjectsGrid();
}

function renderProjectsGrid() {
  const grid = document.getElementById('projects-grid');
  if (!grid) return;
  if (projectsData.length === 0) {
    grid.innerHTML = '<div class="empty-section" style="margin-top:32px">Nessun progetto ancora — creane uno o promuovi un task dal pannello dettaglio 🚀</div>';
    return;
  }
  grid.innerHTML = '';
  projectsData.forEach(proj => grid.appendChild(buildProjectCard(proj)));
}

function buildProjectCard(proj) {
  const doneTasks  = (proj.tasks || []).filter(t => t.done).length;
  const totalTasks = (proj.tasks || []).length;
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const statusLabels = { active: '🟢 Attivo', paused: '🟡 In pausa', completed: '✅ Completato' };

  const card = document.createElement('div');
  card.className = 'project-card';
  card.style.setProperty('--proj-color', proj.color || '#7c6af7');
  card.innerHTML = `
    <div class="pc-top">
      <div class="pc-title">${escHtml(proj.title)}</div>
      <span class="pc-status ${proj.status}">${statusLabels[proj.status] || proj.status}</span>
    </div>
    ${proj.client ? `<div class="pc-client">${escHtml(proj.client)}</div>` : ''}
    ${totalTasks > 0 ? `
      <div class="pc-progress-row">
        <div class="progress-bar pc-prog-bar"><div class="progress-fill" style="width:${pct}%;background:var(--proj-color)"></div></div>
        <span class="pc-prog-label">${doneTasks}/${totalTasks}</span>
      </div>
    ` : ''}
    <div class="pc-footer">
      <span class="pc-date">${proj.createdAt || ''}</span>
      ${proj.fromItemId ? `<span class="pc-from-tag">Da task</span>` : ''}
    </div>
  `;
  card.addEventListener('click', () => openProjectWorkspace(proj.id));
  return card;
}

function openProjectWorkspace(projId) {
  currentProjectId = projId;
  const proj = projectsData.find(p => p.id === projId);
  if (!proj) return;

  document.getElementById('view-projects').classList.remove('active');
  const ws = document.getElementById('view-project-detail');
  ws.classList.add('active');

  // Populate fields
  const colorDot = document.getElementById('proj-ws-color-dot');
  colorDot.style.background = proj.color || '#7c6af7';
  document.getElementById('proj-ws-title').value   = proj.title || '';
  document.getElementById('proj-ws-color').value   = proj.color || '#7c6af7';
  document.getElementById('proj-ws-client').value  = proj.client || '';
  document.getElementById('proj-ws-status').value  = proj.status || 'active';
  document.getElementById('proj-ws-desc').value    = proj.description || '';
  document.getElementById('proj-ws-notes').value   = proj.notes || '';

  renderProjectTasks(proj.tasks || []);
  renderProjectLinks(proj.links || []);
}

function renderProjectTasks(tasks) {
  const container = document.getElementById('proj-ws-tasks');
  if (!container) return;
  container.innerHTML = '';
  tasks.forEach(task => {
    const row = document.createElement('div');
    row.className = 'proj-task-row';
    row.innerHTML = `
      <input type="checkbox" ${task.done ? 'checked' : ''} data-tid="${task.id}" class="proj-task-check" />
      <span class="proj-task-text ${task.done ? 'done' : ''}">${escHtml(task.text)}</span>
      <button class="proj-task-del btn-ghost" data-del-tid="${task.id}">✕</button>
    `;
    row.querySelector('.proj-task-check').addEventListener('change', async e => {
      await api('PATCH', `/projects/${currentProjectId}/task/${task.id}`, { done: e.target.checked });
      const proj = projectsData.find(p => p.id === currentProjectId);
      if (proj) { const t = proj.tasks.find(t => t.id === task.id); if (t) t.done = e.target.checked; }
      renderProjectTasks(projectsData.find(p => p.id === currentProjectId)?.tasks || []);
    });
    row.querySelector('[data-del-tid]').addEventListener('click', async () => {
      await api('DELETE', `/projects/${currentProjectId}/task/${task.id}`);
      projectsData = await api('GET', '/projects');
      renderProjectTasks(projectsData.find(p => p.id === currentProjectId)?.tasks || []);
    });
    container.appendChild(row);
  });
}

function renderProjectLinks(links) {
  const container = document.getElementById('proj-ws-links');
  if (!container) return;
  container.innerHTML = '';
  links.forEach(link => {
    const row = document.createElement('div');
    row.className = 'proj-link-row';
    row.innerHTML = `
      <a href="${escHtml(link.url)}" target="_blank" class="proj-link-anchor">🔗 ${escHtml(link.label || link.url)}</a>
      <button class="proj-link-del btn-ghost" data-del-lid="${link.id}">✕</button>
    `;
    row.querySelector('[data-del-lid]').addEventListener('click', async () => {
      await api('DELETE', `/projects/${currentProjectId}/link/${link.id}`);
      projectsData = await api('GET', '/projects');
      renderProjectLinks(projectsData.find(p => p.id === currentProjectId)?.links || []);
    });
    container.appendChild(row);
  });
}

function setupProjects() {
  // New project form
  document.getElementById('new-project-btn')?.addEventListener('click', () =>
    document.getElementById('new-project-form').classList.toggle('hidden'));
  document.getElementById('cancel-project-btn')?.addEventListener('click', () =>
    document.getElementById('new-project-form').classList.add('hidden'));
  document.getElementById('save-project-btn')?.addEventListener('click', async () => {
    const title  = document.getElementById('proj-title').value.trim();
    if (!title) return;
    await api('POST', '/projects', {
      title,
      client: document.getElementById('proj-client').value.trim(),
      color:  document.getElementById('proj-color').value,
      status: document.getElementById('proj-status').value,
    });
    ['proj-title','proj-client'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('new-project-form').classList.add('hidden');
    await loadProjects();
  });

  // Back button
  document.getElementById('proj-back-btn')?.addEventListener('click', () => {
    document.getElementById('view-project-detail').classList.remove('active');
    document.getElementById('view-projects').classList.add('active');
    loadProjects();
  });

  // Color picker sync
  document.getElementById('proj-ws-color')?.addEventListener('input', async e => {
    document.getElementById('proj-ws-color-dot').style.background = e.target.value;
    await api('PATCH', `/projects/${currentProjectId}`, { color: e.target.value });
  });

  // Inline field autosave
  ['proj-ws-title','proj-ws-client','proj-ws-status'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', async () => {
      const key = id === 'proj-ws-title' ? 'title' : id === 'proj-ws-client' ? 'client' : 'status';
      await api('PATCH', `/projects/${currentProjectId}`, { [key]: el.value });
    });
  });

  document.getElementById('proj-ws-desc')?.addEventListener('blur', async () => {
    await api('PATCH', `/projects/${currentProjectId}`, { description: document.getElementById('proj-ws-desc').value });
  });

  // Save notes
  document.getElementById('proj-ws-save-notes')?.addEventListener('click', async () => {
    await api('PATCH', `/projects/${currentProjectId}`, { notes: document.getElementById('proj-ws-notes').value });
    const ind = document.getElementById('proj-ws-saved');
    ind.classList.remove('hidden');
    setTimeout(() => ind.classList.add('hidden'), 2000);
  });

  // Add task
  document.getElementById('proj-ws-add-task')?.addEventListener('click', addProjectTask);
  document.getElementById('proj-ws-new-task')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') addProjectTask();
  });

  // Add link
  document.getElementById('proj-ws-add-link')?.addEventListener('click', async () => {
    const label = document.getElementById('proj-ws-link-label').value.trim();
    const url   = document.getElementById('proj-ws-link-url').value.trim();
    if (!url) return;
    await api('POST', `/projects/${currentProjectId}/link`, { label, url });
    document.getElementById('proj-ws-link-label').value = '';
    document.getElementById('proj-ws-link-url').value   = '';
    projectsData = await api('GET', '/projects');
    renderProjectLinks(projectsData.find(p => p.id === currentProjectId)?.links || []);
  });

  // Delete project
  document.getElementById('proj-ws-delete')?.addEventListener('click', async () => {
    if (!confirm('Eliminare questo progetto?')) return;
    await api('DELETE', `/projects/${currentProjectId}`);
    document.getElementById('view-project-detail').classList.remove('active');
    document.getElementById('view-projects').classList.add('active');
    await loadProjects();
  });

  // "Promuovi a Progetto" from item panel
  document.getElementById('panel-promote-btn')?.addEventListener('click', async () => {
    if (!activePanel) return;
    const { item } = activePanel;
    await api('POST', '/projects', {
      title:      item.title || item.summary || 'Progetto senza titolo',
      fromItemId: item.id,
      client:     '',
      color:      '#7c6af7',
      status:     'active',
    });
    closePanel();
    // Switch to Progetti tab
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelector('.tab[data-view="projects"]').classList.add('active');
    document.getElementById('view-projects').classList.add('active');
    await loadProjects();
  });
}

async function addProjectTask() {
  const input = document.getElementById('proj-ws-new-task');
  const text  = input.value.trim();
  if (!text) return;
  const res = await api('POST', `/projects/${currentProjectId}/task`, { text });
  const proj = projectsData.find(p => p.id === currentProjectId);
  if (proj) proj.tasks.push(res.task);
  renderProjectTasks(proj?.tasks || []);
  input.value = '';
}

/* ══════════════════════════════════════════════════════════════════════════════
   PIPELINE
══════════════════════════════════════════════════════════════════════════════ */

let pipelineData          = { deals: [], invoices: [], targets: {} };
let revenueChart          = null;
let funnelChart           = null;
let annualChart           = null;
let monthlyChart          = null;
let clientsChart          = null;
let invFilterOutstanding  = false;

async function loadPipeline() {
  pipelineData = await api('GET', '/pipeline');
  renderAnnualKPIs();
  renderQuarterlyKPIs();
  renderKanban();
  renderInvoices();
  renderCharts();
  renderTargetCard();
}

// ── Analytics helpers ──────────────────────────────────────────────────────

function computeYearStats(invoices) {
  const stats = {};
  (invoices || []).forEach(inv => {
    const year = (inv.date || '').slice(0, 4);
    if (!year || year.length !== 4) return;
    if (!stats[year]) stats[year] = { count: 0, imponibile: 0, totale: 0, outstanding: 0, months: {} };
    stats[year].count++;
    stats[year].imponibile  += Number(inv.amount)  || 0;
    stats[year].totale      += Number(inv.total)   || 0;
    stats[year].outstanding += Number(inv.balance) || 0;
    const month = (inv.date || '').slice(5, 7);
    if (month) stats[year].months[month] = (stats[year].months[month] || 0) + (Number(inv.amount) || 0);
  });
  Object.values(stats).forEach(s => {
    s.imponibile  = Math.round(s.imponibile);
    s.totale      = Math.round(s.totale);
    s.outstanding = Math.round(s.outstanding);
    Object.keys(s.months).forEach(m => { s.months[m] = Math.round(s.months[m]); });
  });
  return stats;
}

function computeClientStats(invoices, yearFilter) {
  const filtered = yearFilter ? (invoices || []).filter(i => (i.date || '').startsWith(yearFilter)) : (invoices || []);
  const stats = {};
  filtered.forEach(inv => {
    const client = (inv.client || 'Sconosciuto').trim();
    if (!stats[client]) stats[client] = { count: 0, imponibile: 0 };
    stats[client].count++;
    stats[client].imponibile += Number(inv.amount) || 0;
  });
  return Object.entries(stats)
    .sort((a, b) => b[1].imponibile - a[1].imponibile)
    .slice(0, 10)
    .map(([client, data]) => ({ client, count: data.count, imponibile: Math.round(data.imponibile) }));
}

// ── Quarterly Stats ─────────────────────────────────────────────────────────

function computeQuarterStats(invoices) {
  const qMonths = { Q1: ['01','02','03'], Q2: ['04','05','06'], Q3: ['07','08','09'], Q4: ['10','11','12'] };
  const stats = {};
  (invoices || []).forEach(inv => {
    const year  = (inv.date || '').slice(0, 4);
    const month = (inv.date || '').slice(5, 7);
    if (!year || year.length !== 4 || !month) return;
    if (!stats[year]) stats[year] = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
    const q = Object.entries(qMonths).find(([, months]) => months.includes(month));
    if (q) stats[year][q[0]] += Number(inv.amount) || 0;
  });
  Object.values(stats).forEach(y => {
    Object.keys(y).forEach(q => { y[q] = Math.round(y[q]); });
  });
  return stats;
}

function renderQuarterlyKPIs() {
  const row = document.getElementById('pipeline-quarterly-row');
  if (!row) return;
  const invoices = pipelineData.invoices || [];
  if (invoices.length === 0) { row.innerHTML = ''; return; }

  const qStats  = computeQuarterStats(invoices);
  const years   = Object.keys(qStats).sort();
  if (years.length < 1) { row.innerHTML = ''; return; }

  const currentYear  = years[years.length - 1];
  const prevYear     = years.length > 1 ? years[years.length - 2] : null;
  const curr         = qStats[currentYear] || {};
  const prev         = prevYear ? qStats[prevYear] : null;

  const currentQ     = 'Q' + Math.ceil((new Date().getMonth() + 1) / 3);
  const quarters     = ['Q1', 'Q2', 'Q3', 'Q4'];
  const qOrder       = { Q1: 0, Q2: 1, Q3: 2, Q4: 3 };
  const currQIdx     = qOrder[currentQ];

  const fmt = n => n >= 1000 ? (n / 1000).toFixed(1) + 'K' : Math.round(n).toLocaleString('it-IT');
  const ratingInfo = pct => {
    if (pct === null) return { emoji: '—',  label: 'N/D',        cls: 'neutral' };
    if (pct >= 25)   return { emoji: '🚀', label: 'Eccellente',  cls: 'pos' };
    if (pct >= 8)    return { emoji: '📈', label: 'In crescita', cls: 'pos' };
    if (pct >= 0)    return { emoji: '→',  label: 'Stabile',     cls: 'neutral' };
    if (pct >= -8)   return { emoji: '📉', label: 'Lieve calo',  cls: 'neg' };
    return                 { emoji: '🔴', label: 'In calo',     cls: 'neg' };
  };

  let html = `<div class="qkpi-header">
    <span class="qkpi-title">📅 Confronto trimestrale · ${currentYear} vs ${prevYear || '—'}</span>
  </div><div class="qkpi-cols">`;

  quarters.forEach(q => {
    const qIdx    = qOrder[q];
    const isCurrQ = q === currentQ;
    const isFuture = qIdx > currQIdx;
    const currVal = curr[q] || 0;
    const prevVal = prev ? (prev[q] || 0) : null;
    const pct     = (prevVal !== null && prevVal > 0) ? ((currVal - prevVal) / prevVal * 100) : null;
    const r       = ratingInfo(isFuture ? null : pct);

    // Build prev-year quarter bar (for visual progress comparison)
    const maxVal = Math.max(currVal, prevVal || 0, 1);
    const currPct = Math.round((currVal / maxVal) * 100);
    const prevPct = prev ? Math.round(((prevVal || 0) / maxVal) * 100) : 0;

    html += `<div class="qkpi-col${isCurrQ ? ' qkpi-current' : ''}${isFuture ? ' qkpi-future' : ''}">
      <div class="qkpi-qlabel">${q}${isCurrQ ? ' <span class="qkpi-now-badge">in corso</span>' : ''}</div>
      <div class="qkpi-val${isFuture ? ' qkpi-val-future' : ''}">€ ${isFuture ? '—' : fmt(currVal)}</div>
      ${prevVal !== null ? `<div class="qkpi-prev">${prevYear}: € ${fmt(prevVal)}</div>` : ''}
      ${!isFuture && pct !== null
        ? `<div class="qkpi-pct ${r.cls}">${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%</div>`
        : `<div class="qkpi-pct neutral">—</div>`}
      <div class="qkpi-rating">${r.emoji} <span class="${r.cls}">${r.label}</span></div>
      ${!isFuture ? `
      <div class="qkpi-bars">
        <div class="qkpi-bar-row">
          <span class="qkpi-bar-lbl">${currentYear}</span>
          <div class="qkpi-bar-track"><div class="qkpi-bar-fill curr" style="width:${currPct}%"></div></div>
        </div>
        ${prevVal !== null ? `<div class="qkpi-bar-row">
          <span class="qkpi-bar-lbl">${prevYear}</span>
          <div class="qkpi-bar-track"><div class="qkpi-bar-fill prev" style="width:${prevPct}%"></div></div>
        </div>` : ''}
      </div>` : ''}
    </div>`;
  });
  html += `</div>`;

  // YTD summary row
  const completedQs  = quarters.filter(q => qOrder[q] <= currQIdx);
  const ytdCurr      = completedQs.reduce((s, q) => s + (curr[q] || 0), 0);
  const ytdPrev      = prev ? completedQs.reduce((s, q) => s + (prev[q] || 0), 0) : null;
  const ytdPct       = ytdPrev > 0 ? ((ytdCurr - ytdPrev) / ytdPrev * 100) : null;
  const ytdR         = ratingInfo(ytdPct);
  const fullYearPrev = prev ? quarters.reduce((s, q) => s + (prev[q] || 0), 0) : null;
  const runRate      = completedQs.length > 0 ? Math.round((ytdCurr / completedQs.length) * 4) : 0;

  html += `<div class="qkpi-ytd">
    <div class="qkpi-ytd-left">
      <span class="qkpi-ytd-label">📊 YTD ${currentYear} (${completedQs.join('+')})</span>
      <span class="qkpi-ytd-val">€ ${fmt(ytdCurr)}</span>
      ${ytdPct !== null
        ? `<span class="qkpi-ytd-pct ${ytdR.cls}">${ytdPct >= 0 ? '▲' : '▼'} ${Math.abs(ytdPct).toFixed(1)}% vs ${prevYear}</span>`
        : ''}
      <span class="qkpi-ytd-rating">${ytdR.emoji} ${ytdR.label}</span>
    </div>
    <div class="qkpi-ytd-right">
      <span class="qkpi-runrate-label">📈 Run-rate annuale</span>
      <span class="qkpi-runrate-val">€ ${fmt(runRate)}</span>
      ${fullYearPrev !== null ? `<span class="qkpi-runrate-prev">Anno completo ${prevYear}: € ${fmt(fullYearPrev)}</span>` : ''}
    </div>
  </div>`;

  row.innerHTML = html;

  // ── Click handlers: each Q card → show full year-by-year comparison panel
  row.querySelectorAll('.qkpi-col:not(.qkpi-future)').forEach((card, idx) => {
    const q = quarters[idx];
    card.style.cursor = 'pointer';
    card.title = `Clicca per confronto storico ${q}`;
    card.addEventListener('click', () => {
      // Remove existing open panels
      row.querySelectorAll('.qkpi-compare-panel').forEach(p => p.remove());
      const existing = card.dataset.open === '1';
      row.querySelectorAll('.qkpi-col').forEach(c => { c.dataset.open = ''; c.style.background = ''; });
      if (existing) return; // toggle off
      card.dataset.open = '1';
      card.style.background = 'rgba(124,106,247,0.1)';

      // Build full historical table for this Q
      const panel = document.createElement('div');
      panel.className = 'qkpi-compare-panel';
      const allYears = Object.keys(qStats).sort();
      let tableHtml = `<div class="qcp-title">📊 Storico ${q} — tutti gli anni</div>
        <table class="qcp-table">
          <thead><tr><th>Anno</th><th>Importo</th><th>vs anno prec.</th><th>Rating</th></tr></thead>
          <tbody>`;
      allYears.forEach((yr, i) => {
        const val  = Math.round(qStats[yr][q] || 0);
        const prev2 = i > 0 ? Math.round(qStats[allYears[i-1]][q] || 0) : null;
        const pct  = prev2 > 0 ? ((val - prev2) / prev2 * 100) : null;
        const r    = pct === null ? { emoji: '—', cls: 'neutral' }
          : pct >= 25 ? { emoji: '🚀', cls: 'pos' } : pct >= 8 ? { emoji: '📈', cls: 'pos' }
          : pct >= 0  ? { emoji: '→',  cls: 'neutral' } : pct >= -8 ? { emoji: '📉', cls: 'neg' }
          : { emoji: '🔴', cls: 'neg' };
        const isCurr = yr === currentYear;
        tableHtml += `<tr class="${isCurr ? 'qcp-current-row' : ''}">
          <td>${yr}${isCurr ? ' <span class="qkpi-now-badge">ora</span>' : ''}</td>
          <td class="qcp-val">€ ${val >= 1000 ? (val/1000).toFixed(1) + 'K' : val.toLocaleString('it-IT')}</td>
          <td class="qcp-pct ${r.cls}">${pct !== null ? (pct >= 0 ? '▲' : '▼') + ' ' + Math.abs(pct).toFixed(1) + '%' : '—'}</td>
          <td>${r.emoji}</td>
        </tr>`;
      });
      tableHtml += `</tbody></table>
        <button class="btn-ghost btn-sm qcp-close" style="margin-top:8px">✕ Chiudi</button>`;
      panel.innerHTML = tableHtml;

      // Insert panel after the qkpi-cols div
      const colsDiv = row.querySelector('.qkpi-cols');
      colsDiv.insertAdjacentElement('afterend', panel);
      panel.querySelector('.qcp-close')?.addEventListener('click', () => {
        panel.remove();
        card.dataset.open = '';
        card.style.background = '';
      });

      // Also: filter invoice list by this quarter + current year
      invFilterOutstanding = false;
      const select = document.getElementById('inv-filter-year');
      if (select) select.value = currentYear;
      const qMonths2 = { Q1: ['01','02','03'], Q2: ['04','05','06'], Q3: ['07','08','09'], Q4: ['10','11','12'] };
      // Store quarter filter
      window._invFilterQ = q;
      renderInvoicesWithQFilter(q, currentYear);
    });
  });
}

function renderInvoicesWithQFilter(q, year) {
  const qMonths = { Q1: ['01','02','03'], Q2: ['04','05','06'], Q3: ['07','08','09'], Q4: ['10','11','12'] };
  const months  = qMonths[q] || [];
  const allInv  = pipelineData.invoices || [];
  const baseList = year ? allInv.filter(i => (i.date || '').startsWith(year)) : allInv;
  const invoices = baseList.filter(i => months.includes((i.date || '').slice(5, 7)));

  const list    = document.getElementById('invoices-list');
  const countEl = document.getElementById('invoice-count');
  if (!list) return;
  if (countEl) countEl.textContent = invoices.length;

  const existingBadge = document.getElementById('inv-filter-badge');
  if (existingBadge) existingBadge.remove();
  const badge = document.createElement('div');
  badge.id = 'inv-filter-badge';
  badge.className = 'inv-filter-badge';
  badge.innerHTML = `<span>📅 Filtro: ${q} ${year} — ${invoices.length} fatture</span>
    <button class="btn-ghost btn-sm" id="clear-inv-filter">✕ Rimuovi filtro</button>`;
  list.parentNode.insertBefore(badge, list);
  document.getElementById('clear-inv-filter')?.addEventListener('click', () => {
    window._invFilterQ = null;
    renderInvoices();
  });

  list.innerHTML = '';
  const sorted = [...invoices].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  sorted.forEach(inv => {
    const row2 = document.createElement('div');
    const isPaid = inv.status === 'PAID';
    row2.className = 'invoice-row';
    row2.innerHTML = `
      <div class="inv-left">
        <span class="inv-number">${escHtml(inv.number || '')}</span>
        <span class="inv-client">${escHtml(inv.client || '')}</span>
        <span class="inv-date">${inv.date || ''}</span>
      </div>
      <div class="inv-right">
        <span class="inv-amount">€ ${Math.round(Number(inv.amount || 0)).toLocaleString('it-IT')}</span>
        ${Number(inv.balance) > 0 ? `<span class="inv-balance">⚠️ €${Math.round(inv.balance).toLocaleString('it-IT')}</span>` : ''}
        <span class="inv-status ${isPaid ? 'paid' : 'pending'}">${isPaid ? 'Pagata' : 'Da incassare'}</span>
      </div>`;
    list.appendChild(row2);
  });
  list.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── KPI Year Cards ─────────────────────────────────────────────────────────

function renderAnnualKPIs() {
  const row = document.getElementById('pipeline-kpi-row');
  if (!row) return;
  const stats  = computeYearStats(pipelineData.invoices || []);
  const years  = Object.keys(stats).sort();
  const values = years.map(y => stats[y].imponibile);
  const maxVal = Math.max(...values);
  row.innerHTML = '';

  years.forEach((year, i) => {
    const s    = stats[year];
    const prev = i > 0 ? stats[years[i - 1]] : null;
    const change = prev && prev.imponibile > 0
      ? ((s.imponibile - prev.imponibile) / prev.imponibile * 100) : null;

    const isBest    = s.imponibile === maxVal;
    const isCurrent = year === years[years.length - 1];
    const isPartial = isCurrent && s.count < 20;

    const changeStr  = change !== null ? `${change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}%` : '–';
    const changeClass = change === null ? 'neutral' : (change >= 0 ? 'pos' : 'neg');

    const card = document.createElement('div');
    card.className = `kpi-year-card${isBest ? ' best-year' : ''}${isCurrent ? ' current-year' : ''}`;
    card.innerHTML = `
      <div class="kpi-yr-year">${year}${isPartial ? ' <span class="ytd-badge">YTD</span>' : ''}</div>
      <div class="kpi-yr-value">€ ${(s.imponibile / 1000).toFixed(1)}K</div>
      <div class="kpi-yr-change ${changeClass}">${changeStr}${prev ? ` vs ${years[i-1]}` : ''}</div>
      <div class="kpi-yr-stats">${s.count} fatture${s.totale > s.imponibile ? ` · €${(s.totale/1000).toFixed(1)}K lordo` : ''}</div>
      ${s.outstanding > 0
        ? `<div class="kpi-yr-outstanding clickable-outstanding" data-filter-year="${year}" title="Clicca per filtrare le fatture insolute">⚠️ € ${s.outstanding.toLocaleString('it-IT')} insoluti →</div>`
        : `<div class="kpi-yr-ok">✅ Tutto incassato</div>`}
    `;
    row.appendChild(card);
  });

  // Click handlers for outstanding amounts in KPI cards
  row.querySelectorAll('.clickable-outstanding').forEach(el => {
    el.addEventListener('click', () => {
      const yr = el.dataset.filterYear;
      invFilterOutstanding = true;
      const select = document.getElementById('inv-filter-year');
      if (select && yr) select.value = yr;
      renderInvoices();
      renderRevenueChart();
      document.getElementById('invoices-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

const STAGES = ['prospect','proposta','negoziazione','chiuso'];
const STAGE_LABELS = { prospect: 'Prospect', proposta: 'Proposta', negoziazione: 'Negoziazione', chiuso: 'Chiuso 🎉' };

function renderKanban() {
  STAGES.forEach(stage => {
    const col = document.getElementById(`stage-${stage}`);
    if (!col) return;
    col.innerHTML = '';
    const deals = (pipelineData.deals || []).filter(d => d.stage === stage);
    if (deals.length === 0) {
      col.innerHTML = '<div class="kanban-empty">Vuoto</div>';
      return;
    }
    deals.forEach(deal => col.appendChild(buildDealCard(deal)));
  });
}

function buildDealCard(deal) {
  const card = document.createElement('div');
  card.className = 'deal-card';
  card.draggable = true;
  card.dataset.dealId = deal.id;
  card.innerHTML = `
    <div class="deal-title">${escHtml(deal.title)}</div>
    ${deal.client ? `<div class="deal-client">${escHtml(deal.client)}</div>` : ''}
    <div class="deal-footer">
      <span class="deal-value">€ ${Number(deal.value || 0).toLocaleString('it-IT')}</span>
      ${deal.probability ? `<span class="deal-prob">${deal.probability}%</span>` : ''}
      <button class="deal-del btn-ghost" data-del-deal="${deal.id}">✕</button>
    </div>
    ${deal.expectedClose ? `<div class="deal-date">Chiusura: ${deal.expectedClose}</div>` : ''}
  `;
  card.querySelector('[data-del-deal]')?.addEventListener('click', async e => {
    e.stopPropagation();
    await api('DELETE', `/pipeline/deal/${deal.id}`);
    await loadPipeline();
  });
  // Drag
  card.addEventListener('dragstart', e => {
    e.dataTransfer.setData('dealId', deal.id);
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));
  return card;
}

function setupKanbanDropZones() {
  document.querySelectorAll('.kanban-col-body').forEach(zone => {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', async e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const dealId = e.dataTransfer.getData('dealId');
      const stage  = zone.closest('.kanban-col').dataset.stage;
      if (dealId && stage) {
        await api('PATCH', `/pipeline/deal/${dealId}`, { stage });
        await loadPipeline();
      }
    });
  });
}

function renderInvoices() {
  const yearFilter = document.getElementById('inv-filter-year')?.value || '';
  const allInv     = pipelineData.invoices || [];
  const baseList   = yearFilter ? allInv.filter(i => (i.date || '').startsWith(yearFilter)) : allInv;

  // Summary stats always from full year list (not filtered by outstanding)
  const total       = baseList.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const paid        = baseList.filter(i => i.status === 'PAID').reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const outstanding = baseList.reduce((s, i) => s + (Number(i.balance) || 0), 0);
  const fmt = n => '€ ' + Math.round(n).toLocaleString('it-IT');

  const revTotal = document.getElementById('rev-total');
  const revPaid  = document.getElementById('rev-paid');
  const revOut   = document.getElementById('rev-outstanding');
  if (revTotal) revTotal.textContent = fmt(total);
  if (revPaid)  revPaid.textContent  = fmt(paid);
  if (revOut) {
    revOut.textContent = fmt(outstanding);
    revOut.closest('.rev-stat')?.classList.toggle('filter-active', invFilterOutstanding);
  }

  // Apply outstanding filter to the displayed list
  const invoices = invFilterOutstanding ? baseList.filter(i => Number(i.balance) > 0) : baseList;

  const list    = document.getElementById('invoices-list');
  const countEl = document.getElementById('invoice-count');
  if (!list) return;
  if (countEl) countEl.textContent = invoices.length;

  // Filter badge
  const existingBadge = document.getElementById('inv-filter-badge');
  if (existingBadge) existingBadge.remove();
  if (invFilterOutstanding) {
    const badge = document.createElement('div');
    badge.id = 'inv-filter-badge';
    badge.className = 'inv-filter-badge';
    badge.innerHTML = `<span>⚠️ Filtro attivo: Solo insoluti — ${invoices.length} fatture</span><button class="btn-ghost btn-sm" id="clear-inv-filter">✕ Rimuovi filtro</button>`;
    list.parentNode.insertBefore(badge, list);
    document.getElementById('clear-inv-filter')?.addEventListener('click', () => {
      invFilterOutstanding = false;
      renderInvoices();
    });
  }

  list.innerHTML = '';
  const sorted = [...invoices].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  sorted.slice(0, 100).forEach(inv => {
    const row = document.createElement('div');
    const isPaid = inv.status === 'PAID';
    row.className = 'invoice-row';
    row.innerHTML = `
      <div class="inv-left">
        <span class="inv-number">${escHtml(inv.number || '')}</span>
        <span class="inv-client">${escHtml(inv.client || '')}</span>
        <span class="inv-date">${inv.date || ''}</span>
      </div>
      <div class="inv-right">
        <span class="inv-amount">€ ${Math.round(Number(inv.amount || 0)).toLocaleString('it-IT')}</span>
        ${Number(inv.balance) > 0 ? `<span class="inv-balance">⚠️ €${Math.round(inv.balance).toLocaleString('it-IT')}</span>` : ''}
        <span class="inv-status ${isPaid ? 'paid' : 'pending'}">${isPaid ? 'Pagata' : 'Da incassare'}</span>
      </div>
    `;
    list.appendChild(row);
  });
  if (sorted.length > 100) {
    const note = document.createElement('div');
    note.className = 'inv-more';
    note.textContent = `+ altre ${sorted.length - 100} fatture — usa il filtro anno per restringere`;
    list.appendChild(note);
  }
}

function renderCharts() {
  renderAnnualChart();
  renderMonthlyChart();
  renderClientsChart();
  renderRevenueChart();
  renderFunnelChart();
}

// ── Annual Trend Bar Chart ─────────────────────────────────────────────────

function renderAnnualChart() {
  const ctx = document.getElementById('chart-annual');
  if (!ctx) return;
  const stats  = computeYearStats(pipelineData.invoices || []);
  const years  = Object.keys(stats).sort();
  const values = years.map(y => stats[y].imponibile);
  const outs   = years.map(y => stats[y].outstanding);
  const maxVal = Math.max(...values);
  const colors = values.map(v => v === maxVal ? 'rgba(34,197,94,0.75)' : 'rgba(124,106,247,0.70)');
  const labels = years.map(y => stats[y].count < 20 ? y + ' YTD' : y);

  if (annualChart) annualChart.destroy();
  annualChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Imponibile', data: values, backgroundColor: colors, borderRadius: 8 },
        { label: 'Insoluti',   data: outs,   backgroundColor: 'rgba(245,158,11,0.55)', borderRadius: 8 }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#f0f0f2', font: { size: 11 } } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: € ${c.parsed.y.toLocaleString('it-IT')}` } }
      },
      scales: {
        x: { ticks: { color: '#f0f0f2' }, grid: { color: '#2e2e32' } },
        y: { ticks: { color: '#888890', callback: v => '€' + (v / 1000).toFixed(0) + 'K' }, grid: { color: '#2e2e32' } }
      }
    }
  });
}

// ── Monthly Comparison Line Chart ─────────────────────────────────────────

function renderMonthlyChart() {
  const ctx = document.getElementById('chart-monthly');
  if (!ctx) return;
  const stats  = computeYearStats(pipelineData.invoices || []);
  const years  = Object.keys(stats).sort().slice(-4); // last 4 years
  const months = ['01','02','03','04','05','06','07','08','09','10','11','12'];
  const mLabels = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

  const palette = {
    '2022': { c: 'rgba(136,136,144,0.65)',  w: 1.5, dash: [8, 4] },
    '2023': { c: 'rgba(59,130,246,0.80)',   w: 2,   dash: [6, 3] },
    '2024': { c: 'rgba(168,85,247,0.80)',   w: 2,   dash: [4, 2] },
    '2025': { c: 'rgba(124,106,247,1)',     w: 2.5, dash: [] },
    '2026': { c: 'rgba(245,158,11,1)',      w: 2.5, dash: [2, 2] }
  };

  const datasets = years.map(yr => {
    const p = palette[yr] || { c: 'rgba(200,200,200,0.6)', w: 1.5, dash: [] };
    return {
      label: yr,
      data: months.map(m => stats[yr]?.months[m] || 0),
      borderColor: p.c,
      backgroundColor: p.c.replace(/[\d.]+\)$/, '0.08)'),
      borderWidth: p.w,
      borderDash: p.dash,
      tension: 0.4,
      fill: false,
      pointRadius: 3
    };
  });

  if (monthlyChart) monthlyChart.destroy();
  monthlyChart = new Chart(ctx, {
    type: 'line',
    data: { labels: mLabels, datasets },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#f0f0f2', font: { size: 11 } } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: € ${c.parsed.y.toLocaleString('it-IT')}` } }
      },
      scales: {
        x: { ticks: { color: '#888890' }, grid: { color: '#2e2e32' } },
        y: { ticks: { color: '#888890', callback: v => '€' + (v / 1000).toFixed(0) + 'K' }, grid: { color: '#2e2e32' } }
      }
    }
  });
}

// ── Top Clients Horizontal Bar ─────────────────────────────────────────────

function renderClientsChart() {
  const ctx = document.getElementById('chart-clients');
  if (!ctx) return;
  const clients = computeClientStats(pipelineData.invoices || [], '');
  const colors  = clients.map((_, i) => `rgba(124,106,247,${1 - i * 0.07})`);
  const labels  = clients.map(c => c.client.length > 32 ? c.client.slice(0, 30) + '…' : c.client);

  if (clientsChart) clientsChart.destroy();
  clientsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Imponibile totale', data: clients.map(c => c.imponibile), backgroundColor: colors, borderRadius: 6 }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => `€ ${c.parsed.x.toLocaleString('it-IT')} (${clients[c.dataIndex].count} fatt.)` } }
      },
      scales: {
        x: { ticks: { color: '#888890', callback: v => '€' + (v / 1000).toFixed(0) + 'K' }, grid: { color: '#2e2e32' } },
        y: { ticks: { color: '#f0f0f2', font: { size: 11 } }, grid: { display: false } }
      }
    }
  });
}

// ── Target Card ────────────────────────────────────────────────────────────

function renderTargetCard() {
  const area      = document.getElementById('target-progress-area');
  const yearSel   = document.getElementById('target-year');
  const amtInput  = document.getElementById('target-amount');
  if (!area || !yearSel) return;

  const stats   = computeYearStats(pipelineData.invoices || []);
  const targets = pipelineData.targets || {};
  const years   = Object.keys(stats).sort().reverse();

  // Populate year select
  yearSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
  const sel = yearSel.value || years[0];
  if (amtInput && targets[sel]) amtInput.value = targets[sel];

  yearSel.onchange = () => {
    const y = yearSel.value;
    if (amtInput) amtInput.value = targets[y] || '';
    _renderTargetBars(area, stats, targets, years);
  };

  _renderTargetBars(area, stats, targets, years);
}

function _renderTargetBars(area, stats, targets, years) {
  const withTarget = years.filter(y => targets[y]);
  if (withTarget.length === 0) {
    area.innerHTML = '<div class="target-hint">Imposta un target per visualizzare il progresso 👆</div>';
    return;
  }
  area.innerHTML = withTarget.slice(0, 5).map(year => {
    const actual  = stats[year]?.imponibile || 0;
    const target  = targets[year];
    const pct     = Math.min(Math.round(actual / target * 100), 100);
    const overflow = Math.round(actual / target * 100);
    const barColor = overflow >= 100 ? '#22c55e' : overflow >= 70 ? '#f59e0b' : '#ef4444';
    return `
      <div class="target-progress-block">
        <div class="target-progress-year">${year} ${overflow >= 100 ? '🎉 Target raggiunto!' : `— ${overflow}%`}</div>
        <div class="target-progress-bar-outer">
          <div class="target-progress-bar-inner" style="width:${pct}%;background:${barColor}"></div>
        </div>
        <div class="target-progress-pct">€ ${actual.toLocaleString('it-IT')} / € ${Number(target).toLocaleString('it-IT')}</div>
      </div>`;
  }).join('');
}

// ── Revenue (monthly, year-filtered) ──────────────────────────────────────

function renderRevenueChart() {
  const ctx = document.getElementById('chart-revenue');
  if (!ctx) return;

  const yearFilter = document.getElementById('inv-filter-year')?.value || '';
  const allInv     = pipelineData.invoices || [];
  const src        = yearFilter ? allInv.filter(i => (i.date || '').startsWith(yearFilter)) : allInv;

  let months;
  if (yearFilter) {
    months = ['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => `${yearFilter}-${m}`);
    const title = document.getElementById('rev-chart-title');
    if (title) title.textContent = `Fatturato mensile ${yearFilter}`;
  } else {
    months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(d.toISOString().slice(0, 7));
    }
    const title = document.getElementById('rev-chart-title');
    if (title) title.textContent = 'Fatturato mensile (ultimi 12 mesi)';
  }

  const emitted   = months.map(m => src.filter(i => (i.date||'').startsWith(m)).reduce((s,i) => s + (Number(i.amount)||0), 0));
  const collected = months.map(m => src.filter(i => (i.date||'').startsWith(m) && i.status==='PAID').reduce((s,i) => s + (Number(i.amount)||0), 0));
  const labels    = months.map(m => { const [y,mo] = m.split('-'); return new Date(+y,+mo-1,1).toLocaleDateString('it-IT',{month:'short',year:'2-digit'}); });

  if (revenueChart) revenueChart.destroy();
  revenueChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Fatturato',  data: emitted,   backgroundColor: 'rgba(96,165,250,0.70)', borderRadius: 6 },
        { label: 'Incassato',  data: collected, backgroundColor: 'rgba(52,211,153,0.70)', borderRadius: 6 }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#f0f0f2', font: { size: 11 } } },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: € ${c.parsed.y.toLocaleString('it-IT')}` } }
      },
      scales: {
        x: { ticks: { color: '#888890' }, grid: { color: '#2e2e32' } },
        y: { ticks: { color: '#888890', callback: v => '€' + v.toLocaleString('it-IT') }, grid: { color: '#2e2e32' } }
      }
    }
  });
}

function renderFunnelChart() {
  const ctx = document.getElementById('chart-funnel');
  if (!ctx) return;
  const deals  = pipelineData.deals || [];
  const values = STAGES.map(s => deals.filter(d => d.stage === s).reduce((sum, d) => sum + (Number(d.value)||0), 0));
  const colors = ['rgba(107,114,128,0.7)','rgba(251,191,36,0.7)','rgba(251,146,60,0.7)','rgba(52,211,153,0.7)'];

  if (funnelChart) funnelChart.destroy();
  funnelChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: STAGES.map(s => STAGE_LABELS[s]),
      datasets: [{ data: values, backgroundColor: colors, borderRadius: 6 }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#888890', callback: v => '€' + v.toLocaleString('it-IT') }, grid: { color: '#2e2e32' } },
        y: { ticks: { color: '#f0f0f2' }, grid: { color: '#2e2e32' } }
      }
    }
  });
}

// ── CSV Parser (Xero format) ────────────────────────────────────────────────

function parseXeroCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
  const idx = h => headers.findIndex(x => x.toLowerCase().includes(h.toLowerCase()));

  const iContactName    = idx('ContactName');
  const iInvoiceNumber  = idx('InvoiceNumber');
  const iInvoiceDate    = idx('InvoiceDate');
  const iDueDate        = idx('DueDate');
  const iInvoiceAmount  = idx('InvoiceAmount');
  const iBalance        = idx('Balance');
  const iStatus         = idx('Status');

  const invoices = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());
    const number = cells[iInvoiceNumber];
    const status = cells[iStatus];
    if (!number || !status || status === 'VOIDED' || status === 'DRAFT') continue;
    invoices.push({
      number,
      client:  cells[iContactName]  || '',
      date:    cells[iInvoiceDate]   || '',
      dueDate: cells[iDueDate]       || '',
      amount:  parseFloat(cells[iInvoiceAmount]) || 0,
      balance: parseFloat(cells[iBalance])       || 0,
      status
    });
  }
  return invoices;
}

function setupPipeline() {
  // Add deal
  document.getElementById('add-deal-btn')?.addEventListener('click', () =>
    document.getElementById('add-deal-form').classList.toggle('hidden'));
  document.getElementById('cancel-deal-btn')?.addEventListener('click', () =>
    document.getElementById('add-deal-form').classList.add('hidden'));
  document.getElementById('save-deal-btn')?.addEventListener('click', async () => {
    const title = document.getElementById('deal-title').value.trim();
    if (!title) return;
    await api('POST', '/pipeline/deal', {
      title,
      client:        document.getElementById('deal-client').value.trim(),
      value:         parseFloat(document.getElementById('deal-value').value) || 0,
      stage:         document.getElementById('deal-stage').value,
      probability:   parseInt(document.getElementById('deal-probability').value) || 50,
      expectedClose: document.getElementById('deal-close').value,
    });
    ['deal-title','deal-client','deal-value','deal-probability','deal-close'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('add-deal-form').classList.add('hidden');
    await loadPipeline();
  });

  // CSV import
  document.getElementById('csv-import')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const invoices = parseXeroCSV(text);
    if (invoices.length === 0) { alert('Nessuna fattura trovata nel CSV. Verifica il formato Xero.'); return; }
    await api('POST', '/pipeline/invoices', invoices);
    e.target.value = '';
    await loadPipeline();
  });

  // Year filter → refresh invoice list + monthly chart
  document.getElementById('inv-filter-year')?.addEventListener('change', () => {
    renderInvoices();
    renderRevenueChart();
  });

  // "Da incassare" stat card → toggle outstanding filter
  document.getElementById('rev-outstanding')?.closest('.rev-stat')?.addEventListener('click', () => {
    invFilterOutstanding = !invFilterOutstanding;
    renderInvoices();
    if (invFilterOutstanding) {
      document.getElementById('invoices-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  // Target save
  document.getElementById('target-save-btn')?.addEventListener('click', async () => {
    const year   = document.getElementById('target-year')?.value;
    const amount = parseFloat(document.getElementById('target-amount')?.value);
    if (!year || !amount || amount <= 0) return;
    await api('POST', '/pipeline/target', { year, amount });
    await loadPipeline();
  });

  setupKanbanDropZones();
}

/* ══════════════════════════════════════════════════════════════════════════════
   GROWTH BRIEF
══════════════════════════════════════════════════════════════════════════════ */

// Growth brief is rendered inside renderInsights() — see above
// The brief is stored in dayData.insights.growthBrief

/* ══════════════════════════════════════════════════════════════════════════════
   MINI CLAUDE ASSISTANT
══════════════════════════════════════════════════════════════════════════════ */

let chatOpen       = false;
let chatHistory    = []; // { role: 'user'|'assistant', content: string }[]
let chatConfigured = false;

// ── Init ───────────────────────────────────────────────────────────────────

async function initAiAssistant() {
  // Wire buttons
  document.getElementById('ai-chat-btn')?.addEventListener('click', toggleAiPanel);
  document.getElementById('ai-panel-close')?.addEventListener('click', closeAiPanel);
  document.getElementById('ai-settings-btn')?.addEventListener('click', showAiSettings);
  document.getElementById('ai-settings-cancel')?.addEventListener('click', hideAiSettings);
  document.getElementById('ai-settings-save')?.addEventListener('click', saveAiSettings);
  document.getElementById('ai-send-btn')?.addEventListener('click', sendAiMessage);

  // Send on Enter (Shift+Enter = newline)
  document.getElementById('ai-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAiMessage(); }
  });

  // Auto-resize textarea
  document.getElementById('ai-input')?.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });

  // Quick suggestion chips
  document.querySelectorAll('.ai-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const msg = btn.dataset.msg;
      if (msg) {
        const input = document.getElementById('ai-input');
        if (input) { input.value = msg; input.focus(); }
        // Hide chips after one use
        document.getElementById('ai-chips')?.classList.add('hidden');
        sendAiMessage();
      }
    });
  });

  // Check config and show welcome message
  await checkAiConfig();
}

async function checkAiConfig() {
  try {
    const status = await api('GET', '/ai/status');
    chatConfigured = status.configured;
    if (!chatConfigured) {
      pushAssistantMsg('👋 Ciao Marco! Sono il tuo assistente AI integrato nella piattaforma.\n\nPer iniziare ho bisogno della tua **API key Anthropic**. Clicca su ⚙️ in alto a destra per configurarla.\n\nPuoi ottenerla gratuitamente su [console.anthropic.com](https://console.anthropic.com) → API Keys.');
    } else {
      pushAssistantMsg('👋 Ciao Marco! Sono pronto ad aiutarti.\n\nPosso **aggiungere e prioritizzare task**, **spostare elementi tra quadranti**, **aggiornare contatti**, **creare progetti e deal** — tutto direttamente nella piattaforma.\n\nCosa faccio per te?');
    }
  } catch(e) {
    pushAssistantMsg('⚠️ Impossibile connettersi al server. Assicurati che il Daily Tracker sia in esecuzione.');
  }
}

// ── Panel open/close ────────────────────────────────────────────────────────

function toggleAiPanel() {
  chatOpen ? closeAiPanel() : openAiPanel();
}

function openAiPanel() {
  chatOpen = true;
  document.getElementById('ai-panel')?.classList.add('open');
  document.getElementById('ai-chat-btn')?.classList.add('active');
  // Scroll to bottom of messages
  const msgs = document.getElementById('ai-messages');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
  document.getElementById('ai-input')?.focus();
}

function closeAiPanel() {
  chatOpen = false;
  document.getElementById('ai-panel')?.classList.remove('open');
  document.getElementById('ai-chat-btn')?.classList.remove('active');
}

// ── Settings ────────────────────────────────────────────────────────────────

function showAiSettings() {
  document.getElementById('ai-settings-overlay')?.classList.remove('hidden');
  document.getElementById('ai-apikey-input')?.focus();
}

function hideAiSettings() {
  document.getElementById('ai-settings-overlay')?.classList.add('hidden');
}

async function saveAiSettings() {
  const key = document.getElementById('ai-apikey-input')?.value?.trim();
  if (!key || !key.startsWith('sk-')) {
    alert('Inserisci una API key valida (inizia con sk-)');
    return;
  }
  try {
    await api('POST', '/ai/config', { apiKey: key });
    hideAiSettings();
    // Clear history and re-welcome
    chatHistory = [];
    document.getElementById('ai-messages').innerHTML = '';
    document.getElementById('ai-apikey-input').value = '';
    await checkAiConfig();
  } catch(e) {
    alert('Errore nel salvataggio. Riprova.');
  }
}

// ── Message rendering ────────────────────────────────────────────────────────

function pushAssistantMsg(text) {
  chatHistory.push({ role: 'assistant', content: text });
  renderChatMessages();
}

function renderChatMessages() {
  const container = document.getElementById('ai-messages');
  if (!container) return;

  container.innerHTML = chatHistory.map(m => {
    if (m.role === 'user') {
      return `<div class="ai-msg ai-msg-user">
        <div class="ai-bubble ai-bubble-user">${escHtml(m.content).replace(/\n/g, '<br>')}</div>
      </div>`;
    } else {
      // Markdown-lite: **bold**, newlines, [links](url)
      const html = escHtml(m.content)
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      return `<div class="ai-msg ai-msg-assistant">
        <div class="ai-avatar-dot">✨</div>
        <div class="ai-bubble ai-bubble-assistant">${html}</div>
      </div>`;
    }
  }).join('');

  container.scrollTop = container.scrollHeight;
}

function appendLoadingBubble() {
  const container = document.getElementById('ai-messages');
  if (!container) return null;
  const el = document.createElement('div');
  el.className = 'ai-msg ai-msg-assistant ai-msg-loading';
  el.id = 'ai-loading-bubble';
  el.innerHTML = `<div class="ai-avatar-dot">✨</div>
    <div class="ai-bubble ai-bubble-assistant">
      <span class="ai-dots"><span></span><span></span><span></span></span>
    </div>`;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}

// ── Send message ─────────────────────────────────────────────────────────────

async function sendAiMessage() {
  const input = document.getElementById('ai-input');
  const text = input?.value?.trim();
  if (!text) return;

  // Hide chips permanently once first message sent
  document.getElementById('ai-chips')?.classList.add('hidden');

  // Add to history and clear input
  chatHistory.push({ role: 'user', content: text });
  if (input) { input.value = ''; input.style.height = 'auto'; }
  renderChatMessages();

  // Show loading indicator
  const loadingEl = appendLoadingBubble();

  // Disable controls while waiting
  if (input) input.disabled = true;
  const sendBtn = document.getElementById('ai-send-btn');
  sendBtn?.setAttribute('disabled', '');

  try {
    // Build messages for API: all history EXCEPT the last user message
    // (it's added inline to the API call)
    const apiMessages = chatHistory.map(m => ({ role: m.role, content: m.content }));

    const result = await api('POST', '/ai/chat', {
      messages: apiMessages,
      date: currentDate
    });

    loadingEl?.remove();

    const reply = result.reply || result.error || 'Risposta non disponibile.';
    const prefix = result.error ? '⚠️ ' : '';
    pushAssistantMsg(prefix + reply);

    // Refresh the current view in case AI modified data
    if (!result.error) {
      await loadDay();
      // If in projects/pipeline tab, reload those too
      const activeTab = document.querySelector('.nav-tab.active')?.dataset?.view;
      if (activeTab === 'projects') loadProjects?.();
      if (activeTab === 'pipeline') loadPipeline?.();
    }

  } catch(e) {
    loadingEl?.remove();
    pushAssistantMsg('⚠️ Errore di connessione. Verifica che il server sia attivo e riprova.');
  } finally {
    if (input) input.disabled = false;
    sendBtn?.removeAttribute('disabled');
    input?.focus();
  }
}

/* ── TRANSFER TRACKING OVERLAY ─────────────────────────────────────────────── */
function openTrackingOverlay(tJson) {
  // Decode HTML entities injected during inline onclick attribute embedding
  if (typeof tJson === 'string') {
    tJson = tJson.replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }
  const t = typeof tJson === 'string' ? JSON.parse(tJson) : tJson;
  const overlay = document.getElementById('tracking-overlay');
  const body    = document.getElementById('tracking-modal-body');
  const typeIcon = t.type === 'flight' ? '✈️' : '🚄';

  document.getElementById('trk-type-icon').textContent = typeIcon;
  document.getElementById('trk-title').textContent = t.title || (t.type === 'flight' ? 'Volo' : 'Treno');
  document.getElementById('trk-subtitle').textContent = (t.time ? `Decollo: ${t.time}` : '') +
    (t.destination ? ` → ${t.destination}` : '');

  overlay.classList.remove('hidden');
  body.innerHTML = '<div class="trk-loading">⏳ Caricamento dati…</div>';

  // Load tracking data + Wolfe House route in parallel
  const trackingPromise = t.type === 'flight' && t.flightCode
    ? api('GET', `/track/flight/${t.flightCode.replace(/\s+/,'')}?date=${t.date || currentDate}`)
    : t.type === 'train' && t.flightCode
      ? api('GET', `/track/train/${t.flightCode}?country=${t.logistics?.country || 'IT'}`)
      : Promise.resolve(null);

  const routePromise = t.airport
    ? api('GET', `/home-location/wolfe-house/route/${t.airport}`)
    : Promise.resolve(null);

  Promise.all([trackingPromise, routePromise]).then(([tracking, route]) => {
    body.innerHTML = renderTrackingBody(t, tracking, route);
  }).catch(() => {
    body.innerHTML = renderTrackingBody(t, null, null);
  });
}

function closeTrackingOverlay() {
  document.getElementById('tracking-overlay').classList.add('hidden');
}

function renderTrackingBody(t, tracking, route) {
  let html = '';

  // ── LIVE STATUS ───────────────────────────────────────────────────────────
  html += `<div class="trk-section">`;
  html += `<div class="trk-section-title">📡 Stato in tempo reale</div>`;

  if (tracking?.status && tracking.source === 'aviationstack') {
    const statusLabels = { scheduled:'In orario', active:'In volo', landed:'Atterrato', cancelled:'Cancellato', diverted:'Dirottato' };
    const statusColors = { scheduled:'#60a5fa', active:'#34d399', landed:'#94a3b8', cancelled:'#f87171', diverted:'#fb923c' };
    const s = tracking.status;
    const dep = tracking.departure;
    const arr = tracking.arrival;
    html += `<div class="trk-status-badge" style="background:${statusColors[s]||'#6b7280'}22;border-color:${statusColors[s]||'#6b7280'};color:${statusColors[s]||'#6b7280'}">${statusLabels[s]||s.toUpperCase()}</div>`;
    if (dep?.delay > 0) html += `<div class="trk-alert">⚠️ Ritardo: ${dep.delay} minuti</div>`;
    const fmt = iso => iso ? new Date(iso).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}) : null;
    html += `<div class="trk-times-row">
      <div class="trk-time-block">
        <div class="trk-time-label">Partenza pianificata</div>
        <div class="trk-time-val">${fmt(dep?.scheduled)||'—'}</div>
        ${dep?.actual ? `<div class="trk-time-actual">Effettiva: ${fmt(dep.actual)}</div>` : ''}
        ${dep?.gate ? `<div class="trk-time-gate">Gate: <strong>${dep.gate}</strong>${dep.terminal ? ' · Terminal ' + dep.terminal : ''}</div>` : ''}
      </div>
      <div class="trk-time-arrow">→</div>
      <div class="trk-time-block">
        <div class="trk-time-label">Arrivo previsto</div>
        <div class="trk-time-val">${fmt(arr?.estimated||arr?.scheduled)||'—'}</div>
        ${arr?.delay > 0 ? `<div class="trk-time-actual">+${arr.delay} min</div>` : ''}
      </div>
    </div>`;
    html += `<div class="trk-links-row">
      <a href="${tracking.links.flightradar24}" target="_blank" class="trk-link trk-link-fr24">📍 FlightRadar24</a>
      <a href="${tracking.links.flightaware}" target="_blank" class="trk-link trk-link-fa">📊 FlightAware</a>
    </div>`;
  } else if (tracking?.source === 'opensky' && tracking.openSkyData) {
    const os = tracking.openSkyData;
    html += `<div class="trk-opensky">${os.onGround ? '🛫 A terra / in rullaggio' : '✈️ In volo'}</div>`;
    if (!os.onGround && os.altitude) html += `<div class="trk-opensky-detail">Quota: ${os.altitude} · Velocità: ${os.speed||'—'} · Direzione: ${os.heading||'—'}</div>`;
    html += `<div class="trk-links-row">
      <a href="${tracking.links.flightradar24}" target="_blank" class="trk-link trk-link-fr24">📍 FlightRadar24 live</a>
      <a href="${tracking.links.flightaware}" target="_blank" class="trk-link trk-link-fa">📊 FlightAware</a>
    </div>`;
    html += `<div class="trk-note">💡 Aggiungi <code>aviationstackKey</code> in config.json per dati completi (gate, ritardo, status)</div>`;
  } else if (tracking?.source === 'viaggiatreno' && tracking.trainNumber) {
    const delayColor = tracking.delay > 10 ? '#f87171' : tracking.delay > 0 ? '#fb923c' : '#34d399';
    html += `<div class="trk-train-status">
      <span class="trk-train-label">Treno ${tracking.trainNumber}</span>
      <span class="trk-delay-badge" style="color:${delayColor}">${tracking.delay > 0 ? '+' + tracking.delay + ' min' : 'In orario'}</span>
    </div>`;
    if (tracking.lastStation) html += `<div class="trk-last-pos">Ultima posizione: <strong>${tracking.lastStation}</strong></div>`;
    if (tracking.stops?.length) {
      const upcoming = tracking.stops.filter(s => !s.passed).slice(0,4);
      if (upcoming.length) {
        html += `<div class="trk-stops">`;
        upcoming.forEach(s => {
          const delay = s.delay > 0 ? `<span style="color:#fb923c"> +${s.delay}m</span>` : '';
          html += `<div class="trk-stop"><span class="trk-stop-name">${escHtml(s.name)}</span><span class="trk-stop-time">${s.scheduled||'—'}${delay}</span>${s.platform ? `<span class="trk-stop-plat">bin.${s.platform}</span>` : ''}</div>`;
        });
        html += `</div>`;
      }
    }
    html += `<div class="trk-links-row"><a href="${tracking.links.viaggiatreno}" target="_blank" class="trk-link">🚂 ViaggiaTreno</a></div>`;
  } else {
    // No API data — show direct links
    const isFlight = t.type === 'flight';
    const code = (t.flightCode||'').replace(/\s+/,'').toLowerCase();
    html += `<div class="trk-no-data">Dati live non disponibili${isFlight ? ' — usa i link qui sotto per tracciare il volo' : ''}</div>`;
    if (isFlight && code) {
      html += `<div class="trk-links-row">
        <a href="https://www.flightradar24.com/${code}" target="_blank" class="trk-link trk-link-fr24">📍 FlightRadar24</a>
        <a href="https://www.flightaware.com/live/flight/${code.toUpperCase()}" target="_blank" class="trk-link trk-link-fa">📊 FlightAware</a>
      </div>
      <div class="trk-note">💡 Aggiungi <code>aviationstackKey</code> in config.json per tracking automatico (gratis 100 req/mese)</div>`;
    }
  }
  html += `</div>`;

  // ── DEPARTURE LOGISTICS ───────────────────────────────────────────────────
  if (t.logistics) {
    const l = t.logistics;
    html += `<div class="trk-section">
      <div class="trk-section-title">🚪 Logistica partenza</div>
      <div class="trk-logistics-grid">
        <div class="trk-log-card trk-log-card-depart">
          <div class="trk-log-card-label">Parti da casa entro</div>
          <div class="trk-log-card-val">${escHtml(l.departBy)}</div>
        </div>
        <div class="trk-log-card">
          <div class="trk-log-card-label">In aeroporto entro</div>
          <div class="trk-log-card-val">${escHtml(l.arriveBy||'—')}</div>
        </div>
        <div class="trk-log-card trk-log-card-flight">
          <div class="trk-log-card-label">Decollo</div>
          <div class="trk-log-card-val">${escHtml(t.time||'—')}</div>
        </div>
      </div>
      ${l.tips?.length ? `<div class="trk-tips-list">${l.tips.map(tip=>`<div class="trk-tip">💡 ${escHtml(tip)}</div>`).join('')}</div>` : ''}
    </div>`;
  }

  // ── WOLFE HOUSE ROUTE ─────────────────────────────────────────────────────
  if (route?.available) {
    html += `<div class="trk-section">
      <div class="trk-section-title">🏠 Da Wolfe House → ${escHtml(route.airport?.toUpperCase()||'')}</div>
      <div class="trk-route-steps">
        ${route.steps.map(s => `
          <div class="trk-route-step">
            <span class="trk-step-icon">${s.icon}</span>
            <span class="trk-step-text">${escHtml(s.text)}</span>
          </div>`).join('')}
      </div>
      <div class="trk-route-summary">
        <span class="trk-route-time">⏱ ~${route.totalMin} min totali</span>
        <span class="trk-route-cost">${escHtml(route.cost)}</span>
      </div>
      ${route.tip ? `<div class="trk-route-tip">${escHtml(route.tip)}</div>` : ''}
      <div class="trk-booking-links">
        ${route.trainpalUrl ? `<a href="${route.trainpalUrl}" target="_blank" class="trk-link trk-link-tp">🎟 TrainPal (split-ticket)</a>` : ''}
        ${route.nationalExpressUrl ? `<a href="${route.nationalExpressUrl}" target="_blank" class="trk-link trk-link-ne">🚌 National Express</a>` : ''}
        ${route.rttUrl ? `<a href="${route.rttUrl}" target="_blank" class="trk-link trk-link-rtt">📋 Orari live (RTT)</a>` : ''}
      </div>
      ${route.alternatives?.length ? `
        <div class="trk-alternatives">
          <div class="trk-alt-title">Alternative:</div>
          ${route.alternatives.map(alt => `
            <div class="trk-alt-item">
              <div class="trk-alt-name">${escHtml(alt.name)}</div>
              <div class="trk-alt-desc">${escHtml(alt.desc)}</div>
              <div class="trk-alt-meta"><span>${escHtml(alt.cost)}</span><span>${escHtml(alt.time)}</span>${alt.url ? `<a href="${alt.url}" target="_blank" class="trk-link" style="font-size:11px">Apri ↗</a>` : ''}</div>
            </div>`).join('')}
        </div>` : ''}
    </div>`;
  } else if (t.logistics?.transport) {
    html += `<div class="trk-section">
      <div class="trk-section-title">🗺️ Come arrivare</div>
      <div class="trk-transport-text">${escHtml(t.logistics.transport)}</div>
    </div>`;
  }

  return html;
}

/* ── SYNC ALL — Gmail + Calendar + Briefing AI + full platform reload ─────────── */
async function syncAll() {
  const globalBtn   = document.getElementById('global-sync-btn');
  const briefingBtn = document.getElementById('briefing-sync-btn');

  // Show loading state
  if (globalBtn)   { globalBtn.classList.add('syncing'); globalBtn.disabled = true; }
  if (briefingBtn) { briefingBtn.disabled = true; briefingBtn.textContent = '⏳ Sincronizzo…'; }

  // Ensure briefing panel is open
  const bc = document.getElementById('briefing-content');
  const toggle = document.getElementById('briefing-toggle');
  if (bc?.classList.contains('hidden')) {
    bc.classList.remove('hidden');
    if (toggle) toggle.textContent = 'Nascondi';
  }

  let calNew = 0, gmailNew = 0;

  // Step 1: Gmail + Calendar sync
  try {
    const syncRes = await api('POST', `/google/sync?date=${currentDate}`);
    if (syncRes?.ok) {
      calNew   = syncRes.calendar?.count || 0;
      gmailNew = syncRes.gmail?.count    || 0;
    }
  } catch(e) { /* Google non connesso — skip */ }

  // Step 2: Force-regenerate briefing AI
  if (briefingBtn) briefingBtn.textContent = '⏳ AI…';
  try {
    await api('POST', `/day/${currentDate}/briefing/refresh`);
  } catch(e) {}

  // Step 3: Full day reload (picks up new calendar events + gmail tasks + fresh briefing)
  try {
    dayData = await api('GET', `/day/${currentDate}`);

    // Auto carry-forward if still empty after sync
    if (currentDate === todayStr() && dayData.tasks.length === 0 && dayData.events.length === 0) {
      const cf = await api('POST', `/auto-carry-forward/${currentDate}`);
      if (cf?.carried > 0) {
        dayData = await api('GET', `/day/${currentDate}`);
        showCarryForwardBanner(cf.carried, cf.fromDate);
      }
    }

    renderDay();
    updateNextEventBanner();
  } catch(e) {}

  // Reset UI
  const syncLabel = (calNew || gmailNew) ? `✓ 📆${calNew} · 📧${gmailNew}` : '✓ Aggiornato';
  if (globalBtn)   { globalBtn.classList.remove('syncing'); globalBtn.disabled = false; }
  if (briefingBtn) {
    briefingBtn.textContent = syncLabel;
    briefingBtn.disabled = false;
    setTimeout(() => { if (briefingBtn) briefingBtn.textContent = '🔄 Aggiorna'; }, 4000);
  }
}

function refreshBriefing() { return syncAll(); }

// Wire buttons
document.getElementById('briefing-sync-btn')?.addEventListener('click', syncAll);
