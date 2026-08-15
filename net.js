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

function persistHost() {
  if (S.mode !== "host" || !S.net) return;
  try {
    localStorage.setItem("uc_net_host", JSON.stringify({
      code: S.net.code,
      seats: S.net.seats,
      pc: S.pc, nm: S.nm, phase: S.phase,
      savedAt: Date.now()
    }));
  } catch (e) {}
}
function clearHostSave() { try { localStorage.removeItem("uc_net_host"); } catch (e) {} }

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

function hostStart() {
  S.mode = "host";
  S.net = { code: null, status: "opening", err: null, seats: [], seq: 0, lastJSON: null };
  S.phase = "lobby";

  if (!NET.use("peerjs")) { S.net.status = "error"; S.net.err = "lib"; render(); return; }

  if (S.hostPlays) {
    S.net.seats.push({ token: "HOST", name: cleanName(S.nm[1] || "Hôte"), connId: null, connected: true, isHost: true });
  }
  syncRoster();

  NET.host({}, {
    onOpen: function (code) { S.net.code = code; S.net.status = "open"; render(); },
    onPeer: function () { /* on attend le hello avant d'attribuer un siège */ },
    onMsg: hostOnMsg,
    onClose: hostOnClose,
    onError: function (e) { S.net.status = "error"; S.net.err = e; render(); }
  });
  render();
}

function hostOnMsg(cid, msg) {
  if (!msg || msg.v !== PROTO_V) return;
  if (msg.t === "hello") { hostHello(cid, msg); return; }

  var si = seatByConn(cid);
  if (si === -1) return;

  if (msg.t === "ping") { NET.send(cid, { v: PROTO_V, t: "pong" }); return; }
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
    NET.send(cid, { v: PROTO_V, t: "welcome", token: S.net.seats[si].token, playerId: si + 1, roomCode: S.net.code, state: snapshot() });
    render();
    return;
  }

  if (S.phase !== "lobby") { NET.send(cid, { v: PROTO_V, t: "reject", reason: "started" }); return; }
  if (S.net.seats.length >= MAX_MULTI) { NET.send(cid, { v: PROTO_V, t: "reject", reason: "full" }); return; }

  var name = cleanName(msg.name);
  if (nameTaken(name)) { NET.send(cid, { v: PROTO_V, t: "reject", reason: "name_taken" }); return; }

  var tok = newToken();
  S.net.seats.push({ token: tok, name: name, connId: cid, connected: true, isHost: false });
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
  clearHostSave();
  S.mode = "solo"; S.net = null; S.phase = "splash";
  S.pc = 6; S.nm = {}; loadOpts();
  render();
}

// URL de jointure : le HASH, pas une query string. `?j=CODE` casserait le
// service worker (caches.match fait une correspondance d'URL exacte contre
// ./index.html précaché) ; un hash est retiré avant la recherche en cache et
// n'est jamais envoyé au serveur.
function joinURL(code) {
  return location.origin + location.pathname + "#j=" + code;
}
