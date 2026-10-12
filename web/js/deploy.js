/* ---------- 배포요청: 하루 한 건인 배포요청 일감을 바로 열고, 내가 쓴 배포요청 댓글을 따로 모아 본다 ----------
   배포요청 일감은 평소 노트와 똑같이 저장·표시되고(구분 '배포요청'), 댓글도 평소 댓글 쓰기로 쓴다. 일감을 새로 만들지는 않는다. */
const deployDate=n=>((n.subject||"").match(/(\d{4}-\d{2}-\d{2})/)||[])[1]||"";
function deployEntries(){
  const out=[];
  all.filter(n=>rolesOf(n).includes("배포요청")).forEach(n=>myComments(n).forEach(j=>out.push({n,j,date:deployDate(n),t:j.created_on||""})));
  return out.sort((a,b)=>b.date.localeCompare(a.date)||b.t.localeCompare(a.t));
}
/* 오늘 배포요청 알림: 오늘 날짜의 배포요청 일감이 있으면 메뉴에 로켓. 설정에서 끔 / 켬 / 자동.
   켬 = 앱을 켤 때와 창으로 돌아올 때 확인, 자동 = 거기에 더해 10분마다 확인하고 바뀌면 알려 줌. (읽기만 하고 아무것도 쓰지 않는다)
   모양은 댓글 흐름으로 정한다 (실제 이력: '상태 완료'는 요청이 없는 날에도 찍히고, 완료 뒤에도 요청이 계속 와서 상태로는 알 수 없다):
     🚀 대기 중 = 마지막 구분선(절취선) 뒤에 배포 요청 댓글이 남아 있음 · 착륙한 로켓 = 요청이 모두 구분선 앞 · 흐린 🚀 = 일감만 있고 요청이 아직 없음 */
const dpAl={id:0,date:"",at:0,first:true,state:"",pending:0,requests:0};
const DP_LAND_SVG=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 21.2h19"/><path d="M8.2 21.2l1.7-3.2M15.8 21.2l-1.7-3.2"/><path d="M12 2.8c2.9 2.4 3.9 5.8 3.9 9.6V18H8.1v-5.6c0-3.8 1-7.2 3.9-9.6z"/><circle cx="12" cy="9.6" r="1.5"/><path d="M8.1 14.2L5.2 17.4h2.9M15.9 14.2l2.9 3.2h-2.9"/></svg>`;
function dpIcon(sm){
  if(!dpAl.id||dpMode()==="off")return "";
  const c=sm?" sm":"",id=dpAl.id;
  if(dpAl.state==="landed")return `<span class="dpdot landed${c}" data-dpal title="오늘 요청은 모두 배포됐어요 — 로켓이 착륙했어요 (#${id}) · 누르면 열어요">${DP_LAND_SVG}</span>`;
  if(dpAl.state==="idle")return `<span class="dpdot idle${c}" data-dpal title="오늘 배포요청 일감이 있어요 (#${id}) · 아직 올라온 요청은 없어요 · 누르면 열어요">🚀</span>`;
  return `<span class="dpdot${c}" data-dpal title="${dpAl.pending?`오늘 배포 요청이 ${dpAl.pending}건 대기 중이에요`:"오늘 배포요청이 있어요"} (#${id}) · 누르면 열어요">🚀</span>`;
}
const dpMode=()=>["off","on","auto"].includes(ui.depAlert)?ui.depAlert:"auto";
async function checkDeployAlert(force){
  const t=todayStr();
  if(dpMode()==="off"){if(dpAl.id){dpAl.id=0;renderNav()}return}
  if(!force&&dpAl.date===t&&Date.now()-dpAl.at<5*60*1000)return;
  dpAl.at=Date.now();
  try{
    const list=await api("/api/rm/deploy?date="+t),id=list.length?list[0].id:0,prev=dpAl.id?dpAl.state:"",first=dpAl.first;
    let st=null;if(id){try{st=await api("/api/rm/deploy/state?id="+id)}catch(e){}}      // 상태를 못 읽으면 기본 로켓 모양
    dpAl.date=t;dpAl.id=id;dpAl.first=false;dpAl.state=st?st.state:"";dpAl.pending=st?st.pending||0:0;dpAl.requests=st?st.requests||0:0;renderNav();
    if(first||!id||dpMode()!=="auto")return;
    const now=dpAl.state;      // 자동 모드에서만, 모양이 바뀌었을 때 알려 준다
    if(now==="pending"&&(prev===""||prev==="idle"))toast(`오늘 배포 요청이 올라왔어요 🚀 (${dpAl.pending}건 대기) — 메뉴의 🚀 를 누르면 열려요`,6000);
    else if(now==="pending"&&prev==="landed")toast(`배포 뒤에 요청이 더 올라왔어요 (${dpAl.pending}건) — 로켓이 다시 떴어요 🚀`,6000);
    else if(now==="landed"&&prev==="pending")toast("오늘 요청이 모두 배포됐어요 — 로켓이 착륙했어요",5000);
  }catch(e){}      // 연결이 안 되면 조용히 넘어간다 (이전 표시 유지)
}
let dpTimer=null;
function startDeployAlert(){
  checkDeployAlert(true);
  clearInterval(dpTimer);dpTimer=setInterval(()=>{if(dpMode()==="auto"&&!document.hidden)checkDeployAlert(true)},10*60*1000);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden&&dpMode()!=="off")checkDeployAlert(false)});
}
async function openDeploy(date){
  const msg=$("#dpMsg");if(msg)msg.textContent="찾는 중…";
  try{
    const list=await api("/api/rm/deploy?date="+date);
    if(!list.length){if(msg)msg.innerHTML=`<b>${date}</b> 배포요청이 아직 없어요. (이 앱은 배포요청 일감을 새로 만들지 않아요)`;else toast(`${date} 배포요청이 아직 없어요`,3000);return}
    const id=list[0].id;
    const r=await post("/api/fetch",{ids:[id],role:"배포요청"});await loadAll();
    if(r.got.includes(id)){toast(`${date} 배포요청(#${id})을 열었어요`,2200);openNote(id)}else if(msg)msg.textContent="가져오지 못했어요: "+((r.failed[0]||{}).reason||"알 수 없음");
  }catch(e){if(msg)msg.textContent="찾지 못했어요: "+e.message;else toast("배포요청을 찾지 못했어요: "+e.message,5000)}
}
async function renderDeploy(){
  const c=$("#center"),t=todayStr(),ents=deployEntries(),have=new Set(all.map(n=>n.issue_id));
  c.innerHTML=`<div class="dp-h"><h2>배포요청</h2><span class="meta">하루에 한 건인 배포요청 일감을 열고, 내가 쓴 배포요청 댓글을 모아 봅니다</span></div>
   <div class="card dpcard"><div class="fhd"><span>배포요청 열기</span><small>[운영서버 배포요청 / 날짜]</small></div>
     <div class="row" style="margin:0"><button type="button" class="primary" id="dpToday">오늘 배포요청 열기</button><span class="meta">또는 날짜</span><input type="date" id="dpDate" value="${t}"><button type="button" id="dpGo">이 날 열기</button></div>
     <div class="meta" id="dpMsg" style="margin-top:8px">열면 내 노트로 저장되고, 평소 노트처럼 댓글을 쓸 수 있어요. 댓글에 적은 <b>#번호</b> 중 내 노트에 있는 일감에는 진행 기록이 자동으로 남아요 (설정에서 끌 수 있어요).</div></div>
   <div class="card"><div class="fhd"><span>내 배포요청 댓글 모음</span><small>${ents.length}개 · 날짜순</small><span class="sp"></span><button type="button" class="mini" id="dpBack" title="최근 30일의 배포요청 일감을 한꺼번에 가져와서 내 댓글을 모읍니다">지난 30일 가져오기</button></div>
     ${ents.map(e=>{const nums=[...new Set([...remoteText(e.j.raw!=null?e.j.raw:e.j.notes).matchAll(/#(\d{3,8})/g)].map(m=>+m[1]))];
       return `<div class="dpent"><div class="dph"><b>${esc(e.date||"?")}</b><span class="meta">${dTime(e.j.created_on)} · ${title(e.n.subject).replace(/<[^>]+>/g,"")} (#${e.n.issue_id})</span><span class="sp"></span><button type="button" class="mini" data-dpopen="${e.n.issue_id}">배포요청 열기</button></div>
         <div class="bubble dpb">${cmBody(e.j)}</div>
         ${nums.length?`<div class="chips">${nums.map(x=>have.has(x)?`<span class="chip" data-dpn="${x}" title="내 노트 열기">#${x}</span>`:`<span class="chip ghost" data-dpadd="${x}" title="가져오기">#${x} ＋</span>`).join("")}</div>`:""}</div>`}).join("")
       ||`<div class="meta" style="padding:8px 0">아직 내가 쓴 배포요청 댓글이 없어요. 위에서 배포요청을 열어 댓글을 쓰거나, <b>지난 30일 가져오기</b>를 눌러 보세요.</div>`}</div>`;
  $("#dpToday").onclick=()=>openDeploy(todayStr());
  $("#dpGo").onclick=()=>{const d=$("#dpDate").value;if(d)openDeploy(d)};
  $("#dpBack").onclick=async()=>{
    const b=$("#dpBack");b.disabled=true;b.textContent="가져오는 중…";
    try{const list=await api("/api/rm/deploy?days=30");
      if(!list.length){toast("최근 30일에 배포요청 일감이 없어요",3000)}
      else{const r=await post("/api/fetch",{ids:list.map(x=>x.id),role:"배포요청"});await loadAll();toast(`배포요청 ${r.got.length}건을 가져왔어요 ✓`,3000)}}
    catch(e){toast("가져오지 못했어요: "+e.message,6000)}
    if(view==="deploy")renderDeploy();
  };
  c.querySelectorAll("[data-dpopen]").forEach(b=>b.onclick=()=>openNote(+b.dataset.dpopen));
  c.querySelectorAll("[data-dpn]").forEach(x=>x.onclick=()=>openNote(+x.dataset.dpn));
  c.querySelectorAll("[data-dpadd]").forEach(x=>x.onclick=async()=>{const id=+x.dataset.dpadd;try{const r=await post("/api/fetch",{ids:[id],role:"추가됨"});await loadAll();if(r.got.includes(id))openNote(id);else toast("가져오지 못했어요",3000)}catch(e){toast(e.message,4000)}});
  wireCp(c);fillAttImgs(c);
}
async function autoDeployProgress(n,text){   // 배포요청 댓글을 올리면, 그 글에 적은 #번호 중 내 노트에 있는 일감의 진행 기록에 한 줄을 남긴다
  if(ui.autoDeployPg===false||!rolesOf(n).includes("배포요청"))return;
  const ids=[...new Set([...(text||"").matchAll(/#(\d{3,8})/g)].map(m=>+m[1]))].filter(i=>i!==n.issue_id&&all.some(x=>x.issue_id===i));
  if(!ids.length)return;
  const t=todayStr(),line=`배포 요청 ${deployDate(n)||t} (${(n.subject||"").replace(/^\[|\]$/g,"")} #${n.issue_id})`;let k=0;
  for(const i of ids){const x=all.find(y=>y.issue_id===i);if((x._pg||[]).some(p=>p.day===t&&p.text===line))continue;
    try{await post("/api/progress",{id:null,issue_id:i,day:t,text:line});k++}catch(e){}}
  if(k){await loadProgress();all.forEach(prep);buildTokens();const c=$("#center"),y=c.scrollTop;renderAll();c.scrollTop=y;toast(`진행 기록 ${k}건을 남겼어요 (배포 요청)`,3000)}
}
/* 종료: Ctrl+Q 또는 설정의 '프로그램 종료'. 창·서버·트레이를 모두 닫는다. 닫기 전에 한 번 묻는다. */
async function confirmQuit(){
  if($("#wdlg.show"))return;
  try{flushEdits()}catch(e){}                                         // 저장 안 한 노트 변경이 있으면 먼저 저장
  let drafts=0;try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith("rncm:")&&(localStorage.getItem(k)||"").trim())drafts++}}catch(e){}
  const ok=await wdlg({title:"프로그램을 종료할까요?",ok:"종료",cancel:"취소",focusNo:true,
    body:`창과 서버, 알림 영역 아이콘까지 <b>모두 닫힙니다.</b><br>쓰던 노트는 저장되어 있고, 다시 실행하면 이어서 쓸 수 있어요.${drafts?`<br><b>아직 올리지 않은 댓글 ${drafts}개</b>는 이 PC에 남아 있다가 다음에 다시 보여요.`:""}`});
  if(ok)quitApp();
}
document.addEventListener("keydown",e=>{
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&!e.shiftKey&&(e.code==="KeyQ"||(e.key||"").toLowerCase()==="q")){e.preventDefault();confirmQuit()}
});
async function quitApp(){
  try{await post("/api/quit",{})}catch(e){}
  document.body.innerHTML=`<div style="max-width:420px;margin:20vh auto;text-align:center;font:16px/1.7 system-ui,sans-serif">프로그램을 종료했습니다.<br>이 창은 닫아도 됩니다.<br><span style="opacity:.6;font-size:.9em">다시 쓰려면 프로그램을 실행하세요.</span></div>`;
}
