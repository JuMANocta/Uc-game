// ══════════════════════════════════════════════════════════════
// QR — peinture d'un QR code dans un <canvas>
// ══════════════════════════════════════════════════════════════
// On n'utilise QUE le modèle de données de vendor/qrcode.js (getModuleCount /
// isDark). Ses helpers createImgTag() / createTableTag() / createSvgTag()
// émettent des attributs style="" inline, interdits par la politique CSP du
// projet — on peint donc les modules nous-mêmes.
//
// Le QR est volontairement SOMBRE SUR BLANC, contrairement au thème Night City :
// un QR cyan sur fond noir échoue régulièrement sur les caméras bon marché dans
// une pièce mal éclairée, et c'est la toute première interaction d'un joueur.

function drawQR(cv, text, opts) {
  opts = opts || {};
  if (typeof qrcode !== "function") return false;

  var quiet = opts.quiet === undefined ? 4 : opts.quiet;   // zone de silence (4 modules = norme)
  var dark  = opts.dark  || "#0a0a12";
  var light = opts.light || "#ffffff";
  var cssSize = opts.size || 240;

  var qr;
  try {
    // type 0 = choisit automatiquement la plus petite version qui contient les données
    qr = qrcode(0, opts.ec || "M");
    qr.addData(text);
    qr.make();
  } catch (e) {
    return false;
  }

  var n = qr.getModuleCount();
  var total = n + quiet * 2;

  // Taille de module ENTIÈRE : des modules non entiers produisent un flou
  // d'anti-aliasing qui fait échouer la lecture sur les caméras médiocres.
  var dpr = window.devicePixelRatio || 1;
  var mod = Math.max(2, Math.floor((cssSize * dpr) / total));
  var px = mod * total;

  cv.width = px;
  cv.height = px;
  // Rendu 1:1 en pixels physiques : si le CSS étirait le canvas, les modules
  // deviendraient inégaux (certains 5 px, d'autres 6) et la lecture souffrirait.
  // Même mécanisme que --pbar-w : pas d'attribut style="" inline.
  cv.style.setProperty("--qr-css", (px / dpr) + "px");

  var ctx = cv.getContext("2d");
  if (!ctx) return false;

  ctx.fillStyle = light;
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = dark;
  for (var r = 0; r < n; r++) {
    for (var c = 0; c < n; c++) {
      if (qr.isDark(r, c)) {
        ctx.fillRect((c + quiet) * mod, (r + quiet) * mod, mod, mod);
      }
    }
  }
  return true;
}
