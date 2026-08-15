// ══════════════════════════════════════════════════════════════
// NET — façade de transport + protocole
// ══════════════════════════════════════════════════════════════
// Toute la logique de jeu ne parle QU'À cette façade, jamais à PeerJS.
// Un adaptateur Supabase pourra être ajouté en implémentant les mêmes
// fonctions, sans toucher une ligne de app.js / client.js.
//
// RÈGLE STRUCTURANTE : les identifiants de connexion (connId) sont OPAQUES et
// forgés par l'adaptateur. La logique de jeu ne doit jamais les inspecter, les
// corréler à un pair, ni les réutiliser après une reconnexion. L'identité d'un
// joueur, c'est son TOKEN — pas sa connexion.

var PROTO_V = 1;

// Sans 0/O/1/I/L : évite les erreurs de recopie manuelle du code de salle.
var ROOM_CHARS = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
function newRoomCode() {
  var s = "";
  for (var i = 0; i < 6; i++) s += ROOM_CHARS.charAt(Math.floor(Math.random() * ROOM_CHARS.length));
  return s;
}
function newToken() {
  var s = "";
  for (var i = 0; i < 16; i++) s += "0123456789abcdef".charAt(Math.floor(Math.random() * 16));
  return s;
}

var NET = (function () {
  var _adapters = {}, _ad = null, _role = null;

  function register(name, impl) { _adapters[name] = impl; }
  function use(name) {
    if (!_adapters[name]) return null;
    _ad = _adapters[name];
    return _ad;
  }
  function ready() { return !!_ad; }

  // handlers hôte   : {onOpen(code), onPeer(connId), onMsg(connId,msg), onClose(connId), onError(err)}
  // handlers client : {onOpen(), onMsg(msg), onClose(), onError(err)}
  function host(opts, h) { _role = "host"; return _ad && _ad.host(opts, h); }
  function join(code, h) { _role = "client"; return _ad && _ad.join(code, h); }

  function send(connId, msg) { if (_ad && _ad.send) _ad.send(connId, msg); }
  function broadcast(msg) { if (_ad && _ad.broadcast) _ad.broadcast(msg); }
  function toHost(msg) { if (_ad && _ad.toHost) _ad.toHost(msg); }
  function kick(connId) { if (_ad && _ad.kick) _ad.kick(connId); }
  function destroy() { if (_ad && _ad.destroy) _ad.destroy(); _role = null; }
  function status() { return _ad && _ad.status ? _ad.status() : "off"; }

  return {
    register: register, use: use, ready: ready,
    host: host, join: join,
    send: send, broadcast: broadcast, toHost: toHost,
    kick: kick, destroy: destroy, status: status,
    role: function () { return _role; }
  };
})();

// ══════════════════════════════════════════════════════════════
// SNAPSHOT — l'unique producteur de données diffusées
// ══════════════════════════════════════════════════════════════
// INVARIANT ANTI-TRICHE : rien ici ne doit révéler le rôle ou le mot d'un
// joueur VIVANT. Les seuls rôles exposés sont ceux des éliminés (déjà publics)
// et le tableau final de fin de partie. Ne jamais étaler S.players, S.tp ou
// S.pair dans un message. Une seule fonction produit tout : celle-ci.
function snapshot() {
  var seats = (S.net && S.net.seats) || [];
  var roster = seats.map(function (s, i) {
    return {
      id: i + 1,
      name: s.name,
      alive: S.alive.length ? S.alive.indexOf(i + 1) !== -1 : true,
      connected: !!s.connected,
      host: !!s.isHost
    };
  });

  var elim = S.elim.map(function (id) {
    var pl = S.players.filter(function (x) { return x.id === id; })[0];
    // En mode nuit les rôles éliminés restent masqués pendant la partie
    return { id: id, role: (pl && !S.night) ? pl.role : null };
  });

  var bad = S.players.filter(function (x) {
    return S.alive.indexOf(x.id) !== -1 && x.role !== "civil";
  }).length;

  return {
    v: PROTO_V,
    phase: S.phase,
    turn: S.turn,
    round: S.round,
    roster: roster,
    eliminated: elim,
    category: S.cat ? S.ct : null,
    impostorsLeft: S.night ? null : (S.players.length ? bad : null),
    speakOrder: S.ro.map(function (i) { return S.tp[i] ? S.tp[i].id : null; }).filter(function (x) { return x !== null; }),
    spoken: S.spoken.slice(),
    scores: S.sc,
    opts: { cat: S.cat, night: S.night, skipvote: S.skipvote, timer: S.timer },
    vote: {
      open: S.phase === "vote",
      candidates: S.alive.slice(),
      votedIds: Object.keys(S.votes || {}).map(Number),
      tally: null,
      result: null
    },
    recap: null,
    gameOver: null
  };
}

// Diffusion idempotente : appelée sans condition depuis render(). Le garde
// no-op supprime toute une classe de bugs « j'ai oublié de diffuser » — plutôt
// que traquer chaque point de mutation et en oublier fatalement un.
function pushState() {
  if (S.mode !== "host" || !S.net) return;
  var snap = snapshot();
  var j = JSON.stringify(snap);
  if (j === S.net.lastJSON) return;
  S.net.lastJSON = j;
  S.net.seq = (S.net.seq || 0) + 1;
  snap.seq = S.net.seq;
  NET.broadcast({ v: PROTO_V, t: "state", state: snap });
  persistHost();
}

// L'hôte est un point unique de défaillance : tout l'état vit dans son
// navigateur. On sauvegarde donc S en entier (moins le transitoire) pour
// survivre à un rechargement de page ou à un crash d'onglet.
var _lastPersist = 0;
function persistHost(force) {
  if (S.mode !== "host" || !S.net) return;
  var now = Date.now();
  if (!force && now - _lastPersist < 1000) return;   // throttle ~1/s
  _lastPersist = now;
  try {
    var g = {};
    for (var k in S) {
      if (!S.hasOwnProperty(k)) continue;
      if (k === "tid" || k === "net") continue;      // non sérialisable / reconstruit
      g[k] = S[k];
    }
    localStorage.setItem("uc_net_host", JSON.stringify({
      code: S.net.code, seats: S.net.seats, S: g, savedAt: now
    }));
  } catch (e) {}
}
function clearHostSave() { try { localStorage.removeItem("uc_net_host"); } catch (e) {} }

// Une sauvegarde de plus de 6 h n'a plus de sens pour une partie de soirée.
function readHostSave() {
  try {
    var d = JSON.parse(localStorage.getItem("uc_net_host") || "null");
    if (!d || !d.savedAt || !d.code) return null;
    if (Date.now() - d.savedAt > 6 * 3600 * 1000) { clearHostSave(); return null; }
    return d;
  } catch (e) { return null; }
}

// Reprend la salle AVEC LE MÊME CODE : c'est ce qui fait que les boucles de
// retry des clients la retrouvent toutes seules, sans action de personne.
function resumeHost() {
  var d = readHostSave();
  if (!d) return false;
  stopTimer();
  var g = d.S || {};
  for (var k in g) if (g.hasOwnProperty(k)) S[k] = g[k];
  S.tid = null; S.trem = 0;
  S.mode = "host";
  S.net = { code: d.code, status: "opening", err: null, seats: d.seats || [], seq: 0, lastJSON: null };
  // Toutes les connexions sont mortes après un rechargement : les joueurs
  // reviendront d'eux-mêmes via leur token.
  S.net.seats.forEach(function (s) { s.connected = !!s.isHost; s.connId = null; });
  if (!NET.use("peerjs")) { S.net.status = "error"; S.net.err = "lib"; render(); return true; }
  NET.host({ code: d.code }, hostHandlers());
  startHostSweeper();
  render();
  return true;
}

// ══════════════════════════════════════════════════════════════
// SESSION HÔTE
// ══════════════════════════════════════════════════════════════
// L'hôte tient N-1 RTCPeerConnection : au-delà d'une douzaine, un navigateur
// mobile souffre. Le mode solo garde sa limite de 20.
var MAX_MULTI = 12;

// Les sièges sont un TABLEAU ORDONNÉ : playerId = index + 1. Renuméroter après
// un départ est donc automatique, ce qui préserve l'invariant "ids contigus
// 1..N" dont dépend startSession(). L'identité stable, c'est le token.
function seatByToken(tok) {
  var s = S.net.seats;
  for (var i = 0; i < s.length; i++) if (s[i].token === tok) return i;
  return -1;
}
function seatByConn(cid) {
  var s = S.net.seats;
  for (var i = 0; i < s.length; i++) if (s[i].connId === cid) return i;
  return -1;
}
function cleanName(n) {
  n = String(n || "").replace(/[<>&"]/g, "").trim().slice(0, 20);
  return n || "Joueur";
}
function nameTaken(n) {
  var k = n.trim().toLowerCase();
  return S.net.seats.some(function (s) { return s.name.trim().toLowerCase() === k; });
}

// Réaligne S.pc / S.nm sur les sièges pour que MUC(), CC(), BAL(), poolSize()
// et startSession() fonctionnent sans aucune modification.
function syncRoster() {
  S.pc = S.net.seats.length;
  S.nm = {};
  S.net.seats.forEach(function (s, i) { S.nm[i + 1] = s.name; });
  if (S.pc >= 3 && S.uc > MUC()) S.uc = MUC();
}

function hostHandlers() {
  return {
    onOpen: function (code) { S.net.code = code; S.net.status = "open"; persistHost(true); render(); },
    onPeer: function () { /* on attend le hello avant d'attribuer un siège */ },
    onMsg: hostOnMsg,
    onClose: hostOnClose,
    onError: function (e) { S.net.status = "error"; S.net.err = e; render(); }
  };
}

function hostStart() {
  clearHostSave();
  S.mode = "host";
  S.net = { code: null, status: "opening", err: null, seats: [], seq: 0, lastJSON: null };
  S.phase = "lobby";

  if (!NET.use("peerjs")) { S.net.status = "error"; S.net.err = "lib"; render(); return; }

  if (S.hostPlays) {
    S.net.seats.push({ token: "HOST", name: cleanName(S.nm[1] || "Hôte"), connId: null, connected: true, isHost: true });
  }
  syncRoster();

  NET.host({}, hostHandlers());
  startHostSweeper();
  render();
}

// Un téléphone qui se verrouille ne ferme pas toujours proprement sa connexion :
// iOS suspend l'onglet sans notifier. On considère donc silencieux > 20 s comme
// déconnecté, sinon un joueur parti resterait "connecté" et bloquerait un vote.
var _sweepTid = null;
function startHostSweeper() {
  if (_sweepTid) return;
  _sweepTid = setInterval(hostSweep, 5000);
}
function stopHostSweeper() { if (_sweepTid) { clearInterval(_sweepTid); _sweepTid = null; } }
function hostSweep() {
  if (S.mode !== "host" || !S.net) { stopHostSweeper(); return; }
  var now = Date.now(), changed = false;
  S.net.seats.forEach(function (s) {
    if (s.isHost || !s.connected) return;
    if (now - (s.lastSeen || 0) > 20000) { s.connected = false; s.connId = null; changed = true; }
  });
  if (changed) render();
}

function hostOnMsg(cid, msg) {
  if (!msg || msg.v !== PROTO_V) return;
  if (msg.t === "hello") { hostHello(cid, msg); return; }

  var si = seatByConn(cid);
  if (si === -1) return;
  S.net.seats[si].lastSeen = Date.now();
  if (!S.net.seats[si].connected) { S.net.seats[si].connected = true; render(); }

  if (msg.t === "ping") { NET.send(cid, { v: PROTO_V, t: "pong" }); return; }
  // Chacun se coche lui-même quand il a fini de parler — l'hôte peut toujours
  // le faire à sa place depuis son écran.
  if (msg.t === "spoke") {
    var pid = si + 1;
    var k = S.spoken.indexOf(pid);
    if (msg.on === false) { if (k !== -1) S.spoken.splice(k, 1); }
    else if (k === -1) S.spoken.push(pid);
    render();
    return;
  }
  if (msg.t === "set_name" && S.phase === "lobby") {
    var n = cleanName(msg.name);
    if (!nameTaken(n) || n === S.net.seats[si].name) { S.net.seats[si].name = n; syncRoster(); render(); }
    return;
  }
  if (msg.t === "leave") { hostOnClose(cid); return; }
}

function hostHello(cid, msg) {
  // Reconnexion : le token retrouve le siège, la connexion est réattachée.
  var si = msg.token ? seatByToken(msg.token) : -1;
  if (si !== -1) {
    S.net.seats[si].connId = cid;
    S.net.seats[si].connected = true;
    S.net.seats[si].lastSeen = Date.now();
    NET.send(cid, { v: PROTO_V, t: "welcome", token: S.net.seats[si].token, playerId: si + 1, roomCode: S.net.code, state: snapshot() });
    // Il revient en pleine partie : on lui renvoie immédiatement son mot et
    // l'état du timer, sinon il resterait devant un écran vide.
    if (S.phase !== "lobby" && S.alive.indexOf(si + 1) !== -1) {
      sendSecretTo(si + 1);
      if (S.timer && S.trem > 0) NET.send(cid, { v: PROTO_V, t: "timer", action: "start", remaining: S.trem });
    }
    render();
    return;
  }

  if (S.phase !== "lobby") { NET.send(cid, { v: PROTO_V, t: "reject", reason: "started" }); return; }
  if (S.net.seats.length >= MAX_MULTI) { NET.send(cid, { v: PROTO_V, t: "reject", reason: "full" }); return; }

  var name = cleanName(msg.name);
  if (nameTaken(name)) { NET.send(cid, { v: PROTO_V, t: "reject", reason: "name_taken" }); return; }

  var tok = newToken();
  S.net.seats.push({ token: tok, name: name, connId: cid, connected: true, isHost: false, lastSeen: Date.now() });
  syncRoster();
  NET.send(cid, { v: PROTO_V, t: "welcome", token: tok, playerId: S.net.seats.length, roomCode: S.net.code, state: snapshot() });
  SND.ping(); VIB(20);
  render();
}

function hostOnClose(cid) {
  if (!S.net) return;
  var si = seatByConn(cid);
  if (si === -1) return;
  if (S.phase === "lobby") {
    S.net.seats.splice(si, 1);   // parti avant le début : on libère le siège
  } else {
    S.net.seats[si].connected = false;   // en partie : le siège est conservé
    S.net.seats[si].connId = null;
  }
  syncRoster();
  render();
}

// ══════════════════════════════════════════════════════════════
// MOTS SECRETS — envoi CIBLÉ, jamais diffusé
// ══════════════════════════════════════════════════════════════
// On n'envoie QUE `word` et `isMrWhite` — jamais `role`. Dire à un joueur
// qu'il est "undercover" lui révélerait son camp, ce que l'écran de révélation
// mono-téléphone se garde bien de faire : il montre un mot, point.
function sendSecretTo(pid) {
  if (S.mode !== "host" || !S.net) return;
  var seat = S.net.seats[pid - 1];
  if (!seat || seat.isHost || !seat.connId) return;
  var t = S.tp.filter(function (x) { return x.id === pid; })[0];
  if (!t) return;
  NET.send(seat.connId, {
    v: PROTO_V, t: "secret",
    turn: S.turn,
    word: t.word,                       // null pour Mr. White
    isMrWhite: t.role === "mrwhite",
    category: S.cat ? S.ct : null
  });
}

function sendSecrets() {
  if (S.mode !== "host" || !S.net) return;
  S.tp.forEach(function (t) { sendSecretTo(t.id); });
}

function kickPlayer(pid) {
  if (!S.net) return;
  var s = S.net.seats[pid - 1];
  if (!s || s.isHost) return;
  if (s.connId) NET.send(s.connId, { v: PROTO_V, t: "reject", reason: "kicked" });
  if (s.connId) NET.kick(s.connId);
  if (S.phase === "lobby") S.net.seats.splice(pid - 1, 1);
  else { s.connected = false; s.connId = null; s.kicked = true; }
  syncRoster();
  render();
}

function closeRoom() {
  NET.destroy();
  stopHostSweeper();
  releaseWake();
  clearHostSave();
  S.mode = "solo"; S.net = null; S.phase = "splash";
  S.pc = 6; S.nm = {}; loadOpts();
  render();
}

// ══════════════════════════════════════════════════════════════
// WAKE LOCK — empêcher l'écran de s'éteindre
// ══════════════════════════════════════════════════════════════
// Sur iOS c'est la mitigation PRINCIPALE, pas un bonus : empêcher la suspension
// de l'onglet vaut bien mieux que devoir s'en remettre. Support partiel
// (Safari ≥ 16.4) — on dégrade en silence.
var _wake = null;
function requestWake() {
  if (_wake || !navigator.wakeLock || !navigator.wakeLock.request) return;
  try {
    navigator.wakeLock.request("screen").then(function (w) {
      _wake = w;
      if (w.addEventListener) w.addEventListener("release", function () { _wake = null; });
    }).catch(function () {});
  } catch (e) {}
}
function releaseWake() {
  if (!_wake) return;
  try { _wake.release(); } catch (e) {}
  _wake = null;
}
function wakeSupported() { return !!(navigator.wakeLock && navigator.wakeLock.request); }

// Le timer n'est PAS mis dans le snapshot : il changerait chaque seconde et
// ferait rediffuser l'état en boucle. On envoie le départ/arrêt, et chaque
// client fait tourner son propre décompte — insensible au décalage d'horloge
// entre appareils, contrairement à une date de fin absolue.
function broadcastTimer(action, rem) {
  if (S.mode !== "host" || !S.net || !S.timer) return;
  NET.broadcast({ v: PROTO_V, t: "timer", action: action, remaining: rem || 0 });
}

// ══════════════════════════════════════════════════════════════
// VISIBILITÉ — le moment critique du jeu
// ══════════════════════════════════════════════════════════════
// Pendant un débat de 3 minutes les téléphones se verrouillent. Au retour, le
// Wake Lock est perdu et la connexion est probablement morte : on reprend tout
// immédiatement plutôt que d'attendre le prochain backoff.
function onVisibility() {
  if (typeof document.visibilityState === "string" && document.visibilityState !== "visible") return;
  if (S.mode === "host" || S.mode === "client") requestWake();
  if (S.mode === "client") clientWakeUp();
  if (S.mode === "host") hostSweep();
}

function installLifecycle() {
  if (document.addEventListener) document.addEventListener("visibilitychange", onVisibility);
  if (window.addEventListener) {
    window.addEventListener("pageshow", onVisibility);
    window.addEventListener("beforeunload", function (e) {
      if (S.mode !== "host" || !S.net) return;
      persistHost(true);
      // Avertir seulement si une partie est réellement en cours.
      if (S.phase !== "lobby" && S.phase !== "splash" && S.phase !== "setup") {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    });
  }
}

// URL de jointure : le HASH, pas une query string. `?j=CODE` casserait le
// service worker (caches.match fait une correspondance d'URL exacte contre
// ./index.html précaché) ; un hash est retiré avant la recherche en cache et
// n'est jamais envoyé au serveur.
function joinURL(code) {
  return location.origin + location.pathname + "#j=" + code;
}
