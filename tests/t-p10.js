// Banc d'essai : vérification de version à la connexion.
var fs=require('fs'), D=require('path').join(__dirname,'..')+'/';
var NOW=1e6, store={}, body=[], updates=0;
function mk(){var e={tagName:'DIV',textContent:'',style:{setProperty:function(){}},className:'',id:'',value:'',
  width:0,height:0,appendChild:function(){},focus:function(){},_h:'',
  remove:function(){body=body.filter(function(x){return x!==e})},setAttribute:function(k,v){e[k]=v},
  getContext:function(){return{fillRect:function(){},fillStyle:''}}};
Object.defineProperty(e,'innerHTML',{get:function(){return e._h},set:function(v){e._h=v}});return e}
var appEl=mk();
function byId(i){return i==='app'?appEl:(body.filter(function(e){return e.id===i})[0]||null)}
global.window={isSecureContext:true,devicePixelRatio:1,addEventListener:function(){}};
global.self=global.window;
global.location={origin:'https://x',pathname:'/',hash:'',reload:function(){}};
global.localStorage={getItem:function(k){return store[k]||null},setItem:function(k,v){store[k]=v},removeItem:function(k){delete store[k]}};
// Service worker factice : on compte les vérifications forcées
Object.defineProperty(globalThis,'navigator',{value:{onLine:true,serviceWorker:{
  getRegistration:function(){return Promise.resolve({update:function(){updates++}})},
  register:function(){return Promise.resolve({addEventListener:function(){}})},
  addEventListener:function(){}}},writable:true,configurable:true});
global.document={visibilityState:'visible',getElementById:byId,createElement:mk,head:{appendChild:function(){}},
  body:{appendChild:function(e){body.push(e)},removeChild:function(){}},addEventListener:function(){},activeElement:null};
global.Date={now:function(){return NOW}};
global.setTimeout=function(){return 1};global.setInterval=function(){return 1};
global.clearTimeout=function(){};global.clearInterval=function(){};
['vendor/qrcode.js','qr.js','net.js','net-peerjs.js','client.js','pwa.js','app.js'].forEach(function(f){
  eval.call(global, fs.readFileSync(D+f,'utf8'));
});
var out=[],fails=0;
function chk(o,l){out.push((o?'  ✓ ':'  ✗ ')+l);if(!o)fails++}
function flush(){return new Promise(function(r){setImmediate(r)})}

var joined=null;
NET.register('peerjs',{host:function(){},join:function(c,h){joined=h},toHost:function(){},
 send:function(){},broadcast:function(){},kick:function(){},destroy:function(){},status:function(){return 'open'}});

(async function(){
console.log('── L\'hôte annonce sa version ──');
chk(typeof BUILD==='string'&&BUILD.length>0,'BUILD est défini : '+BUILD);

console.log('');
console.log('── Vérification forcée à la connexion ──');
updates=0;
clientJoin('ABC123','Léa');
await flush();
chk(updates===1,'rejoindre par code déclenche une vérification de mise à jour');

updates=0;
global.location.hash='#j=XK7P2M';
store['uc_net_client']=JSON.stringify({code:'XK7P2M',token:'t1',playerId:2,name:'Léa'});
bootFromHash();
await flush();
chk(updates===1,'arriver par QR la déclenche aussi');

console.log('');
console.log('── Protocole incompatible ──');
S.mode='client';C.screen='connecting';C.link='connecting';C.token=null;
clientOnMsg({v:99,t:'welcome',build:'v99',token:'x',playerId:2,roomCode:'ABC123',state:{}});
chk(C.screen==='outdated','écran dédié au lieu d\'un silence');
chk(C.link==='dead','on cesse de retenter : recharger est la seule issue');
renderClient();
chk(appEl.innerHTML.indexOf('VERSION INCOMPATIBLE')!==-1,'la raison est écrite');
chk(appEl.innerHTML.indexOf('RECHARGER')!==-1,'et l\'action à faire est proposée');
chk(appEl.innerHTML.indexOf(BUILD)!==-1,'sa propre version est rappelée');

console.log('');
console.log('── Version différente, protocole identique ──');
await flush();          // purge la vérification laissée par l'étape précédente
body=[];C.screen='connecting';C.link='connecting';C.token=null;C.snap=null;
updates=0;
clientOnMsg({v:PROTO_V,t:'welcome',build:'v99-2099.01.01',token:'x',playerId:2,roomCode:'ABC123',
  state:{phase:'lobby',turn:0,roster:[{id:2,name:'Léa',alive:true,connected:true}],spoken:[],speakOrder:[],
         eliminated:[],scores:{},opts:{},vote:{},pingTally:{}}});
chk(C.screen!=='outdated','rien de bloquant : la partie reste jouable');
chk(C.token==='x','la connexion aboutit normalement');
await flush();          // checkForUpdate() est asynchrone
var b=byId('upd-banner');
chk(!!b,'un bandeau signale malgré tout l\'écart');
chk(b&&b.innerHTML.indexOf('v99-2099.01.01')!==-1,'il nomme la version de l\'hôte');
chk(updates===1,'et une vérification est déclenchée');

console.log('');
console.log('── Même version : rien ne doit apparaître ──');
await flush();
body=[];C.token=null;C.snap=null;updates=0;
clientOnMsg({v:PROTO_V,t:'welcome',build:BUILD,token:'y',playerId:2,roomCode:'ABC123',
  state:{phase:'lobby',turn:0,roster:[{id:2,name:'Léa',alive:true,connected:true}],spoken:[],speakOrder:[],
         eliminated:[],scores:{},opts:{},vote:{},pingTally:{}}});
await flush();
chk(!byId('upd-banner'),'aucun bandeau quand les versions concordent');
chk(updates===0,'aucune vérification superflue');

console.log(out.join('\n'));
console.log(fails?'\n✗ '+fails+' échec(s)':'\n✓ tout passe');
process.exit(fails?1:0);
})();
