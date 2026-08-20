// Banc d'essai : identité et vote. Une session ne doit JAMAIS glisser d'un
// joueur à l'autre, et l'état du vote vient de l'hôte, jamais d'une variable
// locale du client.
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
global.window={isSecureContext:true,devicePixelRatio:1,addEventListener:function(){}};
global.self=global.window;
global.location={origin:'https://x',pathname:'/',hash:'',reload:function(){}};
global.localStorage={getItem:function(k){return store[k]||null},setItem:function(k,v){store[k]=v},removeItem:function(k){delete store[k]}};
Object.defineProperty(globalThis,'navigator',{value:{onLine:true,vibrate:function(){}},writable:true,configurable:true});
global.document={visibilityState:'visible',getElementById:byId,createElement:mk,head:{appendChild:function(){}},
  body:{appendChild:function(e){body.push(e)},removeChild:function(){}},addEventListener:function(){},activeElement:null};
global.Date={now:function(){return NOW}};
global.setTimeout=function(fn,ms){var t={id:++tseq,fn:fn,at:NOW+(ms||0)};timers.push(t);return t.id};
global.setInterval=function(fn,ms){var t={id:++tseq,fn:fn,at:NOW+ms,repeat:true};timers.push(t);return t.id};
global.clearTimeout=global.clearInterval=function(id){timers=timers.filter(function(t){return t.id!==id})};
function tick(ms){NOW+=ms;var due=timers.filter(function(t){return t.at<=NOW});
  timers=timers.filter(function(t){return t.at>NOW});due.forEach(function(t){t.fn()})}
['vendor/qrcode.js','qr.js','net.js','net-peerjs.js','client.js','pwa.js','app.js'].forEach(function(f){
  eval.call(global, fs.readFileSync(D+f,'utf8'));
});
var out=[],fails=0;
function chk(o,l){out.push((o?'  ✓ ':'  ✗ ')+l);if(!o)fails++}
function flush(){out.forEach(function(l){console.log(l)});out=[]}

// ── Transport factice : on capture TOUT ce qui sort ─────────────
var sent=[], bcast=[], killed=[];
function reset(){sent=[];bcast=[];killed=[]}
function to(cid){return sent.filter(function(m){return m.cid===cid}).map(function(m){return m.msg})}
function last(cid,t){var l=to(cid).filter(function(m){return m.t===t});return l[l.length-1]}
NET.register('peerjs',{
  host:function(){}, join:function(){}, toHost:function(){},
  send:function(cid,msg){sent.push({cid:cid,msg:JSON.parse(JSON.stringify(msg))})},
  broadcast:function(msg){bcast.push(JSON.parse(JSON.stringify(msg)))},
  kick:function(cid){killed.push(cid)},
  destroy:function(){}, status:function(){return 'open'}});
NET.use('peerjs');   // sans ça la façade n'a pas d'adaptateur et send() est muet

function room(){
  // L'horloge est figée dans ce harnais : sans ce saut, le compteur de débit
  // par connexion (12 msg/s) additionnerait tous les scénarios et finirait par
  // bloquer un message parfaitement légitime.
  NOW+=2000;
  S.mode='host';
  S.net={code:'XK7P2M',status:'open',seats:[
    {token:'HOST',name:'Jules',connId:null,connected:true,isHost:true,lastSeen:NOW}],
    seq:0,lastJSON:null};
  S.phase='lobby';S.pingOn=true;S.pingGap=5000;S.writeClues=false;
  reset();
}
function join(cid,name,joinId){hostOnMsg(cid,{v:PROTO_V,t:'hello',token:null,joinId:joinId||null,name:name})}
function tokenOf(cid){var w=last(cid,'welcome');return w&&w.token}

// ═══════════════════════════════════════════════════════════════
console.log('── V6 — une connexion, un siège (et donc un seul mot) ──');
room();
join('c2','Léa'); join('c2','Léa-bis'); join('c2','Léa-ter');
chk(S.net.seats.length===2,'trois hello sur la même connexion ⇒ un seul siège');
chk(to('c2').filter(function(m){return m.t==='welcome'}).length===3,
    'chaque hello reçoit quand même son welcome — un welcome perdu doit pouvoir être rejoué');
var tk=tokenOf('c2');
chk(to('c2').every(function(m){return m.t!=='welcome'||m.token===tk}),'toujours le MÊME token');
chk(to('c2').every(function(m){return m.t!=='welcome'||m.playerId===2}),'toujours le même siège');

// Le vrai enjeu : au lancement, cette connexion ne doit recevoir QU'UN mot.
join('c3','Marc'); join('c4','Nina');
S.uc=1;S.mw=false;S.cat=true;
syncRoster();startSession();S.phase='playing';
reset();
sendSecrets();
chk(to('c2').filter(function(m){return m.t==='secret'}).length===1,
    '✱ un seul mot secret part vers cette connexion');
flush();

// ═══════════════════════════════════════════════════════════════
console.log('');
console.log('── V5 — deux fenêtres, un seul jeton : le siège ne clignote pas ──');
room();
join('c2','Léa');
var lea=tokenOf('c2');
reset();
// Le même joueur rouvre la partie dans un autre onglet : même token.
hostOnMsg('c9',{v:PROTO_V,t:'hello',token:lea,name:'Léa'});
chk(S.net.seats.length===2,'aucun siège supplémentaire n\'est créé');
chk(S.net.seats[1].connId==='c9','le dernier arrivé tient le siège');
var rej=last('c2','reject');
chk(rej&&rej.reason==='replaced','✱ l\'ancienne fenêtre est prévenue');
chk(killed.indexOf('c2')!==-1,'et sa connexion est fermée');
// L'ancienne fenêtre ne doit plus pouvoir agir.
S.phase='vote';S.alive=[1,2];S.turn=1;S.round=0;S.votes={};S.voteCands=null;
hostOnMsg('c2',{v:PROTO_V,t:'vote',target:1,turn:1,round:0});
chk(S.votes[2]===undefined,'✱ un vote de l\'ancienne fenêtre est ignoré');
hostOnMsg('c9',{v:PROTO_V,t:'vote',target:1,turn:1,round:0});
chk(S.votes[2]===1,'celui de la fenêtre active est accepté');
flush();

// ═══════════════════════════════════════════════════════════════
console.log('');
console.log('── V4 — un exclu ne revient pas ──');
room();
join('c2','Léa');
var t2=tokenOf('c2');
S.phase='playing';S.alive=[1,2];
kickPlayer(2);
chk(S.net.seats[1].kicked===true,'le siège est marqué exclu');
reset();
hostOnMsg('c7',{v:PROTO_V,t:'hello',token:t2,name:'Léa'});
var r=last('c7','reject');
chk(r&&r.reason==='kicked','✱ son retour est refusé');
chk(S.net.seats[1].connId===null,'le siège n\'est pas réattaché');
chk(!last('c7','welcome'),'aucun welcome, donc aucun snapshot');
flush();

// ═══════════════════════════════════════════════════════════════
console.log('');
console.log('── Jointure idempotente : un welcome perdu ne crée pas de fantôme ──');
room();
// Première tentative : le hello passe, le welcome se perd, le canal meurt.
join('cA','Léa','JOIN-1');
chk(S.net.seats.length===2,'un siège');
// Le client retente : NOUVELLE connexion, token toujours nul, même joinId.
join('cB','Léa','JOIN-1');
chk(S.net.seats.length===2,'✱ toujours un seul siège — le joinId a été reconnu');
chk(S.net.seats[1].connId==='cB','réattaché à la nouvelle connexion');
// Sans joinId, l'ancien comportement aurait produit un doublon : on le vérifie
// en négatif avec un joinId différent, qui doit bien créer un second siège.
join('cC','Marc','JOIN-2');
chk(S.net.seats.length===3,'un joinId différent est bien un autre joueur');
flush();

console.log('');
console.log('── Sièges fantômes : le lobby se nettoie tout seul ──');
room();
join('c2','Léa'); join('c3','Marc');
chk(S.net.seats.length===3,'trois sièges');
S.net.seats[1].lastSeen=NOW-25000;      // Léa s'est tue il y a 25 s
hostSweep();
chk(S.net.seats.length===2,'✱ le siège muet est RETIRÉ en lobby');
chk(S.pc===2,'S.pc suit — sinon l\'hôte lance une partie avec un rôle pour personne');
chk(S.net.seats[1].name==='Marc','les suivants ont reculé d\'un cran');
// En partie, c'est l'inverse : le siège doit survivre.
S.phase='playing';
S.net.seats[1].lastSeen=NOW-25000;
hostSweep();
chk(S.net.seats.length===2,'en partie le siège est conservé');
chk(S.net.seats[1].connected===false,'seulement marqué déconnecté');
flush();

// ═══════════════════════════════════════════════════════════════
console.log('');
console.log('── V1 — retirer son vote est un ACTE, pas un affichage ──');
room();
join('c2','Léa'); join('c3','Marc');
S.uc=1;S.mw=false;syncRoster();startSession();
S.phase='vote';S.turn=1;S.round=0;S.votes={};S.voteCands=null;S.tally=null;
reset();
hostOnMsg('c2',{v:PROTO_V,t:'vote',target:3,turn:1,round:0});
chk(S.votes[2]===3,'le vote est enregistré');
var yv=last('c2','yourvote');
chk(yv&&yv.target===3,'✱ accusé de réception ciblé');
chk(bcast.every(function(m){return m.t!=='yourvote'}),'jamais diffusé à la table');
reset();
hostOnMsg('c2',{v:PROTO_V,t:'unvote',turn:1,round:0});
chk(S.votes[2]===undefined,'✱ le vote est bien retiré CHEZ L\'HÔTE');
yv=last('c2','yourvote');
chk(yv&&yv.target===null,'le joueur en est informé');
chk(snapshot().vote.votedIds.indexOf(2)===-1,'et il redevient « en attente » pour tous');
// Un retrait hors scrutin, ou sur un tour périmé, ne passe pas.
hostOnMsg('c2',{v:PROTO_V,t:'vote',target:3,turn:1,round:0});
hostOnMsg('c2',{v:PROTO_V,t:'unvote',turn:99,round:0});
chk(S.votes[2]===3,'un retrait sur un tour périmé est ignoré');
S.phase='playing';
hostOnMsg('c2',{v:PROTO_V,t:'unvote',turn:1,round:0});
chk(S.votes[2]===3,'un retrait hors phase de vote est ignoré');
S.phase='vote';
flush();

console.log('');
console.log('── Le secret du vote tient sur tout le parcours ──');
S.votes={2:3,3:2};S.revealVoters=true;
var sn=JSON.stringify(snapshot());
chk(sn.indexOf('votedIds')!==-1,'qui a voté est public');
chk(snapshot().vote.rows===null,'✱ aucune ligne de dépouillement avant la clôture');
var vt=snapshot().vote;
chk(vt.votedIds.length===2&&JSON.stringify(vt.votedIds)==='[2,3]','les deux votants sont nommés');
chk(!/"voters"/.test(sn),'✱ POUR QUI n\'apparaît nulle part tant que le vote est ouvert');
flush();

// ═══════════════════════════════════════════════════════════════
console.log('');
console.log('── V2 — la reconnexion retrouve le vote déjà émis ──');
S.votes={2:3};S.phase='vote';
reset();
hostOnMsg('c2',{v:PROTO_V,t:'hello',token:S.net.seats[1].token,name:'Léa'});
yv=last('c2','yourvote');
chk(yv&&yv.target===3,'✱ l\'hôte renvoie son vote au revenant');
chk(to('c3').filter(function(m){return m.t==='yourvote'}).length===0,
    'et à lui seul — le voisin n\'apprend rien');
// Côté client : l'écran ne doit plus dépendre de C.myVote.
S.mode='client';
C.playerId=2;C.myVote=null;C.screen='vote';
C.snap={phase:'vote',turn:1,roster:[{id:1,name:'Jules',alive:true,connected:true},
        {id:2,name:'Léa',alive:true,connected:true},{id:3,name:'Marc',alive:true,connected:true}],
        vote:{open:true,candidates:[1,3],votedIds:[2],round:0,skipAllowed:false,rows:null},
        clues:{},writeClues:false,opts:{}};
adoptRoster();renderClientVote();
chk(appEl.innerHTML.indexOf('Tu as voté')!==-1,'✱ « tu as voté » alors que C.myVote est nul');
chk(appEl.innerHTML.indexOf('vote-btn')===-1,'les boutons ne sont pas réaffichés');
chk(appEl.innerHTML.indexOf('clientUnvote')!==-1,'le bouton de retrait appelle bien l\'hôte');
// Puis le yourvote arrive et complète le libellé.
clientOnMsg({v:PROTO_V,t:'yourvote',turn:1,round:0,target:3});
renderClientVote();
chk(appEl.innerHTML.indexOf('Marc')!==-1,'et le nom du choix apparaît');
// À l'inverse : un vote refusé par l'hôte ne doit pas s'afficher.
C.myVote=1;C.snap.vote.votedIds=[];
renderClientVote();
chk(appEl.innerHTML.indexOf('vote-btn')!==-1,'✱ vote non enregistré ⇒ les boutons restent');
S.mode='host';C.snap=null;C.myVote=null;
flush();

// ═══════════════════════════════════════════════════════════════
console.log('');
console.log('── V3 — l\'hôte joue selon les mêmes règles ──');
room();
join('c2','Léa'); join('c3','Marc');
S.uc=1;S.mw=false;S.hostPlays=true;syncRoster();startSession();
S.phase='vote';S.turn=1;S.round=0;S.votes={};S.voteCands=null;S.tally=null;
render();
chk(appEl.innerHTML.indexOf('hostVote(')!==-1,'avant de voter : les boutons');
hostVote(2);
render();
chk(S.votes[1]===2,'son vote est enregistré');
chk(appEl.innerHTML.indexOf('Tu as voté')!==-1,'✱ après : son choix reste affiché');
chk(appEl.innerHTML.indexOf('hostUnvote()')!==-1,'✱ et il peut le reprendre');
hostUnvote();
chk(S.votes[1]===undefined,'le retrait fonctionne');
render();
chk(appEl.innerHTML.indexOf('hostVote(')!==-1,'les boutons reviennent');
flush();

// ═══════════════════════════════════════════════════════════════
console.log('');
console.log('── Le nouveau tour efface l\'ancien choix côté client ──');
S.mode='client';C.playerId=2;C.myVote=3;
C.snap={phase:'vote',turn:1,vote:{round:0,votedIds:[2]},roster:[]};
clientOnMsg({v:PROTO_V,t:'state',state:{phase:'vote',turn:2,roster:[],vote:{round:0,votedIds:[]},opts:{}}});
chk(C.myVote===null,'✱ tour suivant : le choix précédent est oublié');
C.myVote=3;C.snap.turn=2;C.snap.vote={round:0,votedIds:[2]};
clientOnMsg({v:PROTO_V,t:'state',state:{phase:'vote',turn:2,roster:[],vote:{round:1,votedIds:[]},opts:{}}});
chk(C.myVote===null,'revote : idem');
S.mode='host';C.snap=null;C.myVote=null;
flush();

console.log('');
console.log(fails?('✗ '+fails+' échec(s)'):'✓ tout passe');
process.exit(fails?1:0);
