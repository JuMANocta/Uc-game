// ══════════════════════════════════════════════════════════════
// Adaptateur PeerJS (WebRTC) — LE SEUL FICHIER QUI MENTIONNE `Peer`
// ══════════════════════════════════════════════════════════════
// Limites connues, assumées et documentées :
//  · HTTPS obligatoire (WebRTC n'existe pas en contexte non sécurisé).
//  · Le broker public peerjs.com sert d'annuaire : Internet est requis pour
//    ÉTABLIR la liaison. Une fois établie, les données passent en direct.
//  · L'espace de noms des ids du broker est MONDIAL et partagé avec tous les
//    utilisateurs de PeerJS — d'où le préfixe "ucgame-" et le retry sur
//    unavailable-id.
//  · Sans serveur TURN, un NAT symétrique (fréquent chez les opérateurs
//    mobiles) empêche la connexion. Sur un WiFi commun, ça passe.

// ══════════════════════════════════════════════════════════════
// OÙ SE TROUVENT LE BROKER ET LE RELAIS
// ══════════════════════════════════════════════════════════════
// Rien n'est codé en dur : tout se déduit de l'adresse de la page. Le jeu
// s'adresse au serveur de SON PROPRE domaine :
//
//   <origine><répertoire>peerjs   annuaire des salles (signaling)
//   <origine><répertoire>ice      identifiants TURN à durée limitée
//
// Déployé sur https://exemple.fr/jeux/uc/, il vise donc /jeux/uc/peerjs et
// /jeux/uc/ice — sans une ligne à changer, et sans qu'aucun nom de domaine
// ne figure dans ce dépôt.
//
// Si ces routes n'existent pas — hébergement purement statique — on retombe
// tout seul sur le broker public et sur du STUN. Le jeu ne peut donc jamais
// être plus cassé qu'il ne l'était.

var BROKER_KEY = "ucnet";   // doit correspondre à la clé déclarée côté serveur

function netBase() {
  var p = location.pathname;
  return p.slice(0, p.lastIndexOf("/") + 1);
}

// null quand viser un serveur propre n'a pas de sens (page en http://).
function brokerConfig() {
  if (location.protocol !== "https:") return null;
  return {
    host:   location.hostname,
    port:   location.port ? Number(location.port) : 443,
    path:   netBase() + "peerjs",
    key:    BROKER_KEY,
    secure: true
  };
}

// ══════════════════════════════════════════════════════════════
// CONFIGURATION ICE
// ══════════════════════════════════════════════════════════════
// Trois sources, par ordre de priorité décroissante :
//
//   1. localStorage['uc_ice']  surcharge manuelle — gagne toujours
//   2. <répertoire>ice         le serveur du domaine, qui délivre des
//                              identifiants TURN valables quelques heures
//   3. ICE_DEFAULT             STUN public seul, dernier recours
//
// Pourquoi le TURN est indispensable : derrière un NAT symétrique — le CGNAT
// des opérateurs mobiles — deux pairs ne peuvent PAS se joindre directement,
// quel que soit l'annuaire utilisé. C'est l'explication des échecs « ça marche
// chez lui mais pas chez moi » : le broker n'y est pour rien, il manquait un
// relais.
//
// VÉRIFIÉ PAR RÉSOLUTION DNS — ne pas ajouter d'adresse sans la tester :
//
//   ✓ stun.l.google.com        74.125.250.129
//   ✓ stun.cloudflare.com      162.159.207.0
//   ✗ eu-0.turn.peerjs.com     AUCUN enregistrement
//   ✗ us-0.turn.peerjs.com     AUCUN enregistrement
//
// Les deux relais TURN que PeerJS déclare dans sa propre configuration NE
// RÉSOLVENT PAS. Ils figurent dans la bibliothèque, mais aucun n'est joignable.
// Déclarer un TURN mort ne sauve personne et retarde la négociation : le
// navigateur attend chaque serveur injoignable avant de conclure.
var ICE_DEFAULT = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" }
  ]
};

var _ice     = null;    // ce que le serveur du domaine a répondu
var _iceDone = false;   // on ne le demande qu'une fois par session

function localIce() {
  try {
    var c = JSON.parse(localStorage.getItem("uc_ice") || "null");
    if (c && c.iceServers && c.iceServers.length) return c;
  } catch (e) {}
  return null;
}

function iceConfig() { return localIce() || _ice || ICE_DEFAULT; }

// Récupère les identifiants TURN AVANT d'ouvrir la moindre connexion : passés
// au constructeur Peer, ils ne peuvent plus être ajoutés après coup.
// Ne bloque jamais plus de 4 s — mieux vaut tenter en STUN seul que laisser
// l'utilisateur devant un écran figé.
function loadIce(cb) {
  if (localIce() || _iceDone || typeof fetch !== "function" || !brokerConfig()) { cb(); return; }
  _iceDone = true;
  var done = false;
  function finish() { if (!done) { done = true; cb(); } }
  var t = setTimeout(finish, 4000);
  fetch(netBase() + "ice", { cache: "no-store", credentials: "omit" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      if (j && j.iceServers && j.iceServers.length) _ice = j;
      clearTimeout(t); finish();
    })
    .catch(function () { clearTimeout(t); finish(); });
}

// Un TURN est-il disponible ? Sans lui, les joueurs en données mobiles ne
// pourront pas être joints — l'hôte doit le savoir avant de lancer sa soirée.
function hasTurn() {
  var s = iceConfig().iceServers || [];
  for (var i = 0; i < s.length; i++) {
    var u = typeof s[i].urls === "string" ? [s[i].urls] : (s[i].urls || []);
    for (var j = 0; j < u.length; j++) if (/^turns?:/.test(u[j])) return true;
  }
  return false;
}

var PeerAdapter = (function () {
  var _peer = null;        // instance PeerJS courante
  var _conns = {};         // connId opaque -> {conn, open}
  var _hostConn = null;    // côté client : la connexion vers l'hôte
  var _nid = 0;
  var _h = null;           // handlers fournis par la façade
  var _mode = null;        // "host" | "client"
  var _status = "off";     // off | loading | opening | open | closed | error
  var _code = null;

  // Tant que _own vaut true, on s'adresse au serveur du domaine. Au premier
  // signe qu'il ne répond pas, on bascule sur le broker public pour le reste
  // de la session : mieux vaut un annuaire public qu'aucune partie.
  var _own = true;
  function fallback() { _own = false; }

  // Pannes qui justifient de changer d'annuaire — et elles seulement. Une
  // erreur applicative (id déjà pris, pair inconnu) se traite autrement.
  function brokerDown(t) {
    return t === "network"      || t === "server-error" ||
           t === "socket-error" || t === "socket-closed" ||
           t === "ssl-unavailable";
  }

  function peerOpts() {
    var o = { debug: 0, config: iceConfig() };
    var b = _own && brokerConfig();
    // Sans ces clés, PeerJS vise son broker public par défaut.
    if (b) { o.host = b.host; o.port = b.port; o.path = b.path; o.key = b.key; o.secure = b.secure; }
    return o;
  }

  // Le serveur du domaine doit répondre vite ; le broker public, lui, a droit
  // à plus de patience — il est plus loin et parfois chargé.
  function watchMs() { return _own ? 7000 : 12000; }

  // PeerJS (90 Ko) n'est chargé qu'au moment où l'utilisateur choisit le mode
  // multi-appareils : le mode solo ne paie rien. Le fichier est malgré tout
  // précaché par le service worker pour fonctionner en PWA installée.
  function hasPeer() { return typeof window.Peer === "function"; }

  function loadLib(cb) {
    if (hasPeer()) { cb(true); return; }
    _status = "loading";
    var s = document.createElement("script");
    s.src = "vendor/peerjs.min.js";
    s.async = true;
    // onload peut se déclencher sur une page d'erreur 404 servie en 200 :
    // on revérifie que le global existe vraiment avant de continuer.
    s.onload = function () { cb(hasPeer()); };
    s.onerror = function () { cb(false); };
    document.head.appendChild(s);
  }

  // Détruire ET reconstruire à chaque tentative. Réutiliser un objet Peer mort
  // ne reconnecte JAMAIS, silencieusement — piège classique de PeerJS.
  function killPeer() {
    clearWatch();
    if (_peer) { try { _peer.destroy(); } catch (e) {} }
    _peer = null;
    _hostConn = null;
    _conns = {};
  }

  // PeerJS peut rester muet indéfiniment : ni "open" ni "error" quand le broker
  // est injoignable ou qu'un réseau filtre les WebSockets. Sans ce chien de
  // garde, l'écran reste bloqué sur « ouverture de la salle » pour toujours.
  var _watch = null;
  function clearWatch() { if (_watch) { clearTimeout(_watch); _watch = null; } }
  function armWatch(ms, onTimeout) {
    clearWatch();
    _watch = setTimeout(function () {
      _watch = null;
      if (_status === "open") return;
      // Un serveur muet ne lève aucune erreur : c'est ici, et nulle part
      // ailleurs, qu'on décide de basculer sur le broker public.
      if (onTimeout) { onTimeout(); return; }
      _status = "error";
      if (_h && _h.onError) _h.onError("timeout");
    }, ms);
  }

  function bindConn(conn) {
    var id = "c" + (++_nid);
    _conns[id] = { conn: conn, open: false };
    conn.on("open", function () {
      if (!_conns[id]) return;
      _conns[id].open = true;
      if (_h && _h.onPeer) _h.onPeer(id);
    });
    conn.on("data", function (d) {
      if (d && typeof d === "object" && _h && _h.onMsg) _h.onMsg(id, d);
    });
    conn.on("close", function () {
      delete _conns[id];
      if (_h && _h.onClose) _h.onClose(id);
    });
    conn.on("error", function () {
      delete _conns[id];
      if (_h && _h.onClose) _h.onClose(id);
    });
  }

  // ---- HÔTE ----------------------------------------------------
  function host(opts, h) {
    _h = h; _mode = "host";
    loadLib(function (ok) {
      if (!ok) { _status = "error"; if (_h.onError) _h.onError("lib"); return; }
      // Les iceServers sont passés au constructeur Peer : les récupérer
      // après coup ne servirait à rien.
      loadIce(function () { openHost((opts && opts.code) || newRoomCode(), 0); });
    });
  }

  function openHost(code, tries) {
    killPeer();
    _code = code;
    _status = "opening";
    _peer = new window.Peer("ucgame-" + code, peerOpts());
    armWatch(watchMs(), _own ? function () { fallback(); openHost(code, tries); } : null);

    _peer.on("open", function () {
      clearWatch();
      _status = "open";
      if (_h.onOpen) _h.onOpen(code);
    });
    _peer.on("connection", bindConn);
    _peer.on("error", function (err) {
      var t = (err && err.type) || "peer";
      // Code déjà pris sur le broker mondial : on en tire un autre.
      if (t === "unavailable-id" && tries < 5) { openHost(newRoomCode(), tries + 1); return; }
      if (_own && brokerDown(t)) { fallback(); openHost(code, tries); return; }
      clearWatch();
      _status = "error";
      if (_h.onError) _h.onError(t);
    });
    _peer.on("disconnected", function () {
      // Lien au broker perdu : les pairs déjà connectés survivent, mais plus
      // aucun nouveau joueur ne peut rejoindre tant qu'on n'est pas revenu.
      if (_peer && !_peer.destroyed) { try { _peer.reconnect(); } catch (e) {} }
    });
  }

  // ---- CLIENT --------------------------------------------------
  function join(code, h) {
    _h = h; _mode = "client"; _code = code;
    loadLib(function (ok) {
      if (!ok) { _status = "error"; if (_h.onError) _h.onError("lib"); return; }
      loadIce(function () { openClient(); });
    });
  }

  function openClient() {
    killPeer();
    _status = "opening";
    _peer = new window.Peer(null, peerOpts());   // id aléatoire attribué par le broker
    armWatch(watchMs(), _own ? function () { fallback(); openClient(); } : null);

    _peer.on("open", function () {
      var conn = _peer.connect("ucgame-" + _code, { reliable: true });
      if (!conn) { clearWatch(); _status = "error"; if (_h.onError) _h.onError("connect"); return; }
      _hostConn = conn;
      conn.on("open", function () { clearWatch(); _status = "open"; if (_h.onOpen) _h.onOpen(); });
      conn.on("data", function (d) { if (d && typeof d === "object" && _h.onMsg) _h.onMsg(d); });
      conn.on("close", function () { _status = "closed"; if (_h.onClose) _h.onClose(); });
      conn.on("error", function () { _status = "closed"; if (_h.onClose) _h.onClose(); });
    });
    _peer.on("error", function (err) {
      var t = (err && err.type) || "peer";
      // « Pair introuvable » ne veut pas dire « salle inexistante » : l'hôte a
      // pu basculer sur le broker public de son côté. On va vérifier là-bas
      // avant d'annoncer au joueur que le code est mauvais.
      if (_own && (brokerDown(t) || t === "peer-unavailable")) { fallback(); openClient(); return; }
      clearWatch();
      _status = "error";
      if (_h.onError) _h.onError(t === "peer-unavailable" ? "no-room" : t);
    });
    _peer.on("disconnected", function () { _status = "closed"; if (_h.onClose) _h.onClose(); });
  }

  // Relance complète, utilisée par la boucle de reconnexion (P2).
  function reopen() {
    if (_mode === "client") openClient();
    else if (_mode === "host" && _code) openHost(_code, 0);
  }

  // ---- ÉMISSION ------------------------------------------------
  function send(connId, msg) {
    var c = _conns[connId];
    if (c && c.open) { try { c.conn.send(msg); } catch (e) {} }
  }
  function broadcast(msg) {
    for (var id in _conns) {
      if (_conns.hasOwnProperty(id) && _conns[id].open) {
        try { _conns[id].conn.send(msg); } catch (e) {}
      }
    }
  }
  function toHost(msg) {
    if (_hostConn && _status === "open") { try { _hostConn.send(msg); } catch (e) {} }
  }
  function kick(connId) {
    var c = _conns[connId];
    if (c) { try { c.conn.close(); } catch (e) {} delete _conns[connId]; }
  }
  function destroy() { killPeer(); _status = "off"; _mode = null; _code = null; _h = null; }
  function status() { return _status; }

  return {
    host: host, join: join, reopen: reopen,
    send: send, broadcast: broadcast, toHost: toHost,
    kick: kick, destroy: destroy, status: status
  };
})();

NET.register("peerjs", PeerAdapter);
