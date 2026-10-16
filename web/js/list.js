/* ---------- 목록에서 쓰는 도구 ---------- */
const rangeKeyOf=()=>view==="graph"?"graph":view==="summary"?"summary":"note";
const searching=()=>!!$("#q").value.trim();     // 검색 중이면 기간·필터와 상관없이 전체 데이터를 본다
function dictPool(){const [f,t]=searching()&&rangeKeyOf()!=="graph"?["",""]:rangeOf(rangeKeyOf());return all.filter(n=>(!f||n._d>=f)&&(!t||n._d<=t)&&inScope(n))}     // 용어 사전 숫자: 이 기간 기준, 관람·참조 일감은 뺀다
const notDeploy=n=>!rolesOf(n).includes("배포요청");      // 배포요청 일감은 내 업무가 아니라서 요약(숫자·완료 목록 등)에서는 뺀다 (이력에는 그대로 있다)
function summaryNotes(){
  const q=$("#q").value.trim().toLowerCase(),[f,t]=q?["",""]:rangeOf("summary");
  return scoped(all.filter(n=>notDeploy(n)&&(!f||n._d>=f)&&(!t||n._d<=t)&&qmatch(n,q)));       // 요약에 포함되는 일감 (범위 스위치를 따름)
}
function scopeBox(){
  const k=rangeKeyOf();
  const tip=k==="graph"?"그래프에 그릴 일감의 기간 (수정일 기준)":"요약할 일감의 기간 (수정일 기준)";
  return `<div class="scopebox"><div class="sb-row"><span class="lb" title="${tip}">기간</span>${rangeCtl(k,"sb")}</div><div class="sb-row">${scopeChecks()}</div>${k==="summary"&&searching()?`<div class="meta sb-note">검색 중에는 기간과 상관없이 전체에서 찾습니다</div>`:""}</div>`;
}
function wireScope(){wireRangeCtl(rangeKeyOf(),"sb",()=>renderAll())}
const graphNotes=()=>gModel?gModel.nodes.filter(n=>n.type==="i").map(n=>n.n):[];     // 그래프에 그려진 일감 (그리는 순서 그대로)
function graphListInfo(){
  if(!gModel)return "그래프가 그려지면 여기에 표시됩니다";
  const how=graphMode==="focus"?`선택한 용어 ${selTerms().map(t=>esc(t.term)).join(selSym())}`:gModel.hub?`중심 ${esc(gModel.hub.term)} 주변`:"전체 한꺼번에";
  return `${how} · 기간 ${esc(rangeText("graph"))}`;
}
let listSig="";
function setList(html,sig){      // 목록을 다시 그려도 스크롤이 맨 위로 튀지 않게 한다 (필터가 바뀐 때만 맨 위로)
  const L=$("#list"),keep=L.scrollTop;
  L.innerHTML=html;L.scrollTop=sig===listSig?keep:0;listSig=sig;
}
const byUpdDesc=(a,b)=>b.updated_on.localeCompare(a.updated_on);
const WD=["일","월","화","수","목","금","토"];
const ageTxt=n=>{const s=stOf(n),a=ageDays(n);return (s==="대기"||s==="진행")?`${s} · ${a===0?"오늘":a+"일 전"} 수정`:relDay(n._d)};
/* 비슷한 과거 건: 이 노트와 같은 주제(용어)를 가진 다른 내 일감. 흔한 용어는 변별력이 낮아 드문 용어 2개를 기준으로 한다. */
let _tc=null,_tk="";
const termCnt=()=>{const k=all.length+"|"+terms.map(t=>t.id+":"+t.term+":"+(t.aliases||"")).join(",");if(_tc&&_tk===k)return _tc;_tk=k;return _tc=new Map(terms.map(t=>[t.id,all.filter(x=>isMy(x)&&has(x,t)).length]))};
function simInfo(n){
  const ts=terms.filter(t=>has(n,t));if(!ts.length)return {ts:[],list:[]};
  const tc=termCnt(),pick=[...ts].sort((a,b)=>tc.get(a.id)-tc.get(b.id)).slice(0,2);
  return {ts:pick,list:all.filter(x=>x.issue_id!==n.issue_id&&isMy(x)&&pick.every(t=>has(x,t)))};
}
function openSimilar(n){
  if(!n)return;const {ts}=simInfo(n);if(!ts.length)return;
  sel=ts.map(t=>t.id);selMode="and";Object.assign(hist,{cat:"전체",per:"all",flag:"",more:60,pop:false});
  $("#q").value="";setNav("history",{keepSel:true});
}
function nrow(n,o={}){
  const s=stOf(n),c=catOf(n),tier=tierOf(n),sim=o.sim?simInfo(n):null;
  const tag=tier==="assigned"?`<span class="tg">내 앞으로</span>`:tier==="watch"?`<span class="tg ghost">관람</span>`:tier==="added"?`<span class="tg ghost">${rolesOf(n).includes("배포요청")?"배포요청":"추가됨"}</span>`:tier==="ref"?`<span class="tg ghost">참조</span>`:"";
  return `<div class="nrow s-${s} ${n.issue_id===cur?"sel":""}${isUnseen(n)?" unseen":""}" data-id="${n.issue_id}" role="button" tabindex="0"${o.drag?' draggable="true" title="끌어서 순서를 바꿀 수 있어요"':""}>
    <button type="button" class="rstar ${n.starred?"on":""}" data-star-id="${n.issue_id}" title="${n.starred?"고정 해제":"고정: 목록 맨 위에 둬요 (즐겨찾기)"}" aria-label="고정">${n.starred?"★":"☆"}</button><span class="dot"></span><div class="rb"><div class="rt">${title(n.subject)}</div>
    <div class="rm"><span>#${n.issue_id}</span>${c!=="기타"?`<span class="cat ${c} mini" title="${esc(n.project)}">${c}</span>`:""}<span>${o.age?esc(ageTxt(n)):n._d}</span>${tag}${todoBadge(n)}${o.hide?`<button type="button" class="rhide" data-whide="${n.issue_id}" title="${o.hide==="back"?"지켜보는 중 목록에 다시 넣어요":"지켜보는 중 목록에서 숨겨요 (새 활동이 생기면 다시 보여요)"}">${o.hide==="back"?"↩ 되돌리기":"✕ 숨기기"}</button>`:""}${sim&&sim.list.length?`<button type="button" class="sim" data-sim="${n.issue_id}" title="같은 주제를 가진 과거 일감 보기">비슷한 과거 ${sim.list.length}건</button>`:""}</div></div></div>`;
}
function wireRows(root){
  root.querySelectorAll(".nrow").forEach(r=>{
    r.onclick=e=>{
      if(nav==="graph"&&view==="graph"){if(e.detail>1)return;graphPin(+r.dataset.id);return}     // 그래프 그림이 보일 때: 한 번 = 강조 고정/해제, 더블클릭 = 노트 열기
      openNote(+r.dataset.id)};
    r.ondblclick=()=>{if(nav==="graph"&&view==="graph")openNote(+r.dataset.id)};
    r.onmouseenter=r.onfocus=()=>graphHover(+r.dataset.id);r.onmouseleave=r.onblur=()=>graphHover(0);
    r.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openNote(+r.dataset.id)}};
  });
  root.querySelectorAll("[data-sim]").forEach(b=>b.onclick=e=>{e.stopPropagation();openSimilar(all.find(x=>x.issue_id===+b.dataset.sim))});
  wireStars(root);
}
/* ---------- 오늘 '지금 할 일' 정렬: 기본 · 최신순(레드마인 수정일) · 등록순(일감 번호) · 내 순서(끌어서). 고정(★)한 것은 항상 맨 위 ---------- */
const TSORT=[["default","기본","내 작업 먼저, 오래 둔 것부터"],["new","최신순","레드마인 수정일이 최근인 것부터"],["reg","등록순","먼저 등록된 것부터 (일감 번호 순)"],["manual","내 순서","끌어서 정한 순서"]];
const tSort=()=>TSORT.some(x=>x[0]===ui.todaySort)?ui.todaySort:"default";
function sortNow(list){
  const m=tSort(),l=[...list];
  if(m==="new")l.sort((a,b)=>b.updated_on.localeCompare(a.updated_on)||b.issue_id-a.issue_id);
  else if(m==="reg")l.sort((a,b)=>a.issue_id-b.issue_id);
  else if(m==="manual"){const pos=new Map((ui.todayOrder||[]).map((id,i)=>[id,i]));const k=n=>pos.has(n.issue_id)?pos.get(n.issue_id):1e9+n.issue_id;l.sort((a,b)=>k(a)-k(b))}   // 새로 들어온 일감은 맨 아래
  else l.sort((a,b)=>(tierOf(a)==="work"?0:1)-(tierOf(b)==="work"?0:1)||a.updated_on.localeCompare(b.updated_on));
  return l.sort((a,b)=>(b.starred?1:0)-(a.starred?1:0));     // 고정은 항상 맨 위 (안정 정렬이라 위 순서는 유지)
}
/* 구역마다 따로 고르는 정렬 (최근 바뀐 것 · 참고 · 지켜보는 중). 최신순(기본) / 등록순, 고정(★)은 각 구역 맨 위 */
const secSort=k=>((ui.secSort||{})[k]==="reg")?"reg":"new";
function sortSec(k,list){
  const l=[...list];
  if(secSort(k)==="reg")l.sort((a,b)=>a.issue_id-b.issue_id);else l.sort(byUpdDesc);
  return l.sort((a,b)=>(b.starred?1:0)-(a.starred?1:0));
}
const secSortBar=k=>`<div class="sortbar"><span class="meta">정렬</span><div class="seg" data-secs="${k}">${[["new","최신순","레드마인 수정일이 최근인 것부터"],["reg","등록순","먼저 등록된 것부터 (일감 번호 순)"]].map(([v,l,t])=>`<button type="button" data-sv="${v}" class="${secSort(k)===v?"on":""}" title="${t}">${l}</button>`).join("")}</div></div>`;
function wireNowDrag(root,shownIds){   // 끌어서 놓으면 '내 순서'로 바뀌고 이 PC에 저장 (레드마인에는 쓰지 않는다). 고정/일반 경계는 넘지 못한다
  let dragId=null;const byId=id=>all.find(x=>x.issue_id===id);
  const clear=()=>root.querySelectorAll(".nrow").forEach(x=>x.classList.remove("dragging","dropa","dropb"));
  root.querySelectorAll('.nrow[draggable="true"]').forEach(r=>{
    const id=+r.dataset.id;
    r.addEventListener("dragstart",e=>{dragId=id;e.dataTransfer.effectAllowed="move";try{e.dataTransfer.setData("text/plain",String(id))}catch(_){}r.classList.add("dragging")});
    r.addEventListener("dragend",()=>{dragId=null;clear()});
    r.addEventListener("dragover",e=>{
      if(dragId==null||dragId===id)return;
      if(!!byId(dragId).starred!==!!byId(id).starred)return;       // 고정과 일반은 섞이지 않는다
      e.preventDefault();e.dataTransfer.dropEffect="move";
      const rc=r.getBoundingClientRect(),after=e.clientY>rc.top+rc.height/2;
      root.querySelectorAll(".nrow").forEach(x=>x.classList.remove("dropa","dropb"));r.classList.add(after?"dropa":"dropb");
    });
    r.addEventListener("drop",e=>{
      if(dragId==null||dragId===id)return;
      e.preventDefault();
      const rc=r.getBoundingClientRect(),after=e.clientY>rc.top+rc.height/2,mv=dragId;dragId=null;clear();
      const order=shownIds.filter(x=>x!==mv),at=order.indexOf(id)+(after?1:0);order.splice(at,0,mv);
      const rest=(ui.todayOrder||[]).filter(x=>!order.includes(x));
      ui.todayOrder=[...order,...rest];ui.todaySort="manual";saveUI();renderList();
      toast("순서를 바꿨어요 (내 순서)",1600);
    });
  });
}
const firstSyncBox=()=>`<div class="empty2"><b>아직 가져온 일감이 없어요</b>내가 담당자·개발담당자·관람자인 일감을 레드마인에서 가져옵니다. 과거 이력까지 보려면 <b style="display:inline">최근 1년</b>을 권장해요.<div class="row"><button class="primary" id="firstSync">최근 1년 가져오기</button></div></div>`;
function wireFirstSync(){const b=$("#firstSync");if(b)b.onclick=()=>{const [f,t]=presetDates("365d");doSync(f,t,false)}}

/* ---------- 지켜보는 중 정리: 직접 숨기기 + N일 변화 없으면 자동으로 빼기 ----------
   숨김은 '숨길 때의 수정일'을 같이 저장해서, 그 뒤 레드마인에서 일감이 바뀌면(수정일이 달라지면) 저절로 다시 보인다. ☆ 고정한 것은 자동 정리에서 제외. */
const watchHidden=()=>{try{return JSON.parse(S.watch_hidden||"{}")||{}}catch(e){return {}}};
const watchAutoDays=()=>{const v=parseInt(S.watch_auto_days,10);return Number.isFinite(v)&&v>=0?v:14};      // 0 = 자동 정리 끔
function watchState(n){
  if(n.starred)return "show";
  const h=watchHidden()[n.issue_id];if(h&&h===n.updated_on)return "manual";
  const d=watchAutoDays();if(d&&ageDays(n)>=d)return "auto";
  return "show";
}
async function watchHide(id,undo){
  const n=all.find(x=>x.issue_id===id);if(!n)return;
  const map=watchHidden(),had=map[id];
  if(undo)delete map[id];else map[id]=n.updated_on;
  const ids=new Set(all.map(x=>x.issue_id));Object.keys(map).forEach(k=>{if(!ids.has(+k))delete map[k]});
  try{await saveS("watch_hidden",JSON.stringify(map))}catch(e){toast("저장하지 못했어요: "+e.message,4000);return}
  renderList();
  if(!undo)toastUndo(`#${id} 을(를) 지켜보는 중에서 숨겼어요`,()=>watchHide(id,true),5000);
}
/* ---------- 안 본 일감 강조: 새로 왔거나 레드마인에서 바뀌었는데 아직 열어 보지 않은 일감은 줄 배경을 칠한다 ----------
   일감별로 '마지막으로 열어 본 수정일'을 저장(rm_seen)하고, 지금 수정일과 다르면 안 본 것. 처음 켤 때는 그때까지의 일감을 모두 본 것으로 친다(_base).
   노트를 열면(열어 둔 채 새로 읽거나 레드마인에 올려도) 본 것으로 바뀐다. */
let seenMap=null,seenOpen=null,seenT;
function seenGet(){
  if(!seenMap){try{seenMap=JSON.parse(S.rm_seen||"null")}catch(e){}if(!seenMap||typeof seenMap!=="object")seenMap={};if(!seenMap.ids||typeof seenMap.ids!=="object")seenMap.ids={}}
  if(!seenMap._base&&all.length){seenMap._base=all.reduce((m,n)=>n.updated_on>m?n.updated_on:m,"");seenSave()}      // 처음(또는 첫 가져오기 직후): 지금까지 받은 것은 본 것으로
  return seenMap;
}
function seenSave(){clearTimeout(seenT);seenT=setTimeout(()=>saveS("rm_seen",JSON.stringify(seenMap)).catch(()=>{}),800)}
function isUnseen(n){
  const m=seenGet(),v=m.ids[n.issue_id];
  return v?v!==n.updated_on:!!m._base&&n.updated_on>m._base;
}
function markSeen(n){
  if(!n||!isUnseen(n))return;
  const m=seenGet(),ids=new Set(all.map(x=>x.issue_id));
  m.ids[n.issue_id]=n.updated_on;Object.keys(m.ids).forEach(k=>{if(!ids.has(+k))delete m.ids[k]});
  seenSave();
  document.querySelectorAll(`.nrow.unseen[data-id="${n.issue_id}"]`).forEach(r=>r.classList.remove("unseen"));     // 목록은 노트보다 먼저 그려지므로 그 줄만 바로 지운다
}
/* 오늘 화면의 구역은 모두 접고 펼 수 있고, 마지막 상태를 기억한다 (처음에는 지금 할 일 · 내 할 일만 펼침) */
const TODAY_DEF={now:true,todo:true,recent:false,dev:false,watch:false,whid:false};
const secOpen=k=>{const o=ui.todayOpen||{};return k in o?!!o[k]:!!TODAY_DEF[k]};
const secToggle=k=>{ui.todayOpen={...(ui.todayOpen||{}),[k]:!secOpen(k)};saveUI()};
/* ---------- 오늘: 열면 바로 보이는 화면 (필터 없음) ---------- */
function renderToday(){
  const d=new Date(),dt=`${d.getMonth()+1}월 ${d.getDate()}일 ${WD[d.getDay()]}요일`;
  if(!all.length){setList(`<div class="pane-title">오늘</div><div class="pane-sub">${dt}</div>${firstSyncBox()}`,"today-empty");wireFirstSync();return}
  const now=sortNow(all.filter(isNow));     // 기본: 내 작업 먼저, 그 안에서는 오래 둔 것부터 (정렬은 위의 선택에 따름, 고정은 맨 위)
  const ids=new Set(now.map(n=>n.issue_id));
  const recent=sortSec("recent",all.filter(n=>isMy(n)&&!ids.has(n.issue_id)&&ageDays(n)<=3).sort(byUpdDesc).slice(0,6));     // 최근 3일 중 가장 최근 6건을 고른 뒤 정렬
  const dev=sortSec("dev",all.filter(n=>tierOf(n)==="dev"&&isActive(n)));
  const watchAll=all.filter(n=>tierOf(n)==="watch"&&isActive(n));
  const watch=sortSec("watch",watchAll.filter(n=>watchState(n)==="show")),wHid=watchAll.filter(n=>watchState(n)!=="show").sort(byUpdDesc);
  const arcN=todos.filter(t=>t.archived_at).length;
  const openT=todos.filter(t=>!t.done&&!t.archived_at).map(t=>({t,n:all.find(x=>x.issue_id===t.issue_id)})).filter(o=>o.n);
  /* 구역 하나 = 접는 머리줄(▸ 제목 · 개수 · 설명) + 본문 */
  const sec=(key,label,sub,count,inner,extra="")=>`<div class="lsec foldr" data-tfold="${key}" role="button" tabindex="0" aria-expanded="${secOpen(key)}">${chev(secOpen(key))}<b>${label}</b><span class="lcnt">${count}</span>${sub?`<small class="lsub">${sub}</small>`:""}<span class="sp"></span>${extra}</div>${secOpen(key)?`<div class="lbody">${inner}</div>`:""}`;
  const watchInner=()=>secSortBar("watch")+watch.map(n=>nrow(n,{age:true,hide:true})).join("")
    +(wHid.length?`<div class="whid" data-whidtog>${secOpen("whid")?"▾":"▸"} 숨긴 ${wHid.length}개 ${secOpen("whid")?"접기":"보기"}</div>`+(secOpen("whid")?wHid.map(n=>nrow(n,{age:true,hide:watchState(n)==="manual"?"back":""})).join("")+`<div class="meta whint">직접 숨긴 것은 ↩ 로 되돌리고, ${watchAutoDays()}일 변화가 없어 자동으로 빠진 것은 ☆ 고정하면 다시 보여요. 새 활동이 생기면 저절로 다시 나타나요.</div>`:""):"");
  if(cur==null&&now.length&&!todayFull())cur=now[0].issue_id;     // 손 대지 않아도 가장 먼저 할 일이 오른쪽에 열려 있다 (새 디자인의 넓은 목록에서는 열지 않는다)
  const nowInner=(now.length?`<div class="sortbar"><span class="meta">정렬</span><div class="seg" id="tsort">${TSORT.map(([k,l,t])=>`<button type="button" data-ts="${k}" class="${tSort()===k?"on":""}" title="${esc(t)}">${l}</button>`).join("")}</div><span class="meta sorthint" title="☆ 로 고정하면 맨 위 · 줄을 끌어서 순서를 바꿀 수 있어요">ⓘ</span></div>`:"")
    +(now.length?now.map(n=>nrow(n,{age:true,sim:true,drag:true})).join(""):`<div class="okbox">✓ 지금 할 일이 없어요</div>`);
  const todoInner=openT.slice(0,8).map(o=>`<div class="trow" data-tid="${o.t.id}"><input type="checkbox" title="완료"><span class="tx">${esc(o.t.text)}</span><a data-open="${o.n.issue_id}" title="${esc(o.n.subject)}">#${o.n.issue_id}</a></div>`).join("")+(openT.length>8?`<div class="meta" style="padding:2px 12px">…외 ${openT.length-8}건 (각 노트에서 볼 수 있어요)</div>`:"")||`<div class="meta" style="padding:4px 12px">남은 할 일이 없어요</div>`;
  setList(`<div class="pane-title">오늘</div><div class="pane-sub">${dt} · 지금 할 일 ${now.length}건</div>
    ${sec("now","지금 할 일","",now.length,nowInner)}
    ${(openT.length||arcN)?sec("todo","내 할 일","",openT.length,todoInner,arcN?`<a class="tarc" data-tarc title="완료해서 보관한 체크리스트 보기">보관함 ${arcN}</a>`:""):""}
    ${recent.length?sec("recent","최근 바뀐 것","3일 이내",recent.length,secSortBar("recent")+recent.map(n=>nrow(n,{age:true})).join("")):""}
    ${dev.length?sec("dev","참고 · 내가 개발 담당","",dev.length,secSortBar("dev")+dev.map(n=>nrow(n,{age:true})).join("")):""}
    ${(watch.length||wHid.length)?sec("watch","지켜보는 중","",watch.length,watchInner()):""}`,"today");
  wireRows($("#list"));
  wireNowDrag($("#list"),now.map(n=>n.issue_id));  document.querySelectorAll("#list [data-secs] [data-sv]").forEach(b=>b.onclick=e=>{e.stopPropagation();const k=b.closest("[data-secs]").dataset.secs;ui.secSort=Object.assign({},ui.secSort||{},{[k]:b.dataset.sv});saveUI();renderList()});
  document.querySelectorAll("#list #tsort [data-ts]").forEach(b=>b.onclick=()=>{ui.todaySort=b.dataset.ts;saveUI();renderList()});
  document.querySelectorAll("#list [data-tarc]").forEach(a=>a.onclick=e=>{e.stopPropagation();openTodoArchive()});
  document.querySelectorAll("#list [data-whidtog]").forEach(f=>f.onclick=()=>{secToggle("whid");renderList()});
  document.querySelectorAll("#list [data-whide]").forEach(b=>b.onclick=e=>{e.stopPropagation();watchHide(+b.dataset.whide,b.dataset.whide&&b.textContent.includes("되돌리기"))});
  document.querySelectorAll("#list [data-tfold]").forEach(f=>{const go=()=>{secToggle(f.dataset.tfold);renderList()};f.onclick=go;f.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();go()}}});
  document.querySelectorAll("#list .trow").forEach(r=>{
    const id=+r.dataset.tid;
    r.querySelector("input").onchange=async e=>{
      try{const x=await post("/api/todo",{id,done:e.target.checked});Object.assign(todos.find(t=>t.id===id)||{},x);buildTodoMap();renderList();renderNav();updTodoFloat()}
      catch(err){toast("저장하지 못했습니다: "+err.message,4000);e.target.checked=!e.target.checked}};
    r.querySelector("[data-open]").onclick=()=>openNote(+r.querySelector("[data-open]").dataset.open);
  });
}

/* ---------- 이력: 내가 한 일 전체를 월별로 (기본은 내 일: 담당자 · 개발담당자) ---------- */
const HFLAG={"":"전체 이력",active:"현안만",star:"즐겨찾기",stale:"오래 대기",need:"기록 필요"};
const HPER={all:"전체 기간","365d":"최근 1년","90d":"최근 3개월","30d":"최근 30일"};
function histBase(q){
  if(q)return all.filter(n=>qmatch(n,q));       // 검색: 관람·참조·전체 기간·모든 필터를 무시하고 전체에서 찾는다
  let l=all.filter(inScope);
  if(hist.cat!=="전체")l=l.filter(n=>catOf(n)===hist.cat);
  if(hist.per!=="all"){const f=presetDates(hist.per)[0];l=l.filter(n=>n._d>=f)}
  if(hist.flag==="active")l=l.filter(isNow);else if(hist.flag==="star")l=l.filter(n=>n.starred);
  else if(hist.flag==="stale")l=l.filter(isStale);else if(hist.flag==="need")l=l.filter(needsRec);
  return l;
}
const histActive=()=>[hist.cat!=="전체",hist.per!=="all",!!hist.flag,scopeW(),scopeR()].filter(Boolean).length;
function renderHistory(){
  const q=$("#q").value.trim().toLowerCase(),base=histBase(q),list=base.filter(hasSel).sort(byUpdDesc);
  const groups=new Map();list.forEach(n=>{const k=n._d.slice(0,7);(groups.get(k)||groups.set(k,[]).get(k)).push(n)});
  let shown=0,html="";
  for(const [k,arr] of groups){
    if(shown>=hist.more)break;
    const part=arr.slice(0,hist.more-shown);shown+=part.length;
    html+=`<div class="mon">${k.slice(0,4)}년 ${+k.slice(5)}월<span>${arr.length}건</span></div>`+part.map(n=>nrow(n)).join("");
  }
  const rest=list.length-shown,fa=histActive();
  const sub=q?`‘${esc($("#q").value.trim())}’ 검색 결과 ${list.length}건 · 모든 조건과 상관없이 전체에서 찾았어요`:`내 일 ${list.length}건${fa?` · 필터 ${fa}개 적용 중`:""}`;
  const empty=!list.length?(!all.length?firstSyncBox():`<div class="empty2"><b>${q?"검색 결과가 없어요":"조건에 맞는 이력이 없어요"}</b>${q?"다른 단어로 찾아보거나, ‘본문·댓글까지 검색’을 켜 보세요.":(fa||sel.length?"필터나 주제를 풀어 보세요.":"레드마인에서 가져오면 여기에 쌓여요.")}${!q&&(fa||sel.length)?`<div class="row"><button id="hreset2">필터 초기화</button></div>`:""}</div>`):"";
  const copyRow="";
  setList(`<div class="pane-title">이력</div><div class="pane-sub">${sub}</div>${copyRow}${html}${rest>0?`<div class="row" style="justify-content:center;margin:14px 0"><button id="hmore">더 보기 (${rest}건 남음)</button></div>`:""}${empty}`,
    ["hist",q,sel.join(),selMode,hist.cat,hist.per,hist.flag,scopeW(),scopeR()].join("|"));
  wireRows($("#list"));wireFirstSync();
  if($("#hmore"))$("#hmore").onclick=()=>{hist.more+=60;renderList()};
  if($("#hreset2"))$("#hreset2").onclick=resetHist;
}
function resetHist(){Object.assign(hist,{cat:"전체",per:"all",flag:"",more:60,pop:false});sel=[];renderAll()}
function topicChips(base){
  const rows=terms.map(t=>({t,c:base.filter(n=>has(n,t)).length}));
  const top=rows.filter(o=>o.c>0&&!sel.includes(o.t.id)).sort((a,b)=>b.c-a.c).slice(0,10);
  const picked=sel.map(id=>rows.find(o=>o.t.id===id)).filter(Boolean);
  return [...picked,...top].map(o=>`<span class="tp ${sel.includes(o.t.id)?"on":""}" data-tp="${o.t.id}" title="${esc(o.t.description||"")}">${esc(o.t.term)}<small>${o.c}</small></span>`).join("");
}
/* 목록 위쪽(검색창 아래): 이력은 '필터' 버튼과 주제 칩, 적용 중인 필터 칩을 보여 준다 */
function renderHead(){
  const show=nav==="today"||nav==="history"||nav==="summary";
  $("#listhead").style.display=show?"":"none";
  $("#qclr").hidden=!$("#q").value;
  $("#q").placeholder=rmOn&&(nav==="today"||nav==="history")?"레드마인 전체 검색 (제목 · 번호)":ui.qscope==="all"?"검색 (제목 + 내용)":"검색 (제목 · 번호)";
  $("#qscope").style.display=(nav==="today"||nav==="history")?"":"none";
  document.querySelectorAll("#qscope [data-qs]").forEach(b=>b.classList.toggle("on",(b.dataset.qs==="rm")===rmOn));
  const rmm=rmOn&&(nav==="today"||nav==="history");$("#listhead").classList.toggle("rmmode",rmm);
  if(rmm){rmFilters();return}   // 레드마인 전체 검색 중에는 내 노트용 필터 대신 검색용 필터(프로젝트·기간·완료 빼기)를 검색창 위에 보여 준다
  const q=$("#q").value.trim().toLowerCase();      // (주의: 변수 이름을 안 만들면 화면의 #q 요소가 대신 잡혀서 항상 '참'이 된다)
  let x="";
  if(nav==="history"){
    const fa=histActive();
    const chips=[hist.cat!=="전체"&&["cat",`구분 ${hist.cat}`],hist.per!=="all"&&["per",HPER[hist.per]],hist.flag&&["flag",HFLAG[hist.flag]],scopeW()&&["watch","관람 포함"],scopeR()&&["ref","참조 포함"]].filter(Boolean);
    x=`<div class="fbar"><button type="button" class="fb ${hist.pop||fa?"on":""}" id="fbtn">필터${fa?` ${fa}`:""} ▾</button>${q?"":chips.map(([k,l])=>`<span class="fchip" data-fc="${k}" title="눌러서 해제">${esc(l)} ✕</span>`).join("")}</div>`
      +(hist.pop&&!q?`<div class="fpop">
        <div class="fp-row"><span>구분</span><div class="seg">${["전체","BC","DR","기타"].map(c=>`<button data-h="cat:${c}" class="${hist.cat===c?"on":""}">${c}</button>`).join("")}</div></div>
        <div class="fp-row"><span>기간</span><div class="seg">${Object.entries(HPER).map(([k,l])=>`<button data-h="per:${k}" class="${hist.per===k?"on":""}">${l}</button>`).join("")}</div></div>
        <div class="fp-row"><span>보기</span><div class="seg">${Object.entries(HFLAG).map(([k,l])=>`<button data-h="flag:${k}" class="${hist.flag===k?"on":""}">${l}</button>`).join("")}</div></div>
        <div class="fp-row"><span>범위</span>${scopeChecks()}<span class="meta">(참조 = 연결돼서 받은 것 · 그래프·사전·요약과 같이 적용)</span></div>
        <div class="fp-foot"><button id="hreset">초기화</button><button class="primary" id="hclose">닫기</button></div></div>`:"")
      +((!isNarrow()&&!ui.hr)?"":`<div class="tpc">${topicChips(histBase(q))}</div>`);   // 오른쪽에 용어 사전이 떠 있으면 같은 칩을 또 보여 주지 않는다
  }
  if(q&&(nav==="history"||nav==="today"))x+=`<label class="qs"><input type="checkbox" id="qall" ${ui.qscope==="all"?"checked":""}> 본문·댓글까지 검색</label>`;
  $("#lhx").innerHTML=x;
  if($("#qall"))$("#qall").onchange=e=>{ui.qscope=e.target.checked?"all":"title";saveUI();renderAll()};
  if($("#fbtn"))$("#fbtn").onclick=()=>{hist.pop=!hist.pop;renderHead()};
  document.querySelectorAll("#lhx [data-h]").forEach(b=>b.onclick=()=>{const [k,v]=b.dataset.h.split(":");hist[k]=v;hist.more=60;renderAll()});
  document.querySelectorAll("#lhx [data-fc]").forEach(c=>c.onclick=()=>{const k=c.dataset.fc;if(k==="watch"||k==="ref"){ui[k==="watch"?"incWatch":"incRef"]=false;saveUI()}else hist[k]=k==="cat"?"전체":k==="per"?"all":"";hist.more=60;renderAll()});
  document.querySelectorAll("#lhx [data-tp]").forEach(c=>c.onclick=()=>toggleTerm(terms.find(t=>t.id==c.dataset.tp)));
  if($("#hreset"))$("#hreset").onclick=resetHist;
  if($("#hclose"))$("#hclose").onclick=()=>{hist.pop=false;renderHead()};
}
/* ---------- 요약 · 그래프 옆 목록 ---------- */
function renderSideList(){
  const inGraph=nav==="graph",v=inGraph?graphNotes():summaryNotes();
  const head=inGraph?`<div class="pane-title">그래프</div><div class="pane-sub">표시된 일감 ${v.length}건 · ${graphListInfo()}</div>`
    :`<div class="pane-title">요약</div><div class="pane-sub">내 일감 ${v.length}건 · ${esc(searching()?"전체 기간":rangeText("summary"))}</div>`;
  setList(scopeBox()+head+(v.length?v.map(n=>nrow(n)).join(""):`<div class="empty2"><b>${inGraph?"그래프에 표시된 일감이 없어요":"이 기간에 수정된 일감이 없어요"}</b>${inGraph?"기간을 넓히거나 ‘완료 포함’을 켜 보세요.":"기간을 바꿔 보세요."}</div>`),
    [nav,rangeText("graph"),rangeText("summary"),graphMode,gHub,sel.join(),$("#q").value,scopeW(),scopeR()].join("|"));
  wireRows($("#list"));wireScope();listMarkSel();
}
function renderList(){
  if(rmOn&&(nav==="today"||nav==="history"))return renderRmSearch();
  if(nav==="today")return renderToday();
  if(nav==="history")return renderHistory();
  if(nav==="graph"||nav==="summary")return renderSideList();
  $("#list").innerHTML="";
}
