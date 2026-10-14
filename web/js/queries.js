/* ---------- 보관함 (2.13): 코드 · 쿼리를 제목 · 용도 · 언어 · 코드 위치 · 연관 레드마인 · 태그와 함께 모아 두고 한 번에 복사한다 ----------
   트러블슈팅처럼 레드마인·전체 검색·요약과 무관한 독립 화면이다(이 화면 안의 검색 · 언어 · 태그 필터만 쓴다).
   노트·트러블슈팅·메모의 코드 상자에서 '📚 코드 보관함' 으로도 넣는다. 이름표(:이름 · #{이름} · ${이름}) 값 넣어 복사, 정리(포맷), 버전 메모, 내보내기/가져오기. */
let queries=[],qvLoaded=false,qvSel=null,qvEd=false,qvDraft=null,qvQ="",qvLang="",qvTag="";
const QV_DB=["Oracle","MySQL","PostgreSQL","MSSQL","SQLite","기타"];
async function qvLoad(force){if(qvLoaded&&!force)return;try{queries=await api("/api/queries");qvLoaded=true}catch(e){}}
const qvLangOf=q=>normLang(q.lang)||detectLang(q.sql);
const qvKind=()=>nav==="vaultQuery"?"query":"code";
const qvIsQuery=q=>!!q.db_kind||["sql","mybatis"].includes(qvLangOf(q));
const rmNos=t=>[...new Set((String(t||"").match(/[0-9]+/g)||[]).map(Number).filter(x=>x>0))];      // "#93857, 93860" -> [93857, 93860]
const rmTitle=no=>{const n=all.find(x=>x.issue_id===no);return n?n.subject:""};
const locsOf=t=>[...new Set(String(t||"").split(/[\n,]/).map(x=>x.trim().replace(/\s+/g," ")).filter(Boolean))];
const qvText=q=>[q.title,q.purpose,q.db_kind,langLabel(qvLangOf(q)),q.sql,q.tags.join(" "),q.code_locs.join(" "),q.rm_nos.map(no=>"#"+no+" "+rmTitle(no)).join(" ")].join("\n").toLowerCase();
const qvSort=()=>queries.sort((a,b)=>(b.pinned-a.pinned)||(b.updated_at||"").localeCompare(a.updated_at||"")||b.id-a.id);
function qvTagList(){const m=new Map();queries.forEach(q=>q.tags.forEach(g=>m.set(g,(m.get(g)||0)+1)));return [...m].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))}
const qvLangPill=q=>{const l=qvLangOf(q);return `<span class="tg ghost">${esc(langLabel(l))}${q.db_kind&&(l==="sql"||l==="mybatis")?" · "+esc(q.db_kind):""}</span>`};
function qvPut(r){const i=queries.findIndex(x=>x.id===r.id);if(i>=0)queries[i]=r;else queries.push(r);qvSort()}
/* 연관 레드마인 일감 칩: 내 노트에 있으면 노트를 열고, 없으면 레드마인 링크 */
const rmChip=no=>{const n=all.find(x=>x.issue_id===no);return n?`<span class="tp rmc" data-rmo="${no}" title="내 노트 열기">#${no} ${esc(n.subject.length>28?n.subject.slice(0,28)+"…":n.subject)}</span>`:`<span class="tp rmc ext" data-rmx="${no}" title="레드마인에서 열기">#${no} ↗</span>`};
function wireRmChips(root){
  root.querySelectorAll("[data-rmo]").forEach(c=>c.onclick=e=>{e.stopPropagation();openNote(+c.dataset.rmo)});
  root.querySelectorAll("[data-rmx]").forEach(c=>c.onclick=e=>{e.stopPropagation();openExternal(`${cfg.url}/issues/${c.dataset.rmx}`)});
}
/* 저장 공통: 같은 코드가 이미 있으면 알려 주고, 그래도 저장할지 묻는다 */
async function qvPost(x){
  let r=await post("/api/queries",x);
  if(r.dup){
    if(!await askC(`이미 같은 코드가 ‘${r.dup.title}’ 로 보관돼 있어요.\n그래도 새로 저장할까요?`,{title:"같은 코드가 있어요",ok:"새로 저장"}))return null;
    r=await post("/api/queries",{...x,force:true});
  }
  qvPut(r);return r;
}
/* 코드에서 위치 이름 짐작: class/interface 이름, MyBatis namespace 의 마지막 이름, 글 속의 파일 이름 */
function guessLocs(code){
  const out=[],add=s=>{if(s&&!out.includes(s)&&out.length<3)out.push(s)};
  const m1=/\b(?:class|interface|enum)\s+([A-Z]\w*)/.exec(code);if(m1)add(m1[1]);
  const m2=/namespace\s*=\s*"([\w.$]+)"/.exec(code);if(m2)add(m2[1].split(".").pop());
  (code.match(/\b[\w-]+\.(?:java|xml|js|jsp|html|sql|properties|yml)\b/g)||[]).slice(0,2).forEach(add);
  return out;
}
/* 코드 상자의 '📚 코드 보관함' */
async function qvSaveFrom(code,lang){
  if(!(code||"").trim()){toast("저장할 코드가 비어 있어요",2200);return}
  const rmDefault=view==="note"&&cur?[cur]:[];      // 노트 안에서 저장하면 그 노트 번호가 자동으로 연관된다
  const first=(code.split("\n").find(l=>l.trim())||"").trim().replace(/^(--|\/\*|\/\/|#)\s*/,"").replace(/\*\/\s*$/,"").slice(0,80);
  const nl=normLang(lang),det=detectLang(code);
  const body=`<div class="rngd"><div class="frow"><label>제목</label><input type="text" id="qsT" maxlength="200" value="${esc(first)}" style="flex:1"></div>
    <div class="frow"><label>용도</label><input type="text" id="qsP" placeholder="이 코드로 무엇을 하나요? (선택)" style="flex:1"></div>
    <div class="frow"><label>언어</label><select id="qsL"><option value="">자동 (${esc(langLabel(det))})</option>${LANGS.filter(x=>x[0]).map(([v,l])=>`<option value="${v}" ${v===nl?"selected":""}>${l}</option>`).join("")}</select>
      <label style="margin-left:10px">DB</label><select id="qsD"><option value="">선택 안 함</option>${QV_DB.map(k=>`<option>${k}</option>`).join("")}</select></div>
    <div class="frow"><label>코드 위치</label><input type="text" id="qsC" value="${esc(guessLocs(code).join(", "))}" placeholder="예) TravelGgController, TravelGgMapper.xml (선택)" style="flex:1"></div>
    <div class="frow"><label>태그</label><input type="text" id="qsG" placeholder="쉼표(,)로 구분" style="flex:1"></div>
    <div class="frow"><label>관련 일감</label><input type="text" id="qsR" value="${esc(rmDefault.map(x=>"#"+x).join(", "))}" placeholder="#93857, #93860 (선택)" style="flex:1"></div>
    <pre class="qv-peek">${hlHtml(code.split("\n").slice(0,8).join("\n"),nl||det)}${code.split("\n").length>8?"\n…":""}</pre></div>`;
  const r=await wdlg({title:"📚 보관함에 저장",body,ok:"저장",collect:()=>({title:$("#qsT").value,purpose:$("#qsP").value,lang:$("#qsL").value,db_kind:$("#qsD").value,code_locs:locsOf($("#qsC").value),tags:$("#qsG").value,rm_nos:rmNos($("#qsR").value)})});
  if(!r)return;
  try{const row=await qvPost({sql:code,...r});if(row)toast(`보관함에 저장했어요 ✓ (${row.title})`,2600)}
  catch(e){toast("저장하지 못했어요: "+e.message,5000)}
}
async function renderQueries(){
  await qvLoad();if(view!=="queries")return;
  if(qvSel&&!queries.some(q=>q.id===qvSel))qvSel=null;
  const kind=qvKind(),kindLabel=kind==="query"?"쿼리":"코드";
  $("#center").innerHTML=`<div class="tr-wrap"><div class="tr-side">
      <div class="nv-vault-title">보관함 · ${kindLabel}</div>
      <button type="button" class="primary" id="qvNew">＋ 새 ${kindLabel}</button>
      <input id="qvQ" placeholder="제목 · 용도 · 코드 · 위치 · 태그 검색" value="${esc(qvQ)}" autocomplete="off">
      <div class="seg qv-langs" id="qvLangs"></div><div class="chips" id="qvTags"></div>
      <div class="row qv-tools"><button type="button" class="mini" id="qvExp" title="보관한 코드를 파일(JSON)로 저장해요 (동료와 나눌 때)">⬇ 내보내기</button><button type="button" class="mini" id="qvImp" title="내보낸 파일에서 읽어 와요 (같은 코드는 건너뛰어요)">⬆ 가져오기</button><input type="file" id="qvFile" accept=".json,application/json" hidden></div>
      <div class="tr-list" id="qvList"></div></div>
    <div class="tr-main qv-main" id="qvMain"></div></div>`;
  $("#qvNew").onclick=()=>{qvSel=null;qvEd=true;qvDraft={id:null,title:"",purpose:"",db_kind:"",lang:kind==="query"?"sql":"",sql:"",tags:[],rm_nos:[],code_locs:[]};qvDrawList();qvDrawMain();setTimeout(()=>$("#qeTitle")&&$("#qeTitle").focus(),0)};
  $("#qvQ").oninput=e=>{qvQ=e.target.value.trim();qvDrawList()};
  $("#qvExp").onclick=e=>{
    const shown=qvFiltered(),cur0=queries.find(x=>x.id===qvSel);
    popMenu(e.currentTarget,[[`전체 ${queries.length}건`,()=>qvExport(queries,"전체")],[`지금 목록 ${shown.length}건`,()=>qvExport(shown,"목록")],...(cur0?[[`이 항목만 · ${cur0.title.slice(0,24)}`,()=>qvExport([cur0],"항목")]]:[])]);
  };
  $("#qvImp").onclick=()=>$("#qvFile").click();
  $("#qvFile").onchange=async e=>{const f=e.target.files[0];e.target.value="";if(f)qvImport(f)};
  qvDrawList();qvDrawMain();
}
function qvExport(list,what){
  if(!list.length){toast("내보낼 항목이 없어요",2200);return}
  const items=list.map(q=>({title:q.title,purpose:q.purpose,lang:q.lang,db_kind:q.db_kind,sql:q.sql,tags:q.tags,rm_nos:q.rm_nos,code_locs:q.code_locs}));
  const blob=new Blob([JSON.stringify({app:"redmine-notes",kind:"code-vault",version:1,exported_at:new Date().toISOString(),items},null,2)],{type:"application/json"});
  const a=document.createElement("a"),name=`코드쿼리-보관함-${what}-${fmt(new Date())}.json`;a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  toast(`${items.length}건을 ${name} 으로 저장했어요`,3200);
}
async function qvImport(file){
  let obj;try{obj=JSON.parse(await file.text())}catch(e){toast("읽을 수 없는 파일이에요 (JSON 이 아니에요)",4000);return}
  const items=Array.isArray(obj)?obj:obj&&Array.isArray(obj.items)?obj.items:null;
  if(!items||!items.length){toast("가져올 항목이 파일에 없어요",3500);return}
  if(!await askC(`${items.length}건을 가져올까요?\n이미 있는 코드(공백·대소문자만 다른 것 포함)는 건너뛰어요.`,{title:"보관함 가져오기",ok:"가져오기"}))return;
  try{const r=await post("/api/queries/import",{items});await qvLoad(true);if($("#qvList"))qvDrawList();toast(`${r.added}건 추가 · ${r.skipped}건은 이미 있어서 건너뜀${r.bad?` · ${r.bad}건은 형식이 달라 제외`:""}`,5000)}
  catch(e){toast("가져오지 못했어요: "+e.message,5000)}
}
function qvFiltered(){
  const q=qvQ.toLowerCase();
  return queries.filter(x=>(qvKind()==="query")===qvIsQuery(x)&&(!qvLang||qvLangOf(x)===qvLang)&&(!qvTag||x.tags.includes(qvTag))&&(!q||qvText(x).includes(q)));
}
function qvDrawList(){
  const list=qvFiltered();
  const kindRows=queries.filter(x=>(qvKind()==="query")===qvIsQuery(x));
  const cnt=new Map();kindRows.forEach(x=>{const l=qvLangOf(x);cnt.set(l,(cnt.get(l)||0)+1)});
  $("#qvLangs").innerHTML=[["","전체",kindRows.length],...[...cnt].sort((a,b)=>b[1]-a[1]).map(([l,c])=>[l,langLabel(l),c])].map(([k,l,c])=>`<button type="button" data-qd="${esc(k)}" class="${qvLang===k?"on":""}">${esc(l)} <small>${c}</small></button>`).join("");
  const tags=new Map();kindRows.forEach(x=>x.tags.forEach(g=>tags.set(g,(tags.get(g)||0)+1)));
  $("#qvTags").innerHTML=[...tags].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,18).map(([g,n])=>`<span class="tp ${qvTag===g?"on":""}" data-tg="${esc(g)}">${esc(g)}<small>${n}</small></span>`).join("");
  $("#qvList").innerHTML=list.map(x=>`<div class="tr-item ${x.id===qvSel&&!qvEd?"on":""}" data-qid="${x.id}"><div class="tt">${x.pinned?"📌 ":""}${esc(x.title)}</div>
      <div class="ts">${qvLangPill(x)}${x.use_count?`<span>사용 ${x.use_count}회</span>`:""}${x.tags.slice(0,3).map(g=>`<span class="tg ghost">${esc(g)}</span>`).join("")}</div>
      <div class="sn">${esc((x.purpose.trim()||x.sql.trim()).replace(/\s+/g," ").slice(0,120))}</div>${(x.code_locs.length||x.rm_nos.length)?`<div class="ts">${x.code_locs.slice(0,2).map(l=>`<span class="tg ghost">📄 ${esc(l.length>22?l.slice(0,22)+"…":l)}</span>`).join("")}${x.rm_nos.slice(0,3).map(no=>`<span class="tg ghost">#${no}</span>`).join("")}${x.rm_nos.length>3?`<span>+${x.rm_nos.length-3}</span>`:""}</div>`:""}</div>`).join("")
    ||`<div class="meta" style="padding:10px 4px">${kindRows.length?"조건에 맞는 항목이 없어요":`아직 보관한 ${kindLabel}가 없어요. ＋ 새 ${kindLabel}로 시작하거나, 노트의 코드 상자에서 ‘📚 보관함’ 을 눌러 보세요`}</div>`;
  document.querySelectorAll("#qvLangs [data-qd]").forEach(b=>b.onclick=()=>{qvLang=b.dataset.qd;qvDrawList()});
  document.querySelectorAll("#qvTags [data-tg]").forEach(b=>b.onclick=()=>{qvTag=qvTag===b.dataset.tg?"":b.dataset.tg;qvDrawList()});
  document.querySelectorAll("#qvList [data-qid]").forEach(b=>b.onclick=async()=>{
    if(qvEd&&qvDirty()&&!await askC("쓰던 내용이 저장되지 않았어요. 버리고 이동할까요?"))return;
    qvSel=+b.dataset.qid;qvEd=false;qvDraft=null;qvDrawList();qvDrawMain()});
}
async function qvUse(x){      // 복사해서 썼다고 기록 (사용 횟수 +1)
  try{const r=await post("/api/queries/use",{id:x.id});Object.assign(x,{use_count:r.use_count,last_used_at:r.last_used_at});
    const u=$("#qvUse");if(u)u.textContent=`사용 ${x.use_count}회`;if($("#qvList"))qvDrawList()}catch(e){}
}
const qvCopy=async x=>{if(await copyCodeSmart(x.sql,qvLangOf(x),"복사했어요"))qvUse(x)};
/* 정리한 결과를 바로 저장 (이전 내용은 버전 메모로 남는다) */
async function qvFormatSave(x){
  const r=await codeFmtDialog(x.sql,qvLangOf(x));if(!r)return;
  try{const row=await qvPost({id:x.id,title:x.title,purpose:x.purpose,db_kind:x.db_kind,lang:x.lang||(r.lang!==detectLang(x.sql)?r.lang:""),sql:r.text,tags:x.tags,rm_nos:x.rm_nos,code_locs:x.code_locs});
    if(row){toast("정리한 코드로 저장했어요 (이전 내용은 🕘 이전 버전에 남아 있어요)",3500);if($("#qvList")){qvDrawList();qvDrawMain()}}}catch(e){toast("저장하지 못했어요: "+e.message,5000)}
}
/* 이전 버전 메모: 목록에서 골라 내용을 보고 되돌린다 */
async function qvVersions(x){
  let vs=[];try{vs=await api("/api/queries/versions?id="+x.id)}catch(e){toast("불러오지 못했어요: "+e.message,4000);return}
  if(!vs.length){toast("이전 버전이 아직 없어요. 내용을 고쳐 저장하면 이전 내용이 남아요",3200);return}
  let pick=vs[0];
  const draw=()=>{
    $("#qvvList").innerHTML=vs.map(v=>`<div class="qvv ${v.id===pick.id?"on":""}" data-vid="${v.id}"><b>${esc((v.saved_at||"").replace("T"," ").slice(0,16))}</b><span class="meta">${esc(v.title)}</span></div>`).join("");
    $("#qvvPre").innerHTML=hlHtml(pick.sql,normLang(pick.lang)||detectLang(pick.sql));
    document.querySelectorAll("#qvvList [data-vid]").forEach(e=>e.onclick=()=>{pick=vs.find(v=>v.id===+e.dataset.vid);draw()});
  };
  const pr=wdlg({title:`🕘 이전 버전 (${vs.length})`,body:`<div class="qvv-wrap"><div class="qvv-list" id="qvvList"></div><pre class="cf-pre" id="qvvPre"></pre></div><div class="meta" style="margin-top:6px">되돌려도 지금 내용은 새 이전 버전으로 남아서 다시 돌아올 수 있어요. 항목마다 최근 10개를 보관해요.</div>`,ok:"이 버전으로 되돌리기",cancel:"닫기",wide:true});
  draw();
  if(!await pr)return;
  try{const row=await post("/api/queries/restore",{id:x.id,version_id:pick.id});qvPut(row);toast("이전 버전으로 되돌렸어요 ✓",2400);if($("#qvList")){qvDrawList();qvDrawMain()}}catch(e){toast("되돌리지 못했어요: "+e.message,5000)}
}
function qvDrawMain(){
  const el=$("#qvMain");if(!el)return;
  if(qvEd)return qvDrawEdit(el);
  const x=queries.find(v=>v.id===qvSel);
  if(!x){el.innerHTML=`<div class="empty" style="padding-top:8vh"><b>왼쪽에서 하나를 고르거나 새로 만드세요</b><b>${qvKind()==="query"?"쿼리":"코드"}</b>를 제목 · 용도 · 코드 위치 · 태그와 함께 모아 두고, <b>📋 복사</b> 한 번으로 꺼내 쓰는 곳이에요. <code class="ic">#{이름}</code> 같은 이름표는 값을 넣어 복사해요. 레드마인과 상관없이 이 PC에만 저장돼요.</div>`;return}
  const lg=qvLangOf(x),lines=hlLines(x.sql,lg).map(l=>`<div class="ln">${l||" "}</div>`).join(""),ph=findPlaceholders(x.sql,lg);
  el.innerHTML=`<div class="card tr-doc qv-doc"><div class="tr-hd"><h2>${x.pinned?"📌 ":""}${esc(x.title)}</h2>
      <button type="button" class="primary" id="qvCopy" title="${ph.length?"이름표에 값을 넣어 복사하고 사용 횟수를 올려요":"복사하고 사용 횟수를 올려요"}">📋 ${ph.length?"값 넣어 복사":"복사"}</button><button type="button" id="qvFmt" title="코드를 보기 좋게 정리해요 (미리보기에서 확인)">✨ 정리</button><button type="button" id="qvPin">${x.pinned?"고정 해제":"📌 고정"}</button><button type="button" id="qvEdit">편집</button><button type="button" id="qvDel">삭제</button></div>
    <div class="chips" style="margin-top:8px">${qvLangPill(x)}<span class="meta">${esc(x.day||"")} 작성${x.updated_at&&x.updated_at.slice(0,10)!==x.day?` · ${esc(x.updated_at.slice(0,10))} 수정`:""}</span><span class="meta" id="qvUse">사용 ${x.use_count}회</span>${x.last_used_at?`<span class="meta">마지막 ${esc(x.last_used_at.slice(0,10))}</span>`:""}<a class="meta" id="qvVer" style="cursor:pointer">🕘 이전 버전</a>
      ${x.tags.map(g=>`<span class="tp" data-tgo="${esc(g)}" title="이 태그로 목록 좁히기">${esc(g)}</span>`).join("")}</div>
    ${x.code_locs.length?`<div class="chips" style="margin-top:8px"><span class="meta">코드 위치</span>${x.code_locs.map(l=>`<span class="tp loc" data-loc="${esc(l)}" title="눌러서 복사">📄 ${esc(l)}</span>`).join("")}</div>`:""}
    ${x.rm_nos.length?`<div class="chips" style="margin-top:8px"><span class="meta">관련 레드마인</span>${x.rm_nos.map(rmChip).join("")}</div>`:""}
    ${x.purpose.trim()?`<div class="tr-sec"><h4>용도</h4><div style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(x.purpose)}</div></div>`:""}
    <div class="tr-sec"><h4>${qvIsQuery(x)?"쿼리":"코드"}</h4><div class="${pvClass()}"><div class="cbw"><button class="cp" id="qvCp">복사</button><span class="cblg">${esc(langLabel(lg))}</span><pre class="cb"><code>${lines}</code></pre></div></div>
      ${ph.length?`<div class="qv-phs"><span class="meta">이름표</span>${ph.map(n=>`<span class="tp ph" title="값은 복사할 때 입력해요">${esc(n)}</span>`).join("")}</div>`:""}</div></div>`;
  $("#qvCopy").onclick=()=>qvCopy(x);$("#qvCp").onclick=()=>qvCopy(x);
  $("#qvFmt").onclick=()=>qvFormatSave(x);
  $("#qvVer").onclick=()=>qvVersions(x);
  $("#qvPin").onclick=async()=>{try{const r=await post("/api/queries/pin",{id:x.id,pinned:!x.pinned});qvPut(r);toast(r.pinned?"📌 고정했어요 (목록 맨 위)":"고정을 풀었어요",1600);qvDrawList();qvDrawMain()}catch(e){toast(e.message,4000)}};
  $("#qvEdit").onclick=()=>{qvEd=true;qvDraft=JSON.parse(JSON.stringify(x));qvDrawList();qvDrawMain()};
  $("#qvDel").onclick=async()=>{if(!await askC(`‘${x.title}’ 을(를) 삭제할까요? 이전 버전도 함께 지워지고 되돌릴 수 없어요.`))return;
    try{await api("/api/queries/"+x.id,{method:"DELETE"});queries=queries.filter(v=>v.id!==x.id);qvSel=null;toast("삭제했어요",1800);qvDrawList();qvDrawMain()}catch(e){toast("삭제하지 못했어요: "+e.message,5000)}};
  el.querySelectorAll("[data-tgo]").forEach(c=>c.onclick=()=>{qvTag=c.dataset.tgo;qvDrawList()});
  el.querySelectorAll("[data-loc]").forEach(c=>c.onclick=()=>copyText(c.dataset.loc,"위치를 복사했어요"));
  wireRmChips(el);
}
function qvRead(){const g=id=>($(id)||{}).value||"",box=$("#qeBox"),ta=box&&box.querySelector("textarea");
  return {id:qvDraft&&qvDraft.id,title:g("#qeTitle"),purpose:g("#qePurpose"),db_kind:g("#qeDb"),lang:box?normLang(box.dataset.lang):"",
    tags:g("#qeTags").split(",").map(t=>t.trim()).filter(Boolean),sql:ta?ta.value:"",rm_nos:rmNos(g("#qeRm")),code_locs:locsOf(g("#qeLoc"))}}
const qvSig=d=>JSON.stringify([d.title,d.purpose,d.db_kind,d.lang,d.tags,d.sql,d.rm_nos,d.code_locs]);
const qvDirty=()=>!!(qvDraft&&$("#qeTitle")&&qvDraft._base!=null&&qvSig(qvRead())!==qvDraft._base);
function qvDrawEdit(el){
  const d=qvDraft,top=qvTagList().slice(0,12).map(v=>v[0]);
  el.innerHTML=`<div class="card tr-doc tr-ed">
    <label class="tr-lab" for="qeTitle" style="margin-top:0">제목</label><input type="text" id="qeTitle" maxlength="200" placeholder="예) 당해년도 총 예약횟수 조회" value="${esc(d.title)}">
    <label class="tr-lab" for="qePurpose">용도 <small class="meta">(선택 · 언제 쓰는 코드인지)</small></label><textarea id="qePurpose" rows="3" placeholder="예) 문의가 왔을 때 회원번호로 가입일과 상태를 확인">${esc(d.purpose)}</textarea>
    <label class="tr-lab" for="qeLoc">코드 위치 <small class="meta">(선택 · 클래스/파일 이름. 여러 개는 쉼표로)</small></label><input type="text" id="qeLoc" placeholder="예) TravelGgController, TravelGgMapper.xml" value="${esc((d.code_locs||[]).join(", "))}">
    <label class="tr-lab" for="qeDb">DB 종류 <small class="meta">(SQL 일 때)</small></label><select id="qeDb"><option value="">선택 안 함</option>${QV_DB.map(k=>`<option ${d.db_kind===k?"selected":""}>${k}</option>`).join("")}</select>
    <label class="tr-lab" for="qeTags">태그 <small class="meta">쉼표(,)로 구분</small></label><input type="text" id="qeTags" placeholder="예) 예약, 조회" value="${esc(d.tags.join(", "))}">
    ${top.length?`<div class="chips" style="margin-top:6px"><span class="meta">자주 쓴 태그</span>${top.map(g=>`<span class="tp" data-addtag="${esc(g)}">${esc(g)}</span>`).join("")}</div>`:""}
    <label class="tr-lab" for="qeRm">관련 레드마인 번호 <small class="meta">(선택 · 여러 개는 쉼표로 · 노트에 보여요)</small></label><input type="text" id="qeRm" placeholder="#93857, #93860" value="${esc((d.rm_nos||[]).map(x=>"#"+x).join(", "))}">
    <div class="tr-lab">코드/쿼리 <small class="meta">언어는 자동으로 추정해요 (왼쪽 위 선택으로 바꿀 수 있어요) · ✨ 정리로 보기 좋게</small></div><div class="rte qv-rte" id="qeRte"></div>
    <div class="row" style="margin-top:14px"><button type="button" class="primary" id="qeSave">저장</button><button type="button" id="qeCancel">취소</button><span class="meta">Ctrl+Enter 로 저장 · Esc 로 취소</span></div></div>`;
  const box=mkCode(d.sql||"",d.lang||"");box.id="qeBox";box.dataset.keep="1";$("#qeRte").appendChild(box);applyFmt($("#qeRte"));      // 노트의 코드 상자와 같은 부품(색칠 · 언어 선택 · 정리)
  if(!d.sql)setTimeout(()=>box.querySelector("textarea").focus(),0);
  qvDraft._base=qvSig(qvRead());
  el.querySelectorAll("[data-addtag]").forEach(c=>c.onclick=()=>{const i=$("#qeTags"),cur=i.value.split(",").map(t=>t.trim()).filter(Boolean),g=c.dataset.addtag,k=cur.indexOf(g);if(k>=0)cur.splice(k,1);else cur.push(g);i.value=cur.join(", ")});
  const cancel=async()=>{if(qvDirty()&&!await askC("쓰던 내용이 저장되지 않았어요. 버릴까요?"))return;qvEd=false;qvDraft=null;qvDrawList();qvDrawMain()};
  const save=async()=>{const x=qvRead();if(!x.sql.trim()){toast("코드/쿼리를 적어 주세요",2500);box.querySelector("textarea").focus();return}
    try{const r=await qvPost(x);if(!r)return;qvSel=r.id;qvEd=false;qvDraft=null;toast("저장했어요 ✓",1800);qvDrawList();qvDrawMain()}
    catch(e){toast("저장하지 못했어요: "+e.message,5000)}};
  $("#qeSave").onclick=save;$("#qeCancel").onclick=cancel;
  el.onkeydown=e=>{if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault();e.stopPropagation();save()}else if(e.key==="Escape"&&!e.isComposing){e.preventDefault();e.stopPropagation();cancel()}};
}
/* 다른 화면 연결: 코드 이력(이름) · 노트(일감 번호) */
const qvTok=(()=>{const c=new Map();return q=>{const k=q.id+"|"+q.updated_at;if(c.has(k))return c.get(k);const t=[q.title,q.purpose,q.sql,q.code_locs.join(" ")].join("\n");c.set(k,t);return t}})();
function qvRelHtml(token){      // 코드 이력 화면의 '관련 코드/쿼리' (일감 건수에는 포함하지 않는다)
  if(!qvLoaded||!queries.length)return "";
  const re=new RegExp("(^|[^A-Za-z0-9_])"+escRe(token)+"([^A-Za-z0-9_]|$)","i"),rel=queries.filter(q=>re.test(qvTok(q)));
  if(!rel.length)return "";
  return `<div class="card"><div class="fhd"><span>📚 관련 코드/쿼리</span><small>${rel.length}건 · 코드/쿼리 보관함에서 이 이름이 나오는 것 · 제목을 누르면 코드가 팝업으로 떠요 · 아래 일감 건수에는 포함되지 않아요</small></div>${rel.map(q=>`<div class="tr-rel" data-qvp="${q.id}">${qvLangPill(q)} <b>${esc(q.title)}</b> <span class="meta">${esc(q.code_locs.slice(0,2).join(", "))}</span></div>`).join("")}</div>`;
}
function wireQvRel(root){root.querySelectorAll("[data-qvp]").forEach(b=>b.onclick=()=>qvPopup(+b.dataset.qvp))}
/* 제목을 누르면 코드가 팝업으로: 색칠된 코드 · 복사(이름표 값 넣기) · 보관함에서 열기 */
async function qvPopup(id){
  await qvLoad();const x=queries.find(v=>v.id===id);if(!x){toast("보관함에서 지워진 항목이에요",2500);return}
  const lg=qvLangOf(x),ph=findPlaceholders(x.sql,lg);
  const body=`<div class="qvpop"><div class="chips">${qvLangPill(x)}${x.code_locs.map(l=>`<span class="tp loc" data-loc="${esc(l)}" title="눌러서 복사">📄 ${esc(l)}</span>`).join("")}${x.tags.map(g=>`<span class="tg ghost">${esc(g)}</span>`).join("")}</div>
    ${x.purpose.trim()?`<div class="meta" style="margin:6px 0;white-space:pre-wrap">${esc(x.purpose)}</div>`:""}
    <pre class="cf-pre qvpop-code">${hlHtml(x.sql,lg)}</pre>
    ${ph.length?`<div class="meta" style="margin-top:6px">이름표 ${ph.map(n=>`<code class="ic">${esc(n)}</code>`).join(" ")} — 복사할 때 값을 넣어요</div>`:""}</div>`;
  const pr=wdlg({title:`📚 ${esc(x.title)}`,body,ok:ph.length?"📋 값 넣어 복사":"📋 복사",cancel:"닫기",wide:true});
  const more=document.createElement("button");more.type="button";more.textContent="보관함에서 열기";more.onclick=()=>{$("#wno").click();qvSel=x.id;qvEd=false;qvDraft=null;setNav(qvIsQuery(x)?"vaultQuery":"vaultCode")};
  const btns=document.querySelector("#wdlg .wbtn");if(btns)btns.insertBefore(more,$("#wno"));
  document.querySelectorAll("#wdlg [data-loc]").forEach(c=>c.onclick=()=>copyText(c.dataset.loc,"위치를 복사했어요"));
  if(await pr)qvCopy(x);
}
/* 노트 화면의 '관련 코드/쿼리': 이 일감 번호가 연관으로 걸린 항목. 제목만 보이고, 누르면 코드가 팝업으로 뜬다 */
async function renderNoteQueries(n){
  const box=$("#qvrel");if(!box)return;
  await qvLoad();if(!$("#qvrel")||cur!==n.issue_id)return;
  const rel=queries.filter(q=>q.rm_nos.includes(n.issue_id));
  if(!rel.length){box.innerHTML="";box.style.display="none";return}
  box.style.display="";
  box.innerHTML=`<div class="fhd"><span>📚 관련 코드/쿼리</span><small>${rel.length}건 · 제목을 누르면 코드가 팝업으로 떠요</small></div>`
    +rel.map(q=>`<div class="qrel" data-qvp="${q.id}" role="button" tabindex="0" title="눌러서 코드 보기"><b>${esc(q.title)}</b>${qvLangPill(q)}${q.code_locs.slice(0,2).map(l=>`<span class="tg ghost">📄 ${esc(l)}</span>`).join("")}</div>`).join("");
  box.querySelectorAll("[data-qvp]").forEach(b=>{const go=()=>qvPopup(+b.dataset.qvp);b.onclick=go;b.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();go()}}});
}
