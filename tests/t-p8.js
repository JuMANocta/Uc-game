// Banc d'essai : pings (public/privé, anti-flood) et indices au vote.
var fs=require('fs'), D=require('path').join(__dirname,'..')+'/';
var NOW=1e6, timers=[], tseq=0, store={}, body=[];
function tick(ms){var end=NOW+ms;for(;;){var d=timers.filter(function(t){return t.at<=end}).sort(function(a,b){return a.at-b.at})[0];
  if(!d)break;NOW=d.at;if(d.repeat)d.at=NOW+d.ms;else timers=timers.filter(function(t){return t!==d});d.fn()}NOW=end}
// Un vrai navigateur crée des enfants quand on affecte innerHTML ; le stub
// enregistre donc les id qu'il y trouve, sinon paintPing() n'a pas de cible.
var idreg={};
function mk(t){var e={tagName:(t||'div').toUpperCase(),textContent:'',style:{setProperty:function(){}},
  className:'',id:'',value:'',width:0,height:0,appendChild:function(){},focus:function(){},_h:'',
  remove:function(){body=body.filter(function(x){return x!==e});if(e.id)delete idreg[e.id]},
  setAttribute:function(k,v){e[k]=v},getContext:function(){return{fillRect:function(){},fillStyle:''}}};
Object.defineProperty(e,'innerHTML',{get:function(){return e._h},set:function(v){
  e._h=v;
  var re=/id="([\w-]+)"/g,m;
  while((m=re.exec(v))){ if(!idreg[m[1]]&&!body.some(function(x){return x.id===m[1]})) idreg[m[1]]=mk('div') }
}});
return e}
var appEl=mk('div');
function byId(i){if(i==='app')return appEl;
var f=body.filter(function(e){return e.id===i})[0];
return f||idreg[i]||null}
global.window={isSecureContext:true,devicePixelRatio:1,addEventListener:function(){}};
global.self=global.window;
global.location={origin:'https://x',pathname:'/',hash:''};
global.localStorage={getItem:function(k){return store[k]||null},setItem:function(k,v){store[k]=v},removeItem:function(k){delete store[k]}};
Object.defineProperty(globalThis,'navigator',{value:{onLine:true},writable:true,configurable:true});
global.document={visibilityState:'visible',getElementById:byId,createElement:mk,head:{appendChild:function(){}},
  body:{appendChild:function(e){body.push(e)},removeChild:function(){}},addEventListener:function(){},activeElement:null};
global.Date={now:function(){return NOW}};
global.setTimeout=function(fn,ms){var t={id:++tseq,fn:fn,at:NOW+(ms||0),ms:ms};timers.push(t);return t.id};
global.setInterval=function(fn,ms){var t={id:++tseq,fn:fn,at:NOW+ms,ms:ms,repeat:true};timers.push(t);return t.id};
global.clearTimeout=global.clearInterval=function(id){timers=timers.filter(function(t){return t.id!==id})};

['vendor/qrcode.js','qr.js','net.js','net-peerjs.js','client.js','pwa.js','app.js'].forEach(function(f){
  eval.call(global, fs.readFileSync(D+f,'utf8'));
});
var out=[],fails=0;
function chk(o,l){out.push((o?'  ✓ ':'  ✗ ')+l);if(!o)fails++}

// ── Salle à 5 ────────────────────────────────────────────────────
var hostH=null,inbox={},sentTo={},bcast=[],nid=0;
var Fake={host:function(o,h){hostH=h;h.onOpen('T1')},join:function(){},toHost:function(){},
  send:function(cid,m){(sentTo[cid]=sentTo[cid]||[]).push(JSON.parse(JSON.stringify(m)));if(inbox[cid])inbox[cid](m)},
  broadcast:function(m){bcast.push(JSON.parse(JSON.stringify(m)));for(var c in inbox)inbox[c](m)},
  kick:function(c){delete inbox[c]},destroy:function(){},status:function(){return 'open'}};
NET.register('peerjs',Fake);

S.nm={1:'Hôte'};
hostStart();
var conns={};
['Alice','Bob','Chloé','David'].forEach(function(n,i){
  var cid='c'+(++nid);inbox[cid]=function(){};conns[i+2]=cid;
  hostH.onMsg(cid,{v:1,t:'hello',token:null,name:n});
});
S.phase='setup';S.uc=1;S.mw=false;startSession();
function ping(from,to,emoji,pub){hostH.onMsg(conns[from],{v:1,t:'buzz',to:to,emoji:emoji,pub:pub})}

console.log('── Options ──');
chk(S.pingOn===true,'pings actifs par défaut');
chk(S.pingGap===5000,'délai par défaut de 5 s');
chk(snapshot().opts.pingOn===true,'option diffusée aux joueurs');
chk(snapshot().opts.pingGap===5000,'délai diffusé aux joueurs');

// ── Ping PUBLIC ciblé ────────────────────────────────────────────
console.log('');
console.log('── Ping public ──');
bcast=[];sentTo={};S.pingTally={};
ping(2,4,'skull',true);
chk(bcast.some(function(m){return m.t==='buzzed'&&m.pub===true&&m.to===4}),'diffusé à toute la table');
var t4=S.pingTally[4];
chk(!!t4&&t4.skull===1,'décompte incrémenté sur la cible');
chk(snapshot().pingTally[4].skull===1,'décompte visible dans le snapshot');

// ── Ping PRIVÉ : étanchéité ──────────────────────────────────────
console.log('');
console.log('── Ping privé ──');
NOW+=6000;                       // laisser passer le délai
bcast=[];sentTo={};S.pingTally={};
ping(2,4,'skull',false);
chk(!bcast.some(function(m){return m.t==='buzzed'}),'AUCUNE diffusion à tous');
var target=conns[4];
chk((sentTo[target]||[]).some(function(m){return m.t==='buzzed'&&m.pub===false}),'message ciblé envoyé à la seule cible');
var others=[conns[3],conns[5]].filter(function(c){return (sentTo[c]||[]).some(function(m){return m.t==='buzzed'})});
chk(others.length===0,'les autres joueurs ne reçoivent rien');
chk(!S.pingTally[4],'aucun décompte : le ping privé ne laisse pas de trace publique');
chk(JSON.stringify(snapshot()).indexOf('buzzed')===-1,'le snapshot ne contient jamais de ping privé');
var pm=(sentTo[target]||[]).filter(function(m){return m.t==='buzzed'})[0];
chk(pm&&pm.from===2,'la cible sait QUI l\'envoie (jamais anonyme)');

// ── Anti-flood ───────────────────────────────────────────────────
console.log('');
console.log('── Anti-flood ──');
NOW+=6000;
bcast=[];
ping(2,4,'bell',true);
var n1=bcast.filter(function(m){return m.t==='buzzed'}).length;
ping(2,4,'bell',true);           // immédiatement après
ping(2,3,'skull',true);
ping(2,0,'bell',true);
var n2=bcast.filter(function(m){return m.t==='buzzed'}).length;
chk(n1===1&&n2===1,'les pings suivants sont ignorés dans le délai ('+n2+' passé)');
NOW+=5100;
ping(2,4,'bell',true);
chk(bcast.filter(function(m){return m.t==='buzzed'}).length===2,'après le délai, un nouveau ping passe');
// le délai est par expéditeur, pas global
bcast=[];
ping(3,4,'bell',true);
chk(bcast.some(function(m){return m.t==='buzzed'&&m.from===3}),'le délai est propre à chaque expéditeur');

// ── Garde-fous ───────────────────────────────────────────────────
console.log('');
console.log('── Garde-fous ──');
NOW+=6000;bcast=[];
ping(2,2,'bell',true);
chk(!bcast.some(function(m){return m.t==='buzzed'}),'se pinger soi-même est refusé');
NOW+=6000;bcast=[];
ping(2,99,'bell',true);
chk(!bcast.some(function(m){return m.t==='buzzed'}),'cible inexistante refusée');
NOW+=6000;bcast=[];
ping(2,4,'bombe',true);
chk(!bcast.some(function(m){return m.t==='buzzed'}),'symbole inconnu refusé');
NOW+=6000;bcast=[];S.pingOn=false;
ping(2,4,'bell',true);
chk(!bcast.some(function(m){return m.t==='buzzed'}),'option désactivée : aucun ping ne passe');
chk(Object.keys(snapshot().pingTally).length===0,'et aucun décompte diffusé');
S.pingOn=true;

// ── Réinitialisation par tour ────────────────────────────────────
console.log('');
S.pingTally={4:{bell:0,skull:3}};
startTurn();
chk(Object.keys(S.pingTally).length===0,'décompte remis à zéro au tour suivant');

// ── Indices visibles au vote ─────────────────────────────────────
console.log('');
console.log('── Indices pendant le vote ──');
S.writeClues=true;S.clues={2:'animal poilu',3:'ça miaule'};
S.mode='client';C.playerId=4;
S.nm={1:'Hôte',2:'Alice',3:'Bob',4:'Chloé',5:'David'};
C.snap={phase:'vote',turn:1,roster:[{id:2,name:'Alice',alive:true,connected:true},{id:4,name:'Chloé',alive:true,connected:true}],
  spoken:[],speakOrder:[2,3,4],eliminated:[],scores:{},opts:{pingOn:true,pingGap:5000},
  writeClues:true,clues:{2:'animal poilu',3:'ça miaule'},pingTally:{},
  vote:{open:true,candidates:[2,4],votedIds:[],round:0,skipAllowed:false}};
C.myVote=null;syncClientScreen();renderClient();
var h=appEl.innerHTML;
chk(h.indexOf('animal poilu')!==-1&&h.indexOf('ça miaule')!==-1,'les indices sont rappelés sur l\'écran de vote');
C.snap.phase='vote_result';
C.snap.vote={rows:[{target:2,count:2,voters:null}],tied:null,resolved:2,abstentions:0};
syncClientScreen();renderClient();
chk(appEl.innerHTML.indexOf('animal poilu')!==-1,'et sur l\'écran de dépouillement');
C.snap.writeClues=false;C.snap.phase='vote';
C.snap.vote={open:true,candidates:[2,4],votedIds:[],round:0,skipAllowed:false};
syncClientScreen();renderClient();
chk(appEl.innerHTML.indexOf('animal poilu')===-1,'option désactivée : rien à rappeler');

// ── Fenêtre de ping ──────────────────────────────────────────────
console.log('');
console.log('── Fenêtre ──');
C.snap.opts={pingOn:true,pingGap:5000};C.snap.pingTally={2:{skull:2}};   // 2 est dans le roster
_lastPingSent=0;
showPing();
var ov=byId('ping-box');
chk(!!ov,'la fenêtre s\'ouvre');
chk(ov.innerHTML.indexOf('Tout le monde')!==-1,'ligne « tout le monde » présente');
chk(ov.innerHTML.indexOf('Vu par tous')!==-1&&ov.innerHTML.indexOf('En privé')!==-1,'bascule public/privé');
chk(ov.innerHTML.indexOf('Chloé')===-1,'on ne se propose pas soi-même comme cible');
chk(ov.innerHTML.indexOf('💀2')!==-1,'badge de pression affiché sur le nom visé');
showPing();
chk(!byId('ping-ov'),'re-clic referme');
C.snap.opts.pingOn=false;
showPing();
chk(!byId('ping-ov'),'option désactivée : la fenêtre ne s\'ouvre pas');

console.log(out.join('\n'));
console.log(fails?'\n✗ '+fails+' échec(s)':'\n✓ tout passe');
process.exit(fails?1:0);
