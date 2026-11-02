/* ---------- 앱 안 다운로드: 브라우저 다운로드(아래쪽 팝업) 대신 서버가 '다운로드' 폴더에 바로 저장하고, 목록 레이어로 모아 본다 ----------
   - 화면의 모든 다운로드(<a download> · 백업 내려받기 · 만들어 둔 파일(blob))를 가로채 /api/dl/save 로 보낸다 (rnotes/downloads.py)
   - 저장하면 앱 알림으로 알려 주고, 왼쪽 아래 ⬇ 단추 · Ctrl+J 로 다운로드 목록(열기 · 폴더에서 보기 · 목록에서 빼기)을 연다 */
let dlNew=0;
const DL_IC='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>';
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
    dlNew++;dlBadge();dlDone(it);if($("#dlpanel.show"))dlPaint();
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
async function dlAct(act,id){try{await post("/api/dl/"+act,id?{id}:{})}catch(e){toast(e.message,6000)}if(act==="forget"&&$("#dlpanel.show"))dlPaint()}
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
  let st;try{st=await api("/api/dl")}catch(e){p.innerHTML=`<div class="dlh"><b>다운로드</b></div><div class="meta">목록을 읽지 못했어요: ${esc(e.message)}</div>`;return}
  const when=s=>{const d=new Date(s);return isNaN(d)?"":(fmt(d)===todayStr()?"오늘 ":fmt(d).slice(5)+" ")+`${z(d.getHours())}:${z(d.getMinutes())}`};
  p.innerHTML=`<div class="dlh"><b>다운로드</b><span class="meta">${st.items.length}개</span><span class="sp"></span>
      <button type="button" class="mini" data-dlfolder title="${esc(st.folder)}">폴더 열기</button>${st.items.length?`<button type="button" class="mini" data-dlclear title="파일은 그대로 두고 목록만 비워요">목록 비우기</button>`:""}<button type="button" class="icon" data-dlx title="닫기 (Esc)">✕</button></div>
    <div class="dllist">${st.items.map(it=>`<div class="dlrow${it.exists?"":" gone"}" data-dlid="${esc(it.id)}">
        <div class="dlnm" title="${esc(it.path)}">${esc(it.name)}</div>
        <div class="meta">${it.exists?kb(it.size):"파일이 없어요 (옮기거나 지웠어요)"} · ${esc(when(it.at))}</div>
        <div class="dlbtns">${it.exists?`<button type="button" class="mini" data-dlo>열기</button><button type="button" class="mini" data-dlr>폴더에서 보기</button>`:""}<button type="button" class="icon" data-dlf title="목록에서 빼기 (파일은 그대로)">✕</button></div>
      </div>`).join("")||`<div class="meta dlempty">아직 내려받은 파일이 없어요.<br>첨부파일 · 내보내기 · 백업을 내려받으면 여기에 모여요.</div>`}</div>
    <div class="meta dlfoot">저장 위치: ${esc(st.folder)}</div>`;
  p.querySelector("[data-dlx]").onclick=dlClose;
  p.querySelector("[data-dlfolder]").onclick=()=>dlAct("reveal");
  const clr=p.querySelector("[data-dlclear]");if(clr)clr.onclick=()=>dlAct("forget");
  p.querySelectorAll(".dlrow").forEach(r=>{const id=r.dataset.dlid,q=s=>r.querySelector(s);
    if(q("[data-dlo]"))q("[data-dlo]").onclick=()=>dlAct("open",id);
    if(q("[data-dlr]"))q("[data-dlr]").onclick=()=>dlAct("reveal",id);
    q("[data-dlf]").onclick=()=>dlAct("forget",id);
    r.ondblclick=e=>{if(!e.target.closest("button")&&!r.classList.contains("gone"))dlAct("open",id)}});
}
/* 왼쪽 아래(설정 옆) ⬇ 단추 · Ctrl+J (크롬의 다운로드 단축키) · Esc 로 닫기 */
(()=>{const f=document.querySelector("#nav .nv-foot");if(f&&!$("#btnDl")){const b=document.createElement("button");b.id="btnDl";b.className="icon";b.title="다운로드 목록 (Ctrl+J)";b.innerHTML=DL_IC;b.onclick=()=>$("#dlpanel.show")?dlClose():dlOpen();f.appendChild(b)}})();
document.addEventListener("keydown",e=>{
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&!e.shiftKey&&(e.key||"").toLowerCase()==="j"){e.preventDefault();$("#dlpanel.show")?dlClose():dlOpen()}
  else if(e.key==="Escape"&&$("#dlpanel.show")){dlClose()}
});
