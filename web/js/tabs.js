/* ---------- 탭 (2.22 · 화면 탭 2.22.2): 크롬처럼 노트 · 화면(메모 · 트러블슈팅 · 요약 …)을 열어 두고 오간다 ----------
   목록 · 링크에서 그냥 누르기 = 지금 탭에서 열기 (이미 탭으로 열려 있으면 그 탭으로)
   휠 클릭 · Ctrl+클릭 = 새 탭에 열기 (지금 보던 노트는 그대로) · Ctrl+Shift+클릭 = 새 탭에 열고 그 탭으로
   메뉴에서 메모 · 트러블슈팅 · 요약 같은 화면을 누르면 그 화면의 탭으로 (없으면 새 탭). 화면 탭에서 노트를 열면 옆에 노트 탭
   탭: 누르기 = 그 노트 · 화면으로 · × 또는 휠 클릭 = 닫기 · 끌어서 순서 바꾸기 · 우클릭 = 다른 탭 / 오른쪽 탭 닫기
   Alt+PageUp / Alt+PageDown = 앞 / 뒤 탭, Alt+W = 지금 탭 닫기. 열어 둔 탭은 기억했다가 다시 켜면 그대로 (ui.tabs · ui.tabCur) */
const TAB_MAX=12;                 // 넘으면 가장 왼쪽(지금 탭이 아닌 것)부터 닫는다
/* 탭 하나 = 노트(일감 번호) 또는 화면(메뉴 이름). 화면은 하나씩만 열리고(이미 열려 있으면 그 탭으로), 오늘 · 이력은 노트 목록이라 탭이 아니다 */
const TAB_SCREENS=["mine","summary","graph","code","memo","deploy","trouble","queries","commands","vaultCode","vaultQuery","vaultCommands"];
let tabs=[],tabAt=-1;             // 열어 둔 탭 (왼쪽부터) / 마지막으로 보던 탭 자리
const tabScroll=new Map();        // 탭마다 마지막으로 보던 위치 (탭을 오갈 때 그대로)
const tabOpt=e=>!e||!(e.ctrlKey||e.metaKey||e.button===1)?{}:e.shiftKey?{newTab:true}:{bg:true};   // 누른 방법 -> openNote 옵션
const isScr=k=>typeof k==="string";
const curKey=()=>view==="note"?cur:TAB_SCREENS.includes(nav)?nav:null;     // 지금 보고 있는 탭
function tabSave(){ui.tabs=tabs.slice();ui.tabCur=cur;saveUI()}
function tabRestore(){            // 켤 때 (노트를 읽은 뒤): 지난번 탭을 그대로. 지운 일감의 탭은 뺀다
  const ids=new Set(all.map(n=>n.issue_id));
  tabs=(Array.isArray(ui.tabs)?ui.tabs:[]).filter((k,i,a)=>(isScr(k)?TAB_SCREENS.includes(k):ids.has(k))&&a.indexOf(k)===i).slice(0,TAB_MAX);
  if(cur==null&&tabs.includes(ui.tabCur))cur=ui.tabCur;
  tabAt=tabs.indexOf(cur);
}
function tabPlace(k,newTab){      // k 를 어느 탭에 둘지: 이미 있으면 그대로. 노트 탭에서 노트를 열면 그 자리를 바꾸고, 새 탭 · 화면 · 화면 탭에서 연 노트는 지금 탭 오른쪽에
  if(tabs.includes(k))return;
  const ck=curKey(),i=tabs.includes(ck)?tabs.indexOf(ck):tabAt<tabs.length?tabAt:-1;
  if(newTab||i<0||isScr(k)||isScr(tabs[i]))tabs.splice(i<0?tabs.length:i+1,0,k);else tabs[i]=k;
  while(tabs.length>TAB_MAX)tabs.splice(tabs.findIndex(x=>x!==k&&x!==ck),1);
}
function tabSync(){               // 탭이 아닌 길(메뉴 · 뒤로 가기 · 오늘 화면의 자동 열기)로 연 노트 · 화면도 탭에 둔다
  const k=curKey();
  if(k!=null&&!tabs.includes(k)&&(isScr(k)||all.some(n=>n.issue_id===k))){tabPlace(k,false);tabSave()}
  if(tabs.includes(k))tabAt=tabs.indexOf(k);
}
function tabLeave(){const k=curKey();if(k!=null&&tabs.includes(k))tabScroll.set(k,$("#center").scrollTop)}   // 다른 탭으로 가기 전에 보던 위치를 기억
function tabActivate(k){
  if(!isScr(k)){if(TAB_SCREENS.includes(nav))nav="history";openNote(k);return}      // 노트 탭은 화면 위에 잠깐 연 것(← 돌아가기)이 아니라 이력 옆에 연다
  tabLeave();setNav(k,{keepDay:true,keepCur:true});
  if(tabScroll.has(k))$("#center").scrollTop=tabScroll.get(k);
}
/* 탭 줄은 앱 맨 위 전체 폭 (#tabbar). 탭이 둘 이상일 때만 보이고(어느 화면에서든), 지금 보고 있는 탭이 강조된다 */
function renderTabBar(){
  const bar=$("#tabbar");if(!bar)return;
  tabSync();
  const ck=view==="note"&&todayFull()?null:curKey();
  const show=tabs.length>1;      // 탭이 하나뿐이면 탭 줄을 숨긴다 (탭은 그대로 기억)
  bar.hidden=!show;
  bar.innerHTML=show?`<div id="ntabs" role="tablist" aria-label="열어 둔 탭">${tabs.map(k=>{const on=k===ck,x=`<button type="button" class="ntab-x" data-tabx="${k}" title="탭 닫기 (Alt+W)" aria-label="탭 닫기">×</button>`,tip="휠 클릭 · × 로 닫기 · 끌어서 순서 바꾸기 · 우클릭 메뉴";
    if(isScr(k))return `<div class="ntab scr${on?" on":""}" role="tab" aria-selected="${on}" data-tab="${k}" draggable="true" title="${esc(NAVLABEL[k]||k)}&#10;${tip}"><span class="ntab-ic">${NAVICON[k]||""}</span><span class="ntab-t">${esc(NAVLABEL[k]||k)}</span>${x}</div>`;
    const n=all.find(a=>a.issue_id===k);if(!n)return "";
    return `<div class="ntab${on?" on":""}${k!==cur&&isUnseen(n)?" unseen":""}" role="tab" aria-selected="${on}" data-tab="${k}" draggable="true" title="#${k} ${esc(n.subject)}&#10;${tip}">`
      +`<span class="ntab-dot s-${stOf(n)}"></span><span class="ntab-no">#${k}</span><span class="ntab-t">${esc(n.subject)}</span>${x}</div>`}).join("")}</div>`:"";
  wireTabs();
}
function tabAfterClose(gone,nx){  // 지금 탭을 닫은 뒤: 다음 탭으로, 없으면 노트는 비우고 화면은 오늘로
  tabAt=-1;
  if(nx!=null){tabActivate(nx);return}
  if(isScr(gone)){tabSave();setNav("today");return}
  cur=null;tabSave();renderAll();
}
function tabClose(k){
  const i=tabs.indexOf(k);if(i<0)return;
  const ck=curKey();
  tabs.splice(i,1);tabScroll.delete(k);
  if(k!==ck){tabSave();if(k===cur){cur=null;tabAt=-1}renderTabBar();return}
  tabAfterClose(k,tabs[i]??tabs[i-1]);      // 오른쪽 탭으로, 맨 끝이었으면 왼쪽 탭으로 (크롬과 같다)
}
function tabCloseMany(keep){
  const ck=curKey(),drop=tabs.filter(x=>!keep(x));
  tabs=tabs.filter(keep);drop.forEach(x=>tabScroll.delete(x));
  if(drop.includes(ck)){tabAfterClose(ck,tabs[0]);return}
  tabSave();renderTabBar();
}
function tabStep(d){const i=tabs.indexOf(curKey());if(tabs.length<2)return;tabActivate(tabs[((i<0?0:i)+d+tabs.length)%tabs.length])}
function wireTabs(){
  const bar=$("#ntabs");if(!bar)return;
  let drag=null;
  bar.querySelectorAll(".ntab").forEach(t=>{
    const id=/^\d+$/.test(t.dataset.tab)?+t.dataset.tab:t.dataset.tab;
    t.onclick=e=>{if(e.target.closest("[data-tabx]")){e.stopPropagation();tabClose(id);return}if(!t.classList.contains("on"))tabActivate(id)};
    t.onmousedown=e=>{if(e.button===1)e.preventDefault()};      // 휠 클릭의 자동 스크롤을 막는다
    t.onauxclick=e=>{if(e.button===1){e.preventDefault();tabClose(id)}};
    t.oncontextmenu=e=>{e.preventDefault();const i=tabs.indexOf(id);
      popMenu(t,[["탭 닫기",()=>tabClose(id)],["다른 탭 모두 닫기",()=>tabCloseMany(x=>x===id)],["오른쪽 탭 닫기",()=>tabCloseMany(x=>tabs.indexOf(x)<=i)],...(isScr(id)?[]:[["새 레드마인 창에서 열기 ↗",()=>openExternal(`${cfg.url}/issues/${id}`)]])])};
    t.ondragstart=e=>{drag=id;t.classList.add("drag");e.dataTransfer.effectAllowed="move";try{e.dataTransfer.setData("text/plain",String(id))}catch(_){}};
    t.ondragend=()=>{drag=null;bar.querySelectorAll(".ntab").forEach(x=>x.classList.remove("drag","dropl","dropr"))};
    t.ondragover=e=>{if(drag==null||drag===id)return;e.preventDefault();const r=t.getBoundingClientRect(),left=e.clientX<r.left+r.width/2;t.classList.toggle("dropl",left);t.classList.toggle("dropr",!left)};
    t.ondragleave=()=>t.classList.remove("dropl","dropr");
    t.ondrop=e=>{if(drag==null||drag===id)return;e.preventDefault();const r=t.getBoundingClientRect(),left=e.clientX<r.left+r.width/2;
      tabs.splice(tabs.indexOf(drag),1);tabs.splice(tabs.indexOf(id)+(left?0:1),0,drag);drag=null;tabSave();renderTabBar()};
  });
  const on=bar.querySelector(".ntab.on");if(on)on.scrollIntoView({block:"nearest",inline:"nearest"});
}
document.addEventListener("keydown",e=>{
  if(!e.altKey||e.ctrlKey||e.metaKey||$("#modal").classList.contains("show"))return;
  if(e.key==="PageUp"||e.key==="PageDown"){e.preventDefault();tabStep(e.key==="PageUp"?-1:1)}
  else if(e.code==="KeyW"&&!e.shiftKey&&tabs.includes(curKey())){e.preventDefault();tabClose(curKey())}
});
