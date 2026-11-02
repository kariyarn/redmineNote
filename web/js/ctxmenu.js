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
const ctxOn=k=>!(ui.ctxOff||[]).includes(k);
document.addEventListener("contextmenu",e=>{
  if(e.defaultPrevented||e.shiftKey||ui.ctxNative)return;      // 자기 메뉴를 띄운 곳 · Shift+우클릭 · 브라우저 기본 메뉴를 고른 경우
  e.preventDefault();
  const t=e.target,a=t.closest&&t.closest("a[href]"),img=t.closest&&t.closest("img"),row=t.closest&&t.closest("[data-id],[data-open]");
  let link="",local=false;if(a){try{const u=new URL(a.href,location.href);link=u.href;local=u.origin===location.origin}catch(_){}}
  const c={t,edit:ctxEditable(t),sel:ctxSel(),link,linkLocal:local,dl:a&&isDlLink(a)?a:null,
    img:img&&img.complete&&img.naturalWidth?img:null,imgName:img?(img.getAttribute("alt")||decodeURIComponent((img.src.split("name=")[1]||"").split("&")[0])||"image.png"):"",
    note:row?+(row.dataset.id||row.dataset.open)||0:0};
  if(c.note&&!all.some(x=>x.issue_id===c.note))c.note=0;
  const items=CTX_ITEMS.filter(([k,,,when])=>ctxOn(k)&&when(c));
  if(!items.length)return;      // 쓸 항목이 없으면 메뉴 없이 (브라우저 메뉴도 막은 채)
  ctxShow(e.clientX,e.clientY,items,c);
});
function ctxShow(x,y,items,c){
  document.querySelectorAll(".popmenu").forEach(m=>m.remove());
  const m=document.createElement("div");m.className="popmenu ctxmenu";m.setAttribute("role","menu");
  let g="";m.innerHTML=items.map(([k,l,grp],i)=>{const sep=g&&g!==grp?'<div class="ctxsep"></div>':"";g=grp;return `${sep}<button type="button" role="menuitem" data-ci="${i}">${esc(l)}</button>`}).join("");
  document.body.appendChild(m);
  m.style.left=Math.max(6,Math.min(innerWidth-m.offsetWidth-6,x))+"px";m.style.top=Math.max(6,Math.min(innerHeight-m.offsetHeight-6,y))+"px";
  const close=()=>{m.remove();document.removeEventListener("mousedown",out,true);document.removeEventListener("keydown",key,true);removeEventListener("blur",close)};
  const out=ev=>{if(!m.contains(ev.target))close()};
  const key=ev=>{if(ev.key==="Escape"){ev.preventDefault();close()}};
  m.querySelectorAll("[data-ci]").forEach(b=>{b.onmousedown=ev=>ev.preventDefault();   // 누를 때 글 칸의 선택 · 포커스를 잃지 않게
    b.onclick=()=>{close();items[+b.dataset.ci][4](c)}});
  setTimeout(()=>{document.addEventListener("mousedown",out,true);document.addEventListener("keydown",key,true);addEventListener("blur",close)},0);
}
