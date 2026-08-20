// Banc d'essai : indices écrits et faute (mot prononcé).
var fs=require('fs'), D=require('path').join(__dirname,'..')+'/';
var NOW=1e6, timers=[], tseq=0, store={}, els={};
function mk(){return{style:{setProperty:function(){}},innerHTML:'',textContent:'',className:'',value:'',
  width:0,height:0,setAttribute:function(){},appendChild:function(){},remove:function(){},getContext:function(){return{fillRect:function(){},fillStyle:''}}}}
global.window={isSecureContext:true,devicePixelRatio:1,addEventListener:function(){}};
global.self=global.window;
global.location={origin:'https://x',pathname:'/',hash:''};
global.localStorage={getItem:function(k){return store[k]||null},setItem:function(k,v){store[k]=v},removeItem:function(k){delete store[k]}};
global.navigator={};
global.document={visibilityState:'visible',getElementById:function(i){return els[i]||(els[i]=mk())},createElement:mk,
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

// ══ Détection du mot interdit ══════════════════════════════════
console.log('── Détection du mot prononcé ──');
[
 ['Chat','chat',true,'exact'],
 ['Chat','CHAT',true,'casse ignorée'],
 ['Chat','Un chat noir',true,'au milieu d\'une phrase'],
 ['Chat','des chats partout',true,'pluriel'],
 ['Chats','un chat',true,'pluriel inverse'],
 ['Chat','château',false,'PAS de faux positif sur château'],
 ['Chat','chatons mignons',false,'PAS de faux positif sur chatons'],
 ['Chat','achat groupé',false,'PAS de faux positif sur achat'],
 ['Éclair','un eclair au chocolat',true,'accents ignorés'],
 ['Pain au chocolat','j\'adore le pain au chocolat',true,'mot composé'],
 ['Pain au chocolat','du pain',false,'mot composé partiel ne compte pas'],
 ['Café','le  CAFÉ  !!',true,'ponctuation et espaces multiples'],
 ['Chat','félin domestique',false,'indice licite'],
 ['Vélo','deux roues sans moteur',false,'indice licite']
].forEach(function(t){
  var got=saysWord(t[1],t[0]);
  chk(got===t[2],'"'+t[1]+'" vs mot "'+t[0]+'" → '+(got?'FAUTE':'ok')+'   ('+t[3]+')');
});

// ══ Intégration ════════════════════════════════════════════════
console.log('');
var hostH=null,inbox={},nid=0;
var Fake={host:function(o,h){hostH=h;h.onOpen('TEST01')},join:function(){},toHost:function(){},
  send:function(cid,m){if(inbox[cid])inbox[cid](m)},
  broadcast:function(m){for(var c in inbox)inbox[c](m)},
  kick:function(cid){delete inbox[cid]},destroy:function(){},status:function(){return 'open'}};
NET.register('peerjs',Fake);

S.nm={1:'Hôte'};
hostStart();
var conns={};
['Alice','Bob','Chloé','David'].forEach(function(n,i){
  var cid='c'+(++nid);inbox[cid]=function(){};conns[i+2]=cid;
  hostH.onMsg(cid,{v:1,t:'hello',token:null,name:n});
});
S.phase='setup';S.uc=1;S.mw=true;S.writeClues=true;
startSession();
// rôles déterministes
S.players=[{id:1,role:'civil'},{id:2,role:'undercover'},{id:3,role:'mrwhite'},{id:4,role:'civil'},{id:5,role:'civil'}];
S.alive=[1,2,3,4,5];
S.pair=['Chat','Chaton'];
S.tp=S.alive.map(function(id){var p=S.players.filter(function(x){return x.id===id})[0];
  return{id:id,role:p.role,word:p.role==='civil'?S.pair[0]:p.role==='undercover'?S.pair[1]:null}});
S.ro=S.tp.map(function(_,i){return i});
S.clues={};S.fault=null;S.phase='playing';

function clue(pid,txt){hostH.onMsg(conns[pid],{v:1,t:'clue',text:txt,turn:S.turn})}

chk(S.writeClues===true,'option indices écrits active');

// indice licite d'un civil
clue(4,'animal à moustaches');
chk(S.clues[4]==='animal à moustaches','indice licite enregistré');
chk(S.spoken.indexOf(4)!==-1,'le joueur est marqué comme ayant parlé');
chk(S.alive.indexOf(4)!==-1,'il reste en jeu');

// un indice périmé est ignoré
hostH.onMsg(conns[4],{v:1,t:'clue',text:'triche',turn:S.turn-1});
chk(S.clues[4]==='animal à moustaches','indice d\'un tour périmé ignoré');

// Mr. White n'a pas de mot : il ne peut jamais commettre la faute
clue(3,'chat');
chk(S.alive.indexOf(3)!==-1,'Mr. White écrit « chat » sans être éliminé (il n\'a pas de mot)');
chk(S.clues[3]==='chat','son indice est bien enregistré');

// l'Undercover prononce SON mot
var aliveBefore=S.alive.length;
clue(2,'c\'est un chaton');
chk(S.alive.length===aliveBefore-1,'Undercover éliminé pour avoir dit son mot');
chk(S.alive.indexOf(2)===-1,'retiré des vivants');
chk(!!S.fault&&S.fault.id===2,'faute enregistrée sur le bon joueur');
chk(S.fault.word==='Chaton','mot fautif mémorisé : '+S.fault.word);
chk(['turn_recap','game_over'].indexOf(S.phase)!==-1,'passage au moteur normal : '+S.phase);

// un civil qui dit le mot UC n'est PAS fautif : c'est une déduction légitime
S.phase='playing';S.alive=[1,4,5];S.fault=null;S.clues={};
S.tp=[{id:1,role:'civil',word:'Chat'},{id:4,role:'civil',word:'Chat'},{id:5,role:'civil',word:'Chat'}];
S.ro=S.tp.map(function(_,i){return i});
clue(4,'pas un chaton, plutôt un adulte');
chk(S.alive.indexOf(4)!==-1,'un civil peut prononcer le mot UC sans sanction');

// ══ Confidentialité ════════════════════════════════════════════
console.log('');
S.clues={4:'animal à moustaches'};S.fault=null;
var sn=snapshot();
chk(sn.writeClues===true,'snapshot annonce le mode indices');
chk(sn.clues[4]==='animal à moustaches','les indices sont publics (c\'est le but)');
var blob=JSON.stringify(sn);
chk(blob.indexOf('"Chat"')===-1&&blob.indexOf('"Chaton"')===-1,'aucun mot secret dans le snapshot');
S.writeClues=false;
chk(Object.keys(snapshot().clues).length===0,'option désactivée → aucun indice diffusé');

// ══ Non-régression : sans l'option, rien ne change ═════════════
S.writeClues=false;S.phase='playing';S.alive=[1,4,5];
S.tp=[{id:1,role:'civil',word:'Chat'},{id:4,role:'civil',word:'Chat'},{id:5,role:'civil',word:'Chat'}];
S.ro=S.tp.map(function(_,i){return i});
var n0=S.alive.length;
submitClue(4,'chat');
chk(S.alive.length===n0,'option désactivée : écrire son mot n\'élimine pas');

console.log(out.join('\n'));
console.log(fails?'\n✗ '+fails+' échec(s)':'\n✓ tout passe');
process.exit(fails?1:0);
