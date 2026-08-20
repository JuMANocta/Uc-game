// Banc d'essai P7 : retours de test — saisie préservée, hôte joueur à part
// entière, révélation des mots, options effectives en multi.
var fs=require('fs'), D=require('path').join(__dirname,'..')+'/';
var NOW=1e6, timers=[], tseq=0, store={}, body=[];

function mk(t){var e={tagName:(t||'div').toUpperCase(),style:{setProperty:function(){}},innerHTML:'',textContent:'',
  className:'',id:'',value:'',width:0,height:0,selectionStart:0,selectionEnd:0,
  appendChild:function(){},remove:function(){body=body.filter(function(x){return x!==e})},
  setAttribute:function(k,v){e[k]=v},setSelectionRange:function(a,b){e.selectionStart=a;e.selectionEnd=b},
  focus:function(){ACTIVE=e},getContext:function(){return{fillRect:function(){},fillStyle:''}}};return e}

// #app rend du HTML ; les champs vivants sont matérialisés à la demande pour
// simuler un vrai DOM où l'input existe après le rendu.
var appEl=mk('div'), live={}, ACTIVE=null;
function byId(i){
  if(i==='app')return appEl;
  var f=body.filter(function(e){return e.id===i})[0]; if(f)return f;
  // un champ n'existe que s'il figure dans le HTML rendu
  if(appEl.innerHTML.indexOf('id="'+i+'"')!==-1){
    if(!live[i]){live[i]=mk('input');live[i].id=i}
    return live[i];
  }
  return null;
}
global.window={isSecureContext:true,devicePixelRatio:1,addEventListener:function(){}};
global.self=global.window;
global.location={origin:'https://x',pathname:'/',hash:''};
global.localStorage={getItem:function(k){return store[k]||null},setItem:function(k,v){store[k]=v},removeItem:function(k){delete store[k]}};
Object.defineProperty(globalThis,'navigator',{value:{onLine:true},writable:true,configurable:true});
global.document={visibilityState:'visible',getElementById:byId,createElement:mk,
  head:{appendChild:function(){}},body:{appendChild:function(e){body.push(e)},removeChild:function(){}},
  addEventListener:function(){}, get activeElement(){return ACTIVE}};
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
var Fake={host:function(o,h){hostH=h;h.onOpen('TEST01')},join:function(){},toHost:function(){},
  send:function(cid,m){if(inbox[cid])inbox[cid](m)},broadcast:function(m){for(var c in inbox)inbox[c](m)},
  kick:function(cid){delete inbox[cid]},destroy:function(){},status:function(){return 'open'}};
NET.register('peerjs',Fake);

// ══ 1. LA SAISIE N'EST PLUS EFFACÉE ════════════════════════════
console.log('── Préservation de la saisie ──');
S.nm={1:'Hôte'};
hostStart();
var conns={};
['Alice','Bob','Chloé'].forEach(function(n,i){
  var cid='c'+(++nid);inbox[cid]=function(){};conns[i+2]=cid;
  hostH.onMsg(cid,{v:1,t:'hello',token:null,name:n});
});
S.phase='setup';S.uc=1;S.mw=false;S.writeClues=true;S.cat=true;
startSession();
S.ro=S.tp.map(function(_,i){return i});
render();

// l'hôte est en train de taper son indice
var f=byId('hclue');
chk(!!f,'champ d\'indice de l\'hôte présent');
f.value='animal à quatre pa';
f.selectionStart=f.selectionEnd=18;
ACTIVE=f;
// pendant ce temps, un autre joueur envoie le sien → rediffusion → rendu
hostH.onMsg(conns[2],{v:1,t:'clue',text:'ça ronronne',turn:S.turn});
var after=byId('hclue');
chk(after&&after.value==='animal à quatre pa','le texte en cours de frappe SURVIT au rendu');
chk(after&&after.selectionStart===18,'la position du curseur est restaurée');
chk(ACTIVE===after,'le focus est rendu au champ (le clavier reste ouvert)');
chk(appEl.innerHTML.indexOf('ça ronronne')!==-1,'et l\'indice de l\'autre joueur s\'affiche bien');

// captureInput ignore ce qui n'est pas un champ
ACTIVE=null;
chk(captureInput()===null,'aucune capture hors d\'un champ');

// ══ 2. L'HÔTE EST UN JOUEUR À PART ENTIÈRE ═════════════════════
console.log('');
console.log('── L\'hôte joue vraiment ──');
chk(appEl.innerHTML.indexOf('cat-badge')!==-1,'l\'hôte voit la catégorie pendant le débat');
chk(appEl.innerHTML.indexOf(S.ct)!==-1,'catégorie affichée : '+S.ct);

// il donne son indice, qui passe par le même chemin que les autres
byId('hclue').value='félin de maison';
hostClue();
chk(S.clues[1]==='félin de maison','l\'hôte peut donner son indice');
chk(S.spoken.indexOf(1)!==-1,'il est marqué comme ayant parlé');

// UN SEUL indice par tour, l'hôte compris : l'interface masque le champ, et
// l'hôte le refuse maintenant aussi — sans quoi on pouvait lire le tableau des
// autres puis réécrire le sien.
submitClue(1,'je change d\'avis');
chk(S.clues[1]==='félin de maison','un second indice est refusé');

// et il risque la faute comme tout le monde
var myWord=S.tp.filter(function(t){return t.id===1})[0].word;
var n0=S.alive.length;
delete S.clues[1];               // on rejoue le tour comme si c'était son premier indice
submitClue(1,'c\'est un '+myWord);
chk(S.alive.length===n0-1,'l\'hôte est éliminé s\'il prononce son mot ('+myWord+')');
chk(S.fault&&S.fault.id===1,'faute enregistrée sur l\'hôte');

// renommage
S.phase='lobby';S.fault=null;
renameHost('Julien');
chk(S.nm[1]==='Julien','l\'hôte peut changer son nom');
chk(S.net.seats[0].name==='Julien','le siège est mis à jour');
chk(snapshot().roster[0].name==='Julien','le nouveau nom est diffusé aux joueurs');
render();
chk(appEl.innerHTML.indexOf('id="hostnm"')!==-1,'champ de renommage présent dans le lobby');

// ══ 3. RÉVÉLATION DES MOTS ═════════════════════════════════════
console.log('');
console.log('── Révélation des mots ──');
chk(S.revealWords===false,'masqués par défaut');

S.phase='turn_recap';S.alive=[1,3,4];S.elim=[2];S.skipt=false;
S.players=[{id:1,role:'civil'},{id:2,role:'undercover'},{id:3,role:'civil'},{id:4,role:'civil'}];
S.pair=['Chat','Chaton'];S.ct='Animaux';S.fault=null;
render();
chk(appEl.innerHTML.indexOf('Chaton')===-1,'récap : la paire n\'est PAS révélée par défaut');
chk(appEl.innerHTML.indexOf('restent secrets')!==-1,'et l\'explication est affichée');
var r=snapshot().recap;
chk(r.pair===null,'snapshot : aucune paire envoyée aux joueurs');

S.revealWords=true;render();
chk(appEl.innerHTML.indexOf('Chaton')!==-1,'option activée → la paire est révélée');
chk(snapshot().recap.pair!==null,'et transmise aux joueurs');

// fin de partie : TOUJOURS toutes les paires
S.revealWords=false;
S.hist=[{turn:1,cat:'Animaux',pair:['Chat','Chaton'],skipped:false,elim:null},
        {turn:2,cat:'Desserts',pair:['Glace','Sorbet'],skipped:false,elim:null}];
S.phase='game_over';S.gr={winner:'civil',msg:'Gagné !'};
render();
var h=appEl.innerHTML;
chk(h.indexOf('LES MOTS DE LA PARTIE')!==-1,'fin de partie : section récapitulative');
chk(h.indexOf('Chat')!==-1&&h.indexOf('Sorbet')!==-1,'toutes les paires des 2 tours sont listées');
var go=snapshot().gameOver;
chk(go.allWords.length===2,'snapshot : '+go.allWords.length+' paires transmises aux joueurs');
chk(go.allWords[1].pair[1]==='Sorbet','contenu correct');

// côté client
S.mode='client';C.playerId=2;C.token='t';C.code='TEST01';
S.nm={1:'Julien',2:'Alice'};
C.snap={phase:'game_over',turn:2,roster:[{id:2,name:'Alice',alive:true,connected:true}],spoken:[],speakOrder:[],
  eliminated:[],scores:{},opts:{},vote:{},gameOver:go};
syncClientScreen();renderClient();
chk(appEl.innerHTML.indexOf('LES MOTS DE LA PARTIE')!==-1,'les joueurs voient aussi le récapitulatif');
chk(appEl.innerHTML.indexOf('Sorbet')!==-1,'avec toutes les paires');

C.snap={phase:'turn_recap',turn:1,roster:[{id:2,name:'Alice',alive:true,connected:true}],spoken:[],speakOrder:[],
  eliminated:[],scores:{},opts:{},vote:{},
  recap:{skipped:false,elimId:1,elimRole:'civil',pair:null,revealWords:false,category:'Animaux',impostorsLeft:1}};
syncClientScreen();renderClient();
chk(appEl.innerHTML.indexOf('restent secrets')!==-1,'récap client : mots masqués expliqués');

// ══ 4. OPTIONS EFFECTIVES EN MULTI ═════════════════════════════
console.log('');
console.log('── Options en multi ──');
S.mode='host';S.phase='playing';S.alive=[1,3,4];
S.tp=[{id:1,role:'civil',word:'Chat'},{id:3,role:'civil',word:'Chat'},{id:4,role:'civil',word:'Chat'}];
S.ro=[0,1,2];S.clues={};S.fault=null;
S.cat=true;render();
chk(appEl.innerHTML.indexOf('cat-badge')!==-1,'catégorie ON  → badge affiché');
S.cat=false;render();
chk(appEl.innerHTML.indexOf('cat-badge')===-1,'catégorie OFF → badge masqué');
chk(snapshot().category===null,'et rien n\'est transmis aux joueurs');
S.cat=true;
chk(snapshot().category==='Animaux','catégorie ON → transmise aux joueurs');

S.night=true;
chk(snapshot().impostorsLeft===null,'mode nuit → compteur d\'imposteurs masqué');
S.night=false;
chk(typeof snapshot().impostorsLeft==='number','mode nuit OFF → compteur transmis');

S.skipvote=true;S.voteCands=null;
chk(snapshot().vote.skipAllowed===true,'vote nul → « personne » proposé aux joueurs');
S.skipvote=false;
chk(snapshot().vote.skipAllowed===false,'vote nul OFF → option retirée');

console.log(out.join('\n'));
console.log(fails?'\n✗ '+fails+' échec(s)':'\n✓ tout passe');
process.exit(fails?1:0);
