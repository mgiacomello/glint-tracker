/**
 * Kair.OS — Gmail bridge (Google Apps Script)
 *
 * Gira DENTRO il tuo account Google. Ogni ora:
 *   1. cerca le email di prenotazione/carta d'imbarco
 *   2. estrae numero volo + data (+ rotta e orario se presenti)
 *   3. salva l'elenco (solo questi dati, niente testo delle email)
 * L'orologio legge l'elenco da   <URL web app>?token=<TOKEN>
 *
 * Setup: vedi README.md in questa cartella.
 */

// ---------------- Config ----------------

var QUERY = 'newer_than:730d -in:spam -in:trash (' + [
  'category:reservations',
  'subject:(volo OR flight OR "e-ticket" OR itinerary OR itinerario OR "boarding pass" OR "carta d\'imbarco" OR prenotazione OR booking OR check-in)',
  'from:(ba.com OR ita-airways.com OR ryanair.com OR wizzair.com OR easyjet.com OR booking.com OR edreams.com OR lufthansa.com OR airfrance.fr OR klm.com OR vueling.com OR iberia.com OR emirates.com OR qatarairways.com OR turkishairlines.com OR swiss.com OR expedia.com OR skyscanner.net OR lastminute.com OR volagratis.com OR opodo.com)'
].join(' OR ') + ')';

/** Codici IATA compagnie riconosciuti senza bisogno di parola chiave vicina. */
var AIRLINES = ('BA AZ FR W4 W6 W9 U2 EC DS LH AF KL IB I2 VY UX EK QR EY TK LX OS SN SK AY TP A3 EI LO ' +
  'DL UA AA B6 AC WS V7 EW DY D8 HV TO PC LS NK F9 AS SQ CX NH JL QF MS RJ ET KE OZ CA MU CZ ' +
  'LG BT OU JU RO FB SU PS 4U X3 DE TB WK EN HF NO').split(' ');

var KEYWORDS = /(flight|volo|vol|flug|vuelo|voo|numero|number|n\.)\W{0,20}$/i;

// ---------------- Entry points ----------------

/** Eseguila UNA volta a mano: crea token e trigger orario. */
function setup() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TOKEN')) props.setProperty('TOKEN', Utilities.getUuid().replace(/-/g, ''));
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('scan').timeBased().everyHours(1).create();
  scan();
  Logger.log('TOKEN = ' + props.getProperty('TOKEN'));
}

/** Scansione periodica. */
function scan() {
  // Fino a 2 anni di storico (per le statistiche), a pagine da 100 thread
  var threads = [];
  for (var start = 0; start < 600; start += 100) {
    var page = GmailApp.search(QUERY, start, 100);
    threads = threads.concat(page);
    if (page.length < 100) break;
  }
  var found = {};
  threads.forEach(function (th) {
    th.getMessages().forEach(function (m) {
      extractFlights(htmlToText(m.getBody()), m.getSubject()).forEach(function (f) {
        var k = f.number + '_' + f.date;
        if (!found[k]) found[k] = f;
        else found[k] = mergeFlight(found[k], f);
      });
    });
  });

  // Tutti i voli (passati inclusi: servono per km, ore e ritardi nelle statistiche)
  var list = Object.keys(found).map(function (k) { return found[k]; })
    .sort(function (a, b) { return a.date < b.date ? -1 : 1; });

  PropertiesService.getScriptProperties().setProperty('FLIGHTS', JSON.stringify({
    updated: new Date().toISOString(),
    flights: list
  }));
  return list;
}

/** Endpoint letto dall'orologio. */
function doGet(e) {
  var props = PropertiesService.getScriptProperties();
  if (!e || !e.parameter || e.parameter.token !== props.getProperty('TOKEN')) {
    return json({ error: 'unauthorized' });
  }
  if (e.parameter.refresh === '1') scan();
  return json(JSON.parse(props.getProperty('FLIGHTS') || '{"flights":[]}'));
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------- Parser (puro, testabile anche in Node) ----------------

var MONTHS = {
  jan: 1, gen: 1, january: 1, gennaio: 1,
  feb: 2, february: 2, febbraio: 2,
  mar: 3, march: 3, marzo: 3,
  apr: 4, april: 4, aprile: 4,
  may: 5, mag: 5, maggio: 5,
  jun: 6, giu: 6, june: 6, giugno: 6,
  jul: 7, lug: 7, july: 7, luglio: 7,
  aug: 8, ago: 8, august: 8, agosto: 8,
  sep: 9, sept: 9, set: 9, september: 9, settembre: 9,
  oct: 10, ott: 10, october: 10, ottobre: 10,
  nov: 11, november: 11, novembre: 11,
  dec: 12, dic: 12, december: 12, dicembre: 12
};

function htmlToText(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|td|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t\r]+/g, ' ');
}

function pad(n) { return (n < 10 ? '0' : '') + n; }
function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

/** Trova tutte le date nel testo con la loro posizione. */
function findDates(text) {
  var out = [];
  var m;
  var reNum = /\b(\d{1,2})[\/.](\d{1,2})[\/.](20\d{2})\b/g;           // 30/09/2026 (giorno prima)
  while ((m = reNum.exec(text))) out.push({ i: m.index, d: mk(+m[3], +m[2], +m[1]), time: timeAfter(text, m.index + m[0].length) });
  var reIso = /\b(20\d{2})-(\d{2})-(\d{2})\b/g;                       // 2026-09-30
  while ((m = reIso.exec(text))) out.push({ i: m.index, d: mk(+m[1], +m[2], +m[3]), time: timeAfter(text, m.index + m[0].length) });
  var reTxt = /\b(\d{1,2})\s+([A-Za-z]{3,10})\.?\s+(20\d{2})\b/g;    // 18 Oct 2026 / 18 ottobre 2026
  while ((m = reTxt.exec(text))) {
    var mo = MONTHS[m[2].toLowerCase()];
    if (mo) out.push({ i: m.index, d: mk(+m[3], mo, +m[1]), time: timeAfter(text, m.index + m[0].length) });
  }
  var reUs = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(20\d{2})\b/g;    // October 18, 2026
  while ((m = reUs.exec(text))) {
    var mo2 = MONTHS[m[1].toLowerCase()];
    if (mo2) out.push({ i: m.index, d: mk(+m[3], mo2, +m[2]), time: timeAfter(text, m.index + m[0].length) });
  }
  return out.filter(function (x) { return x.d; }).sort(function (a, b) { return a.i - b.i; });
}

function mk(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return y + '-' + pad(mo) + '-' + pad(d);
}

function timeAfter(text, pos) {
  var m = /^[^\d\n]{0,6}([01]?\d|2[0-3])[:.]([0-5]\d)\b/.exec(text.substr(pos, 20));
  return m ? pad(+m[1]) + ':' + m[2] : null;
}

/** Estrae {number, date, time?, from?, to?} da un testo di email. */
function extractFlights(text, subject) {
  var dates = findDates(text);
  var subjDates = findDates(subject || '');
  if (!dates.length && !subjDates.length) return [];
  var out = [];
  var re = /\b([A-Z][A-Z0-9]|[0-9][A-Z])\s?(\d{1,4})\b/g;
  var m;
  while ((m = re.exec(text))) {
    var code = m[1], num = parseInt(m[2], 10);
    if (!num) continue;
    var before = text.substring(Math.max(0, m.index - 40), m.index);
    var known = AIRLINES.indexOf(code) >= 0;
    if (!known && !KEYWORDS.test(before)) continue;
    // Escludi falsi positivi tipici: codici prenotazione, CAP, anni
    if (/[A-Z0-9]$/.test(text.charAt(m.index - 1))) continue;

    // Data: la prima DOPO il numero entro 400 caratteri, altrimenti l'ultima PRIMA entro 300
    var end = m.index + m[0].length;
    var dt = null;
    for (var k = 0; k < dates.length; k++) {
      if (dates[k].i >= end && dates[k].i - end <= 400) { dt = dates[k]; break; }
    }
    if (!dt) {
      for (var j = dates.length - 1; j >= 0; j--) {
        if (dates[j].i < m.index && m.index - dates[j].i <= 300) { dt = dates[j]; break; }
      }
    }
    // Fallback: data nell'oggetto (es. carte d'imbarco ITA)
    if (!dt && subjDates.length) dt = { i: -1, d: subjDates[0].d, time: null };
    if (!dt) continue;

    var window = text.substring(end, Math.min(text.length, end + 400));
    var iatas = [];
    var ri = /\(([A-Z]{3})\)/g, mi;
    while ((mi = ri.exec(window)) && iatas.length < 2) iatas.push(mi[1]);
    // Formato "AZ 217   LCY   LIN": codici subito dopo il numero
    var pair = /^\s*([A-Z]{3})\s+(?:-|→|>|to\s+)?\s*([A-Z]{3})\b/.exec(window);
    if (!iatas.length && pair) iatas = [pair[1], pair[2]];
    // Orari "06:45   09:30" subito dopo il volo se la data non porta l'ora
    var times = /^[^\n]{0,120}?\b([01]?\d|2[0-3])[:.]([0-5]\d)\s+([01]?\d|2[0-3])[:.]([0-5]\d)\b/.exec(window);

    // Orario di arrivo: seconda data+ora subito dopo quella di partenza (es. Wizz)
    var arr = null;
    for (var q = 0; q < dates.length; q++) {
      if (dates[q].i > dt.i && dates[q].i - dt.i <= 200 && dates[q].time) { arr = dates[q]; break; }
    }

    // Dettagli prenotazione: cercati in una finestra attorno al volo
    var around = text.substring(Math.max(0, m.index - 300), Math.min(text.length, end + 900));
    var f = {
      number: code + num,                 // BA0570 -> BA570, "W4 6302" -> W46302
      date: dt.d,
      time: dt.time || (times ? hhmm(times[1], times[2]) : undefined),
      arrDate: arr ? arr.d : undefined,
      arrTime: arr ? arr.time : (times ? hhmm(times[3], times[4]) : undefined),
      from: iatas[0] || undefined,
      to: iatas[1] || undefined
    };
    var det = extractDetails(around);
    for (var key in det) if (det[key] && !f[key]) f[key] = det[key];
    // "Milan Malpensa - Terminal 1 (MXP)": terminal riferito all'aeroporto d'arrivo
    if (f.to && f.terminal && new RegExp('Terminal\\s*' + f.terminal + '\\s*\\(' + f.to + '\\)', 'i').test(window)) {
      f.arrTerminal = f.terminal;
      delete f.terminal;
    }
    out.push(f);
  }
  // Il codice prenotazione vale per tutta l'email
  var pnr = extractPnr(text + '\n' + (subject || ''));
  if (pnr) out.forEach(function (f) { if (!f.pnr) f.pnr = pnr; });
  // deduplica numero+data
  var seen = {};
  return out.filter(function (f) {
    var k = f.number + f.date;
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  });
}

function firstMatch(re, text, group) {
  var m = re.exec(text);
  return m ? m[group || 1] : undefined;
}

function hhmm(h, m) { return pad(+h) + ':' + m; }

/** Posto, gate, terminal, imbarco, classe... (carte d'imbarco e conferme). */
function extractDetails(t) {
  var d = {};
  var m;
  if ((m = /\b(?:seat|posto|sitz|asiento|si[eè]ge|assento)\b\s*:?\s*(\d{1,2}[A-K])\b/i.exec(t))) d.seat = m[1].toUpperCase();
  if ((m = /\b(?:boarding|imbarco)(?:\s+(?:time|ore|alle|dalle))?\s*:?\s*([01]?\d|2[0-3])[:.]([0-5]\d)\b/i.exec(t))) d.boardingTime = hhmm(m[1], m[2]);
  if ((m = /\b(?:gate\s+clos\w*|chiusura\s+(?:del\s+)?gate|gate\s+chiude)\s*:?\s*([01]?\d|2[0-3])[:.]([0-5]\d)\b/i.exec(t))) d.gateCloses = hhmm(m[1], m[2]);
  if ((m = /\bgate\b(?!\s+clos)\s*:?\s*([A-Z]?\d{1,3}[A-Z]?)\b/i.exec(t))) d.gate = m[1].toUpperCase();
  if ((m = /\bterminal\b\s*:?\s*([0-9]{1,2}[A-Z]?|[A-Z])\b/i.exec(t))) d.terminal = m[1].toUpperCase();
  if ((m = /\b(?:boarding\s+group|gruppo(?:\s+d['’]imbarco)?|zone|zona)\b\s*:?\s*([A-Z0-9]{1,2})\b/i.exec(t)) && /\d|^[A-F]$/.test(m[1])) d.boardingGroup = m[1].toUpperCase();
  var CABIN = '(premium economy|economy light|economy|euro traveller|world traveller plus|world traveller|club europe|club world|business|first|economica|comfort|classic|light|flex|basic|plus)';
  if ((m = new RegExp('\\b(?:class|cabin|classe|cabina|fare|tariffa)\\b\\s*:?\\s*' + CABIN + '\\b', 'i').exec(t)) ||
      (m = new RegExp('\\|\\s*' + CABIN + '\\s*\\|', 'i').exec(t)) ||
      (m = /\b(premium economy|euro traveller|world traveller plus|world traveller|club europe|club world|business class|first class)\b/i.exec(t))) {
    d.cabin = m[1].toLowerCase().replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
  if ((m = /\b(?:sequence|seq\.?|sec\.?\s*no\.?|sequenza)\s*:?\s*(\d{1,3})\b/i.exec(t))) d.sequence = m[1];
  return d;
}

/** Codice prenotazione (PNR): 6 caratteri alfanumerici dopo un'etichetta nota. */
function extractPnr(t) {
  var re = /\b(?:booking\s+ref(?:erence)?|confirmation\s+code|codice\s+(?:di\s+)?prenotazione|prenotazione|reservation\s+code|record\s+locator|PNR|e-ticket\s+receipt|booking\s+code|buchungscode)\b\s*[:#]?\s*([A-Z0-9]{6})\b/g;
  var m;
  while ((m = re.exec(t))) {
    if (/[A-Z]/.test(m[1]) && m[1] === m[1].toUpperCase()) return m[1];
  }
  return undefined;
}

function mergeFlight(a, b) {
  var out = {};
  [a, b].forEach(function (x) { for (var k in x) if (x[k] && !out[k]) out[k] = x[k]; });
  return out;
}

// Export per i test in Node (ignorato da Apps Script)
if (typeof module !== 'undefined') module.exports = { extractFlights: extractFlights, htmlToText: htmlToText };
