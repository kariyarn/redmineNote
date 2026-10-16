/* ---------- 앱 업데이트: 새 버전 확인 → 받기(진행률) → 바꾸고 다시 켜기 ----------
   서버(rnotes/updater.py)가 깃허브 Releases 에서 확인 · 받기 · 검증을 하고, 바꾸는 일은 앱이 꺼진 뒤 도우미가 한다.
   켤 때 알림은 자동 확인이 켜져 있고 · 새 버전이 있고 · '이 버전 건너뛰기' 하지 않았을 때만 한 번 띄운다. */
const UPD_MODE={installer:"설치 파일로 설치됨 — 새 설치 파일을 조용히 실행해 덮어써요",exe:"exe 만 쓰는 중 — 새 exe 로 바꿔 끼워요",source:"소스(python main.py)로 실행 중 — 앱 안에서는 바꿀 수 없어요 (git pull)"};
const updWhen=s=>s?s.replace("T"," ").slice(0,16):"";
let updBusy=false;

async function updBootCheck(){   // 켠 뒤 한 번: 서버가 30초 뒤에 확인하므로 조금 기다렸다가 결과만 본다
  setTimeout(async()=>{
    try{const st=await api("/api/update");if(st.auto&&st.newer&&S.update_skip!==st.latest)updNotice(st)}catch(e){}
  },40000);
}
function updNotice(st){
  const e=$("#toast");e.textContent=`🆕 새 버전 ${st.latest} 이 있어요 (지금 ${st.current}) `;
  const go=document.createElement("button");go.type="button";go.className="tundo";go.textContent="업데이트";
  const later=document.createElement("button");later.type="button";later.className="tundo";later.textContent="나중에";
  const close=()=>{e.classList.remove("show","act");clearTimeout(tt)};
  go.onclick=()=>{close();updStart()};later.onclick=close;
  e.append(go,later);e.classList.add("show","act");clearTimeout(tt);tt=setTimeout(close,20000);
}

/* 받고 → 바꾸기. 어디서 누르든 같은 흐름 */
async function updStart(){
  if(updBusy)return;
  let st;try{st=await api("/api/update")}catch(e){toast("업데이트 상태를 읽지 못했어요: "+e.message,5000);return}
  if(!st.newer){toast("이미 최신 버전이에요",2500);return}
  if(!st.can_apply){
    if(await wdlg({title:`새 버전 ${esc(st.latest)}`,ok:"릴리스 페이지 열기",cancel:"닫기",
      body:`${esc(UPD_MODE[st.mode]||"")}<br>릴리스 페이지에서 직접 받으세요.`}))window.open(st.page,"_blank");
    return;
  }
  const ok=await wdlg({title:`새 버전 ${esc(st.latest)} 로 업데이트할까요?`,ok:"받기",cancel:"나중에",
    body:`지금 <b>${esc(st.current)}</b> → 새 버전 <b>${esc(st.latest)}</b>${st.published_at?` <span class="meta">(${esc(updWhen(st.published_at))} 게시)</span>`:""}
      <br>파일 크기 ${st.asset_size?kb(st.asset_size):"?"} · ${esc(UPD_MODE[st.mode]||"")}
      <br><span class="meta">받는 동안에도 앱을 그대로 쓸 수 있어요. 다 받으면 바꿀지 한 번 더 물어봐요. 노트 데이터는 그대로이고, 새 버전을 처음 켤 때 자동으로 백업해요.</span>
      <br><a href="${esc(st.page)}" target="_blank" rel="noopener">바뀐 내용 (릴리스 페이지)</a>`});
  if(!ok)return;
  updBusy=true;
  try{
    await post("/api/update/download",{});
    for(;;){
      await new Promise(r=>setTimeout(r,500));
      st=await api("/api/update");const d=st.download;
      if(d.state==="downloading"){toast(`새 버전 받는 중… ${d.total?Math.floor(d.done*100/d.total)+"% ("+kb(d.done)+" / "+kb(d.total)+")":kb(d.done)}`,0);updPaint(st);continue}
      if(d.state==="error")throw new Error(d.error);
      if(d.state==="ready")break;
      throw new Error("받기가 멈췄어요");
    }
    toast("다 받았어요 ✓",2000);updPaint(st);
    await updApply(st);
  }catch(e){toast("업데이트하지 못했어요: "+e.message,8000)}
  finally{updBusy=false}
}
async function updApply(st){
  let drafts=0;try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith("rncm:")&&(localStorage.getItem(k)||"").trim())drafts++}}catch(e){}
  const ok=await wdlg({title:"지금 새 버전으로 바꿀까요?",ok:"바꾸고 다시 시작",cancel:"나중에",focusNo:true,
    body:`앱이 <b>잠깐 꺼졌다가 새 버전(${esc(st.latest)})으로 다시 켜져요</b> (보통 몇 초 ~ 30초).<br>쓰던 노트는 저장되어 있어요.${drafts?`<br>아직 올리지 않은 댓글 ${drafts}개는 이 PC에 남아 있다가 다시 보여요.`:""}
      <br><span class="meta">'나중에'를 누르면 받은 파일은 남겨 두고, 설정 → 일반 → 업데이트에서 언제든 바꿀 수 있어요.</span>`});
  if(!ok){updPaint(st);return}
  try{flushEdits()}catch(e){}
  await post("/api/update/apply",{});
  document.body.innerHTML=`<div style="max-width:440px;margin:20vh auto;text-align:center;font:16px/1.7 system-ui,sans-serif">새 버전(${esc(st.latest)})으로 바꾸는 중이에요…<br>잠시 뒤 새 창이 열려요. 이 창은 닫혀요.<br><span style="opacity:.6;font-size:.9em">1분이 지나도 열리지 않으면 프로그램을 직접 실행하세요.</span></div>`;
}

/* 설정 → 일반 → 업데이트 */
function updSection(sec){
  return sec("gen","업데이트","현재 버전을 보고, 깃허브 저장소에 새 버전이 있는지 확인해 설치해요. 노트 데이터는 그대로예요.",`<div id="updBox"><span class="meta">확인 중…</span></div>`);
}
const UPD_KIND={installer:"설치 파일로 설치",exe:"exe 만 사용",source:"소스로 실행"};
function updPaint(st){
  const box=$("#updBox");if(!box||!st)return;
  const d=st.download||{},dl=d.state==="downloading",ready=d.state==="ready"&&d.version===st.latest;
  const latest=st.error?`<span class="bad">${esc(st.error)}</span>`
    :st.newer?`<b>${esc(st.latest)}</b> <span class="tg">새 버전</span>${st.published_at?` <span class="meta">(${esc(updWhen(st.published_at))} 게시)</span>`:""}${S.update_skip===st.latest?` <span class="meta">· 켤 때 알림은 건너뛰는 중</span>`:""}`
    :st.latest?`<b>${esc(st.latest)}</b> <span class="meta">— 지금이 최신 버전이에요</span>`:`<span class="meta">아직 확인하지 않았어요 — 업데이트 확인을 눌러 보세요</span>`;
  // 설치 버튼: 새 버전이 있고 · 앱 안에서 바꿀 수 있을 때만 눌린다. 받는 중에는 진행률, 다 받았으면 바로 바꾸기
  const why=!st.newer?"새 버전이 없어요 (먼저 업데이트 확인)":!st.can_apply?(UPD_MODE[st.mode]||"이 버전에는 받을 파일이 없어요"):"";
  const instLabel=dl?`받는 중 ${d.total?Math.floor(d.done*100/d.total)+"%":"…"}`:ready?"설치 (다시 시작)":"설치";
  box.innerHTML=`<div class="srow"><span class="sl">현재 버전</span><div class="sc"><b>${esc(st.current)}</b><span class="hint">${esc(UPD_KIND[st.mode]||"")}</span></div></div>
    <div class="srow"><span class="sl">최신 버전</span><div class="sc">${latest}<span class="hint">${st.checked_at?"마지막 확인 "+esc(updWhen(st.checked_at)):""}</span></div></div>
    <div class="srow"><span class="sl">업데이트</span><div class="sc"><button type="button" id="updCheck">업데이트 확인</button>
      <button type="button" class="primary" id="updGo" ${why||dl?"disabled":""} title="${esc(why||(ready?"앱을 끄고 새 버전으로 바꾼 뒤 다시 켜요":"새 버전을 받은 뒤, 바꿀지 한 번 더 물어봐요"))}">${instLabel}</button>
      ${st.newer?(S.update_skip===st.latest?`<button type="button" id="updUnskip">알림 다시 받기</button>`:`<button type="button" id="updSkip">이 버전 알림 건너뛰기</button>`):""}
      <a href="${esc(st.page)}" target="_blank" rel="noopener">릴리스 페이지</a></div></div>
    ${st.newer&&!st.can_apply?`<p class="hint">${esc(UPD_MODE[st.mode]||"")}. 릴리스 페이지에서 직접 받으세요.</p>`:""}
    <label class="chk"><input type="checkbox" id="updAuto" ${st.auto?"checked":""}> 켤 때 · 하루에 한 번 새 버전을 확인하고, 있으면 알려 줘요</label>
    ${sMore(`업데이트 확인은 깃허브 저장소(<code class="ic">kariyarn/redmineNote</code>)의 최신 릴리스를 봐요. ${esc(UPD_MODE[st.mode]||"")}.<br>받은 파일은 크기 · SHA-256(깃허브가 알려 줄 때) · 윈도우 실행 파일인지 확인한 뒤에만 써요. 바꿀 때는 앱을 끄고, 새 버전으로 바꾼 다음 다시 켜요. 문제가 생기면 예전 버전을 그대로 다시 켜요.<br>회사 네트워크에서 깃허브가 막혀 있으면 확인 · 받기가 되지 않아요 — 그때는 릴리스 페이지에서 설치 파일을 직접 받으세요.`)}`;
  const q=s=>box.querySelector(s);
  q("#updCheck").onclick=async()=>{const b=q("#updCheck");b.disabled=true;b.textContent="확인 중…";
    try{const r=await post("/api/update/check",{});updPaint(r);toast(r.newer?`새 버전 ${r.latest} 이 있어요 — 설치를 누르면 받아요`:"지금이 최신 버전이에요",3000)}catch(e){toast(e.message,6000);updWire()}};
  q("#updGo").onclick=()=>ready?updApply(st):updStart();
  if(q("#updSkip"))q("#updSkip").onclick=async()=>{await saveS("update_skip",st.latest);updPaint(st);toast(`${st.latest} 알림을 건너뛰어요 (여기서는 계속 설치할 수 있어요)`,3000)};
  if(q("#updUnskip"))q("#updUnskip").onclick=async()=>{await saveS("update_skip","");updPaint(st)};
  q("#updAuto").onchange=async e=>{await saveS("update_auto",e.target.checked?"1":"0");toast(e.target.checked?"새 버전을 자동으로 확인해요":"자동 확인을 껐어요 (업데이트 확인은 언제든 돼요)",2500)};
}
async function updWire(){try{updPaint(await api("/api/update"))}catch(e){const b=$("#updBox");if(b)b.innerHTML=`<span class="bad">업데이트 상태를 읽지 못했어요: ${esc(e.message)}</span>`}}
