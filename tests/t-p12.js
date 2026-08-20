// Banc d'essai : avis de mise à jour centré, wizz, indices activés en multi.
var fs=require('fs'), D=require('path').join(__dirname,'..')+'/';
var NOW=1e6, store={}, body=[], timers=[], tseq=0, vibs=[];
function mk(){var e={tagName:'DIV',textContent:'',style:{setProperty:function(){}},className:'',id:'',value:'',
  width:0,height:0,appendChild:function(){},focus:function(){},_h:'',
  classList:{_s:{},add:function(c){this._s[c]=1},remove:function(c){delete this._s[c]},
             contains:function(c){return !!this._s[c]}},
  remove:function(){body=body.filter(function(x){return x!==e})},setAttribute:function(k,v){e[k]=v},
  getContext:function(){return{fillRect:function(){},fillStyle:''}}};
Object.defineProperty(e,'innerHTML',{get:function(){return e._h},set:function(v){e._h=v}});return e}
var appEl=mk();appEl.id='app';
function byId(i){return i==='app'?appEl:(body.filter(function(e){return e.id===i})[0]||null)}
global.window={isSecureContext:true,devicePixelRatio:1,addEventListener:function(){}};
global.self=global.window;
global.location={origin:'https://x',pathname:'/',hash:'',reload:function(){}};
global.localStorage={getItem:function(k){return store[k]||null},setItem:function(k,v){store[k]=v},removeItem:function(k){delete store[k]}};
Object.defineProperty(globalThis,'navigator',{value:{onLine:true,vibrate:function(p){vibs.push(p);return true}},writable:true,configurable:true});
global.document={visibilityState:'visible',getElementById:byId,createElement:mk,head:{appendChild:function(){}},
  body:{appendChild:function(e){body.push(e)},removeChild:function(){}},addEventListener:function(){},activeElement:null};
global.Date={now:function(){return NOW}};
global.setTimeout=function(fn,ms){var t={id:++tseq,fn:fn,at:NOW+(ms||0)};timers.push(t);return t.id};
global.setInterval=function(fn,ms){var t={id:++tseq,fn:fn,at:NOW+ms,repeat:true};timers.push(t);return t.id};
global.clearTimeout=global.clearInterval=function(id){timers=timers.filter(function(t){return t.id!==id})};
function advance(ms){NOW+=ms;var due=timers.filter(function(t){return t.at<=NOW});
  timers=timers.filter(function(t){return t.at>NOW});due.forEach(function(t){t.fn()})}
['vendor/qrcode.js','qr.js','net.js','net-peerjs.js','client.js','pwa.js','app.js'].forEach(function(f){
  eval.call(global, fs.readFileSync(D+f,'utf8'));
});
var out=[],fails=0;
function chk(o,l){out.push((o?'  ✓ ':'  ✗ ')+l);if(!o)fails++}
function flush(){out.forEach(function(l){console.log(l)});out=[]}
NET.register('peerjs',{host:function(){},join:function(){},toHost:function(){},
 send:function(){},broadcast:function(){},kick:function(){},destroy:function(){},status:function(){return 'open'}});

// ═══════════════════════════════════════════════════════════════
console.log('── 1. L\'avis de mise à jour occupe le centre de l\'écran ──');
showUpdateBanner();
var b=byId('upd-banner');
chk(!!b,'l\'avis est posé dans le document');
chk(b.className==='upd-ov','c\'est un recouvrement plein écran, plus un bandeau');
chk(b.innerHTML.indexOf('upd-box')!==-1,'la boîte centrale est présente');
chk(b.innerHTML.indexOf('RECHARGER')!==-1,'l\'action principale est offerte');
chk(b.innerHTML.indexOf('Plus tard')!==-1,'refuser reste possible');
chk(b.innerHTML.indexOf('role="alertdialog"')!==-1,'annoncé comme dialogue aux lecteurs d\'écran');
var n=body.length;
showUpdateBanner();
chk(body.length===n,'un second appel ne superpose pas deux avis');
// Le CSS doit vraiment le centrer et lui donner un tiers de la hauteur.
var css=fs.readFileSync(D+'style.css','utf8');
chk(/\.upd-ov\s*\{[^}]*align-items:\s*center/.test(css),'centré verticalement');
chk(/\.upd-box\s*\{[^}]*min-height:\s*33vh/.test(css),'occupe au moins un tiers de la hauteur');
chk(!/\.upd-banner/.test(css),'l\'ancien bandeau de pied de page a disparu du CSS');
// Le message de version divergente passe par le même canal.
b.remove();
showUpdateBanner('⚠ L\'hôte utilise une autre version (v20)');
chk(byId('upd-banner').innerHTML.indexOf('v20')!==-1,'le message d\'incompatibilité s\'affiche au centre lui aussi');
byId('upd-banner').remove();
flush();

// ═══════════════════════════════════════════════════════════════
console.log('');
console.log('── 2. Le wizz : centré, une seconde, puis plus rien ──');
S.mode='host';S.pingOn=true;S.pingMax=false;
S.net={code:'ABC123',status:'open',seats:[
  {token:'HOST',name:'Jules',connected:true,isHost:true},
  {token:'t2',name:'Léa',connected:true}],seq:0,lastJSON:null};
syncRoster();
vibs=[];
showPingToast(2,1,'bell',false);
var t=byId('ping-toast');
chk(!!t,'le wizz apparaît');
chk(t.className.indexOf('wizz')!==-1,'classe wizz');
chk(t.className.indexOf('ultra')===-1,'sans l\'option, pas de mode ultime');
chk(t.innerHTML.indexOf('wizz-card')!==-1&&t.innerHTML.indexOf('wizz-in')!==-1,
    'les deux couches d\'animation sont là (zoom + tremblement)');
chk(t.innerHTML.indexOf('Léa')!==-1,'l\'expéditeur est nommé — jamais de wizz anonyme');
chk(vibs.length===1,'une vibration est déclenchée');
chk(!appEl.classList.contains('wizz-shake'),'la page ne tremble pas en mode normal');
advance(999);
chk(!!byId('ping-toast'),'toujours visible juste avant la seconde');
advance(2);
chk(!byId('ping-toast'),'✱ disparu à 1 s pile');
flush();

console.log('');
console.log('── Le wizz ultime secoue toute la page ──');
S.pingMax=true;vibs=[];
showPingToast(2,1,'skull',false);
t=byId('ping-toast');
chk(t.className.indexOf('ultra')!==-1,'classe ultra posée');
chk(t.className.indexOf('skull')!==-1,'le 💀 garde son habillage rouge');
chk(appEl.classList.contains('wizz-shake'),'✱ #app tremble aussi');
chk(vibs[0].length>5,'motif de vibration plus long qu\'en mode normal');
advance(1001);
chk(!appEl.classList.contains('wizz-shake'),'la page cesse de trembler avec le wizz');
chk(!byId('ping-toast'),'et le wizz a disparu');
chk(/\.wizz\.ultra\s+\.wizz-in/.test(css),'le CSS a bien une variante ultra');
chk(/@media\s*\(prefers-reduced-motion/.test(css),'le tremblement est neutralisé si l\'utilisateur le demande');
flush();

console.log('');
console.log('── L\'option est arbitrée par l\'hôte, pas par chaque joueur ──');
var snap=snapshot();
chk(snap.opts.pingMax===true,'pingMax voyage dans le snapshot');
// Un client dont l'hôte a coupé l'option ne doit PAS pouvoir se l'octroyer.
S.mode='client';
C.snap={opts:{pingOn:true,pingGap:5000,pingMax:false},roster:[{id:1,name:'Jules'},{id:2,name:'Léa'}]};
C.playerId=2;
chk(pingMaxCur()===false,'le client suit la décision de l\'hôte');
showPingToast(1,2,'bell',false);
chk(byId('ping-toast').className.indexOf('ultra')===-1,'aucun mode ultime imposé au client');
byId('ping-toast').remove();
C.snap.opts.pingMax=true;
chk(pingMaxCur()===true,'et le subit quand l\'hôte l\'active');
S.mode='host';C.snap=null;
flush();

// ═══════════════════════════════════════════════════════════════
console.log('');
console.log('── 3. Les indices écrits sont armés à l\'ouverture de la salle ──');
S.mode='solo';S.writeClues=false;S.phase='splash';
hostStart();
chk(S.mode==='host','on est bien passé en multi-appareils');
chk(S.writeClues===true,'✱ l\'option indice est enclenchée d\'office');
chk(S.phase==='lobby','le lobby s\'ouvre');
// …mais l'hôte garde la main.
S.writeClues=false;saveOpts();
chk(JSON.parse(store['uc_opts']).writeClues===false,'l\'hôte peut la couper, et ça se persiste');
// Le mode solo n'est pas touché.
S.mode='solo';S.writeClues=false;
chk(S.writeClues===false,'le mono-téléphone garde son réglage');
flush();

console.log('');
console.log('── Les options de ping survivent à une réinitialisation ──');
S.mode='host';
resetOpts();
chk(S.pingOn===true,'✱ pingOn redevient vrai au lieu de rester indéfini');
chk(S.pingGap===5000,'le délai est rétabli');
chk(S.pingMax===false,'le wizz ultime est éteint par défaut');
chk(pingEnabled()===true,'la fenêtre de ping reste accessible après réinitialisation');
chk(pingGapCur()===5000,'le délai est exploitable, pas undefined');
flush();

console.log('');
console.log('── Persistance de l\'option ──');
S.mode='solo';S.pingMax=true;saveOpts();
chk(JSON.parse(store['uc_opts']).pingMax===true,'pingMax est écrit');
S.pingMax=false;loadOpts();
chk(S.pingMax===true,'pingMax est relu au démarrage suivant');
flush();

console.log('');
console.log(fails?('✗ '+fails+' échec(s)'):'✓ tout passe');
process.exit(fails?1:0);
