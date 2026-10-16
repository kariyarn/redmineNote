/* ---------- 공용 부품 (같은 일은 어디서나 똑같이) ---------- */
const chev=open=>`<span class="chev ${open?"open":""}">▸</span>`;                           // 펼침 화살표: 모든 접는 곳이 같은 모양
/* 레드마인 API 의 시각은 UTC(…Z)로 온다. 보여 줄 때는 항상 내 PC 시간대(한국)로 바꾼다. 저장 원본은 그대로 둔다. 날짜만 있는 값(2026-10-06)은 바꾸지 않는다. */
const lDateTime=s=>{if(!s||!/T/.test(s))return null;const d=new Date(s);return isNaN(d)?null:d};
const lDay=s=>{const d=lDateTime(s);return d?fmt(d):(s||"").slice(0,10)};
const lClock=s=>{const d=lDateTime(s);return d?`${z(d.getHours())}:${z(d.getMinutes())}`:(s||"").slice(11,16)};
const dTime=s=>{const d=lDateTime(s);return d?`${fmt(d)} ${z(d.getHours())}:${z(d.getMinutes())}`:(s||"").slice(0,16).replace("T"," ")};   // 댓글·기록 시각은 항상 2026-10-06 14:36 (한국 시간)
const askC=(msg,o={})=>wdlg({title:o.title||"확인",body:esc(msg).replace(/\n/g,"<br>"),ok:o.ok||"확인",cancel:"취소",focusNo:true});   // 브라우저 기본 확인 창 대신 앱 자체 확인 창
function copyText(txt,msg){   // 복사: 결과는 항상 같은 토스트로
  return (navigator.clipboard?navigator.clipboard.writeText(txt):Promise.reject()).catch(()=>{
    const ta=document.createElement("textarea");ta.value=txt;document.body.appendChild(ta);ta.select();try{if(!document.execCommand("copy"))throw 0}finally{ta.remove()}})
    .then(()=>toast(`${msg||"복사했어요"} ✓`,2200),()=>toast("복사하지 못했어요",3000));
}
function wdlg({title,body,ok="확인",cancel="취소",remember,focusNo,wide,collect}){
  return new Promise(res=>{
    let el=$("#wdlg");if(!el){el=document.createElement("div");el.id="wdlg";document.body.appendChild(el)}
    el.innerHTML=`<div class="wbox ${wide?"wide":""}" role="dialog" aria-modal="true"><h3>${title}</h3><div class="wbody">${body}</div>${remember?`<label class="wrem"><input type="checkbox" id="wrem"> 다시 보지 않기</label>`:""}<div class="wbtn">${cancel?`<button type="button" id="wno">${cancel}</button>`:""}<button type="button" class="primary" id="wyes">${ok}</button></div></div>`;
    el.classList.add("show");
    const kd=e=>{if(e.key==="Escape"){e.stopPropagation();e.preventDefault();done(false)}};
    const done=v=>{const chk=$("#wrem")&&$("#wrem").checked,val=v&&collect?collect():v;el.classList.remove("show");el.innerHTML="";document.removeEventListener("keydown",kd,true);if(v&&remember&&chk)saveS(remember,"1").catch(()=>{});res(val)};
    document.addEventListener("keydown",kd,true);
    $("#wyes").onclick=()=>done(true);if($("#wno"))$("#wno").onclick=()=>done(false);
    (focusNo&&$("#wno")?$("#wno"):$("#wyes")).focus();
  });
}
function setCmBusy(n,on){
  document.querySelectorAll(".cmp").forEach(c=>{
    c.querySelectorAll("[data-w],[data-send]").forEach(b=>b.disabled=on||!canWrite(n));
    const s=c.querySelector("[data-send]");if(s)s.textContent=on?"올리는 중…":"올리기";
  });
}
async function refreshToday(){   // 레드마인 날짜를 오늘로 해서 가져오기: 내가 올린 것과 그 사이 다른 사람이 바꾼 것까지 반영
  const t=fmt(new Date());
  try{
    await post("/api/sync",{from:t,to:t});
    const c=$("#center"),y=c.scrollTop;await loadAll();c.scrollTop=y;
    if(cmOpen)cmPanelRender();
  }catch(err){toast("올린 것은 반영됐어요. 오늘 기준 최신화는 하지 못했어요: "+err.message,6000)}
}
async function ackFirst(){   // 처음 쓰기 기능(상태·담당자 고르기)을 쓸 때 한 번만. 올리기를 누를 때는 묻지 않는다.
  if(S.write_ack_first==="1")return true;
  return wdlg({title:"레드마인에 직접 올립니다",remember:"write_ack_first",ok:"알겠어요",
    body:`이 프로그램에서 <b>댓글을 올리고, 상태·담당자·개발담당자를 바꿀 수 있어요.</b><br>바꾸는 것은 이 세 가지뿐이고 삭제는 못 해요. 버튼은 고르기만 하고, <b>올리기</b>를 눌러야 올라가요.<br>올린 댓글은 이 프로그램에서 고칠 수 없어요 (레드마인에서).${wcfg().test?`<br><br><b>시험 모드:</b> ${wcfg().allow.map(x=>"#"+x).join(", ")} 에서만 올라갑니다.`:""}`});
}
async function doWrite(n,o){
  const id=n.issue_id;if(cmBusy.has(id))return false;                      // 두 번 눌러도 한 번만
  const notes=draftOf(id).trim(),st=stageOf(id),f={};
  if(o.preset)f.preset=o.preset;
  else{if(st.preset)f.preset=st.preset;["status_id","assigned_to_id","dev_id"].forEach(k=>{if(st[k])f[k]=st[k]})}
  const hasF=Object.keys(f).length>0;
  if(!notes&&!hasF){toast("댓글을 쓰거나 상태·담당자 버튼을 고르세요",2500);return false}
  if(!canWrite(n)){toast(`시험 모드예요: ${wcfg().allow.map(x=>"#"+x).join(", ")} 에서만 레드마인에 올릴 수 있어요`,6000);return false}
  cmBusy.add(id);setCmBusy(n,true);
  const send=async force=>post("/api/rm/write",{issue_id:id,notes,...f,loaded_updated_on:n.updated_on,...(force?{force:true}:{})});
  try{
    let r;
    try{r=await send(false)}
    catch(err){
      if(err.status===409&&(err.code==="changed"||err.code==="duplicate")){
        const cur2=(err.body||{}).current;
        const ok=await wdlg({title:err.code==="changed"?"그 사이 레드마인에서 바뀌었어요":"방금 올린 내용이에요",ok:"그래도 올리기",
          body:esc(err.message)+(cur2?`<br><span class="meta">지금 상태 ${esc(cur2.status)} · 담당 ${esc(cur2.assigned||"없음")} · 댓글 ${cur2.comments}건</span>`:"")});
        if(!ok)return false;
        r=await send(true);
      }else throw err;
    }
    const tgt=all.find(x=>x.issue_id===id)||n;
    if(r.note)["subject","project","tracker","rm_status","author","assignee","updated_on","description","journals","roles","desc_raw","changes","author_id"].forEach(k=>{tgt[k]=r.note[k]});
    prep(tgt);buildTokens();markSeen(tgt);                             // 내가 올려서 바뀐 것은 안 본 것으로 치지 않는다
    setDraft(id,"");cmStage.delete(id);
    toast(r.verified?"레드마인이 오류를 줬지만 확인해 보니 올라가 있어요 ✓":"레드마인에 올렸어요 ✓",3500);
    const sentText=notes;
    const c=$("#center"),y=c.scrollTop;renderAll();c.scrollTop=y;
    if(cmOpen)cmPanelRender();
    refreshToday();                                                   // 올린 뒤 '오늘' 기준으로 한 번 더 최신화 (뒤에서 조용히)
    autoDeployProgress(tgt,sentText);
    return true;
  }catch(err){
    const b=err.body||{};
    toast(`올리지 못했어요: ${err.message}${b.hint?" — "+b.hint:""}${b.detail?" (레드마인: "+b.detail+")":""} · 쓴 내용은 그대로 남아 있어요`,15000);
    return false;
  }finally{cmBusy.delete(id);setCmBusy(n,false)}
}
/* 떠 있는 💬 버튼과 댓글 창: 노트를 보고 있을 때 어디에서든 */
function ensureCm(){
  if($("#cmfab"))return;
  document.body.insertAdjacentHTML("beforeend",`<button type="button" id="cmfab" title="이 일감에 바로 댓글 달기 (C)"></button><div id="cmpanel" role="dialog" aria-label="댓글"></div>`);
  $("#cmfab").onclick=()=>toggleCm();
}
function placeCm(){
  const r=$("#center").getBoundingClientRect(),right=Math.max(12,innerWidth-r.right+24)+"px";
  $("#cmfab").style.right=right;$("#cmpanel").style.right=right;$("#cmpanel").style.width=Math.min(440,Math.max(300,r.width-48))+"px";
}
function updFab(){
  ensureCm();updTodoFloat();
  const n=view==="note"&&cur?curNote():null,fab=$("#cmfab");
  if(!n){fab.style.display="none";if(cmOpen)toggleCm(false);return}
  fab.style.display=composerVisible()&&!cmOpen?"none":"block";fab.textContent=`💬 댓글 ${n.journals.length}`;fab.classList.toggle("draft",!!draftOf(n.issue_id).trim());
  placeCm();if(cmOpen&&$("#cmpanel").dataset.id!==String(n.issue_id))cmPanelRender();
}
function cmPanelRender(){
  const n=curNote(),p=$("#cmpanel");if(!n)return;
  p.dataset.id=n.issue_id;
  p.innerHTML=`<div class="cmph"><b>#${n.issue_id} 댓글</b><span class="meta">${n.journals.length}건</span><span class="sp"></span><button type="button" class="icon" id="cmx" title="닫기 (Esc)">✕</button></div><div class="cmphist tl" id="cmphist">${cmHist(n)}</div>${composerHtml("p",n)}`;
  $("#cmx").onclick=()=>toggleCm(false);
  wireComposer(p,n);
  wireCp($("#cmphist"));fillAttImgs($("#cmphist"));fillAttPlaces();
  const h=$("#cmphist");h.scrollTop=h.scrollHeight;
}
function toggleCm(open){
  ensureCm();const p=$("#cmpanel");
  const want=open===undefined?!cmOpen:open;
  if(want&&composerVisible()){const tb=$("#sec-write .cmta .tb");if(tb){tb.focus();tb.scrollIntoView({block:"center",behavior:"smooth"})}return}   // 아래 댓글 쓰기 칸이 이미 보이면 팝업 대신 그 칸을 쓴다
  cmOpen=want;
  if(!cmOpen)setTimeout(spy,0);
  if(cmOpen&&!curNote())cmOpen=false;
  p.classList.toggle("show",cmOpen);
  if(cmOpen){placeCm();cmPanelRender();const tb=p.querySelector(".cmta .tb");if(tb)tb.focus()}
  updTodoFloat();
}
window.addEventListener("resize",()=>{if($("#cmfab"))placeCm()});
document.addEventListener("pointerdown",e=>{   // 팝업 바깥(노트 원문 등)을 누르면 닫는다
  if(!cmOpen)return;
  if(e.target.closest&&e.target.closest("#cmpanel,#cmfab,#wdlg,#modal,#toast,[data-cmnew]"))return;
  toggleCm(false);
},true);
document.addEventListener("keydown",e=>{
  if($("#wdlg.show")||$("#modal").classList.contains("show")||$("#setup.show"))return;
  if(e.key==="Escape"&&cmOpen){e.preventDefault();toggleCm(false);return}
  if(e.code==="KeyC"&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!isTyping()&&view==="note"&&curNote()){e.preventDefault();toggleCm(true)}
});

/* ---------- 2.1 : 코드 이름에 마우스를 올리면 '나와의 관계' 말풍선 ---------- */
(()=>{
  let tip,hideT,curTok="";
  const el=()=>tip||(tip=Object.assign(document.createElement("div"),{id:"reltip"}),document.body.appendChild(tip),
    tip.onmouseenter=()=>clearTimeout(hideT),tip.onmouseleave=()=>hide(),tip);
  const hide=()=>{clearTimeout(hideT);hideT=setTimeout(()=>{if(tip)tip.style.display="none";curTok=""},220)};
  function show(target){
    const t=target.dataset.tok,e=tokIdx.get(t);if(!e)return;
    clearTimeout(hideT);const d=el();
    if(curTok!==t||d.style.display!=="block"){
      curTok=t;
      const mineNotes=e.notes.filter(n=>["dev","watch"].includes(n._rel.get(t))).sort((a,b)=>b.updated_on.localeCompare(a.updated_on)).slice(0,3);
      d.innerHTML=`<div class="rt-n">${esc(t)} ${relPill(relRep(e))}</div>
        <div class="rt-c">${REL_ORDER.map(k=>`<span title="${esc(CREL[k].tip)}">${CREL[k].label} <b>${e.rel[k]}</b></span>`).join("")}</div>
        <div class="meta">${e.myLast?`내가 마지막으로 쓴 날 ${e.myLast}`:"내가 직접 쓴 적은 없어요"}</div>
        ${mineNotes.map(n=>`<a data-rt-open="${n.issue_id}" title="${esc(n.subject)}">#${n.issue_id} ${esc(n.subject)}</a>`).join("")}`;
      d.querySelectorAll("[data-rt-open]").forEach(a=>a.onclick=()=>{d.style.display="none";openNote(+a.dataset.rtOpen)});
    }
    d.style.display="block";
    const r=target.getBoundingClientRect(),w=d.offsetWidth,h=d.offsetHeight;
    d.style.left=Math.max(8,Math.min(innerWidth-w-8,r.left))+"px";
    d.style.top=(r.bottom+6+h>innerHeight?Math.max(8,r.top-h-6):r.bottom+6)+"px";
  }
  document.addEventListener("mouseover",ev=>{const t=ev.target.closest&&ev.target.closest("[data-tok]");if(t&&t.dataset.tok)show(t)});
  document.addEventListener("mouseout",ev=>{const t=ev.target.closest&&ev.target.closest("[data-tok]");if(t)hide()});
})();

