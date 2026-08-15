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
    var prev = C.snap ? C.snap.phase : null;
    C.snap = msg.state; C.link = "online";
    adoptRoster(); syncClientScreen();
    clientPhaseFX(prev, msg.state.phase);
    render();
    return;
  }
  if (msg.t === "secret") {
    C.secret = { turn: msg.turn, word: msg.word, isMrWhite: msg.isMrWhite, category: msg.category };
    C.wordShown = false; saveClientSave(); requestWake(); render();
    return;
  }
  if (msg.t === "timer") {
    if (msg.action === "start") clientTimerStart(msg.remaining);
    else clientTimerStop();
    render();
    return;
  }
  if (msg.t === "pong") { C.link = "online"; return; }
}

// Décompte local, démarré à la réception : seule la latence (~50 ms) joue,
// pas le décalage d'horloge entre les téléphones.
function clientTimerStop() {
  if (C.timer && C.timer.tid) { clearInterval(C.timer.tid); C.timer.tid = null; }
}
function clientTimerStart(rem) {
  clientTimerStop();
  C.timer = C.timer || {};
  C.timer.rem = rem || 0;
  if (!C.timer.rem) return;
  C.timer.tid = setInterval(function () {
    C.timer.rem--;
    var el = document.getElementById("ctdisp");
    if (!el) return;                       // pas à l'écran : on continue de compter
    if (C.timer.rem <= 0) {
      clientTimerStop(); C.timer.rem = 0;
      el.className = "timer-disp done"; el.textContent = "VOTEZ !";
      SND.alarm(); VIB([100, 60, 100, 60, 100]);
      return;
    }
    el.textContent = TF(C.timer.rem);
    el.className = "timer-disp" + (C.timer.rem <= 10 ? " urgent" : "");
  }, 1000);
}

// Aucun avertissement local avant l'envoi : prévenir « ton indice contient ton
// mot » rendrait la règle décorative, plus personne ne se ferait prendre.
function clientClue() {
  var el = document.getElementById("clue");
  if (!el || !el.value.trim()) return;
  NET.toHost({ v: PROTO_V, t: "clue", text: el.value.trim(), turn: C.snap.turn });
  el.value = "";
  SND.click(); VIB(20);
}

// Indices déjà donnés, dans l'ordre de parole.
function cluesBoard() {
  if (!C.snap || !C.snap.writeClues) return "";
  var cl = C.snap.clues || {};
  var ids = (C.snap.speakOrder || []).filter(function (id) { return cl[id]; });
  if (!ids.length) return '<p class="color-dim3 fs12 mb6">Aucun indice donné pour l\'instant.</p>';
  return '<div class="clue-list mb6">' + ids.map(function (id) {
    return '<div class="clue-row"><span class="clue-nm">' + (S.nm[id] || "?") + "</span>" +
           '<span class="clue-tx">' + cl[id] + "</span></div>";
  }).join("") + "</div>";
}

function clientSpoke() {
  var mine = C.snap && C.snap.spoken.indexOf(C.playerId) !== -1;
  NET.toHost({ v: PROTO_V, t: "spoke", on: !mine });
}

// Fait suivre l'écran client à la phase annoncée par l'hôte.
function syncClientScreen() {
  var p = C.snap && C.snap.phase;
  if (!p) return;
  if (p === "lobby" || p === "setup") { C.screen = "lobby"; return; }
  var me = C.snap.roster.filter(function (r) { return r.id === C.playerId; })[0];
  if (me && !me.alive) { C.screen = "dead"; return; }
  if (p === "playing") { C.screen = "word"; return; }
  if (p === "vote") {
    // Nouveau tour de vote (ou revote) : on repart d'un choix vierge.
    var v = C.snap.vote || {};
    if (C._voteKey !== C.snap.turn + ":" + (v.round || 0)) {
      C._voteKey = C.snap.turn + ":" + (v.round || 0);
      C.myVote = null;
    }
    C.screen = "vote"; return;
  }
  if (p === "vote_result") { C.screen = "result"; return; }
  if (p === "mrwhite_guess") {
    C.screen = (C.snap.mw && C.snap.mw.playerId === C.playerId) ? "mw" : "mwwait";
    return;
  }
  if (p === "turn_recap") { C.screen = "recap"; return; }
  if (p === "game_over") { C.screen = "over"; return; }
}

// Sons et vibrations sur les transitions marquantes, comme en mono-téléphone.
function clientPhaseFX(prev, now) {
  if (prev === now) return;
  if (now === "vote") { SND.ping(); VIB(40); }
  else if (now === "vote_result") { SND.click(); VIB(30); }
  else if (now === "turn_recap") { SND.elim(); VIB([80, 40, 120]); }
  else if (now === "game_over") {
    var w = C.snap && C.snap.gameOver ? C.snap.gameOver.winner : null;
    SND.win(w); VIB([100, 50, 100, 50, 200]);
  }
}

function clientMwSend() {
  var el = document.getElementById("mwg");
  if (!el || !el.value.trim()) return;
  NET.toHost({ v: PROTO_V, t: "mw_answer", guess: el.value.trim(), turn: C.snap.turn });
  SND.click(); VIB(30);
}

function clientVote(target) {
  if (!C.snap) return;
  C.myVote = target;
  NET.toHost({ v: PROTO_V, t: "vote", target: target, turn: C.snap.turn, round: (C.snap.vote && C.snap.vote.round) || 0 });
  SND.click(); VIB(30);
  render();
}

function renderClientVote() {
  var v = C.snap.vote || {};
  var cands = v.candidates || [];
  var voted = v.votedIds || [];
  var iVoted = C.myVote !== null && C.myVote !== undefined;
  var waiting = (C.snap.roster || []).filter(function (r) {
    return r.alive && r.connected && voted.indexOf(r.id) === -1;
  });

  app.innerHTML = '<div class="hline"></div>' + linkPill() +
    '<div class="flex flex-between mb10"><span class="tag">TOUR ' + C.snap.turn + '</span>' +
    '<span class="tag">' + voted.length + "/" + (C.snap.roster || []).filter(function (r) { return r.alive && r.connected; }).length + " VOTES</span></div>" +
    '<h2 class="orb fs18 fw700 color-red mb6">' + G(v.round ? "REVOTE" : "À TON TOUR DE VOTER") + "</h2>" +
    '<p class="color-dim4 fs13 mb12">' + (v.round ? "Égalité — départage entre les ex æquo." : "Ton vote est secret.") + "</p>" +
    (iVoted
      ? '<div class="icon-med">🗳️</div><p class="color-cyan fs15 fw600 mb6">Tu as voté ' +
        (C.myVote === -1 ? "« personne »" : "pour <strong>" + (S.nm[C.myVote] || "?") + "</strong>") + "</p>" +
        '<button class="btn ghost mb10" onclick="C.myVote=null;render()">↺ Changer mon vote</button>' +
        (waiting.length ? '<p class="color-dim fs12">En attente de ' + waiting.map(function (r) { return r.name; }).join(", ") + "</p>"
                        : '<p class="color-cyan fs13">Tout le monde a voté — dépouillement…</p>')
      : '<div class="flex flex-col gap6 mb10">' + cands.map(function (id) {
          return '<button class="vote-btn" onclick="clientVote(' + id + ')"><span>' + (S.nm[id] || ("Joueur " + id)) +
                 (id === C.playerId ? " (toi)" : "") + "</span></button>";
        }).join("") +
        (v.skipAllowed ? '<button class="vote-btn skip" onclick="clientVote(-1)"><span>🚫 Personne</span></button>' : "") + "</div>") +
    '<button class="btn-abandon" onclick="showConfirm(\'Quitter la partie ?\',clientLeave)">✕ Quitter</button>' +
    '<div class="fline"></div>';
}

function renderClientResult() {
  var v = C.snap.vote || {};
  var rows = v.rows || [];
  var top = rows.length ? rows[0].count : 1;
  app.innerHTML = '<div class="hline"></div>' + linkPill() +
    '<span class="tag">TOUR ' + C.snap.turn + "</span>" +
    '<h2 class="orb fs18 fw700 color-cyan m8-0">' + G("DÉPOUILLEMENT") + "</h2>" +
    (rows.length ? '<div class="tally mb8">' + rows.map(function (r) {
      return '<div class="tally-row"><span class="tally-nm">' + (r.target === -1 ? "🚫 Personne" : (S.nm[r.target] || "?")) + "</span>" +
        '<div class="tally-bg"><div class="tally-bar" id="ctb' + (r.target === -1 ? "X" : r.target) + '"></div></div>' +
        '<span class="orb fs15 fw900 color-cyan min-w24">' + r.count + "</span></div>" +
        (r.voters ? '<p class="tally-voters">' + r.voters.map(function (i) { return S.nm[i] || "?"; }).join(", ") + "</p>" : "");
    }).join("") + "</div>" : '<p class="color-dim fs13 mb8">Aucun vote exprimé.</p>') +
    (v.abstentions ? '<p class="color-dim3 fs12 mb8">' + v.abstentions + " abstention" + (v.abstentions > 1 ? "s" : "") + "</p>" : "") +
    (v.resolved !== null && v.resolved !== undefined
      ? '<p class="color-dim6 fs14 lh15">' + (v.resolved === -1 ? "Personne n'est éliminé." : "<strong class=\"color-white\">" + (S.nm[v.resolved] || "?") + "</strong> est éliminé.") + "</p>"
      : '<p class="color-red fs14 fw600">⚖ Égalité — l\'hôte départage…</p>') +
    '<div class="fline"></div>';
  rows.forEach(function (r) {
    var e = document.getElementById("ctb" + (r.target === -1 ? "X" : r.target));
    if (e) e.style.setProperty("--tw", Math.max(6, Math.round(r.count / top * 100)) + "%");
  });
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

  if (s === "word") return renderClientWord();
  if (s === "vote") return renderClientVote();
  if (s === "result") return renderClientResult();

  if (s === "dead") {
    app.innerHTML = '<div class="hline"></div>' + linkPill() +
      '<span class="tag">TOUR ' + (C.snap ? C.snap.turn : "?") + "</span>" +
      '<div class="icon-big">💀</div>' +
      '<h2 class="orb fs18 fw700 color-red m8-0">' + G("ÉLIMINÉ") + "</h2>" +
      '<p class="color-dim6 fs14 lh15 mb14">Tu es hors jeu — mais tu peux suivre la partie.</p>' +
      speakBoard(true) + rosterList() +
      '<button class="btn ghost" onclick="showConfirm(\'Quitter la partie ?\',clientLeave)">✕ Quitter</button>' +
      '<div class="fline"></div>';
    return;
  }

  if (s === "mw") {
    var sent = C.snap.mw && C.snap.mw.guess;
    app.innerHTML = '<div class="hline"></div>' + linkPill() +
      '<div class="icon-big">🤍</div>' +
      '<h2 class="orb fs18 fw700 color-white m8-0">' + G("TU ES DÉMASQUÉ") + "</h2>" +
      '<p class="color-red fs14 fw600 lh15 mb14">Dernière chance : quel est le mot des civils ?</p>' +
      (sent
        ? '<p class="orb fs11 color-dim4 ls2 mb6">TA PROPOSITION</p>' +
          G(sent, "orb fs22 fw900 color-white text-shadow-white") +
          '<p class="color-dim fs13 mt14">Les autres vérifient…</p>'
        : '<input type="text" id="mwg" maxlength="40" placeholder="Ton mot" autocomplete="off">' +
          '<button class="btn glow mt6" onclick="clientMwSend()">▶ PROPOSER</button>') +
      '<div class="fline"></div>';
    return;
  }

  if (s === "mwwait") {
    var mw = C.snap.mw || {};
    app.innerHTML = '<div class="hline"></div>' + linkPill() +
      '<div class="icon-big">🤍</div>' +
      '<h2 class="orb fs17 fw700 color-white m8-0">' + G("MR. WHITE DÉMASQUÉ") + "</h2>" +
      '<p class="color-dim6 fs14 lh15 mb10">' + (S.nm[mw.playerId] || "?") + " était Mr. White !</p>" +
      (mw.guess
        ? '<p class="orb fs11 color-dim4 ls2 mb6">SA PROPOSITION</p>' +
          G(mw.guess, "orb fs22 fw900 color-white text-shadow-white") +
          '<p class="color-dim fs13 mt14">L\'hôte tranche…</p>'
        : '<p class="color-dim fs13">Il réfléchit à sa proposition…</p>') +
      '<div class="fline"></div>';
    return;
  }

  if (s === "recap") {
    var r = C.snap.recap || {};
    var ok = !r.skipped && r.elimRole && r.elimRole !== "civil";
    var roleLbl = r.elimRole === "civil" ? "👤 Civil" : r.elimRole === "undercover" ? "🕵️ Undercover" : "🤍 Mr. White";
    app.innerHTML = '<div class="hline"></div>' + linkPill() +
      '<span class="tag">FIN DU TOUR ' + C.snap.turn + "</span>" +
      '<div class="icon-med">' + (r.skipped ? "🚫" : ok ? "🎯" : "😬") + "</div>" +
      '<h2 class="orb fs18 fw700 ' + (r.skipped ? "color-dim7" : ok ? "color-cyan" : "color-red") + ' m8-0">' +
      G(r.skipped ? "VOTE NUL" : ok ? "BON CHOIX !" : "MAUVAIS CHOIX...") + "</h2>" +
      (r.skipped
        ? '<p class="color-dim6 fs14 mb6">Personne n\'a été éliminé ce tour.</p>'
        : '<p class="color-dim6 fs14 mb6"><strong class="color-white">' + (S.nm[r.elimId] || "?") + "</strong> était " + roleLbl + "</p>") +
      (r.category ? '<div class="cat-badge mt12">' + r.category + "</div>" : "") +
      (r.pair ? '<div class="words-row"><div class="word-card civ"><span class="wl">MOT CIVIL</span><span class="wv">' + r.pair[0] +
                '</span></div><div class="word-card uc"><span class="wl">MOT UC</span><span class="wv">' + r.pair[1] + "</span></div></div>" : "") +
      '<p class="orb fs10 color-dim3 ls2 mb0">' + r.impostorsLeft + " IMPOSTEUR" + (r.impostorsLeft > 1 ? "S" : "") +
      " RESTANT" + (r.impostorsLeft > 1 ? "S" : "") + "</p>" +
      '<p class="color-dim fs13 mt12">L\'hôte lance le tour suivant…</p>' +
      '<div class="fline"></div>';
    return;
  }

  if (s === "over") {
    var go = C.snap.gameOver || {};
    var cc = go.winner === "civil" ? "color-cyan text-shadow-cyan" : go.winner === "uc" ? "color-red text-shadow-red" : "color-gold text-shadow-gold";
    var ic = go.winner === "civil" ? "👤" : go.winner === "uc" ? "🕵️" : "🤍";
    var lb = go.winner === "civil" ? "VICTOIRE CIVILE" : go.winner === "uc" ? "VICTOIRE UNDERCOVER" : "VICTOIRE MR. WHITE";
    var mine = (go.roles || []).filter(function (x) { return x.id === C.playerId; })[0];
    var won = mine && ((mine.role === "civil" && go.winner === "civil") ||
                       (mine.role === "undercover" && go.winner === "uc") ||
                       (mine.role === "mrwhite" && go.winner === "mrwhite"));
    app.innerHTML = '<div class="hline"></div><div class="icon-big">' + ic + "</div>" +
      '<h1 class="orb fs20 fw900 ls4 m8-0 ' + cc + '">' + G(lb) + "</h1>" +
      '<p class="color-dim6 fs14 lh15 mb6">' + (go.msg || "") + "</p>" +
      (mine ? '<p class="fs15 fw700 ' + (won ? "color-green" : "color-dim5") + ' mb6">' +
              (won ? "🎉 Tu as gagné" : "Tu as perdu") + " — tu étais " +
              (mine.role === "civil" ? "👤 Civil" : mine.role === "undercover" ? "🕵️ Undercover" : "🤍 Mr. White") + "</p>" : "") +
      '<p class="orb fs10 color-dim3 ls2">' + (go.turns || "?") + " TOURS JOUÉS</p>" +
      (go.category ? '<div class="cat-badge mt8">' + go.category + "</div>" : "") +
      (go.pair ? '<div class="words-row"><div class="word-card civ"><span class="wl">MOT CIVIL</span><span class="wv">' + go.pair[0] +
                 '</span></div><div class="word-card uc"><span class="wl">MOT UC</span><span class="wv">' + go.pair[1] + "</span></div></div>" : "") +
      '<div class="role-grid">' + (go.roles || []).map(function (x) {
        var rc = x.role === "mrwhite" ? "rt-mw" : x.role === "undercover" ? "rt-uc" : "rt-civ";
        return '<div class="role-tile ' + rc + '"><span class="orb fs11 fw700">' + (S.nm[x.id] || "?") + "</span>" +
          '<span class="fs10 ' + (x.role === "mrwhite" ? "color-white" : x.role === "undercover" ? "color-red" : "color-cyan") + '">' +
          (x.role === "civil" ? "👤 Civil" : x.role === "undercover" ? "🕵️ UC" : "🤍 Mr.W") + "</span></div>";
      }).join("") + "</div>" +
      '<p class="color-dim fs13 mt12">L\'hôte peut relancer une partie.</p>' +
      '<button class="btn ghost" onclick="showConfirm(\'Quitter la partie ?\',clientLeave)">✕ Quitter</button>' +
      '<div class="fline"></div>';
    return;
  }

  app.innerHTML = '<div class="hline"></div>' + linkPill() +
    '<div class="icon-big">🎮</div>' +
    '<h2 class="orb fs16 fw700 color-cyan m8-0">EN JEU</h2>' +
    '<p class="color-dim fs13 mb16">En attente de l\'hôte…</p>' +
    rosterList() +
    '<button class="btn ghost" onclick="showConfirm(\'Quitter la partie ?\',clientLeave)">✕ Quitter</button>' +
    '<div class="fline"></div>';
}

// Ordre de parole partagé, avec le joueur courant mis en avant.
function speakBoard(readonly) {
  if (!C.snap || !C.snap.speakOrder || !C.snap.speakOrder.length) return "";
  var spoken = C.snap.spoken || [];
  return '<div class="speak-order mb6">' + C.snap.speakOrder.map(function (id, rank) {
    var done = spoken.indexOf(id) !== -1;
    var me = id === C.playerId;
    return '<div class="speak-item' + (done ? " spoke" : "") + (me ? " mine" : "") + '">' +
      '<span class="speak-num orb">' + (done ? "✓" : (rank + 1)) + "</span>" +
      '<span class="speak-name">' + (S.nm[id] || ("Joueur " + id)) + (me ? " (toi)" : "") + "</span></div>";
  }).join("") + "</div>";
}

function renderClientWord() {
  var sec = C.secret;
  var cat = sec && sec.category;
  var mine = C.snap && C.snap.spoken.indexOf(C.playerId) !== -1;

  // Le mot est masqué tant qu'on n'a pas tapé : un regard par-dessus l'épaule
  // ne doit pas suffire à le lire.
  var card = !sec
    ? '<div class="icon-big">⌛</div><p class="color-dim fs13">En attente du mot…</p>'
    : !C.wordShown
      ? '<button class="word-hide" onclick="C.wordShown=true;SND.ping();VIB(40);render()">' +
        '<span class="icon-med">🔒</span><span class="orb fs13 fw700 color-cyan ls2">APPUIE POUR VOIR TON MOT</span></button>'
      : sec.isMrWhite
        ? '<div class="word-open" onclick="C.wordShown=false;render()">' +
          '<p class="orb color-dim4 fs11 ls3 mb10">TON RÔLE :</p>' +
          G("MR. WHITE", "orb fs24 fw900 color-white text-shadow-white flicker") +
          '<p class="color-dim4 fs13 mt14 lh15">Pas de mot. Bluff et essaie de deviner le mot civil !</p>' +
          '<p class="orb fs9 color-dim3 ls2 mt8">TAPE POUR MASQUER</p></div>'
        : '<div class="word-open" onclick="C.wordShown=false;render()">' +
          '<p class="orb color-dim4 fs11 ls3 mb10">TON MOT EST :</p>' +
          G(sec.word, "orb fs24 fw900 color-white text-shadow-cyan flicker") +
          '<p class="orb fs9 color-dim3 ls2 mt8">TAPE POUR MASQUER</p></div>';

  app.innerHTML = '<div class="hline"></div>' + linkPill() +
    '<div class="flex flex-between mb10"><span class="tag">TOUR ' + (C.snap ? C.snap.turn : "?") + '</span>' +
    '<span class="tag">' + (C.snap ? C.snap.roster.filter(function (r) { return r.alive; }).length : "?") + ' EN JEU</span></div>' +
    (cat ? '<div class="cat-badge">' + cat + "</div>" : "") +
    '<div class="m12-0">' + card + "</div>" +
    (C.timer && C.timer.rem ? '<div id="ctdisp" class="timer-disp' + (C.timer.rem <= 10 ? " urgent" : "") + '">' + TF(C.timer.rem) + "</div>" : "") +
    speakBoard() +
    (C.snap.writeClues
      ? cluesBoard() +
        (mine
          ? '<p class="color-dim3 fs12 mb6">Ton indice est enregistré.</p>'
          : '<input type="text" id="clue" maxlength="60" placeholder="Ton indice…" autocomplete="off">' +
            '<button class="btn glow mt6" onclick="clientClue()">▶ DONNER MON INDICE</button>')
      : '<button class="btn' + (mine ? " ghost" : "") + '" onclick="clientSpoke()">' + (mine ? "↺ J'ai encore à dire" : "✓ J'AI PARLÉ") + "</button>") +
    '<button class="btn-abandon" onclick="showConfirm(\'Quitter la partie ?\',clientLeave)">✕ Quitter</button>' +
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
