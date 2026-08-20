// Banc d'essai P5 : récap, fin de partie, Mr. White distant, vote à découvert.
var fs = require('fs'), D = require('path').join(__dirname,'..')+'/';
var NOW = 1000000, timers = [], tseq = 0, store = {}, els = {};
function mkEl(){ return { style:{setProperty:function(){}}, innerHTML:'', textContent:'', className:'', value:'',
  width:0,height:0,setAttribute:function(){},appendChild:function(){},remove:function(){},getContext:function(){return{fillRect:function(){},fillStyle:''}} }; }
global.window={isSecureContext:true,devicePixelRatio:1,addEventListener:function(){}};
global.self=global.window;
global.location={origin:'https://x.test',pathname:'/uc/',hash:''};
global.localStorage={getItem:function(k){return store[k]||null},setItem:function(k,v){store[k]=v},removeItem:function(k){delete store[k]}};
global.navigator={};
global.document={visibilityState:'visible',getElementById:function(i){return els[i]||(els[i]=mkEl())},createElement:mkEl,
  head:{setAttribute:function(){},appendChild:function(){}},body:{setAttribute:function(){},appendChild:function(){},removeChild:function(){}},addEventListener:function(){}};
global.Date={now:function(){return NOW}};
global.setTimeout=function(fn,ms){var t={id:++tseq,fn:fn,at:NOW+(ms||0),ms:ms};timers.push(t);return t.id};
global.setInterval=function(fn,ms){var t={id:++tseq,fn:fn,at:NOW+ms,ms:ms,repeat:true};timers.push(t);return t.id};
global.clearTimeout=global.clearInterval=function(id){timers=timers.filter(function(t){return t.id!==id})};

['vendor/qrcode.js','qr.js','net.js','net-peerjs.js','client.js','pwa.js','app.js'].forEach(function(f){
  eval.call(global, fs.readFileSync(D+f,'utf8'));
});

var out=[],fails=0;
function chk(ok,l){out.push((ok?'  ✓ ':'  ✗ ')+l);if(!ok)fails++}

var hostH=null,inbox={},nid=0;
var Fake={ host:function(o,h){hostH=h;h.onOpen('TEST01')}, join:function(){}, toHost:function(){},
  send:function(cid,m){if(inbox[cid])inbox[cid](m)},
  broadcast:function(m){for(var c in inbox)inbox[c](m)},
  kick:function(cid){delete inbox[cid]}, destroy:function(){}, status:function(){return 'open'} };
NET.register('peerjs',Fake);

S.nm={1:'Hôte'};
hostStart();
var conns={};
['Alice','Bob','Chloé','David'].forEach(function(n,i){
  var cid='c'+(++nid); inbox[cid]=function(){}; conns[i+2]=cid;
  hostH.onMsg(cid,{v:1,t:'hello',token:null,name:n});
});
S.phase='setup';S.uc=1;S.mw=true;S.cat=true;
startSession();
// rôles déterministes
S.players=[{id:1,role:'civil'},{id:2,role:'mrwhite'},{id:3,role:'undercover'},{id:4,role:'civil'},{id:5,role:'civil'}];
S.alive=[1,2,3,4,5];
S.tp=S.alive.map(function(id){var p=S.players.filter(function(x){return x.id===id})[0];
  return{id:id,role:p.role,word:p.role==='civil'?S.pair[0]:p.role==='undercover'?S.pair[1]:null}});

// ── Mr. White éliminé → il tape sa proposition ──────────────────────────
S.phase='vote';S.vt=2;
doElim();
chk(S.phase==='mrwhite_guess','élimination de Mr. White → phase mrwhite_guess');
chk(S.mwGuessText==='','proposition réinitialisée');
var sn=snapshot();
chk(sn.mw&&sn.mw.playerId===2,'snapshot annonce le Mr. White démasqué');
chk(sn.mw.guess===null,'aucune proposition encore');

// le vrai MW envoie sa réponse
hostH.onMsg(conns[2],{v:1,t:'mw_answer',guess:'Chat',turn:S.turn});
chk(S.mwGuessText==='Chat','proposition reçue depuis le téléphone du joueur');
chk(snapshot().mw.guess==='Chat','proposition rediffusée à tous');

// un autre joueur ne peut pas répondre à sa place
hostH.onMsg(conns[3],{v:1,t:'mw_answer',guess:'Triche',turn:S.turn});
chk(S.mwGuessText==='Chat','un autre joueur ne peut pas proposer à la place du Mr. White');

// injection HTML neutralisée
hostH.onMsg(conns[2],{v:1,t:'mw_answer',guess:'<img src=x onerror=alert(1)>',turn:S.turn});
chk(S.mwGuessText.indexOf('<')===-1&&S.mwGuessText.indexOf('"')===-1,
    'balises neutralisées dans la proposition : "'+S.mwGuessText+'"');

// ── Récap : rôle et paire révélés une fois le tour fini ─────────────────
S.mwGuessText='Chat';
mwGuess(false);
chk(['turn_recap','game_over'].indexOf(S.phase)!==-1,'après réponse : '+S.phase);
if(S.phase==='turn_recap'){
  var r=snapshot().recap;
  chk(!!r,'section recap présente');
  chk(r.elimId===2&&r.elimRole==='mrwhite','éliminé et son rôle révélés');
  // La paire est désormais masquée par défaut : la révéler chaque tour
  // apprendrait à un Undercover survivant qu'il EST l'intrus.
  chk(r.pair===null,'paire masquée par défaut');
  S.revealWords=true;
  chk(snapshot().recap.pair.length===2,'paire révélée quand l\'option est active');
  S.revealWords=false;
  chk(typeof r.impostorsLeft==='number','imposteurs restants comptés');
}else{ out.push('  · partie terminée directement, recap non applicable') }

// ── Le récap ne révèle rien pendant le débat ───────────────────────────
S.phase='playing';
chk(snapshot().recap===null,'aucun recap diffusé pendant le débat');
chk(snapshot().gameOver===null,'aucun gameOver diffusé pendant le débat');
chk(snapshot().mw===null,'aucune section mw hors phase mrwhite_guess');

// ── Fin de partie ──────────────────────────────────────────────────────
S.phase='game_over';S.gr={winner:'civil',msg:'Tous démasqués !'};
var go=snapshot().gameOver;
chk(!!go&&go.winner==='civil','gameOver diffusé avec le vainqueur');
chk(go.roles.length===5,'tous les rôles révélés en fin de partie');
chk(go.pair&&go.pair.length===2,'paire révélée en fin de partie');

// ── Vote à découvert ───────────────────────────────────────────────────
S.phase='vote';S.votes={1:3,2:3,4:5};S.tally=null;S.revealVoters=false;
closeVote();
chk(S.tally.rows.every(function(x){return x.voters===null}),'sans l\'option : aucun votant nommé');
S.phase='vote';S.tally=null;S.revealVoters=true;S.votes={1:3,2:3,4:5};
closeVote();
var row3=S.tally.rows.filter(function(x){return x.target===3})[0];
chk(row3&&row3.voters&&row3.voters.length===2,'avec l\'option : votants listés ('+(row3?row3.voters.join(','):'')+')');

// ── Rendu des écrans client ────────────────────────────────────────────
S.mode='client';C.playerId=3;C.token='t';C.code='TEST01';
S.nm={1:'Hôte',2:'Alice',3:'Bob',4:'Chloé',5:'David'};

C.snap={phase:'turn_recap',turn:2,roster:[{id:3,name:'Bob',alive:true,connected:true}],spoken:[],speakOrder:[],
        eliminated:[],scores:{},opts:{},vote:{},
        recap:{skipped:false,elimId:2,elimRole:'mrwhite',pair:['Chat','Chaton'],revealWords:true,category:'Animaux',impostorsLeft:1}};
syncClientScreen();renderClient();
var h=els['app'].innerHTML;
chk(C.screen==='recap','écran récap côté client');
chk(h.indexOf('Alice')!==-1&&h.indexOf('Mr. White')!==-1,'éliminé et son rôle affichés');
chk(h.indexOf('Chat')!==-1&&h.indexOf('Chaton')!==-1,'les deux mots affichés');

C.snap={phase:'game_over',turn:4,roster:[{id:3,name:'Bob',alive:true,connected:true}],spoken:[],speakOrder:[],
        eliminated:[],scores:{},opts:{},vote:{},
        gameOver:{winner:'uc',msg:'Les UC ont pris le contrôle !',turns:4,pair:['Chat','Chaton'],category:'Animaux',
                  roles:[{id:1,role:'civil'},{id:2,role:'mrwhite'},{id:3,role:'undercover'},{id:4,role:'civil'},{id:5,role:'civil'}]}};
syncClientScreen();renderClient();
h=els['app'].innerHTML;
chk(C.screen==='over','écran fin de partie côté client');
chk(h.indexOf('Tu as gagné')!==-1,'le joueur voit qu\'il a gagné (il était UC)');
chk(h.indexOf('VICTOIRE UNDERCOVER')!==-1,'vainqueur affiché');

C.playerId=1;syncClientScreen();renderClient();
chk(els['app'].innerHTML.indexOf('Tu as perdu')!==-1,'un civil voit qu\'il a perdu');

// Mr. White : écran de saisie pour lui, écran d'attente pour les autres
C.snap={phase:'mrwhite_guess',turn:2,roster:[{id:2,name:'Alice',alive:true,connected:true}],spoken:[],speakOrder:[],
        eliminated:[],scores:{},opts:{},vote:{},mw:{playerId:2,guess:null}};
C.playerId=2;syncClientScreen();
chk(C.screen==='mw','le Mr. White a l\'écran de saisie');
renderClient();
chk(els['app'].innerHTML.indexOf('mwg')!==-1,'champ de saisie présent');
C.playerId=3;syncClientScreen();
chk(C.screen==='mwwait','les autres ont l\'écran d\'attente');
renderClient();
chk(els['app'].innerHTML.indexOf('mwg')===-1,'aucun champ de saisie pour les autres');

console.log(out.join('\n'));
console.log(fails?'\n✗ '+fails+' échec(s)':'\n✓ tout passe');
process.exit(fails?1:0);
