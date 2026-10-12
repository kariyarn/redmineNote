/* ---------- 트러블슈팅: 레드마인과 무관한 독립 정리집 (증상 · 원인 · 해결 · 참고) ----------
   한 건 = 한 장의 문서. 전역 검색·주제 사전·그래프·요약·이력에는 걸리지 않고, 이 화면 안의 검색·태그·상태 필터만 쓴다.
   코드 이력과는 '읽기용 연결'만 한다: 글에 나온 코드 이름은 칩으로(누르면 코드 이력), 코드 이력에는 '관련 트러블슈팅' 목록으로 보인다. */
let troubles=[],trLoaded=false,trSel=null,trEd=false,trDraft=null,trQ="",trSt="",trTag="";
const TRST=["해결","진행 중","보류"],TRCLS={"해결":"완료","진행 중":"진행","보류":"대기"};
const trBadge=st=>`<span class="badge s-${TRCLS[st]||"중단"}">${esc(st)}</span>`;
async function trLoad(force){if(trLoaded&&!force)return;try{troubles=await api("/api/trouble");trLoaded=true}catch(e){}}
const trText=t=>[t.title,t.symptom,t.cause,t.solution,t.notes,t.tags.join(" ")].join("\n").toLowerCase();
function trTok(t){const k=t.id+"|"+t.updated_at;if(t._tk===k)return t._tm;t._tk=k;return t._tm=extractTokens([t.title,t.symptom,t.cause,t.solution,t.notes].join("\n"))}
const trMd=t=>`## ${t.title}\n\n- 상태: ${t.status}${t.tags.length?` · 태그: ${t.tags.join(", ")}`:""}${t.rm_no?` · 레드마인 #${t.rm_no}`:""}\n\n### 증상\n${t.symptom.trim()||"-"}\n\n### 원인\n${t.cause.trim()||"-"}\n\n### 해결\n${t.solution.trim()||"-"}\n`;
function openTrouble(id){trSel=id;trEd=false;trDraft=null;nav="trouble";view="trouble";renderAll()}
function trOpenCode(name){const e=tokIdx.get(name);if(!e)return;codeType=e.type;codeRel="all";codeMin2=false;codeQ="";openCode(name)}
function trRelHtml(token){   // 코드 이력 화면의 '관련 트러블슈팅' (일감 건수에는 포함하지 않는다)
  if(!trLoaded||!troubles.length)return "";
  const k=token.toLowerCase(),rel=troubles.filter(t=>[...trTok(t).keys()].some(x=>x.toLowerCase()===k));
  if(!rel.length)return "";
  return `<div class="card"><div class="fhd"><span>관련 트러블슈팅</span><small>${rel.length}건 · 아래 일감 건수에는 포함되지 않아요</small></div>${rel.map(t=>`<div class="tr-rel" data-trop="${t.id}">${trBadge(t.status)} <b>${esc(t.title)}</b> <span class="meta">${esc(t.day||"")}</span></div>`).join("")}</div>`;
}
function trTags(){const m=new Map();troubles.forEach(t=>t.tags.forEach(g=>m.set(g,(m.get(g)||0)+1)));return [...m].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))}
async function renderTrouble(){
  await trLoad();if(view!=="trouble")return;
  if(trSel&&!troubles.some(t=>t.id===trSel))trSel=null;
  $("#center").innerHTML=`<div class="tr-wrap"><div class="tr-side">
      <button type="button" class="primary" id="trNew">＋ 새 트러블슈팅</button>
      <input id="trQ" placeholder="제목 · 증상 · 원인 · 해결 · 태그 검색" value="${esc(trQ)}" autocomplete="off">
      <div class="seg" id="trSt"></div><div class="chips" id="trTags"></div>
      <div class="tr-list" id="trList"></div></div>
    <div class="tr-main" id="trMain"></div></div>`;
  $("#trNew").onclick=()=>{trSel=null;trEd=true;trDraft={id:null,title:"",status:"진행 중",tags:[],rm_no:"",symptom:"",cause:"",solution:"",notes:""};trDrawList();trDrawMain();setTimeout(()=>$("#teTitle")&&$("#teTitle").focus(),0)};
  $("#trQ").oninput=e=>{trQ=e.target.value.trim();trDrawList()};
  trDrawList();trDrawMain();
}
function trDrawList(){
  const q=trQ.toLowerCase();
  const list=troubles.filter(t=>(!trSt||t.status===trSt)&&(!trTag||t.tags.includes(trTag))&&(!q||trText(t).includes(q)));
  $("#trSt").innerHTML=[["","전체"],...TRST.map(x=>[x,x])].map(([k,l])=>`<button type="button" data-ts="${esc(k)}" class="${trSt===k?"on":""}">${l} <small>${k?troubles.filter(t=>t.status===k).length:troubles.length}</small></button>`).join("");
  const tg=trTags().slice(0,18);
  $("#trTags").innerHTML=tg.map(([g,n])=>`<span class="tp ${trTag===g?"on":""}" data-tg="${esc(g)}">${esc(g)}<small>${n}</small></span>`).join("");
  $("#trList").innerHTML=list.map(t=>`<div class="tr-item ${t.id===trSel&&!trEd?"on":""}" data-tid="${t.id}"><div class="tt">${esc(t.title)}</div>
      <div class="ts">${trBadge(t.status)}<span>${esc(t.day||"")}</span>${t.tags.slice(0,3).map(g=>`<span class="tg ghost">${esc(g)}</span>`).join("")}</div>
      ${t.symptom.trim()?`<div class="sn">${esc(t.symptom.trim().replace(/\s+/g," ").slice(0,120))}</div>`:""}</div>`).join("")
    ||`<div class="meta" style="padding:10px 4px">${troubles.length?"조건에 맞는 항목이 없어요":"아직 정리한 트러블슈팅이 없어요. ＋ 새 트러블슈팅으로 시작하세요"}</div>`;
  document.querySelectorAll("#trSt [data-ts]").forEach(b=>b.onclick=()=>{trSt=b.dataset.ts;trDrawList()});
  document.querySelectorAll("#trTags [data-tg]").forEach(b=>b.onclick=()=>{trTag=trTag===b.dataset.tg?"":b.dataset.tg;trDrawList()});
  document.querySelectorAll("#trList [data-tid]").forEach(b=>b.onclick=()=>{if(trEd&&!trDirty()){}else if(trEd){if(!confirm("쓰던 내용이 저장되지 않았어요. 버리고 이동할까요?"))return}trSel=+b.dataset.tid;trEd=false;trDraft=null;trDrawList();trDrawMain()});
}
function trRead(){const g=id=>($(id)||{}).value||"",ed=id=>$(id)?edGet($(id)):"";const st=document.querySelector("#teSt .on");
  return {id:trDraft&&trDraft.id,title:g("#teTitle"),status:st?st.dataset.st:"진행 중",tags:g("#teTags").split(",").map(x=>x.trim()).filter(Boolean),rm_no:g("#teRm"),symptom:ed("#teSym"),cause:ed("#teCause"),solution:ed("#teSol"),notes:ed("#teNote")}}
const trSig=d=>JSON.stringify([d.title,d.status,d.tags,String(d.rm_no||"").replace(/\D/g,""),d.symptom,d.cause,d.solution,d.notes]);
function trDirty(){return !!(trDraft&&$("#teTitle")&&trDraft._base!=null&&trSig(trRead())!==trDraft._base)}      // 편집기가 정리한 모양을 기준으로 '바뀌었나' 판단
function trDrawMain(){
  const el=$("#trMain");if(!el)return;
  if(trEd)return trDrawEdit(el);
  const t=troubles.find(x=>x.id===trSel);
  if(!t){el.innerHTML=`<div class="empty" style="padding-top:8vh"><b>왼쪽에서 하나를 고르거나 새로 만드세요</b>한 번 겪은 문제를 <b>증상 → 원인 → 해결</b> 순서로 정리해 두는 곳이에요. 같은 문제를 또 만났을 때 바로 꺼내 쓰세요. 레드마인과 상관없이 이 PC에만 저장돼요.</div>`;return}
  const toks=[...trTok(t)].filter(([n])=>!COMMON_COLS.has(n)).slice(0,24);
  const sec=(label,txt)=>`<div class="tr-sec"><h4>${label}</h4>${txt.trim()?`<div class="${pvClass()}">${renderMd(txt)}</div>`:`<div class="none">(적지 않았어요)</div>`}</div>`;
  el.innerHTML=`<div class="card tr-doc"><div class="tr-hd"><h2>${esc(t.title)}</h2><span class="sp"></span>
      <button type="button" id="trEdit">편집</button><button type="button" id="trCopy" title="증상 · 원인 · 해결을 마크다운으로 복사해요">마크다운 복사</button><button type="button" id="trDel">삭제</button></div>
    <div class="chips" style="margin-top:8px">${trBadge(t.status)}<span class="meta">${esc(t.day||"")} 작성${t.updated_at&&t.updated_at.slice(0,10)!==t.day?` · ${esc(t.updated_at.slice(0,10))} 수정`:""}</span>
      ${t.tags.map(g=>`<span class="tp" data-tgo="${esc(g)}" title="이 태그로 목록 좁히기">${esc(g)}</span>`).join("")}
      ${t.rm_no?`<a href="#" id="trRm" class="meta">레드마인 #${esc(t.rm_no)} ↗</a>`:""}</div>
    ${toks.length?`<div class="chips" style="margin-top:8px"><span class="meta">글에 나온 코드 이름</span>${toks.map(([n,ty])=>{const e=tokIdx.get(n);return e?`<span class="tok" data-trtok="${esc(n)}" title="코드 이력에서 보기">${typePill(ty)}${esc(n)}<span class="n">${e.notes.length}</span></span>`:`<span class="tok dim" title="아직 내 노트에는 나오지 않은 이름이에요">${typePill(ty)}${esc(n)}</span>`}).join("")}</div>`:""}
    ${sec("증상",t.symptom)}${sec("원인",t.cause)}${sec("해결 방법",t.solution)}${sec("재발 방지 · 참고",t.notes)}</div>`;
  $("#trEdit").onclick=()=>{trEd=true;trDraft=JSON.parse(JSON.stringify(t));trDrawList();trDrawMain()};
  $("#trCopy").onclick=()=>copyText(trMd(t),"마크다운으로 복사했어요");
  $("#trDel").onclick=async()=>{if(!await askC(`‘${t.title}’ 을(를) 삭제할까요? 되돌릴 수 없어요.`))return;
    try{await api("/api/trouble/"+t.id,{method:"DELETE"});troubles=troubles.filter(x=>x.id!==t.id);trSel=null;toast("삭제했어요",1800);trDrawList();trDrawMain()}catch(e){toast("삭제하지 못했어요: "+e.message,5000)}};
  if($("#trRm"))$("#trRm").onclick=e=>{e.preventDefault();openExternal(`${cfg.url}/issues/${t.rm_no}`)};
  el.querySelectorAll("[data-trtok]").forEach(c=>c.onclick=()=>trOpenCode(c.dataset.trtok));
  el.querySelectorAll("[data-tgo]").forEach(c=>c.onclick=()=>{trTag=c.dataset.tgo;trDrawList()});
  wireCp(el);
}
function trDrawEdit(el){
  const d=trDraft,top=trTags().slice(0,12).map(x=>x[0]);
  const ta=(id,label,key,ph)=>`<div class="tr-lab">${label}<button type="button" class="mini" data-trcode="${id}" style="margin-left:8px" title="코드 상자를 추가해요 (백틱 3개 + Enter 로도 돼요)">＋ 코드 상자</button></div><div class="rte tr-rte" id="${id}" data-ph="${esc(ph)}"></div>`;
  el.innerHTML=`<div class="card tr-doc tr-ed">
    <label class="tr-lab" for="teTitle" style="margin-top:0">제목</label><input type="text" id="teTitle" maxlength="200" placeholder="예) 쿠폰 발급 시 NullPointerException" value="${esc(d.title)}">
    <label class="tr-lab">상태</label><div class="seg" id="teSt">${TRST.map(x=>`<button type="button" data-st="${x}" class="${d.status===x?"on":""}">${x}</button>`).join("")}</div>
    <label class="tr-lab" for="teTags">태그 <small class="meta">쉼표(,)로 구분</small></label><input type="text" id="teTags" placeholder="예) oracle, 쿠폰, 배포" value="${esc(d.tags.join(", "))}">
    ${top.length?`<div class="chips" style="margin-top:6px"><span class="meta">자주 쓴 태그</span>${top.map(g=>`<span class="tp" data-addtag="${esc(g)}">${esc(g)}</span>`).join("")}</div>`:""}
    <label class="tr-lab" for="teRm">관련 레드마인 번호 <small class="meta">(선택 · 링크로만 연결돼요)</small></label><input type="text" id="teRm" placeholder="#93792" style="width:10rem" value="${esc(d.rm_no?"#"+d.rm_no:"")}">
    ${ta("teSym","증상","symptom","어떤 일이 일어났나요? 오류 메시지·재현 방법. ``` 로 감싸면 코드 상자가 돼요")}
    ${ta("teCause","원인","cause","왜 그랬나요?")}
    ${ta("teSol","해결 방법","solution","어떻게 고쳤나요? 쿼리·명령은 ``` 로 감싸 주세요")}
    ${ta("teNote","재발 방지 · 참고","notes","다음에 조심할 점, 참고 링크 등")}
    <div class="row" style="margin-top:14px"><button type="button" class="primary" id="teSave">저장</button><button type="button" id="teCancel">취소</button><span class="meta">Ctrl+Enter 로 저장 · Esc 로 취소</span></div></div>`;
  [["teSym","symptom"],["teCause","cause"],["teSol","solution"],["teNote","notes"]].forEach(([id,k])=>edInit($("#"+id),d[k]||""));      // 노트와 같은 편집기: 쓰는 자리에서 바로 코드 상자
  el.querySelectorAll("[data-trcode]").forEach(b=>b.onclick=()=>addCodeBox($("#"+b.dataset.trcode)));
  trDraft._base=trSig(trRead());
  el.querySelectorAll("#teSt [data-st]").forEach(b=>b.onclick=()=>{el.querySelectorAll("#teSt button").forEach(x=>x.classList.toggle("on",x===b))});
  el.querySelectorAll("[data-addtag]").forEach(c=>c.onclick=()=>{const i=$("#teTags"),cur=i.value.split(",").map(x=>x.trim()).filter(Boolean),g=c.dataset.addtag,k=cur.indexOf(g);if(k>=0)cur.splice(k,1);else cur.push(g);i.value=cur.join(", ")});
  const cancel=async()=>{if(trDirty()&&!await askC("쓰던 내용이 저장되지 않았어요. 버릴까요?"))return;trEd=false;trDraft=null;trDrawList();trDrawMain()};
  const save=async()=>{const x=trRead();if(!x.title.trim()){toast("제목을 적어 주세요",2500);$("#teTitle").focus();return}
    try{const r=await post("/api/trouble",x);const i=troubles.findIndex(t=>t.id===r.id);if(i>=0)troubles[i]=r;else troubles.unshift(r);
      troubles.sort((a,b)=>(b.updated_at||"").localeCompare(a.updated_at||"")||b.id-a.id);trSel=r.id;trEd=false;trDraft=null;toast("저장했어요 ✓",1800);trDrawList();trDrawMain()}
    catch(e){toast("저장하지 못했어요: "+e.message,5000)}};
  $("#teSave").onclick=save;$("#teCancel").onclick=cancel;
  el.onkeydown=e=>{if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault();save()}else if(e.key==="Escape"&&!e.isComposing){e.preventDefault();cancel()}};
}
