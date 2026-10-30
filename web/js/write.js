/* ---------- 레드마인에 쓰기 (댓글 · 파일 · 상태 · 담당자) ----------
   서버가 허용 목록(시험 모드)과 보낼 수 있는 항목을 한 번 더 막는다.
   댓글만 올릴 때는 확인 창 없이 바로 올리고, 상태·담당자가 바뀔 때는 처음에만 '변경 전 → 후'를 확인한다(다시 보지 않기 가능). */
const cmDraft=new Map(),cmStage=new Map(),cmBusy=new Set();
const cmFiles=new Map(),cmAttempts=new Map(),cmRecovery=new Map(); // File 객체는 메모리에만 둔다 (localStorage 저장 금지).
const cmFormats=new Map();
const cmImageUploads=new Map(); // 새 이미지도 File/요청 ID는 메모리에만. 댓글·일반 첨부 초안과 분리.
function cmImageState(id){const key=(cfg.url||"")+"|"+id;if(!cmImageUploads.has(key))cmImageUploads.set(key,{});return cmImageUploads.get(key)}
async function sendCommentWrite(data,files=[]){
  if(!files.length)return post("/api/rm/write",data);
  const form=new FormData();form.append("data",JSON.stringify(data));
  files.forEach(x=>form.append("files",x.file,x.file.name));
  return api("/api/rm/write",{method:"POST",body:form});
}
async function uploadEditorImage(n,state,decision=null){
  const id=n.issue_id;
  if(cmBusy.has(id)||!canWrite(n))return false;
  if(cmRecovery.has(id)){toast("댓글의 이전 요청 반영을 먼저 확인하세요",6000);return false}
  if(!decision&&(!state.file||state.pending))return false;
  if(decision&&!state.pending)return false;
  if(decision&&decision!=="check"&&!await wdlg({title:"Redmine에서 이미지 첨부를 직접 확인했나요?",ok:"확인 기록",body:decision==="applied"?"파일이 등록된 것을 직접 확인했을 때만 선택하세요. 파일을 다시 보내지 않습니다.":"파일이 전혀 등록되지 않은 것을 확인했을 때만 선택하세요. 여기서는 재전송하지 않습니다."}))return false;
  // 확인 대화상자 동안 다른 입력창에서 전송을 시작했을 수도 있다.
  if(cmBusy.has(id))return false;
  state.requestId??=crypto.randomUUID();cmBusy.add(id);setCmBusy(n,true);let completed=false;
  try{
    const r=decision?await post("/api/rm/write/recover",{issue_id:id,request_id:state.requestId,decision}):
      await sendCommentWrite({issue_id:id,notes:"",request_id:state.requestId,loaded_updated_on:n.updated_on},[{file:state.file}]);
    if(r.retry_allowed){state.pending=false;delete state.requestId;state.message="재전송하지 않았어요. 파일을 확인한 뒤 첨부를 직접 누르세요";return false}
    if(!r.ok)throw Error("첨부 결과를 확인하지 못했어요");completed=true;
    state.pending=false;state.uploaded=true;delete state.requestId;delete state.file;
    state.message="파일 첨부 완료. 아래 목록에서 실제 첨부 ID를 확인해 선택하세요. 본문과 댓글은 아직 저장하지 않았어요.";
    if(r.note){const tgt=all.find(x=>x.issue_id===id)||n;Object.assign(tgt,r.note);prep(tgt);buildTokens();markSeen(tgt)}
    invalidateAtt(id);if(cur===id&&view==="note"&&typeof loadAtt==="function")Promise.resolve(loadAtt(all.find(x=>x.issue_id===id)||n)).catch(()=>{});
    return true;
  }catch(e){
    if(completed){state.message="파일 첨부는 완료됐어요. 최신 첨부 목록을 다시 열어 확인하세요. 파일을 다시 보내지 않습니다.";return true}
    const body=e.body||{};
    if(body.needs_review&&body.request_id&&body.request_id!==state.requestId){
      cmRecovery.set(id,body.request_id);state.message="이전 댓글/첨부 요청의 반영을 댓글 작성창에서 먼저 확인하세요. 선택한 새 이미지는 보내지 않았어요.";delete state.requestId;syncComposers(n);return false;
    }
    // 로컬 응답 유실도 미확정이다. 같은 ID로 상태 조회만 허용하고 자동 재전송하지 않는다.
    if(body.needs_review||!e.status||(e.status>=500&&!["upload_failed","journal_unavailable"].includes(body.code))){state.pending=true;state.requestId=body.request_id||state.requestId}
    state.message=e.message+(body.hint?" — "+body.hint:"")+(state.pending?" · 등록 여부가 불명확해요. Redmine에서 확인하세요. 자동 재전송하지 않습니다.":" · 선택 파일과 댓글은 유지했어요. 충돌이면 최신 목록을 확인하고 다시 선택하세요.");
    if(body.code==="changed"||e.code==="changed")state.message+=" 일감의 ↻ 새로 읽기 후 이미지 삽입 창을 다시 여세요.";
    if(decision&&e.status===404)state.message+=" 요청 기록이 없거나 연결이 달라졌어요. 현재 연결과 Redmine 반영 여부를 확인한 뒤 새로고침하고 파일을 다시 선택하세요.";
    return false;
  }finally{cmBusy.delete(id);setCmBusy(n,false)}
}
const cmImageOptions=n=>({imageState:()=>cmImageState(n.issue_id),onImageUpload:(state,decision)=>uploadEditorImage(n,state,decision)});
const cmFormatKey=id=>(cfg.url||"")+"|"+id;
function cmFormatOf(id){const key=cmFormatKey(id);if(!cmFormats.has(key))cmFormats.set(key,"html");return cmFormats.get(key)}
const filesOf=id=>cmFiles.get(id)||[];
const cmLimits=()=>wcfg().uploads||{max_file:20*1024*1024,max_total:50*1024*1024,max_count:10};
function cmAddFiles(n,files){
  if(cmBusy.has(n.issue_id)||!canWrite(n))return;
  const list=[...filesOf(n.issue_id)],lim=cmLimits();
  for(const file of files){
    if(list.length>=lim.max_count||file.size>lim.max_file||list.reduce((s,x)=>s+x.file.size,0)+file.size>lim.max_total){
      toast(`첨부는 최대 ${lim.max_count}개, 파일당 ${kb(lim.max_file)}, 합계 ${kb(lim.max_total)}까지예요`,6000);break;
    }
    list.push({id:crypto.randomUUID(),file});
  }
  cmFiles.set(n.issue_id,list);syncComposers(n);
}
function cmRenderFiles(c,n){
  const box=c.querySelector(".cmfiles");if(!box)return;
  box.innerHTML=filesOf(n.issue_id).map(x=>`<div class="cmfile"><span class="cmfilename">${esc(x.file.name)}</span><small>${x.file.size?kb(x.file.size):"0 B"}</small><button type="button" class="mini" data-remove-file="${x.id}" aria-label="${esc(x.file.name)} 첨부 제거" ${cmBusy.has(n.issue_id)?"disabled":""}>제거</button></div>`).join("");
  box.querySelectorAll("[data-remove-file]").forEach(b=>b.onclick=()=>{
    if(cmBusy.has(n.issue_id))return;
    cmFiles.set(n.issue_id,filesOf(n.issue_id).filter(x=>x.id!==b.dataset.removeFile));syncComposers(n);
  });
  const recovery=c.querySelector(".cmrecovery");
  if(recovery){
    recovery.innerHTML=cmRecovery.has(n.issue_id)?`<div class="cmnote">이전 요청의 반영 여부를 확인해야 해요. 댓글과 파일은 유지했어요. Redmine에서 직접 확인한 결과를 선택하세요.</div><div class="cmrow"><button type="button" class="mini" data-recover="check">반영 확인</button><button type="button" class="mini" data-recover="applied">등록됨 확인</button><button type="button" class="mini" data-recover="not_applied">미등록 확인 / 재시도 준비</button></div>`:"";
    recovery.querySelectorAll("[data-recover]").forEach(b=>b.onclick=()=>recoverComposer(n,b.dataset.recover));
  }
}
function cmFields(id,o={}){
  const st=stageOf(id),f={};if(o.preset)f.preset=o.preset;
  else{if(st.preset)f.preset=st.preset;["status_id","assigned_to_id","dev_id"].forEach(k=>{if(st[k])f[k]=st[k]})}
  return f;
}
function clearComposer(id){setDraft(id,"");cmStage.delete(id);cmFiles.delete(id);cmAttempts.delete(id);cmRecovery.delete(id);invalidateAtt(id)}
async function recoverComposer(n,decision){
  const id=n.issue_id,rid=cmRecovery.get(id);if(!rid||cmBusy.has(id))return false;
  if(decision!=="check"&&!await wdlg({title:"Redmine에서 직접 확인했나요?",ok:decision==="applied"?"등록됨을 확인했어요":"미등록을 확인했어요",cancel:"취소",
    body:decision==="applied"?"댓글·첨부·상태 변경이 이미 등록된 것을 직접 확인했을 때만 선택하세요. 다시 전송하지 않습니다.":"댓글·첨부·상태 변경이 전혀 반영되지 않은 것을 직접 확인했을 때만 선택하세요. 일부라도 반영됐다면 취소하세요. 여기서는 전송하지 않고 새 요청을 준비합니다."}))return false;
  const format=cmFormatOf(id),attempt=cmAttempts.get(id),same=attempt&&attempt.id===rid&&attempt.signature===JSON.stringify([format==="legacy"?draftOf(id).trim():draftOf(id),{...cmFields(id),...(format!=="legacy"?{notes_format:format}:{})},filesOf(id).map(x=>x.id)]);
  cmBusy.add(id);setCmBusy(n,true);
  try{
    const r=await post("/api/rm/write/recover",{issue_id:id,request_id:rid,decision});
    if(r.retry_allowed){cmRecovery.delete(id);cmAttempts.delete(id);syncComposers(n);toast("재시도를 준비했어요. 내용을 확인하고 올리기를 직접 눌러 주세요",6000)}
    else if(r.ok){cmRecovery.delete(id);if(same)clearComposer(id);else cmAttempts.delete(id);
      const tgt=all.find(x=>x.issue_id===id)||n;
      if(r.note){Object.assign(tgt,r.note);prep(tgt);buildTokens();markSeen(tgt)}
      invalidateAtt(id);syncComposers(n);renderAll();if(cmOpen)cmPanelRender();
      toast(r.manual?"등록됨을 사용자 확인으로 기록했어요. 다시 전송하지 않았어요":"Redmine에서 이전 요청의 반영을 확인했어요. 다시 전송하지 않았어요",6000)}
    return true;
  }catch(e){toast(e.message+" — Redmine에서 직접 확인한 뒤 등록됨 또는 미등록을 선택해 주세요",10000);return false}
  finally{cmBusy.delete(id);setCmBusy(n,false)}
}
function cmRequestId(id,notes,fields,files){
  const signature=JSON.stringify([notes,fields,files.map(x=>x.id)]),last=cmAttempts.get(id);
  if(last&&last.signature===signature)return last.id;
  const attempt={signature,id:crypto.randomUUID()};cmAttempts.set(id,attempt);return attempt.id;
}
let cmOpen=false,rmStatuses=null,rmMem=[],rmMemFor=0;
const wcfg=()=>cfg.write||{allow:[],test:false,statuses:{dev:11,confirm:15,done:5}};
const canWrite=n=>{const w=wcfg();return !w.test||w.allow.includes(n.issue_id)};
const curNote=()=>all.find(x=>x.issue_id===cur);
const draftOf=id=>{if(!cmDraft.has(id)){let v="";try{v=localStorage.getItem("rncm:"+id)||""}catch(e){}cmDraft.set(id,v)}return cmDraft.get(id)};
const setDraft=(id,v)=>{cmDraft.set(id,v);try{v?localStorage.setItem("rncm:"+id,v):localStorage.removeItem("rncm:"+id)}catch(e){}};
const stageOf=id=>{if(!cmStage.has(id))cmStage.set(id,{lbl:{}});return cmStage.get(id)};
const WPRESETS=[["dev","개발중"],["confirm","최종확인요청"],["done","완료"],["me","나로 지정"]];
const PRESET_TIP={dev:"상태 → 개발중 · 담당자와 개발담당자 → 나",confirm:"상태 → 최종확인요청 · 담당자 → 일감 작성자 · 개발담당자 → 나",done:"상태 → 완료 · 담당자와 개발담당자 → 나",me:"담당자와 개발담당자 → 나 (상태는 그대로)"};
function composerInput(root){
  const host=root?.matches?.(".cmta")?root:root?.querySelector(".cmta"),editor=host?._commentEditor;
  return editor?(editor.format==="legacy"?editor.legacy.querySelector(".tb"):editor.sourceMode?editor.source:editor.visual):host?.querySelector(".tb")||host?.querySelector("textarea");
}
function composerHtml(k,n){
  const ok=canWrite(n),w=wcfg();
  return `<div class="cmp" data-k="${k}" data-issue="${n.issue_id}">
   ${ok?"":`<div class="cmnote">시험 모드예요: ${w.allow.map(x=>"#"+x).join(", ")} 에서만 레드마인에 올릴 수 있어요. 쓴 내용은 임시 저장됩니다.</div>`}
   <div class="rte cmta" data-ph="댓글을 쓰세요 · Ctrl+Enter 로 올리기 · &#96;&#96;&#96; + Enter 로 코드 상자 (상자 안에서는 Ctrl+Enter = 상자 밖으로)"></div>
    <div class="cmfiles" aria-label="선택한 첨부파일" aria-live="polite"></div>
    <div class="cmrecovery" aria-live="polite"></div>
   <div class="cmcmd" aria-label="댓글 명령어"></div>
   <div class="cmrow">${V2()   // 새 디자인: 버튼 4개 대신 같은 동작의 선택칸 하나 (고르기만 하고, 올리기를 눌러야 올라간다)
     ?`<select class="wsel" title="올릴 때 상태 · 담당자를 같이 바꿉니다 (올리기를 눌러야 올라갑니다)" ${ok?"":"disabled"}><option value="">상태 · 담당 그대로</option>${WPRESETS.map(([p,l])=>`<option value="${p}" title="${PRESET_TIP[p]}">${l}${{dev:" (나에게)",confirm:" (작성자에게)",done:"",me:""}[p]}</option>`).join("")}</select>`
     :WPRESETS.map(([p,l])=>`<button type="button" data-w="${p}" title="${PRESET_TIP[p]} — 고르기만 하고, 올리기를 눌러야 올라갑니다" ${ok?"":"disabled"}>${l}</button>`).join("")}
     <select class="stsel" title="상태만 바꿀 때 (올리기를 눌러야 올라갑니다)"><option value="">상태만 변경…</option></select></div>
   <div class="cmrow"><label>담당자 <input class="pk" data-pk="assigned_to_id" list="memlist" placeholder="이름 검색"></label><label>개발담당자 <input class="pk" data-pk="dev_id" list="memlist" placeholder="이름 검색"></label></div>
   <div class="cmrow"><button type="button" class="mini" data-fence title="코드 상자를 넣습니다">＋ 코드 상자</button><button type="button" class="mini" data-fromac title="이 노트의 '처리 내용'을 댓글에 넣습니다">처리 내용 넣기</button><button type="button" class="mini" data-add-file ${ok?"":"disabled"}>＋ 파일 첨부</button><input type="file" data-file-input multiple hidden><span class="cmmsg"></span><span class="sp"></span>
     <button type="button" class="primary" data-send ${ok?"":"disabled"}>올리기</button></div></div>`;
}
async function loadStatuses(){if(rmStatuses)return rmStatuses;try{rmStatuses=await api("/api/rm/statuses")}catch(e){rmStatuses=null}return rmStatuses}
async function loadMembers(n){
  if(rmMemFor===n.issue_id)return rmMem;
  try{rmMem=await api("/api/rm/members?issue_id="+n.issue_id);rmMemFor=n.issue_id}catch(e){rmMem=[];rmMemFor=0}
  let dl=$("#memlist");if(!dl){dl=document.createElement("datalist");dl.id="memlist";document.body.appendChild(dl)}
  dl.innerHTML=rmMem.map(m=>`<option value="${esc(m.name)}"></option>`).join("");
  return rmMem;
}
function resolveMember(txt,list){
  const t=(txt||"").trim();if(!t)return null;
  const ex=list.filter(m=>m.name===t);if(ex.length===1)return ex[0];
  const pt=list.filter(m=>m.name.includes(t));return pt.length===1?pt[0]:(ex[0]||null);
}
async function presetFill(n,k){   // 버튼을 누르면 아래 상태·담당자·개발담당자 칸도 같이 채운다 (칸을 고치면 그 값이 우선)
  const st=stageOf(n.issue_id),sts=wcfg().statuses,me={id:cfg.meId,name:cfg.meName||"나"};
  ["status_id","assigned_to_id","dev_id"].forEach(x=>delete st[x]);st.lbl={};st.preset=k;
  const sid={dev:sts.dev,confirm:sts.confirm,done:sts.done}[k];
  if(sid){st.status_id=sid;const o=rmStatuses&&rmStatuses.find(x=>x.id===sid);st.lbl.status=o?o.name:{dev:"개발중",confirm:"최종확인요청",done:"완료"}[k]}
  let asg=me;
  if(k==="confirm")asg={id:n.author_id||0,name:n.author};   // 담당자 = 일감 작성자. ID 를 아직 모르면(0) 서버가 일감을 다시 읽어 작성자로 정한다
  st.assigned_to_id=asg.id;st.lbl.assigned=asg.name;st.dev_id=me.id;st.lbl.dev=me.name;
}
const dropPreset=st=>{if(!(st.preset&&st.assigned_to_id===0))delete st.preset};   // 직접 고치면 버튼 선택은 풀고 그 값만 남긴다
function stageMsg(n){
  const st=stageOf(n.issue_id),l=st.lbl,parts=[];
  if(st.status_id)parts.push(`상태 → <b>${esc(l.status||"")}</b>`);
  if(st.assigned_to_id)parts.push(`담당자 → <b>${esc(l.assigned||"")}</b>`);
  if(st.dev_id)parts.push(`개발담당자 → <b>${esc(l.dev||"")}</b>`);
  const pre=st.preset?`<b>${WPRESETS.find(p=>p[0]===st.preset)[1]}</b> 선택됨 — `:"올릴 때 함께 바꿈: ";
  return parts.length?pre+parts.join(" · ")+(st.preset?" · <b>올리기</b>를 눌러야 올라가요":""):"";
}
function syncComposers(n,from){   // 아래 입력창과 떠 있는 창은 같은 초안·같은 선택을 보여 준다
  const st=stageOf(n.issue_id),d=draftOf(n.issue_id);
  document.querySelectorAll(`.cmp[data-issue="${n.issue_id}"]`).forEach(c=>{
    const ta=c.querySelector(".cmta");if(ta!==from&&edGet(ta)!==d)edInit(ta,d);
    if(ta._commentEditor&&ta!==from)ta._commentEditor.setPeer(d,cmFormatOf(n.issue_id));
    c.querySelector(".cmmsg").innerHTML=stageMsg(n);
    const sel=c.querySelector(".stsel");if(sel)sel.value=st.status_id?String(st.status_id):"";
    c.querySelectorAll("[data-w]").forEach(b=>b.classList.toggle("primary",st.preset===b.dataset.w));
    const ws=c.querySelector(".wsel");if(ws)ws.value=st.preset||"";
    c.querySelectorAll("[data-pk]").forEach(i=>{if(i!==document.activeElement)i.value=(st.lbl[i.dataset.pk==="dev_id"?"dev":"assigned"]||"")});
    cmRenderFiles(c,n);
  });
  setCmBusy(n,cmBusy.has(n.issue_id));
  updFab();
}
function wireComposer(root,n){
  if(!root)return;
  root.querySelectorAll(".cmp").forEach(c=>{
    const ta=c.querySelector(".cmta"),sel=c.querySelector(".stsel");
    edInit(ta,draftOf(n.issue_id));
    if(typeof mountCommentEditor==="function")mountCommentEditor(ta,{value:draftOf(n.issue_id),format:cmFormatOf(n.issue_id),issueId:n.issue_id,...cmImageOptions(n)});
    ta.addEventListener("input",()=>{setDraft(n.issue_id,edGet(ta));syncComposers(n,ta)});
    ta.addEventListener("keydown",e=>{if(!e.isComposing&&!ta._commentEditor?.composing&&e.keyCode!==229&&e.key==="Enter"&&(e.ctrlKey||e.metaKey)&&e.target.tagName!=="TEXTAREA"&&!e.target.closest?.(".ceimages")){e.preventDefault();if(ta._commentEditor?.codeAtSelection()){ta._commentEditor.exitCode();return}doWrite(n,{})}},true);   // 한국어 조합 중 Enter와 이미지 선택창에서는 전송하지 않는다.
    c.querySelectorAll("[data-w]").forEach(b=>b.onclick=async()=>{
      const st=stageOf(n.issue_id),k=b.dataset.w;
      if(st.preset===k){["preset","status_id","assigned_to_id","dev_id"].forEach(x=>delete st[x]);st.lbl={};syncComposers(n);return}   // 같은 버튼을 다시 누르면 선택 해제          // 같은 버튼을 다시 누르면 선택 해제
      if(!await ackFirst())return;
      await presetFill(n,k);syncComposers(n)});
    const ws=c.querySelector(".wsel");
    if(ws)ws.onchange=async()=>{   // 새 디자인의 선택칸: 버튼과 같은 동작
      const st=stageOf(n.issue_id),k=ws.value;
      if(!k){["preset","status_id","assigned_to_id","dev_id"].forEach(x=>delete st[x]);st.lbl={};syncComposers(n);return}
      if(!await ackFirst()){ws.value=st.preset||"";return}
      await presetFill(n,k);syncComposers(n)};
    c.querySelector("[data-send]").onclick=()=>doWrite(n,{});
    const fileInput=c.querySelector("[data-file-input]");
    c.querySelector("[data-add-file]").onclick=()=>fileInput.click();
    fileInput.onchange=()=>{cmAddFiles(n,Array.from(fileInput.files||[]));fileInput.value=""};
    c.querySelector("[data-fence]").onclick=()=>{addCodeBox(ta);setDraft(n.issue_id,edGet(ta));syncComposers(n,ta)};
    c.querySelector("[data-fromac]").onclick=()=>{
      const el=$("#ac"),t=(el?edGet(el):n.action||"").trim();if(!t){toast("처리 내용이 비어 있어요",2000);return}
      const cur0=edGet(ta),text=ta._commentEditor?.format==="html"?commentTextHTML(t):t;edInit(ta,(cur0?cur0+"\n":"")+text);setDraft(n.issue_id,edGet(ta));syncComposers(n,ta);const tb=ta.querySelector(".tb:last-of-type")||ta.lastElementChild;if(tb&&tb.focus)tb.focus()};
    loadStatuses().then(list=>{if(!list||!sel||sel.options.length>1)return;
      sel.insertAdjacentHTML("beforeend",list.filter(s=>!/^-+$/.test(s.name)).map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join(""));syncComposers(n)});
    sel.onchange=async()=>{const st=stageOf(n.issue_id);if(sel.value&&!await ackFirst()){sel.value=st.status_id?String(st.status_id):"";return}dropPreset(st);if(sel.value){st.status_id=+sel.value;st.lbl.status=sel.options[sel.selectedIndex].text}else{delete st.status_id;delete st.lbl.status}syncComposers(n)};
    c.querySelectorAll("[data-pk]").forEach(i=>{
      i.onfocus=()=>loadMembers(n);
      i.onchange=async()=>{
        const st=stageOf(n.issue_id),key=i.dataset.pk,lk=key==="dev_id"?"dev":"assigned";
        if(i.value.trim()&&!await ackFirst()){i.value=st.lbl[lk]||"";return}
        dropPreset(st);
        if(!i.value.trim()){delete st[key];delete st.lbl[lk];syncComposers(n);return}
        const m=resolveMember(i.value,await loadMembers(n));
        if(!m){toast("그 이름의 구성원을 한 명으로 찾지 못했어요. 목록에서 골라 주세요",3500);i.value=st.lbl[lk]||"";return}
        st[key]=m.id;st.lbl[lk]=m.name;syncComposers(n);
      };
    });
  });
  cmdWireComposer(root);
  syncComposers(n);
}
