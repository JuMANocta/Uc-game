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
    _peer = new window.Peer("ucgame-" + code, { debug: 0 });
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
    _peer = new window.Peer(null, { debug: 0 });   // id aléatoire attribué par le broker
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
