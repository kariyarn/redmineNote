/* ---------- 노트 배치 (2.29): 노트의 블록(원문 · 첨부 · 정리 기록 · 댓글 · 연결된 일감 · 같은 주제 · 할 일 · 진행 기록)을
   본문 / 옆 칸 / 숨김 으로 나눠 두고 순서를 정한다. 한 번 정하면 모든 노트에 같이 적용된다 (화면 설정 ui.nl).
   - 제목 카드 · 이동 바 · 저장 줄은 자리가 고정이다
   - 숨긴 블록도 화면에는 그려 두고 가리기만 한다 (정리 기록 편집기 · 진행 기록 입력칸을 찾는 저장 기능이 깨지지 않게)
   - 블록마다 노트를 열 때의 기본 상태(펼침 / 접힘 / 자동 = 내용이 있으면 펼침)를 정한다. 노트에서 직접 접고 편 것은 이번 접속 동안만 기억한다
   - 옆 칸 위의 단추(알약)는 옆 칸에 놓인 블록마다 생기고, 누르면 잠깐 숨기고 다시 보인다 (ui.ns). 배치의 '숨김'과는 따로다
   - 편집: 이동 바의 '🧩 배치' → 블록이 이름표(타일)로 바뀌고, 끌어서 옮기거나 단추(↑ ↓ ⇄ 숨기기)로 옮긴다 */
const NL={
  orig:{ic:"📄",name:"레드마인 원문",d:"요건 · 본문 그대로",fold:"open"},
  att:{ic:"📎",name:"첨부파일",d:"본문 · 댓글에 붙은 파일",fold:"open"},
  notes:{ic:"🗂",name:"정리 기록",d:"처리 내용 · 수정한 코드 · 수정 이유",fold:"auto"},
  cm:{ic:"💬",name:"댓글",d:"댓글 이력 + 댓글 쓰기 (접기는 이력에만)",fold:"closed"},
  rel:{ic:"🔗",name:"연결된 일감",d:"관계 · 언급으로 이어진 일감",fold:"closed"},
  sim:{ic:"🧭",name:"같은 주제",d:"드문 용어가 같은 과거 일감 (새 디자인에서만)",fold:"open"},
  todo:{ic:"☑",name:"할 일",d:"이 노트의 체크리스트",fold:"open"},
  pg:{ic:"📝",name:"진행 기록",d:"날짜별로 어디까지 했는지",fold:"open"}
};
const NL_DEF={main:["orig","att","notes","cm","rel","sim"],side:["todo","pg"],hidden:[]};
const NL_JUMP={orig:"원문",notes:"정리 기록",cm:"댓글",rel:"연결된 일감",todo:"할 일",pg:"진행 기록"};   // 이동 바에 나오는 블록 (첨부 · 같은 주제는 짧아서 뺀다)
const NL_FOLD=[["open","펼침"],["closed","접힘"],["auto","자동"]];
const NL_PRESET={
  def:["기본",{main:NL_DEF.main,side:NL_DEF.side,hidden:[]}],
  cmFirst:["댓글 먼저",{main:["cm","orig","att","notes","rel","sim"],side:["todo","pg"],hidden:[]}],
  cmSide:["댓글을 옆 칸으로",{main:["orig","att","notes","rel","sim"],side:["cm","todo","pg"],hidden:[]}],
  focus:["정리 기록 집중",{main:["notes","orig","cm"],side:["pg","todo"],hidden:["att","rel","sim"]}]
};
const nlAvail=k=>k!=="sim"||V2();      // 같은 주제는 새 디자인에서만 그린다
function nlNorm(s){   // 저장된 배치를 다듬는다: 모르는 블록은 빼고, 빠진 블록(새로 생긴 블록 포함)은 기본 자리에 붙인다
  s=s||{};const seen=new Set(),out={main:[],side:[],hidden:[],fold:{}};
  ["main","side","hidden"].forEach(z=>(Array.isArray(s[z])?s[z]:[]).forEach(k=>{if(NL[k]&&!seen.has(k)){seen.add(k);out[z].push(k)}}));
  Object.keys(NL).forEach(k=>{if(!seen.has(k))out[NL_DEF.side.includes(k)?"side":"main"].push(k)});
  Object.keys(NL).forEach(k=>{const f=(s.fold||{})[k];out.fold[k]=NL_FOLD.some(([v])=>v===f)?f:NL[k].fold});
  return out;
}
const nlGet=()=>nlNorm(ui.nl);
const nlZone=k=>{const L=nlGet();return L.side.includes(k)?"side":L.hidden.includes(k)?"hidden":"main"};
/* 노트를 열 때 이 블록을 펼칠지: 배치에서 정한 기본 상태 (자동 = 내용이 있으면 펼침) */
function nlOpen(k,has){const f=nlGet().fold[k];return f==="open"?true:f==="closed"?false:!!has}
const cmSide=()=>nlZone("cm")==="side";

/* 노트 화면: 블록 html 을 배치대로 본문 · 옆 칸 · 숨김에 나눈다 */
function nlPlace(B){
  const L=nlGet(),pick=z=>L[z].filter(k=>nlAvail(k)&&B[k]);
  return {main:pick("main").map(k=>B[k]).join(""),side:pick("side"),
    hidden:L.hidden.filter(k=>B[k]).map(k=>B[k]).join("")+L.side.concat(L.main).filter(k=>!nlAvail(k)&&B[k]).map(k=>B[k]).join("")};
}
/* 이동 바: 본문에 놓인 블록만 위에서부터. 옆 칸 블록은 옆 칸 위의 단추로 가고, 숨긴 블록은 빠진다 (눌러도 아무 일 없는 단추가 남지 않게) */
const nlJumps=()=>nlGet().main.filter(k=>NL_JUMP[k]&&nlAvail(k)).map(k=>[k,NL_JUMP[k],NL[k].ic]);
/* 옆 칸 블록으로 (댓글이 옆 칸일 때 C · ＋ 새 댓글 쓰기): 잠깐 숨겨 뒀으면 다시 보이고, 접혀 있으면 펴고, 옆 칸 안에서 그 블록까지 스크롤한 뒤 잠깐 강조한다 */
function nlSideGo(n,k,el){
  nsShow(k);
  if(el.classList.contains("collapsed")&&el.dataset.cf)setCf(n,el,true);
  const side=$("#noteside");
  if(side){const d=el.getBoundingClientRect().top-side.getBoundingClientRect().top-side.querySelector(".ns-top").offsetHeight-14;side.scrollBy({top:d,behavior:"smooth"})}
  const b=el.closest(".ns-b")||el;b.classList.remove("nl-flash");void b.offsetWidth;b.classList.add("nl-flash");
  setTimeout(()=>b.classList.remove("nl-flash"),1400);
}
function focusSideCm(){   // 댓글이 옆 칸에 있으면 💬 팝업 대신 옆 칸의 댓글 쓰기 칸으로
  const n=curNote(),w=$("#sec-write");if(!n||!w)return;
  nlSideGo(n,"cm",w);
  const tb=w.querySelector(".cmta .tb");if(tb)setTimeout(()=>tb.focus({preventScroll:true}),60);
}

/* ---------- 배치 편집 ---------- */
let nlEdit=null;      // 편집 중이면 { d: 고치는 중인 배치 }
function nlStart(){flushEdits();nlEdit={d:nlGet()};if(cmOpen)toggleCm(false);renderCenter()}
function nlStop(save){
  if(save){
    if(!nlEdit.d.main.some(nlAvail))return toast("본문에 블록이 하나 이상 있어야 해요",3000);
    ui.nl=nlEdit.d;saveUI();
  }
  nlEdit=null;renderCenter();
  if(save)toast("배치를 저장했어요 · 모든 노트에 같이 적용돼요",2600);
}
function nlTile(k,z,i,len){
  const b=NL[k],f=nlEdit.d.fold[k];
  return `<div class="nl-tile" draggable="true" data-k="${k}" title="끌어서 옮기기">
    <span class="nl-grip" aria-hidden="true">⠿</span><span class="nl-ic">${b.ic}</span><div class="nl-tx"><b>${b.name}</b><small>${b.d}</small></div>
    <label class="nl-fold" title="노트를 열 때 이 블록의 기본 상태">열 때<select data-fold="${k}">${NL_FOLD.map(([v,l])=>`<option value="${v}" ${v===f?"selected":""}>${l}${v==="auto"?" (내용 있으면 펼침)":""}</option>`).join("")}</select></label>
    <span class="nl-btns"><button type="button" data-act="up" title="위로" ${i?"":"disabled"}>↑</button><button type="button" data-act="down" title="아래로" ${i<len-1?"":"disabled"}>↓</button><button type="button" data-act="swap" title="${z==="main"?"옆 칸으로":"본문으로"}">${z==="main"?"→ 옆 칸":"← 본문"}</button><button type="button" data-act="hide" title="숨기기 (데이터는 그대로 남아요)">숨기기</button></span>
  </div>`;
}
function renderNlEdit(n){
  edNote=null;
  const d=nlEdit.d,tiles=z=>{const ks=d[z].filter(nlAvail);return ks.map((k,i)=>nlTile(k,z,i,ks.length)).join("")};
  const hid=d.hidden.filter(nlAvail);
  $("#center").innerHTML=`<div class="notewrap nl-ed" style="--nsw:${nsW()}px"><div class="notemain"><div class="notebox">
    <div class="nlbar" id="nlbar"><b>🧩 노트 배치</b><small>끌어서 옮기거나 단추를 쓰세요 · <b>모든 노트에 같이 적용</b></small><span class="sp"></span>
      <span class="nlbtns"><button type="button" class="mini" id="nlDef">기본 배치로</button><button type="button" class="mini" id="nlNo" title="Esc">취소</button><button type="button" class="mini primary" id="nlOk">완료</button></span></div>
    <div class="nl-tray">
      <div class="nl-pre"><span class="meta">빠른 배치</span>${Object.entries(NL_PRESET).map(([k,[l]])=>`<button type="button" class="mini" data-pre="${k}">${l}</button>`).join("")}</div>
      <div class="nl-zh">숨긴 블록 <small>여기로 끌어 놓으면 숨겨요 · ‘보이기’를 누르면 본문 맨 아래로 돌아와요</small></div>
      <div class="nl-hid" data-zone="hidden">${hid.map(k=>`<span class="nl-pill" draggable="true" data-k="${k}">${NL[k].ic} ${NL[k].name}<button type="button" data-show="${k}">보이기</button></span>`).join("")}</div>
    </div>
    <div class="card ehead nl-lock"><h2>${title(n.subject)}</h2><span class="meta">🔒 제목 · 이동 바 · 저장 줄은 자리가 고정이에요</span></div>
    <div class="nl-zh">본문 <small>위에서부터 이 순서로 보여요</small></div>
    <div class="nl-zone" data-zone="main">${tiles("main")}<div class="nl-empty">본문이 비었어요. 블록을 하나 이상 끌어 오세요</div></div>
  </div></div><div class="ns-split"></div><aside class="noteside nl-sidez">
    <div class="nl-zh">옆 칸 <small>노트 오른쪽에 붙어 있어요</small></div>
    <div class="nl-zone" data-zone="side">${tiles("side")}<div class="nl-empty">여기로 끌어 놓으면 오른쪽 옆 칸에 보여요. 비워 두면 옆 칸이 사라지고 본문이 넓어져요</div></div>
  </aside></div>`;
  $("#nlOk").onclick=()=>nlStop(true);$("#nlNo").onclick=()=>nlStop(false);
  $("#nlDef").onclick=()=>{nlEdit.d=nlNorm({});renderCenter()};
  document.querySelectorAll("#center [data-pre]").forEach(b=>b.onclick=()=>{nlEdit.d=nlNorm({...NL_PRESET[b.dataset.pre][1],fold:nlEdit.d.fold});renderCenter()});
  document.querySelectorAll("#center [data-fold]").forEach(s=>s.onchange=()=>{nlEdit.d.fold[s.dataset.fold]=s.value});
  nsCenter();
}
function nlMove(k,z,idx){   // k 를 z 칸의 idx 자리로 (idx 는 옮기기 전 목록 기준, 없으면 맨 끝)
  const d=nlEdit.d,fz=["main","side","hidden"].find(x=>d[x].includes(k)),fi=d[fz].indexOf(k);
  d[fz].splice(fi,1);
  if(idx!=null&&fz===z&&idx>fi)idx--;                 // 같은 칸에서 아래로: 빠진 자리만큼 당긴다
  if(idx==null||idx>d[z].length)idx=d[z].length;
  d[z].splice(idx,0,k);renderCenter();
}
document.addEventListener("click",e=>{
  if(!nlEdit||!e.target.closest)return;
  const a=e.target.closest(".nl-ed [data-act]");
  if(a){
    const k=a.closest(".nl-tile").dataset.k,d=nlEdit.d,z=d.side.includes(k)?"side":"main";
    const vis=d[z].filter(nlAvail),i=vis.indexOf(k),at=x=>x<0||x>=vis.length?null:d[z].indexOf(vis[x]);   // 보이지 않는 블록(같은 주제 · 기존 디자인)은 건너뛰고 한 칸씩
    if(a.dataset.act==="up"&&i>0)nlMove(k,z,at(i-1));
    if(a.dataset.act==="down"&&i<vis.length-1)nlMove(k,z,at(i+1)+1);
    if(a.dataset.act==="swap")nlMove(k,z==="main"?"side":"main");
    if(a.dataset.act==="hide")nlMove(k,"hidden");
    return;
  }
  const s=e.target.closest(".nl-ed [data-show]");if(s)nlMove(s.dataset.show,"main");
});
/* 끌어서 옮기기 */
let nlDrag=null;
const nlMark=document.createElement("div");nlMark.className="nl-drop";
document.addEventListener("dragstart",e=>{
  const el=nlEdit&&e.target.closest&&e.target.closest(".nl-ed .nl-tile,.nl-ed .nl-pill");if(!el)return;
  nlDrag=el.dataset.k;e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",nlDrag);
  setTimeout(()=>el.classList.add("nl-dragging"),0);
});
document.addEventListener("dragend",()=>{nlDrag=null;nlMark.remove();document.querySelectorAll(".nl-dragging,.nl-over").forEach(x=>x.classList.remove("nl-dragging","nl-over"))});
const nlZoneAt=e=>e.target.closest&&e.target.closest(".nl-ed [data-zone]");
document.addEventListener("dragover",e=>{
  if(!nlDrag)return;const z=nlZoneAt(e);
  document.querySelectorAll(".nl-over").forEach(x=>x!==z&&x.classList.remove("nl-over"));
  if(!z){nlMark.remove();return}
  e.preventDefault();z.classList.add("nl-over");
  if(z.dataset.zone==="hidden"){nlMark.remove();return}
  const after=[...z.querySelectorAll(".nl-tile:not(.nl-dragging)")].find(t=>{const r=t.getBoundingClientRect();return e.clientY<r.top+r.height/2});
  z.insertBefore(nlMark,after||z.querySelector(".nl-empty"));
});
document.addEventListener("drop",e=>{
  if(!nlDrag)return;const z=nlZoneAt(e);if(!z)return;e.preventDefault();
  const k=nlDrag,zone=z.dataset.zone;
  if(zone==="hidden"){nlMark.remove();nlMove(k,"hidden");return}
  let nx=null;for(let c=nlMark.nextElementSibling;c;c=c.nextElementSibling)if(c.classList.contains("nl-tile")&&c.dataset.k!==k){nx=c.dataset.k;break}   // 표시 바로 아래 블록 앞에 놓는다
  nlMark.remove();
  const d=nlEdit.d,fz=["main","side","hidden"].find(x=>d[x].includes(k));
  d[fz].splice(d[fz].indexOf(k),1);
  d[zone].splice(nx?d[zone].indexOf(nx):d[zone].length,0,k);
  renderCenter();
});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&nlEdit&&view==="note"&&!$("#modal").classList.contains("show")&&!$("#wdlg.show")){e.preventDefault();nlStop(false)}
});
