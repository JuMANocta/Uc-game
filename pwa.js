// ══════════════════════════════════════════════════════════════
// PWA — installation, mises à jour, état du réseau
// ══════════════════════════════════════════════════════════════
// Séparé du reste : ni logique de jeu, ni transport. Ce fichier ne parle
// qu'au navigateur et expose trois choses à l'interface — isOnline(),
// canInstall()/doInstall(), et la bannière de mise à jour.

// ── État réseau ───────────────────────────────────────────────
// navigator.onLine ne prouve PAS qu'Internet est joignable : il dit seulement
// qu'une interface réseau existe. En revanche, quand il répond false, on est
// certainement hors ligne — c'est suffisant pour barrer la route au
// multi-appareils avant de lancer une tentative vouée à l'échec.
function isOnline() {
  return typeof navigator.onLine === "boolean" ? navigator.onLine : true;
}

// ── Invite d'installation ─────────────────────────────────────
var _installEvt = null;
function canInstall() { return !!_installEvt; }
function doInstall() {
  if (!_installEvt) return;
  var e = _installEvt;
  _installEvt = null;
  try { e.prompt(); } catch (err) {}
  render();
}

// ── Avis de mise à jour ───────────────────────────────────────
// Le service worker appelle skipWaiting() : la nouvelle version prend la main
// immédiatement, mais la PAGE continue de faire tourner l'ancien code jusqu'au
// rechargement. D'où cet avis plutôt qu'un rechargement d'autorité, qui
// couperait une partie en cours.
//
// Plein écran et centré, pas un bandeau en pied de page : sur un téléphone, ce
// bas d'écran est justement la zone qu'on ne regarde jamais, et un joueur qui
// rate le message reste sur une version incompatible avec celle de l'hôte —
// c'est-à-dire le seul cas où l'avis comptait vraiment. Le fond n'est pas
// cliquable : on veut un choix explicite, « Plus tard » compris.
function showUpdateBanner(msg) {
  if (document.getElementById("upd-banner")) return;
  var b = document.createElement("div");
  b.id = "upd-banner";
  b.className = "upd-ov";
  b.innerHTML = '<div class="upd-box" role="alertdialog" aria-label="Mise à jour">' +
      '<div class="upd-ic">✨</div>' +
      '<div class="upd-msg">' + (msg || "Nouvelle version disponible") + '</div>' +
      '<div class="upd-sub">Recharge pour l\'appliquer. Une partie en cours serait interrompue.</div>' +
      '<button type="button" class="upd-btn" onclick="location.reload()">RECHARGER</button>' +
      '<button type="button" class="upd-later" ' +
      'onclick="document.getElementById(\'upd-banner\').remove()">Plus tard</button>' +
    '</div>';
  document.body.appendChild(b);
}

// Vérification forcée, déclenchée à la connexion à une salle : le navigateur
// ne consulte le service worker que sporadiquement, or un joueur qui scanne un
// QR peut très bien tourner sur une version en cache datant de plusieurs jours.
function checkForUpdate() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.getRegistration().then(function (reg) {
    if (reg && reg.update) { try { reg.update(); } catch (e) {} }
  }).catch(function () {});
}

function installPWA() {
  if (window.addEventListener) {
    // Re-rendre sur changement d'état réseau : la carte multi-appareils doit
    // s'activer et se désactiver toute seule.
    window.addEventListener("online", function () { render(); });
    window.addEventListener("offline", function () { render(); });

    window.addEventListener("beforeinstallprompt", function (e) {
      if (e.preventDefault) e.preventDefault();   // garder la main sur le moment
      _installEvt = e;
      render();
    });
    window.addEventListener("appinstalled", function () { _installEvt = null; render(); });
  }

  if (!("serviceWorker" in navigator)) return;

  // DEUX questions différentes, et c'est tout le sujet. Les confondre a produit
  // successivement les deux défauts opposés.
  //
  //   a) « Un worker était-il aux commandes au CHARGEMENT de cette page ? »
  //      Instantané pris maintenant. Sert UNIQUEMENT à museler
  //      `controllerchange` : sw.js appelle skipWaiting() puis clients.claim(),
  //      donc à la toute première visite le contrôleur passe de null au worker
  //      fraîchement installé — un événement rigoureusement identique à celui
  //      d'une vraie mise à jour. Sans cet instantané, chaque nouveau joueur se
  //      voyait annoncer une « nouvelle version » à sa première connexion.
  //
  //   b) « Un ANCIEN worker est-il en train d'être remplacé, là, maintenant ? »
  //      Question posée au moment où le nouveau worker atteint l'état
  //      `installed`, en relisant `controller` À CET INSTANT. À une première
  //      installation il vaut null (la prise de contrôle n'a pas encore eu
  //      lieu) ; à une mise à jour il désigne le worker sortant.
  //
  // Utiliser l'instantané (a) pour répondre à (b) fige la réponse à l'état du
  // chargement : une page ouverte AVANT que le service worker n'existe garde
  // « pas de contrôleur » pour toute sa vie, et n'annonce plus jamais aucune
  // mise à jour — y compris celles qui s'installent sous ses yeux.
  var hadController = !!navigator.serviceWorker.controller;
  function replacingOlder() { return !!navigator.serviceWorker.controller; }

  navigator.serviceWorker.register("./sw.js").then(function (reg) {
    // Une version déjà en attente au chargement.
    if (reg.waiting && replacingOlder()) showUpdateBanner();

    reg.addEventListener("updatefound", function () {
      var nw = reg.installing;
      if (!nw) return;
      nw.addEventListener("statechange", function () {
        if (nw.state === "installed" && replacingOlder()) showUpdateBanner();
      });
    });

    // Le navigateur ne consulte le service worker qu'à la navigation. Une PWA
    // installée, reprise depuis le sélecteur d'applications, ne navigue jamais :
    // sans cette vérification au retour à l'écran, elle peut rester des jours
    // sur une version périmée sans que rien ne le signale.
    var lastCheck = 0;
    function maybeCheck() {
      if (document.visibilityState !== "visible") return;
      var now = Date.now();
      if (now - lastCheck < 60000) return;   // au plus une fois par minute
      lastCheck = now;
      if (reg.update) { try { reg.update(); } catch (e) {} }
    }
    document.addEventListener("visibilitychange", maybeCheck);
    window.addEventListener("focus", maybeCheck);
  }).catch(function () {});

  var reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (reloaded || !hadController) return;   // première installation : rien à signaler
    reloaded = true;
    showUpdateBanner();
  });
}
