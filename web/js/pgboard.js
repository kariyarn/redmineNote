/* ---------- 진행 기록 보드 (2.23): 진행 기록 한 건 = 포스트잇 한 장, 일감 하나 = 보드 한 장 ----------
   메모 보드와 같은 손맛: 끌어서 옮기기 · 크기 바꾸기 · 색 · 📌 고정 · 체크 줄 · 빈 곳을 더블클릭/끌어서 새로 · 정렬/스프레드/랜덤 · 삭제 뒤 되돌리기.
   노트 화면에는 목록 그대로 두고, '📌 보드로 보기'를 누르면 팝업으로 뜬다 (Esc · 바깥 누르기 · 다른 노트로 가면 닫힌다).
   메모 보드와 다른 점: 폭은 팝업에 맞추고 아래로는 놓인 만큼 늘어난다(기록은 계속 쌓이므로).
   자리 · 크기 · 색 · 고정은 progress 표에 따로(/api/progress/layout) 저장해서, 옮기기만 해서는 '수정됨'이 되지 않는다.
   아직 자리가 없는 기록(예전 기록)은 처음 볼 때 날짜순으로 놓고 그 자리를 저장한다. */
const PGB={w:230,h:170,minH:420,gap:22};
let pgbZ=1,pgbNew=null;      // pgbNew: 보드에서 막 만든, 아직 글이 없어 저장하지 않은 포스트잇 (글을 쓰면 그때 저장)
const pgbQ=new Map(),pgbDeb=new Map();
const pgbBoard=()=>$("#pgcork");
const pgbW=()=>Math.max(320,(pgbBoard()||{}).clientWidth||700);
const pgbItems=n=>[...(n._pg||[]),...(pgbNew&&pgbNew.issue_id===n.issue_id?[pgbNew]:[])];
const pgbH=list=>Math.max(PGB.minH,...list.filter(p=>p.x!=null).map(p=>p.y+p.h+40));
const pgbColor=(n,p)=>{   // 색을 안 고른 기록은 날짜마다 같은 색 (이 일감의 날짜 순서대로 돌아가며 칠해서, 이웃한 날짜는 색이 다르다)
  if(STK[p.color])return p.color;
  const ks=Object.keys(STK),days=[...new Set([...(n._pg||[]).map(x=>x.day),p.day])].sort();return ks[days.indexOf(p.day)%ks.length];
};
const pgbClamp=p=>{const bw=pgbW();p.w=Math.max(STK_MIN.w,Math.min(p.w,bw-16));p.h=Math.max(STK_MIN.h,p.h);p.x=Math.max(0,Math.min(Math.round(p.x),bw-p.w));p.y=Math.max(0,Math.round(p.y))};
const pgbLayBody=p=>({id:p.id,x:p.x,y:p.y,w:p.w,h:p.h,z:p.z||0,color:p.color||"",pinned:p.pinned?1:0});
function pgbQueue(p,fn){const run=(pgbQ.get(p)||Promise.resolve()).catch(()=>{}).then(fn);pgbQ.set(p,run);return run}
function pgbLay(p){   // 자리만 저장 (아직 저장 안 한 새 포스트잇은 글을 쓸 때 자리까지 함께 저장)
  if(!p.id&&p!==pgbNew)return;
  return pgbQueue(p,async()=>{if(!p.id)return;try{await post("/api/progress/layout",pgbLayBody(p))}catch(e){toast("보드 자리를 저장하지 못했어요: "+e.message,5000)}});
}
function pgbSave(n,p){   // 글 저장: 처음이면 새 기록으로 만들고, 아니면 글만 고친다. 빈 글은 저장하지 않는다 (진행 기록은 글이 있어야 한다)
  return pgbQueue(p,async()=>{
    const text=(p.text||"").trim();if(!text)return;
    try{
      if(p.id){await post("/api/progress",{id:p.id,issue_id:n.issue_id,day:p.day,text});p.updated_at=`${todayStr()} ${hhmm()}`;prep(n);return}
      const r=await post("/api/progress",{issue_id:n.issue_id,day:p.day,text,...pgbLayBody(p)});
      p.id=r.id;p.created_at=p.updated_at=`${todayStr()} ${hhmm()}`;
      if(pgbNew===p)pgbNew=null;
      if(!pgBy.has(n.issue_id))pgBy.set(n.issue_id,[]);
      pgBy.get(n.issue_id).push(p);pgBy.get(n.issue_id).sort((x,y)=>y.day.localeCompare(x.day)||x.id-y.id);
      prep(n);buildTokens();pgbCount(n);wireRec(n);renderTabs();renderList();
      const el=document.querySelector(`#pgcork .stk[data-pgb="new"]`);if(el)el.dataset.pgb=p.id;
      if(n.rec_mode!=="record")await setRec(n,"record",true);                  // 진행 기록을 썼으면 '기록' 모드로 (목록의 기록 추가와 같다)
    }catch(e){toast("진행 기록을 저장하지 못했어요: "+e.message,6000)}
  });
}
function pgbLater(n,p){clearTimeout(pgbDeb.get(p));pgbDeb.set(p,setTimeout(()=>pgbSave(n,p),500))}
function pgbFlush(n){   // 보드를 닫을 때: 기다리던 저장을 바로
  pgbDeb.forEach((t,p)=>{clearTimeout(t);pgbSave(n,p)});pgbDeb.clear();
  if(pgbNew&&!(pgbNew.text||"").trim())pgbNew=null;
}
function pgbCount(n){const c=$("#pgbcnt");if(c){const a=n._pg||[];c.textContent=`${a.length}건 · ${new Set(a.map(p=>p.day)).size}일`}refreshJumpPg(n)}
/* 날짜순으로 왼쪽 위부터 차례로 (고정한 것 · 이미 놓인 것은 피한다). 보드는 아래로 늘어나므로 자리가 모자랄 일은 없다 */
function pgbFlow(list,avoid){
  const cw=pgbW()-16,hit=(x,y,w,h)=>avoid.some(o=>overlapOf(x,y,w,h,o)>0);let x=14,y=20,rowH=0;
  for(const p of list){
    for(let g=0;g<5000;g++){
      if(x>14&&x+p.w>cw){x=14;y+=rowH+PGB.gap;rowH=0}
      if(!hit(x,y,p.w,p.h)){p.x=x;p.y=y;avoid.push(p);x+=p.w+PGB.gap;rowH=Math.max(rowH,p.h);break}
      x+=40;
    }
  }
}
const pgbOrder=(a,b)=>a.day.localeCompare(b.day)||(a.id||1e12)-(b.id||1e12);
function pgbPlaceNew(n){   // 아직 자리가 없는 기록 → 날짜순으로 놓고 저장
  const list=pgbItems(n),todo=list.filter(p=>p.x==null).sort(pgbOrder);if(!todo.length)return;
  todo.forEach(p=>{p.w=PGB.w;p.h=PGB.h});
  pgbFlow(todo,list.filter(p=>p.x!=null));
  todo.forEach(p=>{p.z=p.z||++pgbZ;pgbLay(p)});
}
function pgbHtml(n){
  return `<div class="pgbbox" role="dialog" aria-modal="true" aria-label="진행 기록 보드">
    <div class="pgbhd"><b>📌 진행 기록 보드</b><span class="meta pgbsub">#${n.issue_id} ${esc(n.subject||"")}</span><span class="meta" id="pgbcnt"></span><span class="sp"></span>
      <label class="meta pgbdl" title="새 포스트잇(＋ · 더블클릭 · 끌어서 그리기)에 붙일 날짜">새 기록 날짜 <input type="date" id="pgbDay" value="${todayStr()}"></label>
      <div class="seg" id="pgbArr" title="한 번에 배치를 바꿔요 (겹치지 않게, 📌 고정한 것은 그대로)"><button type="button" data-pgarr="grid" title="날짜순으로 왼쪽 위부터 차례로">정렬</button><button type="button" data-pgarr="spread" title="보드에 고르게 펼치기">스프레드</button><button type="button" data-pgarr="random" title="무작위로 흩뿌리기">랜덤</button></div>
      <button type="button" class="mini primary" id="pgbNewBtn" title="새 포스트잇 (빈 보드를 더블클릭하거나 끌어서 그려도 돼요)">＋ 새 포스트잇</button>
      <button type="button" class="mini" id="pgbClose" title="닫기 (Esc · 바깥을 눌러도 닫혀요)">✕</button></div>
    <div class="pgbbody" id="pgbBody"><div class="cork pgcork b-${memoBoard()}" id="pgcork"><div class="cork-empty" id="pgbEmpty" hidden><b>아직 진행 기록이 없어요</b>빈 곳을 <b>더블클릭</b>하거나 <b>끌어서</b> 크기를 그리면 포스트잇이 생겨요.</div></div></div></div>`;
}
function pgbDraw(n){
  const b=pgbBoard();if(!b)return;
  b.querySelectorAll(".stk").forEach(e=>e.remove());
  const list=pgbItems(n);pgbZ=Math.max(1,...list.map(p=>p.z||1));
  pgbPlaceNew(n);
  list.forEach(p=>{pgbClamp(p);b.appendChild(pgbMk(n,p))});
  $("#pgbEmpty").hidden=list.length>0;
  pgbFit(n);pgbCount(n);
}
function pgbFit(n){const b=pgbBoard(),bd=$("#pgbBody");if(b)b.style.height=Math.max(pgbH(pgbItems(n)),(bd?bd.clientHeight:0)-24)+"px"}
/* 보드는 팝업으로만 연다. 계속 떠 있지 않고 Esc · 바깥 누르기 · ✕ · 다른 노트/화면으로 가면 닫힌다. 닫을 때 노트의 진행 기록 목록을 다시 그린다 */
let pgbOn=null;      // {n, t: 노트가 바뀌었는지 보는 타이머}
function pgbOpen(n){
  pgbClose();
  const pop=document.createElement("div");pop.id="pgbpop";pop.innerHTML=pgbHtml(n);document.body.appendChild(pop);
  pgbOn={n,t:setInterval(()=>{if(view!=="note"||cur!==n.issue_id||!document.body.contains(pop))pgbClose()},300)};
  const b=pgbBoard();applyBoardColor(b);pgbDraw(n);
  const day=()=>{const v=$("#pgbDay").value;return /^\d{4}-\d{2}-\d{2}$/.test(v||"")?v:todayStr()};
  $("#pgbNewBtn").onclick=()=>pgbCreate(n,{day:day()});
  $("#pgbClose").onclick=()=>pgbClose();
  pop.addEventListener("pointerdown",e=>{if(e.target===pop)pgbClose()});      // 바깥(어두운 곳)을 누르면 닫힌다
  document.querySelectorAll("#pgbArr [data-pgarr]").forEach(x=>x.onclick=()=>pgbArrange(n,x.dataset.pgarr));
  b.addEventListener("dblclick",e=>{   // 빈 보드를 더블클릭하면 그 자리에 새 포스트잇
    if(e.target!==b)return;e.preventDefault();const r=b.getBoundingClientRect();
    pgbCreate(n,{day:day(),at:{x:e.clientX-r.left,y:e.clientY-r.top}});
  });
  b.addEventListener("pointerdown",e=>{   // 빈 보드를 끌면 끈 크기만큼 새 포스트잇 (편집 중일 때는 누르기만 해도 편집이 끝나야 하니 제외)
    if(e.button!==0||e.target!==b)return;
    const a=document.activeElement;if(a&&a!==document.body&&(a.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)))return;
    e.preventDefault();
    const r=b.getBoundingClientRect(),sx=e.clientX-r.left,sy=e.clientY-r.top;let box=null,rc=null;
    const mv=ev=>{
      const x=Math.max(0,Math.min(r.width,ev.clientX-r.left)),y=Math.max(0,Math.min(r.height,ev.clientY-r.top));
      rc={x:Math.min(sx,x),y:Math.min(sy,y),w:Math.abs(x-sx),h:Math.abs(y-sy)};
      if(!box){if(rc.w<8&&rc.h<8)return;box=document.createElement("div");box.className="cork-sel";b.appendChild(box)}
      Object.assign(box.style,{left:rc.x+"px",top:rc.y+"px",width:rc.w+"px",height:rc.h+"px"});
      box.classList.toggle("small",rc.w<STK_MIN.w||rc.h<STK_MIN.h);
    };
    const up=()=>{
      document.removeEventListener("pointermove",mv);document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",up);
      if(!box)return;box.remove();
      if(rc.w>=40&&rc.h>=30)pgbCreate(n,{day:day(),rect:rc});
    };
    document.addEventListener("pointermove",mv);document.addEventListener("pointerup",up);document.addEventListener("pointercancel",up);
  });
  $("#pgbNewBtn").focus();
}
function pgbClose(){
  if(!pgbOn)return;const {n,t}=pgbOn;pgbOn=null;clearInterval(t);
  pgbFlush(n);const pop=$("#pgbpop");if(pop)pop.remove();
  Promise.all([...pgbQ.values()]).catch(()=>{}).then(()=>{if(cur===n.issue_id)pgRefresh(n)});      // 보드에서 쓴 것까지 저장된 뒤 목록을 다시 그린다
}
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&pgbOn&&!e.isComposing&&!($("#wdlg")&&$("#wdlg").classList.contains("show"))){e.preventDefault();pgbClose()}});   // 포스트잇 편집 중의 Esc 는 편집만 끝낸다 (포스트잇이 먼저 받아서 멈춘다)
window.addEventListener("resize",()=>{if(pgbOn)pgbDraw(pgbOn.n)});
function pgbCreate(n,o){
  if(pgbNew&&pgbNew.issue_id===n.issue_id&&!(pgbNew.text||"").trim()){   // 아직 비어 있는 새 포스트잇이 있으면 그것을 옮겨서 쓴다 (빈 것이 쌓이지 않게)
    const el=document.querySelector('#pgcork .stk[data-pgb="new"]');if(el)el.remove();
  }
  const rc=o.rect,W=rc?Math.max(STK_MIN.w,Math.round(rc.w)):PGB.w,H=rc?Math.max(STK_MIN.h,Math.round(rc.h)):PGB.h;
  const others=pgbItems(n).filter(p=>p!==pgbNew&&p.x!=null);
  const pos=rc?{x:rc.x,y:rc.y}:o.at?{x:o.at.x-W/2,y:o.at.y-18}:freeSpot(W,H,others,pgbW(),pgbH(others));
  const p={id:null,issue_id:n.issue_id,day:o.day,text:"",color:"",x:pos.x,y:pos.y,w:W,h:H,z:++pgbZ,pinned:0};
  pgbClamp(p);pgbNew=p;
  const el=pgbMk(n,p);pgbBoard().appendChild(el);$("#pgbEmpty").hidden=true;pgbFit(n);
  const tb=el.querySelector(".tb");if(tb){tb.focus();el.scrollIntoView({block:"nearest",behavior:"smooth"})}
}
const pgbDayLabel=d=>`${d.slice(5)} · ${relDay(d)}`;
function pgbMk(n,p){
  const el=document.createElement("div");el.className="stk"+(p.pinned?" pinned":"");el.dataset.pgb=p.id||"new";
  const place=()=>{el.style.left=p.x+"px";el.style.top=p.y+"px";el.style.width=p.w+"px";el.style.height=p.h+"px";
    el.style.zIndex=(p.pinned?100000:0)+(p.z||1);el.style.setProperty("--sc",STK[pgbColor(n,p)])};
  el.innerHTML=`<div class="stk-h"><span class="stk-grab" title="잡고 끌어서 옮기기">⠿</span><span class="stk-until pgb-day" data-a="day" title="${p.day} · 눌러서 날짜 바꾸기${p.updated_at&&p.created_at&&p.updated_at!==p.created_at?" · 수정됨":""}">${pgbDayLabel(p.day)}</span>
      <span class="stk-colors">${Object.keys(STK).map(k=>`<i data-c="${k}" style="background:${STK[k]}" title="색 바꾸기"></i>`).join("")}</span><span class="sp"></span>
      <button type="button" data-a="col" class="colb" title="색 바꾸기 (누르면 이 줄에서 색을 골라요)">🎨</button>
      <button type="button" data-a="chk" title="체크 항목 추가 ([ ] 로 시작하는 줄이 체크박스가 돼요)">☑</button>
      <button type="button" data-a="pin" class="pinb" title="고정 (맨 위에 두고, 자동 배치에서 움직이지 않아요)">📌</button>
      <button type="button" data-a="del" title="삭제 (바로 되돌릴 수 있어요)">✕</button></div>
    <div class="stk-v" hidden></div><div class="rte stk-t" data-ph="이 날 어디까지 했는지"></div><div class="stk-rs" title="끌어서 크기 바꾸기"></div>`;
  place();el._place=place;
  const ed=el.querySelector(".stk-t"),vw=el.querySelector(".stk-v");edInit(ed,p.text);
  const showView=()=>{if(hasChk(p.text)){vw.innerHTML=chkHtml(p.text);vw.hidden=false;ed.hidden=true}else{vw.hidden=true;ed.hidden=false}};
  const showEdit=()=>{vw.hidden=true;ed.hidden=false;const tb=ed.querySelector(".tb:last-of-type")||ed.lastElementChild;if(tb&&tb.focus){tb.focus();const g=getSelection();g.selectAllChildren(tb);g.collapseToEnd()}};
  showView();
  vw.addEventListener("click",e=>{
    const cb=e.target.closest("input[type=checkbox]");
    if(cb){p.text=toggleChk(p.text,+cb.dataset.k);edInit(ed,p.text);vw.innerHTML=chkHtml(p.text);pgbLater(n,p);return}
    if(e.target.closest(".cbw"))return;showEdit();
  });
  el.addEventListener("focusout",e=>{if(el.contains(e.relatedTarget))return;setTimeout(()=>{
    if(el.contains(document.activeElement))return;
    if(p===pgbNew&&!(p.text||"").trim()){pgbNew=null;el.remove();$("#pgbEmpty").hidden=pgbItems(n).length>0;pgbFit(n);return}   // 아무것도 안 쓰고 나가면 만들지 않는다
    showView()},0)});
  ed.addEventListener("input",()=>{p.text=edGet(ed);pgbLater(n,p)});
  el.addEventListener("keydown",e=>{   // Ctrl+Enter 또는 Esc: 편집을 끝내고 바로 저장
    const enter=e.key==="Enter"&&(e.ctrlKey||e.metaKey),esc=e.key==="Escape"&&!e.isComposing;
    if(!enter&&!esc)return;
    e.preventDefault();e.stopPropagation();
    clearTimeout(pgbDeb.get(p));p.text=edGet(ed);
    if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();
    if(!(p.text||"").trim())return;
    showView();pgbSave(n,p).then(()=>{el.classList.remove("saved");void el.offsetWidth;el.classList.add("saved")});
  },true);
  const front=()=>{if(p.z<pgbZ||el.style.zIndex!=String((p.pinned?100000:0)+pgbZ)){p.z=++pgbZ;place();pgbLay(p)}};
  el.addEventListener("pointerdown",front);
  const live=()=>{place();pgbFit(n)};      // 아래로 끌면 보드도 따라서 늘어난다
  const drag=(handle,onMove)=>{
    handle.addEventListener("pointerdown",e=>{
      if(e.target.closest("button,i,[data-a]"))return;e.preventDefault();
      const sx=e.clientX,sy=e.clientY,o={x:p.x,y:p.y,w:p.w,h:p.h};
      const mv=ev=>{onMove(o,ev.clientX-sx,ev.clientY-sy);live()};
      const up=()=>{document.removeEventListener("pointermove",mv);document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",up);pgbLay(p)};
      document.addEventListener("pointermove",mv);document.addEventListener("pointerup",up);document.addEventListener("pointercancel",up);
    });
  };
  drag(el.querySelector(".stk-h"),(o,dx,dy)=>{p.x=o.x+dx;p.y=o.y+dy;pgbClamp(p)});
  el.addEventListener("pointerdown",e=>{   // 편집 중이 아닌 포스트잇은 어디를 잡아도 끌어서 옮긴다 (끌지 않고 그냥 누르면 편집이 시작된다)
    if(e.button!==0||e.target.closest(".stk-h,.stk-rs,button,i,input,a"))return;
    if(ed.contains(document.activeElement))return;
    const intoEd=!!e.target.closest(".stk-t");
    e.preventDefault();
    const sx=e.clientX,sy=e.clientY,o={x:p.x,y:p.y};let moved=false;
    const mv=ev=>{const dx=ev.clientX-sx,dy=ev.clientY-sy;if(!moved&&Math.hypot(dx,dy)<5)return;moved=true;el.classList.add("moving");p.x=o.x+dx;p.y=o.y+dy;pgbClamp(p);live()};
    const up=()=>{
      document.removeEventListener("pointermove",mv);document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",up);el.classList.remove("moving");
      if(moved){const stop=ev=>{ev.stopPropagation();ev.preventDefault()};el.addEventListener("click",stop,{capture:true,once:true});setTimeout(()=>el.removeEventListener("click",stop,true),0);pgbLay(p)}
      else if(intoEd&&!ed.hidden)showEdit();};
    document.addEventListener("pointermove",mv);document.addEventListener("pointerup",up);document.addEventListener("pointercancel",up);
  });
  drag(el.querySelector(".stk-rs"),(o,dx,dy)=>{p.w=Math.max(STK_MIN.w,Math.min(pgbW()-p.x-8,Math.round(o.w+dx)));p.h=Math.max(STK_MIN.h,Math.round(o.h+dy))});
  el.querySelectorAll(".stk-colors i").forEach(i=>i.onclick=()=>{p.color=i.dataset.c;place();pgbLay(p);el.classList.remove("pick")});
  el.querySelector('[data-a="col"]').onclick=e=>{e.stopPropagation();el.classList.toggle("pick")};
  el.querySelector('[data-a="pin"]').onclick=()=>{p.pinned=p.pinned?0:1;el.classList.toggle("pinned",!!p.pinned);place();pgbLay(p);toast(p.pinned?"📌 고정했어요 (맨 위 · 자동 배치에서 제외)":"고정을 풀었어요",1800)};
  el.querySelector('[data-a="chk"]').onclick=()=>{showEdit();document.execCommand("insertText",false,(edGet(ed).trim()?"\n":"")+"[ ] ");p.text=edGet(ed);pgbLater(n,p)};
  el.querySelector('[data-a="day"]').onclick=async()=>{
    const d=await wdlg({title:"진행 기록 날짜",body:`<div class="rngd"><div class="frow"><label>날짜</label><input type="date" id="pgbDayIn" value="${p.day}"></div></div>`,ok:"바꾸기",collect:()=>$("#pgbDayIn").value});
    if(!d||!/^\d{4}-\d{2}-\d{2}$/.test(d)||d===p.day)return;
    clearTimeout(pgbDeb.get(p));p.day=d;
    const t=el.querySelector(".pgb-day");t.textContent=pgbDayLabel(d);place();
    if(p.id){await pgbSave(n,p);loadProgress().then(()=>{prep(n);buildTokens()})}
  };
  el.querySelector('[data-a="del"]').onclick=async()=>{   // 내용이 있으면 확인 창 한 번 + 삭제 뒤 '되돌리기' (6초)
    if(!p.id){pgbNew=null;el.remove();$("#pgbEmpty").hidden=pgbItems(n).length>0;pgbFit(n);return}
    const pv=p.text.replace(/\s+/g," ").trim().slice(0,60);
    if(!await askC(`이 진행 기록을 삭제할까요?\n\n“${pv}${p.text.trim().length>60?"…":""}”`,{title:"진행 기록 삭제",ok:"삭제"}))return;
    clearTimeout(pgbDeb.get(p));pgbDeb.delete(p);
    const snap={...p};
    try{await api("/api/progress/"+p.id,{method:"DELETE"})}catch(e){toast("삭제하지 못했어요: "+e.message,5000);return}
    await pgRefresh(n);pgbDraw(n);
    toastUndo("진행 기록을 삭제했어요",async()=>{
      try{await post("/api/progress",{issue_id:n.issue_id,day:snap.day,text:snap.text,...pgbLayBody(snap),id:null})}catch(e){toast("되돌리지 못했어요: "+e.message,5000);return}
      await pgRefresh(n);pgbDraw(n)},6000);
  };
  return el;
}
/* 자동 배치: 정렬(날짜순) · 스프레드(고르게) · 랜덤. 📌 고정한 것은 그대로 두고 피한다. 결과는 모두 저장한다 */
function pgbArrange(n,mode){
  const L=pgbItems(n).filter(p=>p!==pgbNew);if(L.length<2){toast("포스트잇이 2개 이상일 때 쓸 수 있어요",2200);return}
  const fixed=L.filter(p=>p.pinned),mov=L.filter(p=>!p.pinned);
  if(!mov.length){toast("모두 📌 고정이라 옮길 게 없어요",2200);return}
  if(mode==="grid")pgbFlow([...mov].sort(pgbOrder),[...fixed]);
  else{
    const cw=pgbW()-16,maxW=Math.max(...mov.map(p=>p.w)),maxH=Math.max(...mov.map(p=>p.h)),cnt=mov.length;
    const cols=Math.max(1,Math.min(cnt,Math.floor(cw/(maxW+10)))),rows=Math.ceil(cnt/cols),ch=Math.max(pgbH(fixed)-40,rows*(maxH+PGB.gap+30)),placed=[...fixed],late=[];
    const spot=p=>{const s=freeSpot(p.w,p.h,placed,cw+16,ch);if(!s.free){late.push(p);return}p.x=s.x;p.y=s.y;placed.push(p)};   // 빈 곳이 없으면 겹치지 않게 맨 아래에 이어 붙인다
    if(mode==="random")shuffled(mov).forEach(spot);
    else{
      const cellW=cw/cols,cellH=ch/rows;
      [...mov].sort(pgbOrder).forEach((p,i)=>{
        const sx=Math.max(0,cellW-p.w),sy=Math.max(0,cellH-p.h);
        let x=Math.max(8,Math.round((i%cols)*cellW+sx/2+(Math.random()-.5)*Math.min(sx,40))),y=Math.max(8,Math.round(Math.floor(i/cols)*cellH+sy/2+(Math.random()-.5)*Math.min(sy,40)));
        if(placed.some(o=>overlapOf(x,y,p.w,p.h,o)>0)){spot(p);return}
        p.x=x;p.y=y;placed.push(p);
      });
    }
    if(late.length){const y0=Math.max(...placed.map(o=>o.y+o.h))+PGB.gap;pgbFlow(late,[...placed,{x:0,y:0,w:cw+16,h:y0}])}
  }
  const b=pgbBoard();b.classList.add("arr");
  mov.forEach(p=>{pgbClamp(p);const el=b.querySelector(`.stk[data-pgb="${p.id}"]`);if(el&&el._place)el._place();pgbLay(p)});pgbFit(n);
  setTimeout(()=>b.classList.remove("arr"),600);
  toast({grid:"날짜순으로 정렬했어요",spread:"보드에 고르게 펼쳤어요",random:"무작위로 흩뿌렸어요"}[mode]+" ✓",1800);
}
