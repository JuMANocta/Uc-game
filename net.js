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

// Tirage aléatoire des SECRETS — code de salle, token de siège, joinId.
//
// Math.random ne convient pas ici : son état interne se reconstitue à partir de
// quelques sorties, et ces trois valeurs proviendraient du même flux. Un joueur
// qui connaît son propre token pourrait en déduire ceux des autres — donc leur
// siège, donc leur mot. L'attaque est laborieuse ; le remplacement fait trois
// lignes, ce qui coûte moins cher que d'en débattre.
//
// crypto est garanti présent : WebRTC exige déjà un contexte sécurisé, et sans
// WebRTC il n'y a pas de salle du tout. Le repli ne sert qu'aux bancs d'essai.
function randBytes(n) {
  var a = new Uint8Array(n);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(a);
  else for (var i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256);
  return a;
}

// Sans 0/O/1/I/L : évite les erreurs de recopie manuelle du code de salle.
var ROOM_CHARS = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
function newRoomCode() {
  // Rejet des tirages ≥ 240 : 256 n'est pas un multiple de 30, et un simple
  // modulo favoriserait les six premiers caractères de l'alphabet.
  var s = "", b = randBytes(24), i = 0;
  while (s.length < 6) {
    if (i >= b.length) { b = randBytes(24); i = 0; }
    var x = b[i++];
    if (x < 240) s += ROOM_CHARS.charAt(x % 30);
  }
  return s;
}
function newToken() {
  var b = randBytes(8), s = "";
  for (var i = 0; i < b.length; i++) s += (b[i] + 0x100).toString(16).slice(1);
  return s;   // 16 caractères hexadécimaux, 64 bits
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
    // Les indices sont publics — c'est tout leur intérêt : garder une trace
    // de ce qui a été dit. La faute l'est aussi, la sanction doit être visible.
    writeClues: !!S.writeClues,
    clues: S.writeClues ? JSON.parse(JSON.stringify(S.clues || {})) : {},
    fault: S.fault ? { id: S.fault.id, word: S.fault.word, clue: S.fault.clue, kind: S.fault.kind } : null,
    pingTally: S.pingOn ? JSON.parse(JSON.stringify(S.pingTally || {})) : {},
    scores: S.sc,
    // Reprises dans les règles affichées côté joueur : elles doivent décrire la
    // partie réellement en cours, pas une configuration par défaut.
    opts: { cat: S.cat, night: S.night, skipvote: S.skipvote, timer: S.timer,
            revealWords: !!S.revealWords, writeClues: !!S.writeClues, faultCat: !!S.faultCat,
            pingOn: !!S.pingOn, pingGap: S.pingGap|0, pingMax: !!S.pingMax },
    // votedIds dit QUI a voté, jamais POUR QUI — c'est ce qui permet
    // l'affichage « en attente de Marc, Léa » sans rien divulguer.
    vote: {
      open: S.phase === "vote",
      candidates: S.voteCands || S.alive.slice(),
      votedIds: Object.keys(S.votes || {}).map(Number),
      round: S.round || 0,
      skipAllowed: !!S.skipvote && !S.voteCands,
      rows: S.tally ? S.tally.rows : null,
      tied: S.tally ? S.tally.tied : null,
      resolved: S.tally ? S.tally.resolved : null,
      abstentions: S.tally ? S.tally.abstentions : 0
    },
    // Récap et fin de partie révèlent la paire et les rôles — mais seulement
    // une fois le tour terminé, exactement comme l'écran turn_recap du mode
    // mono-téléphone. Le tour suivant tire de nouveaux mots.
    recap: S.phase === "turn_recap" ? (function () {
      var li = S.skipt ? null : (S.elim.length ? S.elim[S.elim.length - 1] : null);
      var pl = li ? S.players.filter(function (x) { return x.id === li; })[0] : null;
      return {
        skipped: !!S.skipt,
        elimId: li,
        elimRole: pl ? pl.role : null,
        // Masquée par défaut : révéler la paire chaque tour apprendrait à un
        // Undercover survivant qu'il EST l'intrus.
        pair: S.revealWords && S.pair ? S.pair.slice() : null,
        revealWords: !!S.revealWords,
        category: S.ct,
        impostorsLeft: S.players.filter(function (x) {
          return S.alive.indexOf(x.id) !== -1 && x.role !== "civil";
        }).length
      };
    })() : null,

    gameOver: (S.phase === "game_over" && S.gr) ? {
      winner: S.gr.winner,
      msg: S.gr.msg,
      roles: S.players.map(function (p) { return { id: p.id, role: p.role }; }),
      pair: S.pair ? S.pair.slice() : null,
      // Toutes les paires jouées : en fin de partie on veut revoir la partie
      // entière, quelle que soit l'option de révélation par tour.
      allWords: S.hist.map(function(h){return {turn:h.turn,cat:h.cat,pair:h.pair.slice()}}),
      category: S.ct,
      turns: S.turn
    } : null,

    // Mr. White démasqué : il tape sa proposition sur son propre téléphone,
    // les autres voient qu'on l'attend.
    mw: S.phase === "mrwhite_guess" ? {
      playerId: S.vt,
      guess: S.mwGuessText || null
    } : null
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
// Le joinId est tiré par le CLIENT avant son tout premier hello, là où le token
// n'existe pas encore. Il est de même nature que le token — un secret, jamais
// diffusé dans le snapshot — et sert uniquement à rendre la jointure idempotente.
function seatByJoinId(jid) {
  if (!jid) return -1;
  var s = S.net.seats;
  for (var i = 0; i < s.length; i++) if (s[i].joinId === jid) return i;
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
  // Inutile d'attendre 12 s le chien de garde si le navigateur sait déjà
  // qu'il n'y a pas de réseau.
  if (!isOnline()) {
    S.mode = "host";
    S.net = { code: null, status: "error", err: "offline", seats: [], seq: 0, lastJSON: null };
    S.phase = "lobby";
    render();
    return;
  }
  clearHostSave();
  S.mode = "host";
  S.net = { code: null, status: "opening", err: null, seats: [], seq: 0, lastJSON: null };
  S.phase = "lobby";
  // Les indices écrits sont l'intérêt même du multi-appareils : chacun tape sur
  // son téléphone, tout le monde lit le tableau. On l'active donc à l'ouverture
  // de la salle plutôt que d'attendre que l'hôte le découvre dans les options —
  // il reste libre de le couper à l'écran de configuration.
  S.writeClues = true;

  if (!NET.use("peerjs")) { S.net.status = "error"; S.net.err = "lib"; render(); return; }

  if (S.hostPlays) {
    S.net.seats.push({ token: "HOST", name: cleanName(myName() || "Hôte"), connId: null, connected: true, isHost: true });
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

  // EN LOBBY, un siège muet est retiré, pas seulement marqué déconnecté. Sinon
  // un siège fantôme — issu d'une tentative de jointure avortée, ou d'un joueur
  // parti sans que le transport le signale — reste dans le roster, gonfle S.pc,
  // et l'hôte lance une partie où un rôle est distribué à personne.
  // En partie c'est l'inverse : le siège DOIT survivre, le joueur revient avec
  // son token et retrouve sa place.
  if (S.phase === "lobby") {
    var before = S.net.seats.length;
    S.net.seats = S.net.seats.filter(function (s) {
      return s.isHost || s.connected || now - (s.lastSeen || 0) <= 20000;
    });
    if (S.net.seats.length !== before) { pushSeatIds(); syncRoster(); changed = true; }
  }

  if (changed) render();
}

// Limitation de débit, par CONNEXION. Chaque message d'état déclenche un
// render(), donc un snapshot rediffusé à toute la table : un client modifié qui
// spamme `spoke`, `vote` ou `hello` sature l'onglet de l'hôte, et avec lui la
// partie de tout le monde. Même principe que pingReady(), étendu au reste.
//
// La clé est le connId et non l'indice de siège : un siège retiré en lobby
// décale tous les suivants, et le compteur d'un joueur se serait appliqué à son
// voisin. Le connId, lui, ne désigne jamais qu'un seul pair.
//
// 12 messages/seconde : très au-dessus de ce qu'un doigt humain produit, très
// en dessous de ce qu'il faut pour nuire. Le dépassement est ignoré en silence.
var CONN_MSG_MAX = 12, _connRate = {};
function connRateOk(cid) {
  var now = Date.now(), r = _connRate[cid];
  if (!r || now - r.at >= 1000) { _connRate[cid] = { at: now, n: 1 }; return true; }
  r.n++;
  return r.n <= CONN_MSG_MAX;
}

function hostOnMsg(cid, msg) {
  if (!msg || msg.v !== PROTO_V) return;

  // Tout message d'un siège connu vaut signe de vie — le battement de cœur y
  // compris. C'est ce qui empêche le balayeur de déclarer mort un joueur
  // parfaitement présent : à mettre à jour AVANT tout filtrage.
  var si = seatByConn(cid);
  if (si !== -1) {
    S.net.seats[si].lastSeen = Date.now();
    if (!S.net.seats[si].connected) { S.net.seats[si].connected = true; render(); }
  }

  // Le battement de cœur passe avant le compteur : il est régulier, borné, et
  // le bloquer ferait croire au client que le lien est mort.
  if (msg.t === "ping") { NET.send(cid, { v: PROTO_V, t: "pong" }); return; }
  if (!connRateOk(cid)) return;

  if (msg.t === "hello") { hostHello(cid, msg); return; }
  if (si === -1) return;

  // Chacun se coche lui-même quand il a fini de parler — l'hôte peut toujours
  // le faire à sa place depuis son écran.
  if (msg.t === "spoke") {
    // Bornée comme `clue` : hors du débat ou une fois éliminé, se cocher n'a
    // aucun sens et ne servait qu'à polluer la liste d'attente des autres.
    if (S.phase !== "playing") return;
    var pid = si + 1;
    if (S.alive.indexOf(pid) === -1) return;
    var k = S.spoken.indexOf(pid);
    if (msg.on === false) { if (k !== -1) S.spoken.splice(k, 1); }
    else if (k === -1) S.spoken.push(pid);
    render();
    return;
  }
  if (msg.t === "buzz") { hostPing(si + 1, msg.to, msg.emoji, msg.pub); return; }
  if (msg.t === "clue") {
    if (msg.turn !== S.turn) return;          // indice d'un tour périmé
    submitClue(si + 1, msg.text);
    return;
  }
  if (msg.t === "vote") {
    // turn et round protègent des votes périmés envoyés par un client qui
    // s'est reconnecté sur un état plus récent.
    if (S.phase !== "vote" || msg.turn !== S.turn || msg.round !== S.round) return;
    var voter = si + 1;
    if (S.alive.indexOf(voter) === -1) return;
    var cands = S.voteCands || S.alive;
    if (msg.target !== -1 && cands.indexOf(msg.target) === -1) return;
    if (msg.target === -1 && (!S.skipvote || S.voteCands)) return;
    S.votes[voter] = msg.target;
    // Accusé de réception CIBLÉ : le client n'affiche jamais un vote que l'hôte
    // n'a pas enregistré. Un vote refusé plus haut (tour périmé) laisse donc
    // l'écran sur les boutons, au lieu d'annoncer un choix qui n'existe pas.
    sendYourVoteTo(voter);
    render();
    if (allVoted()) closeVote();
    return;
  }
  // Changer d'avis est permis — le bouton existe déjà côté joueur — mais ça
  // doit passer par l'hôte. Avant, « Changer mon vote » ne faisait qu'effacer un
  // affichage local : l'hôte gardait la voix, la comptait dans allVoted(), et
  // pouvait clore le scrutin pendant que le joueur croyait choisir.
  if (msg.t === "unvote") {
    if (S.phase !== "vote" || msg.turn !== S.turn || msg.round !== S.round) return;
    var uv = si + 1;
    if (S.votes[uv] === undefined) return;
    delete S.votes[uv];
    sendYourVoteTo(uv);
    render();
    return;
  }
  if (msg.t === "mw_answer") {
    if (S.phase !== "mrwhite_guess" || msg.turn !== S.turn) return;
    if (si + 1 !== S.vt) return;                 // seul le Mr. White démasqué répond
    S.mwGuessText = String(msg.guess || "").replace(/[<>&"]/g, "").slice(0, 40);
    SND.ping(); VIB(30);
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

// Un seul chemin pour « ce hello concerne un siège qui existe déjà » — reprise
// par token, rejointure idempotente par joinId, ou hello répété sur une
// connexion déjà assise. Les trois doivent produire exactement le même welcome,
// sinon un client repartirait avec un état partiel selon la porte empruntée.
function attachSeat(si, cid) {
  var seat = S.net.seats[si];

  // REPRISE EXPLICITE. uc_net_client est partagé par tous les onglets d'un même
  // navigateur — et entre la PWA installée et l'onglet ordinaire : deux
  // contextes présentent donc le MÊME token. Sans éviction, ils se volaient
  // seat.connId à tour de rôle et les votes partaient de celui qui avait parlé
  // en dernier. On tranche : le dernier arrivé prend le siège, et l'ancien
  // l'apprend au lieu de continuer à écrire dans le vide.
  //
  // L'ordre compte : on réassigne AVANT de fermer l'ancienne connexion, sinon
  // l'événement de fermeture retrouverait encore le siège par son ancien connId
  // et le marquerait déconnecté — voire le retirerait, en lobby.
  var old = seat.connId;
  seat.connId = cid;
  seat.connected = true;
  seat.lastSeen = Date.now();
  if (old && old !== cid) {
    NET.send(old, { v: PROTO_V, t: "reject", reason: "replaced" });
    NET.kick(old);
  }

  NET.send(cid, { v: PROTO_V, t: "welcome", build: (typeof BUILD === "string" ? BUILD : ""), token: seat.token, playerId: si + 1, roomCode: S.net.code, state: snapshot() });
  // Il revient en pleine partie : on lui renvoie immédiatement son mot, son
  // vote et l'état du timer, sinon il resterait devant un écran vide — ou, pire,
  // devant un écran qui lui propose de voter alors que c'est déjà fait.
  if (S.phase !== "lobby" && S.alive.indexOf(si + 1) !== -1) {
    sendSecretTo(si + 1);
    sendYourVoteTo(si + 1);
    if (S.timer && S.trem > 0) NET.send(cid, { v: PROTO_V, t: "timer", action: "start", remaining: S.trem });
  }
  render();
}

function hostHello(cid, msg) {
  // 1. Reprise par token — le joueur revient avec son identité.
  var si = msg.token ? seatByToken(msg.token) : -1;

  // 2. Rejointure idempotente par joinId. Le token n'existe qu'À PARTIR du
  //    welcome : si le canal meurt entre le hello et le welcome, le client
  //    revient avec un token toujours nul, sur une NOUVELLE connexion — et
  //    créait donc un second siège. Le joinId, tiré par le client avant son
  //    premier hello, donne à l'hôte de quoi reconnaître la même tentative.
  if (si === -1 && msg.joinId) si = seatByJoinId(msg.joinId);

  // 3. Hello répété sur une connexion qui possède déjà un siège. Sans ce
  //    garde-fou, une seule connexion pouvait s'attribuer les douze sièges en
  //    envoyant douze hello — et comme sendSecretTo() vise seat.connId, elle
  //    recevait au lancement autant de mots secrets que de sièges. Deux
  //    suffisaient : deux mots différents, c'est toute la paire.
  if (si === -1) si = seatByConn(cid);

  if (si !== -1) {
    // Un siège exclu ne se rouvre JAMAIS. Sans ça, l'exclu relançait
    // l'application et récupérait sa place : son token restait valide.
    if (S.net.seats[si].kicked) { NET.send(cid, { v: PROTO_V, t: "reject", reason: "kicked" }); return; }
    attachSeat(si, cid);
    return;
  }

  if (S.phase !== "lobby") { NET.send(cid, { v: PROTO_V, t: "reject", reason: "started" }); return; }
  if (S.net.seats.length >= MAX_MULTI) { NET.send(cid, { v: PROTO_V, t: "reject", reason: "full" }); return; }

  var name = cleanName(msg.name);
  if (nameTaken(name)) { NET.send(cid, { v: PROTO_V, t: "reject", reason: "name_taken" }); return; }

  var tok = newToken();
  S.net.seats.push({ token: tok, joinId: msg.joinId || null, name: name, connId: cid, connected: true, isHost: false, lastSeen: Date.now() });
  syncRoster();
  NET.send(cid, { v: PROTO_V, t: "welcome", build: (typeof BUILD === "string" ? BUILD : ""), token: tok, playerId: S.net.seats.length, roomCode: S.net.code, state: snapshot() });
  SND.ping(); VIB(20);
  render();
}

function hostOnClose(cid) {
  if (!S.net) return;
  var si = seatByConn(cid);
  if (si === -1) return;
  if (S.phase === "lobby") {
    S.net.seats.splice(si, 1);   // parti avant le début : on libère le siège
    pushSeatIds();               // les suivants ont reculé d'un cran
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

// « Pour qui ai-je voté ? » suit exactement le même chemin qu'un mot secret :
// message CIBLÉ, jamais le snapshot. Le snapshot ne publie que votedIds — qui a
// voté, jamais pour qui — et c'est ce qui rend le vote secret ; y glisser la
// cible, même une seule, ruinerait la propriété.
//
// Sans ça, le client déduisait son propre vote d'une variable locale que rien ne
// persistait : un téléphone verrouillé pendant le vote — le cas NORMAL —
// revenait sur un écran « à toi de voter » alors que sa voix était déjà comptée.
function sendYourVoteTo(pid) {
  if (S.mode !== "host" || !S.net) return;
  var seat = S.net.seats[pid - 1];
  if (!seat || seat.isHost || !seat.connId) return;
  var v = S.votes ? S.votes[pid] : undefined;
  NET.send(seat.connId, {
    v: PROTO_V, t: "yourvote",
    turn: S.turn, round: S.round || 0,
    target: v === undefined ? null : v
  });
}

function sendSecrets() {
  if (S.mode !== "host" || !S.net) return;
  S.tp.forEach(function (t) { sendSecretTo(t.id); });
}

// ══════════════════════════════════════════════════════════════
// PINGS — relayés et arbitrés par l'hôte
// ══════════════════════════════════════════════════════════════
// NOM DU MESSAGE : "buzz"/"buzzed", surtout PAS "ping"/"pong" — ces deux-là
// appartiennent au battement de cœur de la reconnexion, traité en tête de
// hostOnMsg, qui intercepterait le message avant d'arriver ici.
// ══════════════════════════════════════════════════════════════
// Topologie en étoile : les joueurs ne se parlent pas directement. L'hôte
// valide l'expéditeur par sa CONNEXION, jamais par l'identifiant annoncé —
// même règle que pour les votes et les indices.
//
// Deux portées, deux sens :
//   to === 0  → public  : « je montre ce que je pense », compté dans pingTally
//                          et donc visible de toute la table
//   to  >  0  → privé   : « je te mets la pression », message CIBLÉ, jamais
//                          dans le snapshot qui est diffusé à tous
var _pingLast = {};

function pingGapMs() { return S.pingGap > 0 ? S.pingGap : 5000; }

// L'anti-flood vit côté hôte : un client modifié ne peut pas le contourner.
function pingReady(from) {
  var last = _pingLast[from] || 0;
  return Date.now() - last >= pingGapMs();
}

function hostPing(from, to, emoji, pub) {
  if (!S.pingOn || !S.net) return;
  if (emoji !== "bell" && emoji !== "skull") return;
  to = to | 0;
  if (to !== 0 && !S.net.seats[to - 1]) return;
  if (to === from) return;                      // se pinger soi-même n'a aucun sens
  if (!pingReady(from)) return;                 // trop tôt : ignoré en silence
  _pingLast[from] = Date.now();

  // Viser tout le monde est public par nature.
  var isPub = (to === 0) || !!pub;

  if (isPub) {
    if (to !== 0) {
      // Le décompte matérialise la pression du groupe et survit au bandeau.
      S.pingTally = S.pingTally || {};
      var t = S.pingTally[to] || { bell: 0, skull: 0 };
      t[emoji] = (t[emoji] || 0) + 1;
      S.pingTally[to] = t;
    }
    NET.broadcast({ v: PROTO_V, t: "buzzed", from: from, to: to, emoji: emoji, pub: true });
    if (S.mode === "host") showPingToast(from, to, emoji, true);
    render();
    return;
  }

  // Privé : la cible SEULE est servie, par message ciblé — jamais par le
  // snapshot, qui est diffusé à tout le monde. Même précaution que les mots.
  var seat = S.net.seats[to - 1];
  if (to === 1) showPingToast(from, to, emoji, false);
  else if (seat && seat.connId) NET.send(seat.connId, { v: PROTO_V, t: "buzzed", from: from, to: to, emoji: emoji, pub: false });
  render();
}

// ══════════════════════════════════════════════════════════════
// IDENTITÉ DES SIÈGES
// ══════════════════════════════════════════════════════════════
// Les sièges sont un tableau ordonné (playerId = index + 1). Retirer un siège
// décale donc TOUS les suivants. Or playerId n'était transmis qu'une fois, dans
// le welcome : un client resté connecté gardait un identifiant périmé et se
// croyait être quelqu'un d'autre — jusqu'à s'afficher éliminé à la place d'un
// autre, puisque C.playerId pilote aussi l'écran affiché.
//
// À appeler après TOUTE mutation du tableau des sièges.
function pushSeatIds() {
  if (S.mode !== "host" || !S.net) return;
  S.net.seats.forEach(function (s, i) {
    if (s.isHost || !s.connId) return;
    NET.send(s.connId, { v: PROTO_V, t: "seat", playerId: i + 1 });
  });
}

function kickPlayer(pid) {
  if (!S.net) return;
  var s = S.net.seats[pid - 1];
  if (!s || s.isHost) return;
  if (s.connId) NET.send(s.connId, { v: PROTO_V, t: "reject", reason: "kicked" });
  if (s.connId) NET.kick(s.connId);
  if (S.phase === "lobby") { S.net.seats.splice(pid - 1, 1); pushSeatIds(); }
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

// Un code d'erreur brut ("timeout", "network") n'aide personne : on dit ce qui
// s'est passé ET quoi faire.
function netErrLabel(e) {
  switch (e) {
    case "offline": return "Aucune connexion Internet. Le multi-appareils a besoin d'un serveur d'annuaire pour relier les téléphones entre eux — même s'ils sont côte à côte. Le mode « un seul téléphone », lui, fonctionne hors ligne.";
    case "lib": return "La bibliothèque réseau n'a pas pu être chargée. Vérifie que le dossier <strong>vendor/</strong> est bien déployé sur le serveur.";
    case "timeout": return "Le serveur d'annuaire n'a pas répondu en 12 s. Vérifie ta connexion Internet — le multi-appareils en a besoin pour établir la liaison, même entre téléphones côte à côte.";
    case "network":
    case "socket-error":
    case "server-error": return "Connexion au serveur d'annuaire impossible. Ton réseau bloque peut-être les WebSockets (WiFi d'entreprise, VPN, bloqueur de pub).";
    case "browser-incompatible": return "Ce navigateur ne gère pas WebRTC. Essaie Chrome, Firefox ou Safari à jour.";
    case "ssl-unavailable": return "Le multi-appareils exige HTTPS.";
    case "no-room": return "Aucune salle ne porte ce code. Vérifie-le, ou demande à l'hôte de rouvrir la salle.";
    default: return "Erreur réseau (" + (e || "?") + ").";
  }
}

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
