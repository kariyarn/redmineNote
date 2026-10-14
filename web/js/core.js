const $=s=>document.querySelector(s);
const ROLES=["전체","담당자","개발담당자","관람자","연관"];  // 연관 = 직접 관여하진 않지만 연결돼서 가져온 일감
const STATS=["현안","대기","진행","완료","중단","전체"];   // 현안 = 대기 + 진행 (완료·최종확인요청·중단은 제외)
const CATS=["전체","BC","DR","기타"];
/* 구분: 프로젝트 이름 앞 태그로 나눈다. [BC] Business Case -> BC, [DR] Daily Request -> DR, 그 외(DevOps, Infra 등) -> 기타 */
const catOf=n=>{const m=(n.project||"").match(/^\s*\[(BC|DR)\]/i);return m?m[1].toUpperCase():"기타"};
const catPill=(n,lg)=>{const c=catOf(n);return `<span class="cat ${c}${lg?" lg":""}" title="${esc(n.project)}">${c}</span>`};
const THEMES=[   // 설정 → 화면 테마. c = [바탕, 카드, 포인트], k = 밝기
  {id:"light",name:"라이트",k:"밝음",c:["#eceff3","#f8f9fb","#2f6fd6"]},
  {id:"kotori",name:"코토리 베이지",k:"밝음 · 따뜻함",c:["#e9e1d4","#f6f1e7","#4a6b86"]},
  {id:"emerald",name:"에메랄드",k:"밝음 · 초록",c:["#e3eee8","#f3f9f6","#0b8a68"]},
  {id:"lavender",name:"라벤더",k:"밝음 · 보라",c:["#ebe7f5","#f8f6fc","#6a4cd0"]},
  {id:"hcl",name:"고대비",k:"밝음 · 또렷함",c:["#f4f4f4","#ffffff","#0030c0"]},
  {id:"dark",name:"다크",k:"어두움",c:["#262a31","#30353d","#6ea8fe"]},
  {id:"nord",name:"노르드",k:"어두움 · 청회색",c:["#2e3440","#3b4252","#88c0d0"]},
  {id:"mocha",name:"모카",k:"어두움 · 갈색",c:["#2a221d","#342b25","#e0a96d"]},
  {id:"cyberpunk",name:"사이버펑크",k:"어두움 · 보라+핑크",c:["#221a3a","#2c2250","#ff4fae"]},
  {id:"terminal",name:"터미널",k:"어두움 · 초록",c:["#14201a","#1b2b22","#4ade80"]},
];
const THEME_MIGRATE={ocean:"light",rose:"light",paper:"kotori",texture:"kotori",sunset:"kotori",forest:"emerald",mint:"emerald",midnight:"cyberpunk",neon:"cyberpunk",hcd:"dark"};   // 없어진 테마는 가장 가까운 것으로
/* 레드마인 상태 -> 노트 상태 묶음. 필요하면 아래 목록만 고치면 됩니다. */
const DONE=["완료","최종확인요청","작업완료","검수완료(승인)"];
const HOLD=["중단","보류","검토중(보류)","검토중(반려)"];
const WAIT=["백로그","접수","접수신청","요청중"];
const stOf=n=>{const s=n.rm_status;if(DONE.includes(s))return"완료";if(HOLD.includes(s))return"중단";if(WAIT.includes(s)||/To-Do/i.test(s))return"대기";return"진행"};

let skipped={},all=[],links=[],terms=[],cfg={},role="담당자",st="현안",cat="전체",sel=[],selMode="and",view="note",graphMode="all",cur=null,editing=null;
let nav="today";                                  // 화면(왼쪽 메뉴): today 오늘 · history 이력 · mine 내 기록 · summary 요약 · graph 그래프 · code 코드 이력
const hist={cat:"전체",per:"all",flag:"",more:60,pop:false};     // 이력 화면의 임시 필터 (기억하지 않는다: 다시 켜면 초기화)
const today={open:{}};                              // 오늘 화면에서 펼친 접이식 구역
let mineSub="notes",fresh={},onlyFresh=false,starOnly=false,staleOnly=false,needOnly=false;
let edNote=null,edBase=null,edSavedAt=null,edSaveN=0;                               // 지금 편집 중인 노트 / 마지막으로 저장(또는 불러온) 시점의 내용
const pgDraft=new Map();                                                // 입력 중인 새 진행 기록(저장 전) 임시 보관
let pgBy=new Map();                                                          // 일감별 진행 기록 (일자별)
let todos=[],todoMap={};      // 할 일 체크리스트(전체) / {일감번호: [남은 수, 전체 수]}
let codeNotes={},codeEd=false;      // 이름별 내 설명 {이름: 설명} / 설명 편집 중인지
let codeSel=null,codeType="테이블",codeQ="",codeMin2=true,codeAsc=false,codeCommon=false;     // 코드 이력 화면 상태
let S={auto_check:"1",font_body:"",font_mono:"",font_size:"14",line_height:"1.55",font_names:"[]",graph_limit:"150",
       graph_terms:"1",graph_term_link:"2",graph_color:"status",stale_days:"7",stale_progress:"0"};  // 서버에 저장되는 설정
let fontsReg=[];                                                                                     // 등록한 폰트 파일
let ui={lw:340,rw:280,hl:false,hr:false,dictV:1,fsz:"m",wrap:true,lnum:false,theme:"auto",qscope:"title",hubLim:40,gLim:60,gDone:true,incWatch:false,incRef:false,navMore:false,thMore:false};                    // 이 브라우저에만 저장되는 화면 설정
let hadLocalUi=false;       // 이 브라우저에 예전부터 저장된 화면 설정이 있었는지 (서버로 옮길지 판단)
try{const raw=localStorage.getItem("rnui2");hadLocalUi=!!raw;Object.assign(ui,JSON.parse(raw||"{}"))}catch(e){}
let uiSynced=false,uiTimer;   // 화면 설정은 서버(DB)에도 저장해서, 앱 창이든 일반 브라우저든 같은 설정으로 보이게 한다
const saveUI=()=>{
  try{localStorage.setItem("rnui2",JSON.stringify(ui))}catch(e){}
  clearTimeout(uiTimer);
  uiTimer=setTimeout(()=>{if(uiSynced)post("/api/settings",{ui_prefs2:JSON.stringify(ui)}).catch(()=>{})},400);
};

const alr={list:[],notice:[],started:"",hide:new Map(),drawn:""};      // 메모 알림 상태 (서버에서 15초마다 가져온다)
const sbc={y:0,m:0,items:[],tmp:false,t:0};                              // 사이드바 달력 상태
const z=n=>String(n).padStart(2,"0");
const fmt=d=>`${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`;
const esc=s=>(s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
async function api(p,o){const r=await fetch(p,o);const j=await r.json();if(!r.ok){const e=new Error(j.error||r.status);e.status=r.status;e.code=j.code;e.body=j;throw e}return j}
const post=(p,b)=>api(p,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
let tt;function toast(t,ms=5000){const e=$("#toast");e.classList.remove("act");e.textContent=t;e.classList.add("show");clearTimeout(tt);if(ms)tt=setTimeout(()=>e.classList.remove("show"),ms)}
/* "[팀명] 제목" -> 팀명은 작은 태그로 */
function title(s){const m=(s||"").match(/^\s*(\[[^\]]{1,24}\])\s*(.*)$/);return m&&m[2].trim()?`<span class="pre">${esc(m[1])}</span>${esc(m[2])}`:esc(s)}      // 제목 전체가 [ ] 인 것(예: [운영서버 배포요청 / 날짜])은 팀 태그가 아니라 그냥 제목
const kb=b=>b>1048576?(b/1048576).toFixed(1)+"MB":Math.max(1,Math.ceil(b/1024))+"KB";

/* ---------- 테마 (고르는 곳은 설정 → 화면 테마) ---------- */
/* 화면 디자인: 기존(classic) / 새 디자인(v2). 설정 → 화면 디자인. 데이터는 같고 보이는 모양과 일부 배치만 다르다. */
const V2=()=>ui.design==="v2";
function applyTheme(){
  const r=document.documentElement;
  if(V2())r.dataset.design="v2";else r.removeAttribute("data-design");
  if(ui.theme!=="auto"&&!THEMES.some(t=>t.id===ui.theme)){ui.theme=THEME_MIGRATE[ui.theme]||"light";saveUI()}
  if(ui.theme==="auto")r.removeAttribute("data-theme");else r.dataset.theme=ui.theme;
}

/* ---------- 글꼴 ---------- */
const BODY_FONTS=["Malgun Gothic","Pretendard","NanumGothic","Noto Sans KR","Gulim","Batang","Segoe UI","system-ui"];
const MONO_FONTS=["Consolas","D2Coding","Cascadia Mono","Courier New"];
const KO={"Malgun Gothic":"맑은 고딕","NanumGothic":"나눔고딕","Gulim":"굴림","Batang":"바탕","system-ui":"시스템 기본"};
const fam=n=>n==="system-ui"?"system-ui":`"${n}"`;
function applyFont(){
  const r=document.documentElement;
  r.style.fontSize=(+S.font_size||14)+"px";
  r.style.setProperty("--lh",S.line_height||"1.55");
  if(S.font_body)r.style.setProperty("--font",fam(S.font_body)+',"Malgun Gothic","Apple SD Gothic Neo",system-ui,sans-serif');else r.style.removeProperty("--font");
  if(S.font_mono)r.style.setProperty("--mono",fam(S.font_mono)+',Consolas,"D2Coding",monospace');else r.style.removeProperty("--mono");
  let el=$("#userfonts");if(!el){el=document.createElement("style");el.id="userfonts";document.head.appendChild(el)}
  el.textContent=fontsReg.map(f=>`@font-face{font-family:"${f.family}";src:url("/fonts/${encodeURIComponent(f.file)}");font-display:swap}`).join("\n");
}
const extraNames=()=>{try{return JSON.parse(S.font_names||"[]")}catch(e){return[]}};
const fontList=base=>[...new Set([...base,...extraNames(),...fontsReg.map(f=>f.family)])];
function installed(n){   // 이 PC에 설치된 글꼴인지 글자 폭으로 판별
  if(n==="system-ui"||fontsReg.some(f=>f.family===n))return true;
  const c=installed.c||(installed.c=document.createElement("canvas").getContext("2d"));
  const t="abcdefghijklmnopqrstuvwxyz가나다라마바사0123456789";
  const w=f=>{c.font=`72px ${f}`;return c.measureText(t).width};
  return ["monospace","serif","sans-serif"].some(g=>w(`"${n}",${g}`)!==w(g));
}
async function loadSettings(){
  try{S={...S,...await api("/api/settings")};fontsReg=await api("/api/fonts")}catch(e){}
  if(S.ui_prefs2){try{Object.assign(ui,JSON.parse(S.ui_prefs2));try{localStorage.setItem("rnui2",JSON.stringify(ui))}catch(e){}applyUI();applyTheme()}catch(e){}}   // 서버에 저장된 화면 설정이 있으면 그것을 쓴다
  else if(hadLocalUi)post("/api/settings",{ui_prefs2:JSON.stringify(ui)}).catch(()=>{});                                                                        // 없으면 이 브라우저의 설정을 서버로 한 번 옮긴다
  if(!ui.dictV){ui.hr=false;ui.dictV=1;saveUI()}      // 예전에 저장된 설정에 '사전 숨김'이 있어도, 주제 사전은 한 번 기본으로 다시 보이게 한다 (그 뒤에는 사용자가 정한 대로)
  uiSynced=true;
  applyFont();
}
async function saveS(k,v){S[k]=String(v);await post("/api/settings",{[k]:String(v)})}

/* ---------- 데이터 ---------- */
function prep(n){
  n._d=fmt(new Date(n.updated_on));
  n._t=`${n.subject} #${n.issue_id} ${n.issue_id}`.toLowerCase();       // 제목 · 번호 검색용
  n._pg=pgBy.get(n.issue_id)||[];                      // 진행 기록: 날짜 내림차순
  n._h=[n.subject,n.description,n.requirement,n.action,n.code_change,n.reason,...n._pg.map(p=>p.text),...n.journals.map(j=>j.notes)].join("\n").toLowerCase();
}
async function loadProgress(){
  const rows=await api("/api/progress");pgBy=new Map();
  rows.forEach(r=>{if(!pgBy.has(r.issue_id))pgBy.set(r.issue_id,[]);pgBy.get(r.issue_id).push(r)});
  pgBy.forEach(a=>a.sort((x,y)=>y.day.localeCompare(x.day)||x.id-y.id));    // 새 날짜가 위, 같은 날은 쓴 순서
}
const prepTerm=t=>{t._k=[t.term,...(t.aliases||"").split(",")].map(s=>s.trim().toLowerCase()).filter(Boolean)};
async function loadAll(){
  [all,links,terms,skipped,codeNotes,todos]=await Promise.all([api("/api/notes"),api("/api/links"),api("/api/terms"),api("/api/skipped"),api("/api/codenotes"),api("/api/todos"),loadProgress()]);
  trLoad(true);     // 트러블슈팅(코드 이력의 관련 목록용). 기다리지 않는다
  buildTodoMap();
  all.forEach(prep);terms.forEach(prepTerm);buildTokens();renderAll();
}
const has=(n,t)=>t._k.some(k=>n._h.includes(k));
const qmatch=(n,q)=>!q||(ui.qscope==="all"?n._h.includes(q):n._t.includes(q));   // 검색: 기본은 제목·번호, '내용 포함'이면 본문·댓글·내 기록까지
/* 용어는 여러 개를 선택할 수 있고, 선택한 용어를 모두 포함한 노트만 찾는다(교집합). */
const selTerms=()=>sel.map(id=>terms.find(t=>t.id===id)).filter(Boolean);
const hasSel=n=>{const ts=selTerms();return !ts.length||(selMode==="or"?ts.some(t=>has(n,t)):ts.every(t=>has(n,t)))};   // 모두 포함(AND) / 하나라도(OR)
const selSym=()=>selMode==="or"?" ∪ ":" ∩ ";
const rolesOf=n=>n.roles.split(",");
function pool(useTerm=true,useDate=true){
  const q=$("#q").value.trim().toLowerCase(),[f0,t0]=rangeOf("note"),f=q?"":f0,t=q?"":t0;   // 검색 중에는 기간을 적용하지 않는다 (기간 때문에 결과가 비는 것을 막는다)
  // 최근 변경 / 즐겨찾기 / 오래 대기 칩이 켜져 있으면 기간과 무관하게 그 조건만 본다 (여러 개면 모두 만족)
  if(onlyFresh||starOnly||staleOnly||needOnly)return all.filter(n=>(!onlyFresh||fresh[n.issue_id])&&(!starOnly||n.starred)&&(!staleOnly||isStale(n))&&(!needOnly||needsRec(n))&&qmatch(n,q));
  return all.filter(n=>(!(useTerm&&sel.length)||hasSel(n))&&(!useDate||((!f||n._d>=f)&&(!t||n._d<=t)))&&qmatch(n,q));
}
const byRole=(l,r)=>r==="전체"?l:l.filter(n=>rolesOf(n).includes(r));
const byStat=(l,s)=>s==="전체"?l:s==="현안"?l.filter(n=>{const x=stOf(n);return x==="대기"||x==="진행"}):l.filter(n=>stOf(n)===s);
const byCat=(l,c)=>c==="전체"?l:l.filter(n=>catOf(n)===c);
const visible=()=>$("#q").value.trim()?pool():byCat(byStat(byRole(pool(),role),st),cat);   // 검색 중에는 기간·역할·상태·구분과 상관없이 전체에서 찾는다

/* 내가 직접 쓴 것 / 내가 레드마인에 단 댓글 */
const reqEdited=n=>{const r=n.requirement.trim(),d=(n.description||"").trim();return !!r&&r!==d&&r!==d.slice(0,500)+"..."};   // 요건이 본문 그대로가 아니면 직접 고친 것
const isMine=n=>!!(reqEdited(n)||n.action.trim()||n.code_change.trim()||n.reason.trim()||(n._pg&&n._pg.length));
/* 기록 모드: 기본은 '기록 불필요'. 뭔가 써서 저장하면 '기록'으로 바뀌고, '기록' 모드인데 내용이 비어 있을 때만 '기록 필요'로 보인다. */
const needsRec=n=>n.rec_mode==="record"&&!isMine(n);
const myComments=n=>n.journals.filter(j=>j.user&&cfg.meId&&j.user.id===cfg.meId);

/* ---------- 기간: 화면마다 따로 (수정일 기준) ----------
   - 노트 목록 : 현안 모드는 '전체 기간', 전체 모드는 '최근 7일'이 기본 (전체는 목록이 너무 길어지므로)
   - 그래프    : 기본 '최근 30일' (부하 방지) + 최신순 N건
   - 요약      : 기본 '이번주'
   - 레드마인 가져오기 기간은 위쪽 '가져오기'에서 따로 고른다 (화면에 보이는 기간과 무관) */
const PRESETS=[["7d","최근 7일"],["30d","최근 30일"],["90d","최근 3개월"],["365d","최근 1년"],["week","이번주"],["lastweek","지난주"],["month","이번달"],["lastmonth","지난달"],["today","오늘"],["all","전체 기간"],["custom","직접 지정"]];
function presetDates(k){
  const t=new Date(),d=t.getDay()||7;let a=new Date(t),b=new Date(t);
  if(k==="all")return["",""];
  if(k==="week")a.setDate(t.getDate()-d+1);
  else if(k==="lastweek"){a.setDate(t.getDate()-d-6);b.setDate(t.getDate()-d)}
  else if(k==="month")a=new Date(t.getFullYear(),t.getMonth(),1);
  else if(k==="lastmonth"){a=new Date(t.getFullYear(),t.getMonth()-1,1);b=new Date(t.getFullYear(),t.getMonth(),0)}
  else if(k==="7d")a.setDate(t.getDate()-6);
  else if(k==="30d")a.setDate(t.getDate()-29);
  else if(k==="90d")a.setDate(t.getDate()-89);
  else if(k==="365d")a.setDate(t.getDate()-364);
  return[fmt(a),fmt(b)];
}
const ranges={note:{k:"all",from:"",to:""},graph:{k:"30d",from:"",to:""},summary:{k:"week",from:"",to:""}};
const rangeOf=v=>{const r=ranges[v];return r.k==="custom"?[r.from,r.to]:presetDates(r.k)};
const rangeText=v=>{if(ranges[v].k==="all")return"전체 기간";const [f,t]=rangeOf(v);return `${f||"처음"} ~ ${t||"오늘"}`};
const V2SUM=[["week","이번 주"],["lastweek","지난주"],["month","이번 달"],["lastmonth","지난달"],["custom","직접"]];   // 새 디자인의 요약 기간: 자주 쓰는 것만
function rangeCtl(v,idp){
  const r=ranges[v],[f,t]=rangeOf(v);
  if(V2()&&v==="summary")return `<div class="seg" id="${idp}S">${V2SUM.map(([k,l])=>`<button type="button" data-rk="${k}" class="${k===r.k?"on":""}">${l}</button>`).join("")}</div>`
    +(r.k==="custom"?`<input type="date" id="${idp}F" value="${r.from}"><span class="meta">~</span><input type="date" id="${idp}T" value="${r.to}">`:`<span class="meta">${f} ~ ${t}</span>`);
  return `<select id="${idp}K" title="기간 (수정일 기준)">${PRESETS.map(([k,l])=>`<option value="${k}" ${k===r.k?"selected":""}>${l}</option>`).join("")}</select>`
    +(r.k==="custom"?`<input type="date" id="${idp}F" value="${r.from}"><span class="meta">~</span><input type="date" id="${idp}T" value="${r.to}">`:(r.k!=="all"?`<span class="meta">${f} ~ ${t}</span>`:""));
}
function wireRangeCtl(v,idp,after){
  document.querySelectorAll(`#${idp}S [data-rk]`).forEach(b=>b.onclick=()=>{   // 새 디자인의 요약 기간 버튼
    const kk=b.dataset.rk;
    if(kk==="custom"){const [f,t]=rangeOf(v);ranges[v]={k:"custom",from:f||fmt(new Date()),to:t||fmt(new Date())}}else ranges[v]={k:kk,from:"",to:""};
    after()});
  const k=$("#"+idp+"K");
  if(!k){const f=$("#"+idp+"F"),t=$("#"+idp+"T");if(f)f.onchange=()=>{ranges[v].from=f.value;after()};if(t)t.onchange=()=>{ranges[v].to=t.value;after()};return}
  k.onchange=()=>{
    if(k.value==="custom"){const [f,t]=rangeOf(v);ranges[v]={k:"custom",from:f||fmt(new Date()),to:t||fmt(new Date())}}
    else ranges[v]={k:k.value,from:"",to:""};
    after();
  };
  const f=$("#"+idp+"F"),t=$("#"+idp+"T");
  if(f)f.onchange=()=>{ranges[v].from=f.value;after()};
  if(t)t.onchange=()=>{ranges[v].to=t.value;after()};
}
/* 레드마인 가져오기 기간 (위쪽 '가져오기') */
const syncDates=()=>{const k=$("#syncRange").value;return k==="custom"?[$("#from").value,$("#to").value]:presetDates(k)};
$("#syncRange").onchange=()=>{
  const c=$("#syncRange").value==="custom";$("#syncDates").style.display=c?"":"none";
  if(c&&!$("#from").value){const [f,t]=presetDates("30d");$("#from").value=f;$("#to").value=t}
};
function renderLastSync(){
  let i=null;try{i=JSON.parse(S.last_sync||"null")}catch(e){}
  const el=$("#lastsync");
  if(!i){el.textContent="아직 가져온 적이 없어요";return}
  const ast=autoSync.st&&autoSync.st.enabled?autoSync.st:null;      // 자동 가져오기가 켜져 있으면 간격 (마우스를 올리면 기간 · 시간대 · 다음 예정 시각)
  el.innerHTML=`${esc(i.at.slice(5))} 가져옴 · ${i.found}건${i.added?` · 신규 ${i.added}`:""}${i.failed?` · <a href="#" id="syncbad" class="bad">확인 필요 ${i.failed}</a>`:""}${i.skipped?` · <a href="#" id="syncskip">건너뜀 ${i.skipped}</a>`:""}${ast?` · <span title="${esc(autoSyncTip(ast))}">자동 ${ast.minutes}분</span>`:""}`;
  if($("#syncbad"))$("#syncbad").onclick=e=>{e.preventDefault();showSyncReport()};
  if($("#syncskip"))$("#syncskip").onclick=e=>{e.preventDefault();showSyncReport()};
}
/* 가져오기 결과 보고서: 실패한 일감과 이유, 해야 할 일을 한국어로 보여 준다 */
const KIND_LABEL={key:"API 키",forbidden:"권한 없음",gone:"삭제됨",busy:"요청 제한",server:"서버 오류",http:"응답 오류",timeout:"시간 초과",network:"연결 불가",locked:"저장소 사용 중",data:"형식 오류",other:"기타"};
function showSyncReport(){
  let i=null;try{i=JSON.parse(S.last_sync||"null")}catch(e){}
  if(!i)return;
  const bad=i.failures||[],skip=i.skipped_list||[];
  const rows=(l,ok)=>l.map(f=>`<div class="reportrow"><div><span class="rk ${ok?"ok":"bad"}">${esc(KIND_LABEL[f.kind]||"기타")}</span><div class="meta"><a href="#" data-ext="${f.id}">#${f.id}</a></div></div>
      <div><div class="why">${esc(f.subject||"(제목 정보 없음)")}</div><div>${esc(f.reason)}</div><div class="hint">→ ${esc(f.hint)}</div></div></div>`).join("");
  const grp=bad.reduce((m,f)=>(m[f.kind]=(m[f.kind]||0)+1,m),{});
  $("#modal").innerHTML=`<div class="mbox"><div class="mhead"><h3>가져오기 결과 · ${esc(i.at)}</h3><button class="icon" id="mclose">✕</button></div>
    <div class="msec"><div class="desc">${esc(i.from)} ~ ${esc(i.to)} · ${i.found}건 확인 (신규 ${i.added||0}, 변경 ${i.changed||0})${i.aborted?` · <b style="color:#d92d20">연결이 불안정해 중간에 멈췄어요 (${esc(i.aborted)}). 잠시 뒤 다시 가져오면 이어서 받습니다</b>`:""}</div>
      ${bad.length?`<h4>확인이 필요한 ${i.failed}건 <span class="meta">${Object.entries(grp).map(([k,n])=>`${esc(KIND_LABEL[k]||k)} ${n}`).join(" · ")}</span></h4>${rows(bad,false)}${i.failed>bad.length?`<div class="meta">…외 ${i.failed-bad.length}건</div>`:""}`:`<h4>확인이 필요한 일감이 없어요 ✓</h4>`}</div>
    ${skip.length?`<div class="msec"><h4>건너뜀 ${i.skipped}건 <span class="meta">권한이 없거나 삭제된 일감이라 정상적으로 건너뛴 것입니다</span></h4>${rows(skip,true)}</div>`:""}</div>`;
  $("#modal").classList.add("show");
  $("#mclose").onclick=closeSettings;
  document.querySelectorAll("#modal [data-ext]").forEach(a=>a.onclick=e=>{e.preventDefault();openExternal(`${cfg.url}/issues/${a.dataset.ext}`)});
}
$("#q").oninput=()=>{
  const q=$("#q").value.trim();
  if(rmOn){if(nav!=="today"&&nav!=="history")setNav("history",{keepQ:true});else renderHead();rmSoon();return}
  if(q&&nav!=="history"&&nav!=="summary")setNav("history",{keepQ:true});else renderAll();     // 검색 결과는 '이력'에서 보여 준다
};
$("#qclr").onclick=()=>{$("#q").value="";renderAll();$("#q").focus()};
$("#q").onkeydown=e=>{   // 엔터: 맨 위 결과를 열고 검색창을 비운다 (한글 입력 확정용 엔터는 무시)
  if(e.key==="Escape"){if($("#q").value){$("#q").value="";renderAll()}return}
  if(e.key!=="Enter"||e.isComposing||e.keyCode===229)return;
  e.preventDefault();
  if(rmOn){rmRun(false);return}                      // 레드마인 전체 검색에서는 엔터 = 바로 검색
  const first=document.querySelector("#list .nrow"),id=first&&+first.dataset.id;
  $("#q").value="";
  if(id)openNote(id);else renderAll();
};
document.addEventListener("keydown",e=>{   // / 를 누르면 검색창으로
  if(e.key==="/"&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!isTyping()&&$("#listhead").style.display!=="none"){e.preventDefault();$("#q").focus()}
});

