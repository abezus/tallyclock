import { firebaseConfig } from './firebase-config.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const COLORS = 8;
const LOCAL_KEY = 'tally-clock-v1';

let state = loadLocal();
let range = 'today', openEdit = null, confirmDel = null;
let cloud = null; // { ref, setDoc } while signed in

const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10);

/* ---------- time helpers ---------- */
function dayKey(t){const d=new Date(t);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function nextMidnight(t){const d=new Date(t);d.setHours(24,0,0,0);return d.getTime()}
function weekStart(t){const d=new Date(t);d.setHours(0,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7));return d.getTime()}
function credit(days,id,from,to){while(from<to){const end=Math.min(to,nextMidnight(from));const k=dayKey(from);(days[k]||(days[k]={}));days[k][id]=(days[k][id]||0)+(end-from);from=end}}
function parts(ms){const s=Math.floor(ms/1000);return{h:Math.floor(s/3600),m:Math.floor(s%3600/60),sec:s%60}}
function fmtShort(ms){const {h,m}=parts(ms);return h+'h '+String(m).padStart(2,'0')+'m'}

function totals(now){
  const days=structuredClone(state.days||{}), all={};
  for(const a of state.activities){all[a.id]=a.totalMs||0;if(a.startedAt){credit(days,a.id,a.startedAt,now);all[a.id]+=now-a.startedAt}}
  const today=dayKey(now), ws=weekStart(now), out={};
  const weekKeys=Object.keys(days).filter(k=>{const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d).getTime()>=ws});
  for(const a of state.activities){
    let w=0;for(const k of weekKeys)w+=days[k][a.id]||0;
    out[a.id]={today:(days[today]&&days[today][a.id])||0,week:w,all:all[a.id]};
  }
  return out;
}

/* ---------- state changes ---------- */
function normalize(s){
  s=s&&typeof s==='object'?s:{};
  return {activities:Array.isArray(s.activities)?s.activities:[],days:s.days&&typeof s.days==='object'?s.days:{}};
}
function stopAll(now){for(const a of state.activities){if(a.startedAt){credit(state.days,a.id,a.startedAt,now);a.totalMs=(a.totalMs||0)+(now-a.startedAt);a.startedAt=null}}}
function commit(){render();save()}
function toggle(id){const now=Date.now(),a=state.activities.find(x=>x.id===id),was=!!a.startedAt;stopAll(now);if(!was)a.startedAt=now;commit()}
function adjust(id,mins){
  const a=state.activities.find(x=>x.id===id),k=dayKey(Date.now());let delta=Math.round(mins*60000);
  if(delta<0)delta=-Math.min(-delta,a.totalMs||0);
  a.totalMs=(a.totalMs||0)+delta;(state.days[k]||(state.days[k]={}));state.days[k][id]=Math.max(0,(state.days[k][id]||0)+delta);commit();
}

/* ---------- storage ---------- */
function loadLocal(){try{return normalize(JSON.parse(localStorage.getItem(LOCAL_KEY)))}catch{return normalize(null)}}
function saveLocal(){try{localStorage.setItem(LOCAL_KEY,JSON.stringify(state))}catch{}}
function save(){
  saveLocal();
  if(cloud){
    cloud.setDoc(cloud.ref,structuredClone(state)).then(()=>status()).catch(()=>setSync('warn','Not synced — sign in again'));
    status();
  }
}

/* ---------- rendering ---------- */
const PLAY='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>';
const PAUSE='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h4.5v16H6zM13.5 4H18v16h-4.5z"/></svg>';
const pad=n=>String(n).padStart(2,'0');

function render(){
  const now=Date.now(),T=totals(now);
  $('#sumLbl').textContent={today:'Tracked today',week:'Tracked this week',all:'Tracked all time'}[range];
  let sum=0;for(const a of state.activities)sum+=T[a.id][range];
  $('#sumVal').textContent=fmtShort(sum);
  const bar=$('#bar');bar.replaceChildren();
  if(sum>0)for(const a of state.activities){const v=T[a.id][range];if(!v)continue;const s=document.createElement('span');s.style.width=(v/sum*100)+'%';s.style.background=`var(--c${a.color})`;s.title=a.name;bar.append(s)}

  const list=$('#list');list.replaceChildren();
  if(!state.activities.length){const li=document.createElement('li');li.className='empty';li.textContent='No activities yet. Add your first one below, then tap its play button to start counting.';list.append(li);return}

  for(const a of state.activities){
    const t=T[a.id],v=parts(t[range]);
    const li=document.createElement('li');li.className='row'+(a.startedAt?' running':'');li.style.setProperty('--c',`var(--c${a.color})`);
    const other=range==='all'?'Today '+fmtShort(t.today):'All time '+fmtShort(t.all);
    li.innerHTML=`<div class="name"><i></i><span></span></div>
      <div class="time">${v.h}<small>h</small> ${pad(v.m)}<small>m</small> ${pad(v.sec)}<small>s</small></div>
      <div class="sub">${a.startedAt?'Running · ':''}${other}</div>
      <div class="btns"><button type="button" class="more" data-act="edit">⋯</button><button type="button" class="go" data-act="go" aria-label="${a.startedAt?'Pause':'Start'}">${a.startedAt?PAUSE:PLAY}</button></div>`;
    li.querySelector('.name span').textContent=a.name;
    li.querySelector('.more').setAttribute('aria-label','Edit '+a.name);
    li.querySelector('[data-act=go]').onclick=()=>toggle(a.id);
    li.querySelector('[data-act=edit]').onclick=()=>{openEdit=openEdit===a.id?null:a.id;confirmDel=null;render()};
    if(openEdit===a.id)li.append(editor(a));
    list.append(li);
  }
}

function editor(a){
  const e=document.createElement('div');e.className='edit';
  e.innerHTML=`<div class="line"><label for="rn-${a.id}">Name</label><input type="text" id="rn-${a.id}" maxlength="40" style="flex:1"><button type="button" class="btn" data-x="rename">Save</button></div>
    <div class="line"><label>Color</label><div class="swatches">${Array.from({length:COLORS},(_,i)=>`<button type="button" style="--c:var(--c${i})" aria-label="Color ${i+1}" aria-pressed="${i===a.color}" data-c="${i}"></button>`).join('')}</div></div>
    <div class="line"><label for="adj-${a.id}">Correct time (minutes, applied to today)</label>
      <button type="button" class="btn" data-m="-15">−15m</button><button type="button" class="btn" data-m="15">+15m</button><button type="button" class="btn" data-m="60">+1h</button>
      <input type="number" id="adj-${a.id}" placeholder="±min" inputmode="decimal" style="width:84px"><button type="button" class="btn" data-x="adj">Apply</button></div>
    <div class="line">${confirmDel===a.id
      ?'<span class="sub">Delete this activity and all its time?</span><button type="button" class="btn danger" data-x="delyes">Delete</button><button type="button" class="btn" data-x="delno">Keep</button>'
      :'<button type="button" class="btn danger" data-x="del">Delete activity</button>'}</div>`;
  const inp=e.querySelector('#rn-'+a.id);inp.value=a.name;
  const on=(sel,fn)=>{const b=e.querySelector(sel);if(b)b.onclick=fn};
  on('[data-x=rename]',()=>{const n=inp.value.trim();if(n){a.name=n;commit()}});
  e.querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{a.color=+b.dataset.c;commit()});
  e.querySelectorAll('[data-m]').forEach(b=>b.onclick=()=>adjust(a.id,+b.dataset.m));
  on('[data-x=adj]',()=>{const n=parseFloat(e.querySelector('#adj-'+a.id).value);if(n)adjust(a.id,n)});
  on('[data-x=del]',()=>{confirmDel=a.id;render()});
  on('[data-x=delno]',()=>{confirmDel=null;render()});
  on('[data-x=delyes]',()=>{state.activities=state.activities.filter(x=>x.id!==a.id);for(const k in state.days)delete state.days[k][a.id];openEdit=confirmDel=null;commit()});
  return e;
}

/* ---------- UI wiring ---------- */
document.querySelectorAll('.ranges button').forEach(b=>b.onclick=()=>{range=b.dataset.r;document.querySelectorAll('.ranges button').forEach(x=>x.setAttribute('aria-pressed',x===b));render()});
$('#addForm').addEventListener('submit',e=>{
  e.preventDefault();const n=$('#newName').value.trim();if(!n)return;
  const used=state.activities.map(a=>a.color);let c=state.activities.length%COLORS;for(let i=0;i<COLORS;i++)if(!used.includes(i)){c=i;break}
  state.activities.push({id:uid(),name:n,color:c,totalMs:0,startedAt:null});$('#newName').value='';commit();
});
$('#syncBtn').onclick=()=>{const p=$('#account');p.hidden=!p.hidden;$('#syncBtn').setAttribute('aria-expanded',String(!p.hidden))};
setInterval(()=>{if(openEdit===null&&state.activities.some(a=>a.startedAt))render()},1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)render()});
addEventListener('online',status);addEventListener('offline',status);

function setSync(kind,text){$('#dot').className='dot'+(kind?' '+kind:'');$('#syncText').textContent=text}
function status(){
  if(!cloud)return setSync('', firebaseConfig?'Sign in to sync':'This device only');
  setSync(navigator.onLine?'on':'warn', navigator.onLine?'Synced':'Offline — will sync');
}

render();status();

/* ---------- sync (Firebase) ---------- */
async function initCloud(){
  if(!firebaseConfig){$('#acctOut').hidden=true;$('#noCloud').hidden=false;return}
  const [{initializeApp},auth,fs]=await Promise.all([
    import(FB+'firebase-app.js'),import(FB+'firebase-auth.js'),import(FB+'firebase-firestore.js')]);
  const app=initializeApp(firebaseConfig);
  const a=auth.getAuth(app);
  let db;
  try{db=fs.initializeFirestore(app,{localCache:fs.persistentLocalCache({tabManager:fs.persistentMultipleTabManager()})})}
  catch{db=fs.getFirestore(app)}
  let unsub=null;

  const msg={ 'auth/invalid-credential':'Email or password is wrong.','auth/wrong-password':'Email or password is wrong.','auth/user-not-found':'No account with that email. Tap Create account.',
    'auth/email-already-in-use':'That email already has an account. Tap Sign in.','auth/weak-password':'Use at least 6 characters for the password.',
    'auth/invalid-email':'That email address doesn\'t look right.','auth/network-request-failed':'No connection. Try again when you\'re online.',
    'auth/too-many-requests':'Too many attempts. Wait a minute and try again.'};
  async function go(fn){
    const email=$('#email').value.trim(),pw=$('#password').value;$('#authErr').textContent='';
    if(!email||!pw){$('#authErr').textContent='Enter your email and a password.';return}
    $('#signInBtn').disabled=$('#signUpBtn').disabled=true;
    try{await fn(a,email,pw)}catch(e){$('#authErr').textContent=msg[e.code]||'Couldn\'t sign in. '+(e.message||'')}
    $('#signInBtn').disabled=$('#signUpBtn').disabled=false;
  }
  $('#authForm').addEventListener('submit',e=>{e.preventDefault();go(auth.signInWithEmailAndPassword)});
  $('#signUpBtn').onclick=()=>go(auth.createUserWithEmailAndPassword);
  $('#signOutBtn').onclick=()=>auth.signOut(a);

  auth.onAuthStateChanged(a,user=>{
    if(unsub){unsub();unsub=null}
    $('#acctOut').hidden=!!user;$('#acctIn').hidden=!user;
    if(!user){cloud=null;status();return}
    $('#who').textContent=user.email;$('#account').hidden=true;$('#syncBtn').setAttribute('aria-expanded','false');
    const ref=fs.doc(db,'users',user.uid);
    cloud={ref,setDoc:fs.setDoc};
    let seeded=false;
    unsub=fs.onSnapshot(ref,{includeMetadataChanges:true},snap=>{
      if(snap.metadata.hasPendingWrites)return;
      if(!snap.exists()){
        // New account: once the server confirms it's empty, upload what this device already has.
        if(!snap.metadata.fromCache&&!seeded){seeded=true;save()}
      }else{
        state=normalize(snap.data());saveLocal();render();
      }
      status();
    },()=>setSync('warn','Sync stopped — reload the app'));
    status();
  });
}
initCloud().catch(()=>setSync('warn','Sync unavailable — saved on this device'));

/* ---------- offline support ---------- */
if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
