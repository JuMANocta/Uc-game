// Banc d'essai P3 : distribution des mots secrets, étanchéité, timer, reprise.
var fs = require('fs');
var D = require('path').join(__dirname,'..')+'/';
var NOW = 1000000, timers = [], tseq = 0;
function tick(ms) {
  var end = NOW + ms;
  for (;;) {
    var due = timers.filter(function (t) { return t.at <= end; }).sort(function (a, b) { return a.at - b.at; })[0];
    if (!due) break;
    NOW = due.at;
    if (due.repeat) due.at = NOW + due.ms; else timers = timers.filter(function (t) { return t !== due; });
    due.fn();
  }
  NOW = end;
}
var store = {};
function mkEl() { return { style:{setProperty:function(){}}, innerHTML:'', textContent:'', className:'', value:'',
  width:0, height:0, setAttribute:function(){},appendChild:function(){}, remove:function(){}, getContext:function(){return{fillRect:function(){},fillStyle:''}} }; }
global.window = { isSecureContext: true, devicePixelRatio: 1, addEventListener: function () {} };
global.self = global.window;
global.location = { origin: 'https://x.test', pathname: '/uc/', hash: '' };
global.localStorage = { getItem:function(k){return store[k]||null}, setItem:function(k,v){store[k]=v}, removeItem:function(k){delete store[k]} };
global.navigator = {};
// #app capture le HTML rendu ; les autres lookups renvoient null comme dans un
// DOM réel où l'élément n'existe pas encore.
var appEl = mkEl();
global.document = { visibilityState:'visible',
  getElementById:function(id){ return id==='app' ? appEl : null }, createElement:mkEl,
  head:{setAttribute:function(){},appendChild:function(){}}, body:{setAttribute:function(){},appendChild:function(){},removeChild:function(){}}, addEventListener:function(){} };
global.Date = { now: function () { return NOW; } };
global.setTimeout = function (fn, ms) { var t={id:++tseq,fn:fn,at:NOW+(ms||0),ms:ms}; timers.push(t); return t.id; };
global.setInterval = function (fn, ms) { var t={id:++tseq,fn:fn,at:NOW+ms,ms:ms,repeat:true}; timers.push(t); return t.id; };
global.clearTimeout = global.clearInterval = function (id) { timers = timers.filter(function(t){return t.id!==id}); };

['vendor/qrcode.js','qr.js','net.js','net-peerjs.js','client.js','pwa.js','app.js'].forEach(function (f) {
  eval.call(global, fs.readFileSync(D + f, 'utf8'));
});

var out = [], fails = 0;
function chk(ok, l) { out.push((ok?'  ✓ ':'  ✗ ')+l); if(!ok)fails++; }

var hostH=null, inbox={}, sentTo={}, bcast=[], nid=0;
var Fake = {
  host:function(o,h){hostH=h;h.onOpen(o&&o.code?o.code:'TEST01')},
  join:function(){}, toHost:function(){},
  send:function(cid,m){ (sentTo[cid]=sentTo[cid]||[]).push(JSON.parse(JSON.stringify(m))); if(inbox[cid])inbox[cid](m) },
  broadcast:function(m){ bcast.push(JSON.parse(JSON.stringify(m))); for(var c in inbox)inbox[c](m) },
  kick:function(cid){delete inbox[cid]}, destroy:function(){}, status:function(){return 'open'}
};
NET.register('peerjs', Fake);

// ── Partie à 5 : hôte + 4 joueurs ────────────────────────────────────────
S.nm = { 1: 'Hôte' };
hostStart();
function connect(name){ var cid='c'+(++nid); inbox[cid]=function(){}; hostH.onMsg(cid,{v:1,t:'hello',token:null,name:name}); return cid }
var ids = ['Alice','Bob','Chloé','David'].map(connect);
S.phase='setup'; S.uc=1; S.mw=true; S.cat=true; S.timer=120;
sentTo = {}; bcast = [];
startSession();

chk(S.phase==='playing', 'démarrage direct en playing (pas de handoff)');
chk(S.pc===5, '5 joueurs');

// ── Chaque joueur distant reçoit UN secret, le sien ──────────────────────
var secrets = {};
ids.forEach(function(cid,i){
  var ms=(sentTo[cid]||[]).filter(function(m){return m.t==='secret'});
  secrets[i+2]=ms[0];
  chk(ms.length===1, 'joueur '+(i+2)+' : exactement 1 message secret');
});

var allWords = {};
S.tp.forEach(function(t){ allWords[t.id]=t.word });

var mismatched = Object.keys(secrets).filter(function(pid){
  return secrets[pid] && secrets[pid].word !== allWords[pid];
});
chk(mismatched.length===0, 'chacun reçoit exactement SON mot');

// ── Aucun `role` transmis ────────────────────────────────────────────────
var roleLeak = Object.keys(secrets).filter(function(pid){ return secrets[pid] && secrets[pid].role !== undefined });
chk(roleLeak.length===0, 'aucun champ `role` dans les secrets (seulement isMrWhite)');

var mwSecret = Object.keys(secrets).map(function(p){return secrets[p]}).filter(function(m){return m&&m.isMrWhite})[0];
if (mwSecret) chk(mwSecret.word===null, 'Mr. White reçoit word:null');
else out.push('  · pas de Mr. White ce tour (rôles tirés au sort)');

// ── Un joueur ne voit jamais le mot d'un autre ───────────────────────────
var crossLeak = 0;
ids.forEach(function(cid,i){
  var pid=i+2;
  var blob=JSON.stringify(sentTo[cid]||[]);
  Object.keys(allWords).forEach(function(other){
    if(+other===pid)return;
    var w=allWords[other];
    if(w && w!==allWords[pid] && blob.indexOf(w)!==-1) crossLeak++;
  });
});
chk(crossLeak===0, 'aucun joueur ne reçoit le mot d\'un autre');

// ── Rien de sensible dans les diffusions ─────────────────────────────────
var bblob = JSON.stringify(bcast);
var leakedInBroadcast = Object.keys(allWords).filter(function(pid){
  var w=allWords[pid]; return w && bblob.indexOf(w)!==-1;
});
chk(leakedInBroadcast.length===0, 'aucun mot dans les messages diffusés à tous');
chk(bblob.indexOf('"role"')===-1, 'aucun champ role dans les diffusions');

// ── Timer diffusé ────────────────────────────────────────────────────────
var tmsg = bcast.filter(function(m){return m.t==='timer'&&m.action==='start'});
chk(tmsg.length>0 && tmsg[tmsg.length-1].remaining===120, 'départ du timer diffusé (120 s)');

// ── Reconnexion en pleine partie : mot ET timer renvoyés ─────────────────
S.trem = 75;
var tokAlice = S.net.seats[1].token;
var cR='r9'; inbox[cR]=function(){}; sentTo[cR]=[];
hostH.onMsg(cR,{v:1,t:'hello',token:tokAlice,name:'Alice'});
var got=sentTo[cR];
chk(got.some(function(m){return m.t==='welcome'}), 'reconnexion : welcome renvoyé');
var sec2=got.filter(function(m){return m.t==='secret'})[0];
chk(!!sec2 && sec2.word===allWords[2], 'reconnexion : son mot lui est renvoyé');
chk(got.some(function(m){return m.t==='timer'&&m.remaining===75}), 'reconnexion : timer resynchronisé à 75 s');

// ── Un mort ne reçoit plus de secret ─────────────────────────────────────
S.alive = S.alive.filter(function(x){return x!==3});
var cD='r10'; inbox[cD]=function(){}; sentTo[cD]=[];
hostH.onMsg(cD,{v:1,t:'hello',token:S.net.seats[2].token,name:'Bob'});
chk(!(sentTo[cD]||[]).some(function(m){return m.t==='secret'}), 'un joueur éliminé ne reçoit pas de mot en se reconnectant');

// ── Le client rend son écran sans réseau ─────────────────────────────────
S.mode='client';
C.playerId=2; C.token=tokAlice; C.code='TEST01';
C.snap={phase:'playing',turn:1,roster:[{id:1,name:'Hôte',alive:true,connected:true,host:true},{id:2,name:'Alice',alive:true,connected:true}],
        spoken:[],speakOrder:[1,2],eliminated:[],scores:{},opts:{},vote:{},category:'Animaux'};
C.secret={turn:1,word:'Chat',isMrWhite:false,category:'Animaux'};
C.link='reconnecting'; C.wordShown=false;
S.nm={1:'Hôte',2:'Alice'};
syncClientScreen();
chk(C.screen==='word', 'client en phase playing → écran mot');
renderClient();
chk(appEl.innerHTML.indexOf('Reconnexion')!==-1, 'bandeau de reconnexion affiché');
chk(appEl.innerHTML.indexOf('APPUIE POUR VOIR')!==-1, 'mot masqué par défaut');
chk(appEl.innerHTML.indexOf('Chat')===-1, 'le mot n\'est PAS dans le DOM tant qu\'on n\'a pas tapé');
C.wordShown=true; renderClient();
chk(appEl.innerHTML.indexOf('Chat')!==-1, 'après tap, le mot s\'affiche');
chk(appEl.innerHTML.indexOf('Animaux')!==-1, 'catégorie affichée');

// ── Éliminé côté client ──────────────────────────────────────────────────
C.snap.roster[1].alive=false;
syncClientScreen();
chk(C.screen==='dead', 'joueur éliminé → écran spectateur');

// ── Mr. White forcé : vérification déterministe ──────────────────────────
S.mode='host';
S.players=[{id:1,role:'civil'},{id:2,role:'mrwhite'},{id:3,role:'undercover'},{id:4,role:'civil'},{id:5,role:'civil'}];
S.alive=[1,2,3,4,5];
sentTo={}; bcast=[];
// on réattache des connexions vivantes aux sièges 2..5
S.net.seats.forEach(function(s,i){ if(!s.isHost){ var c='m'+i; inbox[c]=function(){}; s.connId=c; s.connected=true; } });
startTurn();
var mw = S.net.seats[1].connId;
var mwMsg = (sentTo[mw]||[]).filter(function(m){return m.t==='secret'})[0];
chk(!!mwMsg && mwMsg.isMrWhite===true, 'Mr. White : isMrWhite=true');
chk(!!mwMsg && mwMsg.word===null, 'Mr. White : word=null (aucun mot transmis)');
chk(!!mwMsg && mwMsg.role===undefined, 'Mr. White : toujours aucun champ role');

var uc = S.net.seats[2].connId;
var ucMsg = (sentTo[uc]||[]).filter(function(m){return m.t==='secret'})[0];
chk(!!ucMsg && ucMsg.isMrWhite===false && ucMsg.word===S.pair[1],
    'Undercover reçoit le mot UC sans savoir qu\'il est UC');
chk(JSON.stringify(ucMsg).indexOf('undercover')===-1, 'le mot "undercover" n\'apparaît nulle part dans son message');

console.log(out.join('\n'));
console.log(fails ? '\n✗ '+fails+' échec(s)' : '\n✓ tout passe');
process.exit(fails?1:0);
