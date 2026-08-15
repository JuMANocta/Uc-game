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

// ── Bannière de mise à jour ───────────────────────────────────
// Le service worker appelle skipWaiting() : la nouvelle version prend la main
// immédiatement, mais la PAGE continue de faire tourner l'ancien code jusqu'au
// rechargement. D'où cette bannière plutôt qu'un rechargement d'autorité, qui
// couperait une partie en cours.
function showUpdateBanner() {
  if (document.getElementById("upd-banner")) return;
  var b = document.createElement("div");
  b.id = "upd-banner";
  b.className = "upd-banner";
  b.innerHTML = '<span>✨ Nouvelle version disponible</span>' +
    '<button type="button" class="upd-btn" onclick="location.reload()">Recharger</button>' +
    '<button type="button" class="upd-x" aria-label="Plus tard" ' +
    'onclick="document.getElementById(\'upd-banner\').remove()">✕</button>';
  document.body.appendChild(b);
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

  navigator.serviceWorker.register("./sw.js").then(function (reg) {
    // Une version déjà en attente au chargement.
    if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner();

    reg.addEventListener("updatefound", function () {
      var nw = reg.installing;
      if (!nw) return;
      nw.addEventListener("statechange", function () {
        // controller absent = première installation, rien à signaler.
        if (nw.state === "installed" && navigator.serviceWorker.controller) showUpdateBanner();
      });
    });
  }).catch(function () {});

  var reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (reloaded) return;
    reloaded = true;
    showUpdateBanner();
  });
}
