/* ---------- 메모: 포스트잇 코르크보드 ----------
   레드마인·용어 사전·검색·그래프·요약·코드 이력과 완전히 별개. 하루 = 보드 한 장, Ctrl+N 으로 오늘 보드에 새 포스트잇.
   저장은 서버(내 PC의 notes.db 안 별도 표 `sticky`)에 바로바로 자동으로 된다.
   보드는 포스트잇이 놓인 곳을 따라 상하좌우로 늘어난다 (자리는 음수 좌표도 허용). */
const STK={yellow:"#faefb0",pink:"#f8d3df",green:"#d5ebc3",blue:"#cfe3f6",orange:"#f9dcb8",purple:"#e4d8f6"};   // 채도를 낮춘 파스텔
/* 보드 색: 비어 있으면 테마를 따라가고, 고르면 그 색으로 고정. 점·선·안내 글자 색은 바탕 밝기에 맞춰 자동으로 정한다 */
const BOARD_COLORS=[["","테마 따라가기"],["#ffffff","화이트"],["#fbf4e4","크림"],["#e3f2ea","민트"],["#e1eef9","하늘"],["#ebe5f6","라벤더"],["#f8e6ec","핑크"],["#3a3f47","차콜"],["#d6ad74","코르크 갈색"]];
const boardColor=()=>/^#[0-9a-f]{6}$/i.test(ui.memoBoardColor||"")?ui.memoBoardColor.toLowerCase():"";
function applyBoardColor(){
  const c=$("#cork");if(!c)return;
  ["background-color","border-color","--bdot","--bmaj","--bmin","--bfg"].forEach(k=>c.style.removeProperty(k));
  const col=boardColor();if(!col)return;
  const r=parseInt(col.slice(1,3),16),g=parseInt(col.slice(3,5),16),b=parseInt(col.slice(5,7),16),dark=(.299*r+.587*g+.114*b)/255<.5,ink=dark?"255,255,255":"30,30,30";
  c.style.backgroundColor=col;c.style.borderColor=`color-mix(in srgb,${col} 76%,${dark?"#fff":"#000"})`;
  c.style.setProperty("--bdot",`rgba(${ink},.32)`);c.style.setProperty("--bmaj",`rgba(${ink},.22)`);c.style.setProperty("--bmin",`rgba(${ink},.09)`);
  c.style.setProperty("--bfg",dark?"rgba(255,255,255,.78)":"rgba(40,40,40,.7)");
}
function drawColorPop(){
  const pop=$("#mColorPop");if(!pop)return;const cur=boardColor();
  pop.innerHTML=`<div class="bsw-h"><b>보드 색</b><span class="meta">고르면 바로 바뀌어요 · 모든 날 같은 색</span></div><div class="bsw-g">${BOARD_COLORS.map(([c,n])=>`<button type="button" class="bsw ${cur===c?"on":""}" data-bc="${c}" title="${n}"><i style="background:${c||"linear-gradient(135deg,var(--surface2) 50%,var(--text) 50%)"}"></i><span>${n}</span></button>`).join("")}
    <label class="bsw custom ${cur&&!BOARD_COLORS.some(x=>x[0]===cur)?"on":""}" title="원하는 색을 직접 고르기"><i style="background:${cur||"conic-gradient(#f66,#fd6,#6f9,#6cf,#c6f,#f66)"}"></i><span>직접 고르기</span><input type="color" id="mColorIn" value="${cur||"#e6e9ef"}"></label></div>`;
  pop.querySelectorAll("[data-bc]").forEach(b=>b.onclick=()=>{ui.memoBoardColor=b.dataset.bc;saveUI();applyBoardColor();drawColorPop()});
  $("#mColorIn").oninput=e=>{ui.memoBoardColor=e.target.value;applyBoardColor()};
  $("#mColorIn").onchange=e=>{ui.memoBoardColor=e.target.value;saveUI();applyBoardColor();drawColorPop()};
}
function toggleColorPop(){const pop=$("#mColorPop");if(!pop)return;const on=!pop.classList.contains("show");pop.classList.toggle("show",on);if(on)drawColorPop()}
document.addEventListener("click",e=>{const pop=$("#mColorPop");if(!pop||!pop.classList.contains("show"))return;
  const inside=(e.composedPath?e.composedPath():[]).some(x=>x&&(x===pop||x.id==="mColor"));      // 누른 버튼이 다시 그려져 사라져도, 지나간 경로로 창 안인지 판단한다
  if(!inside)pop.classList.remove("show")});
const memoBoard=()=>["dot","grid","plain","cork"].includes(ui.memoBoard)?ui.memoBoard:"dot";     // 보드 배경: 도트(기본) · 격자 · 코르크
let memoDay=null,memoList=[],memoDays=[],memoZ=1,memoReady=Promise.resolve();
const memoCal={open:false,y:0,m:0,map:new Map()};
const stkQ=new Map(),stkDeb=new Map();
const WD2=["일","월","화","수","목","금","토"];
const dayLabel=d=>{const x=new Date(d+"T00:00:00");return `${d} (${WD2[x.getDay()]})`};
const shiftDay=(d,k)=>{const x=new Date(d+"T00:00:00");x.setDate(x.getDate()+k);return fmt(x)};
const viewW=()=>Math.max(320,($("#center").clientWidth||940)-44),viewH=()=>Math.max(360,(window.innerHeight||800)-190);   // 지금 보이는 판의 크기
function stkSave(sn,quiet){   // 서버에 저장 (id 가 없으면 새로 만든다). 같은 포스트잇은 줄을 세워서 저장한다
  const body={id:sn.id,day:sn.day,until:sn.until||"",text:sn.text,color:sn.color,x:sn.x,y:sn.y,w:sn.w,h:sn.h,z:sn.z,pinned:sn.pinned?1:0,remind_time:sn.remind_time||"",wake:sn.wake?1:0,alarm_dates:sn.alarm_dates||[]};
  const run=(stkQ.get(sn)||Promise.resolve()).catch(()=>{}).then(async()=>{
    try{const r=await post("/api/sticky",{...body,id:sn.id});sn.id=r.id;sn.remind_time=r.remind_time;sn.wake=r.wake;sn.alarm_dates=r.alarm_dates||[];sbcRefresh()}
    catch(e){if(!quiet)toast("메모를 저장하지 못했어요: "+e.message,6000)}
  });
  stkQ.set(sn,run);return run;
}
function stkLater(sn){clearTimeout(stkDeb.get(sn));stkDeb.set(sn,setTimeout(()=>stkSave(sn),500))}
async function loadMemo(){
  [memoList,memoDays]=await Promise.all([api("/api/sticky?day="+memoDay),api("/api/sticky/days")]);
  memoZ=Math.max(1,...memoList.map(x=>x.z||1));
}
function renderMemo(){memoReady=renderMemoInner();return memoReady}   // 그리는 중인지 기다릴 수 있게
async function renderMemoInner(){
  const c=$("#center");if(!memoDay)memoDay=todayStr();
  if(memoDay===todayStr()&&ui.memoSeenDay!==todayStr()){ui.memoSeenDay=todayStr();saveUI();renderNav()}      // 오늘 보드를 열면 '오늘 볼 메모' 표시는 사라진다
  c.innerHTML=`<div class="memo-h">
      <div class="mh-row mh-top">
        <div class="mh-g"><div class="seg"><button type="button" id="mPrev" title="전날">◀</button><button type="button" id="mToday" title="오늘 보드로">오늘</button><button type="button" id="mNext" title="다음 날">▶</button></div>
          <input type="date" id="mDate" value="${memoDay}" title="날짜를 골라 이동">
          <button type="button" id="mCalBtn" title="달력으로 보기 (메모가 있는 날 표시)">📅 달력</button></div>
        <b class="mday" id="mDay"></b>
        <span class="sp"></span>
        <input type="search" id="mQ" class="mq" placeholder="메모 검색 (전체 날짜)" title="모든 날짜의 메모에서 찾아요">
        ${V2()?`<div class="mh-g v2mm"><button type="button" id="mArrM" title="정렬 · 스프레드 · 랜덤 (Alt+T · Alt+S · Alt+R)">정리 ▾</button><button type="button" id="mViewM" title="보드 무늬 · 색상 · 내보내기">보기 ▾</button><button type="button" id="mPinBtn2" title="📌 고정한 포스트잇을 날짜와 상관없이 한눈에 모아 봐요">📌 고정 모아보기 <small id="mPinN2">0</small></button>
          <button type="button" class="primary" id="mNew2" title="새 포스트잇 (Ctrl+N 또는 Alt+N · 빈 보드를 더블클릭해도 돼요)">＋ 새 메모 <kbd>Ctrl+N</kbd></button><button type="button" id="mNewM" title="기간을 정해서 추가">▾</button></div>`:""}
      </div>
      <div class="mh-row mh-tools">
        <div class="mh-g"><span class="mh-l">배치</span><div class="seg" id="mArr" title="포스트잇이 많을 때 한 번에 배치를 바꿉니다 (겹치지 않게, 📌 고정한 것은 그대로)"><button type="button" data-arr="grid" title="만든 순서대로 왼쪽 위부터 차례로 (Alt+T)">정렬</button><button type="button" data-arr="spread" title="보드 전체에 고르게 펼치기 (Alt+S 또는 Alt+D)">스프레드</button><button type="button" data-arr="random" title="무작위로 흩뿌리기 (Alt+R)">랜덤</button></div></div>
        <div class="mh-g"><span class="mh-l">보드</span><div class="seg" id="mBoard" title="보드 배경"><button type="button" data-bd="dot" class="${memoBoard()==="dot"?"on":""}">도트</button><button type="button" data-bd="grid" class="${memoBoard()==="grid"?"on":""}">격자</button><button type="button" data-bd="plain" class="${memoBoard()==="plain"?"on":""}" title="무늬 없이 바탕색만 (🎨 색상을 따라요)">민무늬</button><button type="button" data-bd="cork" class="${memoBoard()==="cork"?"on":""}">코르크</button></div>
          <button type="button" id="mColor" title="보드 색을 직접 고르기">🎨 색상</button></div>
        <div class="mh-g"><button type="button" id="mPinBtn" title="📌 고정한 포스트잇을 날짜와 상관없이 한눈에 모아 봐요">📌 고정 모아보기 <small id="mPinN">0</small></button></div>
        <span class="sp"></span>
        <div class="mh-g"><button type="button" id="mExp" title="날짜 범위를 파일(마크다운/텍스트)로 저장">내보내기</button>
          <button type="button" id="mNewR" title="기간을 정해서 추가: 그 기간의 매일 보드에 계속 보여요">📅 기간 정해서</button>
          <button type="button" class="primary" id="mNew" title="새 포스트잇 (Ctrl+N 또는 Alt+N · 빈 보드를 더블클릭해도 돼요)">＋ 새 포스트잇 <kbd>Ctrl+N</kbd></button></div>
      </div>
      <div class="memo-cal" id="mCal"></div><div class="mcolor" id="mColorPop"></div>
    </div>
    <div class="memo-days" id="mDays"></div><div id="mSearch"></div><div id="mPins"></div>
    <div class="cork b-${memoBoard()}" id="cork"><div class="cork-empty" id="corkEmpty" hidden><b>이 날의 포스트잇이 없어요</b>빈 곳을 <b>더블클릭</b>하거나 Ctrl+N · ‘＋ 새 포스트잇’으로 바로 적어 보세요.<br>레드마인·검색·사전과 상관없이 나만 보는 메모예요.</div></div>`;
  try{await loadMemo()}catch(e){toast("메모를 불러오지 못했어요: "+e.message,6000);return}
  if(view!=="memo")return;
  drawMemo();
  $("#mPrev").onclick=()=>gotoMemo(shiftDay(memoDay,-1));$("#mNext").onclick=()=>gotoMemo(shiftDay(memoDay,1));
  $("#mToday").onclick=()=>gotoMemo(todayStr());
  $("#mDate").onchange=e=>{if(e.target.value)gotoMemo(e.target.value)};
  $("#mNew").onclick=()=>newSticky();$("#mExp").onclick=()=>exportMemo();$("#mCalBtn").onclick=()=>toggleCal();
  document.querySelectorAll("#mArr [data-arr]").forEach(b=>b.onclick=()=>arrangeMemo(b.dataset.arr));
  $("#mColor").onclick=e=>{e.stopPropagation();toggleColorPop()};
  $("#mPinBtn").onclick=()=>{memoPinsOpen=!memoPinsOpen;drawPins()};
  loadPins().then(()=>{if(memoPinsOpen)drawPins(true)});
  $("#mNewR").onclick=async()=>{const r=await pickRange({from:todayStr(),to:""},"기간 정해서 새 포스트잇");if(r)newSticky({from:r.from,to:r.to})};
  applyBoardColor();
  if(V2()){   // 새 디자인: 아래 도구줄은 숨기고, 같은 버튼을 메뉴에서 대신 누른다 (동작 · 단축키는 그대로)
    const press=s=>()=>{const b=$(s);if(b)b.click()},on=k=>memoBoard()===k?"✓ ":"   ";
    $("#mArrM").onclick=e=>{e.stopPropagation();popMenu(e.currentTarget,[["정렬  (Alt+T)",press('#mArr [data-arr="grid"]')],["스프레드  (Alt+S)",press('#mArr [data-arr="spread"]')],["랜덤  (Alt+R)",press('#mArr [data-arr="random"]')]])};
    $("#mViewM").onclick=e=>{e.stopPropagation();popMenu(e.currentTarget,[[on("dot")+"도트",press('#mBoard [data-bd="dot"]')],[on("grid")+"격자",press('#mBoard [data-bd="grid"]')],[on("plain")+"민무늬",press('#mBoard [data-bd="plain"]')],[on("cork")+"코르크",press('#mBoard [data-bd="cork"]')],
      ["보드 색상…",()=>setTimeout(()=>$("#mColor").click(),0)],["내보내기…",press("#mExp")]])};
    $("#mPinBtn2").onclick=press("#mPinBtn");     // 자주 써서 메뉴에 숨기지 않고 도구줄에 둔다
    $("#mNew2").onclick=()=>newSticky();
    $("#mNewM").onclick=e=>{e.stopPropagation();popMenu(e.currentTarget,[["기간 정해서 새 메모…",press("#mNewR")]])};
  }
  document.querySelectorAll("#mBoard [data-bd]").forEach(b=>b.onclick=()=>{ui.memoBoard=b.dataset.bd;saveUI();const c=$("#cork");c.classList.remove("b-dot","b-grid","b-plain","b-cork");c.classList.add("b-"+memoBoard());
    document.querySelectorAll("#mBoard [data-bd]").forEach(x=>x.classList.toggle("on",x===b))});
  let qt;$("#mQ").oninput=e=>{clearTimeout(qt);qt=setTimeout(()=>memoSearch(e.target.value.trim()),250)};
  drawCal();
  $("#cork").addEventListener("dblclick",e=>{      // 빈 보드를 더블클릭하면 그 자리에 새 포스트잇 (포스트잇·팝업 위는 제외)
    const cork=$("#cork");if(e.target!==cork)return;
    e.preventDefault();const r=cork.getBoundingClientRect();
    newSticky({from:memoDay,at:{x:e.clientX-r.left,y:e.clientY-r.top}});
  });
}
function gotoMemo(d){memoDay=d;memoCal.open=false;renderMemo()}
function drawMemo(){
  const cork=$("#cork");cork.querySelectorAll(".stk").forEach(e=>e.remove());
  memoList.forEach(sn=>cork.appendChild(mkSticky(sn)));
  $("#corkEmpty").hidden=memoList.length>0;
  $("#mDay").textContent=`${dayLabel(memoDay)} · ${memoList.length}개${memoDay===todayStr()?" · 오늘":""}`;
  $("#mDays").innerHTML=memoDays.length?`<span class="meta">메모가 있는 날</span>`+memoDays.slice(0,30).map(d=>`<button type="button" class="mdchip ${d.day===memoDay?"on":""}" data-md="${d.day}">${d.day.slice(5)}<small>${d.count}</small></button>`).join(""):"";
  document.querySelectorAll("#mDays [data-md]").forEach(b=>b.onclick=()=>gotoMemo(b.dataset.md));
  fitCork();
}
/* 보드는 크기가 고정이다 (창 크기에 맞춤, 늘어나지 않음). 많이 쓰지 않도록 일부러 그렇게 했고, 가득 차면 겹쳐서 붙는다. */
const clampSn=sn=>{const bw=viewW(),bh=viewH();sn.w=Math.min(sn.w,bw-16);sn.h=Math.min(sn.h,bh-16);sn.x=Math.max(0,Math.min(Math.round(sn.x),bw-sn.w));sn.y=Math.max(0,Math.min(Math.round(sn.y),bh-sn.h))};
function fitCork(){
  const cork=$("#cork");if(!cork)return;
  cork._ox=0;cork._oy=0;cork.style.width=viewW()+"px";cork.style.height=viewH()+"px";
  memoList.forEach(clampSn);
  document.querySelectorAll("#cork .stk").forEach(el=>el._place&&el._place());
}
window.addEventListener("resize",()=>{if(nav==="memo"&&$("#cork"))fitCork()});
/* ---- 포스트잇 한 장 ---- */
const hasChk=t=>t.split(/(```[\s\S]*?```)/).some((seg,i)=>i%2===0&&/^\s*\[[ xX]\]/m.test(seg));
function chkHtml(text){
  let k=0;
  return text.split(/(```[\s\S]*?```)/).map((seg,si)=>si%2?renderMd(seg):seg.split("\n").map(ln=>{
    const m=ln.match(/^(\s*)\[( |x|X)\]\s?(.*)$/);
    if(!m)return esc(ln)+"\n";
    const done=m[2]!==" ";return `<label class="chk${done?" done":""}"><input type="checkbox" data-k="${k++}" ${done?"checked":""}><span>${esc(m[3])||"&nbsp;"}</span></label>`;
  }).join("")).join("");
}
function toggleChk(text,k){   // k 번째 체크 줄의 [ ] <-> [x]
  let n=0;
  return text.split(/(```[\s\S]*?```)/).map((seg,si)=>si%2?seg:seg.split("\n").map(ln=>{
    const m=ln.match(/^(\s*)\[( |x|X)\]/);if(!m)return ln;
    return n++===k?m[1]+(m[2]===" "?"[x]":"[ ]")+ln.slice(m[0].length):ln;
  }).join("\n")).join("");
}
function mkSticky(sn){
  const el=document.createElement("div");el.className="stk"+(sn.pinned?" pinned":"");el.dataset.id=sn.id;
  const place=()=>{const c=$("#cork"),ox=c?c._ox||0:0,oy=c?c._oy||0:0;
    el.style.left=(sn.x-ox)+"px";el.style.top=(sn.y-oy)+"px";el.style.width=sn.w+"px";el.style.height=sn.h+"px";
    el.style.zIndex=(sn.pinned?100000:0)+(sn.z||1);el.style.setProperty("--sc",STK[sn.color]||STK.yellow)};
  el.innerHTML=`<div class="stk-h"><span class="stk-grab" title="잡고 끌어서 옮기기">⠿</span>${sn.until?`<span class="stk-until" title="노출 기간 ${sn.day} ~ ${sn.until} (📅 로 바꿀 수 있어요)">${sn.day.slice(5)}~${sn.until.slice(5)}</span>`:""}${sn.remind_time?`<span class="stk-until stk-bell" data-a="alarm" title="${sn.until?(sn.alarm_dates&&sn.alarm_dates.length?`고른 ${sn.alarm_dates.length}일에만 `:"기간의 평일 "):""}${sn.remind_time} 에 알려요 (눌러서 바꾸기)">🔔${sn.remind_time}${sn.alarm_dates&&sn.alarm_dates.length?`<small>·${sn.alarm_dates.length}일</small>`:""}</span>`:""}
      <span class="stk-colors">${Object.keys(STK).map(k=>`<i data-c="${k}" style="background:${STK[k]}" title="색 바꾸기"></i>`).join("")}</span><span class="sp"></span>
      <button type="button" data-a="col" class="colb" title="색 바꾸기 (누르면 이 줄에서 색을 골라요)">🎨</button>
      <button type="button" data-a="chk" title="체크 항목 추가 ([ ] 로 시작하는 줄이 체크박스가 돼요)">☑</button>
      <button type="button" data-a="pin" class="pinb" title="고정 (맨 위에 두고, 자동 배치에서 움직이지 않아요)">📌</button>
      <button type="button" data-a="range" title="노출 기간 정하기: 시작일~종료일의 매일 보드에 계속 보여요">📅</button><button type="button" data-a="alarm" title="알림 설정: 정한 날짜(기간이면 매일) 그 시각에 알려요 · 메모를 사이드바 달력으로 끌어다 놓아도 돼요">🔔</button>${sn.day!==todayStr()&&!(sn.until&&sn.until>=todayStr()&&sn.day<=todayStr())?`<button type="button" data-a="today" title="오늘 보드로 옮기기">→오늘</button>`:""}<button type="button" data-a="del" title="삭제 (바로 되돌릴 수 있어요)">✕</button></div>
    <div class="stk-v" hidden></div><div class="rte stk-t" data-ph="메모"></div><div class="stk-rs" title="끌어서 크기 바꾸기"></div>`;
  place();el._sn=sn;el._place=place;
  const ed=el.querySelector(".stk-t"),vw=el.querySelector(".stk-v");edInit(ed,sn.text);
  const showView=()=>{   // 체크 줄이 있으면, 편집 중이 아닐 때 체크박스로 보여 준다
    if(hasChk(sn.text)){vw.innerHTML=chkHtml(sn.text);vw.hidden=false;ed.hidden=true}else{vw.hidden=true;ed.hidden=false}
  };
  const showEdit=()=>{vw.hidden=true;ed.hidden=false;const tb=ed.querySelector(".tb:last-of-type")||ed.lastElementChild;if(tb&&tb.focus){tb.focus();const g=getSelection();g.selectAllChildren(tb);g.collapseToEnd()}};
  showView();
  vw.addEventListener("click",e=>{
    const cb=e.target.closest("input[type=checkbox]");
    if(cb){sn.text=toggleChk(sn.text,+cb.dataset.k);edInit(ed,sn.text);vw.innerHTML=chkHtml(sn.text);stkLater(sn);return}
    if(e.target.closest(".cbw"))return;showEdit();
  });
  el.addEventListener("focusout",e=>{if(!el.contains(e.relatedTarget))setTimeout(showView,0)});
  ed.addEventListener("input",()=>{sn.text=edGet(ed);stkLater(sn)});
  el.addEventListener("keydown",e=>{   // Ctrl+Enter 또는 Esc: 편집을 끝내고 바로 저장 (코드 상자 안에서도 한 번에)
    const enter=e.key==="Enter"&&(e.ctrlKey||e.metaKey),esc=e.key==="Escape"&&!e.isComposing;
    if(!enter&&!esc)return;
    e.preventDefault();e.stopPropagation();
    clearTimeout(stkDeb.get(sn));sn.text=edGet(ed);
    if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();
    showView();stkSave(sn).then(()=>{el.classList.remove("saved");void el.offsetWidth;el.classList.add("saved")});
  },true);
  const front=()=>{if(sn.z<memoZ||el.style.zIndex!=String((sn.pinned?100000:0)+memoZ)){sn.z=++memoZ;place();stkLater(sn)}};
  el.addEventListener("pointerdown",front);
  const drag=(handle,onMove,cal)=>{   // 끌기 공통: 움직인 만큼 반영, 놓으면 보드 크기를 다시 맞추고 저장 (cal: 사이드바 달력에 놓을 수 있음)
    handle.addEventListener("pointerdown",e=>{
      if(e.target.closest("button,i,.stk-bell"))return;e.preventDefault();
      const sx=e.clientX,sy=e.clientY,o={x:sn.x,y:sn.y,w:sn.w,h:sn.h};
      const mv=ev=>{onMove(o,ev.clientX-sx,ev.clientY-sy);place();if(cal)calDragUpdate(el,sn,ev)};
      const up=()=>{document.removeEventListener("pointermove",mv);document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",up);
        const d=cal?calDragEnd():"";if(d){sn.x=o.x;sn.y=o.y;place();calDropMemo(el,sn,d)}else stkSave(sn)};
      document.addEventListener("pointermove",mv);document.addEventListener("pointerup",up);document.addEventListener("pointercancel",up);
    });
  };
  drag(el.querySelector(".stk-h"),(o,dx,dy)=>{sn.x=o.x+dx;sn.y=o.y+dy;clampSn(sn)},true);   // 보드 밖으로는 못 나간다 (포인터만 달력으로 나갈 수 있다)
  el.addEventListener("pointerdown",e=>{   // 편집 중이 아닌 포스트잇은 어디를 잡아도 끌어서 옮긴다 (끌지 않고 그냥 누르면 예전처럼 편집이 시작된다)
    if(e.button!==0||e.target.closest(".stk-h,.stk-rs,button,i,input,a"))return;
    if(ed.contains(document.activeElement))return;        // 편집 중에는 글자 선택·커서 이동을 방해하지 않는다
    const intoEd=!!e.target.closest(".stk-t");
    e.preventDefault();
    const sx=e.clientX,sy=e.clientY,o={x:sn.x,y:sn.y};let moved=false;
    const mv=ev=>{const dx=ev.clientX-sx,dy=ev.clientY-sy;if(!moved&&Math.hypot(dx,dy)<5)return;moved=true;el.classList.add("moving");sn.x=o.x+dx;sn.y=o.y+dy;clampSn(sn);place();calDragUpdate(el,sn,ev)};
    const up=()=>{
      document.removeEventListener("pointermove",mv);document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",up);el.classList.remove("moving");
      if(moved){const stop=ev=>{ev.stopPropagation();ev.preventDefault()};el.addEventListener("click",stop,{capture:true,once:true});setTimeout(()=>el.removeEventListener("click",stop,true),0);
        const d=calDragEnd();if(d){sn.x=o.x;sn.y=o.y;place();calDropMemo(el,sn,d)}else stkSave(sn)}
      else if(intoEd&&!ed.hidden)showEdit();};
    document.addEventListener("pointermove",mv);document.addEventListener("pointerup",up);document.addEventListener("pointercancel",up);
  });
  drag(el.querySelector(".stk-rs"),(o,dx,dy)=>{sn.w=Math.max(140,Math.min(viewW()-sn.x-8,Math.round(o.w+dx)));sn.h=Math.max(110,Math.min(viewH()-sn.y-8,Math.round(o.h+dy)))});
  el.querySelectorAll(".stk-colors i").forEach(i=>i.onclick=()=>{sn.color=i.dataset.c;place();stkSave(sn);el.classList.remove("pick")});
  el.querySelector('[data-a="col"]').onclick=e=>{e.stopPropagation();el.classList.toggle("pick")};     // 글자를 가리지 않게, 팔레트는 머리줄 안에서만 바뀐다
  el.querySelector('[data-a="pin"]').onclick=()=>{sn.pinned=sn.pinned?0:1;el.classList.toggle("pinned",!!sn.pinned);place();stkSave(sn).then(()=>loadPins().then(()=>{if(memoPinsOpen)drawPins(true)}));toast(sn.pinned?"📌 고정했어요 (맨 위 · 자동 배치에서 제외)":"고정을 풀었어요",1800)};
  el.querySelector('[data-a="chk"]').onclick=()=>{   // 새 줄에 [ ] 를 넣고 바로 쓰게 한다
    showEdit();document.execCommand("insertText",false,(edGet(ed).trim()?"\n":"")+"[ ] ");sn.text=edGet(ed);stkLater(sn)};
  el.querySelector('[data-a="del"]').onclick=async()=>{   // 내용이 있으면 확인 창 한 번 + 삭제 뒤 '되돌리기' (6초). 빈 메모는 바로 삭제
    if(sn.text.trim()){const pv=sn.text.replace(/\s+/g," ").trim().slice(0,60);
      if(!await askC(`이 포스트잇을 삭제할까요?\n\n“${pv}${sn.text.trim().length>60?"…":""}”`,{title:"포스트잇 삭제",ok:"삭제"}))return}
    const snap={...sn};
    if(sn.id)await api("/api/sticky/"+sn.id,{method:"DELETE"}).catch(e=>toast("삭제하지 못했어요: "+e.message,5000));
    memoList=memoList.filter(x=>x!==sn);memoDays=await api("/api/sticky/days").catch(()=>memoDays);drawMemo();sbcRefresh();
    if(!snap.text.trim())return;
    toastUndo("포스트잇을 삭제했어요",async()=>{const re={...snap,id:null};memoList.push(re);await stkSave(re,true);memoDays=await api("/api/sticky/days").catch(()=>memoDays);drawMemo()},6000);
  };
  el.querySelector('[data-a="range"]').onclick=async()=>{
    const r=await pickRange({from:sn.day,to:sn.until||""},"포스트잇 노출 기간");if(!r)return;
    clearTimeout(stkDeb.get(sn));sn.day=r.from;sn.until=r.to&&r.to>r.from?r.to:"";
    await stkSave(sn);memoDays=await api("/api/sticky/days").catch(()=>memoDays);await loadMemo();drawMemo();
    toast(sn.until?`${sn.day} ~ ${sn.until} 동안 매일 보여요 ✓`:"그 하루만 보여요 ✓",2400)};
  el.querySelectorAll('[data-a="alarm"]').forEach(b=>b.onclick=()=>memoAlarmDlg(sn));
  const tb=el.querySelector('[data-a="today"]');
  if(tb)tb.onclick=async()=>{sn.day=todayStr();await stkSave(sn);memoList=memoList.filter(x=>x!==sn);memoDays=await api("/api/sticky/days").catch(()=>memoDays);drawMemo();toast("오늘 보드로 옮겼어요 ✓",2000)};
  return el;
}
function toastUndo(msg,fn,ms=6000){   // 되돌리기 단추가 있는 알림
  const e=$("#toast");e.textContent=msg+" ";
  const b=document.createElement("button");b.type="button";b.className="tundo";b.textContent="되돌리기";
  b.onclick=()=>{e.classList.remove("show","act");clearTimeout(tt);fn()};
  e.appendChild(b);e.classList.add("show","act");clearTimeout(tt);tt=setTimeout(()=>e.classList.remove("show","act"),ms);
}
/* ---- 자리 찾기 · 자동 배치 ---- */
function overlapOf(x,y,w,h,o){const ox=Math.min(x+w,o.x+o.w)-Math.max(x,o.x),oy=Math.min(y+h,o.y+o.h)-Math.max(y,o.y);return ox>0&&oy>0?ox*oy:0}
const shuffled=a=>[...a].sort(()=>Math.random()-.5);
/* 새 자리: 보드 안 무작위로 안 겹치는 곳. 보드가 가득 차서 빈 곳이 없으면 가장 덜 겹치는 곳(free:false). */
function freeSpot(W,H,others){
  const vw=viewW(),vh=viewH();let best=null,bestA=Infinity;
  for(let k=0;k<500;k++){
    const x=Math.round(8+Math.random()*Math.max(0,vw-W-16)),y=Math.round(8+Math.random()*Math.max(0,vh-H-16));
    let a=0;for(const o of others)a+=overlapOf(x,y,W,H,o);
    if(a===0)return {x,y,free:true};
    if(a<bestA){bestA=a;best={x,y}}
  }
  return {...best,free:false};
}
/* 자동 배치: 정렬(만든 순서대로) · 스프레드(보드 전체에 고르게) · 랜덤. 겹치지 않게 하고, 📌 고정한 것은 그대로 두고 피해서 놓는다. 결과는 모두 저장한다. */
function arrangeMemo(mode){
  const L=memoList;if(L.length<2){toast("포스트잇이 2개 이상일 때 쓸 수 있어요",2200);return}
  const fixed=L.filter(o=>o.pinned),mov=L.filter(o=>!o.pinned);
  if(!mov.length){toast("모두 📌 고정이라 옮길 게 없어요",2200);return}
  const cw=viewW()-16,ch=viewH()-16,gap=22,hit=(x,y,w,h,list)=>list.some(o=>overlapOf(x,y,w,h,o)>0);
  const tight=()=>{   // 칸이 모자라면 보드 전체를 촘촘한 격자로 나눠서 (조금 겹침)
    const n=mov.length,cols=Math.max(1,Math.ceil(Math.sqrt(n*cw/ch))),rows=Math.ceil(n/cols);
    [...mov].sort((a,b)=>(a.id||0)-(b.id||0)).forEach((sn,i)=>{sn.x=8+(i%cols)*Math.max(0,(cw-sn.w)/Math.max(1,cols-1));sn.y=8+Math.floor(i/cols)*Math.max(0,(ch-sn.h)/Math.max(1,rows-1))});
    toast("칸이 모자라 조금 겹쳐서 정렬했어요",2500);
  };
  if(mode==="grid"){
    let x=14,y=20,rowH=0,bottom=0;const pos=[];
    for(const sn of [...mov].sort((a,b)=>(a.id||0)-(b.id||0))){
      for(let g=0;g<3000;g++){
        if(x>14&&x+sn.w>cw){x=14;y+=rowH+gap;rowH=0}
        if(!hit(x,y,sn.w,sn.h,fixed)){pos.push([sn,x,y]);bottom=Math.max(bottom,y+sn.h);x+=sn.w+gap;rowH=Math.max(rowH,sn.h);break}
        x+=40;
      }
    }
    if(bottom>ch+8)tight();else pos.forEach(([sn,px,py])=>{sn.x=px;sn.y=py});
  }else if(mode==="random"){
    const placed=[...fixed];shuffled(mov).forEach(sn=>{const p=freeSpot(sn.w,sn.h,placed);sn.x=p.x;sn.y=p.y;placed.push(sn)});   // 빈틈이 없으면 가장 덜 겹치는 곳
  }else{
    const n=mov.length,maxW=Math.max(...mov.map(o=>o.w)),maxH=Math.max(...mov.map(o=>o.h));
    const cols=Math.max(1,Math.min(Math.ceil(Math.sqrt(n*cw/ch)),Math.floor(cw/(maxW+10)),n)),rows=Math.ceil(n/cols),cellW=cw/cols,cellH=Math.max(ch/rows,maxH+24);
    const placed=[...fixed];
    shuffled(mov).forEach((sn,i)=>{
      const sx=Math.max(0,cellW-sn.w),sy=Math.max(0,cellH-sn.h);
      let x=Math.max(8,Math.round((i%cols)*cellW+sx/2+(Math.random()-.5)*Math.min(sx,40))),y=Math.max(8,Math.round(Math.floor(i/cols)*cellH+sy/2+(Math.random()-.5)*Math.min(sy,40)));
      if(hit(x,y,sn.w,sn.h,placed)){const p=freeSpot(sn.w,sn.h,placed);x=p.x;y=p.y}
      sn.x=x;sn.y=y;placed.push(sn);
    });
  }
  const cork=$("#cork");cork.classList.add("arr");                 // 옮겨 가는 모습이 보이게
  fitCork();mov.forEach(sn=>stkSave(sn,true));
  setTimeout(()=>cork.classList.remove("arr"),600);
  toast({grid:"정렬했어요",spread:"보드 전체에 펼쳤어요",random:"무작위로 흩뿌렸어요"}[mode]+" ✓",1800);
}
/* 노출 기간 고르기: 시작일 ~ 종료일. 그 기간의 모든 날짜 보드에 같은 포스트잇이 보인다 */
async function pickRange(init,title){
  const t=todayStr(),n=new Date(),eow=(()=>{const d=new Date();d.setDate(d.getDate()+(7-d.getDay())%7);return fmt(d)})(),eom=fmt(new Date(n.getFullYear(),n.getMonth()+1,0)),in7=shiftDay(t,6);
  const body=`<div class="rngd"><div class="frow"><label>시작일</label><input type="date" id="rgFrom" value="${init.from}"></div>
    <div class="frow"><label>종료일</label><input type="date" id="rgTo" value="${init.to||""}"><button type="button" class="mini" id="rgNone" title="종료일을 비워서 그 하루만 보이게 해요">하루만</button></div>
    <div class="row" style="gap:6px;flex-wrap:wrap;margin:8px 0">${[["오늘만",t,""],["7일간",t,in7],["이번 주 (~일요일)",t,eow],["이번 달 (~말일)",t,eom]].map(([l,f,e])=>`<button type="button" class="mini" data-rp="${f}|${e}">${l}</button>`).join("")}</div>
    <div class="meta">시작일부터 종료일까지 <b>매일의 보드</b>에 이 포스트잇이 계속 보여요. 같은 포스트잇 하나라서, 한 날에서 글을 고치거나 옮기거나 지우면 다른 날에도 똑같이 바뀌어요.</div></div>`;
  const pr=wdlg({title,body,ok:"적용",collect:()=>({from:$("#rgFrom").value,to:$("#rgTo").value})});
  document.querySelectorAll("#wdlg [data-rp]").forEach(b=>b.onclick=()=>{const [f,e]=b.dataset.rp.split("|");$("#rgFrom").value=f;$("#rgTo").value=e});
  $("#rgNone").onclick=()=>{$("#rgTo").value=""};
  const r=await pr;if(!r)return null;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(r.from)){toast("시작일을 골라 주세요",2500);return null}
  if(r.to&&r.to<r.from){toast("종료일이 시작일보다 빨라요",3000);return null}
  return r;
}
async function newSticky(opts={}){
  const target=opts.from||todayStr();
  if(nav!=="memo"){memoDay=target;setNav("memo");await memoReady}      // 어느 화면에서든: 메모 화면의 오늘(또는 시작일) 보드로 이동한 뒤 만든다
  else if(memoDay!==target){memoDay=target;await renderMemo()}
  const W=Math.min(230,viewW()-24),H=Math.min(200,viewH()-24),cols=Object.keys(STK),
    pos=opts.at?{x:opts.at.x-W/2,y:opts.at.y-18,free:true}:freeSpot(W,H,memoList);   // 더블클릭한 자리 / 보드 어디든 무작위, 가능하면 겹치지 않는 자리
  const sn={id:null,day:memoDay,until:opts.to&&opts.to>memoDay?opts.to:"",text:"",color:cols[Math.floor(Math.random()*cols.length)],x:pos.x,y:pos.y,w:W,h:H,z:++memoZ,pinned:0};
  if(opts.at)clampSn(sn);     // 보드 밖으로 나가지 않게
  memoList.push(sn);if(!pos.free)toast("보드가 가득 찼어요 — 겹쳐서 붙였어요. 정리(정렬)하거나 안 쓰는 메모를 지워 주세요",4200);
  await stkSave(sn,true);                     // 먼저 만들어 id 를 받는다 (빈 칸으로 새로 고침해도 남는다)
  memoDays=await api("/api/sticky/days").catch(()=>memoDays);drawMemo();
  const el=$("#cork").querySelector(`.stk[data-id="${sn.id}"]`)||[...document.querySelectorAll("#cork .stk")].pop();
  const tb=el&&el.querySelector(".tb");if(tb){tb.focus();el.scrollIntoView({block:"nearest",behavior:"smooth"})}
}
/* ---- 달력 · 검색 · 내보내기 ---- */
async function toggleCal(){
  memoCal.open=!memoCal.open;
  if(memoCal.open){
    const [y,m]=memoDay.split("-");memoCal.y=+y;memoCal.m=+m-1;
    try{memoCal.map=new Map((await api("/api/sticky/days?limit=3000")).map(d=>[d.day,d.count]))}catch(e){}
  }
  drawCal();
}
function drawCal(){
  const box=$("#mCal");if(!box)return;
  if(!memoCal.open){box.innerHTML="";box.style.display="none";return}
  const {y,m}=memoCal,first=new Date(y,m,1),last=new Date(y,m+1,0).getDate(),t=todayStr();
  const cells=[];for(let i=0;i<first.getDay();i++)cells.push("<i></i>");
  for(let d=1;d<=last;d++){const ds=`${y}-${z(m+1)}-${z(d)}`,c=memoCal.map.get(ds)||0;
    cells.push(`<button type="button" class="cal-d ${c?"has":""} ${ds===t?"today":""} ${ds===memoDay?"sel":""}" data-cd="${ds}" title="${c?c+"개":"메모 없음"}">${d}${c?`<small>${c}</small>`:""}</button>`)}
  box.style.display="block";
  box.innerHTML=`<div class="cal-h"><button type="button" data-cm="-1">◀</button><b>${y}년 ${m+1}월</b><button type="button" data-cm="1">▶</button><span class="sp"></span><button type="button" data-cm="0">이번 달</button><button type="button" data-cm="x" title="닫기">✕</button></div>
    <div class="cal-w">${WD2.map(w=>`<span>${w}</span>`).join("")}</div><div class="cal-g">${cells.join("")}</div>`;
  box.querySelectorAll("[data-cm]").forEach(b=>b.onclick=()=>{
    const k=b.dataset.cm;if(k==="x"){memoCal.open=false;drawCal();return}
    if(k==="0"){const n=new Date();memoCal.y=n.getFullYear();memoCal.m=n.getMonth()}
    else{const d=new Date(memoCal.y,memoCal.m+ +k,1);memoCal.y=d.getFullYear();memoCal.m=d.getMonth()}
    drawCal()});
  box.querySelectorAll("[data-cd]").forEach(b=>b.onclick=()=>gotoMemo(b.dataset.cd));
}
/* ---- 📌 고정 모아보기: 날짜와 상관없이 고정(📌)한 포스트잇을 한 곳에서 본다 (최근 날짜 순). 그 날 보드로 이동하거나 고정을 풀 수 있다 ---- */
let memoPins=[],memoPinsOpen=false;
async function loadPins(){try{memoPins=await api("/api/sticky/pinned")}catch(e){}const n=$("#mPinN"),n2=$("#mPinN2");if(n)n.textContent=memoPins.length;if(n2)n2.textContent=memoPins.length}
async function drawPins(noload){
  const box=$("#mPins");if(!box)return;
  const b=$("#mPinBtn"),b2=$("#mPinBtn2");if(b)b.classList.toggle("on",memoPinsOpen);if(b2)b2.classList.toggle("on",memoPinsOpen);
  if(!memoPinsOpen){box.innerHTML="";return}
  if(!noload)await loadPins();
  const body=t=>{t=t||"";return t.trim()?(hasChk(t)?chkHtml(t):renderMd(t)):`<span class="meta">(빈 메모)</span>`};
  box.innerHTML=`<div class="memo-pins"><div class="mp-h"><b>📌 고정한 포스트잇</b><span class="meta">${memoPins.length}개 · 날짜와 상관없이 모아 봐요 · 최근 날짜 순</span><span class="sp"></span><button type="button" class="mini" id="mPinX">닫기</button></div>
    <div class="mp-g">${memoPins.map(r=>`<div class="pincard" style="--sc:${STK[r.color]||STK.yellow}" data-pid="${r.id}"><div class="pc-h"><b>${r.day}</b>${r.until?`<span class="stk-until" title="노출 기간 ${r.day} ~ ${r.until}">~${r.until.slice(5)}</span>`:""}<span class="sp"></span><button type="button" data-pgo="${r.day}" title="그 날 보드로 이동">이 날 보드로</button><button type="button" data-pun="${r.id}" title="고정을 풀어요 (포스트잇은 그대로 남아요)">고정 해제</button></div><div class="pc-b">${body(r.text)}</div></div>`).join("")
      ||`<div class="meta" style="padding:8px 2px">고정한 포스트잇이 없어요. 포스트잇 위쪽의 📌 를 누르면 여기에 모여요.</div>`}</div></div>`;
  $("#mPinX").onclick=()=>{memoPinsOpen=false;drawPins()};
  box.querySelectorAll("[data-pgo]").forEach(x=>x.onclick=()=>{memoPinsOpen=false;gotoMemo(x.dataset.pgo)});
  box.querySelectorAll("[data-pun]").forEach(x=>x.onclick=async()=>{
    const row=memoPins.find(r=>r.id===+x.dataset.pun);if(!row)return;
    await stkSave({...row,pinned:0},true);
    if(memoList.some(m=>m.id===row.id)){await loadMemo();drawMemo()}      // 지금 보는 보드에 있으면 그 보드도 갱신
    await loadPins();drawPins(true);toast("고정을 풀었어요",1600);
  });
}
async function memoSearch(q){
  const box=$("#mSearch");if(!box)return;
  if(!q){box.innerHTML="";return}
  let rows=[];try{rows=await api("/api/sticky/search?q="+encodeURIComponent(q))}catch(e){box.innerHTML=`<div class="meta">검색하지 못했어요: ${esc(e.message)}</div>`;return}
  box.innerHTML=`<div class="memo-sr"><div class="meta">‘${esc(q)}’ — ${rows.length}개${rows.length>=100?" (최대 100개)":""} · 눌러서 그 날 보드로</div>${rows.map(r=>`<a class="sr-row" data-sd="${r.day}"><b>${r.day}</b><span>${esc((r.text||"").replace(/\s+/g," ").slice(0,120))}</span></a>`).join("")||`<span class="meta">없어요</span>`}</div>`;
  box.querySelectorAll("[data-sd]").forEach(a=>a.onclick=()=>{$("#mQ").value="";gotoMemo(a.dataset.sd)});
}
async function exportMemo(){
  const t=todayStr();
  const v=await wdlg({title:"메모 내보내기",ok:"내보내기",cancel:"취소",
    collect:()=>({f:$("#exF").value,t:$("#exT").value,k:$("#exK").value}),
    body:`<div class="frow"><label>시작</label><input type="date" id="exF" value="${shiftDay(t,-30)}"></div><div class="frow"><label>끝</label><input type="date" id="exT" value="${t}"></div>
      <div class="frow"><label>형식</label><select id="exK"><option value="md">마크다운 (.md)</option><option value="txt">텍스트 (.txt)</option></select></div>
      <div class="meta">이 기간의 포스트잇을 날짜별로 한 파일에 담아요. (📌 고정한 것은 날짜 안에서 먼저)</div>`});
  if(!v||!v.f||!v.t)return;
  let rows;try{rows=await api(`/api/sticky/range?from=${v.f}&to=${v.t}`)}catch(e){toast("내보내지 못했어요: "+e.message,5000);return}
  rows=rows.filter(r=>(r.text||"").trim());   // 빈 포스트잇은 내보내지 않는다
  if(!rows.length){toast("이 기간에는 내용이 있는 포스트잇이 없어요",2500);return}
  const md=v.k==="md",byDay=new Map();rows.forEach(r=>{(byDay.get(r.day)||byDay.set(r.day,[]).get(r.day)).push(r)});
  const out=[md?`# 메모 ${v.f} ~ ${v.t}`:`메모 ${v.f} ~ ${v.t}`,""];
  for(const [day,list] of byDay){
    out.push(md?`## ${dayLabel(day)}`:`[${dayLabel(day)}]`,"");
    list.forEach(r=>{
      const lines=((r.pinned?"📌 ":"")+(r.text||"(빈 메모)")).split("\n");
      if(md)lines.forEach((ln,i)=>out.push((i?"  ":"- ")+ln));else{out.push(...lines,"---")}
      if(md)out.push("");
    });
    out.push("");
  }
  const name=`메모-${v.f}_${v.t}.${md?"md":"txt"}`,a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob(["\uFEFF"+out.join("\r\n")],{type:"text/plain;charset=utf-8"}));a.download=name;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  toast(`${name} 저장했어요 (${rows.length}개)`,3200);
}
window.addEventListener("keydown",e=>{   // window 의 '캡처' 단계: 편집기·입력칸이 키를 먼저 가져가도 새 포스트잇 단축키는 놓치지 않는다
  if($("#wdlg.show")||$("#modal").classList.contains("show")||$("#setup.show"))return;
  const code=e.code==="KeyN"||(e.key||"").toLowerCase()==="n";
  const ctrlN=code&&(e.ctrlKey||e.metaKey)&&!e.altKey&&!e.shiftKey,altN=e.code==="KeyN"&&e.altKey&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey;
  if(ctrlN||altN){e.preventDefault();e.stopPropagation();newSticky();return}
  if(nav==="memo"&&view==="memo"&&e.altKey&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey){      // 메모 배치 단축키 (글을 쓰는 중에도)
    const m={KeyR:"random",KeyS:"spread",KeyD:"spread",KeyT:"grid"}[e.code];      // Alt+S 를 다른 프로그램이 가로채는 PC 를 위해 Alt+D 도 스프레드
    if(m){e.preventDefault();e.stopPropagation();arrangeMemo(m);return}
  }
  if(nav==="memo"&&e.key==="Escape"&&memoCal.open){memoCal.open=false;drawCal();return}
  if(nav==="memo"&&e.code==="KeyN"&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!isTyping()){e.preventDefault();newSticky()}   // 보조 키: 입력 중이 아닐 때 N
},true);
