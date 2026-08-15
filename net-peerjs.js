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
// CONFIGURATION ICE
// ══════════════════════════════════════════════════════════════
// VÉRIFIÉ PAR RÉSOLUTION DNS — ne pas ajouter d'adresse sans la tester :
//
//   ✓ stun.l.google.com        74.125.250.129
//   ✓ stun.cloudflare.com      162.159.207.0
//   ✗ eu-0.turn.peerjs.com     AUCUN enregistrement
//   ✗ us-0.turn.peerjs.com     AUCUN enregistrement
//   ✗ openrelay.metered.ca     AUCUN enregistrement
//
// Les deux relais TURN que PeerJS déclare dans sa propre configuration NE
// RÉSOLVENT PAS. Ils figurent bien dans la bibliothèque, mais aucun relais
// n'est joignable : derrière un NAT symétrique — CGNAT des opérateurs
// mobiles, Free Mobile en tête — la connexion ne peut pas aboutir.
//
// On ne déclare donc QUE du STUN, qui est vérifié. Déclarer un TURN mort ne
// sauve personne et retarde la négociation : le navigateur attend chaque
// serveur injoignable avant de conclure.
//
// POUR COUVRIR LA 4G, il faut un vrai TURN — hébergé (coturn) ou souscrit.
// Il se branche sans toucher au code, via localStorage['uc_ice'] :
//
//   localStorage.setItem('uc_ice', JSON.stringify({ iceServers: [
//     { urls: 'stun:turn.example.fr:3478' },
//     { urls: ['turn:turn.example.fr:443?transport=tcp',
//              'turns:turn.example.fr:443'],
//       username: 'uc', credential: 'secret' }
//   ]}))
//
// Le port 443 en TLS est le seul qui traverse les réseaux les plus filtrants :
// le trafic y est indistinguable d'une connexion HTTPS.
// diag.html mesure ce qui passe réellement et propose de renseigner tout ceci.
var ICE_DEFAULT = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" }
  ]
};

// Surcharge sans modification du code : c'est ici qu'on branche son TURN.
function iceConfig() {
  try {
    var c = JSON.parse(localStorage.getItem("uc_ice") || "null");
    if (c && c.iceServers && c.iceServers.length) return c;
  } catch (e) {}
  return ICE_DEFAULT;
}

// Un TURN est-il configuré ? Sans lui, les joueurs en 4G ne pourront pas
// être joints — l'hôte doit le savoir avant de lancer sa soirée.
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
  function armWatch(ms) {
    clearWatch();
    _watch = setTimeout(function () {
      _watch = null;
      if (_status === "open") return;
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
      openHost((opts && opts.code) || newRoomCode(), 0);
    });
  }

  function openHost(code, tries) {
    killPeer();
    _code = code;
    _status = "opening";
    _peer = new window.Peer("ucgame-" + code, { debug: 0, config: iceConfig() });
    armWatch(12000);

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
      openClient();
    });
  }

  function openClient() {
    killPeer();
    _status = "opening";
    _peer = new window.Peer(null, { debug: 0, config: iceConfig() });   // id aléatoire attribué par le broker
    armWatch(12000);

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
