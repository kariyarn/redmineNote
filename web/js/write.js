/* ---------- 2.1 : 레드마인에 쓰기 (댓글 · 상태 · 담당자) ----------
   쓰는 것은 이 세 가지뿐이고, 서버가 허용 목록(시험 모드)과 보낼 수 있는 항목을 한 번 더 막는다.
   댓글만 올릴 때는 확인 창 없이 바로 올리고, 상태·담당자가 바뀔 때는 처음에만 '변경 전 → 후'를 확인한다(다시 보지 않기 가능). */
const cmDraft=new Map(),cmStage=new Map(),cmBusy=new Set();
let cmOpen=false,rmStatuses=null,rmMem=[],rmMemFor=0;
const wcfg=()=>cfg.write||{allow:[],test:false,statuses:{dev:11,confirm:15,done:5}};
const canWrite=n=>{const w=wcfg();return !w.test||w.allow.includes(n.issue_id)};
const curNote=()=>all.find(x=>x.issue_id===cur);
const draftOf=id=>{if(!cmDraft.has(id)){let v="";try{v=localStorage.getItem("rncm:"+id)||""}catch(e){}cmDraft.set(id,v)}return cmDraft.get(id)};
const setDraft=(id,v)=>{cmDraft.set(id,v);try{v?localStorage.setItem("rncm:"+id,v):localStorage.removeItem("rncm:"+id)}catch(e){}};
const stageOf=id=>{if(!cmStage.has(id))cmStage.set(id,{lbl:{}});return cmStage.get(id)};
const WPRESETS=[["dev","개발중"],["confirm","최종확인요청"],["done","완료"],["me","나로 지정"]];
const PRESET_TIP={dev:"상태 → 개발중 · 담당자와 개발담당자 → 나",confirm:"상태 → 최종확인요청 · 담당자 → 일감 작성자 · 개발담당자 → 나",done:"상태 → 완료 · 담당자와 개발담당자 → 나",me:"담당자와 개발담당자 → 나 (상태는 그대로)"};
function composerHtml(k,n){
  const ok=canWrite(n),w=wcfg();
  return `<div class="cmp" data-k="${k}">
   ${ok?"":`<div class="cmnote">시험 모드예요: ${w.allow.map(x=>"#"+x).join(", ")} 에서만 레드마인에 올릴 수 있어요. 쓴 내용은 임시 저장됩니다.</div>`}
   <div class="rte cmta" data-ph="댓글을 쓰세요 · Ctrl+Enter 로 올리기 · &#96;&#96;&#96; + Enter 로 코드 상자 (상자 안에서는 Ctrl+Enter = 상자 밖으로)"></div>
   <div class="cmcmd" aria-label="댓글 명령어"></div>
   <div class="cmrow">${V2()   // 새 디자인: 버튼 4개 대신 같은 동작의 선택칸 하나 (고르기만 하고, 올리기를 눌러야 올라간다)
     ?`<select class="wsel" title="올릴 때 상태 · 담당자를 같이 바꿉니다 (올리기를 눌러야 올라갑니다)" ${ok?"":"disabled"}><option value="">상태 · 담당 그대로</option>${WPRESETS.map(([p,l])=>`<option value="${p}" title="${PRESET_TIP[p]}">${l}${{dev:" (나에게)",confirm:" (작성자에게)",done:"",me:""}[p]}</option>`).join("")}</select>`
     :WPRESETS.map(([p,l])=>`<button type="button" data-w="${p}" title="${PRESET_TIP[p]} — 고르기만 하고, 올리기를 눌러야 올라갑니다" ${ok?"":"disabled"}>${l}</button>`).join("")}
     <select class="stsel" title="상태만 바꿀 때 (올리기를 눌러야 올라갑니다)"><option value="">상태만 변경…</option></select></div>
   <div class="cmrow"><label>담당자 <input class="pk" data-pk="assigned_to_id" list="memlist" placeholder="이름 검색"></label><label>개발담당자 <input class="pk" data-pk="dev_id" list="memlist" placeholder="이름 검색"></label></div>
   <div class="cmrow"><button type="button" class="mini" data-fence title="코드 상자를 넣습니다">＋ 코드 상자</button><button type="button" class="mini" data-fromac title="이 노트의 '처리 내용'을 댓글에 넣습니다">처리 내용 넣기</button><span class="cmmsg"></span><span class="sp"></span>
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
  document.querySelectorAll(".cmp").forEach(c=>{
    const ta=c.querySelector(".cmta");if(ta!==from&&edGet(ta)!==d)edInit(ta,d);
    c.querySelector(".cmmsg").innerHTML=stageMsg(n);
    const sel=c.querySelector(".stsel");if(sel)sel.value=st.status_id?String(st.status_id):"";
    c.querySelectorAll("[data-w]").forEach(b=>b.classList.toggle("primary",st.preset===b.dataset.w));
    const ws=c.querySelector(".wsel");if(ws)ws.value=st.preset||"";
    c.querySelectorAll("[data-pk]").forEach(i=>{if(i!==document.activeElement)i.value=(st.lbl[i.dataset.pk==="dev_id"?"dev":"assigned"]||"")});
  });
  updFab();
}
function wireComposer(root,n){
  if(!root)return;
  root.querySelectorAll(".cmp").forEach(c=>{
    const ta=c.querySelector(".cmta"),sel=c.querySelector(".stsel");
    edInit(ta,draftOf(n.issue_id));
    ta.addEventListener("input",()=>{setDraft(n.issue_id,edGet(ta));syncComposers(n,ta)});
    ta.addEventListener("keydown",e=>{if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)&&e.target.tagName!=="TEXTAREA"){e.preventDefault();doWrite(n,{})}},true);   // 코드 상자 안(TEXTAREA)에서는 편집기의 '상자 밖으로 나가기'가 먼저
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
    c.querySelector("[data-fence]").onclick=()=>{addCodeBox(ta);setDraft(n.issue_id,edGet(ta));syncComposers(n,ta)};
    c.querySelector("[data-fromac]").onclick=()=>{
      const el=$("#ac"),t=(el?edGet(el):n.action||"").trim();if(!t){toast("처리 내용이 비어 있어요",2000);return}
      const cur0=edGet(ta);edInit(ta,(cur0?cur0+"\n":"")+t);setDraft(n.issue_id,edGet(ta));syncComposers(n,ta);const tb=ta.querySelector(".tb:last-of-type")||ta.lastElementChild;if(tb&&tb.focus)tb.focus()};
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
  syncComposers(n);
  cmdWireComposer(root);
}
