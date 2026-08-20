// Banc d'essai : serveur de signaling auto-hébergé, relais ICE du domaine, et
// repli sur le broker public. C'est le SEUL banc qui exerce net-peerjs.js pour
// de vrai — les autres branchent un adaptateur factice et ne verraient donc
// jamais une régression ici.
var fs=require('fs'), D=require('path').join(__dirname,'..')+'/';
var NOW=1e6, store={}, body=[], timers=[], tseq=0;
function mk(){var e={tagName:'DIV',style:{setProperty:function(){}},className:'',id:'',value:'',_h:'',
  appendChild:function(){},focus:function(){},classList:{add:function(){},remove:function(){},contains:function(){return false}},
  remove:function(){body=body.filter(function(x){return x!==e})},setAttribute:function(k,v){e[k]=v},
  getContext:function(){return{fillRect:function(){},fillStyle:''}}};
Object.defineProperty(e,'innerHTML',{get:function(){return e._h},set:function(v){e._h=v}});return e}
var appEl=mk();appEl.id='app';
function byId(i){return i==='app'?appEl:(body.filter(function(e){return e.id===i})[0]||null)}

// Les <script> injectés par loadLib() : on simule le chargement de la lib.
var injected=[];
global.window={isSecureContext:true,devicePixelRatio:1,addEventListener:function(){}};
global.self=global.window;
global.location={protocol:'https:',hostname:'jeux.exemple.fr',port:'',origin:'https://jeux.exemple.fr',
  pathname:'/uc/',hash:'',reload:function(){}};
global.localStorage={getItem:function(k){return store[k]||null},setItem:function(k,v){store[k]=v},removeItem:function(k){delete store[k]}};
Object.defineProperty(globalThis,'navigator',{value:{onLine:true,vibrate:function(){}},writable:true,configurable:true});
global.document={visibilityState:'visible',getElementById:byId,createElement:function(t){
    var e=mk();if(t==='script'){injected.push(e)}return e},
  head:{appendChild:function(e){ if(e.onload)pendingScripts.push(e); }},
  body:{appendChild:function(e){body.push(e)},removeChild:function(){}},
  addEventListener:function(){},activeElement:null};
var pendingScripts=[];
global.Date={now:function(){return NOW}};
global.setTimeout=function(fn,ms){var t={id:++tseq,fn:fn,at:NOW+(ms||0)};timers.push(t);return t.id};
global.setInterval=function(fn,ms){var t={id:++tseq,fn:fn,at:NOW+ms,repeat:true};timers.push(t);return t.id};
global.clearTimeout=global.clearInterval=function(id){timers=timers.filter(function(t){return t.id!==id})};
function settle(){return new Promise(function(r){
  var n=0;(function loop(){ if(++n>12) return r(); setImmediate(loop); })();})}
async function step(ms){tick(ms||0);await settle()}
function tick(ms){NOW+=ms;
  for(var i=0;i<200;i++){
    var due=timers.filter(function(t){return t.at<=NOW});
    if(!due.length)break;
    timers=timers.filter(function(t){return t.at>NOW});
    due.forEach(function(t){t.fn()});
  }}

// ── fetch pilotable, pour /ice ─────────────────────────────────
var fetchLog=[], fetchMode='ok', iceBody={iceServers:[
  {urls:'stun:stun.exemple.fr:3478'},
  {urls:'turns:turn.exemple.fr:443?transport=tcp',username:'u',credential:'p'}]};
global.fetch=function(url,opts){
  fetchLog.push({url:url,opts:opts});
  if(fetchMode==='muet') return new Promise(function(){});          // ne répond jamais
  if(fetchMode==='ko')   return Promise.reject(new Error('down'));
  if(fetchMode==='404')  return Promise.resolve({ok:false});
  return Promise.resolve({ok:true,json:function(){return Promise.resolve(iceBody)}});
};

// ── Peer factice : on capture ce qu'on lui passe ────────────────
var peers=[];
function FakePeer(id,opts){
  var self=this;
  this.id=id;this.opts=opts;this.destroyed=false;this._h={};
  this.on=function(k,fn){(self._h[k]=self._h[k]||[]).push(fn)};
  this.fire=function(k,a){(self._h[k]||[]).forEach(function(f){f(a)})};
  this.destroy=function(){self.destroyed=true};
  this.connect=function(){return {on:function(){},send:function(){},close:function(){}}};
  this.reconnect=function(){};
  peers.push(this);
}
function lastPeer(){return peers[peers.length-1]}

['vendor/qrcode.js','qr.js','net.js','net-peerjs.js','client.js','pwa.js','app.js'].forEach(function(f){
  eval.call(global, fs.readFileSync(D+f,'utf8'));
});
// La lib est « déjà là » : loadLib() court-circuite l'injection du <script>.
global.window.Peer=FakePeer;

(async function(){
var out=[],fails=0;
function chk(o,l){out.push((o?'  ✓ ':'  ✗ ')+l);if(!o)fails++}
function flush(){out.forEach(function(l){console.log(l)});out=[]}

function fresh(){
  peers=[];fetchLog=[];timers=[];
  NET.use('peerjs');
  NET.destroy();                    // remet _own à true et repart de zéro
  peers=[];
}
var H={onOpen:function(c){H.code=c;H.opened=true},onPeer:function(){},onMsg:function(){},
       onClose:function(){},onError:function(e){H.err=e}};
function newH(){H.code=null;H.opened=false;H.err=null;return H}

// ═══════════════════════════════════════════════════════════════
console.log('── Où le jeu va chercher son annuaire ──');
chk(netBase()==='/uc/','sous-répertoire déduit de location.pathname');
location.pathname='/';
chk(netBase()==='/','racine du domaine');
location.pathname='/jeux/uc/index.html';
chk(netBase()==='/jeux/uc/','un fichier dans l\'URL ne casse pas la déduction');
location.pathname='/uc/';

var b=brokerConfig();
chk(b.host==='jeux.exemple.fr','l\'hôte est celui de la page — aucune adresse en dur');
chk(b.path==='/uc/peerjs','le chemin suit le répertoire de déploiement');
chk(b.port===443&&b.secure===true,'443 et TLS par défaut');
chk(b.key===BROKER_KEY,'la clé correspond à celle déclarée côté serveur');
location.port='8443';
chk(brokerConfig().port===8443,'un port explicite est repris');
location.port='';
location.protocol='http:';
chk(brokerConfig()===null,'✱ en http, viser un serveur propre n\'a aucun sens');
location.protocol='https:';
// Le dépôt ne doit contenir aucun nom de domaine.
var src=fs.readFileSync(D+'net-peerjs.js','utf8')
  .replace(/^\s*\/\/.*$/gm,'');            // hors commentaires
chk(!/exemple\.fr|peerjs\.com['"]/.test(src),'✱ aucun domaine en dur dans le code');
flush();

// ═══════════════════════════════════════════════════════════════
console.log('');
console.log('── Les identifiants de relais viennent du domaine ──');
fresh();fetchMode='ok';
NET.host({},newH());
await step(1);
chk(fetchLog.length===1&&fetchLog[0].url==='/uc/ice','✱ /ice est interrogé avant toute connexion');
chk(fetchLog[0].opts.cache==='no-store','sans cache — des identifiants périmés ne diraient rien');
await step(1);
chk(hasTurn()===true,'✱ un relais est désormais disponible');
var opts=lastPeer().opts;
chk(opts.config.iceServers.length===2,'les serveurs du domaine sont passés au constructeur');
chk(/turns:/.test(JSON.stringify(opts.config)),'dont le relais TURN');
chk(opts.host==='jeux.exemple.fr'&&opts.path==='/uc/peerjs'&&opts.key===BROKER_KEY,
    '✱ le Peer vise bien le serveur du domaine');
flush();

console.log('');
console.log('── …et le jeu survit si ce serveur n\'existe pas ──');
// 404 : hébergement purement statique, sans route /ice.
fresh();_ice=null;_iceDone=false;fetchMode='404';
NET.host({},newH());await step(2);
chk(hasTurn()===false,'pas de relais, mais on continue');
chk(JSON.stringify(lastPeer().opts.config)===JSON.stringify(ICE_DEFAULT),'repli sur le STUN vérifié');
// Serveur muet : ne doit pas figer l'écran plus de 4 s.
fresh();_ice=null;_iceDone=false;fetchMode='muet';
NET.host({},newH());
chk(peers.length===0,'tant que /ice n\'a pas répondu, aucun Peer n\'est construit');
await step(3999);
chk(peers.length===0,'toujours en attente à 3,999 s');
await step(2);
chk(peers.length===1,'✱ à 4 s on passe outre — on ne fige jamais l\'écran');
flush();

console.log('');
console.log('── La surcharge manuelle gagne toujours ──');
fresh();_ice=null;_iceDone=false;fetchMode='ok';
store['uc_ice']=JSON.stringify({iceServers:[{urls:'turn:mon.relais:443',username:'a',credential:'b'}]});
NET.host({},newH());await step(2);
chk(fetchLog.length===0,'✱ /ice n\'est même pas interrogé');
chk(/mon\.relais/.test(JSON.stringify(lastPeer().opts.config)),'c\'est le relais saisi à la main qui sert');
chk(hasTurn()===true,'et il est bien vu comme un relais');
delete store['uc_ice'];
flush();

// ═══════════════════════════════════════════════════════════════
console.log('');
console.log('── Repli sur le broker public quand le domaine ne répond pas ──');
function ownOpts(o){return !!(o.host&&o.path&&o.key)}

fresh();_ice=null;_iceDone=false;fetchMode='404';
NET.host({code:'ABC123'},newH());await step(2);
chk(ownOpts(lastPeer().opts),'première tentative : le serveur du domaine');
lastPeer().fire('error',{type:'network'});
chk(peers.length===2,'✱ une seconde tentative est lancée');
chk(!ownOpts(lastPeer().opts),'✱ et elle vise le broker public');
chk(lastPeer().id==='ucgame-ABC123','avec le MÊME code — les clients retrouvent la salle');
chk(H.err===null,'aucune erreur remontée à l\'interface : c\'est transparent');

// Un serveur muet ne lève aucune erreur : c'est le chien de garde qui tranche.
fresh();_ice=null;_iceDone=false;
NET.host({code:'ZZZ999'},newH());await step(2);
chk(ownOpts(lastPeer().opts),'on repart sur le domaine');
await step(6999);
chk(peers.length===1,'à 6,999 s on patiente encore');
await step(2);
chk(peers.length===2&&!ownOpts(lastPeer().opts),'✱ à 7 s, bascule sur le broker public');
// Sur le broker public, la patience est plus longue et l'échec devient réel.
await step(11999);
chk(H.err===null,'le broker public a droit à plus de temps');
await step(2);
chk(H.err==='timeout','✱ à 12 s, l\'échec est enfin annoncé au joueur');

// Une erreur APPLICATIVE ne doit pas faire changer d'annuaire.
fresh();_ice=null;_iceDone=false;
NET.host({code:'AAA111'},newH());await step(2);
lastPeer().fire('error',{type:'unavailable-id'});
chk(peers.length===2&&ownOpts(lastPeer().opts),'✱ « code déjà pris » reste sur le domaine…');
chk(lastPeer().id!=='ucgame-AAA111','…et tire simplement un autre code');
flush();

console.log('');
console.log('── Côté joueur : « salle introuvable » n\'est plus annoncé trop tôt ──');
fresh();_ice=null;_iceDone=false;
NET.join('ABC123',newH());await step(2);
chk(ownOpts(lastPeer().opts),'le joueur cherche d\'abord sur le domaine');
lastPeer().fire('error',{type:'peer-unavailable'});
chk(H.err===null,'✱ on n\'annonce PAS « salle introuvable »');
chk(peers.length===2&&!ownOpts(lastPeer().opts),'✱ on va vérifier sur le broker public — l\'hôte a pu basculer');
lastPeer().fire('error',{type:'peer-unavailable'});
chk(H.err==='no-room','✱ absent des deux annuaires : le code est bien mauvais');
flush();

console.log('');
console.log('── Fermer une salle redonne sa chance au domaine ──');
fresh();_ice=null;_iceDone=false;
NET.host({code:'BBB222'},newH());await step(2);
lastPeer().fire('error',{type:'server-error'});
chk(!ownOpts(lastPeer().opts),'on est retombé sur le broker public');
NET.destroy();
peers=[];
NET.host({code:'CCC333'},newH());await step(2);
chk(ownOpts(lastPeer().opts),'✱ la salle suivante retente le domaine — pas de repli définitif');
flush();

// ═══════════════════════════════════════════════════════════════
console.log('');
console.log('── Le service worker ne met pas le signaling en cache ──');
var sw=fs.readFileSync(D+'sw.js','utf8');
var m=sw.match(/if\s*\((\/[^\n]*\/)\.test\(e\.request\.url\)\)\s*return;/);
chk(!!m,'une exclusion existe dans le gestionnaire fetch');
if(m){
  var re=eval(m[1]);
  chk(re.test('https://jeux.exemple.fr/uc/peerjs'),'✱ /peerjs est exclu');
  chk(re.test('https://jeux.exemple.fr/uc/ice'),'✱ /ice est exclu');
  chk(re.test('https://jeux.exemple.fr/uc/peerjs/id?k=ucnet'),'les sous-chemins et requêtes aussi');
  chk(!re.test('https://jeux.exemple.fr/uc/app.js'),'mais app.js reste bien caché');
  chk(!re.test('https://jeux.exemple.fr/uc/icons/icon.svg'),'et icons/ n\'est pas confondu avec ice');
}
flush();

console.log('');
console.log('── hasTurn() ne se trompe pas de verdict ──');
delete store['uc_ice'];_ice=null;
chk(hasTurn()===false,'STUN seul : pas de relais');
_ice={iceServers:[{urls:['stun:a:3478','turn:b:443']}]};
chk(hasTurn()===true,'un urls en tableau est bien inspecté');
_ice={iceServers:[{urls:'turns:c:443?transport=tcp'}]};
chk(hasTurn()===true,'turns: compte aussi');
_ice={iceServers:[{urls:'stun:turnip.exemple.fr:3478'}]};
chk(hasTurn()===false,'✱ un nom d\'hôte contenant « turn » ne trompe pas le test');
_ice=null;
flush();

console.log('');
console.log(fails?('✗ '+fails+' échec(s)'):'✓ tout passe');
process.exit(fails?1:0);
})();
