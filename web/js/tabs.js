/* ---------- 노트 탭 (2.22): 크롬처럼 여러 노트를 열어 두고 오간다 ----------
   목록 · 링크에서 그냥 누르기 = 지금 탭에서 열기 (이미 탭으로 열려 있으면 그 탭으로)
   휠 클릭 · Ctrl+클릭 = 새 탭에 열기 (지금 보던 노트는 그대로) · Ctrl+Shift+클릭 = 새 탭에 열고 그 탭으로
   탭: 누르기 = 그 노트로 · × 또는 휠 클릭 = 닫기 · 끌어서 순서 바꾸기 · 우클릭 = 다른 탭 / 오른쪽 탭 닫기
   Alt+PageUp / Alt+PageDown = 앞 / 뒤 탭, Alt+W = 지금 탭 닫기. 열어 둔 탭은 기억했다가 다시 켜면 그대로 (ui.tabs · ui.tabCur) */
const TAB_MAX=12;                 // 넘으면 가장 왼쪽(지금 탭이 아닌 것)부터 닫는다
let tabs=[],tabAt=-1;             // 열어 둔 노트 번호 (왼쪽부터) / 마지막으로 보던 탭 자리
const tabScroll=new Map();        // 탭마다 마지막으로 보던 위치 (탭을 오갈 때 그대로)
const tabOpt=e=>!e||!(e.ctrlKey||e.metaKey||e.button===1)?{}:e.shiftKey?{newTab:true}:{bg:true};   // 누른 방법 -> openNote 옵션
function tabSave(){ui.tabs=tabs.slice();ui.tabCur=cur;saveUI()}
function tabRestore(){            // 켤 때 (노트를 읽은 뒤): 지난번 탭을 그대로. 지운 일감의 탭은 뺀다
  const ids=new Set(all.map(n=>n.issue_id));
  tabs=(Array.isArray(ui.tabs)?ui.tabs:[]).filter((id,i,a)=>ids.has(id)&&a.indexOf(id)===i).slice(0,TAB_MAX);
  if(cur==null&&tabs.includes(ui.tabCur))cur=ui.tabCur;
  tabAt=tabs.indexOf(cur);
}
function tabPlace(id,newTab){     // id 를 어느 탭에 둘지: 이미 있으면 그대로, 새 탭이면 지금 탭 오른쪽, 아니면 지금 탭 자리를 바꾼다
  if(tabs.includes(id))return;
  const i=tabs.includes(cur)?tabs.indexOf(cur):tabAt<tabs.length?tabAt:-1;
  if(newTab||i<0)tabs.splice(i<0?tabs.length:i+1,0,id);else tabs[i]=id;
  while(tabs.length>TAB_MAX)tabs.splice(tabs.findIndex(x=>x!==id&&x!==cur),1);
}
function tabSync(){               // 탭이 아닌 길(뒤로 가기 · 오늘 화면의 자동 열기)로 연 노트도 지금 탭 자리에 둔다
  if(view==="note"&&cur!=null&&!tabs.includes(cur)&&all.some(n=>n.issue_id===cur)){tabPlace(cur,false);tabSave()}
  if(tabs.includes(cur))tabAt=tabs.indexOf(cur);
}
/* 탭 줄은 앱 맨 위 전체 폭 (#tabbar). 어느 화면에서든 보이고, 노트 화면일 때만 지금 탭이 강조된다 */
function renderTabBar(){
  const bar=$("#tabbar");if(!bar)return;
  tabSync();
  const showOn=view==="note"&&!todayFull();
  bar.hidden=!tabs.length;
  bar.innerHTML=tabs.length?`<div id="ntabs" role="tablist" aria-label="열어 둔 노트">${tabs.map(id=>{const n=all.find(x=>x.issue_id===id);if(!n)return "";const on=showOn&&id===cur;
    return `<div class="ntab${on?" on":""}${id!==cur&&isUnseen(n)?" unseen":""}" role="tab" aria-selected="${on}" data-tab="${id}" draggable="true" title="#${id} ${esc(n.subject)}&#10;휠 클릭 · × 로 닫기 · 끌어서 순서 바꾸기 · 우클릭 메뉴">`
      +`<span class="ntab-dot s-${stOf(n)}"></span><span class="ntab-no">#${id}</span><span class="ntab-t">${esc(n.subject)}</span><button type="button" class="ntab-x" data-tabx="${id}" title="탭 닫기 (Alt+W)" aria-label="탭 닫기">×</button></div>`}).join("")}</div>`:"";
  wireTabs();
}
function tabClose(id){
  const i=tabs.indexOf(id);if(i<0)return;
  tabs.splice(i,1);tabScroll.delete(id);
  if(id!==cur||view!=="note"){tabSave();if(id===cur){cur=null;tabAt=-1}renderTabBar();return}
  const nx=tabs[i]??tabs[i-1];      // 오른쪽 탭으로, 맨 끝이었으면 왼쪽 탭으로 (크롬과 같다)
  tabAt=-1;
  if(nx!=null){openNote(nx);return}
  cur=null;tabSave();renderAll();
}
function tabCloseMany(keep){const drop=tabs.filter(x=>!keep(x));if(drop.includes(cur)){tabs=tabs.filter(keep);drop.forEach(x=>tabScroll.delete(x));tabAt=-1;tabs.length?openNote(tabs[0]):(cur=null,tabSave(),renderAll());return}tabs=tabs.filter(keep);drop.forEach(x=>tabScroll.delete(x));tabSave();renderTabBar()}
function tabStep(d){if(tabs.length<2||view!=="note")return;const i=tabs.indexOf(cur);openNote(tabs[(i+d+tabs.length)%tabs.length])}
function wireTabs(){
  const bar=$("#ntabs");if(!bar)return;
  let drag=null;
  bar.querySelectorAll(".ntab").forEach(t=>{
    const id=+t.dataset.tab;
    t.onclick=e=>{if(e.target.closest("[data-tabx]")){e.stopPropagation();tabClose(id);return}if(id!==cur||!t.classList.contains("on"))openNote(id)};
    t.onmousedown=e=>{if(e.button===1)e.preventDefault()};      // 휠 클릭의 자동 스크롤을 막는다
    t.onauxclick=e=>{if(e.button===1){e.preventDefault();tabClose(id)}};
    t.oncontextmenu=e=>{e.preventDefault();const i=tabs.indexOf(id);
      popMenu(t,[["탭 닫기",()=>tabClose(id)],["다른 탭 모두 닫기",()=>tabCloseMany(x=>x===id)],["오른쪽 탭 닫기",()=>tabCloseMany(x=>tabs.indexOf(x)<=i)],["새 레드마인 창에서 열기 ↗",()=>openExternal(`${cfg.url}/issues/${id}`)]])};
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
  if(!e.altKey||e.ctrlKey||e.metaKey||view!=="note"||$("#modal").classList.contains("show"))return;
  if(e.key==="PageUp"||e.key==="PageDown"){e.preventDefault();tabStep(e.key==="PageUp"?-1:1)}
  else if(e.code==="KeyW"&&!e.shiftKey&&cur!=null&&tabs.includes(cur)){e.preventDefault();tabClose(cur)}
});
