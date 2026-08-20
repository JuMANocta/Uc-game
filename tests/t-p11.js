// Banc d'essai : résidus d'une session précédente à la connexion.
var fs=require('fs'), D=require('path').join(__dirname,'..')+'/';
var NOW=1e6, store={}, body=[], timers=[], tseq=0;
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
Object.defineProperty(globalThis,'navigator',{value:{onLine:true},writable:true,configurable:true});
global.document={visibilityState:'visible',getElementById:byId,createElement:mk,head:{appendChild:function(){}},
  body:{appendChild:function(e){body.push(e)},removeChild:function(){}},addEventListener:function(){},activeElement:null};
global.Date={now:function(){return NOW}};
global.setTimeout=function(fn,ms){var t={id:++tseq,fn:fn,at:NOW+(ms||0)};timers.push(t);return t.id};
global.setInterval=function(fn,ms){var t={id:++tseq,fn:fn,at:NOW+ms,repeat:true};timers.push(t);return t.id};
global.clearTimeout=global.clearInterval=function(id){timers=timers.filter(function(t){return t.id!==id})};
['vendor/qrcode.js','qr.js','net.js','net-peerjs.js','client.js','pwa.js','app.js'].forEach(function(f){
  eval.call(global, fs.readFileSync(D+f,'utf8'));
});
var out=[],fails=0;
function chk(o,l){out.push((o?'  ✓ ':'  ✗ ')+l);if(!o)fails++}

var joinedH=null;
NET.register('peerjs',{host:function(){},join:function(c,h){joinedH=h},toHost:function(){},
 send:function(){},broadcast:function(){},kick:function(){},destroy:function(){},status:function(){return 'open'}});

console.log('── Le scénario : un mauvais code après une partie ──');
// On simule une partie précédente terminée dans la salle ABC123
store['uc_net_client']=JSON.stringify({code:'ABC123',token:'vieuxtoken',playerId:3,name:'Léa',
  secret:{turn:2,word:'Chat',isMrWhite:false,category:'Animaux'}});
C.token='vieuxtoken';C.playerId=3;C.secret={turn:2,word:'Chat'};C.snap={phase:'playing',turn:2,roster:[]};

// Le joueur tape un code ERRONÉ
clientJoin('ZZZZZZ','Léa');
chk(C.token===null,'le token périmé est effacé');
chk(C.playerId===null,'l\'identifiant périmé est effacé');
chk(C.secret===null,'le mot de l\'ancienne salle est effacé');
chk(C.snap===null,'l\'état de l\'ancienne salle est effacé');
chk(!store['uc_net_client'],'la sauvegarde de l\'ancienne salle est purgée');

// La salle n'existe pas → le joueur doit être PRÉVENU
joinedH.onError('no-room');
chk(C.screen==='rejected','✱ « salle introuvable » est enfin annoncé');
chk(C.link==='dead','on cesse de retenter au lieu de tourner en rond');
renderClient();
chk(appEl.innerHTML.indexOf('Aucune partie trouvée')!==-1,'la raison est écrite à l\'écran');

// Les échecs RÉSEAU doivent eux aussi être expliqués, pas noyés
[['offline','Aucune connexion Internet'],['lib','vendor'],['timeout','12 s'],['network','WebSockets']]
 .forEach(function(t){
   C.err=t[0];C.screen='rejected';renderClient();
   chk(appEl.innerHTML.indexOf(t[1])!==-1,'« '+t[0]+' » est expliqué, pas noyé dans un message générique');
 });
C.err='no-room';C.screen='rejected';

console.log('');
console.log('── Sans le correctif, ce cas tournait en boucle ──');
// Reproduction du comportement d'avant : token conservé
C.token='vieuxtoken';C.link='connecting';C.screen='connecting';
joinedH.onError('no-room');
chk(C.link==='reconnecting','avec un token, on retente — comportement voulu pour une vraie coupure');

console.log('');
console.log('── Mais retaper le code de SA salle reprend bien la session ──');
store['uc_net_client']=JSON.stringify({code:'ABC123',token:'montoken',playerId:3,name:'Léa',
  secret:{turn:2,word:'Chat',isMrWhite:false,category:'Animaux'}});
C.token=null;C.secret=null;
clientJoin('ABC123','Léa');
chk(C.token==='montoken','le token est conservé pour SA propre salle');
chk(C.playerId===3,'et son identifiant aussi');
chk(C.secret&&C.secret.word==='Chat','son mot est retrouvé — reprise sans repasser par le lobby');
chk(!!store['uc_net_client'],'la sauvegarde est préservée');
chk(C.snap===null,'mais l\'état est redemandé à l\'hôte, jamais réutilisé tel quel');

console.log('');
console.log('── Minuteries : aucun résidu qui tourne ──');
C.token=null;
clientTimerStart(60);
startHeartbeat();
var avant=timers.length;
clientJoin('QQQQQQ','Léa');
chk(timers.length<avant,'les minuteries de l\'ancienne session sont arrêtées ('+avant+' → '+timers.length+')');

console.log('');
console.log('── Code saisi en minuscules ou avec des espaces ──');
C.token=null;store['uc_net_client']=JSON.stringify({code:'ABC123',token:'t2',playerId:2,name:'Léa'});
clientJoin('  abc123  ','Léa');
chk(C.code==='ABC123','le code est normalisé');
chk(C.token==='t2','et la reprise fonctionne malgré la saisie approximative');

console.log(out.join('\n'));
console.log(fails?'\n✗ '+fails+' échec(s)':'\n✓ tout passe');
process.exit(fails?1:0);
