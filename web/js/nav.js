/* ---------- 화면 이동 ---------- */
const NAVVIEW={today:"note",history:"note",mine:"mine",summary:"summary",graph:"graph",code:"code",memo:"memo",deploy:"deploy",trouble:"trouble",queries:"queries",commands:"commands",
  vaultCode:"queries",vaultQuery:"queries",vaultCommands:"commands"};
function setNav(n,o={}){
  if(!o.keepQ)$("#q").value="";
  if(!o.keepSel&&n!=="history"&&n!=="graph")sel=[];
  if((n==="vaultCode"||n==="vaultQuery")&&n!==nav){qvLang="";qvTag=""}
  if(n==="memo"&&nav!=="memo"&&!o.keepDay)memoDay=todayStr();   // 메모는 들어올 때마다 오늘 보드부터 (달력·알림에서 날짜를 골라 들어올 때만 그 날)
  nav=n;view=NAVVIEW[n];hist.pop=false;hist.more=60;
  if(n==="today"&&!o.keepCur)todayWide=true;     // 새 디자인: 오늘을 누르면 목록을 화면 전체 폭으로 (일감을 누르면 노트와 나란히)
  if(n==="today"&&!o.keepCur){/* 오늘 화면은 가장 먼저 할 일을 자동으로 연다 */}
  renderAll();
}
/* 일감 열기: 오늘·이력에서는 그대로, 그 밖의 화면(요약·그래프·코드 이력·배포요청·트러블슈팅·내 기록·메모)에서는 메뉴를 '이력'으로 바꾸지 않고
   그 화면 자리에 일감을 열고, 위쪽의 '← 돌아가기' 버튼(또는 Alt+←)으로 원래 화면으로 돌아온다. */
const NAVLABEL={mine:"내 기록",summary:"요약",graph:"그래프",code:"코드 이력",memo:"메모",deploy:"배포요청",trouble:"트러블슈팅",queries:"보관함",commands:"보관함 · 명령어",
  vaultCode:"보관함 · 코드",vaultQuery:"보관함 · 쿼리",vaultCommands:"보관함 · 명령어"};
const peeking=()=>view==="note"&&!!NAVLABEL[nav];
function closePeek(){if(!peeking())return;view=NAVVIEW[nav];renderAll()}
/* 작은 팝업 메뉴: 버튼 아래에 항목을 띄우고, 고르거나 바깥을 누르면 닫는다 */
function popMenu(anchor,items){
  document.querySelectorAll(".popmenu").forEach(m=>m.remove());
  const m=document.createElement("div");m.className="popmenu";
  m.innerHTML=items.map(([l,fn],i)=>`<button type="button" data-pm="${i}">${esc(l)}</button>`).join("");
  document.body.appendChild(m);const r=anchor.getBoundingClientRect();
  m.style.left=Math.max(8,Math.min(innerWidth-m.offsetWidth-8,r.left))+"px";m.style.top=(r.bottom+4)+"px";
  m.querySelectorAll("[data-pm]").forEach(b=>b.onclick=()=>{m.remove();items[+b.dataset.pm][1]()});
  setTimeout(()=>document.addEventListener("click",function f(e){if(!m.contains(e.target)){m.remove()}document.removeEventListener("click",f)},{once:false}),0);
}
function wireCpNo(n){   // 노트 위쪽: #번호 복사 (기본) + ▾ 다른 모양
  const b=$("#cpNo");if(!b)return;
  const txt={full:`#${n.issue_id} ${n.subject}`,hash:`#${n.issue_id}`,num:String(n.issue_id),link:`${cfg.url}/issues/${n.issue_id}`};
  b.onclick=()=>copyText(txt.hash,"복사했어요");
  $("#cpNoM").onclick=e=>{e.stopPropagation();popMenu(e.currentTarget,[[`#번호  ·  ${txt.hash}  (기본)`,()=>copyText(txt.hash,"복사했어요")],[`#번호 제목  ·  ${txt.full.slice(0,28)}${txt.full.length>28?"…":""}`,()=>copyText(txt.full,"복사했어요")],[`번호만  ·  ${txt.num}`,()=>copyText(txt.num,"복사했어요")],["레드마인 링크",()=>copyText(txt.link,"링크를 복사했어요")]])};
}
let todayWide=true;
const todayFull=()=>V2()&&nav==="today"&&todayWide;
function openNote(id){cur=id;seenOpen=id;todayWide=false;if(!NAVLABEL[nav]&&nav!=="today"&&nav!=="history")nav="history";view="note";renderAll()}

/* 용어 누르기: 한 번 누르면 선택, 다시 누르면 취소. 여러 개 선택하면 모두 포함한 노트만 남는다. */
function toggleTerm(t){   // 용어를 고르면 그래프는 '선택한 용어 보기'로, 모두 해제하면 고르기 전에 보던 모드로 돌아간다
  if(nav!=="history"&&nav!=="graph"){nav="history";view="note";hist.more=60}     // 주제를 고르면 그 주제의 이력을 보여 준다
  const i=sel.indexOf(t.id);
  if(i>=0)sel.splice(i,1);else{if(graphMode!=="focus")gPrevMode=graphMode;sel.push(t.id)}
  graphMode=sel.length?"focus":(gPrevMode||"all");renderAll();
}
function clearTerms(){sel=[];graphMode=gPrevMode||"all";renderAll()}
function selectTerm(t){t?toggleTerm(t):clearTerms()}
