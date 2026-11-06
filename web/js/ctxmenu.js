/* ---------- 우클릭 메뉴: 브라우저(크롬/엣지) 기본 메뉴 대신 앱 메뉴 ----------
   그 자리에서 쓸 만한 항목만 보여 주고(글 칸 · 고른 글 · 링크 · 사진 · 일감 줄), 앱에 맞지 않는 항목(뒤로 · 인쇄 · 검사 …)은 없다.
   보일 항목은 설정 → 화면 구성 → 우클릭 메뉴에서 고른다(ui.ctxOff). '브라우저 기본 메뉴'를 켜면 예전처럼(ui.ctxNative).
   Shift+우클릭은 언제나 브라우저 기본 메뉴. 다른 화면이 자기 메뉴를 띄운 곳(탭 등)은 건드리지 않는다. */
const ctxEditable=t=>{const e=t.closest&&t.closest('input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=file]):not([type=range]):not([type=color]),textarea,[contenteditable=""],[contenteditable=true]');return e&&!e.disabled&&!e.readOnly?e:null};
const ctxSel=()=>{const a=document.activeElement;if(a&&(a.tagName==="INPUT"||a.tagName==="TEXTAREA")&&typeof a.selectionStart==="number")return a.value.slice(a.selectionStart,a.selectionEnd);return String(getSelection()||"")};
const CTX_ITEMS=[      // [키, 이름, 묶음, 보일 때(c), 할 일(c)]
  ["undo","실행 취소","edit",c=>!!c.edit,()=>document.execCommand("undo")],
  ["cut","잘라내기","edit",c=>c.edit&&c.sel,()=>document.execCommand("cut")],
  ["copy","복사","edit",c=>!!c.sel,c=>{if(!document.execCommand("copy"))copyText(c.sel,"복사했어요")}],
  ["paste","붙여넣기","edit",c=>!!c.edit,async c=>{
    try{const t=await navigator.clipboard.readText();c.edit.focus();if(!document.execCommand("insertText",false,t))throw 0}
    catch(e){c.edit.focus();toast("이 PC의 보안 설정 때문에 메뉴로 붙여넣지 못했어요 — Ctrl+V 로 붙여넣어 주세요",4000)}}],
  ["selectAll","모두 선택","edit",c=>!!c.edit,c=>{c.edit.focus();if(c.edit.select)c.edit.select();else document.execCommand("selectAll")}],
  ["find","노트에서 찾기","sel",c=>c.sel&&!c.edit&&c.sel.trim().length<=60,c=>{const q=$("#q");if(!q)return;q.value=c.sel.trim();q.dispatchEvent(new Event("input",{bubbles:true}));q.focus()}],
  ["noteTab","새 탭에서 열기","note",c=>!!c.note,c=>openNote(c.note,{bg:true})],
  ["noteCopy","#번호 제목 복사","note",c=>!!c.note,c=>{const n=all.find(x=>x.issue_id===c.note);copyText(n?`#${n.issue_id} ${n.subject}`:`#${c.note}`,"복사했어요")}],
  ["noteRm","레드마인에서 열기 ↗","note",c=>!!c.note&&!!cfg.url,c=>openExternal(`${cfg.url}/issues/${c.note}`)],
  ["linkOpen","기본 브라우저로 열기 ↗","link",c=>c.link&&/^https?:/.test(c.link)&&!c.linkLocal,c=>openExternal(c.link)],
  ["linkCopy","링크 주소 복사","link",c=>!!c.link&&!c.linkLocal,c=>copyText(c.link,"링크 주소를 복사했어요")],
  ["fileSave","파일 저장","link",c=>!!c.dl,c=>dlSave(c.dl.href,c.dl.getAttribute("download")||"")],
  ["imgSave","사진 저장","img",c=>!!c.img,c=>dlSave(c.img.src,c.imgName)],
  ["imgCopy","사진 복사","img",c=>!!c.img,async c=>{
    try{const b=await (await fetch(c.img.src)).blob();const png=b.type==="image/png"?b:await new Promise(res=>{const cv=document.createElement("canvas");cv.width=c.img.naturalWidth;cv.height=c.img.naturalHeight;cv.getContext("2d").drawImage(c.img,0,0);cv.toBlob(res,"image/png")});
      await navigator.clipboard.write([new ClipboardItem({"image/png":png})]);toast("사진을 복사했어요",2000)}catch(e){toast("사진을 복사하지 못했어요",3000)}}],
  ["downloads","다운로드 목록","app",()=>true,()=>dlOpen()],
  ["reload","새로 고침","app",()=>true,()=>{try{flushEdits()}catch(e){}location.reload()}],
];
const CTX_GROUPS={edit:"글 칸",sel:"고른 글",note:"일감",link:"링크 · 파일",img:"사진",app:"앱"};
/* 메뉴 키: 메뉴가 떠 있을 때 글자 하나로 바로 고른다 (Slack 처럼, 오른쪽에 보인다). 한 메뉴 안에서 겹치지 않는다 */
const CTX_ACCEL={undo:"Z",cut:"X",copy:"C",paste:"V",selectAll:"A",find:"F",noteTab:"T",noteCopy:"N",noteRm:"B",
  linkOpen:"O",linkCopy:"L",fileSave:"S",imgSave:"I",imgCopy:"M",downloads:"J",reload:"R"};
/* 기본 단축키: 원래부터 있는 키(브라우저 편집 키 · 앱 단축키). 메뉴와 설정 표에 보여 주고, 지정한 단축키가 없으면 이것이 그 항목의 단축키 */
const CTX_DEFKEY={undo:"Ctrl+Z",cut:"Ctrl+X",copy:"Ctrl+C",paste:"Ctrl+V",selectAll:"Ctrl+A",downloads:"Ctrl+J",reload:"F5"};
const ctxOn=k=>!(ui.ctxOff||[]).includes(k);
/* ---------- 바로 실행 단축키 (설정 → 화면 구성 → 우클릭 메뉴): 메뉴 없이 그 항목을 실행한다 (ui.ctxKeys = {항목: "Ctrl+Shift+D"}) ---------- */
const KEY_NAME={ArrowLeft:"Left",ArrowRight:"Right",ArrowUp:"Up",ArrowDown:"Down",Escape:"Esc",Delete:"Delete",Backspace:"Backspace",Enter:"Enter",Tab:"Tab",Space:"Space",
  PageUp:"PageUp",PageDown:"PageDown",Home:"Home",End:"End",Insert:"Insert",Minus:"-",Equal:"=",Comma:",",Period:".",Slash:"/",Semicolon:";",Quote:"'",BracketLeft:"[",BracketRight:"]",Backslash:"\\",Backquote:"`"};
function keyCombo(e){      // 눌린 키 → "Ctrl+Alt+Shift+K" (자판 배열 · 한/영 상태와 상관없이 e.code 로)
  const c=e.code||"";let k=/^Key[A-Z]$/.test(c)?c.slice(3):/^Digit\d$/.test(c)?c.slice(5):/^Numpad\d$/.test(c)?c.slice(6):/^F\d{1,2}$/.test(c)?c:KEY_NAME[c]||"";
  if(!k)return "";
  return [e.ctrlKey||e.metaKey?"Ctrl":"",e.altKey?"Alt":"",e.shiftKey?"Shift":"",k].filter(Boolean).join("+");
}
/* 앱이 이미 쓰는 단축키 (겹치면 안 된다) */
const APP_KEYS=Object.assign({
  "Ctrl+S":"지금 편집 중인 것 저장","Ctrl+Q":"프로그램 종료","Ctrl+J":"다운로드 목록","Ctrl+W":"탭 닫기","Ctrl+F4":"탭 닫기","Alt+W":"탭 닫기",
  "Ctrl+Tab":"다음 탭","Ctrl+Shift+Tab":"이전 탭","Ctrl+PageUp":"이전 탭","Ctrl+PageDown":"다음 탭","Alt+PageUp":"이전 탭","Alt+PageDown":"다음 탭",
  "Ctrl+N":"새 포스트잇","Alt+N":"새 포스트잇","Alt+R":"메모 배치(랜덤)","Alt+S":"메모 배치(스프레드)","Alt+D":"메모 배치(스프레드)","Alt+T":"메모 배치(정렬)",
  "Alt+Left":"뒤로","Alt+Right":"앞으로","Ctrl+Enter":"올리기 · 저장","Ctrl+0":"화면 배율 100%","Ctrl+=":"화면 확대","Ctrl+-":"화면 축소",
  "Ctrl+Z":"되돌리기(글 쓸 때)","Ctrl+Y":"다시 하기(글 쓸 때)","Ctrl+Shift+Z":"다시 하기(글 쓸 때)","Ctrl+X":"잘라내기(글 쓸 때)","Ctrl+C":"복사(글 쓸 때)",
  "Ctrl+V":"붙여넣기(글 쓸 때)","Ctrl+A":"모두 선택(글 쓸 때)","Ctrl+B":"굵게(편집기)","Ctrl+I":"기울임(편집기)","Ctrl+U":"밑줄(편집기)",
  "F5":"새로 고침","Ctrl+R":"새로 고침","Ctrl+Shift+H":"위키 형광펜","Ctrl+Shift+.":"위키 글자 크게","Ctrl+Shift+,":"위키 글자 작게",
  "F12":"개발자 도구(막아 둠)","Ctrl+Shift+I":"개발자 도구(막아 둠)","Ctrl+Shift+J":"개발자 도구(막아 둠)","Ctrl+Shift+C":"개발자 도구(막아 둠)"},
  Object.fromEntries([1,2,3,4,5,6,7,8,9].map(n=>[`Ctrl+${n}`,"탭 이동"])),Object.fromEntries([1,2,3,4,5,6,7,8].map(n=>[`Alt+${n}`,"노트 안 이동"])));
/* 윈도우 · 입력기 · 브라우저가 먼저 가져가서 앱에 오지 않거나, 앱이 막아도 원래 동작이 같이 일어나는 키 (주의 문구) */
const RESERVED_KEYS={
  "Alt+F4":"윈도우: 창이 닫혀요","Alt+Tab":"윈도우: 창 전환","Alt+Shift+Tab":"윈도우: 창 전환","Alt+Esc":"윈도우: 창 전환","Ctrl+Esc":"윈도우: 시작 메뉴",
  "Ctrl+Shift+Esc":"윈도우: 작업 관리자","Ctrl+Alt+Delete":"윈도우: 보안 화면","Alt+Space":"윈도우: 창 메뉴(최소화 · 최대화)","Ctrl+Alt+Tab":"윈도우: 창 전환",
  "Ctrl+Space":"입력기: 한/영 · 한자 전환으로 쓰는 PC가 있어요","Shift+Space":"입력기: 한/영 전환으로 쓰는 PC가 있어요","Alt+Shift":"입력기: 자판 전환",
  "Ctrl+Alt+Up":"그래픽 드라이버: 화면 회전","Ctrl+Alt+Down":"그래픽 드라이버: 화면 회전","Ctrl+Alt+Left":"그래픽 드라이버: 화면 회전","Ctrl+Alt+Right":"그래픽 드라이버: 화면 회전",
  "F10":"창 메뉴로 포커스가 옮겨 가요","F11":"브라우저: 전체 화면","Ctrl+T":"브라우저: 새 탭(새 창이 열려요)","Ctrl+Shift+T":"브라우저: 닫은 탭 다시 열기","Ctrl+Shift+N":"브라우저: 시크릿 창",
  "Ctrl+Shift+W":"브라우저: 창 닫기","Ctrl+Shift+Q":"브라우저: 종료","Ctrl+Shift+Delete":"브라우저: 인터넷 사용 기록 삭제","Ctrl+Shift+B":"브라우저: 북마크 바",
  "Ctrl+Shift+O":"브라우저: 북마크 관리자","Ctrl+H":"브라우저: 방문 기록","Ctrl+Shift+M":"브라우저: 프로필 전환"};
const ctxKeyOf=k=>((ui.ctxKeys||{})[k]||"");
const ctxKeyShown=k=>ctxKeyOf(k)||CTX_DEFKEY[k]||"";      // 화면에 보일 단축키: 지정한 것, 없으면 기본
/* 단축키를 쓸 수 있는지: {block: 이유}(쓸 수 없음) · {warn: 이유}(써도 되지만 안 될 수 있음) · {}(괜찮음) */
function ctxKeyCheck(combo,self){
  if(!combo)return {block:"키를 알아보지 못했어요"};
  const parts=combo.split("+"),key=parts[parts.length-1],mods=parts.slice(0,-1);
  if(!/^F\d{1,2}$/.test(key)&&!mods.some(m=>m==="Ctrl"||m==="Alt"))return {block:"글을 쓸 때와 겹치지 않게 Ctrl 이나 Alt 를 함께 누르거나, F1 ~ F12 를 써 주세요"};
  if(["Esc","Tab","Enter","Backspace","Delete"].includes(key)&&mods.length===0)return {block:"이 키는 단축키로 쓸 수 없어요"};
  const other=CTX_ITEMS.find(([k])=>k!==self&&ctxKeyOf(k)===combo);
  if(other)return {block:`‘${other[1]}’ 에 이미 쓰고 있어요`};
  if(APP_KEYS[combo])return {block:`앱이 이미 쓰는 단축키예요 (${APP_KEYS[combo]})`};
  if(RESERVED_KEYS[combo])return {warn:`${RESERVED_KEYS[combo]} — 이 PC에서 앱까지 오지 않거나 원래 동작이 같이 일어날 수 있어요`};
  if(mods.includes("Ctrl")&&mods.includes("Alt"))return {warn:"Ctrl+Alt 조합은 일부 PC에서 다른 프로그램 · 그래픽 드라이버 · 자판(AltGr)이 먼저 쓸 수 있어요"};
  return {};
}
let ctxLastPt=null,ctxRec=false;
addEventListener("mousemove",e=>{ctxLastPt=[e.clientX,e.clientY]},{passive:true});
function ctxContext(t){      // 그 자리(우클릭한 곳 · 단축키는 마우스가 있는 곳과 지금 포커스)에서 쓸 수 있는 것
  const a=t.closest&&t.closest("a[href]"),img=t.closest&&t.closest("img"),row=t.closest&&t.closest("[data-id],[data-open]");
  let link="",local=false;if(a){try{const u=new URL(a.href,location.href);link=u.href;local=u.origin===location.origin}catch(_){}}
  const c={t,edit:ctxEditable(t),sel:ctxSel(),link,linkLocal:local,dl:a&&isDlLink(a)?a:null,
    img:img&&img.complete&&img.naturalWidth?img:null,imgName:img?(img.getAttribute("alt")||decodeURIComponent((img.src.split("name=")[1]||"").split("&")[0])||"image.png"):"",
    note:row?+(row.dataset.id||row.dataset.open)||0:0};
  if(c.note&&!all.some(x=>x.issue_id===c.note))c.note=0;
  return c;
}
document.addEventListener("contextmenu",e=>{
  if(e.defaultPrevented||e.shiftKey||ui.ctxNative)return;      // 자기 메뉴를 띄운 곳 · Shift+우클릭 · 브라우저 기본 메뉴를 고른 경우
  e.preventDefault();
  const c=ctxContext(e.target);
  const items=CTX_ITEMS.filter(([k,,,when])=>ctxOn(k)&&when(c));
  if(!items.length)return;      // 쓸 항목이 없으면 메뉴 없이 (브라우저 메뉴도 막은 채)
  ctxShow(e.clientX,e.clientY,items,c);
});
/* 바로 실행 단축키: 메뉴 없이. 글 칸 항목은 지금 포커스, 링크 · 사진 · 일감은 마우스가 있는 곳(없으면 지금 연 노트) */
addEventListener("keydown",e=>{
  if(ctxRec||e.repeat||!ui.ctxKeys||$(".ctxmenu")||$("#wdlg.show"))return;
  const combo=keyCombo(e);if(!combo)return;
  const it=CTX_ITEMS.find(([k])=>ctxKeyOf(k)===combo);if(!it)return;
  e.preventDefault();e.stopPropagation();
  const hover=ctxLastPt&&document.elementFromPoint(ctxLastPt[0],ctxLastPt[1]),ae=document.activeElement;
  const c=ctxContext(hover||document.body);
  const ed=ae&&ae!==document.body?ctxEditable(ae):null;if(ed)c.edit=ed;else if(!(hover&&ctxEditable(hover)))c.edit=null;
  if(!c.note&&view==="note"&&cur)c.note=cur;
  if(!it[3](c)){toast(`지금은 ‘${it[1]}’ 을(를) 쓸 수 없어요`,2200);return}
  it[4](c);
},true);
function ctxShow(x,y,items,c){
  document.querySelectorAll(".popmenu").forEach(m=>m.remove());
  const m=document.createElement("div");m.className="popmenu ctxmenu";m.setAttribute("role","menu");
  let g="";m.innerHTML=items.map(([k,l,grp],i)=>{const sep=g&&g!==grp?'<div class="ctxsep"></div>':"";g=grp;
    const hk=ctxKeyShown(k);return `${sep}<button type="button" role="menuitem" data-ci="${i}" title="${esc(l)}${hk?` · 단축키 ${hk}`:""} · 메뉴 키 ${esc(CTX_ACCEL[k]||"")}"><span class="cl">${esc(l)}</span>${hk?`<span class="chk2">${esc(hk)}</span>`:""}<kbd class="ck">${esc(CTX_ACCEL[k]||"")}</kbd></button>`}).join("");
  document.body.appendChild(m);
  m.style.left=Math.max(6,Math.min(innerWidth-m.offsetWidth-6,x))+"px";m.style.top=Math.max(6,Math.min(innerHeight-m.offsetHeight-6,y))+"px";
  const btns=[...m.querySelectorAll("[data-ci]")];let at=-1;
  const mark=i=>{at=(i+btns.length)%btns.length;btns.forEach((b,j)=>b.classList.toggle("on",j===at))};
  const run=i=>{close();items[i][4](c)};
  const close=()=>{m.remove();document.removeEventListener("mousedown",out,true);removeEventListener("keydown",key,true);removeEventListener("blur",close)};
  const out=ev=>{if(!m.contains(ev.target))close()};
  const key=ev=>{      // 메뉴가 떠 있을 때만: 글자 = 그 항목 · ↑↓ = 고르기 · Enter = 실행 · Esc = 닫기
    if(ev.isComposing)return;
    if(ev.key==="Escape"){ev.preventDefault();ev.stopPropagation();close();return}
    if(ev.key==="ArrowDown"||ev.key==="ArrowUp"){ev.preventDefault();ev.stopPropagation();mark(at+(ev.key==="ArrowDown"?1:-1));return}
    if(ev.key==="Enter"&&at>=0){ev.preventDefault();ev.stopPropagation();run(at);return}
    if(ev.ctrlKey||ev.altKey||ev.metaKey)return;
    const L=/^Key[A-Z]$/.test(ev.code||"")?ev.code.slice(3):"";if(!L)return;
    const i=items.findIndex(([k])=>CTX_ACCEL[k]===L);
    ev.preventDefault();ev.stopPropagation();      // 메뉴가 떠 있는 동안 글자는 글 칸에 들어가지 않는다
    if(i>=0)run(i);
  };
  btns.forEach(b=>{b.onmousedown=ev=>ev.preventDefault();   // 누를 때 글 칸의 선택 · 포커스를 잃지 않게
    b.onclick=()=>run(+b.dataset.ci);b.onmouseenter=()=>mark(+b.dataset.ci)});
  setTimeout(()=>{document.addEventListener("mousedown",out,true);addEventListener("keydown",key,true);addEventListener("blur",close)},0);
}
/* 설정에서 단축키 지정: 다음에 누르는 키 조합을 받는다 (Esc = 취소 · Backspace/Delete = 지우기). 겹치면 막고, 윈도우 · 브라우저가 쓰는 키면 주의를 보여 주고 물어본다.
   윈도우가 가져가는 키(Ctrl+Alt+Delete · Win 키 조합 등)는 눌러도 앱에 오지 않아 여기서 받을 수 없다 — 그래서 아무 일도 안 일어나면 그 키는 쓸 수 없는 것 */
function ctxRecord(k,btn){
  if(ctxRec)return;ctxRec=true;btn.classList.add("rec");btn.textContent="키를 누르세요… (Esc 취소)";
  const label=(CTX_ITEMS.find(x=>x[0]===k)||[])[1]||k;
  const hint=setTimeout(()=>{if(ctxRec)btn.textContent="키를 누르세요… (안 잡히면 윈도우가 쓰는 키예요 · Esc 취소)"},4000);
  const done=()=>{ctxRec=false;clearTimeout(hint);removeEventListener("keydown",on,true);renderSettings()};
  const save=v=>{const m=Object.assign({},ui.ctxKeys);if(v)m[k]=v;else delete m[k];ui.ctxKeys=m;saveUI()};
  const on=async e=>{
    if(["Control","Alt","Shift","Meta","HangulMode","HanjaMode","Process"].includes(e.key)||e.isComposing)return;   // 조합 키만 누른 동안은 기다린다
    e.preventDefault();e.stopPropagation();
    if(e.key==="Escape"&&!e.ctrlKey&&!e.altKey&&!e.shiftKey){done();return}
    if((e.key==="Backspace"||e.key==="Delete")&&!e.ctrlKey&&!e.altKey&&!e.shiftKey){save("");toast(`‘${label}’ 단축키를 지웠어요`,2000);done();return}
    const combo=keyCombo(e),chk=ctxKeyCheck(combo,k);
    if(chk.block){toast(`${combo||"이 키"}: ${chk.block}`,4500);return}      // 다른 키를 다시 누를 수 있게 기다린다
    removeEventListener("keydown",on,true);
    if(chk.warn&&!await wdlg({title:`⚠ ${esc(combo)} 은(는) 잘 안 될 수 있어요`,ok:"그래도 쓰기",cancel:"다른 키 고르기",focusNo:true,
      body:`${esc(chk.warn)}.<br><span class="meta">지정한 뒤 눌러 봐서 ‘${esc(label)}’ 이(가) 실행되지 않으면 다른 키로 바꿔 주세요.</span>`})){ctxRec=false;clearTimeout(hint);ctxRecord(k,btn);return}
    save(combo);toast(`‘${label}’ 바로 실행: ${combo}`,2500);done();
  };
  addEventListener("keydown",on,true);
}

