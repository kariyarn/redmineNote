/* ---------- 뒤로 가기 (마우스 뒤로가기 버튼 · Alt+←) ----------
   앱 안에서 거친 화면(보기·열어 본 노트·용어 선택 등)을 기억해 두고, 편집 중이 아닐 때 바로 이전 화면으로 돌아간다. */
const navHist=[],navFwd=[];let navRestoring=false;      // navFwd: 뒤로 갔다가 빠져나온 화면들 (앞으로 가기용)
const navKey=()=>[nav,view,cur,sel.join(),selMode,graphMode,gHub,codeSel,codeType,mineSub,hist.cat,hist.per,hist.flag,scopeW(),scopeR()].join("|");
function navRecord(){
  if(navRestoring)return;
  const k=navKey();if(navHist.length&&navHist[navHist.length-1].key===k)return;
  navHist.push({key:k,nav,view,cur,sel:[...sel],selMode,graphMode,gHub,codeSel,codeType,mineSub,h:{...hist}});
  navFwd.length=0;      // 새로 이동하면 '앞으로' 기록은 사라진다 (브라우저와 같은 방식)
  if(navHist.length>60)navHist.shift();
}
function navRestore(h){
  navRestoring=true;
  try{({nav,view,cur,selMode,graphMode,gHub,codeSel,codeType,mineSub}=h);Object.assign(hist,h.h,{pop:false});sel=[...h.sel];gFocusKey=null;gPinned=false;codeEd=false;renderAll()}
  finally{navRestoring=false}
}
const isTyping=()=>{
  const a=document.activeElement;if(!a)return false;
  if(a.isContentEditable||a.tagName==="TEXTAREA")return true;
  return a.tagName==="INPUT"&&!["checkbox","radio","range","button","file"].includes(a.type)||a.tagName==="SELECT";
};
const navBlocked=()=>{
  if($("#setup.show"))return true;
  if($("#modal").classList.contains("show")){closeSettings();return true}     // 설정 창이 열려 있으면 그것부터 닫는다
  return isTyping()||editing;                                                 // 편집 중에는 이동하지 않는다
};
function goBack(){
  if(navBlocked())return;
  if(navHist.length<2){toast("이전 화면이 없습니다",1500);return}
  navFwd.push(navHist.pop());navRestore(navHist[navHist.length-1]);
}
function goForward(){
  if(navBlocked())return;
  if(!navFwd.length){toast("앞으로 갈 화면이 없습니다",1500);return}
  const h=navFwd.pop();navHist.push(h);navRestore(h);
}
["mousedown","mouseup","auxclick"].forEach(t=>document.addEventListener(t,e=>{
  if(e.button===3||e.button===4){e.preventDefault();if(t==="mouseup")(e.button===3?goBack:goForward)()}}));      // 마우스 뒤로(3)/앞으로(4) 버튼: 브라우저의 페이지 이동을 막고 앱 안에서 이동
document.addEventListener("keydown",e=>{if(e.altKey&&(e.key==="ArrowLeft"||e.key==="ArrowRight")){e.preventDefault();(e.key==="ArrowLeft"?goBack:goForward)()}});
history.replaceState({rn:1},"");
const navSentinel=()=>history.pushState({rn:1},"");
addEventListener("pointerdown",navSentinel,{once:true});addEventListener("keydown",navSentinel,{once:true});   // 터치패드 제스처 등 다른 뒤로가기도 앱 안에서 처리
addEventListener("popstate",()=>{navSentinel();goBack()});      // (터치패드 등의 앞으로 제스처는 브라우저가 알려 주지 않아 지원하지 않는다)
applyUI();applyTheme();
/* 화면이 열려 있는 동안 서버에 신호를 보낸다. 창을 닫으면 신호가 끊기고, 서버는 잠시 뒤 스스로 종료한다. */
const ping=()=>fetch("/api/ping",{method:"POST",keepalive:true}).catch(()=>{});
ping();setInterval(ping,20000);document.addEventListener("visibilitychange",()=>{if(!document.hidden)ping()});
/* ---------- 바깥 링크는 평소 쓰는 기본 브라우저로 (앱 창의 전용 프로필에는 레드마인 로그인이 없다) ---------- */
function openExternal(url){post("/api/open-external",{url}).catch(()=>window.open(url,"_blank"))}
document.addEventListener("click",e=>{
  const a=e.target.closest&&e.target.closest("a[href]");
  if(!a||e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey)return;
  let u;try{u=new URL(a.href,location.href)}catch(_){return}
  if((u.protocol==="http:"||u.protocol==="https:")&&u.origin!==location.origin){e.preventDefault();openExternal(u.href)}
});
/* ---------- 첫 실행 설정 · 계정 · 종료 ---------- */
function showSetup({first=false}={}){
  let el=$("#setup");if(!el){el=document.createElement("div");el.id="setup";document.body.appendChild(el)}
  el.classList.add("show");
  el.innerHTML=`<div class="sbox card">
    <h2 style="margin:0 0 6px">${first?"레드마인 노트 시작하기":"레드마인 계정 연결 변경"}</h2>
    ${cfg.keyUnreadable?`<p class="sumsg err" style="margin:0 0 10px">저장돼 있던 API 키를 이 PC·계정에서 열 수 없습니다 (다른 PC에서 복사했거나 계정이 바뀐 경우). 키를 다시 입력해 주세요.</p>`:""}
    <p class="meta" style="margin:0 0 12px">내 일감을 내려받으려면 레드마인 <b>API 키</b>가 한 번 필요합니다.</p>
    <ol class="steps"><li>레드마인에 로그인 → 오른쪽 위 <b>내 계정</b></li><li>화면 오른쪽 <b>API 접근 키 → 표시</b></li><li>키를 복사해서 아래 칸에 붙여넣기</li></ol>
    <div class="frow"><label>API 키</label><input type="text" id="suKey" class="secret" autocomplete="off" spellcheck="false" placeholder="여기에 붙여넣기"><button type="button" id="suShow">보기</button></div>
    <details style="margin:8px 0"><summary class="meta" style="cursor:pointer">고급 설정 (보통은 바꾸지 않습니다)</summary>
      <div class="frow"><label>레드마인 주소</label><input id="suUrl" value="${esc(cfg.url||cfg.defaultUrl||"")}"></div>
      <div class="frow"><label>개발담당자 번호</label><input id="suFid" value="${esc(cfg.devFieldId||"18")}" style="width:5rem;flex:none"><span class="meta">레드마인 사용자 지정 필드 번호</span></div></details>
    <div id="suMsg" class="sumsg"></div>
    <div class="row"><button class="primary" id="suGo">연결하고 시작</button>${first?"":`<button type="button" id="suCancel">취소</button>`}</div>
    <p class="meta" style="margin-top:14px">키는 <b>이 PC의 설정 파일에만</b> 저장되고 레드마인 외에는 어디로도 보내지 않습니다. 이 프로그램이 레드마인에 쓰는 것은 <b>댓글 · 상태 · 담당자/개발담당자</b>뿐이며(직접 버튼을 눌렀을 때만), 그 밖의 것은 읽기만 합니다.</p></div>`;
  const msg=$("#suMsg"),key=$("#suKey");key.focus();
  $("#suShow").onclick=()=>{const h=key.classList.toggle("shown");$("#suShow").textContent=h?"숨기기":"보기"};
  const close=()=>{el.classList.remove("show");el.innerHTML=""};   // 닫을 때 입력칸째 지운다: 키가 든 칸이 숨은 채 남아 있으면 노트를 저장할 때마다 브라우저가 '암호 저장' 창을 띄웠다
  if($("#suCancel"))$("#suCancel").onclick=close;
  const go=async force=>{
    msg.className="sumsg";msg.textContent="레드마인에 연결해 확인하는 중…";$("#suGo").disabled=true;
    try{
      const r=await post("/api/setup",{api_key:key.value,url:$("#suUrl").value,dev_field_id:$("#suFid").value,force});
      close();cfg=await api("/api/config");
      if(first){await boot();const t=new Date(),a=new Date(t);a.setDate(t.getDate()-364);toast(`${r.name||"사용자"}님으로 연결했습니다. 과거 이력까지 볼 수 있게 최근 1년 일감을 내려받습니다 (몇 분 걸릴 수 있어요)`,9000);doSync(fmt(a),fmt(t),false)}
      else{await loadAll();toast(`${r.name||"사용자"}님으로 연결했습니다`,3500)}
    }catch(e){
      $("#suGo").disabled=false;
      if(e.message.includes("다른 레드마인 계정")){msg.textContent="";if(await askC(e.message+"\n\n그래도 이 계정으로 바꿀까요? (기존 노트는 그대로 남습니다)"))return go(true);return}
      msg.className="sumsg err";msg.textContent=e.message;
    }
  };
  $("#suGo").onclick=()=>go(false);
  key.onkeydown=e=>{if(e.key==="Enter")go(false)};
}

