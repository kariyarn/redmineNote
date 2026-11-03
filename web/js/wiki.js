/* ---------- 업무 위키 (2.35): 주제를 나무처럼 엮는 자유 문서 ----------
   왼쪽 = 맥 파인더 같은 열 보기 (행을 누르면 오른쪽에 그 문서, 다음 열에 하위 행). 오른쪽 = 고정 편집기.
   - 행 이름 = 문서 제목. 본문을 고쳐도 행 이름은 그대로. 하위 행 = 하위 문서. 본문이 빈 행은 흐리게 (빠진 곳 점검)
   - 본문은 HTML. 화면에서도(wkClean) 서버에서도(rnotes/wiki.py) 허용 목록만 남긴다. 형광펜 · 글자색은 이름(class)으로만
   - 연결: [[ 또는 '연결' 단추 → 보관함(코드 · 쿼리) · 트러블슈팅 · 코드 이력 · 일감 · 다른 위키 문서. #번호 + 띄어쓰기 = 일감
     저장은 <a class="lk" data-k data-ref> 로 id 만. 이름은 볼 때 찾아 붙인다 (원래 항목 이름을 바꿔도 안 깨진다)
   - 내보내기: .html(형광펜 · 글자색 · 표 그대로) / .md, 하위 문서 같이 · 빈 문서 넣기 고르기 */
let wikis=[],wkLoaded=false,wkPath=[],wkQ="",wkSaveT=null,wkDirty=null,wkSavedRange=null,wkPk=null;
const WK_HL=[["hl-y","노랑"],["hl-g","초록"],["hl-p","분홍"],["hl-b","파랑"]];
const WK_FC=[["fc-red","빨강"],["fc-org","주황"],["fc-blue","파랑"],["fc-gray","회색"]];
const WK_KINDS={issue:"일감",vault:"보관함",trouble:"트러블슈팅",code:"코드 이력",wiki:"위키"};
const wkIc=k=>({issue:IC('<path d="M5 4h14v16H5z"/><path d="M9 9h6M9 13h6M9 17h3"/>'),vault:NAVICON.queries,trouble:NAVICON.trouble,code:NAVICON.code,wiki:NAVICON.wiki})[k]||"";
async function wkLoad(force){if(wkLoaded&&!force)return;try{wikis=await api("/api/wiki");wkLoaded=true}catch(e){toast("업무 위키를 읽지 못했어요: "+e.message,5000)}}
const wkById=id=>wikis.find(w=>w.id===id);
const wkKids=pid=>wikis.filter(w=>(w.parent_id??null)===(pid??null)).sort((a,b)=>a.pos-b.pos||a.id-b.id);
const wkCount=id=>wkKids(id).reduce((n,k)=>n+1+wkCount(k.id),0);
function wkTrail(id){const out=[];let w=wkById(id),guard=0;while(w&&guard++<200){out.unshift(w);w=w.parent_id!=null?wkById(w.parent_id):null}return out}
const wkCur=()=>wkById(wkPath[wkPath.length-1]);
function wkBodyEmpty(h){const t=document.createElement("template");t.innerHTML=h||"";return !t.content.textContent.replace(/ /g," ").trim()&&!t.content.querySelector("table,pre,a.lk")}
function wkText(w){const t=document.createElement("template");t.innerHTML=w.body||"";return (w.title+"\n"+t.content.textContent).toLowerCase()}
function openWiki(id){wkFlush();if(id!=null){const tr=wkTrail(id);if(tr.length)wkPath=tr.map(w=>w.id)}setNav("wiki")}

/* ---------- 본문 거르기 (서버 rnotes/wiki.py 와 같은 허용 목록) ---------- */
const WK_ALLOWED=new Set("p div h2 h3 h4 ul ol li blockquote pre table thead tbody tr th td b strong i em u s strike del code mark span a sup sub br hr".split(" "));
const WK_DROP=new Set("script style iframe object embed svg math template noscript textarea select button form head title link meta base".split(" "));
function wkClean(html){
  const t=document.createElement("template");t.innerHTML=String(html||"");     // template 안은 실행되지 않는다 (스크립트 · onerror 가 돌지 않음)
  const out=document.createElement("div");
  const walk=(n,parent)=>{
    if(n.nodeType===3){parent.appendChild(document.createTextNode(n.data));return}
    if(n.nodeType!==1)return;
    let tag=n.localName.toLowerCase();tag={h1:"h2",h5:"h4",h6:"h4"}[tag]||tag;
    if(WK_DROP.has(tag))return;
    if(!WK_ALLOWED.has(tag)){n.childNodes.forEach(c=>walk(c,parent));return}
    let el=document.createElement(tag);
    const cls=n.getAttribute("class")||"";
    if(tag==="mark"&&WK_HL.some(x=>x[0]===cls))el.className=cls;
    else if(tag==="span"&&WK_FC.some(x=>x[0]===cls))el.className=cls;
    else if(tag==="a"){
      const k=n.getAttribute("data-k")||"",id=n.getAttribute("data-ref")||"";
      if(cls.split(/\s+/)[0]!=="lk"||!WK_KINDS[k]||!(k==="code"?/^[^\x00-\x1f\x7f<>"'`&]{1,200}$/.test(id)&&id.trim()===id:/^[1-9][0-9]{0,11}$/.test(id))){n.childNodes.forEach(c=>walk(c,parent));return}
      el.className="lk";el.dataset.k=k;el.dataset.ref=id;
    }else if(tag==="th"||tag==="td")["colspan","rowspan"].forEach(a=>{const v=n.getAttribute(a);if(v&&/^[1-9][0-9]?$/.test(v))el.setAttribute(a,v)});
    n.childNodes.forEach(c=>walk(c,el));parent.appendChild(el);
  };
  t.content.childNodes.forEach(c=>walk(c,out));
  return out;
}
/* 연결 칩: 이름 · 없는 항목 표시를 붙인다 (편집기 · 내보내기 공통) */
function wkLinkInfo(k,id){
  if(k==="issue"){const n=all.find(x=>x.issue_id===+id);return {label:"#"+id,title:n?`#${id} ${n.subject}`:`#${id} · 아직 가져오지 않은 일감`,miss:!n}}
  if(k==="vault"){const q=(typeof queries!=="undefined"?queries:[]).find(x=>x.id===+id);return q?{label:q.title||"(제목 없음)",title:`보관함 · ${q.title}`}:{label:"(지워진 보관함 항목)",gone:true}}
  if(k==="trouble"){const t=(typeof troubles!=="undefined"?troubles:[]).find(x=>x.id===+id);return t?{label:t.title,title:`트러블슈팅 · ${t.title} (${t.status})`}:{label:"(지워진 트러블슈팅)",gone:true}}
  if(k==="code")return {label:id,title:tokIdx.has(id)?`코드 이력 · ${id} · 일감 ${tokIdx.get(id).notes.length}건`:`코드 이력 · ${id} (지금 노트에는 안 나와요)`,miss:!tokIdx.has(id)};
  if(k==="wiki"){const w=wkById(+id);return w?{label:w.title,title:"업무 위키 · "+wkTrail(w.id).map(x=>x.title).join(" › ")}:{label:"(지워진 위키 문서)",gone:true}}
  return {label:id,gone:true};
}
function wkDecorate(root){
  root.querySelectorAll("a.lk").forEach(a=>{const i=wkLinkInfo(a.dataset.k,a.dataset.ref);
    a.setAttribute("contenteditable","false");a.className="lk"+(i.miss?" miss":"")+(i.gone?" gone":"");a.title=i.title||i.label;
    a.innerHTML=wkIc(a.dataset.k)+`<span>${esc(i.label)}</span>`});
  return root;
}
const wkChip=(k,id)=>{const a=document.createElement("a");a.className="lk";a.dataset.k=k;a.dataset.ref=String(id);return wkDecorate((()=>{const d=document.createElement("div");d.appendChild(a);return d})()).innerHTML};
function wkSerialize(root){       // 저장할 HTML: 칩은 이름 글자만 남기고 화면용 속성은 뺀다
  const c=root.cloneNode(true);
  c.querySelectorAll("a.lk").forEach(a=>{const lb=a.textContent;a.removeAttribute("contenteditable");a.removeAttribute("title");a.className="lk";a.textContent=lb});
  return wkClean(c.innerHTML).innerHTML;
}

/* ---------- 화면 ---------- */
async function renderWiki(){
  await Promise.all([wkLoad(),typeof qvLoad==="function"?qvLoad():0,typeof trLoad==="function"?trLoad():0]);if(view!=="wiki")return;
  wkPath=wkPath.filter(id=>wkById(id));
  if(!wkPath.length){const last=wkById(ui.wkCur),f=last?null:wkKids(null)[0];wkPath=last?wkTrail(last.id).map(w=>w.id):f?[f.id]:[]}
  const cols=Math.max(1,Math.min(4,ui.wkCols||3));
  $("#center").innerHTML=`<div class="wk-wrap">
    <div class="wk-top"><h2>업무 위키</h2><nav class="wk-crumbs" id="wkCrumbs" aria-label="문서 경로"></nav>
      <div class="search wk-q"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><input id="wkQ" placeholder="제목 · 본문 찾기" value="${esc(wkQ)}" autocomplete="off"></div>
      <button type="button" id="wkNewRoot" title="맨 위 단계에 새 주제를 만들어요">＋ 새 주제</button>
      <button type="button" class="primary" id="wkExp" title="지금 문서(와 하위 문서)를 파일로 내보내요">내보내기</button></div>
    <div class="wk-body"><div class="wk-cols" id="wkCols" tabindex="0" role="tree" aria-label="문서 열 보기 · 화살표로 이동, Enter 로 편집" style="--wk-cols:${cols};width:${Math.max(220,ui.wkW||cols*210)}px"></div>
      <div class="wk-split" id="wkSplit" title="끌어서 폭 조절"></div><section class="wk-ed" id="wkEd"></section></div></div>`;
  $("#wkQ").oninput=e=>{wkQ=e.target.value.trim();wkDrawCols()};
  $("#wkQ").onkeydown=e=>{if(e.key==="Escape"){e.target.value="";wkQ="";wkDrawCols()}else if(e.key==="Enter"){const h=$("#wkCols [data-wid]");if(h)h.click()}};
  $("#wkNewRoot").onclick=()=>wkCreate(null);
  $("#wkExp").onclick=()=>{const w=wkCur();w?wkExport(w):toast("내보낼 문서를 먼저 골라요",2200)};
  wkWireCols();wkWireSplit();
  wkDrawCols();wkDrawEd();
}
function wkDrawCols(){
  const el=$("#wkCols");if(!el)return;
  const cur=wkPath[wkPath.length-1];
  if(wkQ){      // 찾기: 열 대신 찾은 문서 목록
    const q=wkQ.toLowerCase(),hit=wikis.filter(w=>wkText(w).includes(q)).slice(0,200);
    el.innerHTML=`<div class="wk-col wk-hits"><div class="wk-ch"><span>찾은 문서 ${hit.length}개</span></div>${hit.map(w=>`<button type="button" class="wk-row${w.id===cur?" cur":""}" data-wid="${w.id}"><span class="nm">${esc(w.title)}</span><span class="wk-trail">${esc(wkTrail(w.id).slice(0,-1).map(x=>x.title).join(" › ")||"최상위")}</span></button>`).join("")||`<div class="wk-none">찾는 문서가 없어요</div>`}</div>`;
    $("#wkCrumbs").innerHTML="";return;
  }
  const lists=[{list:wkKids(null),parent:null}];
  wkPath.forEach(id=>{const k=wkKids(id);if(k.length)lists.push({list:k,parent:wkById(id)})});
  const max=Math.max(1,Math.min(4,ui.wkCols||3)),hidden=Math.max(0,lists.length-max);
  el.innerHTML=!wikis.length?`<div class="wk-col"><div class="wk-none"><b>아직 문서가 없어요</b>업무 주제를 나무처럼 엮어 두는 곳이에요.<br>예) 법인콘도 › 경기도청 › 성수기 신청<br><button type="button" class="primary" data-wknew="">＋ 첫 주제 만들기</button></div></div>`
    :lists.slice(hidden).map(c=>`<div class="wk-col" role="group" aria-label="${esc(c.parent?c.parent.title:"주제")}"><div class="wk-ch"><span>${esc(c.parent?c.parent.title:"주제")}</span><button type="button" class="icon" data-wknew="${c.parent?c.parent.id:""}" title="여기에 새 문서" aria-label="여기에 새 문서">＋</button></div>
      ${c.list.map(w=>{const n=wkKids(w.id).length,on=w.id===cur,inP=wkPath.includes(w.id);
        return `<button type="button" class="wk-row${on?" cur":inP?" path":""}${wkBodyEmpty(w.body)?" empty":""}" role="treeitem" aria-selected="${on}" data-wid="${w.id}" title="${esc(w.title)}${wkBodyEmpty(w.body)?" (본문이 비어 있어요)":""}">${n?NAVICON.wiki:IC('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>')}<span class="nm">${esc(w.title)}</span>${n?`<span class="cn">${wkCount(w.id)}</span><span class="ar">›</span>`:""}</button>`}).join("")}</div>`).join("");
  const tr=wkPath.map(wkById).filter(Boolean);
  $("#wkCrumbs").innerHTML=tr.map((w,i)=>`${i?'<span class="sep">›</span>':""}<button type="button" class="${i<hidden?"fold":""}" data-wkcr="${i}" title="${i<hidden?"열에서 접힌 단계 · 눌러서 돌아가기":"이 단계로"}">${esc(w.title)}</button>`).join("");
}
function wkWireCols(){
  const el=$("#wkCols");
  el.onclick=e=>{const r=e.target.closest("[data-wid]"),n=e.target.closest("[data-wknew]");
    if(n){wkCreate(n.dataset.wknew?+n.dataset.wknew:null);return}
    if(r){wkOpen(+r.dataset.wid);if(wkQ){wkQ="";$("#wkQ").value="";wkDrawCols()}el.focus({preventScroll:true})}};
  $("#wkCrumbs").onclick=e=>{const b=e.target.closest("[data-wkcr]");if(b){wkFlush();wkPath=wkPath.slice(0,+b.dataset.wkcr+1);wkDrawCols();wkDrawEd()}};
  el.onkeydown=e=>{
    if(wkQ||!wkPath.length)return;const w=wkCur();if(!w)return;
    const sib=wkKids(w.parent_id),i=sib.findIndex(x=>x.id===w.id);
    if(e.key==="ArrowDown"&&i<sib.length-1)wkPath[wkPath.length-1]=sib[i+1].id;
    else if(e.key==="ArrowUp"&&i>0)wkPath[wkPath.length-1]=sib[i-1].id;
    else if(e.key==="ArrowRight"&&wkKids(w.id).length)wkPath.push(wkKids(w.id)[0].id);
    else if(e.key==="ArrowLeft"&&wkPath.length>1)wkPath.pop();
    else if(e.key==="Enter"){e.preventDefault();const d=$("#wkDoc");if(d)d.focus();return}
    else if(e.key==="F2"){e.preventDefault();$("#wkTitle").focus();$("#wkTitle").select();return}
    else return;
    e.preventDefault();wkFlush();wkDrawCols();wkDrawEd();
    const c=$("#wkCols .wk-row.cur");if(c)c.scrollIntoView({block:"nearest"});
  };
  el.oncontextmenu=e=>{const r=e.target.closest("[data-wid]");if(!r||wkQ)return;e.preventDefault();wkMenu(+r.dataset.wid,e)};
}
function wkWireSplit(){
  const s=$("#wkSplit"),cols=$("#wkCols");
  s.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();s.setPointerCapture(e.pointerId);s.classList.add("drag");const x0=e.clientX,w0=cols.offsetWidth;
    s.onpointermove=ev=>{const w=Math.max(220,Math.min(innerWidth-460,w0+ev.clientX-x0));cols.style.width=w+"px";const n=Math.max(1,Math.min(4,Math.round(w/200)));if(n!==ui.wkCols){ui.wkCols=n;cols.style.setProperty("--wk-cols",n);wkDrawCols()}ui.wkW=w};
    s.onpointerup=s.onpointercancel=()=>{s.onpointermove=s.onpointerup=s.onpointercancel=null;s.classList.remove("drag");saveUI()}};
}
function wkOpen(id){wkFlush();const tr=wkTrail(id);if(!tr.length)return;wkPath=tr.map(w=>w.id);wkDrawCols();wkDrawEd()}

/* ---------- 편집기 ---------- */
const WK_TB=()=>`<div class="wk-tb" id="wkTb" role="toolbar" aria-label="서식">
  <select id="wkBlk" aria-label="문단 모양"><option value="p">본문</option><option value="h2">제목 1</option><option value="h3">제목 2</option><option value="h4">제목 3</option></select>
  <span class="g"><button type="button" data-wc="bold" title="굵게 (Ctrl+B)" aria-label="굵게"><b>B</b></button><button type="button" data-wc="italic" title="기울임 (Ctrl+I)" aria-label="기울임"><i>I</i></button><button type="button" data-wc="underline" title="밑줄 (Ctrl+U)" aria-label="밑줄"><u>U</u></button><button type="button" data-wc="strikeThrough" title="취소선" aria-label="취소선"><s>S</s></button></span>
  <span class="g"><span class="wk-dd"><button type="button" data-wdd="hl" title="형광펜 (Ctrl+Shift+H = 마지막에 쓴 색)" aria-label="형광펜">${IC('<path d="M14 4l6 6-8 8H6v-6z"/><path d="M4 21h8"/>')}<span class="wk-sw" id="wkHlNow" style="background:var(--${ui.wkHl||"hl-y"})"></span></button><span class="wk-ddm" id="wkDd-hl">${WK_HL.map(([c,n])=>`<button type="button" data-whl="${c}" title="형광펜 ${n}" aria-label="형광펜 ${n}"><span class="wk-sw" style="background:var(--${c})"></span></button>`).join("")}<button type="button" class="x" data-whl="">지우기</button></span></span>
    <span class="wk-dd"><button type="button" data-wdd="fc" title="글자색" aria-label="글자색"><span class="wk-fca" style="color:var(--fc-red)">A</span></button><span class="wk-ddm" id="wkDd-fc">${WK_FC.map(([c,n])=>`<button type="button" data-wfc="${c}" title="글자색 ${n}" aria-label="글자색 ${n}"><span class="wk-fca" style="color:var(--${c})">A</span></button>`).join("")}<button type="button" class="x" data-wfc="">기본색</button></span></span></span>
  <span class="g"><button type="button" data-wc="insertUnorderedList" title="글머리 목록" aria-label="글머리 목록">${IC('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>')}</button><button type="button" data-wc="insertOrderedList" title="번호 목록" aria-label="번호 목록">${IC('<path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 5l1.5-1V9M3.5 15.5a1.5 1.5 0 1 1 2.5 1L3.5 19H6.5"/>')}</button>
    <button type="button" data-wi="table" title="표 넣기 (3×3)" aria-label="표 넣기">${IC('<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/>')}</button><button type="button" data-wi="code" title="코드 상자 (줄 처음에 \`\`\` + Enter 로도)" aria-label="코드 상자">${IC('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 10l-2 2 2 2M15 10l2 2-2 2"/>')}</button></span>
  <span class="g wk-tbl" id="wkTbl" hidden><button type="button" data-wt="row" title="아래에 행 추가">행＋</button><button type="button" data-wt="col" title="오른쪽에 열 추가">열＋</button><button type="button" data-wt="rmrow" title="이 행 지우기">행－</button><button type="button" data-wt="rmcol" title="이 열 지우기">열－</button></span>
  <span class="g"><button type="button" class="wk-lkb" data-wlink title="보관함 · 트러블슈팅 · 코드 이력 · 일감 · 다른 위키 문서 연결 ([[ 로도)">${IC('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>')}연결</button></span></div>`;
function wkDrawEd(){
  const el=$("#wkEd");if(!el)return;
  const w=wkCur();
  if(!w){el.innerHTML=`<div class="empty" style="padding-top:10vh"><b>왼쪽에서 문서를 고르거나 새로 만드세요</b>행을 누르면 여기에 그 문서가 열리고, 다음 열에 하위 문서가 보여요.</div>`;return}
  ui.wkCur=w.id;saveUI();
  const tr=wkTrail(w.id),kids=wkKids(w.id);
  el.innerHTML=`<div class="wk-hd"><div class="wk-path">${esc(tr.slice(0,-1).map(x=>x.title).join(" › ")||"최상위 주제")}</div>
      <input id="wkTitle" maxlength="200" value="${esc(w.title)}" aria-label="문서 제목 (= 왼쪽 행 이름)" title="문서 제목 = 왼쪽 행 이름">
      <div class="wk-meta"><span>${kids.length?`하위 문서 ${kids.length}개 · 그 아래까지 ${wkCount(w.id)}개`:"하위 문서 없음"} · ${esc((w.updated_at||"").replace("T"," ").slice(0,16))} 수정</span><span class="sp"></span><span id="wkSaved" class="wk-saved">저장됨</span></div></div>
    ${WK_TB()}
    <div class="wk-scroll" id="wkScroll"><div id="wkDoc" class="wk-doc" contenteditable="true" spellcheck="false" role="textbox" aria-multiline="true" aria-label="본문" data-ph="자유롭게 적어요. 글자를 고르면 서식 툴바가 떠요 · [[ 로 보관함 · 트러블슈팅 · 코드 연결 · #일감번호 + 띄어쓰기"></div>
      <div class="wk-subs">${kids.length?`<div class="lb">이 문서 안의 하위 문서</div><div class="wk-subg">${kids.map(k=>`<button type="button" class="${wkBodyEmpty(k.body)?"empty":""}" data-wsub="${k.id}">${IC('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>')}${esc(k.title)}</button>`).join("")}</div>`:""}<button type="button" class="mini" data-wknew2="${w.id}">＋ 하위 문서 만들기</button></div></div>
    <div class="wk-ft" id="wkFt" role="toolbar" aria-label="고른 글자 서식"><button type="button" data-wc="bold" aria-label="굵게"><b>B</b></button><button type="button" data-wc="italic" aria-label="기울임"><i>I</i></button><button type="button" data-wc="underline" aria-label="밑줄"><u>U</u></button><span class="sepv"></span>${WK_HL.map(([c,n])=>`<button type="button" data-whl="${c}" title="형광펜 ${n}" aria-label="형광펜 ${n}"><span class="wk-sw" style="background:var(--${c})"></span></button>`).join("")}<span class="sepv"></span>${WK_FC.map(([c,n])=>`<button type="button" data-wfc="${c}" title="글자색 ${n}" aria-label="글자색 ${n}"><span class="wk-fca" style="color:var(--${c})">A</span></button>`).join("")}<span class="sepv"></span><button type="button" data-wlink title="연결" aria-label="연결">${IC('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>')}</button></div>`;
  const doc=$("#wkDoc");
  doc.innerHTML="";doc.appendChild(wkDecorate(wkClean(w.body)));
  doc.dataset.wid=w.id;wkDirty=null;
  wkWireEd(w);
}
function wkMark(){const s=$("#wkSaved");if(s){s.textContent="저장 중…";s.classList.add("ing")}}
function wkQueue(){
  const w=wkCur(),doc=$("#wkDoc");if(!w||!doc||+doc.dataset.wid!==w.id)return;
  wkDirty={id:w.id,title:($("#wkTitle").value||"").trim()||w.title,body:wkSerialize(doc)};wkMark();
  clearTimeout(wkSaveT);wkSaveT=setTimeout(wkFlush,700);
}
async function wkFlush(){
  clearTimeout(wkSaveT);const d=wkDirty;if(!d)return;wkDirty=null;
  try{const r=await post("/api/wiki",d);const i=wikis.findIndex(x=>x.id===r.id);if(i>=0)wikis[i]=r;
    if(!wkDirty){const s=$("#wkSaved");if(s){s.textContent="저장됨";s.classList.remove("ing")}}
    if(view==="wiki")wkDrawColsSoft()}
  catch(e){wkDirty=wkDirty||d;const s=$("#wkSaved");if(s){s.textContent="저장 못 함";s.classList.add("err")}toast("업무 위키를 저장하지 못했어요: "+e.message,5000)}
}
function wkDrawColsSoft(){const el=$("#wkCols");if(!el)return;const y=[...el.querySelectorAll(".wk-col")].map(c=>c.scrollTop);wkDrawCols();el.querySelectorAll(".wk-col").forEach((c,i)=>c.scrollTop=y[i]||0)}
addEventListener("pagehide",()=>{if(wkDirty)try{navigator.sendBeacon("/api/wiki",new Blob([JSON.stringify(wkDirty)],{type:"application/json"}))}catch(_){}});

function wkKeep(){const s=getSelection(),d=$("#wkDoc");if(d&&s.rangeCount&&d.contains(s.anchorNode))wkSavedRange=s.getRangeAt(0).cloneRange()}
function wkRestore(){      // 툴바 · 고르기 창으로 포커스가 나갔을 때만 마지막 선택을 되살린다 (편집기 안에 선택이 있으면 그대로)
  const s=getSelection(),d=$("#wkDoc");if(d&&s.rangeCount&&d.contains(s.anchorNode)&&document.activeElement===d)return;
  if(!wkSavedRange||!d||!d.contains(wkSavedRange.startContainer))return;s.removeAllRanges();s.addRange(wkSavedRange)}
function wkUnwrapIn(range,sel){
  const box=range.commonAncestorContainer.nodeType===1?range.commonAncestorContainer:range.commonAncestorContainer.parentElement;
  [...(box.closest(sel)?[box.closest(sel)]:[]),...box.querySelectorAll(sel)].filter(n=>range.intersectsNode(n)&&$("#wkDoc").contains(n)).forEach(n=>n.replaceWith(...n.childNodes));
}
function wkWrap(tag,cls){      // 형광펜 · 글자색: 고른 글자를 이름(class)으로 감싼다. cls 가 비면 지우기
  wkRestore();const s=getSelection();if(!s.rangeCount||s.isCollapsed||!$("#wkDoc").contains(s.anchorNode)){toast("먼저 글자를 골라요",1800);return}
  const r=s.getRangeAt(0);wkUnwrapIn(r,tag==="mark"?"mark":"span[class^=fc-]");
  if(cls){const el=document.createElement(tag);el.className=cls;el.appendChild(r.extractContents());el.querySelectorAll(tag==="mark"?"mark":"span[class^=fc-]").forEach(n=>n.replaceWith(...n.childNodes));r.insertNode(el);
    s.removeAllRanges();const nr=document.createRange();nr.selectNodeContents(el);s.addRange(nr)}
  $("#wkDoc").normalize();wkQueue();
}
function wkSetHl(c){if(c){ui.wkHl=c;saveUI();const n=$("#wkHlNow");if(n)n.style.background=`var(--${c})`}wkWrap("mark",c)}
function wkIns(h){wkRestore();$("#wkDoc").focus();document.execCommand("insertHTML",false,h);wkQueue()}
function wkCell(){const s=getSelection();if(!s.rangeCount)return null;const n=s.anchorNode&&(s.anchorNode.nodeType===1?s.anchorNode:s.anchorNode.parentElement);const c=n&&n.closest("td,th");return c&&$("#wkDoc").contains(c)?c:null}
function wkTable(op){
  const cell=wkCell();if(!cell)return;const table=cell.closest("table"),row=cell.parentElement,idx=[...row.children].indexOf(cell);
  if([...table.querySelectorAll("td,th")].some(c=>c.colSpan>1||c.rowSpan>1)){toast("합친 칸이 있는 표는 행 · 열을 바꿀 수 없어요",3500);return}
  if(op==="row"){const r=row.cloneNode(true);r.querySelectorAll("td,th").forEach(c=>{const td=document.createElement("td");td.innerHTML="<br>";c.replaceWith(td)});row.after(r)}
  if(op==="col")table.querySelectorAll("tr").forEach(r=>{const c=document.createElement(r.children[idx]&&r.children[idx].tagName==="TH"?"th":"td");c.innerHTML="<br>";(r.children[idx]||r.lastElementChild).after(c)});
  if(op==="rmrow"){row.remove();if(!table.querySelector("tr"))table.remove()}
  if(op==="rmcol"){table.querySelectorAll("tr").forEach(r=>r.children[idx]&&r.children[idx].remove());if(!table.querySelector("td,th"))table.remove()}
  wkQueue();wkSync();
}
function wkSync(){      // 툴바의 눌림 상태 · 문단 모양 · 표 단추
  const tb=$("#wkTb");if(!tb)return;
  ["bold","italic","underline","strikeThrough"].forEach(c=>tb.querySelectorAll(`[data-wc=${c}]`).forEach(b=>{const on=document.queryCommandState(c);b.classList.toggle("on",on);b.setAttribute("aria-pressed",on)}));
  const s=getSelection(),d=$("#wkDoc");
  if(d&&s.rangeCount&&d.contains(s.anchorNode)){const n=s.anchorNode.nodeType===1?s.anchorNode:s.anchorNode.parentElement,h=n.closest("h2,h3,h4");$("#wkBlk").value=h?h.tagName.toLowerCase():"p"}
  $("#wkTbl").hidden=!wkCell();
}
function wkWireEd(w){
  const doc=$("#wkDoc"),ed=$("#wkEd");
  $("#wkTitle").oninput=e=>{const t=e.target.value.trim();if(t){w.title=t;wkDrawColsSoft()}wkQueue()};
  $("#wkTitle").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();doc.focus()}else if(e.key==="Escape"){e.target.blur();$("#wkCols").focus()}};
  $("#wkTitle").onblur=e=>{if(!e.target.value.trim()){e.target.value=w.title;toast("제목은 비울 수 없어요",2000)}};
  doc.oninput=()=>{wkAutoIssue();wkBrackets();wkQueue()};
  doc.onkeydown=e=>{
    if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==="h"){e.preventDefault();wkKeep();wkSetHl(ui.wkHl||"hl-y");return}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="s"){e.preventDefault();wkQueue();wkFlush();return}
    const s=getSelection(),n=s.anchorNode&&(s.anchorNode.nodeType===1?s.anchorNode:s.anchorNode.parentElement),pre=n&&n.closest("pre");
    if(pre&&doc.contains(pre)){
      if(e.key==="Tab"){e.preventDefault();document.execCommand("insertText",false,"  ");return}
      if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)||e.key==="Escape"){e.preventDefault();const p=document.createElement("p");p.innerHTML="<br>";pre.after(p);const r=document.createRange();r.setStart(p,0);s.removeAllRanges();s.addRange(r);wkQueue();return}
      if(e.key==="Enter"){e.preventDefault();document.execCommand("insertText",false,"\n");return}
    }
    if(e.key==="Enter"&&!e.shiftKey&&n){       // 줄 처음에 ``` + Enter = 코드 상자
      const blk=n.closest("p,div:not(#wkDoc)")||(n===doc?null:n);
      if(blk&&doc.contains(blk)&&blk!==doc&&blk.textContent.trim()==="```"){e.preventDefault();const p=document.createElement("pre");p.innerHTML="<code>\n</code>";blk.replaceWith(p);const r=document.createRange();r.setStart(p.firstChild.firstChild,0);s.removeAllRanges();s.addRange(r);wkQueue()}
    }
  };
  doc.onpaste=e=>{       // 붙여넣기: 허용한 서식만 남긴다 (다른 사이트 · 워드의 글꼴 · 색 · 스크립트는 버림)
    e.preventDefault();const cd=e.clipboardData;if(!cd)return;
    const s=getSelection(),n=s.anchorNode&&(s.anchorNode.nodeType===1?s.anchorNode:s.anchorNode.parentElement);
    const h=cd.getData("text/html"),t=cd.getData("text/plain");
    if(h&&!(n&&n.closest("pre")))document.execCommand("insertHTML",false,wkDecorate(wkClean(h.replace(/<!--StartFragment-->|<!--EndFragment-->/g,""))).innerHTML);
    else document.execCommand("insertText",false,t);
    wkQueue();
  };
  doc.onclick=e=>{const a=e.target.closest("a.lk");if(a){e.preventDefault();wkFollow(a)}};
  doc.onkeyup=doc.onmouseup=wkSync;
  doc.onfocus=()=>{try{document.execCommand("defaultParagraphSeparator",false,"p")}catch(_){}};       // 새 줄은 <p> (댓글 편집기와 같다)
  doc.onblur=()=>{try{document.execCommand("defaultParagraphSeparator",false,"div")}catch(_){}};
  ed.querySelectorAll("#wkTb button,#wkFt button").forEach(b=>b.onmousedown=e=>e.preventDefault());
  ed.onclick=e=>{
    const b=e.target.closest("button");
    ed.querySelectorAll(".wk-ddm.on").forEach(m=>{if(!b||!m.parentElement.contains(b))m.classList.remove("on")});
    if(!b)return;
    if(b.dataset.wc){wkRestore();document.execCommand(b.dataset.wc);wkQueue();wkSync()}
    else if(b.dataset.wdd){wkKeep();$("#wkDd-"+b.dataset.wdd).classList.toggle("on")}
    else if("whl" in b.dataset){wkSetHl(b.dataset.whl);b.closest(".wk-ddm")?.classList.remove("on")}
    else if("wfc" in b.dataset){wkWrap("span",b.dataset.wfc);b.closest(".wk-ddm")?.classList.remove("on")}
    else if(b.dataset.wi==="table")wkIns(`<table><tbody><tr><th>제목</th><th>제목</th><th>제목</th></tr><tr><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td></tr></tbody></table><p><br></p>`);
    else if(b.dataset.wi==="code")wkIns(`<pre><code>\n</code></pre><p><br></p>`);
    else if(b.dataset.wt){wkRestore();wkTable(b.dataset.wt)}
    else if("wlink" in b.dataset){wkKeep();wkPicker(null)}
    else if(b.dataset.wsub)wkOpen(+b.dataset.wsub);
    else if(b.dataset.wknew2)wkCreate(+b.dataset.wknew2);
  };
  $("#wkBlk").onmousedown=wkKeep;
  $("#wkBlk").onchange=e=>{wkRestore();document.execCommand("formatBlock",false,e.target.value);wkQueue();doc.focus()};
  $("#wkScroll").onmousedown=e=>{if(e.target.id==="wkScroll"){e.preventDefault();doc.focus();const r=document.createRange();r.selectNodeContents(doc);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r)}};
}
/* 글자를 고르면 뜨는 작은 툴바 */
document.addEventListener("selectionchange",()=>{
  const ft=$("#wkFt"),doc=$("#wkDoc");if(!ft||!doc)return;
  const s=getSelection(),inDoc=s.rangeCount&&doc.contains(s.anchorNode)&&doc.contains(s.focusNode);
  if(inDoc)wkKeep();
  if(!inDoc||s.isCollapsed){ft.classList.remove("on");return}
  wkSync();
  const r=s.getRangeAt(0).getBoundingClientRect();ft.classList.add("on");
  ft.style.left=Math.max(8,Math.min(innerWidth-ft.offsetWidth-8,r.left+r.width/2-ft.offsetWidth/2))+"px";
  ft.style.top=(r.top-ft.offsetHeight-8<8?r.bottom+8:r.top-ft.offsetHeight-8)+"px";
});
/* #12345 + 띄어쓰기 → 일감 칩 */
function wkAutoIssue(){
  const s=getSelection();if(!s.rangeCount)return;const n=s.anchorNode;if(!n||n.nodeType!==3||n.parentElement.closest("pre,code,a"))return;
  const m=n.data.slice(0,s.anchorOffset).match(/(^|[\s( ])#([1-9]\d{1,7})[\s ]$/);if(!m)return;
  const r=document.createRange();r.setStart(n,s.anchorOffset-m[2].length-2);r.setEnd(n,s.anchorOffset-1);s.removeAllRanges();s.addRange(r);
  document.execCommand("insertHTML",false,wkChip("issue",+m[2]));
}
/* [[ 입력 → 연결 고르기 */
function wkBrackets(){
  const s=getSelection();if(!s.rangeCount)return;const n=s.anchorNode;if(!n||n.nodeType!==3||n.parentElement.closest("pre,code"))return;
  if(n.data.slice(0,s.anchorOffset).endsWith("[[")){const r=document.createRange();r.setStart(n,s.anchorOffset-2);r.setEnd(n,s.anchorOffset);wkSavedRange=r;wkPicker(r)}
}

/* ---------- 연결 고르기 ---------- */
function wkCands(q,tab){
  q=q.toLowerCase().replace(/^#/,"");const out=[],has=(...xs)=>!q||xs.join(" ").toLowerCase().includes(q),me=wkCur();
  if(/^\d{2,8}$/.test(q)&&(tab==="all"||tab==="issue")){const n=all.find(x=>x.issue_id===+q);out.push({k:"issue",id:+q,t:`#${q} ${n?n.subject:""}`,s:n?stOf(n):"아직 가져오지 않음"})}
  const push=(k,id,t,s)=>{if((tab==="all"||tab===k)&&!out.some(x=>x.k===k&&String(x.id)===String(id)))out.push({k,id,t,s})};
  (typeof queries!=="undefined"?queries:[]).forEach(x=>{if(has(x.title,x.purpose,(x.tags||[]).join(" ")))push("vault",x.id,x.title||"(제목 없음)",qvIsQuery(x)?"쿼리":"코드")});
  (typeof troubles!=="undefined"?troubles:[]).forEach(x=>{if(has(x.title,(x.tags||[]).join(" ")))push("trouble",x.id,x.title,x.status)});
  wikis.forEach(x=>{if((!me||x.id!==me.id)&&has(x.title))push("wiki",x.id,x.title,wkTrail(x.id).slice(0,-1).map(y=>y.title).join(" › ")||"최상위")});
  if(q)for(const [nm,e] of tokIdx){if(out.length>400)break;if(nm.toLowerCase().includes(q))push("code",nm,nm,`일감 ${e.notes.length}건`)}
  if(q&&(tab==="all"||tab==="issue"))all.filter(n=>String(n.issue_id).includes(q)||(n.subject||"").toLowerCase().includes(q)).slice(0,40).forEach(n=>push("issue",n.issue_id,`#${n.issue_id} ${n.subject}`,stOf(n)));
  return out.slice(0,60);
}
function wkPicker(anchor){
  wkPkClose();
  const pk=document.createElement("div");pk.id="wkPk";pk.className="wk-pk";pk.setAttribute("role","dialog");pk.setAttribute("aria-label","연결할 항목 고르기");
  pk.innerHTML=`<input id="wkPkQ" placeholder="찾기: 보관함 · 트러블슈팅 · 코드 이름 · 위키 · 일감 번호/제목" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="wkPkL">
    <div class="wk-pkt" id="wkPkT">${[["all","전체"],...Object.entries(WK_KINDS)].map(([k,n])=>`<button type="button" data-pt="${k}">${n}</button>`).join("")}</div>
    <div class="wk-pkl" id="wkPkL" role="listbox"></div><div class="wk-pkf">↑↓ 고르기 · Enter 넣기 · Esc 닫기</div>`;
  document.body.appendChild(pk);
  wkPk={tab:"all",sel:0,list:[]};
  const dr=$("#wkDoc").getBoundingClientRect(),rr=(anchor||wkSavedRange)?.getBoundingClientRect();
  const x=rr&&(rr.left||rr.top)?rr.left:dr.left,y=(rr&&(rr.left||rr.top)?rr.bottom:dr.top)+6;
  pk.style.left=Math.max(8,Math.min(innerWidth-388,x))+"px";pk.style.top=Math.max(8,Math.min(innerHeight-380,y))+"px";
  const draw=()=>{const q=$("#wkPkQ").value.trim();wkPk.list=wkCands(q,wkPk.tab);wkPk.sel=Math.min(wkPk.sel,Math.max(0,wkPk.list.length-1));
    pk.querySelectorAll("[data-pt]").forEach(b=>b.classList.toggle("on",b.dataset.pt===wkPk.tab));
    $("#wkPkL").innerHTML=wkPk.list.map((x,i)=>`<button type="button" class="wk-pki${i===wkPk.sel?" on":""}" role="option" aria-selected="${i===wkPk.sel}" data-pi="${i}" data-k="${x.k}">${wkIc(x.k)}<span class="ty">${WK_KINDS[x.k]}</span><span class="nm">${esc(x.t)}</span><span class="sub">${esc(x.s||"")}</span></button>`).join("")
      ||`<div class="wk-none">${q?"찾는 게 없어요":"찾을 말을 적어요 · 코드 이름 · 일감은 적어야 나와요"}</div>`;
    const on=$("#wkPkL .on");if(on)on.scrollIntoView({block:"nearest"})};
  const pick=i=>{const x=wkPk.list[i];if(!x)return;wkPkClose();wkRestore();$("#wkDoc").focus();
    const s=getSelection();if(anchor&&s.rangeCount&&s.getRangeAt(0).toString()==="[[")document.execCommand("delete");
    document.execCommand("insertHTML",false,wkChip(x.k,x.id)+" ");wkQueue()};
  $("#wkPkQ").oninput=()=>{wkPk.sel=0;draw()};
  $("#wkPkQ").onkeydown=e=>{
    if(e.key==="ArrowDown"){wkPk.sel=Math.min(wkPk.list.length-1,wkPk.sel+1);draw();e.preventDefault()}
    else if(e.key==="ArrowUp"){wkPk.sel=Math.max(0,wkPk.sel-1);draw();e.preventDefault()}
    else if(e.key==="Enter"&&!e.isComposing){e.preventDefault();pick(wkPk.sel)}
    else if(e.key==="Escape"){e.preventDefault();wkPkClose();if(anchor){wkRestore();const s=getSelection();s.collapseToEnd()}$("#wkDoc").focus()}};
  pk.onmousedown=e=>{if(e.target.id!=="wkPkQ")e.preventDefault()};
  pk.onclick=e=>{const t=e.target.closest("[data-pt]");if(t){wkPk.tab=t.dataset.pt;wkPk.sel=0;draw();$("#wkPkQ").focus();return}
    const it=e.target.closest("[data-pi]");if(it)pick(+it.dataset.pi)};
  draw();$("#wkPkQ").focus();
  setTimeout(()=>document.addEventListener("mousedown",wkPkOut,true),0);
}
function wkPkOut(e){const pk=$("#wkPk");if(pk&&!pk.contains(e.target))wkPkClose()}
function wkPkClose(){const pk=$("#wkPk");if(pk)pk.remove();document.removeEventListener("mousedown",wkPkOut,true);wkPk=null}

/* ---------- 칩 누르기: 그 화면으로 (쿼리 · 코드는 팝업, 위키는 열 보기에서) ---------- */
async function wkFollow(a){
  const k=a.dataset.k,id=a.dataset.ref;wkFlush();
  if(a.classList.contains("gone")){toast(`지워진 ${WK_KINDS[k]} 항목이에요. 연결은 지워도 돼요`,3000);return}
  if(k==="issue"){const n=+id;
    if(all.some(x=>x.issue_id===n)){openNote(n);return}
    if(!await askC(`#${n} 은 아직 내 노트에 없어요. 레드마인에서 가져올까요?`,{ok:"가져오기"}))return;
    toast(`#${n} 가져오는 중…`,0);
    try{const r=await post("/api/fetch",{ids:[n]});await loadAll();if(r.got.includes(n)){toast(`#${n} 가져왔어요`,2200);openNote(n)}else toast(`#${n} 가져오지 못했어요: ${(r.failed[0]||{}).reason||"알 수 없음"}`,6000)}
    catch(e){toast("오류: "+e.message,6000)}
    return}
  if(k==="vault"){qvPopup(+id);return}
  if(k==="trouble"){openTrouble(+id);return}
  if(k==="code"){if(!tokIdx.has(id)){toast(`‘${id}’ 은(는) 지금 내 노트에 안 나와서 코드 이력이 없어요`,3200);return}trOpenCode(id);return}
  if(k==="wiki")wkOpen(+id);
}

/* ---------- 만들기 · 우클릭 메뉴 · 옮기기 · 지우기 ---------- */
async function wkCreate(parentId,afterId){
  await wkFlush();
  try{const r=await post("/api/wiki",{title:"새 문서",body:"",parent_id:parentId,after_id:afterId||null});await wkLoad(true);
    wkPath=wkTrail(r.id).map(w=>w.id);wkDrawCols();wkDrawEd();const t=$("#wkTitle");if(t){t.focus();t.select()}}
  catch(e){toast("문서를 만들지 못했어요: "+e.message,5000)}
}
async function wkMoveTo(w,parentId,index,show){
  await wkFlush();
  try{await post("/api/wiki/move",{id:w.id,parent_id:parentId,index});await wkLoad(true);wkPath=wkTrail(show||!wkPath.length?w.id:wkPath[wkPath.length-1]).map(x=>x.id);wkDrawCols();wkDrawEd()}
  catch(e){toast("옮기지 못했어요: "+e.message,5000)}
}
function wkMenu(id,e){
  const w=wkById(id);if(!w)return;
  const sib=wkKids(w.parent_id),i=sib.findIndex(x=>x.id===id),kids=wkKids(id).length;
  document.querySelectorAll(".popmenu").forEach(m=>m.remove());
  const items=[["하위 문서 만들기",()=>wkCreate(id)],["아래에 같은 단계 문서",()=>wkCreate(w.parent_id,id)],null,
    ["이름 바꾸기 (F2)",()=>{wkOpen(id);const t=$("#wkTitle");t.focus();t.select()}],
    ["위로",()=>wkMoveTo(w,w.parent_id,i-1),i<=0],["아래로",()=>wkMoveTo(w,w.parent_id,i+1),i>=sib.length-1],
    ["다른 곳으로 옮기기…",()=>wkMoveDlg(w)],null,["여기부터 내보내기…",()=>{wkOpen(id);wkExport(w)}],null,
    [kids?`지우기 (하위 문서 ${kids}개가 있어서 못 지워요)`:"지우기",()=>wkDelete(w),!!kids]];
  const m=document.createElement("div");m.className="popmenu wk-menu";m.setAttribute("role","menu");
  m.innerHTML=items.map((x,k)=>x?`<button type="button" role="menuitem" data-pm="${k}" ${x[2]?"disabled":""}>${esc(x[0])}</button>`:`<hr>`).join("");
  document.body.appendChild(m);
  m.style.left=Math.max(8,Math.min(innerWidth-m.offsetWidth-8,e.clientX))+"px";m.style.top=Math.max(8,Math.min(innerHeight-m.offsetHeight-8,e.clientY))+"px";
  m.onclick=ev=>{const b=ev.target.closest("[data-pm]");if(!b||b.disabled)return;m.remove();items[+b.dataset.pm][1]()};
  const off=ev=>{if(!m.contains(ev.target)){m.remove();document.removeEventListener("mousedown",off,true)}};
  setTimeout(()=>document.addEventListener("mousedown",off,true),0);
  m.querySelector("button:not([disabled])")?.focus();
  m.onkeydown=ev=>{const bs=[...m.querySelectorAll("button:not([disabled])")],j=bs.indexOf(document.activeElement);
    if(ev.key==="ArrowDown"){ev.preventDefault();bs[(j+1)%bs.length].focus()}else if(ev.key==="ArrowUp"){ev.preventDefault();bs[(j-1+bs.length)%bs.length].focus()}else if(ev.key==="Escape"){m.remove();$("#wkCols").focus()}};
}
async function wkMoveDlg(w){
  const bad=new Set([w.id]);(function mark(id){wkKids(id).forEach(k=>{bad.add(k.id);mark(k.id)})})(w.id);
  const opts=[];(function walk(pid,d){wkKids(pid).forEach(k=>{if(bad.has(k.id))return;opts.push(`<option value="${k.id}" ${k.id===w.parent_id?"selected":""}>${"　".repeat(d)}${esc(k.title)}</option>`);walk(k.id,d+1)})})(null,0);
  const v=await wdlg({title:`‘${esc(w.title)}’ 옮기기`,body:`<label class="meta" for="wkMv">어느 문서 아래로 옮길까요? (맨 아래에 붙어요)</label><select id="wkMv" style="width:100%;margin-top:6px" size="12"><option value="" ${w.parent_id==null?"selected":""}>(최상위 주제)</option>${opts.join("")}</select>`,ok:"옮기기",collect:()=>$("#wkMv").value});
  if(v===false||v==null)return;
  await wkMoveTo(w,v?+v:null,1e6,true);toast(`‘${w.title}’ 을(를) 옮겼어요`,2000);
}
async function wkDelete(w){
  if(!await askC(`‘${w.title}’ 문서를 지울까요? 되돌릴 수 없어요.`,{ok:"지우기"}))return;
  wkDirty=null;clearTimeout(wkSaveT);
  try{await api("/api/wiki/"+w.id,{method:"DELETE"});await wkLoad(true);
    if(wkPath.includes(w.id))wkPath=wkPath.slice(0,wkPath.indexOf(w.id));
    if(!wkPath.length){const f=wkKids(w.parent_id)[0]||wkKids(null)[0];if(f)wkPath=wkTrail(f.id).map(x=>x.id)}
    toast("지웠어요",1800);wkDrawCols();wkDrawEd()}
  catch(e){toast("지우지 못했어요: "+e.message,5000)}
}

/* ---------- 내보내기 ----------
   문서 제목 = 깊이에 맞는 제목 + 번호(1, 1.2 …) · 하위 문서 앞에 구분선 / 본문 안 제목은 문서 제목 바로 아래 단계부터
   연결 칩은 글자로 풀어서 나간다 (받는 사람은 앱이 없으니까) */
function wkCollect(w,depth,num,o,acc){
  acc.push({w,depth,num});
  if(o.sub){let n=0;wkKids(w.id).forEach(k=>{if(!o.empty&&wkBodyEmpty(k.body)&&!wkKids(k.id).length)return;n++;wkCollect(k,depth+1,(num?num+".":"")+n,o,acc)})}
  return acc;
}
function wkRefText(a){const k=a.dataset.k,id=a.dataset.ref,i=wkLinkInfo(k,id);
  if(i.gone)return i.label;return k==="issue"?"#"+id:k==="wiki"?`‘${i.label}’ 문서`:`[${WK_KINDS[k]}: ${i.label}]`}
function wkBodyFor(html,lv){
  const box=wkClean(html);
  const hs=[...box.querySelectorAll("h2,h3,h4")],min=hs.length?Math.min(...hs.map(h=>+h.tagName[1])):2,shift=lv+1-min;
  hs.forEach(h=>{const n=document.createElement("h"+Math.min(6,+h.tagName[1]+shift));n.innerHTML=h.innerHTML;h.replaceWith(n)});
  box.querySelectorAll("a.lk").forEach(a=>{const s=document.createElement("span");s.className="ref";s.textContent=wkRefText(a);a.replaceWith(s)});
  return box;
}
function wkMd(node){
  const esc2=s=>s.replace(/([\\`*_~|])/g,"\\$1");
  const inl=n=>[...n.childNodes].map(c=>{if(c.nodeType===3)return esc2(c.data.replace(/ /g," "));if(c.nodeType!==1)return "";const t=c.tagName.toLowerCase(),x=inl(c);
    if(["b","strong","mark"].includes(t))return x.trim()?`**${x}**`:x;      // 형광펜은 굵게로 남는다 (색은 빠짐)
    if(t==="i"||t==="em")return x.trim()?`*${x}*`:x;if(["s","strike","del"].includes(t))return x.trim()?`~~${x}~~`:x;if(t==="code")return "`"+c.textContent+"`";if(t==="br")return "  \n";return x}).join("");
  const blk=(n,ind="")=>{const out=[];[...n.childNodes].forEach(c=>{
    if(c.nodeType===3){if(c.data.trim())out.push(ind+esc2(c.data.trim()));return}if(c.nodeType!==1)return;const t=c.tagName.toLowerCase();
    if(/^h[1-6]$/.test(t))out.push("#".repeat(+t[1])+" "+inl(c).trim());
    else if(t==="ul"||t==="ol")out.push([...c.children].map((li,i)=>{const sub=[...li.children].filter(x=>/^(ul|ol)$/i.test(x.tagName)),cl=li.cloneNode(true);cl.querySelectorAll("ul,ol").forEach(x=>x.remove());
      return ind+(t==="ol"?(i+1)+". ":"- ")+inl(cl).trim()+(sub.length?"\n"+sub.map(s=>blk({childNodes:[s]},ind+"   ")).join("\n"):"")}).join("\n"));
    else if(t==="table"){const rows=[...c.querySelectorAll("tr")];if(!rows.length)return;const cells=r=>"| "+[...r.children].map(td=>inl(td).trim().replace(/\n/g," ")).join(" | ")+" |";
      out.push([cells(rows[0]),"|"+[...rows[0].children].map(()=>"---").join("|")+"|",...rows.slice(1).map(cells)].join("\n"))}
    else if(t==="pre")out.push("```\n"+c.textContent.replace(/\n$/,"")+"\n```");
    else if(t==="blockquote")out.push(blk(c).split("\n").map(l=>"> "+l).join("\n"));
    else if(t==="hr")out.push("---");
    else if(["p","div"].includes(t)){const x=inl(c).trim();if(x)out.push(ind+x)}
    else{const x=inl(c).trim();if(x)out.push(ind+x)}});return out.join("\n\n")};
  return blk(node);
}
const WK_EXPORT_CSS=`body{font:15px/1.65 "Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif;color:#1f242d;max-width:860px;margin:32px auto;padding:0 20px}
h1,h2,h3,h4,h5,h6{line-height:1.3;margin:1.4em 0 .5em}.doc-t{border-top:2px solid #d0d5dd;padding-top:16px;margin-top:36px}.doc-t:first-of-type{border-top:0;margin-top:0;padding-top:0}
.doc-t .no{color:#2f6fd6;margin-right:8px}.toc{background:#f4f6f9;border-radius:8px;padding:12px 18px 12px 30px;margin:16px 0 28px}.toc a{color:#1f242d;text-decoration:none}
table{border-collapse:collapse;margin:.8em 0}th,td{border:1px solid #c9ced6;padding:5px 10px;text-align:left;vertical-align:top}th{background:#eef1f5}
pre{background:#f2f4f7;border-radius:6px;padding:10px 12px;overflow-x:auto;font:13px/1.55 Consolas,"D2Coding",monospace}code{font-family:Consolas,"D2Coding",monospace;background:#f2f4f7;padding:1px 4px;border-radius:4px}pre code{background:none;padding:0}
mark{color:inherit;padding:0 1px;border-radius:2px}mark.hl-y{background:#fff0a3}mark.hl-g{background:#c9f2cf}mark.hl-p{background:#ffd3e6}mark.hl-b{background:#cfe3ff}
.fc-red{color:#c62828}.fc-org{color:#b45309}.fc-blue{color:#1f5fbf}.fc-gray{color:#6b7380}.ref{color:#2f6fd6;font-weight:600}.meta{color:#6b7380;font-size:13px}
@media print{body{margin:0;max-width:none}.doc-t{break-after:avoid}}`;
function wkBuild(w,o){
  const L=wkCollect(w,0,"",o,[]),root=wkTrail(w.id).map(x=>x.title).join(" › ");
  if(o.fmt==="md")return {name:`${w.title}.md`,type:"text/markdown",n:L.length,
    text:L.map(({w,depth,num},i)=>{const lv=Math.min(6,depth+1);return `${i?"---\n\n":""}${"#".repeat(lv)} ${num?num+" ":""}${w.title}\n\n${wkBodyEmpty(w.body)?"(비어 있음)":wkMd(wkBodyFor(w.body,lv))}\n`}).join("\n")};
  const body=L.map(({w,depth,num},i)=>{const lv=Math.min(6,depth+1);return `<h${lv} class="doc-t" id="d${i}">${num?`<span class="no">${esc(num)}</span>`:""}${esc(w.title)}</h${lv}>${wkBodyEmpty(w.body)?`<p class="meta">(비어 있음)</p>`:wkBodyFor(w.body,lv).innerHTML}`}).join("\n");
  const toc=L.length>2?`<ol class="toc">${L.map(({w,depth,num},i)=>`<li style="margin-left:${depth*14}px;list-style:none"><a href="#d${i}">${num?esc(num)+" ":""}${esc(w.title)}</a></li>`).join("")}</ol>`:"";
  return {name:`${w.title}.html`,type:"text/html",n:L.length,
    text:`<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(w.title)}</title><style>${WK_EXPORT_CSS}</style></head>\n<body><p class="meta">업무 위키 · ${esc(root)} · ${esc(fmt(new Date()))} 내보냄</p>${toc}\n${body}\n</body></html>\n`};
}
async function wkExport(w){
  await wkFlush();
  const o={sub:ui.wkExSub!==false,empty:!!ui.wkExEmpty,fmt:ui.wkExFmt==="md"?"md":"html"};
  const pr=wdlg({title:"내보내기",wide:true,ok:"파일로 저장",cancel:"닫기",collect:()=>({...o}),
    body:`<div class="wk-exo"><span>범위: <b>${esc(wkTrail(w.id).map(x=>x.title).join(" › "))}</b></span>
      <label><input type="checkbox" id="wkExSub" ${o.sub?"checked":""}> 하위 문서 같이 내보내기</label>
      <label><input type="checkbox" id="wkExEmpty" ${o.empty?"checked":""}> 빈 문서도 넣기</label>
      <label><input type="radio" name="wkExF" value="html" ${o.fmt==="html"?"checked":""}> .html <small class="meta">형광펜 · 글자색 · 표 그대로 · Word 로 열기 · PDF 인쇄</small></label>
      <label><input type="radio" name="wkExF" value="md" ${o.fmt==="md"?"checked":""}> .md <small class="meta">색은 빠지고 형광펜은 굵게</small></label></div>
      <div class="wk-exp" id="wkExPv"></div><div class="meta" id="wkExInfo"></div>`});
  const upd=()=>{o.sub=$("#wkExSub").checked;o.empty=$("#wkExEmpty").checked;o.fmt=document.querySelector("[name=wkExF]:checked").value;
    const b=wkBuild(w,o),pv=$("#wkExPv");
    if(o.fmt==="md"){pv.className="wk-exp md";pv.textContent=b.text}
    else{pv.className="wk-exp html";pv.innerHTML="";const f=document.createElement("iframe");f.setAttribute("sandbox","");f.title="내보내기 미리보기";f.srcdoc=b.text;pv.appendChild(f)}
    $("#wkExInfo").textContent=`문서 ${b.n}개 · 연결은 [보관함: 이름] 같은 글자로 풀어서 나가요`};
  ["wkExSub","wkExEmpty"].forEach(id=>$("#"+id).onchange=upd);document.querySelectorAll("[name=wkExF]").forEach(r=>r.onchange=upd);upd();
  const r=await pr;if(!r)return;
  ui.wkExSub=r.sub;ui.wkExEmpty=r.empty;ui.wkExFmt=r.fmt;saveUI();
  const b=wkBuild(w,r),safe=b.name.replace(/[\\/:*?"<>|\x00-\x1f]/g,"_").slice(0,120);
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([(r.fmt==="md"?"﻿":"")+b.text],{type:b.type+";charset=utf-8"}));a.download=safe;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),5000);      // 저장 · 알림은 앱 다운로드(downloads.js)가 한다
}
