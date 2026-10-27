/* ---------- 저장 (버튼 · Ctrl+S · 이동 전 자동 저장) ----------
   노트의 요건/처리 내용/수정한 코드/수정 이유는 서버(내 PC의 SQLite 파일)에 저장된다.
   - 저장 버튼 또는 Ctrl+S : 바로 저장
   - 저장 안 한 변경이 있는 채로 다른 노트·보기로 가거나 화면이 다시 그려질 때 : 먼저 자동 저장
   - 탭을 닫을 때 : 저장을 시도(sendBeacon)
   진행 기록·용어·즐겨찾기·기록 모드는 누르는 즉시 저장된다. */
const readEdits=()=>({action:edGet($("#ac")),code_change:edGet($("#cc")),reason:edGet($("#rs"))});
const changedFrom=(base,v)=>!!base&&Object.keys(v).some(k=>base[k]!==v[k]);
const hhmm=()=>{const d=new Date();return `${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`};
async function persistNote(n,v,auto,prev){
  try{await post("/api/note",{issue_id:n.issue_id,...v})}
  catch(err){toast(`저장 실패: ${err.message} — 서버가 꺼져 있을 수 있습니다. 쓴 내용은 화면에 남아 있으니 서버를 켠 뒤 다시 저장하세요`,12000);return false}
  const tgt=all.find(x=>x.issue_id===n.issue_id)||n;
  Object.assign(tgt,v);if(tgt!==n)Object.assign(n,v);prep(tgt);buildTokens();
  if(edNote&&edNote.issue_id===n.issue_id){edBase={...v};edSavedAt=hhmm();edSaveN++}
  if(!(auto&&V2()))toast(auto?"쓰던 내용을 자동 저장했습니다":"저장했습니다 ✓",2200);   // 새 디자인은 입력을 멈추면 늘 자동 저장하므로 알림 없이 저장 줄에만 표시
  // 새로 뭔가 써서 저장하면 '기록' 모드로 자동 전환한다 (기본은 '기록 불필요')
  if(changedFrom(prev,v)&&isMine(tgt)&&tgt.rec_mode!=="record")await setRec(tgt,"record",true);
  wireRec(tgt);renderTabs();renderList();renderDict();
  return true;
}
async function saveNote(){
  const n=edNote;if(!n||!$("#ac"))return false;
  const v=readEdits();
  if(!changedFrom(edBase,v)){toast("변경된 내용이 없습니다 (이미 저장되어 있습니다)",2200);return true}
  const prev=edBase;edBase={...v};                     // 저장 중에 또 입력해도 그 부분은 '변경'으로 남도록 기준을 먼저 옮긴다
  const ok=await persistNote(n,v,false,prev);
  if(!ok)edBase=prev;                                  // 실패하면 계속 '저장되지 않은 변경'으로 표시
  return ok;
}
function flushEdits(){
  if(!edNote||!document.querySelector("#ac"))return;
  const pt=document.querySelector("#pgtext");if(pt)pgDraft.set(edNote.issue_id,edGet(pt));
  const v=readEdits();if(!changedFrom(edBase,v))return;
  const n=edNote,tgt=all.find(x=>x.issue_id===n.issue_id)||n,prev=edBase;
  Object.assign(tgt,v);if(tgt!==n)Object.assign(n,v);prep(tgt);   // 화면을 다시 그려도 방금 쓴 내용이 그대로 보이도록 먼저 반영
  edBase={...v};
  persistNote(tgt,v,true,prev);                                       // 서버 저장은 뒤에서 진행 (실패하면 알림)
}
/* 새 디자인: 정리 기록은 입력을 멈추고 잠시 뒤 자동 저장한다 (저장 버튼 없이). 기존 디자인은 예전처럼 버튼 · Ctrl+S · 이동 전 자동 저장 */
let noteTypedAt=0;
document.addEventListener("input",e=>{if(e.target&&e.target.closest&&e.target.closest("#sec-notes"))noteTypedAt=Date.now()},true);
setInterval(()=>{   // 저장 줄에 '저장되지 않은 변경'을 실시간으로 표시
  const sv=$("#sv");if(view!=="note"||!edNote||!$("#ac")||!sv)return;
  const dirty=changedFrom(edBase,readEdits());
  if(V2()){
    if(dirty&&Date.now()-noteTypedAt>1500)flushEdits();
    if(sv._n===undefined||sv._id!==edNote.issue_id){sv._n=edSaveN;sv._id=edNote.issue_id}     // 노트를 막 연 것은 '저장'이 아니니 표시하지 않는다
    if(edSaveN!==sv._n){sv._n=edSaveN;sv._until=Date.now()+2500}     // 자동 저장된 순간에만 잠깐 보인다
    const show=!dirty&&Date.now()<(sv._until||0);
    sv.className="v2saved"+(show?" show":"");
    if(show)sv.textContent=`✓ ${edSavedAt?edSavedAt.slice(0,5)+" ":""}자동 저장됨`;
    return;
  }
  sv.className=dirty?"dirty":"meta";
  sv.textContent=dirty?"● 저장되지 않은 변경이 있습니다 — Ctrl+S 로 저장 (다른 곳으로 이동하면 자동 저장됩니다)":`✓ ${edSavedAt?edSavedAt+" 저장됨":"저장된 상태"} · Ctrl+S 로 저장 · 내 기록은 이 PC에만 저장됩니다`;
},600);
window.addEventListener("pagehide",()=>{   // 탭을 닫거나 새로고침할 때, 저장 안 한 내용이 있으면 저장을 시도한다
  if(!edNote||!$("#ac"))return;
  const v=readEdits();if(!changedFrom(edBase,v))return;
  try{navigator.sendBeacon("/api/note",new Blob([JSON.stringify({issue_id:edNote.issue_id,...v})],{type:"application/json"}))}catch(_){}
});
document.addEventListener("keydown",e=>{   // Ctrl+S: 지금 편집 중인 곳을 저장 (한글 입력 상태에서도 동작하도록 물리 키(KeyS)로 판단)
  if(!((e.ctrlKey||e.metaKey)&&!e.altKey&&(e.code==="KeyS"||(e.key||"").toLowerCase()==="s")))return;
  e.preventDefault();
  if($("#modal").classList.contains("show"))return;
  const ae=document.activeElement,inside=sel=>ae&&ae.closest&&ae.closest(sel);
  const pe=inside('[id^="pgt-"]');if(pe){const b=$("#pgs-"+pe.id.slice(4));if(b){b.click();return}}          // 진행 기록 수정 중
  if(inside("#pgtext")&&edGet($("#pgtext")).trim()){$("#pgadd").click();return}                           // 새 진행 기록 입력 중
  if(inside("#dict")&&$("#fs")){$("#fs").click();return}                                                   // 용어 등록/수정 중
  if(view==="note"&&edNote&&$("#ac")){saveNote();return}
  toast("저장할 노트가 열려 있지 않습니다",2000);
});

/* Ctrl+Enter: 진행 기록을 수정하는 중이면 그 기록을 저장, 새 진행 기록을 쓰는 중이면 추가.
   window 의 '캡처' 단계에서 먼저 받아서, 코드 상자(원래는 Ctrl+Enter 가 상자에서 빠져나오기) 안에서 눌러도 저장된다. */
window.addEventListener("keydown",e=>{
  if(e.key!=="Enter"||!(e.ctrlKey||e.metaKey)||e.altKey||e.shiftKey||e.isComposing)return;
  if($("#wdlg.show")||$("#modal").classList.contains("show"))return;
  const ae=document.activeElement,inside=sel=>ae&&ae.closest&&ae.closest(sel);
  const pe=inside('[id^="pgt-"]');
  if(pe){const b=$("#pgs-"+pe.id.slice(4));if(b){e.preventDefault();e.stopPropagation();b.click()}return}
  if(inside("#pgtext")&&$("#pgadd")&&edGet($("#pgtext")).trim()){e.preventDefault();e.stopPropagation();$("#pgadd").click()}
},true);

/* ---------- 기록 모드 (기록 불필요 / 기록) ---------- */
function recHtml(n){
  const need=needsRec(n),rec=n.rec_mode==="record";
  return `<span class="meta">기록</span><div class="seg"><button type="button" data-rec="none" class="${rec?"":"on"}" title="기록하지 않아도 되는 일감">기록 불필요</button><button type="button" data-rec="record" class="${rec?"on":""}" title="기록해야 하는 일감: 내용이 비어 있으면 '기록 필요'로 표시됩니다">기록</button></div>`
    +(need?`<span class="needrec">✎ 기록 필요 — 처리 내용·코드·이유·진행 기록 중 하나를 쓰세요</span>`:rec?`<span class="meta">✓ 기록됨</span>`:`<span class="meta">무엇이든 쓰고 저장하면 자동으로 '기록' 모드가 됩니다</span>`);
}
function wireRec(n){
  const box=$("#recbox");if(!box||cur!==n.issue_id)return;
  box.innerHTML=recHtml(n);
  box.querySelectorAll("[data-rec]").forEach(b=>b.onclick=()=>setRec(n,b.dataset.rec));
}
async function setRec(n,mode,auto){
  if(n.rec_mode===mode)return;
  await post("/api/recmode",{issue_id:n.issue_id,rec_mode:mode});n.rec_mode=mode;
  wireRec(n);renderTabs();renderList();
  if(auto)toast("내용을 써서 '기록' 모드로 전환했습니다",2500);
}

/* ---------- 진행 기록 (일자별): 어제는 어디까지, 오늘은 어디까지 ---------- */
const todayStr=()=>fmt(new Date());
const dayAgo=k=>{const d=new Date();d.setDate(d.getDate()-k);return fmt(d)};
const relDay=day=>{const k=Math.round((new Date(todayStr()+"T00:00:00")-new Date(day+"T00:00:00"))/864e5);return k===0?"오늘":k===1?"어제":k>1?`${k}일 전`:`${-k}일 후`};
function pgEntry(p){
  return `<div class="pge" data-pg="${p.id}"><div class="pgh"><span class="meta">${(p.created_at||"").slice(11,16)} 작성${p.updated_at&&p.updated_at!==p.created_at?" · 수정됨":""}</span><span class="sp"></span>
    <button type="button" class="mini" data-pgedit="${p.id}">수정</button><button type="button" class="mini danger" data-pgdel="${p.id}">삭제</button></div>
    <div class="${pvClass()}">${renderMd(p.text)}</div></div>`;
}
const pgFold=new Set();      // 접어 둔 날짜 ("일감번호|날짜"). 화면을 열어 둔 동안만 기억한다
const pgInit=new Set();      // 처음 연 노트: 오늘(없으면 가장 최근 날짜)만 펼치고 나머지 날짜는 접어서 시작한다
const pgKey=(n,d)=>`${n.issue_id}|${d}`;
const pgPreview=t=>softNl(t).replace(/```[\s\S]*?```/g," ⟨코드⟩ ").split(/\r?\n/).map(x=>x.replace(/[​`]/g,"").trim()).find(Boolean)||"";
function pgListHtml(n){
  const arr=n._pg||[];
  if(!arr.length)return `<div class="meta">아직 진행 기록이 없습니다. 날마다 어디까지 했는지 남겨 두면 다음에 이어서 하기 쉽습니다.</div>`;
  const asc=!!ui.pgAsc;      // 시간 순서: 오름차(오래된 것이 위) / 내림차(최신이 위, 기본)
  const days=[...new Set(arr.map(p=>p.day))].sort((a,b)=>asc?a.localeCompare(b):b.localeCompare(a));
  const entries=d=>arr.filter(p=>p.day===d).sort((a,b)=>asc?a.id-b.id:b.id-a.id);
  if(!pgInit.has(n.issue_id)){pgInit.add(n.issue_id);const t=todayStr(),openDay=days.includes(t)?t:days.reduce((m,d)=>d>m?d:m,"");days.forEach(d=>{if(d!==openDay)pgFold.add(pgKey(n,d))})}
  const allFolded=days.every(d=>pgFold.has(pgKey(n,d)));
  const bar=`<div class="pgbar"><span class="meta">${arr.length}건 · ${days.length}일</span><span class="sp"></span>
    <button type="button" class="mini" id="pgboard" title="진행 기록을 포스트잇 보드로 크게 봐요 (메모처럼 끌어서 옮기기 · 색 · 고정). Esc · 바깥 누르기로 닫혀요">📌 보드로 보기</button>
    <button type="button" class="mini" id="pgsort" title="날짜와 같은 날 안의 기록을 모두 이 순서로 보여 줍니다">${asc?"오래된 순 ↑":"최신 순 ↓"}</button>
    <button type="button" class="mini" id="pgfoldall">${allFolded?"전체 펼치기":"전체 접기"}</button></div>`;
  return bar+days.map(d=>{
    const es=entries(d),folded=pgFold.has(pgKey(n,d));
    return `<div class="pgdayh ${folded?"folded":""}" data-pgfold="${d}" role="button" tabindex="0" title="${folded?"눌러서 펼치기":"눌러서 접기"}">${chev(!folded)}<b>${d}</b> <span class="meta">${relDay(d)} · ${es.length}건</span>${folded?`<span class="pgprev">${esc(pgPreview((asc?es[0]:es[es.length-1]).text).slice(0,70))}</span>`:""}</div>${folded?"":es.map(pgEntry).join("")}`;
  }).join("");
}
function wirePg(n){
  const list=$("#pglist");if(!list||cur!==n.issue_id)return;
  list.innerHTML=pgListHtml(n);wireCp(list);
  const busy=()=>{if(list.querySelector(".rte")){toast("수정 중인 기록이 있습니다. 저장하거나 취소한 뒤에 접고 펼 수 있습니다",3500);return true}return false};
  if($("#pgboard"))$("#pgboard").onclick=()=>{if(!busy())pgbOpen(n)};
  const days=[...new Set((n._pg||[]).map(p=>p.day))];
  list.querySelectorAll("[data-pgfold]").forEach(h=>{
    const go=()=>{if(busy())return;const k=pgKey(n,h.dataset.pgfold);pgFold.has(k)?pgFold.delete(k):pgFold.add(k);wirePg(n)};
    h.onclick=go;h.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();go()}};
  });
  if($("#pgsort"))$("#pgsort").onclick=()=>{if(busy())return;ui.pgAsc=!ui.pgAsc;saveUI();wirePg(n)};
  if($("#pgfoldall"))$("#pgfoldall").onclick=()=>{
    if(busy())return;
    const all=days.every(d=>pgFold.has(pgKey(n,d)));
    days.forEach(d=>all?pgFold.delete(pgKey(n,d)):pgFold.add(pgKey(n,d)));wirePg(n)};
  list.querySelectorAll("[data-pgdel]").forEach(b=>b.onclick=async()=>{
    if(!await askC("이 진행 기록을 삭제할까요?"))return;
    await api("/api/progress/"+b.dataset.pgdel,{method:"DELETE"});await pgRefresh(n)});
  list.querySelectorAll("[data-pgedit]").forEach(b=>b.onclick=()=>pgEdit(n,+b.dataset.pgedit));
}
async function pgRefresh(n){   // 이 일감의 진행 기록만 다시 그린다 (위의 입력 중인 칸은 건드리지 않는다)
  await loadProgress();prep(n);buildTokens();wirePg(n);wireRec(n);renderTabs();renderList();refreshJumpPg(n);
}
function refreshJumpPg(n){   // 이동 바의 📝 칩 숫자 (진행 기록 수)
  const b=document.querySelector('#jumpbar [data-jump="pg"]');if(!b||cur!==n.issue_id)return;
  const k=(n._pg||[]).length;let i=b.querySelector("i");
  if(k){if(!i){i=document.createElement("i");b.appendChild(i)}i.textContent=k}else if(i)i.remove();
}
function pgEdit(n,id){
  const p=(n._pg||[]).find(x=>x.id===id),el=document.querySelector(`[data-pg="${id}"]`);if(!p||!el)return;
  el.innerHTML=`<div class="frow" style="margin-top:0"><input type="date" id="pgd-${id}" value="${p.day}" style="flex:none;min-width:0"></div><div class="rte" id="pgt-${id}"></div>
    <div class="row"><button type="button" class="primary" id="pgs-${id}" title="Ctrl+Enter 또는 Ctrl+S">저장</button><button type="button" id="pgc-${id}">취소</button></div>`;
  edInit($("#pgt-"+id),p.text);
  $("#pgs-"+id).onclick=async()=>{
    const text=edGet($("#pgt-"+id)).trim(),day=$("#pgd-"+id).value;
    if(!text||!day)return toast("날짜와 내용을 입력하세요",2500);
    await post("/api/progress",{id,issue_id:n.issue_id,day,text});await pgRefresh(n);toast("수정했습니다",1800)};
  $("#pgc-"+id).onclick=()=>wirePg(n);
}
function initPg(n){
  edInit($("#pgtext"),pgDraft.get(n.issue_id)||"");      // 다른 곳에 갔다 와도 입력 중이던 글이 남는다
  const setDay=d=>{$("#pgday").value=d;$("#pgrel").textContent=relDay(d)};
  setDay(todayStr());
  $("#pgday").onchange=e=>{$("#pgrel").textContent=e.target.value?relDay(e.target.value):""};
  $("#pgtoday").onclick=()=>setDay(todayStr());$("#pgyest").onclick=()=>setDay(dayAgo(1));
  $("#pgadd").onclick=async()=>{
    const text=edGet($("#pgtext")).trim(),day=$("#pgday").value;
    if(!text)return toast("어디까지 했는지 내용을 적어 주세요",2500);
    if(!day)return toast("날짜를 선택하세요",2500);
    await post("/api/progress",{issue_id:n.issue_id,day,text});
    pgDraft.delete(n.issue_id);edInit($("#pgtext"),"");pgFold.delete(pgKey(n,day));await pgRefresh(n);toast(`${day} 진행 기록을 추가했습니다`,2200);
    if(n.rec_mode!=="record")await setRec(n,"record",true);                  // 진행 기록을 썼으면 '기록' 모드로
  };
  wirePg(n);
}
const REL={relates:"연관",blocks:"선행",blocked:"후행",duplicates:"중복",duplicated:"중복",precedes:"선행",follows:"후행",copied_to:"복사",copied_from:"복사"};
function neighbors(id){      // 연결된 일감: 같은 일감은 한 번만 (양쪽에서 걸린 관계 · 언급과 관계가 겹친 경우는 이름만 합친다)
  const by=new Map();
  links.forEach(l=>{
    const o=l.src===id?{id:l.dst,kind:l.kind,dir:"out"}:l.dst===id?{id:l.src,kind:l.kind,dir:"in"}:null;if(!o)return;
    const e=by.get(o.id),lb=kindLabel(o);
    if(!e){o.labels=[lb];by.set(o.id,o)}else if(!e.labels.includes(lb))e.labels.push(lb);
  });
  return [...by.values()];
}
const relLabel=x=>(x.labels||[kindLabel(x)]).join(" · ");
function kindLabel(x){
  if(x.kind==="상위")return x.dir==="out"?"상위":"하위";
  if(x.kind==="언급")return x.dir==="out"?"언급함":"언급됨";
  return REL[x.kind.split(":")[1]]||"관계";
}

/* ---------- 내 기록 모아보기: 내가 쓴 진행 기록 · 정리 기록 · 레드마인 댓글 ----------
   보기: 일감별(같은 노트 묶음) / 일자별(날짜마다 모아서) / 월별(월 접이식) · 월 칩으로 한 달만 · 내 글에서만 검색(일치한 글자 강조) */
let mineAsc=false,mineQ="",mineMon="";
const mineView=()=>["note","day","month"].includes(ui.mineView)?ui.mineView:"note";
const WD3=["일","월","화","수","목","금","토"];
function mineEntries(base,sub){      // 내가 쓴 글 한 줄 한 줄 (검색용 글자 plain 포함)
  const out=[],sec=(label,txt)=>txt&&txt.trim()?`<div class="mine-sec">${label}</div><div class="${pvClass()}">${renderMd(txt)}</div>`:"";
  if(sub!=="comments")base.filter(isMine).forEach(n=>{
    (n._pg||[]).forEach(pg=>out.push({n,day:pg.day,t:"00:00",kind:"진행 기록",plain:pg.text,html:`<div class="${pvClass()}">${renderMd(pg.text)}</div>`}));
    const f=`${reqEdited(n)?sec("요건",n.requirement):""}${sec("처리 내용",n.action)}${sec("수정한 코드/방법",n.code_change)}${sec("수정 이유",n.reason)}`;
    if(f)out.push({n,day:n._d,t:"00:00",kind:"정리 기록",note:"레드마인 수정일 기준",plain:[reqEdited(n)?n.requirement:"",n.action,n.code_change,n.reason].join("\n"),html:f});
  });
  if(sub!=="notes")base.filter(n=>myComments(n).length).forEach(n=>myComments(n).forEach(j=>out.push({n,day:lDay(j.created_on),t:lClock(j.created_on),kind:"댓글",plain:j.notes||"",
    html:`<div class="cm me"><div class="av">${esc(avatar(j.user.name))}</div><div style="flex:1;min-width:0"><div class="who">${dTime(j.created_on)}</div><div class="bubble">${cmBody(j)}</div></div></div>`})));
  return out;
}
function markText(root,q){      // 일치한 글자 강조 (글자 노드만 건드려서 모양은 그대로)
  if(!q)return;const lo=q.toLowerCase(),w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),hits=[];
  while(w.nextNode()){const t=w.currentNode;if(t.parentElement&&!t.parentElement.closest("mark,button,script,style")&&t.nodeValue.toLowerCase().includes(lo))hits.push(t)}
  hits.forEach(t=>{
    const s=t.nodeValue,l=s.toLowerCase(),f=document.createDocumentFragment();let i=0,k;
    while((k=l.indexOf(lo,i))>=0){f.appendChild(document.createTextNode(s.slice(i,k)));const m=document.createElement("mark");m.textContent=s.slice(k,k+q.length);f.appendChild(m);i=k+q.length}
    f.appendChild(document.createTextNode(s.slice(i)));t.replaceWith(f);
  });
}
function renderMine(){
  const base=pool(true,false);        // 역할·상태와 무관: 완료된 일감, 연결돼서 받은 일감의 내 기록도 모두 보여 준다
  const cnt=k=>mineEntries(base,k).length;
  const head=`<div class="mine-h">
      <div class="seg" id="mSub"><button data-ms="notes" class="${mineSub==="notes"?"on":""}">내가 쓴 기록 <small>${cnt("notes")}</small></button><button data-ms="comments" class="${mineSub==="comments"?"on":""}">내가 단 댓글 <small>${cnt("comments")}</small></button><button data-ms="all" class="${mineSub==="all"?"on":""}">모두 <small>${cnt("all")}</small></button></div>
      <div class="seg" id="mView" title="보는 방식"><button data-mv="note" class="${mineView()==="note"?"on":""}">일감별</button><button data-mv="day" class="${mineView()==="day"?"on":""}">일자별</button><button data-mv="month" class="${mineView()==="month"?"on":""}">월별</button></div>
      <span class="sp"></span><button type="button" class="mini" id="mineOrd" title="정렬 방향 바꾸기">${mineAsc?"오래된 순":"최신 순"} ⇅</button></div>
    <div class="mine-s"><div class="search mine-q"><input type="search" id="mineQ" placeholder="내가 쓴 기록·댓글에서 검색 (제목·번호도 돼요)" value="${esc(mineQ)}" autocomplete="off"></div><div class="mchips" id="mChips"></div></div>
    <div id="mineBody"></div>`;
  $("#center").innerHTML=head;
  $("#mineQ").oninput=e=>{mineQ=e.target.value.trim();drawMineBody(base)};
  document.querySelectorAll("#mSub [data-ms]").forEach(b=>b.onclick=()=>{mineSub=b.dataset.ms;renderMine()});
  document.querySelectorAll("#mView [data-mv]").forEach(b=>b.onclick=()=>{ui.mineView=b.dataset.mv;saveUI();renderMine()});
  $("#mineOrd").onclick=()=>{mineAsc=!mineAsc;renderMine()};
  drawMineBody(base);
}
function drawMineBody(base){
  const q=mineQ.toLowerCase(),sgn=mineAsc?1:-1,v=mineView();
  let all0=mineEntries(base,mineSub);
  if(q)all0=all0.filter(e=>e.plain.toLowerCase().includes(q)||e.n.subject.toLowerCase().includes(q)||("#"+e.n.issue_id).includes(q));
  const monCnt=new Map();all0.forEach(e=>{const m=e.day.slice(0,7);monCnt.set(m,(monCnt.get(m)||0)+1)});
  if(mineMon&&!monCnt.has(mineMon))mineMon="";
  const entries=(mineMon?all0.filter(e=>e.day.startsWith(mineMon)):all0).sort((x,y)=>sgn*((x.day+"T"+x.t).localeCompare(y.day+"T"+y.t))||sgn*x.n.updated_on.localeCompare(y.n.updated_on)||x.n.issue_id-y.n.issue_id);
  const mons=[...monCnt.keys()].sort().reverse();
  $("#mChips").innerHTML=mons.length>1||mineMon?`<span class="mchip ${mineMon?"":"on"}" data-mm="">전체 <small>${all0.length}</small></span>`+mons.map(m=>`<span class="mchip ${mineMon===m?"on":""}" data-mm="${m}">${m.slice(0,4)}.${m.slice(5)} <small>${monCnt.get(m)}</small></span>`).join(""):"";
  document.querySelectorAll("#mChips [data-mm]").forEach(c=>c.onclick=()=>{mineMon=c.dataset.mm;drawMineBody(base)});
  const kindTxt=i=>`${i.kind==="댓글"?i.t+" · ":""}${relDay(i.day)} · ${i.kind}${i.note?` · ${i.note}`:""}`;
  const ctx=n=>`<div class="mctx">${catPill(n)}<a data-open="${n.issue_id}">#${n.issue_id} ${title(n.subject)}</a><span class="badge s-${stOf(n)}">${stOf(n)}</span></div>`;
  const dayGroups=list=>{      // 날짜마다: 날짜 머리줄 + 그날 쓴 것들(어느 일감인지 같이)
    const by=new Map();list.forEach(e=>{if(!by.has(e.day))by.set(e.day,[]);by.get(e.day).push(e)});
    return [...by].map(([d,es])=>{const x=new Date(d+"T00:00:00");
      return `<div class="mdayh"><b>${d}</b> <span class="meta">(${WD3[x.getDay()]}) · ${relDay(d)} · ${es.length}건</span></div>`
        +es.map(i=>`<div class="card mine-card mday">${ctx(i.n)}<div class="mentry"><div class="mehd"><span class="meta">${kindTxt(i)}</span></div>${i.html}</div></div>`).join("")}).join("");
  };
  let body="";
  if(v==="note"){      // 같은 일감이 이어지면 한 덩어리로 (사이에 다른 일감이 끼면 나눠서 시간 순서를 지킨다)
    const blocks=[];entries.forEach(e=>{const last=blocks[blocks.length-1];if(last&&last.n.issue_id===e.n.issue_id)last.items.push(e);else blocks.push({n:e.n,items:[e]})});
    let curMon="";
    body=blocks.map(bk=>{
      const n=bk.n,s0=stOf(n),days=bk.items.map(i=>i.day),lo=days.reduce((m,d)=>d<m?d:m),hi=days.reduce((m,d)=>d>m?d:m);
      const mon=hi.slice(0,7),monH=mon!==curMon?`<div class="mon">${mon.slice(0,4)}년 ${+mon.slice(5)}월</div>`:"";curMon=mon;
      return monH+`<div class="card mine-card mblk">
        <div class="meta">${catPill(n)}#${n.issue_id} · ${esc(n.project)} · <b>${lo===hi?lo:`${lo.slice(5)} ~ ${hi.slice(5)}`}</b></div>
        <h3 data-open="${n.issue_id}">${title(n.subject)}</h3>
        <div class="chips"><span class="badge s-${s0}">${s0}</span>${rolesOf(n).map(r=>`<span class="tag ${r}">${r}</span>`).join("")}</div>
        ${bk.items.map(i=>`<div class="mentry"><div class="mehd"><b>${i.day}</b> <span class="meta">${kindTxt(i)}</span></div>${i.html}</div>`).join("")}
        <div class="row"><button data-open="${n.issue_id}">노트 열기</button></div></div>`;
    }).join("");
  }else if(v==="day"){
    body=dayGroups(entries);
  }else{      // 월별: 월 접이식 (기본은 가장 최근 달만 펼침 · 검색 중이면 모두 펼침)
    const opened=ui.mineMonOpen||{},by=new Map();entries.forEach(e=>{const m=e.day.slice(0,7);if(!by.has(m))by.set(m,[]);by.get(m).push(e)});
    const keys=[...by.keys()],newest=[...keys].sort().pop();
    body=keys.map(m=>{const es=by.get(m),open=q||mineMon?true:(m in opened?!!opened[m]:m===newest);
      const nk=es.filter(e=>e.kind!=="댓글").length,nc=es.length-nk;
      return `<div class="mmon ${open?"open":""}" data-mon="${m}" role="button" tabindex="0">${chev(open)}<b>${m.slice(0,4)}년 ${+m.slice(5)}월</b><span class="lcnt">${es.length}</span><span class="meta">${nk?`기록 ${nk}`:""}${nk&&nc?" · ":""}${nc?`댓글 ${nc}`:""}</span></div>${open?`<div class="mmonbody">${dayGroups(es)}</div>`:""}`}).join("");
  }
  if(!body)body=q||mineMon?`<div class="empty"><b>찾는 글이 없어요</b>${q?`‘${esc(mineQ)}’ 이(가) 들어 있는 내 기록·댓글이 없습니다.`:"이 달에는 쓴 글이 없습니다."}</div>`
    :mineSub==="comments"?`<div class="empty"><b>내가 단 댓글이 있는 일감이 없습니다</b>${cfg.meId?"":"내 레드마인 계정을 확인하지 못했습니다."}</div>`
    :`<div class="empty"><b>아직 직접 쓴 기록이 없습니다</b>노트에서 진행 기록이나 정리 기록을 쓰면 여기에 날짜순으로 모입니다.</div>`;
  $("#mineBody").innerHTML=(q?`<div class="meta msum">‘${esc(mineQ)}’ — ${entries.length}건${mineMon?` · ${mineMon.slice(0,4)}년 ${+mineMon.slice(5)}월만`:""}</div>`:"")+body;
  document.querySelectorAll("#mineBody [data-open]").forEach(e=>e.onclick=()=>openNote(+e.dataset.open));
  document.querySelectorAll("#mineBody .mmon").forEach(h=>{const go=()=>{const m=h.dataset.mon,cur0=h.classList.contains("open");ui.mineMonOpen={...(ui.mineMonOpen||{}),[m]:!cur0};saveUI();drawMineBody(base)};h.onclick=go;h.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();go()}}});
  wireCp($("#mineBody"));
  if(q)markText($("#mineBody"),mineQ);
}
