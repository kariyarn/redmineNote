/* ---------- 보관함 · 명령어: 단축어를 누르면 댓글 입력란을 그 문구로 바꾼다 ----------
   입력창 아래: 명령어가 CMD_BTN_MAX 개 이하면 모두 버튼, 넘으면 '버튼으로 꺼내 두기'한 것만 버튼으로 남기고 나머지는 선택칸으로 접는다.
   문구 안의 #{이름} · #{이름(인수, …)} 은 명령어 변수로 바꿔 넣는다: 상수 = 값 그대로, 함수 = 사용자가 쓴 JavaScript 함수 본문을 실행한 결과.
   함수는 따로 띄운 Worker 에서 실행해서(화면 · 저장된 데이터에 손대지 못하고, 오래 걸리면 끊는다) 앱이 멈추지 않는다. \#{…} 는 바꾸지 않고 #{…} 로 남긴다. */
let cmdItems=[],cmdVars=[],cmdLoaded=false,cmdLoading=null,cmdSelected=null,cmdDraft=null,cmdSearch="";
let cmdTab="cmd",varSelected=null,varDraft=null;
const CMD_BTN_MAX=6;          // 이보다 많으면 선택칸으로 접는다 (꺼내 둔 것은 버튼으로 남김)
const CMD_FUNC_MS=3000;       // 함수 실행 시간 한도

async function cmdLoad(force=false){
  if(cmdLoaded&&!force)return cmdItems;
  if(cmdLoading&&!force)return cmdLoading;
  cmdLoading=Promise.all([api("/api/commands"),api("/api/cmdvars")]).then(([rows,vars])=>{cmdItems=rows;cmdVars=vars;cmdLoaded=true;cmdSort();varSort();return rows})
    .finally(()=>{cmdLoading=null});
  return cmdLoading;
}
function cmdSort(){cmdItems.sort((a,b)=>a.shortcut.localeCompare(b.shortcut,"ko")||a.id-b.id)}
function varSort(){cmdVars.sort((a,b)=>a.name.localeCompare(b.name,"ko")||a.id-b.id)}
function cmdPut(row){const i=cmdItems.findIndex(x=>x.id===row.id);if(i<0)cmdItems.push(row);else cmdItems[i]=row;cmdSort()}
function varPut(row){const i=cmdVars.findIndex(x=>x.id===row.id);if(i<0)cmdVars.push(row);else cmdVars[i]=row;varSort()}

/* ---- 변수 바꿔 넣기 ---- */
const CMD_VAR_RE=/(\\?)#\{\s*([\p{L}_][\p{L}\p{N}_]*)\s*(?:\(([^)]*)\))?\s*\}/gu;
function cmdArgs(s){
  if(s==null||!s.trim())return [];
  return s.split(",").map(a=>a.trim().replace(/^(["'])(.*)\1$/,"$2"));
}
/* 함수 실행기: Worker 안에서 new AsyncFunction("ctx","args", 본문). await 를 써도 된다 */
const CMD_WORKER_SRC=`
const AF=Object.getPrototypeOf(async function(){}).constructor;
function mkCtx(b){
  const now=new Date(b.now),z=n=>String(n).padStart(2,"0");
  const fmt=(d=now,p="YYYY-MM-DD")=>{const x=new Date(d);return p.replace(/YYYY|MM|DD|HH|mm|ss/g,t=>({YYYY:x.getFullYear(),MM:z(x.getMonth()+1),DD:z(x.getDate()),HH:z(x.getHours()),mm:z(x.getMinutes()),ss:z(x.getSeconds())})[t])};
  const addDays=(n,d=now)=>{const x=new Date(d);x.setDate(x.getDate()+Number(n));return x};
  const nextWeekday=(w,d=now)=>addDays((Number(w)-new Date(d).getDay()+7)%7,d);
  return Object.freeze({now,fmt,addDays,nextWeekday,issue:b.issue,me:b.me,vars:b.consts});
}
onmessage=async e=>{
  const {jobs,base}=e.data,ctx=mkCtx(base),out={};
  for(const j of jobs){
    try{const v=await new AF("ctx","args",j.body)(ctx,j.args);out[j.key]={ok:true,v:v==null?"":String(v)}}
    catch(err){out[j.key]={ok:false,e:String((err&&err.message)||err)}}
  }
  postMessage(out);
};`;
/* 함수마다 Worker 하나: 하나가 멈추거나 틀려도 다른 변수는 그대로 바뀐다 */
async function cmdRunFuncs(jobs,base){
  const outs=await Promise.all(jobs.map(j=>cmdRunWorker([j],base)));
  return Object.assign({},...outs);
}
function cmdRunWorker(jobs,base){
  return new Promise(res=>{
    let w,url;
    const done=out=>{clearTimeout(tm);try{w&&w.terminate()}catch(e){}try{url&&URL.revokeObjectURL(url)}catch(e){}res(out)};
    const fail=msg=>done(Object.fromEntries(jobs.map(j=>[j.key,{ok:false,e:msg}])));
    const tm=setTimeout(()=>fail(`${CMD_FUNC_MS/1000}초 안에 끝나지 않았어요`),CMD_FUNC_MS);
    try{
      url=URL.createObjectURL(new Blob([CMD_WORKER_SRC],{type:"text/javascript"}));w=new Worker(url);
      w.onmessage=e=>done(e.data);w.onerror=e=>{e.preventDefault();fail(e.message||"실행하지 못했어요")};
      w.postMessage({jobs,base});
    }catch(e){fail(e.message)}
  });
}
function cmdBase(n){
  const consts=Object.fromEntries(cmdVars.filter(v=>v.kind==="const").map(v=>[v.name,v.value]));
  const issue=n?{id:n.issue_id,subject:n.subject||"",project:n.project||"",tracker:n.tracker||"",status:n.rm_status||"",author:n.author||"",assignee:n.assignee||"",url:(cfg.url||"")+"/issues/"+n.issue_id}:null;
  return {now:new Date().toISOString(),issue,me:{id:cfg.meId||0,name:cfg.meName||""},consts};
}
/* text 의 #{…} 를 바꿔 넣는다. 돌려주는 값: {text, errors:[설명]} (못 바꾼 자리는 그대로 남긴다) */
async function cmdExpand(text,n,vars=cmdVars){
  const ms=[...text.matchAll(CMD_VAR_RE)],byName=new Map(vars.map(v=>[v.name,v])),jobs=[],seen=new Set(),errors=[];
  for(const m of ms){
    if(m[1])continue;
    const v=byName.get(m[2]),key=m[2]+"("+(m[3]||"")+")";
    if(v&&v.kind==="func"&&!seen.has(key)){seen.add(key);jobs.push({key,body:v.value,args:cmdArgs(m[3])})}
  }
  const res=await cmdRunFuncs(jobs,cmdBase(n));
  const out=text.replace(CMD_VAR_RE,(all,esc,name,args)=>{
    if(esc)return all.slice(1);
    const v=byName.get(name);
    if(!v){errors.push(`#{${name}}: 없는 변수예요`);return all}
    if(v.kind==="const")return v.value;
    const r=res[name+"("+(args||"")+")"];
    if(r&&r.ok)return r.v;
    errors.push(`#{${name}}: ${r?r.e:"실행하지 못했어요"}`);return all;
  });
  return {text:out,errors:[...new Set(errors)]};
}

/* ---- 댓글 입력창 ---- */
const cmdBtnHtml=x=>`<button type="button" class="mini cmd-shortcut ${x.pinned?"pin":""}" data-cmd-id="${x.id}" title="${esc(x.description)}">${esc(x.shortcut)}</button>`;
function cmdPaintComposer(c){
  const box=c.querySelector(".cmcmd");if(!box)return;
  if(!cmdLoaded){box.innerHTML=`<span class="meta">명령어 불러오는 중…</span>`;return}
  if(!cmdItems.length){
    box.innerHTML=`<span class="meta">자주 쓰는 댓글은 <button type="button" class="mini" data-cmd-open>보관함 · 명령어</button>에 등록해 두세요.</span>`;
    box.querySelector("[data-cmd-open]").onclick=()=>setNav("vaultCommands");
    return;
  }
  const many=cmdItems.length>CMD_BTN_MAX,btns=many?cmdItems.filter(x=>x.pinned):cmdItems,rest=many?cmdItems.filter(x=>!x.pinned):[];
  box.innerHTML=`<span class="meta">명령어</span>${btns.map(cmdBtnHtml).join("")}`
    +(rest.length?`<select class="cmdsel" title="명령어가 많아서 접어 두었어요. 자주 쓰는 것은 명령어 편집에서 '버튼으로 꺼내 두기'를 켜면 버튼으로 남아요"><option value="">${btns.length?"그 밖의 명령어":"명령어 고르기"}… (${rest.length})</option>${rest.map(x=>`<option value="${x.id}">${esc(x.shortcut)}</option>`).join("")}</select>`:"");
  box.querySelectorAll("[data-cmd-id]").forEach(b=>b.onclick=()=>cmdApply(c,+b.dataset.cmdId));
  const sel=box.querySelector(".cmdsel");if(sel)sel.onchange=()=>{const id=+sel.value;sel.value="";if(id)cmdApply(c,id)};
}
async function cmdApply(c,id){
  const item=cmdItems.find(x=>x.id===id),ta=c.querySelector(".cmta"),iid=nIssueId(c);
  if(!item||!ta)return;
  const n=all.find(x=>x.issue_id===iid)||curNote(),r=await cmdExpand(item.description,n);
  edInit(ta,r.text);setDraft(iid,edGet(ta));syncComposers(n||curNote(),ta);
  const last=ta.querySelector(".tb:last-of-type")||ta.lastElementChild;if(last&&last.focus)last.focus();
  if(r.errors.length)toast("바꾸지 못한 변수가 있어요 — "+r.errors.join(" · "),7000);
}
function nIssueId(c){return +(c.closest("#cmpanel")?$("#cmpanel").dataset.id:cur)}
function cmdWireComposer(root){
  root.querySelectorAll(".cmp").forEach(c=>{
    cmdPaintComposer(c);
    cmdLoad().then(()=>cmdPaintComposer(c)).catch(e=>{
      const box=c.querySelector(".cmcmd");if(!box)return;
      box.innerHTML=`<span class="meta">명령어를 불러오지 못했어요 (${esc(e.message)}).</span><button type="button" class="mini">다시 시도</button>`;
      box.querySelector("button").onclick=()=>cmdWireComposer(c);
    });
  });
}
function cmdRefreshComposers(){document.querySelectorAll(".cmp").forEach(cmdPaintComposer)}

/* ---- 관리 화면: 명령어 / 변수 ---- */
const cmdSig=d=>JSON.stringify([d.shortcut,d.description,!!d.pinned]);
const varSig=d=>JSON.stringify([d.name,d.kind,d.value,d.description]);
const cmdDirty=()=>!!(cmdDraft&&$("#cmdShortcut")&&cmdSig({shortcut:$("#cmdShortcut").value,description:$("#cmdDescription").value,pinned:$("#cmdPinned").checked})!==cmdDraft._base);
const varDirty=()=>!!(varDraft&&$("#varName")&&varSig(varForm())!==varDraft._base);
const anyDirty=()=>cmdDirty()||varDirty();
const VAR_KIND={const:"상수",func:"함수"};

function renderCommands(){
  $("#center").innerHTML=`<div class="tr-wrap"><div class="tr-side">
    <div class="nv-vault-title">보관함 · 명령어</div>
    <div class="seg" id="cmdTabs"><button type="button" data-ctab="cmd" class="${cmdTab==="cmd"?"on":""}">명령어</button><button type="button" data-ctab="var" class="${cmdTab==="var"?"on":""}">변수</button></div>
    <button type="button" class="primary" id="cmdNew">${cmdTab==="cmd"?"＋ 새 명령어":"＋ 새 변수"}</button>
    <input id="cmdQ" placeholder="${cmdTab==="cmd"?"단축어 · 설명 검색":"이름 · 내용 검색"}" value="${esc(cmdSearch)}" autocomplete="off">
    <div class="tr-list" id="cmdList"></div></div>
    <div class="tr-main" id="cmdMain"></div></div>`;
  document.querySelectorAll("#cmdTabs [data-ctab]").forEach(b=>b.onclick=async()=>{
    if(b.dataset.ctab===cmdTab)return;
    if(anyDirty()&&!await askC("수정한 내용이 저장되지 않았어요. 버리고 이동할까요?"))return;
    cmdTab=b.dataset.ctab;cmdDraft=varDraft=null;cmdSearch="";renderCommands();
  });
  $("#cmdNew").onclick=async()=>{
    if(anyDirty()&&!await askC("수정한 내용이 저장되지 않았어요. 버리고 새로 만들까요?"))return;
    if(cmdTab==="cmd"){cmdSelected=null;cmdDraft={id:null,shortcut:"",description:"",pinned:false};cmdDraft._base=cmdSig(cmdDraft)}
    else{varSelected=null;varDraft={id:null,name:"",kind:"const",value:"",description:""};varDraft._base=varSig(varDraft)}
    cmdDrawList();cmdDrawMain();setTimeout(()=>{const f=$("#cmdShortcut")||$("#varName");if(f)f.focus()},0);
  };
  $("#cmdQ").oninput=e=>{cmdSearch=e.target.value.trim();cmdDrawList()};
  cmdLoad().then(()=>{
    if(view!=="commands")return;
    if(cmdSelected&&!cmdItems.some(x=>x.id===cmdSelected))cmdSelected=null;
    if(varSelected&&!cmdVars.some(x=>x.id===varSelected))varSelected=null;
    cmdDrawList();cmdDrawMain();
  }).catch(e=>{
    const main=$("#cmdMain");if(view!=="commands"||!main)return;
    main.innerHTML=`<div class="card"><b>명령어를 불러오지 못했어요.</b><div class="meta">${esc(e.message)}</div><button type="button" class="mini" id="cmdRetry">다시 시도</button></div>`;
    $("#cmdRetry").onclick=()=>renderCommands();
  });
}
function cmdDrawList(){
  const el=$("#cmdList");if(!el)return;
  const q=cmdSearch.toLowerCase();
  if(cmdTab==="var"){
    const list=cmdVars.filter(x=>!q||`${x.name}\n${x.value}\n${x.description}`.toLowerCase().includes(q));
    el.innerHTML=list.map(x=>`<div class="tr-item ${x.id===varSelected&&!varDraft?"on":""}" data-var-select="${x.id}">
      <div class="tt"><code>#{${esc(x.name)}}</code> <span class="tg ghost">${VAR_KIND[x.kind]}</span></div><div class="sn">${esc((x.description||x.value).replace(/\s+/g," ").slice(0,120))}</div></div>`).join("")
      ||`<div class="meta" style="padding:10px 4px">${cmdVars.length?"검색 결과가 없어요":"아직 변수가 없어요. ＋ 새 변수로 상수나 함수를 만들어 보세요."}</div>`;
    el.querySelectorAll("[data-var-select]").forEach(b=>b.onclick=async()=>{if(varDirty()&&!await askC("수정한 내용이 저장되지 않았어요. 버리고 이동할까요?"))return;
      varSelected=+b.dataset.varSelect;varDraft=null;cmdDrawList();cmdDrawMain()});
    return;
  }
  const list=cmdItems.filter(x=>!q||`${x.shortcut}\n${x.description}`.toLowerCase().includes(q));
  el.innerHTML=list.map(x=>`<div class="tr-item ${x.id===cmdSelected&&!cmdDraft?"on":""}" data-cmd-select="${x.id}">
    <div class="tt">${esc(x.shortcut)}${x.pinned?` <span class="tg" title="명령어가 많아 선택칸으로 접혀도 버튼으로 남아요">버튼</span>`:""}</div><div class="sn">${esc(x.description.replace(/\s+/g," ").slice(0,160))}</div></div>`).join("")
    ||`<div class="meta" style="padding:10px 4px">${cmdItems.length?"검색 결과가 없어요":"아직 명령어가 없어요. ＋ 새 명령어로 단축어와 댓글 문구를 등록해 보세요."}</div>`;
  el.querySelectorAll("[data-cmd-select]").forEach(b=>b.onclick=async()=>{if(cmdDirty()&&!await askC("수정한 내용이 저장되지 않았어요. 버리고 이동할까요?"))return;
    cmdSelected=+b.dataset.cmdSelect;cmdDraft=null;cmdDrawList();cmdDrawMain()});
}
function cmdDrawMain(){return cmdTab==="var"?varDrawMain():cmdDrawCmd()}
const varChips=()=>cmdVars.length?`<div class="row cmd-varchips" style="margin:6px 0 0;gap:6px;flex-wrap:wrap"><span class="meta">변수 넣기</span>${cmdVars.map(v=>`<button type="button" class="mini" data-ins="${esc(v.name)}" title="${esc(VAR_KIND[v.kind]+(v.description?" · "+v.description:""))}">#{${esc(v.name)}}</button>`).join("")}</div>`:"";
function cmdDrawCmd(){
  const el=$("#cmdMain");if(!el)return;
  if(cmdDraft){
    el.innerHTML=`<div class="card tr-doc tr-ed">
      <label class="tr-lab" for="cmdShortcut" style="margin-top:0">단축어</label>
      <input type="text" id="cmdShortcut" maxlength="40" placeholder="예) 배포요청" value="${esc(cmdDraft.shortcut)}">
      <label class="tr-lab" for="cmdDescription">댓글에 넣을 문구</label>
      <textarea id="cmdDescription" rows="8" maxlength="20000" placeholder="예) #{nextTue} 정기 배포를 요청드립니다.">${esc(cmdDraft.description)}</textarea>
      ${varChips()}
      <div class="meta"><code>#{이름}</code> · <code>#{이름(인수, …)}</code> 은 변수 탭의 상수 · 함수로 바뀌어요. 바꾸지 않으려면 <code>\\#{이름}</code>.</div>
      <label class="chk" style="margin-top:10px"><input type="checkbox" id="cmdPinned" ${cmdDraft.pinned?"checked":""}> 버튼으로 꺼내 두기 <span class="meta">— 명령어가 ${CMD_BTN_MAX}개를 넘어 선택칸으로 접혀도 이 명령어는 버튼으로 남아요</span></label>
      <div class="row" style="margin-top:14px"><button type="button" class="primary" id="cmdSave">저장</button><button type="button" id="cmdCancel">취소</button><button type="button" id="cmdTry">미리 보기</button></div>
      <div id="cmdPrev"></div></div>`;
    el.querySelectorAll("[data-ins]").forEach(b=>b.onclick=()=>{const ta=$("#cmdDescription"),s=ta.selectionStart??ta.value.length,e=ta.selectionEnd??s,t=`#{${b.dataset.ins}}`;
      ta.value=ta.value.slice(0,s)+t+ta.value.slice(e);ta.focus();ta.selectionStart=ta.selectionEnd=s+t.length});
    $("#cmdTry").onclick=()=>cmdPreview($("#cmdDescription").value,$("#cmdPrev"));
    $("#cmdSave").onclick=async()=>{
      try{
        const row=await post("/api/commands",{id:cmdDraft.id,shortcut:$("#cmdShortcut").value,description:$("#cmdDescription").value,pinned:$("#cmdPinned").checked});
        cmdPut(row);cmdSelected=row.id;cmdDraft=null;cmdDrawList();cmdDrawMain();cmdRefreshComposers();toast("명령어를 저장했어요 ✓",1800);
      }catch(e){toast("저장하지 못했어요: "+e.message,4500)}
    };
    cmdDraft._base=cmdDraft._base||cmdSig(cmdDraft);
    $("#cmdCancel").onclick=async()=>{if(cmdDirty()&&!await askC("수정한 내용이 저장되지 않았어요. 버릴까요?"))return;cmdDraft=null;cmdDrawList();cmdDrawMain()};
    return;
  }
  const x=cmdItems.find(v=>v.id===cmdSelected);
  if(!x){el.innerHTML=`<div class="empty" style="padding-top:8vh"><b>댓글에 자주 쓰는 문구를 빠르게 넣어 보세요</b>단축어와 문구를 저장하면 노트의 댓글 입력창 아래에 버튼으로 나와요. 누르면 댓글 입력란이 그 문구로 <b>바뀌어요</b>. 명령어가 ${CMD_BTN_MAX}개를 넘으면 선택칸으로 접히고, '버튼으로 꺼내 두기'한 것만 버튼으로 남아요.<br>문구 안의 <code>#{이름}</code> 은 <b>변수</b> 탭에서 만든 상수 · 함수로 바뀌어요.</div>`;return}
  el.innerHTML=`<div class="card tr-doc"><div class="tr-hd"><h2>${esc(x.shortcut)}</h2><button type="button" id="cmdEdit">편집</button><button type="button" id="cmdDelete">삭제</button></div>
    ${x.pinned?`<div class="meta">버튼으로 꺼내 둠 — 명령어가 많아 선택칸으로 접혀도 버튼으로 남아요</div>`:""}
    <div class="tr-sec"><h4>댓글에 넣을 문구</h4><div class="cmd-description">${esc(x.description)}</div></div>
    <div class="tr-sec"><h4>미리 보기 <span class="meta">(지금 시각 · 마지막으로 연 일감 기준. 연 일감이 없으면 ctx.issue 는 null)</span></h4><div id="cmdPrev"></div></div>
    <div class="meta" style="margin-top:12px">수정 ${esc((x.updated_at||"").replace("T"," ").slice(0,16))}</div></div>`;
  cmdPreview(x.description,$("#cmdPrev"));
  $("#cmdEdit").onclick=()=>{cmdDraft={...x};cmdDraft._base=cmdSig(cmdDraft);cmdDrawList();cmdDrawMain()};
  $("#cmdDelete").onclick=async()=>{
    if(!await askC(`‘${x.shortcut}’ 명령어를 삭제할까요?`))return;
    try{await api("/api/commands/"+x.id,{method:"DELETE"});cmdItems=cmdItems.filter(v=>v.id!==x.id);cmdSelected=null;cmdDrawList();cmdDrawMain();cmdRefreshComposers();toast("명령어를 삭제했어요",1800)}
    catch(e){toast("삭제하지 못했어요: "+e.message,4500)}
  };
}
async function cmdPreview(text,box){
  if(!box)return;box.innerHTML=`<span class="meta">바꾸는 중…</span>`;
  const r=await cmdExpand(text,curNote()||null);
  box.innerHTML=`<div class="cmd-description cmd-prev">${esc(r.text)}</div>${r.errors.length?`<div class="meta cmd-err">${r.errors.map(esc).join("<br>")}</div>`:""}`;
}

/* 변수 편집 */
function varForm(){return {name:$("#varName").value.trim(),kind:document.querySelector("input[name=varKind]:checked").value,value:$("#varValue").value,description:$("#varDesc").value}}
/* 변수 편집 화면 아래 도움말: 규칙 · 쓸 수 있는 값 · 예제(누르면 넣기) · 제한 */
const VAR_CTX=[
  ["ctx.now","지금 시각 (Date)","ctx.now.getDay() === 5"],
  ["ctx.fmt(날짜, 형식)","날짜를 글자로. 형식 기본값 YYYY-MM-DD (YYYY · MM · DD · HH · mm · ss)",'ctx.fmt(ctx.now, "MM/DD HH:mm")'],
  ["ctx.addDays(n, 날짜)","n일 뒤 날짜 (음수면 앞). 날짜 기본값 지금","ctx.addDays(-1)"],
  ["ctx.nextWeekday(요일, 날짜)","돌아오는 그 요일 (0=일 … 6=토, 오늘이 그 요일이면 오늘)","ctx.nextWeekday(2)"],
  ["ctx.issue","지금 일감 { id, subject, project, tracker, status, author, assignee, url }. 일감 밖(미리 보기 등)에서는 null","ctx.issue?.subject"],
  ["ctx.me","나 { id, name }","ctx.me.name"],
  ["ctx.vars","상수 변수들 { 이름: 값 }","ctx.vars.team"],
  ["args","#{이름(a, b)} 로 넘긴 인수. 글자 목록 (앞뒤 공백 · 따옴표는 뗌)","Number(args[0] || 1)"],
];
const VAR_EXAMPLES=[
  ["며칠 뒤 날짜","#{after(3)}","return ctx.fmt(ctx.addDays(Number(args[0] || 1)));"],
  ["형식을 정한 지금 시각","#{now(MM/DD HH:mm)}",'return ctx.fmt(ctx.now, args[0] || "YYYY-MM-DD HH:mm");'],
  ["돌아오는 요일 (한글로)","#{next(목)}","const w = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 }[args[0]];\nreturn ctx.fmt(ctx.nextWeekday(w ?? 2));"],
  ["지금 일감 번호와 제목","#{issueTitle}","if (!ctx.issue) return \"\";\nreturn `#${ctx.issue.id} ${ctx.issue.subject}`;"],
  ["상수와 내 이름 묶기","#{sign}","return `${ctx.vars.team ?? \"\"} ${ctx.me.name}`.trim();"],
  ["요일에 따라 다른 말","#{nextDay}",'return ctx.now.getDay() === 5 ? "다음 주 월요일" : "내일";'],
];
function varHelp(kind){
  if(kind!=="func")return `<div class="cmd-help"><div class="meta">상수는 적은 값을 <b>그대로</b> 넣어요. 여러 줄도 돼요. 함수에서는 <code>ctx.vars.이름</code> 으로 읽을 수 있어요. 값 안의 <code>#{…}</code> 는 다시 바뀌지 않아요.</div></div>`;
  return `<details class="cmd-help" open><summary>함수 작성 도움말</summary>
    <h5>1. 규칙</h5>
    <ul><li>여기에는 <b>JavaScript 함수 본문</b>만 써요. <code>return</code> 한 값이 글자로 바뀌어 <code>#{이름}</code> 자리에 들어가요 (<code>undefined</code> · <code>null</code> 은 빈 글자).</li>
      <li><code>await</code> 를 쓸 수 있어요. 문구에서는 <code>#{이름}</code> 또는 인수를 넘겨 <code>#{이름(3, 화)}</code> 로 써요.</li></ul>
    <h5>2. 쓸 수 있는 값</h5>
    <table><thead><tr><th>이름</th><th>설명</th><th>예</th></tr></thead><tbody>${VAR_CTX.map(([n,d,e])=>`<tr><td><code>${esc(n)}</code></td><td>${esc(d)}</td><td><code>${esc(e)}</code></td></tr>`).join("")}</tbody></table>
    <h5>3. 예제 <span class="meta">— 누르면 함수 본문에 넣어요</span></h5>
    <table class="ex"><thead><tr><th>하는 일</th><th>문구에서</th><th>함수 본문</th><th></th></tr></thead><tbody>${VAR_EXAMPLES.map(([t,u,c],i)=>`<tr><td>${esc(t)}</td><td><code>${esc(u)}</code></td><td><pre class="code">${esc(c)}</pre></td><td><button type="button" class="mini" data-var-ex="${i}">넣기</button></td></tr>`).join("")}</tbody></table>
    <h5>4. 제한</h5>
    <ul><li>함수마다 따로 떨어진 곳(Worker)에서 <b>${CMD_FUNC_MS/1000}초</b> 안에 실행돼요. 넘으면 끊어요.</li>
      <li>앱 화면 · 노트 · 레드마인에는 손대지 못해요 (<code>document</code> · 저장된 데이터 없음).</li>
      <li>오류가 나거나 시간을 넘기면 그 자리는 <code>#{이름}</code> 그대로 남고, 이유를 알려 줘요. 저장하기 전에 <b>실행해 보기</b>로 확인하세요.</li></ul>
  </details>`;
}
function varWireHelp(){
  document.querySelectorAll("#varHelp [data-var-ex]").forEach(b=>b.onclick=async()=>{
    const ta=$("#varValue"),code=VAR_EXAMPLES[+b.dataset.varEx][2];
    if(ta.value.trim()&&ta.value.trim()!==code&&!await askC("지금 쓴 함수 본문을 지우고 이 예제로 바꿀까요?"))return;
    ta.value=code;ta.focus();
  });
}
function varDrawMain(){
  const el=$("#cmdMain");if(!el)return;
  if(varDraft){
    const k=varDraft.kind;
    el.innerHTML=`<div class="card tr-doc tr-ed">
      <label class="tr-lab" for="varName" style="margin-top:0">이름 <span class="meta">— 문구에서 <code>#{이름}</code> 으로 써요 (글자 · 숫자 · _ , 글자나 _ 로 시작)</span></label>
      <input type="text" id="varName" maxlength="40" placeholder="예) team" value="${esc(varDraft.name)}" autocomplete="off" spellcheck="false">
      <label class="tr-lab">유형</label>
      <div class="row" style="margin:0;gap:14px"><label class="chk"><input type="radio" name="varKind" value="const" ${k==="const"?"checked":""}> 상수 <span class="meta">값을 그대로</span></label><label class="chk"><input type="radio" name="varKind" value="func" ${k==="func"?"checked":""}> 함수 <span class="meta">JavaScript 를 실행한 결과</span></label></div>
      <label class="tr-lab" for="varValue" id="varValueLab">${k==="func"?"함수 본문":"값"}</label>
      <textarea id="varValue" rows="${k==="func"?10:4}" maxlength="20000" spellcheck="false" class="${k==="func"?"code":""}" placeholder="${k==="func"?"예) return ctx.fmt(ctx.addDays(Number(args[0] || 1)));":"예) IT개발본부 웹개발팀"}">${esc(varDraft.value)}</textarea>
      <div id="varHelp">${varHelp(k)}</div>
      <label class="tr-lab" for="varDesc">설명 <span class="meta">(선택)</span></label>
      <input type="text" id="varDesc" maxlength="200" placeholder="예) 며칠 뒤 날짜: #{after(3)}" value="${esc(varDraft.description)}">
      <div class="row" style="margin-top:14px"><button type="button" class="primary" id="varSave">저장</button><button type="button" id="varCancel">취소</button>
        <span class="sp"></span><input type="text" id="varArgs" placeholder="인수 (쉼표로)" style="max-width:12rem" title="실행해 볼 때 넘길 인수"><button type="button" id="varTry">실행해 보기</button></div>
      <div id="varOut"></div></div>`;
    document.querySelectorAll("input[name=varKind]").forEach(r=>r.onchange=()=>{const f=r.value==="func",ta=$("#varValue");
      ta.classList.toggle("code",f);ta.rows=f?10:4;$("#varValueLab").textContent=f?"함수 본문":"값";$("#varHelp").innerHTML=varHelp(r.value);varWireHelp()});
    varWireHelp();
    $("#varTry").onclick=async()=>{
      const f=varForm(),args=$("#varArgs").value,others=cmdVars.filter(v=>v.id!==varDraft.id),probe={...f,id:-1,name:"__probe"};
      const r=await cmdExpand(`#{${probe.name}${args.trim()?"("+args+")":""}}`,curNote()||null,[...others,probe]);
      $("#varOut").innerHTML=r.errors.length?`<div class="meta cmd-err">${r.errors.map(esc).join("<br>")}</div>`:`<div class="meta">결과</div><div class="cmd-description cmd-prev">${esc(r.text)||"<span class=meta>(빈 글자)</span>"}</div>`;
    };
    $("#varSave").onclick=async()=>{
      try{
        const row=await post("/api/cmdvars",{id:varDraft.id,...varForm()});
        varPut(row);varSelected=row.id;varDraft=null;cmdDrawList();cmdDrawMain();toast("변수를 저장했어요 ✓",1800);
      }catch(e){toast("저장하지 못했어요: "+e.message,4500)}
    };
    varDraft._base=varDraft._base||varSig(varDraft);
    $("#varCancel").onclick=async()=>{if(varDirty()&&!await askC("수정한 내용이 저장되지 않았어요. 버릴까요?"))return;varDraft=null;cmdDrawList();cmdDrawMain()};
    return;
  }
  const x=cmdVars.find(v=>v.id===varSelected);
  if(!x){el.innerHTML=`<div class="empty" style="padding-top:8vh"><b>명령어 문구에 넣을 변수</b><code>#{이름}</code> 자리에 <b>상수</b>는 값을 그대로, <b>함수</b>는 직접 쓴 JavaScript 를 실행한 결과를 넣어요. 인수도 넘길 수 있어요: <code>#{이름(3, 화)}</code>.<br>기본으로 <code>#{today}</code> · <code>#{nextTue}</code> · <code>#{nextThu}</code> 가 들어 있고, 고치거나 지워도 돼요.</div>`;return}
  el.innerHTML=`<div class="card tr-doc"><div class="tr-hd"><h2><code>#{${esc(x.name)}}</code></h2><span class="tg ghost">${VAR_KIND[x.kind]}</span><span class="sp"></span><button type="button" id="varEdit">편집</button><button type="button" id="varDelete">삭제</button></div>
    ${x.description?`<div class="meta">${esc(x.description)}</div>`:""}
    <div class="tr-sec"><h4>${x.kind==="func"?"함수 본문":"값"}</h4><pre class="cmd-description ${x.kind==="func"?"code":""}">${esc(x.value)}</pre></div>
    <div class="tr-sec"><h4>지금 넣으면</h4><div id="varOut"></div></div>
    <div class="meta" style="margin-top:12px">수정 ${esc((x.updated_at||"").replace("T"," ").slice(0,16))}</div></div>`;
  cmdExpand(`#{${x.name}}`,curNote()||null).then(r=>{const o=$("#varOut");if(o)o.innerHTML=r.errors.length?`<div class="meta cmd-err">${r.errors.map(esc).join("<br>")}</div>`:`<div class="cmd-description cmd-prev">${esc(r.text)||"<span class=meta>(빈 글자)</span>"}</div>`});
  $("#varEdit").onclick=()=>{varDraft={...x};varDraft._base=varSig(varDraft);cmdDrawList();cmdDrawMain()};
  $("#varDelete").onclick=async()=>{
    const used=cmdItems.filter(c=>[...c.description.matchAll(CMD_VAR_RE)].some(m=>!m[1]&&m[2]===x.name)).map(c=>c.shortcut);
    if(!await askC(`#{${x.name}} 변수를 삭제할까요?`+(used.length?`\n이 변수를 쓰는 명령어: ${used.join(", ")} (삭제하면 그 자리는 바뀌지 않고 그대로 남아요)`:"")))return;
    try{await api("/api/cmdvars/"+x.id,{method:"DELETE"});cmdVars=cmdVars.filter(v=>v.id!==x.id);varSelected=null;cmdDrawList();cmdDrawMain();toast("변수를 삭제했어요",1800)}
    catch(e){toast("삭제하지 못했어요: "+e.message,4500)}
  };
}
