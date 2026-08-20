// Banc d'essai : identité des sièges après départ, et nom de l'appareil.
var fs=require('fs'), D=require('path').join(__dirname,'..')+'/';
var NOW=1e6, store={}, body=[];
function mk(t){var e={tagName:'DIV',textContent:'',style:{setProperty:function(){}},className:'',id:'',value:'',
  width:0,height:0,appendChild:function(){},focus:function(){},_h:'',
  remove:function(){body=body.filter(function(x){return x!==e})},setAttribute:function(k,v){e[k]=v},
  getContext:function(){return{fillRect:function(){},fillStyle:''}}};
Object.defineProperty(e,'innerHTML',{get:function(){return e._h},set:function(v){e._h=v}});return e}
var appEl=mk();
function byId(i){return i==='app'?appEl:(body.filter(function(e){return e.id===i})[0]||null)}
global.window={isSecureContext:true,devicePixelRatio:1,addEventListener:function(){}};
global.self=global.window;
global.location={origin:'https://x',pathname:'/',hash:''};
global.localStorage={getItem:function(k){return store[k]||null},setItem:function(k,v){store[k]=v},removeItem:function(k){delete store[k]}};
Object.defineProperty(globalThis,'navigator',{value:{onLine:true},writable:true,configurable:true});
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

var hostH=null,inbox={},sentTo={},nid=0;
NET.register('peerjs',{host:function(o,h){hostH=h;h.onOpen('T1')},join:function(){},toHost:function(){},
 send:function(c,m){(sentTo[c]=sentTo[c]||[]).push(JSON.parse(JSON.stringify(m)));if(inbox[c])inbox[c](m)},
 broadcast:function(m){for(var c in inbox)inbox[c](m)},
 kick:function(c){delete inbox[c]},destroy:function(){},status:function(){return 'open'}});

// ══ Le nom de l'hôte ═══════════════════════════════════════════
console.log('── Nom de l\'hôte ──');
// Simule une partie solo précédente : le roster contient les noms des AMIS
store['uc_opts']=JSON.stringify({nm:{1:'Ancien Hôte',2:'Léa',3:'Marc'},pc:3});
loadOpts();
chk(S.nm[1]==='Ancien Hôte','le roster solo contient bien un nom hérité');
hostStart();
chk(S.net.seats[0].name==='Hôte','le siège 1 ne récupère PAS le nom du roster solo');
closeRoom();

// Avec un nom mémorisé sur l'appareil, on le reprend
setMyName('Julien');
chk(myName()==='Julien','le nom de l\'appareil est mémorisé');
hostStart();
chk(S.net.seats[0].name==='Julien','l\'hôte reprend SON nom, pas celui d\'un prédécesseur');
// et le renommage le met à jour
renameHost('Ju');
chk(myName()==='Ju','renommer l\'hôte met à jour le nom de l\'appareil');

// ══ Identité des sièges ════════════════════════════════════════
console.log('');
console.log('── Le scénario vécu : un joueur quitte le lobby ──');
closeRoom();setMyName('Hôte');
hostStart();
var conns={};
['Alice','Bob','Chloé'].forEach(function(n,i){
  var cid='c'+(++nid);inbox[cid]=function(){};conns[n]=cid;
  hostH.onMsg(cid,{v:1,t:'hello',token:null,name:n});
});
chk(S.net.seats.length===4,'4 sièges : hôte + Alice(2) + Bob(3) + Chloé(4)');
var idOf=function(n){return S.net.seats.map(function(s){return s.name}).indexOf(n)+1};
chk(idOf('Chloé')===4,'Chloé occupe le siège 4');

// Le téléphone de Chloé mémorise son identifiant
sentTo={};
var chloeId=null;
inbox[conns['Chloé']]=function(m){if(m.t==='welcome')chloeId=m.playerId;if(m.t==='seat')chloeId=m.playerId};
hostH.onMsg(conns['Chloé'],{v:1,t:'hello',token:S.net.seats[3].token,name:'Chloé'});
chk(chloeId===4,'son téléphone connaît l\'identifiant 4');

// Bob quitte → tout le monde recule d'un cran
hostOnClose(conns['Bob']);
chk(S.net.seats.length===3,'Bob a libéré son siège');
chk(idOf('Chloé')===3,'Chloé est maintenant au siège 3');
chk(chloeId===3,'✱ son téléphone a été prévenu SANS reconnexion');

// Même chose sur une exclusion
console.log('');
console.log('── Exclusion ──');
var davidCid='c'+(++nid);inbox[davidCid]=function(){};
hostH.onMsg(davidCid,{v:1,t:'hello',token:null,name:'David'});
var davidId=null;
inbox[davidCid]=function(m){if(m.t==='welcome')davidId=m.playerId;if(m.t==='seat')davidId=m.playerId};
hostH.onMsg(davidCid,{v:1,t:'hello',token:S.net.seats[3].token,name:'David'});
chk(davidId===4,'David au siège 4');
kickPlayer(2);                       // on exclut Alice
chk(idOf('David')===3,'David remonte au siège 3');
chk(davidId===3,'✱ son téléphone suit le mouvement');

// ══ Conséquence : plus de faux « éliminé » ═════════════════════
console.log('');
console.log('── Plus de faux éliminé ──');
S.mode='client';C.playerId=4;C.token='t';C.code='T1';
S.nm={1:'Hôte',2:'Chloé',3:'David'};
// roster APRÈS renumérotation : l'id 4 n'existe plus
C.snap={phase:'playing',turn:1,roster:[{id:1,name:'Hôte',alive:true,connected:true,host:true},
  {id:2,name:'Chloé',alive:true,connected:true},{id:3,name:'David',alive:false,connected:true}],
  spoken:[],speakOrder:[1,2,3],eliminated:[],scores:{},opts:{},vote:{},pingTally:{}};
syncClientScreen();
var avant=C.screen;
clientOnMsg({v:1,t:'seat',playerId:3});
chk(C.playerId===3,'le message seat corrige l\'identifiant');
chk(C.screen==='dead','et l\'écran se recale sur le VRAI état du joueur');

// ══ Le pseudo mémorisé à la connexion ══════════════════════════
console.log('');
console.log('── Pseudo mémorisé ──');
store['uc_me']=JSON.stringify('Julien');
S.mode='client';C.name='';C.screen='join';
renderClient();
chk(appEl.innerHTML.indexOf('value="Julien"')!==-1,'l\'écran de connexion pré-remplit le pseudo');

console.log(out.join('\n'));
console.log(fails?'\n✗ '+fails+' échec(s)':'\n✓ tout passe');
process.exit(fails?1:0);
