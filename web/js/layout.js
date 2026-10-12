/* ---------- 목록·사전 너비 / 숨김 ---------- */
const NAVW=216;
/* 주제 사전: 기본으로 보인다. 창이 좁으면(1560px 미만) 가운데가 찌그러지지 않게, 칸 대신 오른쪽에 겹쳐서 연다(열 때만). */
const isNarrow=()=>innerWidth<1560;
let dictOv=false;
const dictVisible=()=>isNarrow()?dictOv:!ui.hr;
function toggleDict(){
  if(todayFull()){todayWide=false;if(isNarrow())dictOv=true;else{ui.hr=false;saveUI()}renderAll();return}   // 새 디자인의 넓은 오늘 목록에서는 사전 칸이 숨어 있으니, 누르면 나란히 보기로 바꾸고 연다
  if(isNarrow())dictOv=!dictOv;else{ui.hr=!ui.hr;saveUI()}applyUI();renderDict();renderHead();renderNav();if(view==="graph")renderGraph()}
document.addEventListener("click",e=>{if(dictOv&&isNarrow()&&!e.target.closest("#dict,[data-act=dict],#gopenDict,.tp,.hbar")){dictOv=false;applyUI();renderNav()}});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&dictOv){dictOv=false;applyUI();renderNav()}});
function applyUI(){
  const hideL=ui.hl||nav==="mine"||nav==="code"||nav==="memo"||nav==="deploy"||nav==="trouble"||nav==="queries";      // 내 기록·코드 이력은 가운데 화면만 넓게 쓴다
  const col=!isNarrow()&&!ui.hr&&nav!=="memo"&&nav!=="deploy"&&nav!=="trouble"&&nav!=="queries";      // 넓은 창: 사전을 오른쪽 칸으로. 좁은 창: 칸을 만들지 않고 필요할 때만 겹쳐서 연다
  $("#main").style.gridTemplateColumns=`${hideL?0:ui.lw}px ${hideL?0:6}px minmax(0,1fr) ${col?6:0}px ${col?ui.rw:0}px`;
  $("#listpane").style.display=$("#s1").style.display=hideL?"none":"";
  $("#dict").style.display=dictVisible()&&nav!=="memo"&&nav!=="deploy"&&nav!=="trouble"&&nav!=="queries"?"":"none";$("#s2").style.display=col?"":"none";
  $("#dict").classList.toggle("ov",isNarrow()&&dictOv);
  const wide=todayFull();   // 새 디자인의 오늘: 목록만 넓게 (노트 · 사전 칸은 일감을 고르면 보인다)
  $("#listpane").classList.toggle("v2wide",wide);
  $("#center").style.display=$("#s1").style.display=wide?"none":"";
  if(wide){$("#main").style.gridTemplateColumns="minmax(0,1fr) 0 0 0 0";$("#dict").style.display=$("#s2").style.display="none"}
  if($("#cmfab"))placeCm();if($("#todofab"))placeTodo();     // 사전 칸을 접고 펴거나 칸 너비를 바꾸면 💬 · ☑ 단추도 가운데 칸 오른쪽을 따라간다
}
function dragSplit(id,fn){
  $(id).onmousedown=e=>{e.preventDefault();document.body.style.userSelect="none";
    const mv=ev=>{fn(ev.clientX);applyUI()};
    const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);document.body.style.userSelect="";saveUI();if(view==="graph")renderGraph()};
    document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up)};
}
dragSplit("#s1",x=>ui.lw=Math.max(260,Math.min(640,x-NAVW)));
dragSplit("#s2",x=>ui.rw=Math.max(220,Math.min(600,innerWidth-x)));

/* ---------- 렌더 ---------- */
function renderAll(){applyUI();renderNav();renderHead();if(view!=="graph")renderList();renderCenter();renderDict();navRecord()}   // 그래프 화면의 목록은 그래프를 그린 뒤에 만든다
const IC=(d)=>`<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const NAVICON={
  today:IC('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>'),
  history:IC('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  mine:IC('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>'),
  summary:IC('<path d="M5 20V10M12 20V4M19 20v-7"/>'),
  graph:IC('<circle cx="6" cy="7" r="2.2"/><circle cx="18" cy="6" r="2.2"/><circle cx="12" cy="18" r="2.2"/><path d="M7.8 8.2l3 7.8M16.5 7.8l-3.6 8.2M8 7.2l8-1"/>'),
  code:IC('<path d="M9 8l-5 4 5 4M15 8l5 4-5 4"/>'),
  dict:IC('<path d="M3 12V4h8l9 9-8 8z"/><circle cx="7.5" cy="8.5" r="1.2"/>'),
  memo:IC('<path d="M5 4h14v10l-6 6H5z"/><path d="M13 20v-6h6"/>'),
  deploy:IC('<path d="M5 19l4-1 9-9a2.5 2.5 0 0 0-3.5-3.5l-9 9z"/><path d="M13 7l4 4"/>'),
  queries:IC('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>'),
  trouble:IC('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.6-.6-2.6z"/>'),
};
const toTop=()=>{const c=$("#center"),l=$("#list");if(c)c.scrollTop=0;if(l)l.scrollTop=0;window.scrollTo(0,0)};
/* 왼쪽 메뉴: 자주 쓰는 3개(오늘 · 이력 · 내 기록)만 앞에 두고, 나머지는 '더 보기'에 접어 둔다 */
function renderNav(){
  const nowN=all.filter(isNow).length;
  const mk=(id,label,cnt,ex)=>`<button class="nv-item ${nav===id?"on":""}" data-nav="${id}">${NAVICON[id]}<span>${label}</span>${ex||""}${cnt?`<span class="cnt">${cnt}</span>`:""}</button>`;
  const dpIc=dpIcon(false);
  const more=ui.navMore||["summary","graph","code","deploy","trouble","queries"].includes(nav);
  const aN=alr.list.length,nN=ui.memoSeenDay!==todayStr()?alr.notice.length:0;
  const memoEx=(aN?`<span class="nvb bell" data-nvb="al" title="울린 메모 알림 ${aN}개 — 누르면 알림 창을 다시 열어요">🔔${aN}</span>`:"")+(nN?`<span class="nvb" data-nvb="nt" title="오늘 볼 메모 ${nN}개 (미리 적어 둔 것) — 누르면 오늘 보드로">📝${nN}</span>`:"");
  const dictBtn=`<button class="nv-item ${dictVisible()&&!todayFull()?"on":""}" data-act="dict" title="용어(주제) 사전을 오른쪽에 열고 닫습니다">${NAVICON.dict}<span>주제 사전</span></button>`;
  if(V2()){   // 새 디자인: 하는 일 기준 3묶음, '더 보기' 없이 모두 보인다. 배포요청은 일감 묶음 (오늘 배포요청이 있으면 🚀)
    const g=t=>`<div class="nv-grp">${t}</div>`;
    $("#navitems").innerHTML=g("일감")+mk("today","오늘",nowN)+mk("history","이력")+dictBtn+mk("mine","내 기록")+mk("deploy","배포요청",0,dpIc)
      +g("내 도구")+mk("memo","메모",0,memoEx)+mk("trouble","트러블슈팅")+mk("queries","코드/쿼리 보관함")
      +g("분석")+mk("summary","요약")+mk("graph","그래프")+mk("code","코드 이력");
  }else
  $("#navitems").innerHTML=mk("today","오늘",nowN)+mk("history","이력")+mk("mine","내 기록")+mk("memo","메모",0,memoEx)
    +`<div class="nv-sec" id="navmore"><span>더 보기${!more&&dpIc?" "+dpIcon(true):""}</span>${chev(more)}</div>`
    +(more?mk("summary","요약")+mk("graph","그래프")+mk("code","코드 이력")+mk("deploy","배포요청",0,dpIc)+mk("trouble","트러블슈팅")+mk("queries","코드/쿼리 보관함")+dictBtn:"");
  document.querySelectorAll("#nav [data-nav]").forEach(b=>b.onclick=()=>{setNav(b.dataset.nav);toTop();setTimeout(toTop,60)});     // 이미 그 화면이어도 맨 위로
  document.querySelectorAll("#nav [data-nvb]").forEach(i=>i.onclick=e=>{e.stopPropagation();if(i.dataset.nvb==="al"){alr.hide.clear();alDraw()}else sbcGo(todayStr())});
  sbcDraw();
  if($("#navmore"))$("#navmore").onclick=()=>{ui.navMore=!more;saveUI();renderNav()};
  document.querySelectorAll("#nav [data-dpal]").forEach(i=>i.onclick=e=>{e.stopPropagation();openDeploy(todayStr())});
  const d=document.querySelector("#nav [data-act=dict]");
  if(d)d.onclick=toggleDict;
}
const renderTabs=()=>renderNav();     // (설정 창 등 예전 호출 호환)
/* ---------- 오래 대기 / 즐겨찾기 ---------- */
const staleDays=()=>Math.max(1,parseInt(S.stale_days,10)||7);
const ageDays=n=>Math.max(0,Math.floor((Date.now()-new Date(n.updated_on).getTime())/864e5));
const isStale=n=>{const s=stOf(n);return (s==="대기"||(S.stale_progress==="1"&&s==="진행"))&&ageDays(n)>=staleDays()};   // 마지막 수정일 기준
const staleBadge=n=>{if(!isStale(n))return"";const a=ageDays(n);return `<span class="stale ${a>=staleDays()*2?"hi":""}" title="${stOf(n)} 상태로 마지막 수정 후 ${a}일 지났습니다 (기준 ${staleDays()}일)">⏳ ${a}일</span>`};
const starBtn=n=>`<button class="star ${n.starred?"on":""}" data-star-id="${n.issue_id}" title="${n.starred?"즐겨찾기 해제":"즐겨찾기 (목록 맨 위에 고정)"}">${n.starred?"★":"☆"}</button>`;
async function toggleStar(id){
  const n=all.find(x=>x.issue_id===id);if(!n)return;
  const v=n.starred?0:1;await post("/api/star",{issue_id:id,starred:v});n.starred=v;renderAll();
}
function wireStars(root){root.querySelectorAll("[data-star-id]").forEach(b=>b.onclick=e=>{e.stopPropagation();toggleStar(+b.dataset.starId)})}

/* ---------- 사람(역할)에 따른 분류 ----------
   내 작업      = 담당자 + 개발담당자 둘 다 나인 것 (확정된 내가 할 일)
   내 앞으로    = 담당자만 나인 것 (내 앞으로 온 것)
   개발 담당    = 개발담당자만 나인 것 (내가 했거나 할 수도 있는 것: 이력·참고)
   관람         = 관람자만 나인 것 (중요도 낮음)
   참조         = 연결돼서 따로 받은 것 (기본으로 숨김) */
const tierOf=n=>{const r=rolesOf(n),a=r.includes("담당자"),d=r.includes("개발담당자"),w=r.includes("관람자");return a&&d?"work":a?"assigned":d?"dev":w?"watch":(r.includes("추가됨")||r.includes("배포요청"))?"added":"ref"};   // added: 검색·배포요청 화면에서 내가 직접 추가한 일감 (이력에 보이고, 현안에는 안 들어감)
const isActive=n=>{const s=stOf(n);return s==="대기"||s==="진행"};
const isMy=n=>{const t=tierOf(n);return t==="work"||t==="assigned"||t==="dev"};
/* ---- 화면 전체가 함께 쓰는 두 가지 규칙 (이력 · 용어 사전 · 그래프 · 요약) ----
   범위: 기본은 내 일(담당자 · 개발담당자). '관람 / 참조 포함' 스위치는 한 곳에 저장되고, 어느 화면에서 바꿔도 모든 화면에 같이 적용된다.
   현안: 지금 담당자가 나이고 상태가 대기 · 진행인 일감. 기간과 상관없이 (오래된 건도). */
const scopeW=()=>!!ui.incWatch,scopeR=()=>!!ui.incRef;
const inScope=n=>{const t=tierOf(n);return t==="watch"?scopeW():t==="ref"?scopeR():true};
const isNow=n=>{const t=tierOf(n);return (t==="work"||t==="assigned")&&isActive(n)};
const scopeText=()=>"내 일"+(scopeW()?" + 관람":"")+(scopeR()?" + 참조":"");
const scopeChecks=()=>`<span class="scpx" title="이력 · 용어 사전 · 그래프 · 요약이 같은 설정을 함께 씁니다"><span class="meta">포함</span><label><input type="checkbox" data-scp="incWatch" ${scopeW()?"checked":""}> 관람</label><label><input type="checkbox" data-scp="incRef" ${scopeR()?"checked":""}> 참조</label></span>`;
document.addEventListener("change",e=>{const k=e.target&&e.target.dataset&&e.target.dataset.scp;if(!k)return;ui[k]=e.target.checked;saveUI();hist.more=60;renderAll()});
const myOnly=l=>l.filter(isMy);
const scoped=l=>l.filter(inScope);

