/* ---------- 노트 옆 칸 (2.27): 노트 오른쪽에 ☑ 할 일 · 📝 진행 기록 (2.29 부터는 배치에서 옆 칸에 놓은 블록) ----------
   주제 사전 칸과 따로, 노트에만 붙어 있다 (노트를 열면 같이 보이고 다른 화면으로 가면 같이 사라진다).
   - 위의 단추로 블록을 각각 잠깐 숨기고 다시 보인다. 모두 숨기면 얇은 띠(아이콘)만 남고 노트가 넓어진다
   - 노트와 옆 칸 사이의 손잡이를 끌어서 너비를 나눠 갖는다 (더블클릭 = 기본 너비). 정한 것은 화면 설정(ui)에 기억한다 */
const NS_W=280;
const nsOn=k=>(ui.ns||{})[k]!==false;      // 기본은 모두 보임
const nsKeys=()=>[...document.querySelectorAll("#noteside [data-nsb]")].map(b=>b.dataset.nsb);
const nsRail=ks=>ks.length>0&&ks.every(k=>!nsOn(k));   // 옆 칸 블록을 모두 잠깐 숨기면 얇은 띠(단추만)
const nsW=()=>Math.max(220,Math.min(600,ui.nsW||NS_W));
const nsPill=(k,cnt)=>`<button type="button" class="ns-pill ${nsOn(k)?"on":""}" data-ns="${k}" title="${NL[k].name} ${nsOn(k)?"숨기기":"보이기"}">${NL[k].ic}<span class="l"> ${NL[k].name}</span><i ${cnt?"":"hidden"}>${cnt||""}</i></button>`;
/* 2.29: 옆 칸에는 배치(notelayout.js)에서 옆 칸에 놓은 블록이 차례로 들어가고, 위의 단추도 그 블록마다 생긴다 */
function nsHtml(n,keys,B){
  if(!keys.length)return "";
  return `<div class="ns-split" id="nsSplit" title="끌어서 노트 · 옆 칸 너비 나누기 (더블클릭: 기본 너비)"></div>
  <aside class="noteside" id="noteside" aria-label="노트 옆 칸">
    <div class="ns-top">${keys.map(k=>nsPill(k,nsCnt(n,k))).join("")}</div>
    ${keys.map(k=>`<section class="ns-b" data-nsb="${k}" ${nsOn(k)?"":"hidden"}>${B[k]}</section>`).join("")}
  </aside>`;
}
/* 할 일 · 진행 기록 블록 (본문에도 옆 칸에도 놓을 수 있다). 할 일 내용은 todo.js, 진행 기록 목록은 record.js 가 그린다 */
const todoBlock=n=>cf(n,"todo","☑ 할 일","","","",`<div class="todoplain" id="todoWrap"></div>`,nlOpen("todo",todos.some(t=>t.issue_id===n.issue_id&&!t.archived_at)));
const pgBlock=n=>cf(n,"pg","📝 진행 기록",`<small id="pgcnt"></small>`,"","",`<div class="ns-new">
        <div class="row2"><button type="button" class="nchip" id="pgtoday">📅 오늘</button><button type="button" class="nchip" id="pgyest">어제</button><input type="date" id="pgday" class="nday" title="다른 날짜"><span class="meta" id="pgrel"></span></div>
        <div class="rte" id="pgtext" data-ph="어디까지 했는지 (Ctrl+Enter 로 추가)"></div>
        <div class="row3"><span class="meta">코드는 \`\`\` + Enter</span><span class="sp"></span><button type="button" class="mini primary" id="pgadd">기록 추가</button></div>
      </div>
      <div id="pglist" class="ns-tl"></div>`,nlOpen("pg",(n._pg||[]).length));
function nsCnt(n,k){   // 단추의 숫자
  if(k==="todo")return todos.filter(t=>t.issue_id===n.issue_id&&!t.archived_at&&!t.done).length;
  if(k==="pg")return (n._pg||[]).length;
  if(k==="cm")return n.journals.length;
  if(k==="rel")return neighbors(n.issue_id).length;
  if(k==="att")return (attCache.get(n.issue_id+"|"+n.updated_on)||[]).length;
  return 0;
}
function nsCounts(){   // 단추의 숫자 (남은 할 일 · 진행 기록 수 …) · 진행 기록 머리글의 건수
  const n=curNote();if(!n)return;
  nsKeys().forEach(k=>{const i=document.querySelector(`#noteside [data-ns="${k}"] i`),v=nsCnt(n,k);if(i){i.textContent=v||"";i.hidden=!v}});
  const pg=n._pg||[],c=$("#pgcnt");if(c)c.textContent=pg.length?`${pg.length}건 · ${new Set(pg.map(p=>p.day)).size}일`:"";
}
function nsSet(k,on){   // 옆 칸 블록 하나를 잠깐 숨기기 / 다시 보이기 (화면 설정에 기억)
  const side=$("#noteside"),b=side&&side.querySelector(`[data-ns="${k}"]`);if(!b)return;
  ui.ns={...(ui.ns||{}),[k]:on};saveUI();
  b.classList.toggle("on",on);b.title=`${NL[k].name} ${on?"숨기기":"보이기"}`;
  side.querySelector(`[data-nsb="${k}"]`).hidden=!on;side.closest(".notewrap").classList.toggle("rail",nsRail(nsKeys()));
}
const nsShow=k=>{if(!nsOn(k))nsSet(k,true)};
function nsCenter(){   // 노트를 창 전체의 가운데에: 창 중심과 노트 칸(.notewrap) 중심의 차이를 CSS 에 넘긴다 (왼쪽 메뉴 · 목록, 오른쪽 사전 칸 폭이 달라도)
  const w=document.querySelector("#center .notewrap");if(!w)return;
  const r=w.getBoundingClientRect();if(!r.width)return;
  w.style.setProperty("--cx",Math.round(innerWidth/2-(r.left+r.width/2))+"px");
}
window.addEventListener("resize",nsCenter);
function wireNs(n){
  const side=$("#noteside"),wrap=side&&side.closest(".notewrap");if(!side){nsCenter();return}      // 옆 칸이 없어도 노트는 가운데에
  side.querySelectorAll("[data-ns]").forEach(b=>b.onclick=()=>{
    const k=b.dataset.ns,on=!nsOn(k);nsSet(k,on);
    if(on){const f=side.querySelector({todo:"#todoNew",pg:"#pgtext .tb",cm:"#sec-write .cmta .tb"}[k]||"_");if(f)f.focus()}
  });
  const sp=$("#nsSplit");
  sp.addEventListener("pointerdown",e=>{
    if(e.button!==0||wrap.classList.contains("rail"))return;e.preventDefault();sp.classList.add("drag");document.body.style.userSelect="none";
    const r=wrap.getBoundingClientRect();
    const mv=ev=>{const w=Math.round(r.right-ev.clientX-7);ui.nsW=Math.max(220,Math.min(600,Math.min(w,r.width-420)));wrap.style.setProperty("--nsw",nsW()+"px")};
    const up=()=>{document.removeEventListener("pointermove",mv);document.removeEventListener("pointerup",up);sp.classList.remove("drag");document.body.style.userSelect="";saveUI()};
    document.addEventListener("pointermove",mv);document.addEventListener("pointerup",up);
  });
  sp.addEventListener("dblclick",()=>{ui.nsW=NS_W;saveUI();wrap.style.setProperty("--nsw",nsW()+"px")});
  nsCounts();nsCenter();
}
