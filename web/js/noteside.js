/* ---------- 노트 옆 칸 (2.27): 노트 오른쪽에 ☑ 할 일 · 📝 진행 기록 ----------
   주제 사전 칸과 따로, 노트에만 붙어 있다 (노트를 열면 같이 보이고 다른 화면으로 가면 같이 사라진다).
   - 위의 단추로 할 일 · 진행 기록을 각각 숨기고 다시 보인다. 둘 다 숨기면 얇은 띠(아이콘 두 개)만 남고 노트가 넓어진다
   - 노트와 옆 칸 사이의 손잡이를 끌어서 너비를 나눠 갖는다 (더블클릭 = 기본 너비). 정한 것은 화면 설정(ui)에 기억한다 */
const NS_W=280;
const nsOn=k=>(ui.ns||{})[k]!==false;      // 기본은 둘 다 보임
const nsRail=()=>!nsOn("todo")&&!nsOn("pg");
const nsW=()=>Math.max(220,Math.min(600,ui.nsW||NS_W));
const nsPill=(k,ic,label,cnt)=>`<button type="button" class="ns-pill ${nsOn(k)?"on":""}" data-ns="${k}" title="${label} ${nsOn(k)?"숨기기":"보이기"}">${ic}<span class="l"> ${label}</span><i ${cnt?"":"hidden"}>${cnt}</i></button>`;
function nsHtml(n){
  const open=todos.filter(t=>t.issue_id===n.issue_id&&!t.archived_at&&!t.done).length;
  return `<div class="ns-split" id="nsSplit" title="끌어서 노트 · 옆 칸 너비 나누기 (더블클릭: 기본 너비)"></div>
  <aside class="noteside" id="noteside" aria-label="이 노트의 할 일 · 진행 기록">
    <div class="ns-top">${nsPill("todo","☑","할 일",open)}${nsPill("pg","📝","진행 기록",(n._pg||[]).length)}</div>
    <section class="ns-sec" id="nsTodo" ${nsOn("todo")?"":"hidden"}><div class="todoplain" id="todoWrap"></div></section>
    <section class="ns-sec" id="nsPg" ${nsOn("pg")?"":"hidden"}>
      <div class="ns-h">📝 진행 기록 <small id="pgcnt"></small></div>
      <div class="ns-new">
        <div class="row2"><button type="button" class="nchip" id="pgtoday">📅 오늘</button><button type="button" class="nchip" id="pgyest">어제</button><input type="date" id="pgday" class="nday" title="다른 날짜"><span class="meta" id="pgrel"></span></div>
        <div class="rte" id="pgtext" data-ph="어디까지 했는지 (Ctrl+Enter 로 추가)"></div>
        <div class="row3"><span class="meta">코드는 \`\`\` + Enter</span><span class="sp"></span><button type="button" class="mini primary" id="pgadd">기록 추가</button></div>
      </div>
      <div id="pglist" class="ns-tl"></div>
    </section>
  </aside>`;
}
function nsCounts(){   // 단추의 숫자 (남은 할 일 · 진행 기록 수)
  const n=curNote();if(!n||!$("#noteside"))return;
  const set=(k,v)=>{const i=document.querySelector(`#noteside [data-ns="${k}"] i`);if(i){i.textContent=v;i.hidden=!v}};
  set("todo",todos.filter(t=>t.issue_id===n.issue_id&&!t.archived_at&&!t.done).length);
  const pg=n._pg||[];set("pg",pg.length);
  const c=$("#pgcnt");if(c)c.textContent=pg.length?`${pg.length}건 · ${new Set(pg.map(p=>p.day)).size}일`:"";
}
function wireNs(n){
  const side=$("#noteside"),wrap=side&&side.closest(".notewrap");if(!side)return;
  side.querySelectorAll("[data-ns]").forEach(b=>b.onclick=()=>{
    const k=b.dataset.ns,on=!nsOn(k);ui.ns={...(ui.ns||{}),[k]:on};saveUI();
    b.classList.toggle("on",on);b.title=`${k==="todo"?"할 일":"진행 기록"} ${on?"숨기기":"보이기"}`;
    $(k==="todo"?"#nsTodo":"#nsPg").hidden=!on;wrap.classList.toggle("rail",nsRail());
    if(on){const f=$(k==="todo"?"#todoNew":"#pgtext .tb");if(f)f.focus()}
  });
  const sp=$("#nsSplit");
  sp.addEventListener("pointerdown",e=>{
    if(e.button!==0||nsRail())return;e.preventDefault();sp.classList.add("drag");document.body.style.userSelect="none";
    const r=wrap.getBoundingClientRect();
    const mv=ev=>{const w=Math.round(r.right-ev.clientX-7);ui.nsW=Math.max(220,Math.min(600,Math.min(w,r.width-420)));wrap.style.setProperty("--nsw",nsW()+"px")};
    const up=()=>{document.removeEventListener("pointermove",mv);document.removeEventListener("pointerup",up);sp.classList.remove("drag");document.body.style.userSelect="";saveUI()};
    document.addEventListener("pointermove",mv);document.addEventListener("pointerup",up);
  });
  sp.addEventListener("dblclick",()=>{ui.nsW=NS_W;saveUI();wrap.style.setProperty("--nsw",nsW()+"px")});
  nsCounts();
}
