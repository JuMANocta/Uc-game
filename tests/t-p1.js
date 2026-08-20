// Banc d'essai P1 : exerce le protocole hôte/client avec un adaptateur factice
// (pas de WebRTC). Vérifie roster, tokens, rejets, kick, déconnexion et
// l'invariant anti-triche du snapshot.
var fs = require('fs');
var D = require('path').join(__dirname,'..')+'/';

var store = {};
function mkEl() {
  return { style: { setProperty: function () {} }, innerHTML: '', textContent: '', className: '',
           value: '', width: 0, height: 0, appendChild: function () {}, remove: function () {},
           getContext: function () { return { fillRect: function () {}, fillStyle: '' }; } };
}
global.window = { isSecureContext: true, devicePixelRatio: 2 };
global.self = global.window;
global.location = { origin: 'https://x.test', pathname: '/uc/', hash: '' };
global.localStorage = { getItem: function (k) { return store[k] || null; },
                        setItem: function (k, v) { store[k] = v; },
                        removeItem: function (k) { delete store[k]; } };
global.navigator = {};
global.document = { getElementById: function () { return mkEl(); }, createElement: mkEl,
                    head: { appendChild: function () {} }, body: { appendChild: function () {}, removeChild: function () {} } };
global.setInterval = function () { return 1; };
global.clearInterval = function () {};
global.setTimeout = function (f) { return 1; };

['vendor/qrcode.js', 'qr.js', 'net.js', 'net-peerjs.js', 'client.js', 'pwa.js', 'app.js'].forEach(function (f) {
  eval.call(global, fs.readFileSync(D + f, 'utf8'));
});

// ── Adaptateur factice : deux "appareils" dans le même processus ───────────
var hostH = null, inbox = {}, nid = 0;
var FakeHost = {
  host: function (o, h) { hostH = h; setTimeout0(function () { h.onOpen('TEST01'); }); },
  send: function (cid, m) { if (inbox[cid]) inbox[cid](JSON.parse(JSON.stringify(m))); },
  broadcast: function (m) { for (var c in inbox) inbox[c](JSON.parse(JSON.stringify(m))); },
  kick: function (cid) { delete inbox[cid]; },
  destroy: function () { inbox = {}; }, status: function () { return 'open'; },
  join: function () {}, toHost: function () {}
};
function setTimeout0(f) { f(); }
NET.register('peerjs', FakeHost);

var out = [], fails = 0;
function chk(ok, label) { out.push((ok ? '  ✓ ' : '  ✗ ') + label); if (!ok) fails++; }

// ── L'hôte ouvre une salle ────────────────────────────────────────────────
S.nm = { 1: 'Hôte' };
hostStart();
chk(S.phase === 'lobby', 'phase = lobby');
chk(S.net.code === 'TEST01', 'code de salle = ' + S.net.code);
chk(S.net.seats.length === 1 && S.net.seats[0].isHost, "l'hôte occupe le siège 1");
chk(S.pc === 1, 'S.pc suit le roster (' + S.pc + ')');

// ── Trois joueurs rejoignent ──────────────────────────────────────────────
var got = {};
function connect(name) {
  var cid = 'c' + (++nid);
  inbox[cid] = function (m) { (got[cid] = got[cid] || []).push(m); };
  hostH.onMsg(cid, { v: 1, t: 'hello', token: null, name: name });
  return cid;
}
var cA = connect('Alice'), cB = connect('Bob'), cC = connect('Chloé');
chk(S.net.seats.length === 4, '4 sièges après 3 arrivées');
chk(S.pc === 4 && S.nm[2] === 'Alice' && S.nm[4] === 'Chloé', 'S.nm rempli depuis le roster');

var welA = got[cA].filter(function (m) { return m.t === 'welcome'; })[0];
chk(!!welA && welA.playerId === 2 && !!welA.token, 'welcome ciblé avec token et playerId=2');
var tokA = welA.token;

// ── Rejets ────────────────────────────────────────────────────────────────
var cDup = connect('alice');
var rej = got[cDup].filter(function (m) { return m.t === 'reject'; })[0];
chk(!!rej && rej.reason === 'name_taken', 'pseudo en doublon refusé (' + (rej && rej.reason) + ')');
chk(S.net.seats.length === 4, 'le doublon ne prend pas de siège');

// ── Reconnexion par token : nouvelle connexion, même siège ────────────────
var cA2 = 'c' + (++nid);
inbox[cA2] = function (m) { (got[cA2] = got[cA2] || []).push(m); };
hostH.onMsg(cA2, { v: 1, t: 'hello', token: tokA, name: 'Alice' });
var welA2 = got[cA2].filter(function (m) { return m.t === 'welcome'; })[0];
chk(!!welA2 && welA2.playerId === 2, 'reconnexion par token → même siège 2');
chk(S.net.seats.length === 4, 'la reconnexion ne crée pas de siège');

// ── Déconnexion en lobby : le siège est libéré et les ids renumérotés ─────
hostH.onClose(cB);
chk(S.net.seats.length === 3, 'départ en lobby → siège libéré');
chk(S.nm[3] === 'Chloé', 'renumérotation : Chloé passe en 3 (' + S.nm[3] + ')');

// ── Exclusion ─────────────────────────────────────────────────────────────
kickPlayer(3);
chk(S.net.seats.length === 2, 'kick → siège retiré');
kickPlayer(1);
chk(S.net.seats.length === 2, "l'hôte ne peut pas être exclu");

// ── Partie complète ───────────────────────────────────────────────────────
for (var i = 0; i < 15; i++) connect('J' + i);
chk(S.net.seats.length === MAX_MULTI, 'plafonné à ' + MAX_MULTI + ' joueurs');
var last = Object.keys(got).pop();
chk(got[last].some(function (m) { return m.t === 'reject' && m.reason === 'full'; }), 'refus "full" au-delà du plafond');

// ── INVARIANT ANTI-TRICHE ────────────────────────────────────────────────
S.phase = 'setup'; S.uc = 2; S.mw = true;
startSession();
chk(S.phase === 'playing', 'mode hôte : démarrage direct en playing');

var snap = JSON.stringify(snapshot());
var aliveWords = [];
S.tp.forEach(function (t) { if (t.word) aliveWords.push(t.word); });
var leaked = aliveWords.filter(function (w) { return snap.indexOf(w) !== -1; });
chk(leaked.length === 0, 'aucun mot de joueur vivant dans le snapshot' + (leaked.length ? ' — FUITE: ' + leaked.join(', ') : ''));

var sn = snapshot();
var roleLeak = sn.roster.some(function (r) { return r.role !== undefined; });
chk(!roleLeak, 'aucun champ role dans le roster');
chk(sn.eliminated.length === 0, 'aucun éliminé au tour 1');
chk(sn.roster.length === S.pc, 'roster complet (' + sn.roster.length + ' joueurs)');

// ── pushState est idempotent ─────────────────────────────────────────────
var sent = 0;
FakeHost.broadcast = function () { sent++; };
S.net.lastJSON = null;
pushState(); var a = sent;
pushState(); var b = sent;
chk(a === 1 && b === 1, 'pushState ne rediffuse pas un snapshot inchangé (' + a + ' puis ' + b + ')');
S.spoken.push(S.alive[0]);
pushState();
chk(sent === 2, 'pushState rediffuse quand l\'état change');

// ── URL de jointure ───────────────────────────────────────────────────────
var u = joinURL('XK7P2M');
chk(u.indexOf('#j=XK7P2M') !== -1 && u.indexOf('?') === -1, 'URL de jointure via hash : ' + u);

// ── Code de salle ─────────────────────────────────────────────────────────
var codes = {}, amb = 0;
for (var k = 0; k < 4000; k++) {
  var c2 = newRoomCode(); codes[c2] = 1;
  if (/[01OIL]/.test(c2)) amb++;
}
chk(amb === 0, 'aucun caractère ambigu (0/O/1/I/L) dans 4000 codes');
chk(Object.keys(codes).length > 3900, 'codes bien distribués (' + Object.keys(codes).length + '/4000 uniques)');

console.log(out.join('\n'));
console.log(fails ? '\n✗ ' + fails + ' échec(s)' : '\n✓ tout passe');
process.exit(fails ? 1 : 0);
