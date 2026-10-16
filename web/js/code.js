/* ---------- 코드 이력 (테이블 · 파일 · 함수 이름 추적) ----------
   노트·본문·댓글에서 코드 대상 이름을 자동으로 뽑아, 이름별로 "어떤 일감에서 어떻게 처리했는지"를 시간순으로 보여 준다.
   - 테이블·컬럼 : TPROD_DRAW_STD_ADD_INF 처럼 대문자_밑줄 이름, FROM/UPDATE/INTO/JOIN/TABLE 뒤의 이름
   - 파일       : xxx.java, yyy.xml, zzz.sql ...
   - 함수·클래스 : getUserList, UserService 처럼 낙타표기 이름 */
const RE_SNAKE=/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;
const RE_FILE=/[\w.\/\\-]*\w\.(?:java|jsp|xml|sql|js|css|html|py|ts|vue|cs|properties|yml|yaml|json|sh|bat|jsx|tsx|gradle)\b/gi;
const RE_SQLT=/\b(?:FROM|UPDATE|INTO|JOIN|TABLE)\s+([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?)/gi;
const RE_CAMEL=/\b[a-z][a-z0-9]+(?:[A-Z][a-z0-9]+)+\b|\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+\b/g;
const TOK_STOP=new Set(["NOT_NULL","PRIMARY_KEY","FOREIGN_KEY","DEFAULT_NULL","NOT_FOUND","IS_NULL","ORDER_BY","GROUP_BY","INNER_JOIN","LEFT_JOIN","UTF_8","JAVA_HOME","HTTP_ONLY","SYS_DATE"]);
const SQL_STOP=new Set(["SELECT","DUAL","VALUES","WHERE","TABLE","TEMP","DELETE","INSERT","UPDATE","FROM","INTO","JOIN","NULL","ONLY","USER","DATA","ROWS","INDEX","VIEW","LOGIN","LIST","INFO","THIS","THAT","WITH","SOME","EACH","HAVE"]);
const CAMEL_STOP=new Set(["JavaScript","TypeScript","PowerPoint","GitHub","YouTube","iPhone","iPad","PostgreSQL","MySQL","MariaDB","OneDrive","WhatsApp","LinkedIn","SQLite"]);
const T_TAB="테이블",T_COL="컬럼",T_CTL="Controller",T_SVC="Service",T_VIEW="JSP·화면",T_SQL="SQL·매퍼",T_FILE="파일",T_FN="함수·클래스";
const TAB_ORDER=[T_TAB,T_COL,T_CTL,T_SVC,T_VIEW,T_SQL,T_FILE,T_FN];       // 코드 이력 탭 순서
const FLOW_ORDER=[T_CTL,T_SVC,T_SQL,T_TAB,T_COL,T_VIEW,T_FILE,T_FN];       // 노트의 '코드 대상' 칩 순서: 컨트롤러 → 서비스 → SQL → 테이블 → 화면
const TYPE_CODE={[T_TAB]:"T",[T_COL]:"C",[T_CTL]:"Ctl",[T_SVC]:"Svc",[T_VIEW]:"JSP",[T_SQL]:"SQL",[T_FILE]:"F",[T_FN]:"ƒ"};
const TYPE_CLS={[T_TAB]:"tab",[T_COL]:"col",[T_CTL]:"ctl",[T_SVC]:"svc",[T_VIEW]:"jsp",[T_SQL]:"sql",[T_FILE]:"fil",[T_FN]:"fn"};
const typePill=type=>`<i class="${TYPE_CLS[type]}">${TYPE_CODE[type]}</i>`;
/* 이름의 끝으로 계층을 구분한다: ~Controller / ~Service(Impl) / ~Dao·Mapper·Repository(=SQL을 다루는 곳) */
const layerOf=b=>/Controller$/.test(b)?T_CTL:/(Service|ServiceImpl|Biz|BizImpl)$/.test(b)?T_SVC:/(Dao|DAO|DaoImpl|Mapper|Repository|Repo)$/.test(b)?T_SQL:null;
const RE_LAYER=/\b[A-Za-z][A-Za-z0-9]*(?:Controller|ServiceImpl|Service|Biz|Dao|DAO|Mapper|Repository)\b/g;   // CouponController, MemberDAO ...
function fileType(name){   // 파일 이름 -> 분류
  const m=name.match(/^(.*)\.(\w+)$/),base=m?m[1]:name,ext=m?m[2].toLowerCase():"";
  const l=layerOf(base);if(l)return l;
  if(/^(jsp|jspf|html|htm|js|jsx|ts|tsx|vue|css|scss|ftl)$/.test(ext))return T_VIEW;                        // 화면
  if(ext==="sql"||(ext==="xml"&&/(mapper|sql|query|dao)/i.test(base)))return T_SQL;                         // SQL / 매퍼 XML
  return T_FILE;
}
/* 모든 테이블에 들어가는 등록/수정 공통 컬럼: 이력에서 묻히지 않도록 기본으로 숨긴다 */
const COMMON_COLS=new Set(["REG_DTS","REGR_NO","REG_PGM_URL","MOD_DTS","MODR_NO","MOD_PGM_URL","CRE_DTS","CRER_NO","UPD_DTS","UPDR_NO","REG_DT","MOD_DT","REG_ID","MOD_ID","USE_YN","DEL_YN","SORT_ORD","SORT_NO"]);
const isTableName=t=>/^T[A-Z0-9]{2,}(?:_[A-Z0-9]+){2,}$/.test(t);   // 이 DB의 테이블 이름: T로 시작하고 세 덩어리 이상 (TMBR_MBR_BAS, TPROD_DRAW_STD_ADD_INF). TRGT_NO 같은 두 덩어리는 컬럼
function extractTokens(text){
  const out=new Map(),add=(t,type)=>{if(t&&!out.has(t))out.set(t,type)};
  for(const m of text.matchAll(RE_SQLT)){const raw=m[1].split(".").pop(),t=raw.toUpperCase();   // FROM/UPDATE/INTO/JOIN/TABLE 뒤 = 테이블
    if(/^[A-Z][A-Z0-9_]{3,}$/.test(t)&&!SQL_STOP.has(t)&&(raw===t||raw.includes("_")))add(t,T_TAB)}
  for(const m of text.matchAll(RE_SNAKE)){const t=m[0];if(t.length>=5&&!TOK_STOP.has(t))add(t,isTableName(t)?T_TAB:T_COL)}
  for(const m of text.matchAll(RE_FILE)){
    const base=m[0].split(/[\\/]/).pop();if(base.length<4)continue;
    const nm=base.replace(/\.(java|xml)$/i,""),l=layerOf(nm);
    add(l?nm:base,fileType(base));          // CouponController.java 와 클래스 CouponController 는 같은 이름으로 합친다
  }
  for(const m of text.matchAll(RE_LAYER))add(m[0],layerOf(m[0]));                  // 파일 이름이 없어도 클래스 이름만으로 계층 인식
  for(const m of text.matchAll(RE_CAMEL)){const t=m[0];if(t.length>=6&&!CAMEL_STOP.has(t))add(t,layerOf(t)||T_FN)}
  return out;
}
let tokIdx=new Map(),codeShown=40,codeRel="all";
/* 코드 이름과 나의 관계 (현재 역할 기준, 1차). 한 이름이 여러 일감에 나오면 아래 순서대로 가장 앞선 것을 대표로 쓴다. */
const REL_ORDER=["dev","watch","mention","ref"];
const CREL={dev:{label:"내가 개발",short:"개발",tip:"담당자/개발담당자로서 내가 직접 쓴 글(내 기록·내 댓글)에 나온 이름"},
  watch:{label:"관람 중 작성",short:"관람",tip:"관람자인 일감에서 내가 댓글로 쓴 이름"},
  mention:{label:"남이 언급",short:"언급",tip:"내가 맡았거나 관람하는 일감에서, 다른 사람이 쓴 글에만 나온 이름"},
  ref:{label:"참조",short:"참조",tip:"다른 일감과 연결돼서 받은 일감에만 나온 이름"}};
const relRep=e=>REL_ORDER.find(k=>e.rel[k]>0)||"ref";
const relPill=(k,extra="")=>`<span class="rl rl-${k}" title="${esc(CREL[k].label)} — ${esc(CREL[k].tip)}">${CREL[k].short}${extra}</span>`;
function buildTokens(){
  tokIdx=new Map();
  all.filter(notDeploy).forEach(n=>{   // 배포요청 일감의 글은 코드 이력에 넣지 않는다 (배포요청 화면에서만)
    const mine=[n.action,n.code_change,n.reason,...(n._pg||[]).map(p=>p.text)].join("\n");   // 진행 기록도 내가 쓴 글
    const tm=extractTokens([n.subject,n.description,n.requirement,mine,n.journals.map(j=>j.notes).join("\n")].join("\n"));
    n._tok=tm;n._tokMine=new Set(extractTokens(mine).keys());
    const my=new Map();   // 내가 단 댓글에 나온 이름 -> 가장 최근 날짜
    myComments(n).forEach(j=>extractTokens(j.notes||"").forEach((_,t)=>{const d=lDay(j.created_on);if(!my.has(t)||my.get(t)<d)my.set(t,d)}));
    n._tokMyCm=my;
    const rs=rolesOf(n),inCharge=rs.includes("담당자")||rs.includes("개발담당자"),onlyWatch=!inCharge&&rs.includes("관람자");
    n._rel=new Map();
    tm.forEach((type,t)=>{
      const wrote=n._tokMine.has(t)||my.has(t);
      const c=wrote?(onlyWatch?"watch":"dev"):(inCharge||rs.includes("관람자")?"mention":"ref");
      n._rel.set(t,c);
      let e=tokIdx.get(t);if(!e){e={t,type,notes:[],mine:0,rel:{dev:0,watch:0,mention:0,ref:0},myLast:""};tokIdx.set(t,e)}
      e.notes.push(n);e.rel[c]++;if(n._tokMine.has(t))e.mine++;
      if(wrote){const d=my.get(t)||n._d;if(d>e.myLast)e.myLast=d}
    });
  });
}
const escRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const hl=(text,token)=>text.split(new RegExp("("+escRe(token)+")","gi")).map((p,i)=>i%2?`<mark>${esc(p)}</mark>`:esc(p)).join("");
function openCode(t){codeSel=t;codeShown=40;codeEd=false;nav="code";view="code";renderAll()}
function renderCode(){
  if(!trLoaded)trLoad().then(()=>{if(view==="code")renderCodeDetail()});
  if(!qvLoaded)qvLoad().then(()=>{if(view==="code"&&qvLoaded)renderCodeDetail()});
  const TYPES=["전체",...TAB_ORDER];
  $("#center").innerHTML=`<div class="code-h"><div class="seg">${TYPES.map(t=>`<button data-ct="${t}" class="${t===codeType?"on":""}">${t}</button>`).join("")}</div>
    <span id="relbox" style="display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap"></span>
    <input id="cq" placeholder="이름·설명 검색 (예: TMBR)" value="${esc(codeQ)}" style="min-width:12rem">
    <label class="meta" style="display:inline-flex;align-items:center;gap:4px"><input type="checkbox" id="cmin" ${codeMin2?"checked":""}> 2건 이상 나온 것만</label>
    <label class="meta" style="display:inline-flex;align-items:center;gap:4px" title="REG_DTS, MODR_NO 처럼 모든 테이블에 있는 등록/수정 컬럼"><input type="checkbox" id="ccom" ${codeCommon?"checked":""}> 공통 컬럼 포함</label>
    <span class="meta" id="cinfo"></span></div><div id="tokbox"></div><div id="codeDetail"></div>`;
  /* 탭을 옮기면 선택한 이름·편집 상태를 초기화 */ document.querySelectorAll("[data-ct]").forEach(b=>b.onclick=()=>{codeType=b.dataset.ct;codeSel=null;codeEd=false;codeShown=40;renderCode()});
  $("#cmin").onchange=e=>{codeMin2=e.target.checked;refreshTok()};
  $("#ccom").onchange=e=>{codeCommon=e.target.checked;refreshTok()};
  $("#cq").oninput=e=>{codeQ=e.target.value.trim();refreshTok()};
  function refreshTok(){
    const q=codeQ.toLowerCase();
    const base=[...tokIdx.values()].filter(e=>(codeType==="전체"||e.type===codeType)&&(codeCommon||!COMMON_COLS.has(e.t))&&(!codeMin2||e.notes.length>=2)&&(!q||e.t.toLowerCase().includes(q)||(codeNotes[e.t]||"").toLowerCase().includes(q)));
    const rc=Object.fromEntries(REL_ORDER.map(k=>[k,base.filter(e=>e.rel[k]>0).length]));
    $("#relbox").innerHTML=`<span class="meta">내 관계</span><div class="seg">${[["all","전체",base.length],...REL_ORDER.map(k=>[k,CREL[k].label,rc[k]])].map(([k,l,c])=>`<button type="button" data-rel="${k}" class="${k===codeRel?"on":""}" title="${k==="all"?"모든 이름":esc(CREL[k].tip)}">${l} <small>${c}</small></button>`).join("")}</div>`;
    document.querySelectorAll("#relbox [data-rel]").forEach(b=>b.onclick=()=>{codeRel=b.dataset.rel;codeSel=null;refreshTok();renderCodeDetail()});
    const list=codeRel==="all"?base:base.filter(e=>e.rel[codeRel]>0);
    list.sort((a,b)=>b.notes.length-a.notes.length||a.t.localeCompare(b.t));
    const shown=list.slice(0,150);
    $("#tokbox").innerHTML=shown.map(e=>`<span class="tok ${e.t===codeSel?"on":""}" data-tok="${esc(e.t)}" title="${esc(codeNotes[e.t]||"")}">${typePill(e.type)}${esc(e.t)}${codeNotes[e.t]?`<span class="hasdesc">✎</span>`:""}${relPill(relRep(e))}<span class="n">${e.notes.length}</span></span>`).join("")
      ||`<span class="meta">조건에 맞는 이름이 없습니다. '2건 이상' 체크를 풀어 보세요.</span>`;
    $("#cinfo").textContent=`${list.length}개 중 ${shown.length}개 표시 · 전체 노트 기준`;
    document.querySelectorAll(".tok").forEach(c=>c.onclick=()=>{codeSel=c.dataset.tok;codeShown=40;codeEd=false;refreshTok();renderCodeDetail()});
  }
  refreshTok();renderCodeDetail();
}
function renderCodeDetail(){
  const el=$("#codeDetail"),e=codeSel&&tokIdx.get(codeSel);
  if(!e){el.innerHTML=`<div class="empty"><b>이름을 선택하세요</b>테이블·파일·함수 이름을 누르면, 그 이름이 나온 일감과 내가 쓴 처리 내용·수정한 코드·수정 이유를 시간순으로 보여 줍니다.</div>`;return}
  const ns=[...e.notes].sort((a,b)=>codeAsc?a.updated_on.localeCompare(b.updated_on):b.updated_on.localeCompare(a.updated_on));
  const first=ns.reduce((m,n)=>n._d<m?n._d:m,"9999"),last=ns.reduce((m,n)=>n._d>m?n._d:m,"0000");
  const sec=(label,txt)=>txt&&txt.trim()?`<div class="mine-sec">${label}</div><div class="${pvClass()}">${renderMd(txt)}</div>`:"";
  const snips=n=>{   // 내가 쓴 칸이 아닌 곳(댓글·본문)에서 이름이 나온 줄을 보여 준다
    const re=new RegExp(escRe(e.t),"i"),out=[];
    const push=(src,txt)=>(txt||"").split(/\r?\n/).forEach(l=>{if(out.length<4&&re.test(l))out.push({src,l:l.trim().slice(0,260)})});
    n.journals.forEach(j=>push(`댓글 ${lDay(j.created_on)} ${j.user.name}`,j.notes));
    push("요건 · 본문",n.description);if(!out.length)push("제목",n.subject);
    return out;
  };
  const dnow=codeNotes[e.t]||"";
  const descHtml=codeEd
    ?`<div class="cdesc"><textarea id="cdTxt" rows="4" placeholder="이 ${esc(e.type)}이(가) 무엇인지 적어 두세요. 예) 쿠폰 발급 이력을 담는 테이블, 법인콘도 예약 시 호출" style="width:100%">${esc(dnow)}</textarea>
        <div class="row" style="margin-top:6px"><button class="primary" id="cdSave">저장</button><button id="cdCancel">취소</button>${dnow?`<button id="cdDel" title="설명을 지웁니다">설명 삭제</button>`:""}<span class="meta">Ctrl+Enter 로 저장</span></div></div>`
    :dnow?`<div class="cdesc"><div class="cdtxt">${esc(dnow)}</div><div class="row" style="margin-top:6px"><button id="cdEdit">설명 수정</button></div></div>`
    :`<div class="cdesc"><button id="cdEdit">+ 설명 추가</button> <span class="meta">이 이름이 무엇인지 한두 줄로 적어 두면 목록·검색에서도 보입니다</span></div>`;
  el.innerHTML=`<div class="card"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><b style="font-family:var(--mono);font-size:1.1rem">${esc(e.t)}</b><span class="tag">${e.type}</span>
      <span class="meta">일감 ${ns.length}건 · ${first} ~ ${last} · 내 기록이 있는 일감 ${e.mine}건</span><span class="sp"></span>
      <button id="cord">${codeAsc?"오래된 순":"최신 순"} ⇅</button><button id="ccopy">이름 복사</button><button id="csearch" title="노트 목록에서 이 이름으로 검색합니다">목록에서 검색</button></div>
      <div class="chips" style="margin-top:8px"><span class="meta">내 관계</span>${REL_ORDER.filter(k=>e.rel[k]).map(k=>relPill(k,` ${e.rel[k]}건`)).join("")}${e.myLast?`<span class="meta">· 내가 마지막으로 쓴 날 ${e.myLast}</span>`:`<span class="meta">· 내가 직접 쓴 적은 없어요</span>`}</div>
      ${descHtml}</div>`
    +trRelHtml(e.t)+qvRelHtml(e.t)
    +ns.slice(0,codeShown).map(n=>{const s=stOf(n);return `<div class="card mine-card">
      <div class="meta">${catPill(n)}${n._d} · #${n.issue_id} · <span class="badge s-${s}">${s}</span> ${relPill(n._rel.get(e.t)||"ref")}${n._tokMine.has(e.t)?` <span class="tag 담당자">내 기록에 언급</span>`:""}</div>
      <h3 data-open="${n.issue_id}">${title(n.subject)}</h3>
      ${sec("처리 내용",n.action)}${sec("수정한 코드/방법",n.code_change)}${sec("수정 이유",n.reason)}
      ${(n._pg||[]).filter(p=>new RegExp(escRe(e.t),"i").test(p.text)).map(p=>sec(`진행 기록 · ${p.day}`,p.text)).join("")}
      ${snips(n).map(x=>`<div class="snip"><small>${esc(x.src)}</small>${hl(x.l,e.t)}</div>`).join("")}
      <div class="row"><button data-open="${n.issue_id}">노트 열기</button></div></div>`}).join("")
    +(ns.length>codeShown?`<div class="row"><button id="cmore">더 보기 (${ns.length-codeShown}건 남음)</button></div>`:"");
  el.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>openNote(+b.dataset.open));
  el.querySelectorAll("[data-trop]").forEach(b=>b.onclick=()=>openTrouble(+b.dataset.trop));
  wireQvRel(el);
  wireCp(el);
  $("#cord").onclick=()=>{codeAsc=!codeAsc;renderCodeDetail()};
  $("#ccopy").onclick=()=>copyText(e.t,"이름을 복사했어요");
  $("#csearch").onclick=()=>{sel=[];$("#q").value=e.t;nav="history";view="note";renderAll()};
  if($("#cmore"))$("#cmore").onclick=()=>{codeShown+=40;renderCodeDetail()};
  const saveDesc=async txt=>{
    try{await post("/api/codenote",{token:e.t,description:txt})}catch(x){toast("설명을 저장하지 못했습니다. 서버가 켜져 있는지 확인하세요");return}
    if(txt.trim())codeNotes[e.t]=txt;else delete codeNotes[e.t];
    codeEd=false;refreshTokOuter();renderCodeDetail();
  };
  if($("#cdEdit"))$("#cdEdit").onclick=()=>{codeEd=true;renderCodeDetail();$("#cdTxt").focus()};
  if($("#cdCancel"))$("#cdCancel").onclick=()=>{codeEd=false;renderCodeDetail()};
  if($("#cdSave"))$("#cdSave").onclick=()=>saveDesc($("#cdTxt").value);
  if($("#cdDel"))$("#cdDel").onclick=async()=>{if(await askC("이 이름의 설명을 지울까요?"))saveDesc("")};
  if($("#cdTxt"))$("#cdTxt").onkeydown=ev=>{if(ev.key==="Enter"&&(ev.ctrlKey||ev.metaKey)){ev.preventDefault();saveDesc($("#cdTxt").value)}else if(ev.key==="Escape"){codeEd=false;renderCodeDetail()}};
}
const refreshTokOuter=()=>{if(view==="code")renderCode()};

