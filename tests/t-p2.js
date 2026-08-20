// Banc d'essai P2 : reconnexion, persistance, heartbeat, balayage hôte.
// Horloge et minuteries pilotées à la main pour rendre le temps déterministe.
var fs = require('fs');
var D = require('path').join(__dirname,'..')+'/';

// ── Horloge virtuelle ─────────────────────────────────────────────────────
var NOW = 1000000;
var timers = [], tseq = 0;
function tick(ms) {
  var end = NOW + ms;
  for (;;) {
    var due = timers.filter(function (t) { return t.at <= end; }).sort(function (a, b) { return a.at - b.at; })[0];
    if (!due) break;
    NOW = due.at;
    if (due.repeat) due.at = NOW + due.ms; else timers = timers.filter(function (t) { return t !== due; });
    due.fn();
  }
  NOW = end;
}

var store = {};
function mkEl() {
  return { style: { setProperty: function () {} }, innerHTML: '', textContent: '', className: '', value: '',
           width: 0, height: 0, appendChild: function () {}, remove: function () {},
           getContext: function () { return { fillRect: function () {}, fillStyle: '' }; } };
}
var listeners = {};
global.window = { isSecureContext: true, devicePixelRatio: 1,
  addEventListener: function (e, f) { (listeners[e] = listeners[e] || []).push(f); } };
global.self = global.window;
global.location = { origin: 'https://x.test', pathname: '/uc/', hash: '' };
global.localStorage = { getItem: function (k) { return store[k] || null; },
  setItem: function (k, v) { store[k] = v; }, removeItem: function (k) { delete store[k]; } };
global.navigator = {};
global.document = { visibilityState: 'visible', getElementById: function () { return mkEl(); },
  createElement: mkEl, head: { appendChild: function () {} },
  body: { appendChild: function () {}, removeChild: function () {} },
  addEventListener: function (e, f) { (listeners[e] = listeners[e] || []).push(f); } };
global.Date = { now: function () { return NOW; } };
global.setTimeout = function (fn, ms) { var t = { id: ++tseq, fn: fn, at: NOW + (ms || 0), ms: ms }; timers.push(t); return t.id; };
global.setInterval = function (fn, ms) { var t = { id: ++tseq, fn: fn, at: NOW + ms, ms: ms, repeat: true }; timers.push(t); return t.id; };
global.clearTimeout = global.clearInterval = function (id) { timers = timers.filter(function (t) { return t.id !== id; }); };
function fire(ev) { (listeners[ev] || []).forEach(function (f) { f({ preventDefault: function () {} }); }); }

['vendor/qrcode.js', 'qr.js', 'net.js', 'net-peerjs.js', 'client.js', 'pwa.js', 'app.js'].forEach(function (f) {
  eval.call(global, fs.readFileSync(D + f, 'utf8'));
});

var out = [], fails = 0;
function chk(ok, label) { out.push((ok ? '  ✓ ' : '  ✗ ') + label); if (!ok) fails++; }

// ── Adaptateur factice pilotable ──────────────────────────────────────────
var hostH = null, inbox = {}, nid = 0, roomOpen = false, joinAttempts = 0;
var Fake = {
  host: function (o, h) { hostH = h; roomOpen = true; h.onOpen(o && o.code ? o.code : 'TEST01'); },
  join: function (code, h) {
    joinAttempts++;
    Fake._ch = h;
    if (!roomOpen) { h.onError('no-room'); return; }
    h.onOpen();
  },
  send: function (cid, m) { if (inbox[cid]) inbox[cid](JSON.parse(JSON.stringify(m))); },
  broadcast: function (m) { for (var c in inbox) inbox[c](JSON.parse(JSON.stringify(m))); },
  toHost: function (m) { if (Fake._cid && hostH) hostH.onMsg(Fake._cid, JSON.parse(JSON.stringify(m))); },
  kick: function (cid) { delete inbox[cid]; },
  destroy: function () {}, status: function () { return 'open'; }
};
NET.register('peerjs', Fake);

// ══ 1. L'hôte persiste tout S ═════════════════════════════════════════════
S.nm = { 1: 'Hôte' };
hostStart();
function connect(name) {
  var cid = 'c' + (++nid);
  inbox[cid] = function (m) { (Fake._got = Fake._got || {}); (Fake._got[cid] = Fake._got[cid] || []).push(m); };
  hostH.onMsg(cid, { v: 1, t: 'hello', token: null, name: name });
  return cid;
}
var cA = connect('Alice'), cB = connect('Bob'), cC = connect('Chloé');
S.phase = 'setup'; S.uc = 1; S.mw = false;
startSession();
var turnBefore = S.turn, pairBefore = S.pair.slice(), rolesBefore = S.players.map(function (p) { return p.role; }).join(',');
persistHost(true);
chk(!!store['uc_net_host'], 'sauvegarde hôte écrite');
var saved = JSON.parse(store['uc_net_host']);
chk(!!saved.S && saved.S.players && saved.S.players.length === 4, 'S complet sauvegardé (players, alive, pair…)');
chk(saved.S.tid === undefined && saved.S.net === undefined, 'tid et net exclus de la sauvegarde');

// ══ 2. Rechargement de l'hôte → reprise sur le MÊME code ═════════════════
var codeBefore = S.net.code;
S.mode = 'solo'; S.net = null; S.players = []; S.pair = null; S.turn = 0;   // simule un reload
roomOpen = false;
var ok = resumeHost();
chk(ok, 'resumeHost() trouve la sauvegarde');
chk(S.net.code === codeBefore, 'salle rouverte sur le même code (' + S.net.code + ')');
chk(S.turn === turnBefore && S.pair[0] === pairBefore[0], 'partie restaurée : tour ' + S.turn + ', mot "' + S.pair[0] + '"');
chk(S.players.map(function (p) { return p.role; }).join(',') === rolesBefore, 'rôles restaurés à l\'identique');
chk(S.net.seats.length === 4, '4 sièges restaurés');
chk(S.net.seats.filter(function (s) { return s.connected; }).length === 1,
    'seul l\'hôte est marqué connecté après reprise (les clients doivent revenir)');

// ══ 3. Le client se reconnecte par token ═════════════════════════════════
var tok = S.net.seats[1].token;
Fake._cid = 'r1';
inbox['r1'] = function (m) { clientOnMsg(m); };
S.mode = 'client';
C.code = codeBefore; C.token = tok; C.name = 'Alice'; C.link = 'connecting'; C._retries = 0;
NET.join(C.code, clientHandlers());
chk(C.link === 'online', 'client connecté');
chk(C.playerId === 2, 'reconnexion par token → siège 2 retrouvé (' + C.playerId + ')');
chk(S.mode === 'client', 'S.mode reste client');

// ══ 4. Chute du lien : backoff avec gigue, écran NON vidé ════════════════
var snapBefore = C.snap;
C.secret = { turn: 1, word: 'Chat', isMrWhite: false, category: 'Animaux' };
joinAttempts = 0;
Fake._ch.onClose();
chk(C.link === 'reconnecting', 'lien tombé → état reconnecting');
chk(C.snap === snapBefore && C.secret.word === 'Chat', 'snapshot et mot conservés pendant la coupure');
chk(timers.some(function (t) { return !t.repeat; }), 'une tentative est planifiée');

roomOpen = false;             // l'hôte n'est pas encore revenu
tick(1500); var a1 = joinAttempts;
tick(2500); var a2 = joinAttempts;
tick(4500); var a3 = joinAttempts;
chk(a1 === 1 && a2 === 2 && a3 === 3, 'backoff progressif : ' + a1 + '/' + a2 + '/' + a3 + ' tentatives');
chk(C.link === 'reconnecting', 'toujours en reconnexion tant que la salle est absente');
chk(C.screen !== 'rejected', 'pas d\'abandon : avec un token, on attend le retour de l\'hôte');

// ══ 5. La salle revient → reconnexion automatique ════════════════════════
roomOpen = true;
tick(9000);
chk(C.link === 'online', 'reconnexion automatique dès le retour de la salle');
chk(C._retries === 0, 'compteur de tentatives remis à zéro');

// ══ 6. Heartbeat : silence prolongé = lien mort ══════════════════════════
// La salle est coupée pendant le test pour que la détection reste observable :
// sinon le client se reconnecte dans la foulée et repasse "online".
joinAttempts = 0;
roomOpen = false;
C._lastSeen = NOW - 20000;        // 20 s sans rien recevoir
tick(6000);
chk(C.link === 'reconnecting', 'silence > 15 s détecté par le heartbeat');
chk(joinAttempts > 0, 'la détection déclenche bien une tentative de reconnexion');
roomOpen = true;

// ══ 7. Retour à l'écran : reprise immédiate, sans attendre le backoff ════
C.link = 'reconnecting'; C._retries = 3;
if (C._rtid) { clearTimeout(C._rtid); C._rtid = null; }
joinAttempts = 0;
onVisibility();
chk(joinAttempts === 1, 'visibilitychange déclenche une tentative immédiate');
chk(C._retries === 0, 'backoff réinitialisé au retour à l\'écran');

// ══ 8. Balayage hôte : un siège silencieux passe déconnecté ══════════════
S.mode = 'host';
S.net.seats[2].connected = true; S.net.seats[2].lastSeen = NOW - 30000;
S.net.seats[3].connected = true; S.net.seats[3].lastSeen = NOW;
hostSweep();
chk(S.net.seats[2].connected === false, 'siège silencieux > 20 s → déconnecté');
chk(S.net.seats[3].connected === true, 'siège actif conservé');
chk(S.net.seats[0].connected === true, 'l\'hôte n\'est jamais balayé');

// ══ 9. beforeunload persiste ═════════════════════════════════════════════
store['uc_net_host'] = '';
S.phase = 'playing';
fire('beforeunload');
chk(!!store['uc_net_host'], 'beforeunload sauvegarde avant de quitter');

// ══ 10. Sauvegarde périmée ignorée ═══════════════════════════════════════
var old = JSON.parse(store['uc_net_host']); old.savedAt = NOW - 7 * 3600 * 1000;
store['uc_net_host'] = JSON.stringify(old);
chk(readHostSave() === null, 'sauvegarde de plus de 6 h ignorée');
chk(!store['uc_net_host'], 'et purgée du stockage');

console.log(out.join('\n'));
console.log(fails ? '\n✗ ' + fails + ' échec(s)' : '\n✓ tout passe');
process.exit(fails ? 1 : 0);
