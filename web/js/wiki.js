/* ---------- 업무 위키 (2.35): 주제를 나무처럼 엮는 자유 문서 ----------
   왼쪽 = 맥 파인더 같은 열 보기 (행을 누르면 오른쪽에 그 문서, 다음 열에 하위 행). 오른쪽 = 고정 편집기.
   - 행 이름 = 문서 제목. 본문을 고쳐도 행 이름은 그대로. 하위 행 = 하위 문서. 본문이 빈 행은 흐리게 (빠진 곳 점검)
   - 본문은 HTML. 화면에서도(wkClean) 서버에서도(rnotes/wiki.py) 허용 목록만 남긴다. 형광펜 · 글자색 · 글자 크기는 이름(class)으로만
   - 연결: [[ 또는 '연결' 단추 → 보관함(코드 · 쿼리) · 트러블슈팅 · 코드 이력 · 일감(내 노트 + 레드마인 전체 검색) · 다른 위키 문서
     저장은 <a class="lk" data-k data-ref> 로 id 만. 이름은 볼 때 찾아 붙인다 (원래 항목 이름을 바꿔도 안 깨진다)
   - 내보내기: .html(형광펜 · 글자색 · 표 · 사진 그대로) / .md, 이 문서부터 / 주제 전체, 하위 문서 같이 · 빈 문서 넣기 고르기
   - 사진: 붙여넣기 · 끌어다 놓기 · '사진' 단추. 줄여서(webp) DB 에 저장 → 백업에 같이 들어간다. 본문에는 <img data-img="해시.webp"> 로 이름만
   - 잠금: 주제를 암호로 잠근다(그 아래 문서 전부). 서버가 열쇠 없이는 내주지 않는다. 연 상태(열쇠)는 이 창 메모리에만 → 창을 닫았다 열면 다시 잠김
   - 편집기(2.36): 글자 크기(fs-*) · 목록 Tab/Shift+Tab 들여쓰기 · 줄 처음 '- ' '1. ' '# ' 마크다운식 입력 · 표 줄과 칸 우클릭 메뉴 · 창 폭에 맞춘 열 수
   - 2.37: 행 끌어다 놓기 · 모든 단계를 열로(가로 스크롤) · 몰아 보기 · 표 격자 고르기(tw-full) · --- 구분선 · '> ' 인용 · 표 안 Tab · 자동 변환 Backspace 되돌리기 */
let wikis=[],wkLoaded=false,wkPath=[],wkQ="",wkSaveT=null,wkDirty=null,wkSavedRange=null,wkPk=null;
const wkKeys=new Map();      // 잠긴 주제 id -> 연 열쇠 (메모리에만: 창을 닫으면 사라져서 다시 잠긴다)
const wkHdr=()=>wkKeys.size?{"X-Wiki-Keys":[...wkKeys.values()].join(",")}:{};
const wkApi=(p,o={})=>api(p,{...o,headers:{...(o.headers||{}),...wkHdr()}});
const wkPost=(p,b)=>wkApi(p,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
const wkShut=w=>!!(w&&w.locked&&!w.open);          // 잠겼고 아직 안 연 주제 (제목만 있다)
const wkHiddenIn=id=>wikis.find(w=>wkShut(w)&&(w.hidden||[]).includes(+id));      // 이 문서를 가리고 있는 잠긴 주제
const WK_LOCK_IC=IC('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),WK_UNLOCK_IC=IC('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>');
const WK_IMG_RE=/^[0-9a-f]{40}\.(?:png|jpg|webp|gif)$/;
const WK_HL=[["hl-y","노랑"],["hl-g","초록"],["hl-p","분홍"],["hl-b","파랑"]];
const WK_FC=[["fc-red","빨강"],["fc-org","주황"],["fc-blue","파랑"],["fc-gray","회색"]];
const WK_FS=[["fs-s","작게"],["","보통"],["fs-l","크게"],["fs-xl","아주 크게"]];      // 글자 크기 (2.36): 값이 아니라 이름(class)으로. "" = 기본 크기 (class 없음)
const WK_KINDS={issue:"일감",vault:"보관함",trouble:"트러블슈팅",code:"코드 이력",wiki:"위키"};
const wkIc=k=>({issue:IC('<path d="M5 4h14v16H5z"/><path d="M9 9h6M9 13h6M9 17h3"/>'),vault:NAVICON.queries,trouble:NAVICON.trouble,code:NAVICON.code,wiki:NAVICON.wiki})[k]||"";
async function wkLoad(force){if(wkLoaded&&!force)return;try{wikis=await wkApi("/api/wiki");wkLoaded=true}catch(e){toast("업무 위키를 읽지 못했어요: "+e.message,5000)}}
const wkById=id=>wikis.find(w=>w.id===id);
const wkKids=pid=>wikis.filter(w=>(w.parent_id??null)===(pid??null)).sort((a,b)=>a.pos-b.pos||a.id-b.id);
const wkCount=id=>wkKids(id).reduce((n,k)=>n+1+wkCount(k.id),0);
function wkTrail(id){const out=[];let w=wkById(id),guard=0;while(w&&guard++<200){out.unshift(w);w=w.parent_id!=null?wkById(w.parent_id):null}return out}
const wkCur=()=>wkById(wkPath[wkPath.length-1]);
function wkBodyEmpty(h){const t=document.createElement("template");t.innerHTML=h||"";return !t.content.querySelector("img")&&!t.content.textContent.replace(/ /g," ").trim()&&!t.content.querySelector("table,pre,a.lk")}
function wkText(w){const t=document.createElement("template");t.innerHTML=w.body||"";return (w.title+"\n"+t.content.textContent).toLowerCase()}
function openWiki(id){wkFlush();if(id!=null){const tr=wkTrail(id);if(tr.length)wkPath=tr.map(w=>w.id)}setNav("wiki")}

/* ---------- 본문 거르기 (서버 rnotes/wiki.py 와 같은 허용 목록) ---------- */
const WK_ALLOWED=new Set("p div h2 h3 h4 ul ol li blockquote pre table thead tbody tr th td b strong i em u s strike del code mark span a sup sub br hr img".split(" "));
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
    if(tag==="img"){const nm=n.getAttribute("data-img")||"";if(WK_IMG_RE.test(nm)){const im=document.createElement("img");im.dataset.img=nm;parent.appendChild(im)}return}      // 사진: 우리 DB 의 이름만 (바깥 주소 X)
    let el=document.createElement(tag);
    const cls=n.getAttribute("class")||"";
    if(tag==="mark"&&WK_HL.some(x=>x[0]===cls))el.className=cls;
    else if(tag==="span"&&cls&&[...WK_FC,...WK_FS].some(x=>x[0]===cls))el.className=cls;
    else if(tag==="a"){
      const k=n.getAttribute("data-k")||"",id=n.getAttribute("data-ref")||"";
      if(cls.split(/\s+/)[0]!=="lk"||!WK_KINDS[k]||!(k==="code"?/^[^\x00-\x1f\x7f<>"'`&]{1,200}$/.test(id)&&id.trim()===id:/^[1-9][0-9]{0,11}$/.test(id))){n.childNodes.forEach(c=>walk(c,parent));return}
      el.className="lk";el.dataset.k=k;el.dataset.ref=id;
    }else if(tag==="table"&&cls==="tw-full")el.className=cls;      // 표 폭: 본문 폭에 꽉 채우기 (2.37)
    else if(tag==="th"||tag==="td")["colspan","rowspan"].forEach(a=>{const v=n.getAttribute(a);if(v&&/^[1-9][0-9]?$/.test(v))el.setAttribute(a,v)});
    n.childNodes.forEach(c=>walk(c,el));parent.appendChild(el);
  };
  t.content.childNodes.forEach(c=>walk(c,out));
  return out;
}
/* 연결 칩: 이름 · 없는 항목 표시를 붙인다 (편집기 · 내보내기 공통) */
function wkLinkInfo(k,id,fb){
  if(k==="issue"){const n=all.find(x=>x.issue_id===+id),f=(fb||"").startsWith("#"+id)?fb:"";return {label:n?`#${id} ${n.subject}`:f||"#"+id,title:n?`#${id} ${n.subject} (${stOf(n)})`:`${f||"#"+id} · 아직 내 노트에 없는 일감 (누르면 가져오기)`,miss:!n}}
  if(k==="vault"){const q=(typeof queries!=="undefined"?queries:[]).find(x=>x.id===+id);return q?{label:q.title||"(제목 없음)",title:`보관함 · ${q.title}`}:{label:"(지워진 보관함 항목)",gone:true}}
  if(k==="trouble"){const t=(typeof troubles!=="undefined"?troubles:[]).find(x=>x.id===+id);return t?{label:t.title,title:`트러블슈팅 · ${t.title} (${t.status})`}:{label:"(지워진 트러블슈팅)",gone:true}}
  if(k==="code")return {label:id,title:tokIdx.has(id)?`코드 이력 · ${id} · 일감 ${tokIdx.get(id).notes.length}건`:`코드 이력 · ${id} (지금 노트에는 안 나와요)`,miss:!tokIdx.has(id)};
  if(k==="wiki"){const w=wkById(+id);if(!w&&wkHiddenIn(id))return {label:"(잠긴 문서)",title:`‘${wkHiddenIn(id).title}’ 주제 안의 잠긴 문서 · 누르면 암호를 물어요`,locked:true};
    return w?{label:w.title,title:"업무 위키 · "+wkTrail(w.id).map(x=>x.title).join(" › ")}:{label:"(지워진 위키 문서)",gone:true}}
  return {label:id,gone:true};
}
function wkDecorate(root){
  root.querySelectorAll("img[data-img]").forEach(im=>{im.src="/api/wiki/img/"+im.dataset.img;im.alt="";im.className="wk-img";im.loading="lazy"});
  root.querySelectorAll("a.lk").forEach(a=>{const i=wkLinkInfo(a.dataset.k,a.dataset.ref,a.textContent.trim());
    a.setAttribute("contenteditable","false");a.className="lk"+(i.miss?" miss":"")+(i.gone?" gone":"")+(i.locked?" locked":"");a.title=i.title||i.label;
    a.innerHTML=wkIc(a.dataset.k)+`<span>${esc(i.label)}</span>`});
  return root;
}
const wkChip=(k,id,label)=>{const a=document.createElement("a");a.className="lk";a.dataset.k=k;a.dataset.ref=String(id);if(label)a.textContent=label;return wkDecorate((()=>{const d=document.createElement("div");d.appendChild(a);return d})()).innerHTML};
function wkSerialize(root){       // 저장할 HTML: 칩은 이름 글자만 남기고 화면용 속성은 뺀다
  const c=root.cloneNode(true);
  c.querySelectorAll("a.lk").forEach(a=>{const lb=a.textContent;a.removeAttribute("contenteditable");a.removeAttribute("title");a.className="lk";a.textContent=lb});
  return wkClean(c.innerHTML).innerHTML;
}

/* ---------- 화면 ---------- */
async function renderWiki(){
  await Promise.all([wkLoad(),typeof qvLoad==="function"?qvLoad():0,typeof trLoad==="function"?trLoad():0]);if(view!=="wiki")return;
  wkPath=wkPath.filter(id=>wkById(id));
  if(!wkPath.length&&ui.wkCur!=null){const last=wkById(ui.wkCur)||wkHiddenIn(ui.wkCur);if(last)wkPath=wkTrail(last.id).map(w=>w.id)}      // 다시 켰을 때: 잠긴 주제 안이었으면 그 주제(암호 창)로
  $("#center").innerHTML=`<div class="wk-wrap">
    <div class="wk-top"><h2>업무 위키</h2><button type="button" class="wk-home" id="wkHome" title="주제 목록 (맨 위 단계)으로">${IC('<path d="M4 6h16M4 12h16M4 18h10"/>')}주제 목록</button><nav class="wk-crumbs" id="wkCrumbs" aria-label="문서 경로"></nav>
      <div class="search wk-q"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><input id="wkQ" placeholder="제목 · 본문 찾기" value="${esc(wkQ)}" autocomplete="off"></div>
      <button type="button" id="wkNewRoot" title="맨 위 단계에 새 주제를 만들어요">＋ 새 주제</button>
      <button type="button" id="wkColsT" title="열 보기를 잠깐 꺼내요 (전체 화면에서만)" aria-pressed="false">열 보기</button>
      <button type="button" id="wkFull" title="" aria-pressed="false"></button>
      <button type="button" id="wkRead" title="지금 문서와 하위 문서를 한 화면에 이어서 읽어요 (주제 목록에서는 주제 전체)" aria-pressed="false">${IC('<path d="M4 5h7a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4z"/><path d="M20 5h-7a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h7z"/>')}몰아 보기</button>
      <button type="button" class="primary" id="wkExp" title="지금 문서(와 하위 문서)를 파일로 내보내요">내보내기</button></div>
    <div class="wk-body"><div class="wk-cols" id="wkCols" tabindex="0" role="tree" aria-label="문서 열 보기 · 화살표로 이동, Enter 로 편집" ></div>
      <div class="wk-split" id="wkSplit" title="끌어서 폭 조절"></div><section class="wk-ed" id="wkEd"></section></div></div>`;
  $("#wkQ").oninput=e=>{wkQ=e.target.value.trim();wkDrawCols()};
  $("#wkQ").onkeydown=e=>{if(e.key==="Escape"){e.target.value="";wkQ="";wkDrawCols()}else if(e.key==="Enter"){const h=$("#wkCols [data-wid]");if(h)h.click()}};
  $("#wkNewRoot").onclick=()=>wkCreate(null);
  $("#wkHome").onclick=wkGoHome;
  $("#wkFull").onclick=()=>wkSetFull(!wkFull);
  $("#wkColsT").onclick=()=>{ui.wkFullCols=!ui.wkFullCols;saveUI();wkApplyFull()};
  $("#wkExp").onclick=()=>{const w=wkCur();wkExport(w&&!wkShut(w)?w:null)};
  $("#wkRead").onclick=()=>{const w=wkCur();if(w&&wkShut(w)){toast("잠긴 주제는 먼저 열어야 몰아 볼 수 있어요",2500);return}wkFlush();wkRead=wkRead?null:{id:w?w.id:null};wkDrawEd()};
  wkWireCols();wkWireSplit();wkWatchSize();
  wkDrawCols();wkDrawEd();wkApplyFull();
}
/* 전체 화면 (2.35.1): 앱 왼쪽 메뉴와 열 보기를 숨기고 문서를 창 가운데에 읽기 좋은 폭으로.
   위쪽 경로 표시줄 · 아래 하위 문서 단추로 오가고, '열 보기' 로 열을 잠깐 꺼낼 수 있다. 찾는 중에는 찾은 목록이 보인다. Esc(글 칸 밖) = 원래대로 */
let wkFull=false;      // 앱을 다시 켜면 늘 꺼진 채로 (켜자마자 왼쪽 메뉴가 없는 화면이 되지 않게)
const wkFullOn=()=>view==="wiki"&&wkFull;
function wkApplyFull(){
  const w=$(".wk-wrap");if(!w)return;const on=wkFull,cols=on&&(!!ui.wkFullCols||!!wkQ);
  w.classList.toggle("full",on);w.classList.toggle("cols-on",cols);
  const b=$("#wkFull");if(b){b.textContent=on?"원래대로":"전체 화면";b.title=on?"왼쪽 메뉴 · 열 보기를 다시 보여요 (Esc)":"왼쪽 메뉴 · 열 보기를 숨기고 문서를 가운데에 넓게 봐요";b.setAttribute("aria-pressed",on)}
  const c=$("#wkColsT");if(c){c.hidden=!on;c.setAttribute("aria-pressed",cols);c.classList.toggle("on",cols)}
}
function wkSetFull(on){wkFull=!!on;applyUI();wkApplyFull();const d=on?$("#wkDoc"):$("#wkCols");if(d)d.focus({preventScroll:true})}
document.addEventListener("keydown",e=>{
  if(e.key!=="Escape"||!wkFullOn()||e.defaultPrevented||document.querySelector("#wdlg.show,#wkPk,.wk-menu"))return;
  const a=document.activeElement;if(a&&(a.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)))return;     // 글을 쓰는 중이면 Esc 는 그 칸의 것
  e.preventDefault();wkSetFull(false);
});
function wkGoHome(){wkFlush();wkPath=[];if(wkQ){wkQ="";const q=$("#wkQ");if(q)q.value=""}wkDrawCols();wkDrawEd();const c=$("#wkCols");if(c)c.focus({preventScroll:true})}
function wkDrawCols(){
  const el=$("#wkCols");if(!el)return;
  const cur=wkPath[wkPath.length-1];
  wkApplyFull();
  if(wkQ){      // 찾기: 열 대신 찾은 문서 목록
    const q=wkQ.toLowerCase(),hit=wikis.filter(w=>wkText(w).includes(q)).slice(0,200);
    wkColsSize(el,1);
    el.innerHTML=`<div class="wk-col wk-hits"><div class="wk-ch"><span>찾은 문서 ${hit.length}개</span></div>${hit.map(w=>`<button type="button" class="wk-row${w.id===cur?" cur":""}" data-wid="${w.id}"><span class="nm">${esc(w.title)}</span><span class="wk-trail">${esc(wkTrail(w.id).slice(0,-1).map(x=>x.title).join(" › ")||"최상위")}</span></button>`).join("")||`<div class="wk-none">찾는 문서가 없어요</div>`}</div>`;
    $("#wkCrumbs").innerHTML="";return;
  }
  const lists=[{list:wkKids(null),parent:null}];
  wkPath.forEach(id=>{const k=wkKids(id);if(k.length)lists.push({list:k,parent:wkById(id)})});
  /* 2.37: 앞 단계를 접지 않고 모든 단계를 열로 그린다. 2.38: 보이는 열 수 = 손잡이로 정한 칸 수(기본 3)와 단계 수 중 작은 쪽, 단계가 더 많으면 아래 가로 스크롤 */
  const fit=wkColsSize(el,0,lists.length),hidden=0,keepX=el.scrollLeft,same=el.dataset.path===wkPath.join(",");
  el.dataset.path=wkPath.join(",");el.classList.toggle("over",lists.length>fit);
  el.innerHTML=!wikis.length?`<div class="wk-col"><div class="wk-none"><b>아직 문서가 없어요</b>업무 주제를 나무처럼 엮어 두는 곳이에요.<br>예) 법인콘도 › 경기도청 › 성수기 신청<br><button type="button" class="primary" data-wknew="">＋ 첫 주제 만들기</button></div></div>`
    :lists.map(c=>`<div class="wk-col" data-pid="${c.parent?c.parent.id:""}" role="group" aria-label="${esc(c.parent?c.parent.title:"주제")}"><div class="wk-ch"><span>${esc(c.parent?c.parent.title:"주제")}</span><button type="button" class="icon" data-wknew="${c.parent?c.parent.id:""}" title="여기에 새 문서" aria-label="여기에 새 문서">＋</button></div>
      ${c.list.map(w=>{const n=wkKids(w.id).length,on=w.id===cur,inP=wkPath.includes(w.id),shut=wkShut(w),emp=!shut&&wkBodyEmpty(w.body)&&!n;
        return `<button type="button" class="wk-row${on?" cur":inP?" path":""}${emp?" empty":""}${shut?" shut":""}" draggable="${!shut}" role="treeitem" aria-selected="${on}" data-wid="${w.id}" title="${esc(w.title)}${shut?" (잠긴 주제 · 눌러서 암호 넣기)":w.locked?" (잠긴 주제 · 지금은 열려 있어요)":emp?" (본문이 비어 있어요)":""}">${shut?WK_LOCK_IC:n?NAVICON.wiki:IC('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>')}<span class="nm">${esc(w.title)}</span>${w.locked&&!shut?`<span class="wk-lk" aria-label="잠금 열림">${WK_UNLOCK_IC}</span>`:""}${n?`<span class="cn">${wkCount(w.id)}</span><span class="ar">›</span>`:shut&&(w.hidden||[]).length?`<span class="cn">${w.hidden.length}</span>`:""}</button>`}).join("")}</div>`).join("");
  wkColGrips(el);
  el.scrollLeft=same?keepX:el.scrollWidth;      // 다른 문서로 가면 지금 단계(오른쪽 끝)가 보이게, 저장 등으로 다시 그릴 땐 보던 자리 그대로
  const tr=wkPath.map(wkById).filter(Boolean);
  $("#wkCrumbs").innerHTML=tr.map((w,i)=>`<span class="sep">›</span><button type="button" data-wkcr="${i}" data-wdrop="${w.id}" title="이 단계로 (문서를 끌어다 놓으면 이 아래로 옮겨요)">${esc(w.title)}</button>`).join("");
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
    else if(e.key==="Enter"){e.preventDefault();const d=$("#wkDoc")||$("#wkPw");if(d)d.focus();return}
    else if(e.key==="F2"){e.preventDefault();$("#wkTitle").focus();$("#wkTitle").select();return}
    else return;
    e.preventDefault();wkFlush();wkDrawCols();wkDrawEd();
    const c=$("#wkCols .wk-row.cur");if(c)c.scrollIntoView({block:"nearest"});
  };
  el.oncontextmenu=e=>{const r=e.target.closest("[data-wid]");if(!r||wkQ)return;e.preventDefault();wkMenu(+r.dataset.wid,e)};
  wkWireDrag(el);wkWireColGrip(el);
}
/* 끌어다 놓기 (2.37): 행의 위쪽 ⅓ = 그 앞, 아래쪽 ⅓ = 그 뒤(같은 단계), 가운데 = 그 문서의 하위로(맨 끝). 열 빈 곳 = 그 열의 맨 끝.
   하위가 있는 행 위에 잠깐 머무르면 그 문서를 열어(파인더처럼) 더 깊은 곳으로 옮길 수 있다. 경로 표시줄 단계 위에 놓아도 그 아래로.
   자기 자신 · 자기 하위 · 잠긴 주제 안으로는 놓을 수 없다 (서버도 막는다). 편집기에 놓으면 그 문서로 가는 연결 칩이 들어간다 */
let wkDrag=null;
function wkDropAt(e){
  const d=wkDrag;if(!d)return null;const me=wkById(d.id);if(!me)return null;
  const ok=(pid,index,mark,zone)=>{if(pid!=null&&(d.bad.has(pid)||wkShut(wkById(pid))||!wkById(pid)))return null;
    const sib=wkKids(pid).filter(x=>x.id!==d.id);index=Math.max(0,Math.min(sib.length,index));
    const cur=wkKids(me.parent_id).findIndex(x=>x.id===d.id);if((me.parent_id??null)===(pid??null)&&cur===index)return null;      // 제자리
    return {pid,index,mark,zone}};
  const cr=e.target.closest&&e.target.closest("[data-wdrop]");if(cr){const id=+cr.dataset.wdrop;return ok(id,1e6,cr,"in")}
  const r=e.target.closest&&e.target.closest("#wkCols [data-wid]");
  if(r){const t=wkById(+r.dataset.wid);if(!t||t.id===d.id)return null;const b=r.getBoundingClientRect(),y=(e.clientY-b.top)/b.height;
    const sib=wkKids(t.parent_id).filter(x=>x.id!==d.id),i=sib.findIndex(x=>x.id===t.id);
    if(y<.3&&!d.bad.has(t.id))return ok(t.parent_id??null,i,r,"before");if(y>.7&&!d.bad.has(t.id))return ok(t.parent_id??null,i+1,r,"after");
    if(wkShut(t))return null;return ok(t.id,1e6,r,"in")}
  const c=e.target.closest&&e.target.closest("#wkCols .wk-col[data-pid]");
  if(c){const pid=c.dataset.pid?+c.dataset.pid:null;return ok(pid,1e6,c,"end")}
  return null;
}
function wkDropShow(t){
  document.querySelectorAll(".wk-drop-before,.wk-drop-after,.wk-drop-in,.wk-drop-end").forEach(x=>x.classList.remove("wk-drop-before","wk-drop-after","wk-drop-in","wk-drop-end"));
  if(t)t.mark.classList.add("wk-drop-"+t.zone);
}
function wkWireDrag(el){
  const crumbs=$("#wkCrumbs"),end=()=>{clearTimeout(wkDrag&&wkDrag.t);wkDrag=null;wkDropShow(null);document.querySelectorAll(".wk-row.dragging").forEach(x=>x.classList.remove("dragging"))};
  el.ondragstart=e=>{const r=e.target.closest("[data-wid]"),w=r&&wkById(+r.dataset.wid);if(!w||wkQ||wkShut(w)){e.preventDefault();return}
    const bad=new Set([w.id]);(function mark(id){wkKids(id).forEach(k=>{bad.add(k.id);mark(k.id)})})(w.id);
    wkDrag={id:w.id,bad,t:0,over:0};e.dataTransfer.effectAllowed="copyMove";e.dataTransfer.setData("text/x-wiki",String(w.id));r.classList.add("dragging")};
  const over=e=>{if(!wkDrag)return;const t=wkDropAt(e);wkDropShow(t);if(!t)return;e.preventDefault();e.dataTransfer.dropEffect="move";
    const hid=t.zone==="in"&&t.mark.dataset.wid?+t.mark.dataset.wid:0;      // 하위가 있는 닫힌 문서 위에 0.7초 머무르면 연다
    if(hid!==wkDrag.over){clearTimeout(wkDrag.t);wkDrag.over=hid;if(hid&&wkKids(hid).length&&!wkPath.includes(hid))wkDrag.t=setTimeout(()=>{if(wkDrag&&wkDrag.over===hid)wkOpen(hid)},700)}};
  const drop=e=>{if(!wkDrag)return;e.preventDefault();const t=wkDropAt(e),w=wkById(wkDrag.id);end();if(t&&w)wkMoveTo(w,t.pid,t.index,true)};
  el.ondragover=crumbs.ondragover=over;el.ondrop=crumbs.ondrop=drop;
  el.ondragleave=crumbs.ondragleave=e=>{if(!e.relatedTarget||!e.currentTarget.contains(e.relatedTarget))wkDropShow(null)};
  if(!wkWireDrag.on){wkWireDrag.on=1;document.addEventListener("dragend",()=>{if(wkDrag)end()})}      // 행을 다시 그려 원래 행이 사라져도 끝은 정리한다
}
/* 열 보기 크기 (2.38): 손잡이 두 개를 따로 둔다 (위치가 겹치지 않게)
   - 열 보기 넓이 = 열과 문서 사이 손잡이 → 보일 열 개수(ui.wkColN, 1~8, 기본 3)가 한 칸씩 늘고 준다. 넓이는 늘 '개수 × 열 너비'에 딱 맞는다
     (단계가 그보다 적으면 단계 수만큼만 — 빈 칸은 만들지 않는다)
   - 열 너비 = 열과 열 사이 경계의 손잡이 → 모든 열의 너비(ui.wkColW, 140~420, 기본 210). 개수는 그대로
   창이 좁으면 문서 쪽 최소 폭(WK_ED_MIN)을 남기고 열 너비를 줄여 맞추고, 열 하나가 WK_COL_MIN 보다 좁아져야 하면 그때만 개수를 줄인다 */
const WK_ED_MIN=480,WK_COL_MIN=140,WK_COL_MAX=420,WK_N_MAX=8;
const wkColW=()=>Math.max(WK_COL_MIN,Math.min(WK_COL_MAX,ui.wkColW||210));
const wkColN=()=>Math.max(1,Math.min(WK_N_MAX,ui.wkColN||3));
function wkColsLayout(){
  const body=$(".wk-body"),W=body?body.clientWidth:0,cw=wkColW();
  if(!W||getComputedStyle(body).flexDirection==="column")return {n:wkColN(),w:cw,max:0};      // 좁은 창(위아래로 쌓임)은 CSS 가 폭을 정한다
  const max=Math.max(WK_COL_MIN,W-WK_ED_MIN-8);let n=wkColN(),w=Math.min(cw,Math.floor(max/n));
  while(n>1&&w<WK_COL_MIN){n--;w=Math.min(cw,Math.floor(max/n))}
  return {n,w:Math.max(WK_COL_MIN,w),max};
}
// cap = 단계 수: 보일 칸 수가 단계 수보다 많아도 빈 칸은 만들지 않는다
function wkColsSize(el,fixedN,cap){const f=wkColsLayout(),n=fixedN||Math.max(1,Math.min(f.n,cap||f.n)),w=fixedN?Math.floor(f.n*f.w/n):f.w;el.dataset.n=n;el.dataset.w=w;el.style.setProperty("--wk-cols",n);el.style.setProperty("--wk-cw",w+"px");el.style.width=n*w+"px";return n}
function wkColGrips(el){      // 열 너비 손잡이: 열과 열 사이 경계에만 (첫 열 왼쪽 · 맨 끝 오른쪽 = 열 보기 넓이 손잡이와 겹치지 않게)
  el.querySelectorAll(".wk-cgrip").forEach(g=>g.remove());if(el.querySelector(".wk-hits"))return;
  const k=el.querySelectorAll(".wk-col").length,w=+el.dataset.w||wkColW();
  el.insertAdjacentHTML("beforeend",Array.from({length:Math.max(0,k-1)},(_,i)=>`<div class="wk-cgrip" data-cg="${i+1}" style="left:${(i+1)*w-4}px" title="끌어서 열 너비 조절 (두 번 누르면 기본 너비)" aria-hidden="true"></div>`).join(""));
}
function wkWireColGrip(el){
  el.addEventListener("dblclick",e=>{if(!e.target.closest(".wk-cgrip"))return;delete ui.wkColW;saveUI();wkDrawColsSoft()});
  el.addEventListener("pointerdown",e=>{const g=e.target.closest(".wk-cgrip");if(!g||e.button!==0)return;e.preventDefault();e.stopPropagation();
    g.setPointerCapture(e.pointerId);g.classList.add("drag");document.body.classList.add("wk-resizing");
    const x0=e.clientX,w0=+el.dataset.w||wkColW(),i=+g.dataset.cg,n=+el.dataset.n||1,max=wkColsLayout().max||1e5;let moved=false;
    g.onpointermove=ev=>{if(Math.abs(ev.clientX-x0)<2&&!moved)return;moved=true;const w=Math.max(WK_COL_MIN,Math.min(WK_COL_MAX,Math.floor(max/n),Math.round(w0+(ev.clientX-x0)/i)));ui.wkColW=w;el.dataset.w=w;      // 다시 그리지 않고 폭만 바꾼다 (손잡이를 잡은 채로)
      el.style.setProperty("--wk-cw",w+"px");el.style.width=n*w+"px";el.querySelectorAll(".wk-cgrip").forEach(x=>x.style.left=(+x.dataset.cg*w-4)+"px")};
    g.onpointerup=g.onpointercancel=()=>{g.onpointermove=g.onpointerup=g.onpointercancel=null;g.classList.remove("drag");document.body.classList.remove("wk-resizing");if(moved){saveUI();wkDrawColsSoft()}}});      // 그냥 누른 것은 다시 그리지 않는다 (두 번 누르기가 먹게)
  el.addEventListener("mousedown",e=>{if(e.target.closest(".wk-cgrip"))e.preventDefault()});
}
let wkRO=null,wkROn=0;
function wkWatchSize(){      // 창 크기 · 왼쪽 메뉴 접기/펴기로 폭이 바뀌면 열을 다시 맞춘다
  if(wkRO)wkRO.disconnect();const b=$(".wk-body");if(!b||typeof ResizeObserver==="undefined")return;
  wkRO=new ResizeObserver(()=>{const w=b.clientWidth;if(!b.isConnected){wkRO.disconnect();return}if(w===wkROn)return;wkROn=w;requestAnimationFrame(()=>{if($("#wkCols"))wkDrawColsSoft()})});wkRO.observe(b);
}
function wkWireSplit(){      // 열 보기 넓이: 끌면 열 개수가 한 칸씩 (두 번 누르면 기본 3칸)
  const s=$("#wkSplit"),cols=$("#wkCols");s.title="끌어서 열 보기 넓이 = 열 개수 조절 (두 번 누르면 기본 3칸) · 열 너비는 열과 열 사이 경계를 끌어요";
  s.innerHTML='<span class="wk-sgrip"></span>';
  s.ondblclick=()=>{delete ui.wkColN;saveUI();cols.dataset.path="";wkDrawColsSoft()};
  s.onmousedown=e=>e.preventDefault();      // 끄는 동안 화면 글자가 선택되지 않게
  s.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();s.setPointerCapture(e.pointerId);s.classList.add("drag");document.body.classList.add("wk-resizing");
    const x0=e.clientX,w0=cols.offsetWidth,cw=+cols.dataset.w||wkColW();s.dataset.n=wkColN();
    s.onpointermove=ev=>{const n=Math.max(1,Math.min(WK_N_MAX,Math.round((w0+ev.clientX-x0)/cw)));if(n!==wkColN()){ui.wkColN=n;wkDrawColsSoft();s.dataset.n=n}};      // 열 너비 단위로 딱 맞춰 늘고 준다
    s.onpointerup=s.onpointercancel=()=>{s.onpointermove=s.onpointerup=s.onpointercancel=null;s.classList.remove("drag");document.body.classList.remove("wk-resizing");saveUI();cols.dataset.path="";wkDrawColsSoft()}};
}
function wkOpen(id){wkFlush();const tr=wkTrail(id);if(!tr.length)return;wkPath=tr.map(w=>w.id);wkDrawCols();wkDrawEd()}

/* ---------- 편집기 ---------- */
const WK_TB=()=>`<div class="wk-tb" id="wkTb" role="toolbar" aria-label="서식">
  <select id="wkBlk" aria-label="문단 모양" title="문단 모양 (Ctrl+Alt+1 · 2 · 3 = 제목, Ctrl+Alt+0 = 본문 · 줄 처음 # ## ### 로도)"><option value="p">본문</option><option value="h2">제목 1</option><option value="h3">제목 2</option><option value="h4">제목 3</option></select>
  <span class="g"><button type="button" data-wc="bold" title="굵게 (Ctrl+B)" aria-label="굵게"><b>B</b></button><button type="button" data-wc="italic" title="기울임 (Ctrl+I)" aria-label="기울임"><i>I</i></button><button type="button" data-wc="underline" title="밑줄 (Ctrl+U)" aria-label="밑줄"><u>U</u></button><button type="button" data-wc="strikeThrough" title="취소선" aria-label="취소선"><s>S</s></button></span>
  <span class="g"><span class="wk-dd"><button type="button" data-wdd="hl" title="형광펜 (Ctrl+Shift+H = 마지막에 쓴 색)" aria-label="형광펜">${IC('<path d="M14 4l6 6-8 8H6v-6z"/><path d="M4 21h8"/>')}<span class="wk-sw" id="wkHlNow" style="background:var(--${ui.wkHl||"hl-y"})"></span></button><span class="wk-ddm" id="wkDd-hl">${WK_HL.map(([c,n])=>`<button type="button" data-whl="${c}" title="형광펜 ${n}" aria-label="형광펜 ${n}"><span class="wk-sw" style="background:var(--${c})"></span></button>`).join("")}<button type="button" class="x" data-whl="">지우기</button></span></span>
    <span class="wk-dd"><button type="button" data-wdd="fc" title="글자색" aria-label="글자색"><span class="wk-fca" style="color:var(--fc-red)">A</span></button><span class="wk-ddm" id="wkDd-fc">${WK_FC.map(([c,n])=>`<button type="button" data-wfc="${c}" title="글자색 ${n}" aria-label="글자색 ${n}"><span class="wk-fca" style="color:var(--${c})">A</span></button>`).join("")}<button type="button" class="x" data-wfc="">기본색</button></span></span>
    <span class="wk-dd"><button type="button" data-wdd="fs" title="글자 크기 (Ctrl+Shift+&gt; 크게 · Ctrl+Shift+&lt; 작게)" aria-label="글자 크기"><span class="wk-fsa">가<small>가</small></span></button><span class="wk-ddm v" id="wkDd-fs">${WK_FS.map(([c,n])=>`<button type="button" data-wfs="${c}" title="글자 크기 ${n}" aria-label="글자 크기 ${n}"><span class="${c||"fs-n"}">가나다</span><small>${n}</small></button>`).join("")}</span></span></span>
  <span class="g"><button type="button" data-wc="insertUnorderedList" title="글머리 목록" aria-label="글머리 목록">${IC('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>')}</button><button type="button" data-wc="insertOrderedList" title="번호 목록" aria-label="번호 목록">${IC('<path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 5l1.5-1V9M3.5 15.5a1.5 1.5 0 1 1 2.5 1L3.5 19H6.5"/>')}</button>
    <button type="button" data-wi="table" title="표 넣기 (격자에서 크기 고르기)" aria-label="표 넣기" aria-haspopup="true">${IC('<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/>')}</button><button type="button" data-wi="img" title="사진 넣기 (붙여넣기 · 끌어다 놓기로도)" aria-label="사진 넣기">${IC('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>')}</button><button type="button" data-wi="code" title="코드 상자 (줄 처음에 \`\`\` + Enter 로도)" aria-label="코드 상자">${IC('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 10l-2 2 2 2M15 10l2 2-2 2"/>')}</button><button type="button" data-wi="hr" title="구분선 (줄 처음에 --- + Enter 로도)" aria-label="구분선">${IC('<path d="M3 12h18"/><path d="M8 7h8M8 17h8" opacity=".35"/>')}</button></span>
  <span class="g"><button type="button" class="wk-lkb" data-wlink title="보관함 · 트러블슈팅 · 코드 이력 · 일감 · 다른 위키 문서 연결 ([[ 로도)">${IC('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>')}연결</button></span></div>
  <div class="wk-tbar" id="wkTbl" role="toolbar" aria-label="표 고치기" hidden><span class="lb">${WK_TBL_IC.table}표</span>${WK_TBL_OPS.map(o=>o?`<button type="button" data-wt="${o[0]}" class="${o[0].startsWith("rm")?"rm":""}" title="${o[2]}">${WK_TBL_IC[o[0]]}${o[1]}</button>`:`<span class="sepv"></span>`).join("")}<span class="sepv"></span><button type="button" data-wt="width" id="wkTblW" title="표 폭: 본문 폭에 꽉 채우기 ↔ 내용만큼">${IC('<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>')}<span>폭 맞춤</span></button><span class="hint">Tab = 다음 칸 · 칸에서 우클릭해도 돼요</span></div>`;
/* 표 고치기 (2.36): 무엇을 하는지 글자로 적은 단추 + 칸 우클릭 메뉴. 단추에 마우스를 올리면 바뀔 행 · 열을 표에 미리 보여 준다 */
const WK_TBL_OPS=[["rowAbove","위에 행 추가","지금 칸의 위에 빈 행을 넣어요"],["row","아래에 행 추가","지금 칸의 아래에 빈 행을 넣어요"],["colLeft","왼쪽에 열 추가","지금 칸의 왼쪽에 빈 열을 넣어요"],["col","오른쪽에 열 추가","지금 칸의 오른쪽에 빈 열을 넣어요"],null,
  ["rmrow","이 행 지우기","지금 칸이 있는 가로줄을 지워요"],["rmcol","이 열 지우기","지금 칸이 있는 세로줄을 지워요"],["rmtable","표 지우기","표 전체를 지워요"]];
const WK_TBL_IC={table:IC('<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/>'),
  rowAbove:IC('<rect x="4" y="13" width="16" height="7" rx="1"/><path d="M12 3v7M8.5 6.5h7"/>'),row:IC('<rect x="4" y="4" width="16" height="7" rx="1"/><path d="M12 14v7M8.5 17.5h7"/>'),
  colLeft:IC('<rect x="13" y="4" width="7" height="16" rx="1"/><path d="M3 12h7M6.5 8.5v7"/>'),col:IC('<rect x="4" y="4" width="7" height="16" rx="1"/><path d="M14 12h7M17.5 8.5v7"/>'),
  rmrow:IC('<rect x="4" y="8" width="16" height="8" rx="1"/><path d="M9.5 10.5l5 3M14.5 10.5l-5 3"/>'),rmcol:IC('<rect x="8" y="4" width="8" height="16" rx="1"/><path d="M10.5 9.5l3 5M13.5 9.5l-3 5"/>'),
  rmtable:IC('<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M9 9l6 6M15 9l-6 6"/>')};
function wkDrawEd(){
  const el=$("#wkEd");if(!el)return;
  const w=wkCur();
  el.onclick=null;
  if(wkRead&&wkRead.id===(w?w.id:null)&&!(w&&wkShut(w)))return wkDrawRead(el,w);      // 몰아 보기 (다른 문서로 가면 저절로 끝난다)
  wkRead=null;const rb=$("#wkRead");if(rb){rb.classList.remove("on");rb.setAttribute("aria-pressed","false")}
  if(!w)return wkDrawHome(el);
  ui.wkCur=w.id;saveUI();
  if(wkShut(w))return wkDrawLock(el,w);
  const tr=wkTrail(w.id),kids=wkKids(w.id);
  el.innerHTML=`<div class="wk-hd"><div class="wk-path">${esc(tr.slice(0,-1).map(x=>x.title).join(" › ")||"최상위 주제")}</div>
      <input id="wkTitle" maxlength="200" value="${esc(w.title)}" aria-label="문서 제목 (= 왼쪽 행 이름)" title="문서 제목 = 왼쪽 행 이름">
      <div class="wk-meta"><span>${kids.length?`하위 문서 ${kids.length}개 · 그 아래까지 ${wkCount(w.id)}개`:"하위 문서 없음"} · ${esc((w.updated_at||"").replace("T"," ").slice(0,16))} 수정</span><span class="sp"></span><span id="wkSaved" class="wk-saved">저장됨</span></div></div>
    ${WK_TB()}
    <div class="wk-scroll" id="wkScroll"><div class="wk-page" id="wkPage"><div id="wkDoc" class="wk-doc" contenteditable="true" spellcheck="false" role="textbox" aria-multiline="true" aria-label="본문" data-ph="자유롭게 적어요. 글자를 고르면 서식 툴바가 떠요 · [[ 로 일감 · 보관함 · 트러블슈팅 · 코드 · 다른 문서 연결 · 사진은 붙여넣기"></div>
      <div class="wk-subs">${kids.length?`<div class="lb">이 문서 안의 하위 문서</div><div class="wk-subg">${kids.map(k=>`<button type="button" class="${wkBodyEmpty(k.body)?"empty":""}" data-wsub="${k.id}">${IC('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>')}${esc(k.title)}</button>`).join("")}</div>`:""}<button type="button" class="mini" data-wknew2="${w.id}">＋ 하위 문서 만들기</button></div></div></div>
    <div class="wk-ft" id="wkFt" role="toolbar" aria-label="고른 글자 서식"><button type="button" data-wc="bold" aria-label="굵게"><b>B</b></button><button type="button" data-wc="italic" aria-label="기울임"><i>I</i></button><button type="button" data-wc="underline" aria-label="밑줄"><u>U</u></button><span class="sepv"></span>${WK_HL.map(([c,n])=>`<button type="button" data-whl="${c}" title="형광펜 ${n}" aria-label="형광펜 ${n}"><span class="wk-sw" style="background:var(--${c})"></span></button>`).join("")}<span class="sepv"></span>${WK_FC.map(([c,n])=>`<button type="button" data-wfc="${c}" title="글자색 ${n}" aria-label="글자색 ${n}"><span class="wk-fca" style="color:var(--${c})">A</span></button>`).join("")}<span class="sepv"></span>${WK_FS.map(([c,n])=>`<button type="button" class="wk-fsb" data-wfs="${c}" title="글자 크기 ${n}" aria-label="글자 크기 ${n}"><span class="${c||"fs-n"}">가</span></button>`).join("")}<span class="sepv"></span><button type="button" data-wlink title="연결" aria-label="연결">${IC('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>')}</button></div>`;
  const doc=$("#wkDoc");
  let box=wkDecorate(wkClean(w.body));while(box.childNodes.length===1&&box.firstChild.nodeName==="DIV")box=box.firstChild;      // 예전에 쌓인 <div> 겹은 벗긴다
  doc.replaceChildren(...box.childNodes);      // 거른 결과를 감싼 <div> 는 빼고 내용만 (2.36: 열 때마다 <div> 가 한 겹씩 늘던 것 고침)
  doc.dataset.wid=w.id;wkDirty=null;
  wkWireEd(w);
}
/* 몰아 보기 (2.37): 이 문서와 하위 문서 전부(주제 목록에서는 주제 전체)를 내보내기처럼 한 화면에 이어서 읽는다 — 읽기 전용.
   위에 목차(누르면 그 문서로 스크롤), 문서마다 번호 · 경로 · '고치기'(그 문서 편집기로). 연결 칩은 그대로 눌린다. 잠긴(안 연) 주제는 빠진다 */
let wkRead=null;
function wkDrawRead(el,w){
  const o={sub:true,empty:!!ui.wkReadEmpty},L=w?wkCollect(w,0,"",o,[]):wkCollectAll(o),rb=$("#wkRead");
  if(rb){rb.classList.add("on");rb.setAttribute("aria-pressed","true")}
  const pre=w?wkTrail(w.id).slice(0,-1).map(x=>x.title).join(" › "):"";
  el.innerHTML=`<div class="wk-rdbar"><b>${IC('<path d="M4 5h7a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4z"/><path d="M20 5h-7a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h7z"/>')}몰아 보기</b><span class="meta">${w?`‘${esc(w.title)}’ 부터`:"주제 전체"} · 문서 ${L.length}개${L.shut?` · 잠긴 주제 ${L.shut}개 빠짐`:""}</span>
      <label class="meta"><input type="checkbox" id="wkRdE" ${ui.wkReadEmpty?"checked":""}> 빈 문서도</label><span class="sp"></span><button type="button" id="wkRdX">편집으로 돌아가기</button></div>
    <div class="wk-scroll" id="wkRdS"><div class="wk-page wk-rd">${L.length>1?`<nav class="wk-rdtoc" aria-label="목차">${L.map(({w:x,depth,num},i)=>`<a href="#" data-rdi="${i}" style="padding-left:${Math.min(depth,6)*14}px">${num?`<span class="no">${esc(num)}</span>`:""}${esc(x.title)}</a>`).join("")}</nav>`:""}
      ${L.map(({w:x,depth,num},i)=>`<section class="wk-rds" id="wkRd${i}" data-d="${Math.min(depth,3)}"><div class="wk-rdh"><div class="t">${num?`<span class="no">${esc(num)}</span>`:""}${esc(x.title)}</div><button type="button" class="mini" data-rdedit="${x.id}" title="이 문서를 편집기로 열어요">고치기</button></div>
        ${depth||pre?`<div class="wk-rdp">${esc(wkTrail(x.id).slice(0,-1).map(y=>y.title).join(" › "))}</div>`:""}<div class="wk-doc wk-rdb" data-rdb="${x.id}"></div></section>`).join("")||`<div class="wk-none">보여 줄 문서가 없어요</div>`}</div></div>`;
  L.forEach(({w:x})=>{const b=el.querySelector(`[data-rdb="${x.id}"]`);if(!b)return;if(wkBodyEmpty(x.body)){b.innerHTML=`<p class="meta">(비어 있음)</p>`;return}
    let box=wkDecorate(wkClean(x.body));while(box.childNodes.length===1&&box.firstChild.nodeName==="DIV")box=box.firstChild;b.replaceChildren(...box.childNodes)});
  $("#wkRdX").onclick=()=>{wkRead=null;wkDrawEd()};
  $("#wkRdE").onchange=e=>{ui.wkReadEmpty=e.target.checked;saveUI();wkDrawEd()};
  el.onclick=e=>{const a=e.target.closest("a.lk");if(a){e.preventDefault();wkFollow(a);return}
    const t=e.target.closest("[data-rdi]");if(t){e.preventDefault();$("#wkRd"+t.dataset.rdi).scrollIntoView({block:"start",behavior:"smooth"});return}
    const ed=e.target.closest("[data-rdedit]");if(ed){wkRead=null;wkOpen(+ed.dataset.rdedit)}};
}
/* 주제 목록 (맨 위 단계): 주제마다 하위 문서 수 · 고친 날 · 잠금 */
function wkDrawHome(el){
  ui.wkCur=null;saveUI();
  const roots=wkKids(null),fmtD=s=>esc((s||"").slice(0,10));
  el.innerHTML=`<div class="wk-scroll"><div class="wk-page wk-homepg"><h2>주제 목록</h2><p class="meta">주제 ${roots.length}개 · 문서 ${wikis.length}개${wikis.some(wkShut)?" · 잠긴 주제 안의 문서는 세지 않아요":""}</p>
    <div class="wk-tl">${roots.map(w=>{const shut=wkShut(w),n=shut?(w.hidden||[]).length:wkCount(w.id);
      return `<button type="button" class="wk-ti${shut?" shut":""}" data-wsub="${w.id}">${shut?WK_LOCK_IC:NAVICON.wiki}<span class="nm">${esc(w.title)}</span><span class="meta">${shut?"잠김 · ":w.locked?"잠금 열림 · ":""}${n?`하위 ${n}개`:"하위 없음"}${shut?"":" · "+fmtD(w.updated_at)+" 수정"}</span></button>`}).join("")||`<div class="wk-none"><b>아직 주제가 없어요</b>예) 법인콘도 › 경기도청 › 성수기 신청</div>`}</div>
    <button type="button" class="primary" data-wknew2="">＋ 새 주제</button></div></div>`;
  el.onclick=e=>{const b=e.target.closest("button");if(!b)return;if(b.dataset.wsub)wkOpen(+b.dataset.wsub);else if("wknew2" in b.dataset)wkCreate(null)};
}
/* 잠긴 주제: 암호를 넣으면 이 창을 닫을 때까지 열린다 */
function wkDrawLock(el,w){
  el.innerHTML=`<div class="wk-scroll"><div class="wk-page wk-lockpg"><div class="wk-lockic">${WK_LOCK_IC}</div><h2>${esc(w.title)}</h2>
    <p>잠긴 주제예요${(w.hidden||[]).length?` (하위 문서 ${w.hidden.length}개)`:""}. 암호를 넣으면 이 창을 닫을 때까지 열려 있어요.</p>
    <form id="wkPwF" autocomplete="off"><input type="password" id="wkPw" placeholder="암호" aria-label="암호" autocomplete="off"><button type="submit" class="primary">열기</button></form><p class="wk-pwmsg" id="wkPwMsg" role="alert"></p></div></div>`;
  $("#wkPwF").onsubmit=async e=>{e.preventDefault();const pw=$("#wkPw").value;if(!pw){$("#wkPw").focus();return}
    try{const r=await wkPost("/api/wiki/unlock",{id:w.id,password:pw});wkKeys.set(w.id,r.key);await wkLoad(true);wkDrawCols();wkDrawEd()}
    catch(err){$("#wkPwMsg").textContent=err.message;$("#wkPw").select()}};
  setTimeout(()=>{const i=$("#wkPw");if(i&&document.activeElement?.id!=="wkQ")i.focus({preventScroll:true})},0);
}
function wkMark(){const s=$("#wkSaved");if(s){s.textContent="저장 중…";s.classList.add("ing")}}
function wkQueue(){
  const w=wkCur(),doc=$("#wkDoc");if(!w||!doc||+doc.dataset.wid!==w.id)return;
  wkDirty={id:w.id,title:($("#wkTitle").value||"").trim()||w.title,body:wkSerialize(doc)};wkMark();
  clearTimeout(wkSaveT);wkSaveT=setTimeout(wkFlush,700);
}
async function wkFlush(){
  clearTimeout(wkSaveT);const d=wkDirty;if(!d)return;wkDirty=null;
  try{const r=await wkPost("/api/wiki",d);const i=wikis.findIndex(x=>x.id===r.id);if(i>=0)wikis[i]={...wikis[i],...r};
    if(!wkDirty){const s=$("#wkSaved");if(s){s.textContent="저장됨";s.classList.remove("ing")}}
    if(view==="wiki")wkDrawColsSoft()}
  catch(e){wkDirty=wkDirty||d;const s=$("#wkSaved");if(s){s.textContent="저장 못 함";s.classList.add("err")}toast("업무 위키를 저장하지 못했어요: "+e.message,5000)}
}
function wkDrawColsSoft(){const el=$("#wkCols");if(!el)return;const y=[...el.querySelectorAll(".wk-col")].map(c=>c.scrollTop);wkDrawCols();el.querySelectorAll(".wk-col").forEach((c,i)=>c.scrollTop=y[i]||0)}
addEventListener("pagehide",()=>{if(wkDirty)try{navigator.sendBeacon("/api/wiki",new Blob([JSON.stringify({...wkDirty,_keys:[...wkKeys.values()]})],{type:"application/json"}))}catch(_){}});

function wkKeep(){const s=getSelection(),d=$("#wkDoc");if(d&&s.rangeCount&&d.contains(s.anchorNode))wkSavedRange=s.getRangeAt(0).cloneRange()}
function wkRestore(){      // 툴바 · 고르기 창으로 포커스가 나갔을 때만 마지막 선택을 되살린다 (편집기 안에 선택이 있으면 그대로)
  const s=getSelection(),d=$("#wkDoc");if(d&&s.rangeCount&&d.contains(s.anchorNode)&&document.activeElement===d)return;
  if(!wkSavedRange||!d||!d.contains(wkSavedRange.startContainer))return;s.removeAllRanges();s.addRange(wkSavedRange)}
const WK_WRAP_SEL={mark:"mark",fc:"span[class^=fc-]",fs:"span[class^=fs-]"};
function wkWrap(kind,cls){      // 형광펜(mark) · 글자색(fc) · 글자 크기(fs): 고른 글자를 이름(class)으로 감싼다. cls 가 비면 지우기(기본으로)
  wkRestore();const s=getSelection(),doc=$("#wkDoc");if(!s.rangeCount||s.isCollapsed||!doc.contains(s.anchorNode)){toast("먼저 글자를 골라요",1800);return}
  const sel=WK_WRAP_SEL[kind],r=s.getRangeAt(0),box=r.commonAncestorContainer.nodeType===1?r.commonAncestorContainer:r.commonAncestorContainer.parentElement;
  if(r.cloneContents().querySelector("p,div,h2,h3,h4,li,ul,ol,table,tr,td,th,pre,blockquote")){wkWrapMulti(r,sel,kind,cls);return}      // 여러 문단에 걸치면 글자 조각마다
  const anc=box.closest(sel),frag=r.extractContents();       // 고른 부분을 꺼낸다 (가운데가 빠진 바깥 서식은 아래에서 둘로 쪼갠다)
  frag.querySelectorAll(sel).forEach(n=>n.replaceWith(...n.childNodes));
  let at=r;
  if(anc&&doc.contains(anc)){      // 같은 종류 서식 안의 일부만 바꾸면: 앞 · 뒤는 원래 서식 그대로 두고 가운데만 바꾼다 (전부 벗기지 않게)
    const tail=document.createRange();tail.setStart(r.startContainer,r.startOffset);tail.setEnd(anc,anc.childNodes.length);
    const anc2=anc.cloneNode(false);anc2.appendChild(tail.extractContents());anc.after(anc2);
    at=document.createRange();at.setStartAfter(anc);at.collapse(true);
    [anc,anc2].forEach(n=>{if(!n.textContent&&!n.querySelector("img,br"))n.remove()});
  }
  let el;
  if(cls){el=document.createElement(kind==="mark"?"mark":"span");el.className=cls;el.appendChild(frag)}
  else{el=document.createElement("span");el.appendChild(frag)}      // 지우기: 잠깐 감싸서 넣은 뒤 벗긴다 (선택을 되살리려고)
  at.insertNode(el);
  const nr=document.createRange();
  if(cls)nr.selectNodeContents(el);
  else{const a=el.firstChild,b=el.lastChild;el.replaceWith(...el.childNodes);if(a){nr.setStartBefore(a);nr.setEndAfter(b)}}
  s.removeAllRanges();s.addRange(nr);
  doc.querySelectorAll("mark:empty,span:empty").forEach(n=>n.remove());
  wkQueue();wkSync();
}
function wkWrapMulti(r,sel,kind,cls){      // 문단을 넘는 선택: 걸친 서식은 벗기고, 글자 조각(text)마다 따로 감싼다 (문단이 span 안에 들어가지 않게)
  const doc=$("#wkDoc"),root=r.commonAncestorContainer.nodeType===1?r.commonAncestorContainer:r.commonAncestorContainer.parentElement;
  [...(root.closest(sel)?[root.closest(sel)]:[]),...root.querySelectorAll(sel)].filter(n=>r.intersectsNode(n)&&doc.contains(n)).forEach(n=>n.replaceWith(...n.childNodes));
  const ts=[],tw=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);while(tw.nextNode()){const t=tw.currentNode;if(r.intersectsNode(t)&&!t.parentElement.closest("pre,a.lk"))ts.push(t)}
  let first=null,last=null;
  ts.forEach(t=>{
    let a=t===r.startContainer?r.startOffset:0,b=t===r.endContainer?r.endOffset:t.data.length;if(b<=a)return;
    if(b<t.data.length)t.splitText(b);if(a>0)t=t.splitText(a);
    if(!t.data.trim()&&!cls)return;
    if(cls){const el=document.createElement(kind==="mark"?"mark":"span");el.className=cls;t.replaceWith(el);el.appendChild(t);t=el}
    first=first||t;last=t});
  const s=getSelection(),nr=document.createRange();if(first){nr.setStartBefore(first);nr.setEndAfter(last);s.removeAllRanges();s.addRange(nr)}
  doc.normalize();wkQueue();wkSync();
}
const wkFsOf=()=>{const s=getSelection();if(!s.rangeCount)return "";const n=s.anchorNode&&(s.anchorNode.nodeType===1?s.anchorNode:s.anchorNode.parentElement),f=n&&n.closest("span[class^=fs-]");return f&&$("#wkDoc").contains(f)?f.className:""};
function wkSize(c){wkWrap("fs",c);document.querySelectorAll("#wkDd-fs.on").forEach(m=>m.classList.remove("on"))}
function wkSizeStep(d){      // Ctrl+Shift+> / < : 한 단계씩 크게 · 작게
  const order=WK_FS.map(x=>x[0]),i=order.indexOf(wkFsOf());wkSize(order[Math.max(0,Math.min(order.length-1,i+d))])}
function wkSetHl(c){if(c){ui.wkHl=c;saveUI();const n=$("#wkHlNow");if(n)n.style.background=`var(--${c})`}wkWrap("mark",c)}
/* 사진 넣기: 긴 쪽 1920px 넘으면 줄여서(webp) DB 에 올리고, 그 이름으로 <img> 를 넣는다 */
async function wkAddImgs(files){
  const w=wkCur();if(!w||!files.length)return;
  toast(`사진 ${files.length}장을 넣는 중…`,0);let ok=0;
  for(const f of files.slice(0,20)){
    try{const {blob}=typeof shrinkImg==="function"?await shrinkImg(f):{blob:f};
      const r=await fetch("/api/wiki/img",{method:"POST",headers:{"Content-Type":blob.type||f.type,...wkHdr()},body:blob}),j=await r.json();if(!r.ok)throw new Error(j.error||r.status);
      if(wkCur()!==w)break;
      wkIns(`<img data-img="${esc(j.name)}" src="/api/wiki/img/${esc(j.name)}" class="wk-img" alt="">`);ok++}
    catch(e){toast("사진을 넣지 못했어요: "+e.message,5000);return}}
  toast(`사진 ${ok}장을 넣었어요`,1800);
}
function wkIns(h){wkRestore();$("#wkDoc").focus();document.execCommand("insertHTML",false,h);wkQueue()}
function wkCell(){const s=getSelection();if(!s.rangeCount)return null;const n=s.anchorNode&&(s.anchorNode.nodeType===1?s.anchorNode:s.anchorNode.parentElement);const c=n&&n.closest("td,th");return c&&$("#wkDoc").contains(c)?c:null}
function wkCaretIn(el){const r=document.createRange();r.selectNodeContents(el);r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r)}
function wkTable(op,cell){
  cell=cell||wkCell();if(!cell)return;const table=cell.closest("table"),row=cell.parentElement,idx=[...row.children].indexOf(cell);
  wkTblPreview(null);
  if(op==="width"){table.classList.toggle("tw-full");wkQueue();wkSync();return}
  if(op==="rmtable"){let p=table.nextElementSibling;if(p&&p.tagName==="P"&&!p.textContent.trim()&&!p.querySelector("img,a.lk"))table.remove();else{p=document.createElement("p");p.innerHTML="<br>";table.replaceWith(p)}
    wkCaretIn(p);wkQueue();wkSync();return}
  if([...table.querySelectorAll("td,th")].some(c=>c.colSpan>1||c.rowSpan>1)){toast("합친 칸이 있는 표는 행 · 열을 바꿀 수 없어요 (표 지우기만 돼요)",3500);return}
  const blank=tag=>{const c=document.createElement(tag);c.innerHTML="<br>";return c};
  let go=null;      // 바꾼 뒤 글쇠를 둘 칸
  if(op==="row"||op==="rowAbove"){const r=document.createElement("tr");[...row.children].forEach(()=>r.appendChild(blank("td")));
    if(op==="row")row.after(r);else row.before(r);go=r.children[idx]}
  if(op==="col"||op==="colLeft")table.querySelectorAll("tr").forEach(r=>{const ref=r.children[idx]||r.lastElementChild,c=blank(ref&&ref.tagName==="TH"?"th":"td");
    if(!ref)r.appendChild(c);else if(op==="col")ref.after(c);else ref.before(c);if(r===row)go=c});
  if(op==="rmrow"){const nx=row.nextElementSibling||row.previousElementSibling;row.remove();
    if(!table.querySelector("tr")){const p=document.createElement("p");p.innerHTML="<br>";table.replaceWith(p);go=p}else go=nx&&(nx.children[idx]||nx.lastElementChild)}
  if(op==="rmcol"){table.querySelectorAll("tr").forEach(r=>r.children[idx]&&r.children[idx].remove());table.querySelectorAll("tr").forEach(r=>{if(!r.children.length)r.remove()});
    if(!table.querySelector("td,th")){const p=document.createElement("p");p.innerHTML="<br>";table.replaceWith(p);go=p}else go=row.isConnected&&(row.children[idx]||row.children[idx-1])}
  if(go)wkCaretIn(go);
  wkQueue();wkSync();
}
function wkTblPreview(op,cell){      // 단추 위에 마우스: 바뀔 행 · 열을 표에 미리 표시
  document.querySelectorAll("#wkDoc .wk-tp").forEach(c=>c.classList.remove("wk-tp","del","t","b","l","r"));
  cell=op&&(cell||wkCell());if(!cell)return;const table=cell.closest("table"),row=cell.parentElement,idx=[...row.children].indexOf(cell);
  const mark=(cs,...k)=>cs.forEach(c=>c&&c.classList.add("wk-tp",...k)),colCells=[...table.querySelectorAll("tr")].map(r=>r.children[idx]);
  ({rowAbove:()=>mark([...row.children],"t"),row:()=>mark([...row.children],"b"),colLeft:()=>mark(colCells,"l"),col:()=>mark(colCells,"r"),
    rmrow:()=>mark([...row.children],"del"),rmcol:()=>mark(colCells,"del"),rmtable:()=>mark([...table.querySelectorAll("td,th")],"del")})[op]?.();
}
function wkTblMenu(cell,e){      // 표 칸 우클릭 메뉴
  document.querySelectorAll(".popmenu").forEach(m=>m.remove());
  const m=document.createElement("div");m.className="popmenu wk-menu wk-tmenu";m.setAttribute("role","menu");
  m.innerHTML=WK_TBL_OPS.map(o=>o?`<button type="button" role="menuitem" data-wt="${o[0]}" class="${o[0].startsWith("rm")?"rm":""}">${WK_TBL_IC[o[0]]}${o[1]}</button>`:"<hr>").join("");
  document.body.appendChild(m);
  m.style.left=Math.max(8,Math.min(innerWidth-m.offsetWidth-8,e.clientX))+"px";m.style.top=Math.max(8,Math.min(innerHeight-m.offsetHeight-8,e.clientY))+"px";
  const close=()=>{m.remove();wkTblPreview(null);document.removeEventListener("mousedown",off,true)},off=ev=>{if(!m.contains(ev.target))close()};
  m.onmousedown=ev=>ev.preventDefault();
  m.onmouseover=ev=>{const b=ev.target.closest("[data-wt]");wkTblPreview(b&&b.dataset.wt,cell)};
  m.onmouseleave=()=>wkTblPreview(null);
  m.onclick=ev=>{const b=ev.target.closest("[data-wt]");if(!b)return;close();wkTable(b.dataset.wt,cell)};
  m.onkeydown=ev=>{const bs=[...m.querySelectorAll("button")],j=bs.indexOf(document.activeElement);
    if(ev.key==="ArrowDown"){ev.preventDefault();bs[(j+1)%bs.length].focus()}else if(ev.key==="ArrowUp"){ev.preventDefault();bs[(j-1+bs.length)%bs.length].focus()}else if(ev.key==="Escape"){close();$("#wkDoc").focus()}};
  setTimeout(()=>document.addEventListener("mousedown",off,true),0);
}

/* 목록 (2.36): Tab = 한 단계 안으로(바로 위 항목의 하위 목록), Shift+Tab = 한 단계 밖으로. 아웃라이너처럼 ul/ol 을 li 안에 넣는다 */
function wkSelLis(){
  const s=getSelection(),doc=$("#wkDoc");if(!s.rangeCount)return [];const r=s.getRangeAt(0);
  const liOf=n=>{const e=n&&(n.nodeType===1?n:n.parentElement);const li=e&&e.closest("li");return li&&doc.contains(li)?li:null};
  const a=liOf(r.startContainer);if(!a)return [];let b=liOf(r.endContainer)||a;
  while(b&&b.parentElement!==a.parentElement)b=b.parentElement.closest("li");      // 끝 항목을 시작 항목과 같은 단계로 올린다
  if(!b||b.compareDocumentPosition(a)&Node.DOCUMENT_POSITION_FOLLOWING)b=a;
  const out=[];for(let x=a;x;x=x.nextElementSibling){if(x.tagName==="LI")out.push(x);if(x===b)break}return out;
}
function wkKeepSel(fn){const s=getSelection(),r=s.rangeCount?s.getRangeAt(0):null,b=r&&[r.startContainer,r.startOffset,r.endContainer,r.endOffset];
  fn();if(b)try{const nr=document.createRange();nr.setStart(b[0],b[1]);nr.setEnd(b[2],b[3]);s.removeAllRanges();s.addRange(nr)}catch(_){}}
function wkIndent(lis){
  const prev=lis[0]&&lis[0].previousElementSibling;if(!prev||prev.tagName!=="LI")return false;      // 맨 첫 항목은 들어갈 곳이 없다
  wkKeepSel(()=>{let sub=prev.lastElementChild;if(!sub||!/^(UL|OL)$/.test(sub.tagName)){sub=document.createElement(lis[0].parentElement.tagName.toLowerCase());prev.appendChild(sub)}
    lis.forEach(li=>sub.appendChild(li))});
  return true;
}
function wkOutdent(lis){
  const list=lis[0].parentElement,pli=list.parentElement&&list.parentElement.closest("li");
  if(!pli||!$("#wkDoc").contains(pli)){document.execCommand("outdent");return true}      // 맨 바깥 단계: 목록에서 빼서 문단으로 (브라우저 기본)
  wkKeepSel(()=>{const last=lis[lis.length-1],after=[];for(let x=last.nextElementSibling;x;x=x.nextElementSibling)after.push(x);
    if(after.length){let sub=[...last.children].reverse().find(x=>/^(UL|OL)$/.test(x.tagName));if(!sub){sub=list.cloneNode(false);last.appendChild(sub)}after.forEach(x=>sub.appendChild(x))}      // 뒤따르던 항목은 밖으로 나온 항목의 하위로 (순서 유지)
    let at=pli;lis.forEach(li=>{at.after(li);at=li});
    if(!list.children.length)list.remove()});
  return true;
}
/* 줄 처음 마크다운 (2.36): '- ' '* ' → 글머리 목록, '1. ' → 번호 목록, '# ' '## ' '### ' → 제목 1 · 2 · 3 */
const WK_MD_LEAD=[[/^[-*]$/,"ul"],[/^\d{1,3}\.$/,"ol"],[/^#$/,"h2"],[/^##$/,"h3"],[/^###$/,"h4"],[/^>$/,"blockquote"]];
let wkLastAuto=null;      // 방금 자동으로 바꾼 줄 (바로 Backspace 면 글자로 되돌린다)
function wkMdLead(doc){
  const s=getSelection();if(!s.rangeCount||!s.isCollapsed)return false;
  const blkOf=()=>{const n=s.anchorNode,e=n&&(n.nodeType===1?n:n.parentElement);if(!e||e.closest("pre,li,td,th,a.lk,blockquote"))return null;const b=e.closest("p,div,h2,h3,h4");return b&&doc.contains(b)&&b!==doc?b:doc};
  let blk=blkOf();if(!blk)return false;
  const lead=()=>{const r=document.createRange();r.setStart(blk,0);r.setEnd(s.anchorNode,s.anchorOffset);return r};
  if(blk===doc){      // 문단 밖 맨 글자(빈 편집기에 바로 친 글): 이 줄(앞의 <br> · 문단 뒤부터 다음 <br> 까지)을 문단으로 감싼다
    let top=s.anchorNode;while(top&&top.parentNode!==doc)top=top.parentNode;if(!top)return false;
    const stop=x=>x.nodeType===1&&(x.tagName==="BR"||getComputedStyle(x).display!=="inline");
    let p=top.previousSibling;while(p&&!stop(p))p=p.previousSibling;
    const r=document.createRange();if(p)r.setStartAfter(p);else r.setStart(doc,0);r.setEnd(s.anchorNode,s.anchorOffset);
    if(!WK_MD_LEAD.some(([re])=>re.test(r.toString())))return false;
    const off=[s.anchorNode,s.anchorOffset],np=document.createElement("p");let x=p?p.nextSibling:doc.firstChild;doc.insertBefore(np,x);
    while(x&&!stop(x)){const nx=x.nextSibling;np.appendChild(x);x=nx}if(x&&x.tagName==="BR")x.remove();
    const c=document.createRange();c.setStart(off[0],off[1]);s.removeAllRanges();s.addRange(c);blk=np;
  }
  const r=lead(),t=r.toString(),hit=WK_MD_LEAD.find(([re])=>re.test(t));if(!hit)return false;
  const to=hit[1];if((to==="ul"||to==="ol")&&/^H[2-4]$/.test(blk.tagName))return false;      // 제목 줄에서는 목록으로 안 바꾼다
  r.deleteContents();      // 앞의 '- ' 같은 표시는 지운다
  const inner=document.createElement(to==="ul"||to==="ol"?"li":to==="blockquote"?"p":to);while(blk.firstChild)inner.appendChild(blk.firstChild);
  if(!inner.textContent&&!inner.querySelector("img,br"))inner.innerHTML="<br>";
  let out=inner;if(inner.tagName==="LI"||to==="blockquote"){out=document.createElement(to);out.appendChild(inner)}      // 새 목록 · 인용 (<p> 안에 목록이 들어가지 않게 문단을 통째로 바꾼다)
  blk.replaceWith(out);wkCaretIn(inner);wkLastAuto={out,inner,text:t+"\u00a0"};
  wkQueue();wkSync();return true;
}
function wkAtStart(el){const s=getSelection();if(!s.rangeCount)return false;const r=document.createRange();r.setStart(el,0);try{r.setEnd(s.anchorNode,s.anchorOffset)}catch(_){return false}return !r.toString()&&el.contains(s.anchorNode)}
function wkUnAuto(a){      // 자동 변환 되돌리기: 그 줄을 다시 '- 글자' 같은 문단으로 (목록 · 인용은 한 줄짜리일 때만)
  if(a.out!==a.inner&&a.out.children.length!==1)return false;
  const p=document.createElement("p"),tx=document.createTextNode(a.text);p.appendChild(tx);while(a.inner.firstChild)p.appendChild(a.inner.firstChild);
  if(p.lastChild&&p.lastChild.nodeName==="BR"&&p.childNodes.length>2)p.lastChild.remove();
  a.out.replaceWith(p);const r=document.createRange();r.setStart(tx,tx.length);const s=getSelection();s.removeAllRanges();s.addRange(r);wkQueue();wkSync();return true;
}
function wkCellMove(cell,d){
  const table=cell.closest("table"),cs=[...table.querySelectorAll("td,th")],i=cs.indexOf(cell);let to=cs[i+d];
  if(!to&&d>0){wkTable("row",cell);const row=cell.parentElement.nextElementSibling;to=row&&row.firstElementChild}      // 마지막 칸에서 Tab = 새 행
  if(!to)return;const r=document.createRange();r.selectNodeContents(to);if(!to.textContent.trim())r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r);wkSync();
}
/* 표 넣기 (2.37): 한글 · 워드처럼 격자 위로 마우스를 옮겨 크기를 고르고 누르면 넣는다. 아래 행 · 열 고르기로 더 크게(최대 30×12).
   새 표는 본문 폭에 꽉 차고(class tw-full, 표 줄에서 바꿈) 빈 칸도 기본 크기가 있다 */
const WK_GRID={r:8,c:10},WK_TMAX={r:30,c:12};
function wkTableHtml(rows,cols,head){const td=t=>`<${t}><br></${t}>`,row=t=>`<tr>${Array.from({length:cols},()=>td(t)).join("")}</tr>`;
  return `<table class="tw-full"><tbody>${Array.from({length:rows},(_,i)=>row(head&&i===0?"th":"td")).join("")}</tbody></table><p><br></p>`}
function wkGridPick(btn){
  document.querySelectorAll(".wk-grid").forEach(x=>x.remove());wkKeep();
  const g=document.createElement("div");g.className="wk-grid";g.setAttribute("role","dialog");g.setAttribute("aria-label","표 크기 고르기");
  const opt=(n,v)=>Array.from({length:n},(_,i)=>`<option value="${i+1}" ${i+1===v?"selected":""}>${i+1}</option>`).join("");
  g.innerHTML=`<div class="wk-gl" id="wkGl">표 크기를 골라요</div><div class="wk-gg" id="wkGg" style="--gc:${WK_GRID.c}">${Array.from({length:WK_GRID.r*WK_GRID.c},(_,i)=>`<span data-gr="${Math.floor(i/WK_GRID.c)+1}" data-gc="${i%WK_GRID.c+1}"></span>`).join("")}</div>
    <div class="wk-gf"><label>행 <select id="wkGr">${opt(WK_TMAX.r,3)}</select></label><span>×</span><label>열 <select id="wkGc">${opt(WK_TMAX.c,3)}</select></label>
    <label class="hd"><input type="checkbox" id="wkGh" ${ui.wkTblHead===false?"":"checked"}> 첫 행 제목</label><button type="button" class="primary" id="wkGo">넣기</button></div>`;
  document.body.appendChild(g);
  const b=btn.getBoundingClientRect();g.style.left=Math.max(8,Math.min(innerWidth-g.offsetWidth-8,b.left))+"px";g.style.top=Math.min(innerHeight-g.offsetHeight-8,b.bottom+6)+"px";
  const show=(r,c)=>{g.querySelectorAll("#wkGg span").forEach(x=>x.classList.toggle("on",+x.dataset.gr<=r&&+x.dataset.gc<=c));$("#wkGl").textContent=`${r} × ${c} 표 (행 × 열)`;$("#wkGr").value=r;$("#wkGc").value=c};
  const put=(r,c)=>{const h=$("#wkGh").checked;ui.wkTblHead=h;saveUI();close();wkIns(wkTableHtml(r,c,h));const f=$("#wkDoc").querySelectorAll("table");const t=[...f].find(x=>x.contains(getSelection().anchorNode))||f[f.length-1];if(t&&t.querySelector("td,th"))wkCaretIn(t.querySelector("td,th"));wkSync()};
  const close=()=>{g.remove();document.removeEventListener("mousedown",off,true);document.removeEventListener("keydown",esc_,true)},off=e=>{if(!g.contains(e.target)&&e.target!==btn&&!btn.contains(e.target))close()},esc_=e=>{if(e.key==="Escape"){e.preventDefault();close();$("#wkDoc").focus()}};
  $("#wkGg").onmouseover=e=>{const c=e.target.closest("[data-gr]");if(c)show(+c.dataset.gr,+c.dataset.gc)};
  $("#wkGg").onclick=e=>{const c=e.target.closest("[data-gr]");if(c)put(+c.dataset.gr,+c.dataset.gc)};
  $("#wkGr").onchange=$("#wkGc").onchange=()=>show(+$("#wkGr").value,+$("#wkGc").value);
  $("#wkGo").onclick=()=>put(+$("#wkGr").value,+$("#wkGc").value);
  g.onmousedown=e=>{if(!e.target.closest("select,input"))e.preventDefault()};
  show(3,3);setTimeout(()=>{document.addEventListener("mousedown",off,true);document.addEventListener("keydown",esc_,true)},0);
}
function wkSync(){      // 툴바의 눌림 상태 · 문단 모양 · 표 단추
  const tb=$("#wkTb");if(!tb)return;
  ["bold","italic","underline","strikeThrough"].forEach(c=>tb.querySelectorAll(`[data-wc=${c}]`).forEach(b=>{const on=document.queryCommandState(c);b.classList.toggle("on",on);b.setAttribute("aria-pressed",on)}));
  const s=getSelection(),d=$("#wkDoc");
  if(d&&s.rangeCount&&d.contains(s.anchorNode)){const n=s.anchorNode.nodeType===1?s.anchorNode:s.anchorNode.parentElement,h=n.closest("h2,h3,h4");$("#wkBlk").value=h?h.tagName.toLowerCase():"p"}
  const tc=wkCell();$("#wkTbl").hidden=!tc;if(!tc)wkTblPreview(null);
  if(tc){const full=tc.closest("table").classList.contains("tw-full"),b=$("#wkTblW");b.classList.toggle("on",full);b.setAttribute("aria-pressed",full);b.querySelector("span").textContent=full?"폭: 꽉 채움":"폭: 내용만큼"}
  const fs=d&&s.rangeCount&&d.contains(s.anchorNode)?wkFsOf():null;      // 지금 글자 크기를 크기 단추에 표시
  if(fs!=null)document.querySelectorAll("#wkEd [data-wfs]").forEach(b=>{const on=b.dataset.wfs===fs;b.classList.toggle("on",on);b.setAttribute("aria-pressed",on)});
}
function wkWireEd(w){
  const doc=$("#wkDoc"),ed=$("#wkEd");
  $("#wkTitle").oninput=e=>{const t=e.target.value.trim();if(t){w.title=t;wkDrawColsSoft()}wkQueue()};
  $("#wkTitle").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();doc.focus()}else if(e.key==="Escape"){e.target.blur();$("#wkCols").focus()}};
  $("#wkTitle").onblur=e=>{if(!e.target.value.trim()){e.target.value=w.title;toast("제목은 비울 수 없어요",2000)}};
  doc.oninput=()=>{wkBrackets();wkQueue()};
  doc.onkeydown=e=>{
    if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==="h"){e.preventDefault();wkKeep();wkSetHl(ui.wkHl||"hl-y");return}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="s"){e.preventDefault();wkQueue();wkFlush();return}
    if((e.ctrlKey||e.metaKey)&&e.shiftKey&&(e.code==="Period"||e.code==="Comma")){e.preventDefault();wkKeep();wkSizeStep(e.code==="Period"?1:-1);return}      // Ctrl+Shift+> / <
    const s=getSelection(),n=s.anchorNode&&(s.anchorNode.nodeType===1?s.anchorNode:s.anchorNode.parentElement),pre=n&&n.closest("pre");
    if(pre&&doc.contains(pre)){
      if(e.key==="Tab"){e.preventDefault();document.execCommand("insertText",false,"  ");return}
      if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)||e.key==="Escape"){e.preventDefault();const p=document.createElement("p");p.innerHTML="<br>";pre.after(p);const r=document.createRange();r.setStart(p,0);s.removeAllRanges();s.addRange(r);wkQueue();return}
      if(e.key==="Enter"){e.preventDefault();document.execCommand("insertText",false,"\n");return}
    }
    const auto=wkLastAuto;if(!["Shift","Control","Alt","Meta"].includes(e.key))wkLastAuto=null;
    if(e.key==="Backspace"&&auto&&s.isCollapsed&&auto.out.isConnected&&wkAtStart(auto.inner)&&wkUnAuto(auto)){e.preventDefault();return}      // 자동 변환 바로 뒤 Backspace = 글자로 되돌리기
    if((e.ctrlKey||e.metaKey)&&e.altKey&&/^Digit[0-3]$/.test(e.code)){e.preventDefault();wkRestore();document.execCommand("formatBlock",false,["p","h2","h3","h4"][+e.code.slice(5)]);wkQueue();wkSync();return}      // Ctrl+Alt+1/2/3 = 제목 1~3, 0 = 본문
    const li=n&&n.closest("li"),cell=n&&n.closest("td,th");
    if(cell&&doc.contains(cell)&&!li&&e.key==="Tab"&&!e.ctrlKey&&!e.altKey&&!e.metaKey){e.preventDefault();wkCellMove(cell,e.shiftKey?-1:1);return}      // 표 안 Tab = 다음 칸 (마지막 칸이면 새 행)
    const bq=n&&n.closest("blockquote");
    if(bq&&doc.contains(bq)&&e.key==="Enter"&&!e.shiftKey&&!e.isComposing&&s.isCollapsed){const line=n.closest("p,div:not(#wkDoc)");      // 인용 안 빈 줄에서 Enter = 인용 끝내기
      if(line&&bq.contains(line)&&!line.textContent.trim()&&!line.querySelector("img,a.lk")){e.preventDefault();line.remove();const p=document.createElement("p");p.innerHTML="<br>";bq.after(p);if(!bq.textContent.trim()&&!bq.querySelector("img"))bq.remove();wkCaretIn(p);wkQueue();return}}
    if(li&&doc.contains(li)&&e.key==="Tab"&&!e.ctrlKey&&!e.altKey&&!e.metaKey){      // 목록 안 Tab: 다음 칸으로 나가지 않고 들여쓰기 / 내어쓰기
      e.preventDefault();const lis=wkSelLis();if(lis.length&&(e.shiftKey?wkOutdent(lis):wkIndent(lis))){wkQueue();wkSync()}return}
    if(li&&doc.contains(li)&&e.key==="Enter"&&!e.shiftKey&&!e.isComposing&&s.isCollapsed&&!li.textContent.trim()&&!li.querySelector("img,a.lk")&&li.parentElement.parentElement.closest("li")){
      e.preventDefault();wkOutdent([li]);wkQueue();wkSync();return}      // 하위 목록의 빈 항목에서 Enter = 한 단계 밖으로 (맨 바깥은 브라우저처럼 목록을 끝낸다)
    if(e.key===" "&&!e.isComposing&&e.keyCode!==229&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&wkMdLead(doc)){e.preventDefault();return}
    if(e.key==="Enter"&&!e.shiftKey&&n){       // 줄 처음에 ``` + Enter = 코드 상자
      let blk=n.closest("p,div:not(#wkDoc)");if(blk&&!doc.contains(blk))blk=null;if(!blk&&n!==doc)blk=n;      // 편집기 바깥의 div(종이)를 잡지 않게
      if(!blk&&s.anchorNode.nodeType===3&&/^(?:```|-{3,}|\*{3,}|_{3,})$/.test(s.anchorNode.data.trim())){document.execCommand("formatBlock",false,"p");const m=getSelection().anchorNode;blk=m&&(m.nodeType===1?m:m.parentElement).closest("p")}      // 문단 밖 맨 글자 줄(빈 편집기 첫 줄)
      if(blk&&doc.contains(blk)&&blk!==doc&&!blk.closest("li,td,th")&&/^(?:-{3,}|\*{3,}|_{3,})$/.test(blk.textContent.trim())){e.preventDefault();      // 줄 처음 --- + Enter = 구분선
        const hr=document.createElement("hr"),p=document.createElement("p");p.innerHTML="<br>";blk.replaceWith(hr);hr.after(p);wkCaretIn(p);wkQueue();return}
      if(blk&&doc.contains(blk)&&blk!==doc&&blk.textContent.trim()==="```"){e.preventDefault();const p=document.createElement("pre");p.innerHTML="<code>\n</code>";blk.replaceWith(p);const r=document.createRange();r.setStart(p.firstChild.firstChild,0);s.removeAllRanges();s.addRange(r);wkQueue()}
    }
  };
  doc.onpaste=e=>{       // 붙여넣기: 허용한 서식만 남긴다 (다른 사이트 · 워드의 글꼴 · 색 · 스크립트는 버림). 사진이면 사진으로
    e.preventDefault();const cd=e.clipboardData;if(!cd)return;
    const imgs=[...(cd.files||[])].filter(f=>/^image\//.test(f.type));if(imgs.length){wkKeep();wkAddImgs(imgs);return}
    const s=getSelection(),n=s.anchorNode&&(s.anchorNode.nodeType===1?s.anchorNode:s.anchorNode.parentElement);
    const h=cd.getData("text/html"),t=cd.getData("text/plain");
    if(h&&!(n&&n.closest("pre")))document.execCommand("insertHTML",false,wkDecorate(wkClean(h.replace(/<!--StartFragment-->|<!--EndFragment-->/g,""))).innerHTML);
    else document.execCommand("insertText",false,t);
    wkQueue();
  };
  doc.onclick=e=>{const a=e.target.closest("a.lk");if(a){e.preventDefault();wkFollow(a)}};
  doc.ondragover=e=>{if([...(e.dataTransfer?.items||[])].some(it=>it.kind==="file"&&/^image\//.test(it.type))||(e.dataTransfer?.types||[]).includes("text/x-wiki")){e.preventDefault();if(wkDrag)e.dataTransfer.dropEffect="copy"}};
  doc.ondrop=e=>{
    if((e.dataTransfer?.types||[]).includes("text/x-wiki")){e.preventDefault();const id=+e.dataTransfer.getData("text/x-wiki");wkDrag=null;wkDropShow(null);      // 열의 문서를 본문에 놓으면 연결 칩
      if(!wkById(id)||id===w.id)return;const r=document.caretRangeFromPoint?document.caretRangeFromPoint(e.clientX,e.clientY):null;doc.focus();if(r&&doc.contains(r.startContainer)){const s=getSelection();s.removeAllRanges();s.addRange(r)}
      document.execCommand("insertHTML",false,wkChip("wiki",id)+"\u00a0");wkQueue();return}const fs=[...(e.dataTransfer?.files||[])].filter(f=>/^image\//.test(f.type));if(!fs.length)return;e.preventDefault();
    const r=document.caretRangeFromPoint?document.caretRangeFromPoint(e.clientX,e.clientY):null;if(r){const s=getSelection();s.removeAllRanges();s.addRange(r)}wkKeep();wkAddImgs(fs)};
  doc.onkeyup=doc.onmouseup=wkSync;
  doc.onfocus=()=>{try{document.execCommand("defaultParagraphSeparator",false,"p")}catch(_){}};       // 새 줄은 <p> (댓글 편집기와 같다)
  doc.onblur=()=>{try{document.execCommand("defaultParagraphSeparator",false,"div")}catch(_){}};
  ed.querySelectorAll("#wkTb button,#wkFt button,#wkTbl button").forEach(b=>b.onmousedown=e=>e.preventDefault());
  $("#wkTbl").onmouseover=e=>{const b=e.target.closest("[data-wt]");wkTblPreview(b&&b.dataset.wt)};
  $("#wkTbl").onmouseleave=()=>wkTblPreview(null);
  doc.oncontextmenu=e=>{if(e.shiftKey)return;const c=e.target.closest("td,th");if(!c||!doc.contains(c))return;e.preventDefault();e.stopPropagation();
    if(!c.contains(getSelection().anchorNode))wkCaretIn(c);wkSync();wkTblMenu(c,e)};
  ed.onclick=e=>{
    const b=e.target.closest("button");
    ed.querySelectorAll(".wk-ddm.on").forEach(m=>{if(!b||!m.parentElement.contains(b))m.classList.remove("on")});
    if(!b)return;
    if(b.dataset.wc){wkRestore();document.execCommand(b.dataset.wc);wkQueue();wkSync()}
    else if(b.dataset.wdd){wkKeep();$("#wkDd-"+b.dataset.wdd).classList.toggle("on")}
    else if("whl" in b.dataset){wkSetHl(b.dataset.whl);b.closest(".wk-ddm")?.classList.remove("on")}
    else if("wfc" in b.dataset){wkWrap("fc",b.dataset.wfc);b.closest(".wk-ddm")?.classList.remove("on")}
    else if("wfs" in b.dataset)wkSize(b.dataset.wfs);
    else if(b.dataset.wi==="table")wkGridPick(b);
    else if(b.dataset.wi==="hr")wkIns(`<hr><p><br></p>`);
    else if(b.dataset.wi==="code")wkIns(`<pre><code>\n</code></pre><p><br></p>`);
    else if(b.dataset.wi==="img"){wkKeep();const f=document.createElement("input");f.type="file";f.accept="image/png,image/jpeg,image/webp,image/gif";f.multiple=true;f.onchange=()=>wkAddImgs([...f.files]);f.click()}
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
  if(q&&(tab==="all"||tab==="issue"))all.filter(n=>String(n.issue_id).includes(q)||(n.subject||"").toLowerCase().includes(q)).slice(0,40).forEach(n=>push("issue",n.issue_id,`#${n.issue_id} ${n.subject}`,"내 노트 · "+stOf(n)));
  if(!q&&tab==="issue")[...all].sort((a,b)=>(b.updated_on||"").localeCompare(a.updated_on||"")).slice(0,30).forEach(n=>push("issue",n.issue_id,`#${n.issue_id} ${n.subject}`,"내 노트 · "+stOf(n)));
  if(wkPk&&wkPk.rmQ===q&&(tab==="all"||tab==="issue"))(wkPk.rm||[]).forEach(x=>push("issue",x.id,`#${x.id} ${x.subject}`,"레드마인"+(x.status?" · "+x.status:"")));
  return out.slice(0,80);
}
function wkPicker(anchor){
  wkPkClose();
  const pk=document.createElement("div");pk.id="wkPk";pk.className="wk-pk";pk.setAttribute("role","dialog");pk.setAttribute("aria-label","연결할 항목 고르기");
  pk.innerHTML=`<input id="wkPkQ" placeholder="찾기: 일감 번호/제목 · 보관함 · 트러블슈팅 · 코드 이름 · 위키" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="wkPkL">
    <div class="wk-pkt" id="wkPkT">${[["all","전체"],...Object.entries(WK_KINDS)].map(([k,n])=>`<button type="button" data-pt="${k}">${n}</button>`).join("")}</div>
    <div class="wk-pkl" id="wkPkL" role="listbox"></div><div class="wk-pkf">↑↓ 고르기 · Enter 넣기 · Esc 닫기</div>`;
  document.body.appendChild(pk);
  wkPk={tab:"all",sel:0,list:[]};
  const dr=$("#wkDoc").getBoundingClientRect(),rr=(anchor||wkSavedRange)?.getBoundingClientRect();
  const x=rr&&(rr.left||rr.top)?rr.left:dr.left,y=(rr&&(rr.left||rr.top)?rr.bottom:dr.top)+6;
  pk.style.left=Math.max(8,Math.min(innerWidth-448,x))+"px";pk.style.top=Math.max(8,Math.min(innerHeight-380,y))+"px";
  const draw=()=>{const q=$("#wkPkQ").value.trim();wkPk.list=wkCands(q,wkPk.tab);wkPk.sel=Math.min(wkPk.sel,Math.max(0,wkPk.list.length-1));
    const ql=q.toLowerCase().replace(/^#/,""),rmOn=(wkPk.tab==="all"||wkPk.tab==="issue")&&ql.length>=2;
    pk.querySelectorAll("[data-pt]").forEach(b=>b.classList.toggle("on",b.dataset.pt===wkPk.tab));
    $("#wkPkL").innerHTML=wkPk.list.map((x,i)=>`<button type="button" class="wk-pki${i===wkPk.sel?" on":""}" role="option" aria-selected="${i===wkPk.sel}" data-pi="${i}" data-k="${x.k}">${wkIc(x.k)}<span class="ty">${WK_KINDS[x.k]}</span><span class="nm">${esc(x.t)}</span><span class="ds">${esc(x.s||"")}</span></button>`).join("")
      +(rmOn&&wkPk.rmQ!==ql?`<div class="wk-pkst">레드마인 전체에서 찾는 중…</div>`:rmOn&&wkPk.rmErr?`<div class="wk-pkst">레드마인 검색을 못 했어요: ${esc(wkPk.rmErr)}</div>`:"")
      ||`<div class="wk-none">${q?"찾는 게 없어요":"찾을 말을 적어요 · 일감 탭은 내 노트가 먼저 보여요"}</div>`;
    if(rmOn&&wkPk.rmQ!==ql&&wkPk.rmWant!==ql){const me=wkPk;me.rmWant=ql;clearTimeout(me.rmT);me.rmT=setTimeout(async()=>{     // 레드마인 전체(제목 · 번호) 검색
      if(wkPk!==me)return;try{const r=await api(`/api/rm/search?q=${encodeURIComponent(ql)}`);if(wkPk!==me||me.rmWant!==ql)return;me.rm=r.issues||[];me.rmErr=""}
      catch(e){if(wkPk!==me)return;me.rm=[];me.rmErr=e.message}me.rmQ=ql;draw()},350)}
    const on=$("#wkPkL .on");if(on)on.scrollIntoView({block:"nearest"})};
  const pick=i=>{const x=wkPk.list[i];if(!x)return;wkPkClose();wkRestore();$("#wkDoc").focus();
    const s=getSelection();if(anchor&&s.rangeCount&&s.getRangeAt(0).toString()==="[[")document.execCommand("delete");
    document.execCommand("insertHTML",false,wkChip(x.k,x.id,x.k==="issue"?x.t:"")+"\u00a0");wkQueue()};
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
function wkPkClose(){const pk=$("#wkPk");if(pk)pk.remove();if(wkPk)clearTimeout(wkPk.rmT);document.removeEventListener("mousedown",wkPkOut,true);wkPk=null}

/* ---------- 칩 누르기: 그 화면으로 (쿼리 · 코드는 팝업, 위키는 열 보기에서) ---------- */
async function wkFollow(a){
  const k=a.dataset.k,id=a.dataset.ref;wkFlush();
  if(a.classList.contains("gone")){toast(`지워진 ${WK_KINDS[k]} 항목이에요. 연결은 지워도 돼요`,3000);return}
  if(k==="wiki"&&!wkById(+id)&&wkHiddenIn(id)){wkOpen(wkHiddenIn(id).id);return}
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
  try{const r=await wkPost("/api/wiki",{title:"새 문서",body:"",parent_id:parentId,after_id:afterId||null});await wkLoad(true);
    wkPath=wkTrail(r.id).map(w=>w.id);wkDrawCols();wkDrawEd();const t=$("#wkTitle");if(t){t.focus();t.select()}}
  catch(e){toast("문서를 만들지 못했어요: "+e.message,5000)}
}
async function wkMoveTo(w,parentId,index,show){
  await wkFlush();
  try{await wkPost("/api/wiki/move",{id:w.id,parent_id:parentId,index});await wkLoad(true);wkPath=wkTrail(show||!wkPath.length?w.id:wkPath[wkPath.length-1]).map(x=>x.id);wkDrawCols();wkDrawEd()}
  catch(e){toast("옮기지 못했어요: "+e.message,5000)}
}
function wkMenu(id,e){
  const w=wkById(id);if(!w)return;
  const sib=wkKids(w.parent_id),i=sib.findIndex(x=>x.id===id),kids=wkKids(id).length;
  document.querySelectorAll(".popmenu").forEach(m=>m.remove());
  const shut=wkShut(w);
  const items=shut?[["암호 넣고 열기…",()=>{wkOpen(id);setTimeout(()=>$("#wkPw")&&$("#wkPw").focus(),0)}],null,["(잠긴 주제는 열어야 고칠 · 옮길 수 있어요)",()=>{},true]]
    :[["하위 문서 만들기",()=>wkCreate(id)],["아래에 같은 단계 문서",()=>wkCreate(w.parent_id,id)],null,
    ["이름 바꾸기 (F2)",()=>{wkOpen(id);const t=$("#wkTitle");t.focus();t.select()}],
    ["위로",()=>wkMoveTo(w,w.parent_id,i-1),i<=0],["아래로",()=>wkMoveTo(w,w.parent_id,i+1),i>=sib.length-1],
    ["다른 곳으로 옮기기…",()=>wkMoveDlg(w)],null,["여기부터 몰아 보기",()=>{wkOpen(id);wkRead={id};wkDrawEd()}],["여기부터 내보내기…",()=>{wkOpen(id);wkExport(w)}],null,
    ...(w.locked?[["다시 잠그기 (지금 바로)",()=>wkRelock(w)],["잠금 없애기…",()=>wkUnlockRemove(w)]]:[["암호로 잠그기…",()=>wkLockDlg(w)]]),null,
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
/* ---------- 잠금 ---------- */
async function wkLockDlg(w){
  const v=await wdlg({title:`‘${esc(w.title)}’ 잠그기`,ok:"잠그기",collect:()=>[$("#wkLp1").value,$("#wkLp2").value],
    body:`<p class="meta" style="margin-top:0">이 주제와 그 아래 문서 전부가 잠겨요. 열 때마다 암호를 물어요 (창을 닫으면 다시 잠김).<br><b>암호를 잊으면 열 방법이 없어요.</b> 앱 안에서 가리는 잠금이라, 데이터 파일(notes.db · 백업) 자체를 암호화하지는 않아요.</p>
      <label class="meta" for="wkLp1">암호 (4글자 이상)</label><input type="password" id="wkLp1" autocomplete="new-password" style="width:100%;margin:4px 0 8px">
      <label class="meta" for="wkLp2">한 번 더</label><input type="password" id="wkLp2" autocomplete="new-password" style="width:100%;margin-top:4px">`});
  if(!v)return;const [a,b]=v;
  if(a.length<4){toast("암호는 4글자 이상으로 정해 주세요",3000);return}
  if(a!==b){toast("두 암호가 달라요. 다시 해 주세요",3000);return}
  try{await wkFlush();await wkPost("/api/wiki/lock",{id:w.id,password:a});const r=await wkPost("/api/wiki/unlock",{id:w.id,password:a});wkKeys.set(w.id,r.key);
    await wkLoad(true);wkDrawCols();wkDrawEd();toast("잠갔어요. 창을 닫거나 '다시 잠그기' 하면 잠겨요",3200)}
  catch(e){toast("잠그지 못했어요: "+e.message,5000)}
}
async function wkRelock(w){await wkFlush();wkKeys.delete(w.id);await wkLoad(true);wkPath=wkPath.filter(id=>wkById(id));wkDrawCols();wkDrawEd();toast("다시 잠갔어요",1800)}
async function wkUnlockRemove(w){
  const pw=await wdlg({title:`‘${esc(w.title)}’ 잠금 없애기`,ok:"잠금 없애기",collect:()=>$("#wkLp").value,body:`<label class="meta" for="wkLp">지금 암호</label><input type="password" id="wkLp" autocomplete="off" style="width:100%;margin-top:4px">`});
  if(!pw)return;
  try{await wkPost("/api/wiki/unlock-remove",{id:w.id,password:pw});wkKeys.delete(w.id);await wkLoad(true);wkDrawCols();wkDrawEd();toast("잠금을 없앴어요",2000)}
  catch(e){toast("잠금을 없애지 못했어요: "+e.message,5000)}
}
async function wkMoveDlg(w){
  const bad=new Set([w.id]);(function mark(id){wkKids(id).forEach(k=>{bad.add(k.id);mark(k.id)})})(w.id);
  const opts=[];(function walk(pid,d){wkKids(pid).forEach(k=>{if(bad.has(k.id)||wkShut(k))return;opts.push(`<option value="${k.id}" ${k.id===w.parent_id?"selected":""}>${"　".repeat(d)}${esc(k.title)}</option>`);walk(k.id,d+1)})})(null,0);
  const v=await wdlg({title:`‘${esc(w.title)}’ 옮기기`,body:`<label class="meta" for="wkMv">어느 문서 아래로 옮길까요? (맨 아래에 붙어요)</label><select id="wkMv" style="width:100%;margin-top:6px" size="12"><option value="" ${w.parent_id==null?"selected":""}>(최상위 주제)</option>${opts.join("")}</select>`,ok:"옮기기",collect:()=>$("#wkMv").value});
  if(v===false||v==null)return;
  await wkMoveTo(w,v?+v:null,1e6,true);toast(`‘${w.title}’ 을(를) 옮겼어요`,2000);
}
async function wkDelete(w){
  if(!await askC(`‘${w.title}’ 문서를 지울까요? 되돌릴 수 없어요.`,{ok:"지우기"}))return;
  wkDirty=null;clearTimeout(wkSaveT);
  try{await wkApi("/api/wiki/"+w.id,{method:"DELETE"});await wkLoad(true);
    if(wkPath.includes(w.id))wkPath=wkPath.slice(0,wkPath.indexOf(w.id));
    if(!wkPath.length){const f=wkKids(w.parent_id)[0]||wkKids(null)[0];if(f)wkPath=wkTrail(f.id).map(x=>x.id)}
    toast("지웠어요",1800);wkDrawCols();wkDrawEd()}
  catch(e){toast("지우지 못했어요: "+e.message,5000)}
}

/* ---------- 내보내기 ----------
   문서 제목 = 깊이에 맞는 제목 + 번호(1, 1.2 …) · 하위 문서 앞에 구분선 / 본문 안 제목은 문서 제목 바로 아래 단계부터
   연결 칩은 글자로 풀어서 나간다 (받는 사람은 앱이 없으니까) */
function wkCollect(w,depth,num,o,acc){
  if(wkShut(w)){acc.shut=(acc.shut||0)+1;return acc}      // 잠긴(안 연) 주제는 빠진다
  acc.push({w,depth,num});
  if(o.sub){let n=0;wkKids(w.id).forEach(k=>{if(wkShut(k)){acc.shut=(acc.shut||0)+1;return}if(!o.empty&&wkBodyEmpty(k.body)&&!wkKids(k.id).length)return;n++;wkCollect(k,depth+1,(num?num+".":"")+n,o,acc)})}
  return acc;
}
function wkCollectAll(o){const acc=[];let n=0;wkKids(null).forEach(r=>{if(wkShut(r)){acc.shut=(acc.shut||0)+1;return}if(!o.empty&&wkBodyEmpty(r.body)&&!wkKids(r.id).length)return;n++;wkCollect(r,0,String(n),{...o,sub:true},acc)});return acc}
async function wkImgData(names){      // 내보낼 사진: 파일 하나에 다 넣으려고 data: 주소로
  const m=new Map();
  await Promise.all([...names].map(async nm=>{try{const b=await (await fetch("/api/wiki/img/"+nm)).blob();m.set(nm,await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(b)}))}catch(_){}}));
  return m;
}
function wkRefText(a){const k=a.dataset.k,id=a.dataset.ref,i=wkLinkInfo(k,id);
  if(i.gone)return i.label;return k==="issue"?"#"+id:k==="wiki"?`‘${i.label}’ 문서`:`[${WK_KINDS[k]}: ${i.label}]`}
/* 내보내기 문서 제목 단계 (2.37): 깊이 + 1 이지만 4단계(h4)에서 멈춘다 — 깊어도 제목이 본문보다 작아지지 않게. 깊이는 번호(1.2.3.4)로 구분 */
const wkDocLv=depth=>Math.min(4,depth+1);
function wkBodyFor(html,lv,imgs){
  const box=wkClean(html);
  box.querySelectorAll("img[data-img]").forEach(im=>{const d=imgs&&imgs.get(im.dataset.img);if(d){im.src=d;im.alt="사진";im.removeAttribute("data-img")}else im.replaceWith(document.createTextNode("(사진 없음)"))});
  const hs=[...box.querySelectorAll("h2,h3,h4")],min=hs.length?Math.min(...hs.map(h=>+h.tagName[1])):2,shift=lv+1-min;
  hs.forEach(h=>{const n=document.createElement("h"+Math.min(6,+h.tagName[1]+shift));n.innerHTML=h.innerHTML;h.replaceWith(n)});
  box.querySelectorAll("a.lk").forEach(a=>{const s=document.createElement("span");s.className="ref";s.textContent=wkRefText(a);a.replaceWith(s)});
  return box;
}
function wkMd(node){
  const esc2=s=>s.replace(/([\\`*_~|])/g,"\\$1");
  const inl=n=>[...n.childNodes].map(c=>{if(c.nodeType===3)return esc2(c.data.replace(/ /g," "));if(c.nodeType!==1)return "";const t=c.tagName.toLowerCase(),x=inl(c);
    if(["b","strong","mark"].includes(t))return x.trim()?`**${x}**`:x;      // 형광펜은 굵게로 남는다 (색은 빠짐)
    if(t==="i"||t==="em")return x.trim()?`*${x}*`:x;if(["s","strike","del"].includes(t))return x.trim()?`~~${x}~~`:x;if(t==="code")return "`"+c.textContent+"`";if(t==="br")return "  \n";if(t==="img")return `![사진](${c.getAttribute("src")||""})`;return x}).join("");
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
h1,h2,h3,h4,h5,h6{line-height:1.3;margin:1.4em 0 .5em}h1{font-size:1.85em}h2{font-size:1.5em}h3{font-size:1.25em}h4{font-size:1.1em}h5{font-size:1.02em}h6{font-size:1em;color:#3a414d}.doc-t{border-top:2px solid #d0d5dd;padding-top:16px;margin-top:36px}.doc-t:first-of-type{border-top:0;margin-top:0;padding-top:0}
.doc-t .no{color:#2f6fd6;margin-right:8px}.toc{background:#f4f6f9;border-radius:8px;padding:12px 18px 12px 30px;margin:16px 0 28px}.toc a{color:#1f242d;text-decoration:none}
table{border-collapse:collapse;margin:.8em 0}table.tw-full{width:100%;table-layout:fixed}th,td{border:1px solid #c9ced6;padding:5px 10px;text-align:left;vertical-align:top;min-width:48px;height:1.9em}th{background:#eef1f5}
pre{background:#f2f4f7;border-radius:6px;padding:10px 12px;overflow-x:auto;font:13px/1.55 Consolas,"D2Coding",monospace}code{font-family:Consolas,"D2Coding",monospace;background:#f2f4f7;padding:1px 4px;border-radius:4px}pre code{background:none;padding:0}
mark{color:inherit;padding:0 1px;border-radius:2px}mark.hl-y{background:#fff0a3}mark.hl-g{background:#c9f2cf}mark.hl-p{background:#ffd3e6}mark.hl-b{background:#cfe3ff}
.fs-s{font-size:.85em}.fs-l{font-size:1.2em}.fs-xl{font-size:1.5em;line-height:1.35}ul ul{list-style-type:circle}ul ul ul{list-style-type:square}ol ol{list-style-type:lower-alpha}ol ol ol{list-style-type:lower-roman}
.fc-red{color:#c62828}.fc-org{color:#b45309}.fc-blue{color:#1f5fbf}.fc-gray{color:#6b7380}.ref{color:#2f6fd6;font-weight:600}.meta{color:#6b7380;font-size:13px}
img{max-width:100%;height:auto;border-radius:6px;margin:.3em 0}
@media print{body{margin:0;max-width:none}.doc-t{break-after:avoid}}`;
async function wkBuild(w,o){
  const all_=o.scope==="all"||!w,L=all_?wkCollectAll(o):wkCollect(w,0,"",o,[]);
  const title=all_?"업무 위키 전체":w.title,root=all_?"주제 전체":wkTrail(w.id).map(x=>x.title).join(" › ");
  const names=new Set();L.forEach(({w})=>(w.body||"").replace(/data-img="([0-9a-f]{40}\.(?:png|jpg|webp|gif))"/g,(_,n)=>names.add(n)));
  const imgs=await wkImgData(names),base={n:L.length,shut:L.shut||0,imgs:names.size};
  if(o.fmt==="md")return {...base,name:`${title}.md`,type:"text/markdown",
    text:L.map(({w,depth,num},i)=>{const lv=wkDocLv(depth);return `${i?"---\n\n":""}${"#".repeat(lv)} ${num?num+" ":""}${w.title}\n\n${wkBodyEmpty(w.body)?"(비어 있음)":wkMd(wkBodyFor(w.body,lv,imgs))}\n`}).join("\n")};
  const body=L.map(({w,depth,num},i)=>{const lv=wkDocLv(depth);return `<h${lv} class="doc-t" id="d${i}">${num?`<span class="no">${esc(num)}</span>`:""}${esc(w.title)}</h${lv}>${wkBodyEmpty(w.body)?`<p class="meta">(비어 있음)</p>`:wkBodyFor(w.body,lv,imgs).innerHTML}`}).join("\n");
  const toc=L.length>2?`<ol class="toc">${L.map(({w,depth,num},i)=>`<li style="margin-left:${depth*14}px;list-style:none"><a href="#d${i}">${num?esc(num)+" ":""}${esc(w.title)}</a></li>`).join("")}</ol>`:"";
  return {...base,name:`${title}.html`,type:"text/html",
    text:`<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${WK_EXPORT_CSS}</style></head>\n<body><p class="meta">업무 위키 · ${esc(root)} · ${esc(fmt(new Date()))} 내보냄</p>${toc}\n${body}\n</body></html>\n`};
}
async function wkExport(w){
  await wkFlush();
  const o={scope:w?"doc":"all",sub:ui.wkExSub!==false,empty:!!ui.wkExEmpty,fmt:ui.wkExFmt==="md"?"md":"html"};
  const pr=wdlg({title:"내보내기",wide:true,ok:"파일로 저장",cancel:"닫기",collect:()=>({...o}),
    body:`<div class="wk-exo">
      <span class="wk-exs" role="radiogroup" aria-label="범위">범위:
        ${w?`<label><input type="radio" name="wkExS" value="doc" ${o.scope==="doc"?"checked":""}> 이 문서부터 <b>${esc(wkTrail(w.id).map(x=>x.title).join(" › "))}</b></label>`:""}
        <label><input type="radio" name="wkExS" value="all" ${o.scope==="all"?"checked":""}> 주제 전체</label></span>
      <label><input type="checkbox" id="wkExSub" ${o.sub?"checked":""}> 하위 문서 같이 내보내기</label>
      <label><input type="checkbox" id="wkExEmpty" ${o.empty?"checked":""}> 빈 문서도 넣기</label>
      <label><input type="radio" name="wkExF" value="html" ${o.fmt==="html"?"checked":""}> .html <small class="meta">형광펜 · 글자색 · 표 · 사진 그대로 · Word 로 열기 · PDF 인쇄</small></label>
      <label><input type="radio" name="wkExF" value="md" ${o.fmt==="md"?"checked":""}> .md <small class="meta">색은 빠지고 형광펜은 굵게 · 사진은 파일 안에</small></label></div>
      <div class="wk-exp" id="wkExPv"></div><div class="meta" id="wkExInfo"></div>`});
  let seq=0;
  const upd=async()=>{o.scope=(document.querySelector("[name=wkExS]:checked")||{}).value||"all";o.sub=$("#wkExSub").checked;o.empty=$("#wkExEmpty").checked;o.fmt=document.querySelector("[name=wkExF]:checked").value;
    $("#wkExSub").disabled=o.scope==="all";
    const my=++seq,b=await wkBuild(o.scope==="all"?null:w,o);if(my!==seq||!$("#wkExPv"))return;const pv=$("#wkExPv");
    if(o.fmt==="md"){pv.className="wk-exp md";pv.textContent=b.text}
    else{pv.className="wk-exp html";pv.innerHTML="";const f=document.createElement("iframe");f.setAttribute("sandbox","");f.title="내보내기 미리보기";f.srcdoc=b.text;pv.appendChild(f)}
    $("#wkExInfo").textContent=`문서 ${b.n}개${b.imgs?` · 사진 ${b.imgs}장 (파일 안에 넣음)`:""}${b.shut?` · 잠긴 주제 ${b.shut}개는 빠졌어요 (열면 들어가요)`:""} · 연결은 [보관함: 이름] 같은 글자로 풀어서 나가요`};
  ["wkExSub","wkExEmpty"].forEach(id=>$("#"+id).onchange=upd);document.querySelectorAll("[name=wkExF],[name=wkExS]").forEach(r=>r.onchange=upd);upd();
  const r=await pr;if(!r)return;
  ui.wkExSub=r.sub;ui.wkExEmpty=r.empty;ui.wkExFmt=r.fmt;saveUI();
  const b=await wkBuild(r.scope==="all"?null:w,r),safe=b.name.replace(/[\\/:*?"<>|\x00-\x1f]/g,"_").slice(0,120);
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([(r.fmt==="md"?"\uFEFF":"")+b.text],{type:b.type+";charset=utf-8"}));a.download=safe;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),5000);      // 저장 · 알림은 앱 다운로드(downloads.js)가 한다
}
