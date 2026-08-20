// Banc d'essai P4 : collecte des votes, dépouillement, égalités, revote.
var fs = require('fs'), D = require('path').join(__dirname,'..')+'/';
var NOW = 1000000, timers = [], tseq = 0;
var store = {};
function mkEl(){ return { style:{setProperty:function(){}}, innerHTML:'', textContent:'', className:'', value:'',
  width:0,height:0,setAttribute:function(){},appendChild:function(){},remove:function(){},getContext:function(){return{fillRect:function(){},fillStyle:''}} }; }
var els={};
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

var hostH=null,inbox={},bcast=[],nid=0;
var Fake={ host:function(o,h){hostH=h;h.onOpen('TEST01')}, join:function(){}, toHost:function(){},
  send:function(cid,m){if(inbox[cid])inbox[cid](m)},
  broadcast:function(m){bcast.push(JSON.parse(JSON.stringify(m)));for(var c in inbox)inbox[c](m)},
  kick:function(cid){delete inbox[cid]}, destroy:function(){}, status:function(){return 'open'} };
NET.register('peerjs',Fake);

// ── Salle à 5 (hôte + 4) ────────────────────────────────────────────────
S.nm={1:'Hôte'};
hostStart();
var conns={};
['Alice','Bob','Chloé','David'].forEach(function(n,i){
  var cid='c'+(++nid); inbox[cid]=function(){}; conns[i+2]=cid;
  hostH.onMsg(cid,{v:1,t:'hello',token:null,name:n});
});
S.phase='setup';S.uc=1;S.mw=false;S.skipvote=true;S.timer=0;
startSession();
chk(S.pc===5,'5 joueurs en jeu');

function vote(pid,target){ hostH.onMsg(conns[pid],{v:1,t:'vote',target:target,turn:S.turn,round:S.round}) }

// ── Majorité franche ────────────────────────────────────────────────────
startVote();
chk(S.phase==='vote','startVote → phase vote');
vote(2,3); vote(3,3); vote(4,3);
chk(Object.keys(S.votes).length===3,'3 votes enregistrés');
chk(S.phase==='vote','vote encore ouvert : l\'hôte n\'a pas voté');
hostVote(3);
vote(5,2);
chk(S.phase==='vote_result','clôture automatique quand tous ont voté');
chk(S.tally.resolved===3,'majorité franche → joueur 3 éliminé');
chk(S.tally.rows[0].target===3&&S.tally.rows[0].count===4,'décompte correct (4 voix)');
chk(S.tally.abstentions===0,'aucune abstention');

// ── Vote périmé refusé ──────────────────────────────────────────────────
S.phase='vote';S.votes={};
hostH.onMsg(conns[2],{v:1,t:'vote',target:3,turn:S.turn-1,round:0});
chk(Object.keys(S.votes).length===0,'vote d\'un tour périmé ignoré');
hostH.onMsg(conns[2],{v:1,t:'vote',target:3,turn:S.turn,round:99});
chk(Object.keys(S.votes).length===0,'vote d\'un round périmé ignoré');

// ── Cible invalide refusée ──────────────────────────────────────────────
hostH.onMsg(conns[2],{v:1,t:'vote',target:999,turn:S.turn,round:S.round});
chk(Object.keys(S.votes).length===0,'cible inexistante ignorée');

// ── Égalité → écran de départage ────────────────────────────────────────
S.phase='vote';S.votes={};S.round=0;S.tally=null;S.voteCands=null;
S.votes={1:2, 2:3, 3:2, 4:3};
closeVote();
chk(S.phase==='vote_result','égalité → vote_result');
chk(S.tally.resolved===null,'aucune résolution automatique');
chk(S.tally.tied.length===2&&S.tally.tied.indexOf(2)!==-1&&S.tally.tied.indexOf(3)!==-1,
    'ex æquo identifiés : '+S.tally.tied.join(' et '));

// ── Revote limité aux ex æquo ───────────────────────────────────────────
chk(canRevote(),'revote autorisé au premier tour d\'égalité');
doRevote();
chk(S.phase==='vote'&&S.round===1,'revote lancé (round '+S.round+')');
chk(S.voteCands.length===2,'candidats restreints aux ex æquo');
chk(Object.keys(S.votes).length===0,'votes remis à zéro');
hostH.onMsg(conns[4],{v:1,t:'vote',target:5,turn:S.turn,round:S.round});
chk(Object.keys(S.votes).length===0,'on ne peut pas voter pour un non-candidat au revote');

// ── « Personne » interdit pendant un revote ─────────────────────────────
hostH.onMsg(conns[2],{v:1,t:'vote',target:-1,turn:S.turn,round:S.round});
chk(Object.keys(S.votes).length===0,'« personne » refusé pendant un revote');

// ── Une seule relance, puis tour nul possible ───────────────────────────
S.votes={1:2,2:3,3:2,4:3};
closeVote();
chk(S.tally.tied&&!canRevote(),'égalité persistante : plus de revote (plafonné à 1)');

// ── « Personne » ne gagne jamais une égalité ────────────────────────────
S.phase='vote';S.votes={};S.round=0;S.voteCands=null;S.tally=null;
S.votes={1:-1, 2:-1, 3:4, 4:4};
closeVote();
chk(S.tally.resolved===4,'égalité entre "personne" et un joueur → le joueur l\'emporte ('+S.tally.resolved+')');

// ── Mais « personne » gagne une majorité franche ────────────────────────
S.phase='vote';S.votes={};S.tally=null;
S.votes={1:-1,2:-1,3:-1,4:4};
closeVote();
chk(S.tally.resolved===-1,'« personne » l\'emporte avec une majorité franche');

// ── Abstentions comptées ────────────────────────────────────────────────
S.phase='vote';S.votes={};S.tally=null;
S.votes={1:3,2:3};
closeVote();
chk(S.tally.abstentions===S.alive.length-2,'abstentions comptées ('+S.tally.abstentions+')');

// ── Aucun vote du tout ──────────────────────────────────────────────────
S.phase='vote';S.votes={};S.tally=null;S.round=0;
closeVote();
chk(S.tally.tied&&S.tally.tied.length===S.alive.length,'aucun vote → départage sur tous les vivants');

// ── Un déconnecté ne bloque pas la clôture ──────────────────────────────
S.phase='vote';S.votes={};S.tally=null;S.round=0;S.voteCands=null;
S.net.seats[4].connected=false;                 // David décroche
var exp=votersExpected();
chk(exp.indexOf(5)===-1,'un joueur déconnecté n\'est plus attendu');
S.votes={};exp.forEach(function(id){S.votes[id]=2});
chk(allVoted(),'la clôture automatique se déclenche sans le déconnecté');

// ── applyVote branche sur le moteur existant ────────────────────────────
S.phase='vote_result';S.tally={rows:[],abstentions:0,resolved:3,tied:null};
var aliveBefore=S.alive.length;
applyVote(3);
chk(S.alive.length===aliveBefore-1,'applyVote → doElim() élimine bien');
chk(S.alive.indexOf(3)===-1,'joueur 3 retiré des vivants');
chk(S.tally===null&&S.voteCands===null,'état de vote nettoyé après application');
chk(['turn_recap','game_over','mrwhite_guess'].indexOf(S.phase)!==-1,'phase moteur normale : '+S.phase);

// ── Le snapshot ne divulgue jamais POUR QUI on a voté ───────────────────
S.phase='vote';S.votes={1:2,2:3};S.tally=null;S.revealVoters=false;
var sn=snapshot();
chk(sn.vote.votedIds.length===2,'votedIds expose QUI a voté');
chk(JSON.stringify(sn.vote.votedIds).indexOf('{')===-1,'votedIds est une simple liste d\'ids');
var blob=JSON.stringify(sn);
chk(blob.indexOf('"votes"')===-1,'la table des votes n\'est jamais diffusée');
chk(sn.vote.rows===null,'aucun décompte diffusé tant que le vote est ouvert');

console.log(out.join('\n'));
console.log(fails?'\n✗ '+fails+' échec(s)':'\n✓ tout passe');
process.exit(fails?1:0);
