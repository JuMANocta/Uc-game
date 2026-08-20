// Banc d'essai : durcissement — indice à usage unique, spoke borné, tirage
// cryptographique, échappement, limitation de débit, avis de mise à jour.
var fs=require('fs'), D=require('path').join(__dirname,'..')+'/';
var NOW=1e6, store={}, body=[], timers=[], tseq=0;
function mk(){var e={tagName:'DIV',textContent:'',style:{setProperty:function(){}},className:'',id:'',value:'',
  width:0,height:0,appendChild:function(){},focus:function(){},_h:'',
  classList:{_s:{},add:function(c){this._s[c]=1},remove:function(c){delete this._s[c]},contains:function(c){return !!this._s[c]}},
  remove:function(){body=body.filter(function(x){return x!==e})},setAttribute:function(k,v){e[k]=v},
  getContext:function(){return{fillRect:function(){},fillStyle:''}}};
Object.defineProperty(e,'innerHTML',{get:function(){return e._h},set:function(v){e._h=v}});return e}
var appEl=mk();appEl.id='app';
function byId(i){return i==='app'?appEl:(body.filter(function(e){return e.id===i})[0]||null)}
global.window={isSecureContext:true,devicePixelRatio:1,addEventListener:function(k,fn){(winListeners[k]=winListeners[k]||[]).push(fn)}};
global.self=global.window;
global.location={origin:'https://x',pathname:'/',hash:'',reload:function(){}};
global.localStorage={getItem:function(k){return store[k]||null},setItem:function(k,v){store[k]=v},removeItem:function(k){delete store[k]}};

// Service worker simulé : on pilote la présence d'un contrôleur et on capture
// les écouteurs pour déclencher controllerchange à la main.
var swListeners={}, regListeners={}, docListeners={}, winListeners={}, updateCalls=0;
var swReg={waiting:null,installing:null,update:function(){updateCalls++},
  addEventListener:function(k,fn){(regListeners[k]=regListeners[k]||[]).push(fn)}};
function fire(map,k,a){(map[k]||[]).forEach(function(f){f(a)})}
// Rejoue le cycle de vie réel : updatefound, puis les transitions d'état du
// nouveau worker. `ctlPendantInstalled` dit si un ancien worker est encore aux
// commandes au moment où le nouveau atteint `installed` — c'est LA question qui
// distingue une mise à jour d'une première installation.
function deploy(ctlPendantInstalled){
  var nwListeners={};
  var nw={state:'installing',addEventListener:function(k,fn){(nwListeners[k]=nwListeners[k]||[]).push(fn)}};
  swReg.installing=nw;
  fire(regListeners,'updatefound');
  swController=ctlPendantInstalled?{}:null;
  nw.state='installed'; fire(nwListeners,'statechange');
  nw.state='activated'; swController={}; fire(nwListeners,'statechange');
}
var swController=null;
function makeNavigator(){return {onLine:true,vibrate:function(){},
  serviceWorker:{
    get controller(){return swController},
    register:function(){return Promise.resolve(swReg)},
    getRegistration:function(){return Promise.resolve(swReg)},
    addEventListener:function(k,fn){(swListeners[k]=swListeners[k]||[]).push(fn)}
  }}}
Object.defineProperty(globalThis,'navigator',{value:makeNavigator(),writable:true,configurable:true});
global.document={visibilityState:'visible',getElementById:byId,createElement:mk,head:{appendChild:function(){}},
  body:{appendChild:function(e){body.push(e)},removeChild:function(){}},addEventListener:function(k,fn){(docListeners[k]=docListeners[k]||[]).push(fn)},activeElement:null};
global.Date={now:function(){return NOW}};
global.setTimeout=function(fn,ms){var t={id:++tseq,fn:fn,at:NOW+(ms||0)};timers.push(t);return t.id};
global.setInterval=function(fn,ms){var t={id:++tseq,fn:fn,at:NOW+ms,repeat:true};timers.push(t);return t.id};
global.clearTimeout=global.clearInterval=function(id){timers=timers.filter(function(t){return t.id!==id})};
['vendor/qrcode.js','qr.js','net.js','net-peerjs.js','client.js','pwa.js','app.js'].forEach(function(f){
  eval.call(global, fs.readFileSync(D+f,'utf8'));
});
var out=[],fails=0;
function chk(o,l){out.push((o?'  ✓ ':'  ✗ ')+l);if(!o)fails++}
function flush(){out.forEach(function(l){console.log(l)});out=[]}

var sent=[],bcast=[];
NET.register('peerjs',{host:function(){},join:function(){},toHost:function(){},
  send:function(cid,msg){sent.push({cid:cid,msg:msg})},
  broadcast:function(msg){bcast.push(msg)},
  kick:function(){},destroy:function(){},status:function(){return 'open'}});
NET.use('peerjs');

function room(){
  NOW+=2000;
  S.mode='host';
  S.net={code:'XK7P2M',status:'open',seats:[
    {token:'HOST',name:'Jules',connId:null,connected:true,isHost:true,lastSeen:NOW},
    {token:'t2',name:'Léa',connId:'c2',connected:true,lastSeen:NOW},
    {token:'t3',name:'Marc',connId:'c3',connected:true,lastSeen:NOW}],seq:0,lastJSON:null};
  S.phase='lobby';S.uc=1;S.mw=false;S.cat=true;S.writeClues=true;S.pingOn=true;
  syncRoster();startSession();S.phase='playing';
  sent=[];bcast=[];
}

// ═══════════════════════════════════════════════════════════════
console.log('── Point 3 — un seul indice par tour ──');
room();
hostOnMsg('c2',{v:PROTO_V,t:'clue',text:'ça se mange',turn:S.turn});
chk(S.clues[2]==='ça se mange','le premier indice est enregistré');
hostOnMsg('c2',{v:PROTO_V,t:'clue',text:'finalement non',turn:S.turn});
chk(S.clues[2]==='ça se mange','✱ le second est refusé — on ne réécrit pas après avoir lu les autres');
// Un joueur mort n'écrit pas, et un indice de tour périmé non plus.
S.alive=S.alive.filter(function(i){return i!==3});
hostOnMsg('c3',{v:PROTO_V,t:'clue',text:'depuis l\'au-delà',turn:S.turn});
chk(S.clues[3]===undefined,'un éliminé ne donne pas d\'indice');
flush();

console.log('');
console.log('── Point 3 — se cocher « a parlé » est borné ──');
room();
S.spoken=[];
hostOnMsg('c2',{v:PROTO_V,t:'spoke',on:true});
chk(S.spoken.indexOf(2)!==-1,'en débat, un vivant peut se cocher');
S.spoken=[];
S.phase='vote';
hostOnMsg('c2',{v:PROTO_V,t:'spoke',on:true});
chk(S.spoken.length===0,'✱ hors du débat, sans effet');
S.phase='playing';S.alive=[1,3];
hostOnMsg('c2',{v:PROTO_V,t:'spoke',on:true});
chk(S.spoken.length===0,'✱ un éliminé ne se coche pas');
flush();

// ═══════════════════════════════════════════════════════════════
console.log('');
console.log('── Point 4 — tirage cryptographique ──');
// crypto est un accesseur en lecture seule sur globalThis dans Node : une
// simple affectation est ignorée en silence, d'où defineProperty.
var realCrypto=globalThis.crypto, calls=0;
function spyCrypto(){Object.defineProperty(globalThis,'crypto',{configurable:true,writable:true,
  value:{getRandomValues:function(a){calls++;for(var i=0;i<a.length;i++)a[i]=(i*97+calls*31)%256;return a}}})}
function realAgain(){Object.defineProperty(globalThis,'crypto',{configurable:true,writable:true,value:realCrypto})}
spyCrypto();
calls=0;newToken();
chk(calls>0,'✱ newToken passe par crypto, plus par Math.random');
calls=0;newRoomCode();
chk(calls>0,'✱ newRoomCode aussi');
// Qualité de sortie, avec le vrai générateur du système.
realAgain();
var toks={},dup=0,badT=0;
for(var i=0;i<2000;i++){var t=newToken();
  if(!/^[0-9a-f]{16}$/.test(t))badT++;
  if(toks[t])dup++;toks[t]=1}
chk(badT===0,'2000 tokens : 16 caractères hexadécimaux à chaque fois');
chk(dup===0,'aucun doublon');
var badC=0,seen={};
for(i=0;i<6000;i++){var c=newRoomCode();
  if(!/^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/.test(c))badC++;
  for(var j=0;j<6;j++)seen[c[j]]=(seen[c[j]]||0)+1}
chk(badC===0,'6000 codes : 6 caractères de l\'alphabet sans O/0/I/1/L');
chk(Object.keys(seen).length===30,'les 30 caractères apparaissent');
// Le biais du modulo, s'il existait, serait STRUCTUREL et non aléatoire : 256
// n'est pas multiple de 30, donc sans rejet des tirages ≥ 240 les 16 premiers
// caractères sortiraient 9 fois sur 256 contre 8 pour les 14 derniers — soit
// +12,5 %. On mesure donc ce rapport-là, pas un max/min qui ne refléterait que
// le bruit d'échantillonnage.
var A=0,B=0;
for(i=0;i<30;i++){var n=seen[ROOM_CHARS[i]]||0;if(i<16)A+=n/16;else B+=n/14}
chk(A/B<1.05,'✱ aucun biais de modulo (16 premiers / 14 derniers = '+(A/B).toFixed(3)+', biais attendu sans rejet : 1.125)');
flush();

// ═══════════════════════════════════════════════════════════════
console.log('');
console.log('── Point 5 — rien de ce que dit l\'hôte n\'est exécuté ──');
var payload='<img src=x onerror="alert(1)">';
S.mode='client';C.playerId=2;
var hostile={phase:'playing',turn:1,round:0,
  roster:[{id:1,name:payload,alive:true,connected:true},{id:2,name:'Léa',alive:true,connected:true}],
  eliminated:[],category:payload,speakOrder:[1,2],spoken:[],
  writeClues:true,clues:{1:payload},fault:{id:1,word:payload,clue:payload,kind:'word'},
  pingTally:{},scores:{},opts:{},
  vote:{open:false,candidates:[],votedIds:[],round:0},
  recap:null,gameOver:null,mw:null};
var clean=scrubSnap(JSON.parse(JSON.stringify(hostile)));
chk(clean.roster[0].name.indexOf('<')===-1,'✱ le nom est neutralisé');
chk(clean.clues[1].indexOf('<')===-1,'✱ l\'indice aussi');
chk(clean.category.indexOf('<')===-1,'la catégorie aussi');
chk(clean.fault.word.indexOf('<')===-1&&clean.fault.clue.indexOf('<')===-1,'la faute aussi');
chk(clean.roster[0].name.indexOf('&lt;img')!==-1,'le texte reste lisible, il n\'est pas supprimé');
// Et le rendu réel ne contient aucune balise active.
C.snap=clean;adoptRoster();C.screen='word';C.secret={turn:1,word:'Chat',isMrWhite:false,category:'Animaux'};
renderClient();
chk(appEl.innerHTML.indexOf('<img')===-1,'✱ aucune balise <img> dans le rendu');
// « onerror » subsiste en tant que TEXTE, c'est normal et inoffensif — ce qui
// compte est qu'aucun chevron du contenu hostile n'ait survécu tel quel.
chk(appEl.innerHTML.indexOf(payload)===-1,'✱ la charge hostile n\'apparaît nulle part telle quelle');
chk(appEl.innerHTML.indexOf('&lt;img')!==-1,'elle est bien présente, mais échappée');
// null doit rester null, sinon l'écran « Mr. White » bascule à tort.
chk(escN(null)===null,'escN préserve null');
clientOnMsg({v:PROTO_V,t:'secret',turn:1,word:null,isMrWhite:true,category:null});
chk(C.secret.word===null,'✱ le mot de Mr. White reste null, pas une chaîne vide');
S.mode='host';C.snap=null;C.secret=null;
flush();

// ═══════════════════════════════════════════════════════════════
console.log('');
console.log('── Point 6 — le débit est borné, sans casser le battement de cœur ──');
room();
S.phase='playing';S.spoken=[];
var passed=0;
for(i=0;i<40;i++){
  S.spoken=[];
  hostOnMsg('c2',{v:PROTO_V,t:'spoke',on:true});
  if(S.spoken.indexOf(2)!==-1)passed++;
}
chk(passed<=CONN_MSG_MAX,'✱ 40 messages en rafale, '+passed+' passent (plafond '+CONN_MSG_MAX+')');
chk(passed>=5,'mais le plafond laisse largement passer un usage humain');
// Le voisin n'est pas puni pour le spam de l'autre.
S.spoken=[];
hostOnMsg('c3',{v:PROTO_V,t:'spoke',on:true});
chk(S.spoken.indexOf(3)!==-1,'✱ la limite est par connexion, pas globale');
// Le battement de cœur passe TOUJOURS : le bloquer ferait déclarer mort un
// joueur présent.
sent=[];
var seat=S.net.seats[1];seat.lastSeen=NOW-9000;
hostOnMsg('c2',{v:PROTO_V,t:'ping'});
chk(sent.some(function(m){return m.cid==='c2'&&m.msg.t==='pong'}),'✱ le ping reçoit son pong malgré la rafale');
chk(seat.lastSeen===NOW,'✱ et il rafraîchit lastSeen — sinon le balayeur tuerait un vivant');
// La fenêtre se rouvre après une seconde.
NOW+=1100;S.spoken=[];
hostOnMsg('c2',{v:PROTO_V,t:'spoke',on:true});
chk(S.spoken.indexOf(2)!==-1,'la fenêtre suivante repart à zéro');
flush();

// ═══════════════════════════════════════════════════════════════
console.log('');
console.log('── Avis de mise à jour : les trois chemins d\'annonce ──');
// Cette zone a cassé DEUX FOIS, dans les deux sens : d'abord un avis à chaque
// première visite, puis plus aucun avis du tout. Les deux régressions sont donc
// verrouillées ici, ensemble.
function settle(){return new Promise(function(r){
  var n=0;(function loop(){ if(++n>12) return r(); setImmediate(loop); })();})}
function freshPage(hadCtl,waiting){
  body=[];swListeners={};regListeners={};docListeners={};winListeners={};
  swReg.waiting=waiting?{}:null;swReg.installing=null;updateCalls=0;
  swController=hadCtl?{}:null;
  installPWA();
}
(async function(){

// 1. Première visite : rien ne doit être annoncé. sw.js appelle skipWaiting()
//    puis clients.claim(), donc le contrôleur passe de null au worker tout
//    neuf — un controllerchange identique à celui d'une vraie mise à jour.
freshPage(false); await settle();
deploy(false);                                   // aucun ancien worker aux commandes
fire(swListeners,'controllerchange');
chk(!byId('upd-banner'),'✱ première installation : aucun avis');

// 2. Vraie mise à jour, page contrôlée dès le chargement.
freshPage(true); await settle();
deploy(true);
chk(!!byId('upd-banner'),'✱ mise à jour : l\'avis s\'affiche');
chk(byId('upd-banner').className==='upd-ov','et c\'est bien la fenêtre centrale');

// 3. LA RÉGRESSION : une page ouverte AVANT que le service worker n'existe
//    reste non contrôlée au chargement. Si l'on répond à « un ancien worker
//    est-il remplacé ? » avec l'instantané pris au chargement, cette page
//    n'annoncera plus JAMAIS aucune mise à jour — y compris celles qui
//    s'installent sous ses yeux. C'est ce qui rendait la v23 invisible.
freshPage(false); await settle();
deploy(false);                                   // le SW s'installe et prend la main
fire(swListeners,'controllerchange');
chk(!byId('upd-banner'),'la première installation reste silencieuse…');
deploy(true);                                    // PUIS une vraie nouvelle version
chk(!!byId('upd-banner'),'✱ …mais la mise à jour suivante est bien annoncée');

// 4. Une version déjà en attente au chargement.
freshPage(true,true); await settle();
chk(!!byId('upd-banner'),'✱ un worker déjà en attente au chargement est signalé');
// …mais pas à la toute première installation, où rien n'est « en attente » de
// remplacer quoi que ce soit.
freshPage(false,true); await settle();
chk(!byId('upd-banner'),'✱ sauf s\'il n\'y avait aucun worker avant');

// 5. Le navigateur ne consulte le service worker qu'à la navigation. Une PWA
//    reprise depuis le sélecteur d'applications ne navigue jamais : sans
//    vérification au retour à l'écran, elle reste sur une version périmée.
freshPage(true); await settle();
chk(updateCalls===0,'aucune vérification tant que la page reste au premier plan');
fire(docListeners,'visibilitychange');
chk(updateCalls===1,'✱ retour à l\'écran : le service worker est reconsulté');
fire(winListeners,'focus');
chk(updateCalls===1,'✱ mais pas plus d\'une fois par minute');
NOW+=61000;
fire(docListeners,'visibilitychange');
chk(updateCalls===2,'la minute écoulée, une nouvelle vérification est permise');
// Page en arrière-plan : rien à vérifier.
document.visibilityState='hidden';
NOW+=61000;
fire(docListeners,'visibilitychange');
chk(updateCalls===2,'une page masquée ne déclenche rien');
document.visibilityState='visible';
flush();

console.log('');
console.log(fails?('✗ '+fails+' échec(s)'):'✓ tout passe');
process.exit(fails?1:0);
})();
