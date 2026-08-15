// ══════════════════════════════════════════════════════════════
// CLIENT — état C et rendu des écrans joueur
// ══════════════════════════════════════════════════════════════
// Le client est un terminal passif : il ne connaît ni les rôles, ni la paire de
// mots, ni la liste des joueurs du moteur. Il n'a QUE ce que l'hôte lui envoie.
// D'où un état `C` séparé de `S` : mélanger les deux rendrait flou ce qui est
// digne de confiance. On pose malgré tout S.mode="client" et on remplit S.nm
// depuis le roster pour réutiliser tel quel N(), TF(), G(), SND, VIB…

var C = {
  screen: "join",   // join | connecting | lobby | word | vote | waiting | recap | over | dead | rejected | error
  code: null,
  token: null,
  playerId: null,
  name: "",
  link: "offline",  // offline | connecting | online | reconnecting | dead
  snap: null,
  secret: null,     // {turn, word, isMrWhite, category} — mis en cache local
  wordShown: false,
  myVote: null,
  err: null
};

function loadClientSave() {
  try { return JSON.parse(localStorage.getItem("uc_net_client") || "null"); } catch (e) { return null; }
}
function saveClientSave() {
  try {
    localStorage.setItem("uc_net_client", JSON.stringify({
      code: C.code, token: C.token, playerId: C.playerId, name: C.name, secret: C.secret
    }));
  } catch (e) {}
}
function clearClientSave() { try { localStorage.removeItem("uc_net_client"); } catch (e) {} }

// Reprend le roster reçu dans S.nm pour que N() fonctionne côté client.
function adoptRoster() {
  if (!C.snap || !C.snap.roster) return;
  S.nm = {};
  C.snap.roster.forEach(function (r) { S.nm[r.id] = r.name; });
}

// ══════════════════════════════════════════════════════════════
// RECONNEXION
// ══════════════════════════════════════════════════════════════
// Un téléphone verrouillé pendant le débat, c'est le cas NORMAL, pas un cas
// limite. L'écran n'est donc jamais vidé pendant une reconnexion : le mot reste
// lisible depuis C.secret, mis en cache local. Le lien n'est requis que pour
// envoyer un vote et recevoir un nouveau snapshot.
var RETRY_MS = [1000, 2000, 4000, 8000];
function retryDelay(n) {
  return RETRY_MS[Math.min(n, RETRY_MS.length - 1)] + Math.floor(Math.random() * 400); // gigue
}

function clientHandlers() {
  return {
    onOpen: function () {
      C.link = "online"; C._retries = 0; C._lastSeen = Date.now();
      NET.toHost({ v: PROTO_V, t: "hello", token: C.token, name: C.name });
      startHeartbeat();
      render();
    },
    onMsg: clientOnMsg,
    onClose: function () { dropLink(); },
    onError: function (e) {
      C.err = e;
      // Sans token on n'a jamais réussi à entrer : code faux ou salle absente,
      // c'est définitif. Avec un token, l'hôte recharge peut-être sa page —
      // on continue de retenter, sa salle rouvrira sur le même code.
      if (!C.token) {
        C.screen = (e === "no-room") ? "rejected" : "error";
        C.link = "dead"; stopHeartbeat(); render(); return;
      }
      dropLink();
    }
  };
}

function dropLink() {
  if (C.link === "dead") return;
  C.link = "reconnecting";
  render();
  scheduleReconnect();
}

function scheduleReconnect() {
  if (C.link === "dead" || C._rtid) return;
  var d = retryDelay(C._retries || 0);
  C._retries = (C._retries || 0) + 1;
  C._rtid = setTimeout(function () {
    C._rtid = null;
    if (C.link === "dead" || C.link === "online") return;
    NET.join(C.code, clientHandlers());   // l'adaptateur détruit et reconstruit le Peer
  }, d);
}

// Retour à l'écran : on retente tout de suite, sans attendre le backoff.
function clientWakeUp() {
  if (C.link === "online" || C.link === "dead" || !C.code || !C.token) return;
  C._retries = 0;
  if (C._rtid) { clearTimeout(C._rtid); C._rtid = null; }
  NET.join(C.code, clientHandlers());
}

// Un silence prolongé signale un lien mort même quand onClose n'a jamais été
// appelé — iOS suspend l'onglet sans rien notifier.
function startHeartbeat() {
  stopHeartbeat();
  C._hb = setInterval(function () {
    if (C.link !== "online") return;
    if (Date.now() - (C._lastSeen || 0) > 15000) { dropLink(); return; }
    NET.toHost({ v: PROTO_V, t: "ping" });
  }, 5000);
}
function stopHeartbeat() { if (C._hb) { clearInterval(C._hb); C._hb = null; } }

function clientJoin(code, name) {
  S.mode = "client";
  C.code = String(code || "").toUpperCase().trim();
  C.name = cleanName(name);
  C.screen = "connecting";
  C.link = "connecting";
  C.err = null;
  C._retries = 0;

  if (!NET.use("peerjs")) { C.screen = "error"; C.err = "lib"; render(); return; }
  requestWake();
  NET.join(C.code, clientHandlers());
  render();
}

function clientOnMsg(msg) {
  if (!msg || msg.v !== PROTO_V) return;
  C._lastSeen = Date.now();

  if (msg.t === "welcome") {
    C.token = msg.token; C.playerId = msg.playerId; C.code = msg.roomCode;
    C.snap = msg.state; C.link = "online";
    adoptRoster(); syncClientScreen();
    saveClientSave(); SND.ping(); VIB(20); render();
    return;
  }
  if (msg.t === "reject") {
    C.screen = "rejected"; C.err = msg.reason; C.link = "dead";
    stopHeartbeat();
    if (C._rtid) { clearTimeout(C._rtid); C._rtid = null; }
    clearClientSave(); NET.destroy(); releaseWake(); render();
    return;
  }
  if (msg.t === "state") {
    C.snap = msg.state; C.link = "online";
    adoptRoster(); syncClientScreen(); render();
    return;
  }
  if (msg.t === "secret") {
    C.secret = { turn: msg.turn, word: msg.word, isMrWhite: msg.isMrWhite, category: msg.category };
    C.wordShown = false; saveClientSave(); requestWake(); render();
    return;
  }
  if (msg.t === "pong") { C.link = "online"; return; }
}

// Fait suivre l'écran client à la phase annoncée par l'hôte.
function syncClientScreen() {
  var p = C.snap && C.snap.phase;
  if (!p) return;
  if (p === "lobby" || p === "setup") { C.screen = "lobby"; return; }
  var me = C.snap.roster.filter(function (r) { return r.id === C.playerId; })[0];
  if (me && !me.alive) { C.screen = "dead"; return; }
  if (p === "playing") { C.screen = "word"; return; }
  if (p === "vote") { C.screen = "vote"; return; }
  if (p === "turn_recap") { C.screen = "recap"; return; }
  if (p === "game_over") { C.screen = "over"; return; }
}

function clientLeave() {
  NET.toHost({ v: PROTO_V, t: "leave" });
  C.link = "dead";
  stopHeartbeat();
  if (C._rtid) { clearTimeout(C._rtid); C._rtid = null; }
  NET.destroy(); clearClientSave(); releaseWake();
  S.mode = "solo"; C.screen = "join"; C.token = null; C.snap = null; C.secret = null;
  C.link = "offline"; C._retries = 0;
  location.hash = "";
  S.phase = "splash";
  render();
}

// Reprise après fermeture complète de l'app : le token en localStorage permet
// de retrouver son siège et son mot sans repasser par le lobby.
function clientResume() {
  var sv = loadClientSave();
  if (!sv || !sv.code || !sv.token) return false;
  S.mode = "client";
  C.code = sv.code; C.token = sv.token; C.playerId = sv.playerId;
  C.name = sv.name || ""; C.secret = sv.secret || null;
  C.screen = "connecting"; C.link = "connecting"; C._retries = 0;
  if (!NET.use("peerjs")) { C.screen = "error"; C.err = "lib"; render(); return true; }
  requestWake();
  NET.join(C.code, clientHandlers());
  render();
  return true;
}

// ══════════════════════════════════════════════════════════════
function linkPill() {
  if (C.link === "online") return "";
  var t = C.link === "reconnecting" ? "⟳ Reconnexion…" : C.link === "connecting" ? "⟳ Connexion…" : "⚠ Hors ligne";
  return '<div class="link-pill">' + t + "</div>";
}

function rosterList() {
  if (!C.snap || !C.snap.roster) return "";
  return '<div class="flex gap4 flex-wrap flex-center mb10">' + C.snap.roster.map(function (r) {
    return '<span class="chip' + (r.connected ? "" : " off") + (r.id === C.playerId ? " me" : "") + '">' +
      (r.host ? "👑 " : "") + r.name + (r.id === C.playerId ? " (toi)" : "") + "</span>";
  }).join("") + "</div>";
}

var REJECT_MSG = {
  full: "La partie est complète.",
  started: "La partie a déjà commencé.",
  name_taken: "Ce pseudo est déjà pris.",
  kicked: "L'hôte t'a retiré de la partie.",
  "no-room": "Aucune partie trouvée avec ce code.",
  unknown_token: "Session expirée.",
  version: "Version incompatible — recharge la page."
};

function renderClient() {
  var s = C.screen;

  if (s === "join") {
    app.innerHTML = '<div class="hline"></div>' +
      '<div class="mb20">' + G("REJOINDRE", "orb fs26 fw900 ls4 color-cyan text-shadow-cyan") + '<p class="subtitle-red">// NIGHT CITY EDITION</p></div>' +
      '<div class="icon-big">📡</div>' +
      '<div class="setup-section"><label class="lbl"><span class="lbl-a">01</span> CODE DE LA PARTIE</label>' +
      '<input type="text" id="jcode" class="code-input" maxlength="6" autocapitalize="characters" autocomplete="off" placeholder="XK7P2M" value="' + (C.code || "") + '"></div>' +
      '<div class="setup-section"><label class="lbl"><span class="lbl-a">02</span> TON PSEUDO</label>' +
      '<input type="text" id="jname" maxlength="20" placeholder="Ton prénom" value="' + (C.name || "") + '"></div>' +
      (C.err ? '<p class="err-msg">⚠ ' + (REJECT_MSG[C.err] || C.err) + "</p>" : "") +
      '<button class="btn glow" onclick="var c=document.getElementById(\'jcode\').value,n=document.getElementById(\'jname\').value;if(!c.trim()||!n.trim()){C.err=\'Code et pseudo requis.\';render();return}clientJoin(c,n)">▶ REJOINDRE</button>' +
      '<button class="btn ghost" onclick="S.mode=\'solo\';location.hash=\'\';S.phase=\'splash\';render()">← Retour</button>' +
      '<div class="fline"></div>';
    return;
  }

  if (s === "connecting") {
    app.innerHTML = '<div class="hline"></div><div class="icon-big">📡</div>' +
      '<h2 class="orb fs18 fw700 color-cyan m8-0">' + G("CONNEXION…") + "</h2>" +
      '<p class="color-dim fs13 mb16">Salle <span class="color-cyan">' + (C.code || "") + "</span></p>" +
      '<div class="pbar"><div class="pbar-fill indet"></div></div>' +
      '<button class="btn ghost mt6" onclick="clientLeave()">Annuler</button><div class="fline"></div>';
    return;
  }

  if (s === "rejected" || s === "error") {
    app.innerHTML = '<div class="hline"></div><div class="icon-big">🚫</div>' +
      '<h2 class="orb fs18 fw700 color-red m8-0">' + G("CONNEXION REFUSÉE") + "</h2>" +
      '<p class="color-dim6 fs14 lh15 mb16">' + (REJECT_MSG[C.err] || "Connexion impossible.") + "</p>" +
      '<button class="btn" onclick="C.screen=\'join\';C.err=null;C.link=\'offline\';render()">← Réessayer</button>' +
      '<div class="fline"></div>';
    return;
  }

  if (s === "lobby") {
    var n = C.snap ? C.snap.roster.length : 0;
    app.innerHTML = '<div class="hline"></div>' + linkPill() +
      '<span class="tag">SALLE ' + (C.code || "") + "</span>" +
      '<div class="icon-big">⏳</div>' +
      '<h2 class="orb fs17 fw700 color-cyan m8-0">' + G("EN ATTENTE") + "</h2>" +
      '<p class="color-dim fs13 mb12">L\'hôte configure la partie…</p>' +
      '<p class="orb fs10 color-dim3 ls2 mb6">' + n + " JOUEUR" + (n > 1 ? "S" : "") + " CONNECTÉ" + (n > 1 ? "S" : "") + "</p>" +
      rosterList() +
      '<button class="btn ghost mt6" onclick="showConfirm(\'Quitter la partie ?\',clientLeave)">✕ Quitter</button>' +
      '<div class="fline"></div>';
    return;
  }

  // Écrans de jeu (word / vote / recap / over / dead) — implémentés en P3-P5.
  app.innerHTML = '<div class="hline"></div>' + linkPill() +
    '<div class="icon-big">🎮</div>' +
    '<h2 class="orb fs16 fw700 color-cyan m8-0">EN JEU</h2>' +
    '<p class="color-dim fs13 mb16">Écran « ' + s + ' » — à venir.</p>' +
    rosterList() +
    '<button class="btn ghost" onclick="showConfirm(\'Quitter la partie ?\',clientLeave)">✕ Quitter</button>' +
    '<div class="fline"></div>';
}

// Détecte #j=CODE dans l'URL (QR scanné ou lien partagé) et bascule en client.
function bootFromHash() {
  var m = (location.hash || "").match(/^#j=([A-Za-z0-9]{4,10})$/);
  if (!m) return false;
  S.mode = "client";
  C.code = m[1].toUpperCase();
  var sv = loadClientSave();
  // Déjà connu de cette salle : on se reconnecte sans repasser par le pseudo.
  if (sv && sv.code === C.code && sv.token) {
    C.token = sv.token; C.playerId = sv.playerId;
    C.name = sv.name || ""; C.secret = sv.secret || null;
    C.screen = "connecting"; C.link = "connecting"; C._retries = 0;
    if (NET.use("peerjs")) { requestWake(); NET.join(C.code, clientHandlers()); }
    return true;
  }
  if (sv && sv.code === C.code) C.name = sv.name || "";
  C.screen = "join";
  return true;
}
