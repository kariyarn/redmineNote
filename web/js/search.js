/* ---------- 화면 확대/축소 막기 (크롬 기반이라 확대/축소하면 레이아웃이 어긋난다) ----------
   기본은 막힘: Ctrl+휠 · Ctrl +/- · 두 손가락 확대. 되돌리기용 Ctrl+0 은 항상 허용. 설정에서 허용으로 바꿀 수 있다. */
const zoomLocked=()=>!ui.allowZoom;
window.addEventListener("wheel",e=>{if(e.ctrlKey&&zoomLocked())e.preventDefault()},{passive:false,capture:true});
window.addEventListener("keydown",e=>{
  if(!(e.ctrlKey||e.metaKey)||!zoomLocked())return;
  if(["Equal","Minus","NumpadAdd","NumpadSubtract"].includes(e.code)||["+","-","=","_"].includes(e.key))e.preventDefault();
},true);
function checkZoom(){   // 이미 100% 가 아니면 한 번 알려 준다 (창 바깥 폭 ÷ 안쪽 폭)
  const r=window.outerWidth/Math.max(1,window.innerWidth);
  if(zoomLocked()&&(r>1.12||r<0.9))toast("화면 배율이 100% 가 아니에요. Ctrl+0 을 누르면 원래대로 돌아와요",7000);
}
/* ---------- 레드마인 전체 검색 (제목 · 번호). 본문·댓글 검색은 이 서버 API 가 지원하지 않아서 웹 검색 버튼으로 대신한다 ---------- */
let rmOn=false,rmT;
const rmS={q:"",items:[],total:0,offset:0,project:"",open:false,loading:false,err:"",projects:null,peek:{}};
rmS.tags=new Set();rmS.dirty=false;   // tags: 켜 둔 팀 태그([제휴본부] 같은 제목 앞 태그) / dirty: 조건을 바꿨지만 아직 다시 검색하지 않음
const RMPER=[["30","1개월"],["90","3개월"],["365","1년"],["0","전체"]];   // 검색 기간 (최근 N일 안에 바뀐 일감). 전체는 느릴 수 있다
const rmDays=()=>ui.rmDays!=null?String(ui.rmDays):"90";
function rmSoon(){clearTimeout(rmT);rmT=setTimeout(()=>rmRun(false),420)}
let rmSeq=0,rmCtl=null;
function rmStop(){      // 너무 오래 걸릴 때: 앱이 기다리기를 그만둔다 (레드마인 서버가 하던 조회는 알아서 끝난다. 읽기만 하는 요청이라 해는 없다)
  if(!rmS.loading)return;rmSeq++;if(rmCtl)rmCtl.abort();rmCtl=null;rmS.loading=false;rmS.stopped=true;if(rmOn)renderList();
}
async function rmRun(more){
  const q=$("#q").value.trim();
  if(rmCtl){rmCtl.abort();rmCtl=null}
  const my=++rmSeq;
  if(!q){rmS.q="";rmS.items=[];rmS.total=0;rmS.err="";rmS.loading=false;rmS.stopped=false;renderList();return}
  if(!more)rmS.offset=0;
  rmS.loading=true;rmS.stopped=false;rmS.err="";rmS.t0=Date.now();rmS.dirty=false;if(!more)rmS.tags.clear();renderList();
  const ctl=rmCtl=new AbortController();
  try{
    const r=await api(`/api/rm/search?q=${encodeURIComponent(q)}&project=${encodeURIComponent(rmS.project)}&open=${rmS.open?1:0}&days=${rmDays()}&offset=${more?rmS.offset:0}`,{signal:ctl.signal});
    if(my!==rmSeq)return;      // 그 사이 새로 검색했거나 중단했으면 버린다
    rmS.q=q;rmS.total=r.total;rmS.byNumber=!!r.byNumber;rmS.items=more?rmS.items.concat(r.issues):r.issues;rmS.offset=rmS.items.length;
  }catch(e){if(my!==rmSeq||e.name==="AbortError")return;rmS.err=e.message}
  rmCtl=null;rmS.loading=false;if(rmOn)renderList();
}
let rmFilSig="",rmPick=false,rmPickQ="";
const projShort=n=>{n=n||"";const m=n.match(/^\s*\[([^\]]{1,20})\]/);return m?m[1]:(n.length>9?n.slice(0,9)+"…":n)};
function rmFavs(){   // 자주 쓰는 프로젝트(칩). 처음 한 번은 [DR] · [BC] 를 넣어 두고, 그 뒤로는 내가 고른 대로 기억한다
  if(!Array.isArray(ui.rmFav)&&rmS.projects&&rmS.projects.length){ui.rmFav=rmS.projects.filter(p=>/^\s*\[(DR|BC)\]/i.test(p.name)).map(p=>p.id);saveUI()}
  return Array.isArray(ui.rmFav)?ui.rmFav:[];
}
function rmDirty(){rmS.dirty=true;rmFilSig="";rmFilters();if(rmOn)renderList()}     // 필터를 바꿔도 바로 검색하지 않는다. 검색 버튼이나 Enter 를 누르면 그때 찾는다
function rmSetProj(id){rmS.project=String(id||"");ui.rmProject=rmS.project;saveUI();rmDirty()}
function rmPickList(){
  const favs=rmFavs().map(String),q=rmPickQ.trim().toLowerCase();
  const L=(rmS.projects||[]).filter(p=>!q||p.name.toLowerCase().includes(q));
  return L.map(p=>{const f=favs.includes(String(p.id));return `<div class="pk"><span class="pkn" data-pkuse="${p.id}" title="이 프로젝트로 지금 좁히기">${esc(p.name)}</span><button type="button" class="pkfav ${f?"on":""}" data-pkfav="${p.id}" title="${f?"자주 쓰는 칩에서 빼기":"자주 쓰는 칩으로 추가"}">${f?"✓":"＋"}</button></div>`}).join("")||`<div class="meta" style="padding:6px">맞는 프로젝트가 없어요</div>`;
}
function wirePick(){
  document.querySelectorAll("#rmPickList [data-pkuse]").forEach(x=>x.onclick=()=>{rmPick=false;rmSetProj(x.dataset.pkuse);rmFilters()});
  document.querySelectorAll("#rmPickList [data-pkfav]").forEach(b=>b.onclick=()=>{
    const id=+b.dataset.pkfav,f=rmFavs().slice(),i=f.findIndex(x=>String(x)===String(id));
    if(i>=0)f.splice(i,1);else f.push(id);ui.rmFav=f;saveUI();
    const sc=$("#rmPickList").scrollTop;rmFilSig="";rmFilters();$("#rmPickList").scrollTop=sc});
}
function rmFilters(){      // 검색용 필터: 자주 쓰는 프로젝트 칩 · 기간 · 완료 빼기 (검색창 위, 머리 영역)
  if(!rmS._init){rmS._init=1;rmS.project=String(ui.rmProject||"")}
  const favs=rmFavs().map(String),P=rmS.projects||[],byId=new Map(P.map(p=>[String(p.id),p])),act=String(rmS.project||"");
  const ids=[...favs];if(act&&!ids.includes(act))ids.push(act);
  const sig=[act,favs.join(","),P.length,rmPick,rmDays(),rmS.open,rmS.dirty].join("|");
  if(sig===rmFilSig&&$("#lhx").firstChild)return;
  rmFilSig=sig;
  const chip=(id,label,t)=>`<button type="button" class="rmchip ${act===id?"on":""}" data-rmp="${esc(id)}" title="${esc(t)}">${esc(label)}</button>`;
  const chips=chip("","전체","모든 프로젝트")+ids.map(id=>{const p=byId.get(id);return p?chip(id,projShort(p.name),p.name):""}).join("")
    +`<button type="button" class="rmchip add ${rmPick?"on":""}" id="rmPlus" title="프로젝트 전체 목록을 열어요. 이름을 눌러 지금 좁히거나, ＋ 로 자주 쓰는 칩에 추가해요">＋</button>`;
  $("#lhx").innerHTML=`<div class="rmfil"><div class="rmchips">${chips}</div>
    ${rmPick?`<div class="rmpick"><input id="rmPickQ" placeholder="프로젝트 이름 검색" value="${esc(rmPickQ)}" autocomplete="off"><div id="rmPickList">${rmPickList()}</div></div>`:""}
    <div class="rmper"><span class="meta">기간</span><div class="seg" title="최근 이 기간 안에 바뀐 일감만 찾아요. 짧을수록 빨라요">${RMPER.map(([k,l])=>`<button type="button" data-rmper="${k}" class="${rmDays()===k?"on":""}">${l}</button>`).join("")}</div>
    <label class="meta" title="레드마인에서 '끝난 상태'(예: 완료)로 표시된 일감을 결과에서 뺍니다. 어떤 상태가 끝난 상태인지는 레드마인 설정을 따라요"><input type="checkbox" id="rmOpen" ${rmS.open?"checked":""}> 완료된 일감 빼기</label>
    <button type="button" id="rmGo" class="${rmS.dirty?"primary":""}" title="지금 조건으로 검색해요 (검색창에서 Enter 와 같아요)">검색</button></div></div>`;
  if(!rmS.projects){rmS.projects=[];api("/api/rm/projects").then(l=>{rmS.projects=l;rmFilSig="";if(rmOn)rmFilters()}).catch(()=>{})}
  document.querySelectorAll("#lhx [data-rmp]").forEach(b=>b.onclick=()=>rmSetProj(b.dataset.rmp===String(rmS.project||"")?"":b.dataset.rmp));
  $("#rmPlus").onclick=()=>{rmPick=!rmPick;rmFilSig="";rmFilters();if(rmPick&&$("#rmPickQ"))$("#rmPickQ").focus()};
  if($("#rmPickQ")){$("#rmPickQ").oninput=e=>{rmPickQ=e.target.value;$("#rmPickList").innerHTML=rmPickList();wirePick()};wirePick()}
  document.querySelectorAll("#lhx [data-rmper]").forEach(b=>b.onclick=()=>{ui.rmDays=b.dataset.rmper;saveUI();rmDirty()});
  $("#rmOpen").onchange=e=>{rmS.open=e.target.checked;rmDirty()};
  $("#rmGo").onclick=()=>rmRun(false);
}
async function renderRmSearch(){
  const q=$("#q").value.trim();
  rmFilters();
  const mineIds=new Set(all.map(n=>n.issue_id));
  const tagOf=sj=>{const m=(sj||"").match(/^\s*\[([^\]]{1,24})\](?=\s*\S)/);return m?m[1]:""};      // 제목 앞 [팀 태그]
  const tc=new Map();rmS.items.forEach(i=>{const t=tagOf(i.subject);tc.set(t,(tc.get(t)||0)+1)});
  const tagList=[...tc].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  const shown=rmS.tags.size?rmS.items.filter(i=>rmS.tags.has(tagOf(i.subject))):rmS.items;
  const cnt=rmS.tags.size?`${shown.length}건 표시 (받은 ${rmS.items.length}건 중 · 전체 ${rmS.total}건)`:`${rmS.total}건`;
  const tagbar=rmS.items.length&&tagList.length>1?`<div class="rmtags"><span class="meta" title="제목 앞의 [ ] 태그로 거릅니다 (이미 받은 결과 안에서만)">팀 태그</span>${tagList.map(([t,n])=>`<button type="button" class="rmchip ${rmS.tags.has(t)?"on":""}" data-rmtag="${esc(t)}">${t?esc("["+t+"]"):"태그 없음"} <small>${n}</small></button>`).join("")}${rmS.tags.size?`<button type="button" class="mini" id="rmTagClr">모두 해제</button>`:""}</div>`:"";
  const peekHtml=id=>{const p=rmS.peek[id];if(!p||!p.open)return "";
    if(p.loading)return `<div class="rmpeek meta">불러오는 중…</div>`;
    if(p.err)return `<div class="rmpeek meta">읽지 못했어요: ${esc(p.err)}</div>`;
    const d=p.data,cms=d.journals.map(j=>`<div class="pc"><div class="ph">${esc(j.user.name)} · ${dTime(j.created_on)}</div>${cmBody(j)}</div>`).join("");
    return `<div class="rmpeek"><div class="ph">${esc(d.author)} 작성 · 상태 ${esc(d.status)}${d.assigned?` · 담당 ${esc(d.assigned)}`:""}</div>${richHtml(d.desc_raw)||`<span class="meta">(본문 없음)</span>`}
      <div class="ph">${d.journal_total?`댓글 ${d.journal_total}개 중 최근 ${d.journals.length}개`:"댓글 없음"}</div>${cms}</div>`};
  const row=i=>{const have=mineIds.has(i.id);const op=rmS.peek[i.id]&&rmS.peek[i.id].open;
    return `<div class="rmrow ${op?"open":""}"><div class="rt" data-rmpeek="${i.id}" title="누르면 내용을 펼쳐서 읽어요 (노트에는 추가되지 않아요)"><span class="cv">▸</span>${title(i.subject)}</div><div class="rm"><span>#${i.id}</span><span>${esc(i.project)}</span><span>${esc(i.status)}</span>${i.assigned?`<span>담당 ${esc(i.assigned)}</span>`:""}<span>${esc(lDay(i.updated_on))}</span></div>
      <div class="ract">${have?`<button type="button" data-rmopen="${i.id}">열기</button><span class="meta">이미 내 노트에 있어요</span>`:`<button type="button" class="primary" data-rmadd="${i.id}">＋ 노트에 추가</button>`}<a href="#" data-rmweb="${i.id}">레드마인에서 ↗</a></div>${peekHtml(i.id)}</div>`};
  const head=`<div class="pane-title">레드마인 전체 검색</div><div class="pane-sub">${q?`‘${esc(q)}’ · ${rmS.loading?`찾는 중… <button type="button" class="rmstop" id="rmStop" title="기다리지 않고 검색을 그만둬요">■ 중단</button>`:rmS.stopped?`중단했어요${rmS.items.length?` · 받아 둔 ${rmS.items.length}건만 표시`:""} <button type="button" class="rmstop" id="rmRetry">다시 검색</button>`:`${cnt}${rmS.byNumber?" (번호로 조회)":" (제목에 포함)"}${rmS.dirty?` <span class="rmdirty">· 조건이 바뀌었어요. 위의 <b>검색</b>을 누르세요</span>`:""}`}`:"제목이나 번호(#93792)를 입력하세요"}</div>${tagbar}`;
  const body=rmS.err?`<div class="empty2"><b>검색하지 못했어요</b>${esc(rmS.err)}</div>`
    :q&&!rmS.loading&&!rmS.items.length?`<div class="empty2"><b>제목에 ‘${esc(q)}’ 가 들어간 일감이 없어요</b>본문·댓글에만 있는 말은 아래 웹 검색으로 찾아 보세요.</div>`
    :(shown.length?shown.map(row).join(""):`<div class="empty2"><b>선택한 팀 태그에 맞는 결과가 없어요</b>태그를 해제하거나, 더 보기로 더 받아 보세요.</div>`)+(rmS.items.length<rmS.total?`<div class="row" style="justify-content:center;margin:12px 0"><button type="button" id="rmMore">더 보기 (${rmS.total-rmS.items.length}건 남음)</button></div>`:"");
  const foot=q?`<div class="rmweb"><button type="button" id="rmWeb" title="레드마인 웹의 검색(본문·댓글 포함)을 브라우저로 엽니다">레드마인 웹에서 내용까지 검색 ↗</button><div class="meta">이 앱의 검색은 제목·번호만 돼요 (레드마인 API 한계)</div></div>`:"";
  setList(head+body+foot,["rm",q,rmS.project,rmS.open,rmDays()].join("|"));
  const L=$("#list");
  if($("#rmStop"))$("#rmStop").onclick=rmStop;
  L.querySelectorAll("[data-rmtag]").forEach(b=>b.onclick=()=>{const t=b.dataset.rmtag;if(rmS.tags.has(t))rmS.tags.delete(t);else rmS.tags.add(t);renderRmSearch()});
  if($("#rmTagClr"))$("#rmTagClr").onclick=()=>{rmS.tags.clear();renderRmSearch()};
  if($("#rmRetry"))$("#rmRetry").onclick=()=>rmRun(false);
  L.querySelectorAll("[data-rmpeek]").forEach(t=>t.onclick=async()=>{
    const id=+t.dataset.rmpeek,p=rmS.peek[id]||(rmS.peek[id]={});
    p.open=!p.open;if(!p.open||p.data){renderRmSearch();return}
    p.loading=true;p.err="";renderRmSearch();
    try{p.data=await api(`/api/rm/peek?id=${id}`)}catch(e){p.err=e.message}
    p.loading=false;if(rmOn)renderRmSearch()});
  if($("#rmMore"))$("#rmMore").onclick=()=>rmRun(true);
  if($("#rmWeb"))$("#rmWeb").onclick=()=>openExternal(`${cfg.url}/search?q=${encodeURIComponent(q)}&issues=1`);
  L.querySelectorAll("[data-rmopen]").forEach(b=>b.onclick=()=>openNote(+b.dataset.rmopen));
  L.querySelectorAll("[data-rmweb]").forEach(a=>a.onclick=e=>{e.preventDefault();openExternal(`${cfg.url}/issues/${a.dataset.rmweb}`)});
  L.querySelectorAll("[data-rmadd]").forEach(b=>b.onclick=async()=>{
    const id=+b.dataset.rmadd;b.disabled=true;b.textContent="추가하는 중…";
    try{const r=await post("/api/fetch",{ids:[id],role:"추가됨"});await loadAll();
      if(r.got.includes(id)){toast(`#${id} 을(를) 노트에 추가했어요 ✓`,2500);openNote(id)}else toast(`#${id} 를 가져오지 못했어요: ${(r.failed[0]||{}).reason||"알 수 없음"}`,6000)}
    catch(e){toast("추가하지 못했어요: "+e.message,6000)}
  });
}
document.addEventListener("click",e=>{const b=e.target.closest&&e.target.closest("#qscope [data-qs]");if(!b)return;
  rmOn=b.dataset.qs==="rm";if(rmOn&&nav!=="today"&&nav!=="history")nav="history",view="note";renderAll();if($("#q").value.trim()&&rmOn)rmRun(false)});
