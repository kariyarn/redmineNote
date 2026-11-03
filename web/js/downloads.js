/* ---------- 앱 안 다운로드: 브라우저 다운로드(아래쪽 팝업) 대신 서버가 '다운로드' 폴더에 바로 저장하고, 목록 레이어로 모아 본다 ----------
   - 화면의 모든 다운로드(<a download> · 백업 내려받기 · 만들어 둔 파일(blob))를 가로채 /api/dl/save 로 보낸다 (rnotes/downloads.py)
   - 다 받으면 다운로드 목록을 바로 연다(설정에서 '알림만'으로 바꿀 수 있음). 왼쪽 아래 ⬇ 단추 · Ctrl+J 로도 연다.
     목록은 날짜별로 묶은 카드이고, 파일을 누르면(한 번/두 번: 설정) 열린다. 파일 옆 단추 · 아이콘/글자도 설정에서 고른다 */
let dlNew=0;
const DL_IC='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>';
/* 다운로드 목록 보기 설정 (설정 → 일반 → 다운로드): 다 받은 뒤 목록 열기/알림만 · 한 번/두 번 눌러 열기 · 파일 옆 단추 · 아이콘/글자 */
const DL_BTNS=[["open","열기","M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"],
  ["reveal","폴더에서 보기","M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"],
  ["copy","경로 복사","M9 15l6-6M10 6l1-1a4 4 0 0 1 6 6l-1 1M14 18l-1 1a4 4 0 0 1-6-6l1-1"],
  ["forget","목록에서 빼기","M6 6l12 12M18 6L6 18"]];
const DL_BTN_DEF=["reveal","forget"];
const dlCfg=()=>({auto:ui.dlAuto==="toast"?"toast":"panel",click:ui.dlClick==="double"?"double":"single",
  btns:Array.isArray(ui.dlBtns)?ui.dlBtns:DL_BTN_DEF,icon:ui.dlIcon!==false});
const dlSvg=d=>`<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
/* 파일 종류 아이콘: 확장자 글자 + 종류별 색 (크롬 다운로드 목록처럼 한눈에 구분) */
const DL_KIND=[[/^(xlsx?|csv|ods)$/,"#1f7a45"],[/^(docx?|hwpx?|rtf|odt)$/,"#2b5fb8"],[/^(pptx?|odp)$/,"#c4512b"],[/^pdf$/,"#c02f2f"],
  [/^(png|jpe?g|gif|bmp|webp|svg)$/,"#8a4fb8"],[/^(zip|7z|rar|gz|tar)$/,"#8a6d1f"],[/^(exe|msi|bat|cmd)$/,"#4a5568"],[/^(txt|log|md|json|sql|xml)$/,"#56657a"]];
function dlFileIc(name){
  const ext=((name||"").match(/\.([a-z0-9]{1,5})$/i)||[])[1]||"",e=ext.toLowerCase(),c=(DL_KIND.find(([re])=>re.test(e))||[0,"#6b7280"])[1];
  return `<span class="dlic" style="--k:${c}" aria-hidden="true"><svg viewBox="0 0 32 40" width="30" height="38"><path d="M4 2h16l8 8v26a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="var(--surface)" stroke="currentColor" stroke-width="1.5"/><path d="M20 2v8h8" fill="none" stroke="currentColor" stroke-width="1.5"/></svg><b>${esc(ext.toUpperCase().slice(0,4)||"FILE")}</b></span>`;
}
const isDlLink=a=>a.hasAttribute("download")||/^\/api\/(backup\/download|gitbackup\/download)\b/.test(a.getAttribute("href")||"");
async function dlSave(src,name){
  toast(`⬇ ${name||"파일"} 저장하는 중…`,0);
  try{
    let it;
    if(/^(blob:|data:)/.test(src)){      // 화면에서 만든 파일(내보내기 등): 내용을 그대로 서버로
      const blob=await (await fetch(src)).blob();
      const r=await fetch("/api/dl/save?name="+encodeURIComponent(name||"download"),{method:"POST",headers:{"Content-Type":"application/octet-stream"},body:blob});
      it=await r.json();if(!r.ok)throw new Error(it.error||"저장하지 못했어요");
    }else it=await post("/api/dl/save",{url:new URL(src,location.href).pathname+new URL(src,location.href).search,name});
    if(dlCfg().auto==="panel"){$("#toast").classList.remove("show","act");clearTimeout(tt);dlOpen()}   // 기본: 다 받으면 다운로드 목록을 바로 연다 (방금 받은 파일이 맨 위에 보이므로 알림은 닫는다)
    else{dlNew++;dlBadge();dlDone(it);if($("#dlpanel.show"))dlPaint()}             // 설정: 알림(열기 · 목록)만
    return it;
  }catch(e){toast("저장하지 못했어요: "+e.message,8000)}
}
function dlDone(it){      // 앱 알림: 저장한 파일 이름 + 열기 · 목록
  const e=$("#toast");e.textContent=`⬇ ${it.name} 을(를) 다운로드 폴더에 저장했어요 `;
  const mk=(t,fn)=>{const b=document.createElement("button");b.type="button";b.className="tundo";b.textContent=t;b.onclick=()=>{e.classList.remove("show","act");clearTimeout(tt);fn()};return b};
  e.append(mk("열기",()=>dlAct("open",it.id)),mk("목록",dlOpen));e.classList.add("show","act");clearTimeout(tt);tt=setTimeout(()=>e.classList.remove("show","act"),7000);
}
/* 모든 다운로드 링크를 가로챈다 (캡처 단계: 각 화면의 다른 클릭 처리보다 먼저). 코드에서 만든 a.click() 도 여기로 온다 */
document.addEventListener("click",e=>{
  const a=e.target.closest&&e.target.closest("a[href]");
  if(!a||!isDlLink(a)||e.button!==0)return;
  e.preventDefault();e.stopPropagation();
  const href=a.getAttribute("href")||"";if(!href||href==="#")return;
  const nm=a.getAttribute("download")||new URL(a.href,location.href).searchParams.get("name")||"";
  dlSave(a.href,nm);
},true);
async function dlAct(act,id,path){
  if(act==="copy"){copyText(path||"","파일 경로를 복사했어요");return}
try{await post("/api/dl/"+act,id?{id}:{})}catch(e){toast(e.message,6000)}if(act==="forget"&&$("#dlpanel.show"))dlPaint()}
function dlBadge(){const b=$("#btnDl");if(b)b.dataset.n=dlNew?String(dlNew):""}
function dlOpen(){
  let p=$("#dlpanel");
  if(!p){p=document.createElement("div");p.id="dlpanel";p.setAttribute("role","dialog");p.setAttribute("aria-label","다운로드");document.body.appendChild(p);
    document.addEventListener("mousedown",e=>{if($("#dlpanel.show")&&!e.target.closest("#dlpanel,#btnDl,#toast"))dlClose()});}
  p.classList.add("show");dlNew=0;dlBadge();dlPaint();
}
function dlClose(){const p=$("#dlpanel");if(p)p.classList.remove("show")}
async function dlPaint(){
  const p=$("#dlpanel");if(!p)return;
  let st;try{st=await api("/api/dl")}catch(e){p.innerHTML=`<div class="dlh"><b>다운로드</b></div><div class="meta dlempty">목록을 읽지 못했어요: ${esc(e.message)}</div>`;return}
  const c=dlCfg(),hm=d=>`${z(d.getHours())}:${z(d.getMinutes())}`;
  const day=s=>{const d=new Date(s);if(isNaN(d))return "";const t=fmt(d),y=new Date();y.setDate(y.getDate()-1);
    return t===todayStr()?"오늘":t===fmt(y)?"어제":`${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일`};
  const btn=(k,it)=>{const b=DL_BTNS.find(x=>x[0]===k);if(!b||(!it.exists&&k!=="forget"))return "";
    return `<button type="button" class="${c.icon?"dlib":"mini"}" data-dla="${k}" title="${esc(b[1])}${k==="forget"?" (파일은 그대로)":""}" aria-label="${esc(b[1])}">${c.icon?dlSvg(b[2]):esc(b[1])}</button>`};
  let g="",html="";
  st.items.forEach(it=>{const d=day(it.at);if(d!==g){g=d;html+=`<div class="dlday">${esc(d||"날짜 모름")}</div>`}
    html+=`<div class="dlrow${it.exists?"":" gone"}" data-dlid="${esc(it.id)}" data-path="${esc(it.path)}" ${it.exists?`role="button" tabindex="0" title="${c.click==="double"?"두 번":"한 번"} 눌러 열기 · ${esc(it.path)}"`:`title="${esc(it.path)}"`}>
        ${dlFileIc(it.name)}<div class="dlmain"><div class="dlnm">${esc(it.name)}</div>
        <div class="meta">${it.exists?`${kb(it.size)} · ${esc(hm(new Date(it.at)))}`:"파일이 없어요 (옮기거나 지웠어요)"}</div></div>
        <div class="dlbtns">${DL_BTNS.map(([k])=>c.btns.includes(k)?btn(k,it):"").join("")}</div></div>`});
  p.innerHTML=`<div class="dlh"><b>다운로드</b><span class="meta">${st.items.length}개</span><span class="sp"></span>${st.items.length?`<button type="button" class="mini" data-dlclear title="파일은 그대로 두고 목록만 비워요">목록 비우기</button>`:""}</div>
    <div class="dllist">${html||`<div class="meta dlempty">아직 내려받은 파일이 없어요.<br>첨부파일 · 내보내기 · 백업을 내려받으면 여기에 모여요.</div>`}</div>
    <div class="meta dlfoot"><span title="${esc(st.folder)}">저장 위치: ${esc(st.folder)}</span><button type="button" class="mini" data-dlfolder>폴더 열기</button><button type="button" class="mini" data-dldir>바꾸기</button></div>`;
  p.querySelector("[data-dldir]").onclick=dlFolderDialog;
  p.querySelector("[data-dlfolder]").onclick=()=>dlAct("reveal");
  const clr=p.querySelector("[data-dlclear]");if(clr)clr.onclick=()=>dlAct("forget");
  p.querySelectorAll(".dlrow").forEach(r=>{const id=r.dataset.dlid,live=!r.classList.contains("gone");
    r.querySelectorAll("[data-dla]").forEach(b=>b.onclick=e=>{e.stopPropagation();dlAct(b.dataset.dla,id,r.dataset.path)});
    if(!live)return;
    const open=e=>{if(!e.target.closest("button"))dlAct("open",id)};
    if(c.click==="double")r.ondblclick=open;else r.onclick=open;
    r.onkeydown=e=>{if(e.key==="Enter"&&e.target===r)dlAct("open",id)}});
}
/* 저장 폴더 바꾸기: 경로를 적거나 '찾아보기…'(윈도우 폴더 고르기 창)로 고른다. 비우면 기본(윈도우 '다운로드' 폴더) */
async function dlFolderDialog(){
  let st;try{st=await api("/api/dl")}catch(e){toast(e.message,5000);return}
  const pr=wdlg({title:"다운로드 저장 폴더",ok:"저장",cancel:"취소",wide:true,
    body:`<div class="frow" style="margin-top:0"><input type="text" id="dlDir" value="${esc(st.custom?st.folder:"")}" placeholder="${esc(st.default)} (기본)" spellcheck="false" style="flex:1"><button type="button" id="dlPick">찾아보기…</button></div>
      <div class="meta" style="margin-top:8px">비워 두면 기본 <b>다운로드</b> 폴더(${esc(st.default)})에 저장해요. 이미 받은 파일은 그 자리에 그대로 있어요.</div>`,
    collect:()=>$("#dlDir").value.trim()});
  $("#dlPick").onclick=async()=>{const b=$("#dlPick");b.disabled=true;b.textContent="고르는 중…";
    try{const r=await post("/api/dl/pick",{});if(r.path&&$("#dlDir"))$("#dlDir").value=r.path}catch(e){toast(e.message,5000)}
    if($("#dlPick")){b.disabled=false;b.textContent="찾아보기…"}};
  const v=await pr;if(v===false)return;
  try{const r=await post("/api/dl/folder",{path:v});toast(r.custom?`이제 ${r.folder} 에 저장해요`:"기본 다운로드 폴더에 저장해요",3000);if($("#dlpanel.show"))dlPaint();if($("#dlDirNow"))$("#dlDirNow").textContent=r.folder}
  catch(e){toast("폴더를 바꾸지 못했어요: "+e.message,6000)}
}
/* 왼쪽 아래(설정 옆) ⬇ 단추 · Ctrl+J (크롬의 다운로드 단축키) · Esc 로 닫기 */
(()=>{const f=document.querySelector("#nav .nv-foot");if(f&&!$("#btnDl")){const b=document.createElement("button");b.id="btnDl";b.className="icon";b.title="다운로드 목록 (Ctrl+J)";b.innerHTML=DL_IC;b.onclick=()=>$("#dlpanel.show")?dlClose():dlOpen();f.appendChild(b)}})();
document.addEventListener("keydown",e=>{
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&!e.shiftKey&&(e.key||"").toLowerCase()==="j"){e.preventDefault();$("#dlpanel.show")?dlClose():dlOpen()}
  else if(e.key==="Escape"&&$("#dlpanel.show")){dlClose()}
});
