/* ---------- 할 일 체크리스트: 오른쪽 아래에 떠 있는 패널(💬 댓글 단추 위). 머리줄을 끌어서 옮기면 위치를 기억한다. 완료한 항목은 지우지 않고 '보관'한다 ---------- */
function buildTodoMap(){todoMap={};todos.forEach(t=>{if(t.archived_at)return;const m=todoMap[t.issue_id]||(todoMap[t.issue_id]=[0,0]);m[1]++;if(!t.done)m[0]++})}
const todoBadge=n=>{const m=todoMap[n.issue_id];return m&&m[0]?`<span class="todobadge" title="남은 할 일 ${m[0]}건 (전체 ${m[1]}건)">☑ ${m[0]}</span>`:""};
let todoArcOpen=false;      // 이 노트의 보관함을 펼쳐 봤는지
function refreshJumpTodo(){   // 이동 바의 ☑ 칩 숫자 (남은 할 일)
  const b=document.querySelector('#jumpbar [data-jump="todo"]');if(!b)return;
  const open=todos.filter(t=>t.issue_id===cur&&!t.archived_at&&!t.done).length;let i=b.querySelector("i");
  if(open){if(!i){i=document.createElement("i");b.appendChild(i)}i.textContent=open}else if(i)i.remove();
}
/* 떠 있는 패널: 닫힘 = 작은 알약 단추(☑ 할 일 남은수) / 열림 = 패널 */
function ensureTodoFloat(){
  if($("#todofab"))return;
  const f=document.createElement("button");f.type="button";f.id="todofab";f.onclick=()=>toggleTodoPanel(true);document.body.appendChild(f);
  const p=document.createElement("div");p.id="todopanel";p.innerHTML='<div class="card todocard" id="todoWrap"></div>';document.body.appendChild(p);
  window.addEventListener("resize",placeTodo);
}
function placeTodo(){
  const p=$("#todopanel"),f=$("#todofab");if(!p)return;
  const pos=ui.todoPos;
  if(pos&&Number.isFinite(pos.l)&&Number.isFinite(pos.t)){      // 끌어서 옮긴 위치 (화면 밖으로 나가지 않게)
    const w=p.offsetWidth||320,h=p.offsetHeight||200,l=Math.max(8,Math.min(innerWidth-w-8,pos.l)),t=Math.max(8,Math.min(innerHeight-h-8,pos.t));
    p.style.left=l+"px";p.style.top=t+"px";p.style.right="auto";p.style.bottom="auto";
  }else{
    const r=$("#center").getBoundingClientRect(),right=Math.max(12,innerWidth-r.right+24)+"px";
    p.style.left="auto";p.style.top="auto";p.style.right=right;p.style.bottom="124px";f.style.right=right;
  }
}
function updTodoFloat(){
  ensureTodoFloat();
  const f=$("#todofab"),p=$("#todopanel"),n=view==="note"&&cur?curNote():null;
  if(!n){f.style.display="none";p.style.display="none";return}
  const mine=todos.filter(t=>t.issue_id===cur&&!t.archived_at),open=mine.filter(t=>!t.done).length;
  f.textContent=`☑ 할 일 ${mine.length?`${open}/${mine.length}`:""}`.trim();f.classList.toggle("has",open>0);
  const want=!!ui.todoOpen;
  if(cmOpen){p.style.display=f.style.display="none";return}     // 댓글 팝업이 떠 있는 동안은 같은 자리라 잠깐 숨긴다 (닫으면 다시 보임)
  p.style.display=want?"block":"none";f.style.display=want?"none":"block";
  placeTodo();if(want)renderTodo();
}
function toggleTodoPanel(open){
  if(open!==false&&cmOpen)toggleCm(false);      // 할 일을 열면 댓글 팝업은 닫는다 (겹치지 않게)
  ui.todoOpen=open===undefined?!ui.todoOpen:!!open;saveUI();updTodoFloat();
  if(ui.todoOpen){const i=$("#todoNew");if(i)i.focus()}
}
function wireTodoDrag(){      // 머리줄을 잡고 끌기 (더블클릭하면 원래 자리)
  const p=$("#todopanel"),h=p&&p.querySelector(".fhd");if(!h||h._drag)return;h._drag=true;
  h.addEventListener("dblclick",e=>{if(e.target.closest("button"))return;ui.todoPos=null;saveUI();placeTodo()});
  h.addEventListener("pointerdown",e=>{
    if(e.button!==0||e.target.closest("button,input"))return;e.preventDefault();
    const r=p.getBoundingClientRect(),dx=e.clientX-r.left,dy=e.clientY-r.top;
    const mv=ev=>{ui.todoPos={l:ev.clientX-dx,t:ev.clientY-dy};placeTodo()};
    const up=()=>{document.removeEventListener("pointermove",mv);document.removeEventListener("pointerup",up);saveUI()};
    document.addEventListener("pointermove",mv);document.addEventListener("pointerup",up);
  });
}
function renderTodo(){
  const w=$("#todoWrap");if(!w||view!=="note"||!cur||!ui.todoOpen)return;
  const mine=todos.filter(t=>t.issue_id===cur),list=mine.filter(t=>!t.archived_at),arc=mine.filter(t=>t.archived_at).sort((a,b)=>(b.archived_at||"").localeCompare(a.archived_at||"")),done=list.filter(t=>t.done).length;
  const typed=($("#todoNew")||{}).value||"";
  w.innerHTML=`<div class="fhd"><span>☑ 할 일</span><small>${list.length?`${done}/${list.length} 완료`:"이 노트의 체크리스트"}</small><span class="sp"></span>${done?`<button type="button" class="mini" id="todoArcBtn" title="완료한 항목을 보관함으로 옮겨요 (지워지지 않아요)">완료 ${done}개 보관</button>`:""}${arc.length?`<button type="button" class="mini" id="todoArcView">${todoArcOpen?"보관함 닫기":`보관함 ${arc.length}`}</button>`:""}<button type="button" class="icon" id="todoX" title="접기 (오른쪽 아래 ☑ 단추로 다시 열어요)">✕</button></div>
    ${list.length?`<div class="todo-bar"><i style="width:${Math.round(done/list.length*100)}%"></i></div>`:""}
    <div class="todo-list">${list.map(t=>`<div class="todo-i ${t.done?"done":""}" data-tid="${t.id}"><input type="checkbox" ${t.done?"checked":""}><span class="tx" title="눌러서 수정">${esc(t.text)}</span><button type="button" class="x" title="삭제">✕</button></div>`).join("")||`<div class="meta" style="padding:6px 2px">할 일을 적어 보세요</div>`}</div>
    ${todoArcOpen&&arc.length?`<div class="todo-arc"><div class="meta" style="margin-bottom:4px">보관한 항목 (${arc.length})</div>${arc.map(t=>`<div class="todo-i done" data-aid="${t.id}"><span class="tx">${esc(t.text)}</span><span class="meta">${esc((t.archived_at||"").slice(5,10))} 보관</span><button type="button" class="mini" data-ar="restore">↩ 되돌리기</button><button type="button" class="x" data-ar="del" title="영구 삭제">✕</button></div>`).join("")}</div>`:""}
    <div class="todo-add"><input id="todoNew" placeholder="할 일 추가 (Enter)" maxlength="200" value="${esc(typed)}"></div>`;
  const after=()=>{buildTodoMap();refreshJumpTodo();updTodoFloat();if(view==="note")renderList()};
  $("#todoX").onclick=()=>toggleTodoPanel(false);wireTodoDrag();
  if($("#todoArcBtn"))$("#todoArcBtn").onclick=async()=>{
    try{const r=await post("/api/todo",{issue_id:cur,archive_done:true});todos.forEach(t=>{if(t.issue_id===cur&&t.done&&!t.archived_at)t.archived_at=r.archived_at});toast(`완료한 ${r.n}개를 보관함으로 옮겼어요`,2400);after()}
    catch(e){toast("보관하지 못했어요: "+e.message,5000)}};
  if($("#todoArcView"))$("#todoArcView").onclick=()=>{todoArcOpen=!todoArcOpen;renderTodo()};
  w.querySelectorAll(".todo-arc [data-aid]").forEach(row=>{
    const id=+row.dataset.aid,t=todos.find(x=>x.id===id);
    row.querySelector('[data-ar="restore"]').onclick=async()=>{try{const r=await post("/api/todo",{id,archived:false});Object.assign(t,r);after()}catch(e){toast("되돌리지 못했어요: "+e.message,5000)}};
    row.querySelector('[data-ar="del"]').onclick=async()=>{if(!await askC("보관한 이 항목을 영구 삭제할까요?\n되돌릴 수 없어요.",{ok:"삭제"}))return;try{await api(`/api/todo/${id}`,{method:"DELETE"});todos=todos.filter(x=>x.id!==id);after()}catch(e){toast("지우지 못했어요: "+e.message,5000)}};
  });
  w.querySelectorAll(".todo-list .todo-i").forEach(row=>{
    const id=+row.dataset.tid,t=todos.find(x=>x.id===id);
    row.querySelector("input").onchange=async e=>{
      try{const r=await post("/api/todo",{id,done:e.target.checked});Object.assign(t,r);after()}catch(err){toast("저장하지 못했습니다: "+err.message,5000);e.target.checked=!e.target.checked}};
    row.querySelector(".x").onclick=async()=>{
      try{await api(`/api/todo/${id}`,{method:"DELETE"});todos=todos.filter(x=>x.id!==id);after()}catch(err){toast("지우지 못했습니다: "+err.message,5000)}};
    row.querySelector(".tx").onclick=()=>{   // 글자를 누르면 그 자리에서 수정
      const inp=document.createElement("input");inp.className="tx-edit";inp.value=t.text;inp.maxLength=200;
      row.querySelector(".tx").replaceWith(inp);inp.focus();inp.select();
      let fin=false;
      const commit=async save=>{
        if(fin)return;fin=true;
        const v=inp.value.trim();
        if(save&&v&&v!==t.text){try{const r=await post("/api/todo",{id,text:v});Object.assign(t,r)}catch(err){toast("저장하지 못했습니다: "+err.message,5000)}}
        renderTodo();
      };
      inp.onkeydown=e=>{if(e.key==="Enter"&&!e.isComposing&&e.keyCode!==229){e.preventDefault();commit(true)}else if(e.key==="Escape"){e.stopPropagation();commit(false)}};
      inp.onblur=()=>commit(true);
    };
  });
  const add=$("#todoNew");
  add.onkeydown=async e=>{
    if(e.key!=="Enter"||e.isComposing||e.keyCode===229)return;
    e.preventDefault();const v=add.value.trim();if(!v)return;
    try{const r=await post("/api/todo",{issue_id:cur,text:v});todos.push(r);add.value="";after();$("#todoNew").focus()}
    catch(err){toast("추가하지 못했습니다: "+err.message,5000)}
  };
}
/* 전체 보관함: 모든 노트에서 보관한 체크리스트를 한 곳에서 (되돌리기 · 영구 삭제 · 노트 열기) */
function openTodoArchive(){
  const arc=()=>todos.filter(t=>t.archived_at).sort((a,b)=>(b.archived_at||"").localeCompare(a.archived_at||""));
  const draw=()=>{
    const by=new Map();arc().forEach(t=>{if(!by.has(t.issue_id))by.set(t.issue_id,[]);by.get(t.issue_id).push(t)});
    $("#tarcBody").innerHTML=[...by].map(([iid,l])=>{const n=all.find(x=>x.issue_id===iid);
      return `<div class="tarc-g"><a class="tarc-t" data-tuo="${iid}">#${iid} ${esc(n?n.subject:"(저장되지 않은 일감)")}</a>${l.map(t=>`<div class="tarc-i" data-tid="${t.id}"><span class="meta">${esc((t.archived_at||"").slice(0,10))}</span><span class="tx">${esc(t.text)}</span><button type="button" class="mini" data-tu="restore">↩ 되돌리기</button><button type="button" class="mini" data-tu="del">✕ 삭제</button></div>`).join("")}</div>`}).join("")||`<div class="meta" style="padding:8px 0">보관한 체크리스트가 없어요.</div>`;
  };
  wdlg({title:"보관한 체크리스트",wide:true,cancel:"",ok:"닫기",body:`<div id="tarcBody" class="tarc-body"></div>`});
  draw();
  $("#tarcBody").onclick=async e=>{
    const o=e.target.closest("[data-tuo]");if(o){$("#wyes").click();openNote(+o.dataset.tuo);return}
    const b=e.target.closest("[data-tu]");if(!b)return;
    const id=+b.closest("[data-tid]").dataset.tid,t=todos.find(x=>x.id===id);if(!t)return;
    try{
      if(b.dataset.tu==="restore"){const r=await post("/api/todo",{id,archived:false});Object.assign(t,r)}
      else{if(!await askC("영구 삭제할까요? 되돌릴 수 없어요.",{ok:"삭제"}))return;await api(`/api/todo/${id}`,{method:"DELETE"});todos=todos.filter(x=>x.id!==id)}
      buildTodoMap();draw();renderList();
    }catch(err){toast("처리하지 못했어요: "+err.message,5000)}
  };
}

