/* ---------- 설정 창 (글꼴 · 시작 설정 · 백업/복원) ---------- */
function openSettings(){$("#modal").classList.add("show");renderSettings()}
function closeSettings(){$("#modal").classList.remove("show");$("#modal").innerHTML="";     // 토큰 칸이 숨은 채 남지 않게 내용째 지운다 (열 때 다시 그린다)
  if(view==="graph")renderGraph()}
$("#btnSet").onclick=openSettings;
$("#modal").onclick=e=>{if(e.target.id==="modal")closeSettings()};
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&$("#modal").classList.contains("show"))closeSettings()});
/* 설정은 종류별 탭으로 나눠 보여 준다: [키, 이름]. 각 묶음(.msec)의 data-st 가 탭 키 */
const ST_TABS=[["gen","일반","⚙️"],["sync","가져오기 · 기준","🔄"],["view","화면","🎨"],["font","글꼴","🔤"],["write","레드마인 쓰기","✍️"],["backup","백업","💾"],["help","도움말","📖"]];
const sMore=html=>`<details class="smore"><summary>자세히</summary><div class="desc">${html}</div></details>`;     // 긴 설명은 접어 둔다
/* 긴 목록(백업 파일 · 쓰기 기록 · 깃허브 백업 시점)은 접어 두고 개수만 보인다. 펼친 상태는 기억 */
const sFold=(id,title,n,html)=>`<details class="sfold" data-sfold="${id}" ${(ui.setFold||{})[id]?"open":""}><summary>${title} <span class="cnt">${n}</span></summary><div class="flist">${html}</div></details>`;
const fontOpts=(base,cur)=>`<option value="">기본값</option>`+fontList(base).map(n=>`<option value="${esc(n)}" ${n===cur?"selected":""}>${esc(KO[n]||n)}${installed(n)?"":" (이 PC에 없음)"}</option>`).join("");
async function renderSettings(){
  const keepTop=$("#modal").classList.contains("show")&&$("#modal .spane")?$("#modal .spane").scrollTop:0;     // 테마·노트 모양을 눌러 다시 그릴 때 보던 자리를 유지한다
  let bks=[];try{bks=await api("/api/backups")}catch(e){}
  let wlog=[];try{wlog=await api("/api/write/log?limit=12")}catch(e){}
  let ast=autoSync.st;try{ast=await api("/api/autosync")}catch(e){}
  let gst=null;try{gst=await api("/api/gitbackup")}catch(e){}      // 깃허브 백업 설정 · 마지막 결과 (토큰은 있는지만)      // 자동 가져오기 · 공휴일 상태 (서버가 알려 준 값)
  const aw=(ast&&ast.window)||["08:30","18:30"],hs=(ast&&ast.holiday)||{key_set:false,days:[],week:["",""]};
  const wc=wcfg(),names=extraNames();
  const tab=ST_TABS.some(t=>t[0]===ui.setTab)?ui.setTab:"gen";
  const sec=(t,title,lead,body,id="")=>`<section class="msec" data-st="${t}"${id?` id="${id}"`:""}><h4>${title}</h4>${lead?`<p class="lead">${lead}</p>`:""}${body}</section>`;
  $("#modal").innerHTML=`<div class="mbox stabbed" data-st="${tab}">
   <div class="stop"><div class="mhead"><h3>설정</h3><button class="icon" id="mclose">✕</button></div></div>
   <div class="sbody">
   <nav class="stabs" role="tablist">${ST_TABS.map(([k,l,ic])=>`<button type="button" role="tab" data-stab="${k}" class="${k===tab?"on":""}"><span class="sti">${ic}</span>${l}</button>`).join("")}</nav>
   <div class="spane">

   ${sec("gen","계정 · 저장 위치",`레드마인 <b>${esc(cfg.url)}</b> · 사용자 <b>${esc(cfg.meName||"확인 안 됨")}</b> · 버전 <b>${esc(cfg.versionLabel||cfg.appVersion||"")}</b>${cfg.newerDb?` · <span class="bad">데이터는 더 새 버전(${esc(cfg.newerDb)})</span>`:""}`,`
     <div class="srow"><span class="sl">API 키</span><div class="sc"><button id="cKey">API 키 변경</button><span class="hint">화면에는 표시하지 않아요</span></div></div>
     <div class="srow"><span class="sl">저장 위치</span><div class="sc"><input type="text" id="cDir" value="${esc(cfg.dataDir||"")}"><button id="cDirGo">변경</button></div></div>
     ${sMore(`노트 DB(<code class="ic">notes.db</code>) · 백업 · 폰트가 저장되는 폴더예요. 바꾸면 현재 데이터를 새 폴더로 <b>복사</b>하고, <b>프로그램을 다시 시작해야</b> 적용돼요. 네트워크 폴더는 파일이 깨질 수 있어 권하지 않아요. API 키 설정 파일은 항상 기본 위치에 남아요.`)}
     <div class="srow"><span class="sl">프로그램</span><div class="sc"><button class="danger" id="cQuit" title="서버를 끕니다. 다시 쓰려면 프로그램을 실행하세요">프로그램 종료</button></div></div>`)}

   ${updSection(sec)}

   ${sec("gen","알림 방식","앱 창을 <b>보고 있지 않을 때</b>(최소화 · 다른 창에 가려짐 · 다른 앱 사용 중 · 창을 닫아 트레이에만 있음) 알림을 놓치지 않게 해요.",`
     <div><label class="chk"><input type="checkbox" id="nFlash" ${S.notify_flash!=="0"?"checked":""}> 작업 표시줄 아이콘 반짝이기 <span class="hint">창을 다시 볼 때까지</span></label></div>
     <div><label class="chk"><input type="checkbox" id="nToast" ${S.notify_toast!=="0"?"checked":""}> 윈도우 알림 띄우기 <span class="hint">오른쪽 아래 · 알림 센터에 남아요</span></label></div>
     <p class="hint" style="margin-left:0">윈도우 알림이 안 보이면 윈도우 설정 → 시스템 → 알림에서 <b>방해 금지(집중 지원)</b>가 꺼져 있는지 확인하세요.</p>`)}

   ${sec("gen","시작 설정","",`
     <label class="chk"><input type="checkbox" id="sAuto" ${S.auto_check==="1"?"checked":""}> 처음 열 때 최근 7일 동안 바뀐 일감을 자동으로 확인</label>
     <p class="hint">서버를 켠 뒤 처음 화면을 열 때 한 번만 해요. 바뀐 것만 갱신해요.</p>`)}


   ${sec("sync","자동 가져오기",`정한 간격마다 바뀐 일감을 가져와요. <b>영업일 ${aw[0]} ~ ${aw[1]}</b>에만, 트레이에 있어도 동작해요.`,`
     <div class="srow"><span class="sl">간격</span><div class="sc"><input type="number" id="sAutoSync" min="0" max="1440" step="5" value="${autoSyncMin()}" class="num"> 분마다<span class="hint">0 = 끔 · 최소 ${AUTO_SYNC_MIN}분</span></div></div>
     <div class="srow"><span class="sl">가져올 기간</span><div class="sc">최근 <input type="number" id="sAutoDays" min="1" max="${AUTO_SYNC_MAX_DAYS}" value="${autoSyncDays()}" class="num"> 일<span class="hint">1 = 오늘만 · 최대 ${AUTO_SYNC_MAX_DAYS}일</span></div></div>
     <div class="srow"><span class="sl">알림</span><div class="sc"><label class="chk"><input type="checkbox" id="sAutoNotify" ${autoSyncNotify()?"checked":""}> 새 일감이 들어오면 알림</label></div></div>
     <div class="srow"><span class="sl">공휴일</span><div class="sc"><span class="hint" style="margin:0">${holidayLine(hs)}</span><button type="button" id="sHolFetch">이번 주 다시 받기</button></div></div>
     ${sMore(`마지막으로 가져온 때부터 시간을 재요. 한 번도 가져온 적이 없으면 시작하지 않으니, 처음에는 왼쪽 <b>가져오기</b>로 직접 받아 주세요. 글을 쓰는 중에는 화면을 다시 그리지 않고 기다렸다가 반영해요. 켜 두면 창을 닫아도 프로그램이 스스로 꺼지지 않아요(트레이 아이콘 우클릭 → 서버 닫기, 또는 Ctrl+Q).<br>알림: 창이 보이면 알림 창, 최소화 · 트레이에 있으면 윈도우 알림.<br>공휴일: 공공데이터포털 <b>한국천문연구원_특일 정보</b>로 <b>매주 첫 영업일</b>에 그 주(월 ~ 일) 공휴일만 받아요(인증키 내장).`)}`)}

   ${sec("sync","경고 · 그래프 기준","⏳ 는 레드마인에서 <b>마지막으로 수정된 날</b>부터 지난 일수예요.",`
     <div class="srow"><span class="sl">오래 대기</span><div class="sc"><input type="number" id="sStale" min="1" max="365" value="${staleDays()}" class="num"> 일 이상이면 ⏳<label class="chk"><input type="checkbox" id="sStaleP" ${S.stale_progress==="1"?"checked":""}> 진행 중도 포함</label></div></div>
     <div class="srow"><span class="sl">추가 휴일</span><div class="sc"><input type="text" id="sHol" value="${esc(S.holiday_extra||"")}" placeholder="예) 2026-12-31, 2027-01-04"><span class="hint">알림이 건너뛸 날 (내장: 2026~2028 공휴일)</span></div></div>
     <div class="srow"><span class="sl">지켜보는 중</span><div class="sc"><input type="number" id="sWatch" min="0" max="365" value="${watchAutoDays()}" class="num"> 일 동안 변화가 없으면 오늘 화면에서 숨김<span class="hint">0 = 끔</span></div></div>
     <div class="srow"><span class="sl">용어 연결</span><div class="sc"><input type="number" id="sTL" min="1" max="50" value="${Math.max(1,parseInt(S.graph_term_link,10)||2)}" class="num"> 건 이상 같은 일감이면 그래프에서 점선으로 연결</div></div>`)}

   ${sec("view","화면 테마","누르면 바로 바뀌고 저장돼요.",`
     <label class="chk"><input type="checkbox" id="thAuto" ${ui.theme==="auto"?"checked":""}> 컴퓨터 설정 따라가기 (낮에는 밝게, 어두운 모드면 다크)</label>
     <div class="thgrid">${THEMES.map(t=>`<button type="button" class="thc ${t.id===ui.theme?"on":""}" data-th="${t.id}"><span class="sw">${t.c.map(c=>`<i style="background:${c}"></i>`).join("")}</span><b>${t.name}</b><small>${t.k}</small></button>`).join("")}</div>`)}

   ${sec("view","화면 구성","",`
     <div class="srow"><span class="sl">디자인</span><div class="sc"><div class="seg"><button type="button" id="dsOld" class="${V2()?"":"on"}">기존 디자인</button><button type="button" id="dsV2" class="${V2()?"on":""}">새 디자인</button></div></div></div>
     <div class="srow"><span class="sl">노트 모양</span><div class="sc"><div class="seg"><button type="button" id="nsDoc" class="${ui.noteStyle==="card"?"":"on"}">문서 스타일</button><button type="button" id="nsCard" class="${ui.noteStyle==="card"?"on":""}">카드</button></div></div></div>
     <div class="srow"><span class="sl">메뉴 줄 간격</span><div class="sc"><div class="seg"><button type="button" id="ndNorm" class="${ui.navDense?"":"on"}">보통</button><button type="button" id="ndDense" class="${ui.navDense?"on":""}">촘촘</button></div></div></div>
     <div class="srow"><span class="sl">메뉴에 보일 항목</span><div class="sc navopt">${NAV_OPT.map(([k,l])=>`<label class="chk"><input type="checkbox" data-navopt="${k}" ${(ui.navHide||[]).includes(k)?"":"checked"}> ${l}</label>`).join("")}<span class="hint">끈 항목은 왼쪽 메뉴에서 숨겨요 · <b>오늘</b>과 지금 보는 화면은 늘 보여요</span></div></div>
     <div class="srow"><span class="sl">확대/축소</span><div class="sc"><label class="chk"><input type="checkbox" id="zAllow" ${ui.allowZoom?"checked":""}> 허용</label><span class="hint">기본은 막혀 있어요 · Ctrl+0 = 100%</span></div></div>
     ${sMore(`<b>새 디자인</b>: 선 아이콘 · 밑줄 탭 · 묶은 메뉴로 화면을 덜어 낸 모양이에요. 정리 기록 자동 저장, 댓글 상태 선택칸, 목록형 오늘 화면 같은 동작도 함께 바뀌어요. 저장된 데이터는 똑같아요.<br><b>노트 모양</b>: 한 장의 문서(굵은 구분선 + 큰 제목)처럼 보거나 예전처럼 카드로 나눠 봐요.<br><b>메뉴 줄 간격</b>: 메뉴가 길어 스크롤이 생기면 촘촘으로. 새 디자인에서는 메뉴 묶음 제목을 눌러 접고, 가져오기 단추 옆 ▸ 로 아래 안내를 접어요.<br><b>확대/축소</b>: 크롬 기반이라 확대하면 화면이 어긋날 수 있어 기본은 막아 둬요(Ctrl+휠 · Ctrl +/- · 두 손가락). 글자 크기는 <b>글꼴</b> 탭에서 바꾸세요.`)}`)}

   ${sec("font","글꼴","서버에 저장돼서 어느 창에서 열어도 같아요.",`
     <div class="srow"><span class="sl">본문 글꼴</span><div class="sc"><select id="fBody">${fontOpts(BODY_FONTS,S.font_body)}</select></div></div>
     <div class="srow"><span class="sl">코드 글꼴</span><div class="sc"><select id="fMono">${fontOpts(MONO_FONTS,S.font_mono)}</select></div></div>
     <div class="srow"><span class="sl">글자 크기</span><div class="sc"><input type="range" id="fSize" min="12" max="20" step="1" value="${+S.font_size||14}"><span class="val" id="vSize">${+S.font_size||14}px</span></div></div>
     <div class="srow"><span class="sl">줄 간격</span><div class="sc"><input type="range" id="fLh" min="1.3" max="2" step="0.05" value="${+S.line_height||1.55}"><span class="val" id="vLh">${(+S.line_height||1.55).toFixed(2)}</span><button id="fReset">기본값으로</button></div></div>
     <div class="sample">가나다라마바사 ABC abc 0123 — 레드마인 노트<br><code class="ic">SELECT * FROM TPROD_DRAW</code></div>`)}

   ${sec("font","폰트 등록","등록한 폰트는 위 선택 목록에 나타나요.",`
     <div class="srow"><span class="sl">설치된 폰트</span><div class="sc"><input type="text" id="nName" placeholder="예: NanumSquare, 나눔바른고딕"><button id="nAdd">추가</button></div></div>
     <div class="srow"><span class="sl">파일 올리기</span><div class="sc"><input type="file" id="fFile" accept=".ttf,.otf,.woff,.woff2"><input type="text" id="fFname" placeholder="폰트 이름 (자동 입력)" style="max-width:12rem"><button id="fUp">등록</button></div></div>
     <div class="fitems">${names.map(n=>`<span class="fitem">${esc(n)} <span class="meta">${installed(n)?"설치됨":"이 PC에 없음"}</span><button class="x icon" data-rmname="${esc(n)}" style="border:0;padding:0 6px">✕</button></span>`).join("")}
          ${fontsReg.map(f=>`<span class="fitem">${esc(f.family)} <span class="meta">파일 ${kb(f.size)}</span><button class="x icon" data-rmfont="${esc(f.file)}" style="border:0;padding:0 6px">✕</button></span>`).join("")}</div>`)}

   ${sec("write","레드마인에 쓰기",`쓰는 것은 <b>댓글 · 상태 · 담당자/개발담당자</b>뿐이고 삭제는 못 해요. ${wc.test?`지금은 <b>시험 모드</b>라 ${wc.allow.map(x=>"#"+x).join(", ")} 에서만 올라가요.`:"모든 일감에 쓸 수 있어요."}`,`
     <div class="srow"><span class="sl">상태 번호</span><div class="sc">개발중 <input type="number" id="wsDev" value="${wc.statuses.dev}" class="num"> 최종확인요청 <input type="number" id="wsConf" value="${wc.statuses.confirm}" class="num"> 완료 <input type="number" id="wsDone" value="${wc.statuses.done}" class="num"></div></div>
     <p class="hint">버튼이 보내는 레드마인 상태 번호예요. 서버가 다르면 맞게 바꾸세요.</p>
     <div class="srow"><span class="sl">처음 안내 창</span><div class="sc"><button id="wsAck" title="처음 한 번만 나오는 안내 창을 다시 나오게 합니다">다시 보기</button><span class="hint">지금: ${S.write_ack_first==="1"?"끔":"켬"}</span></div></div>
     ${sFold("wlog","최근 쓰기 기록",wlog.length,wlog.map(l=>`<div class="bk"><span class="nm">${l.ok?"✓":"✕"} #${l.issue_id} · ${esc(l.action)}</span><span class="meta">${esc(l.at.replace("T"," "))} · ${esc(l.result)}</span></div>`).join("")||`<span class="meta">아직 쓴 기록이 없어요.</span>`)}`)}

   ${sec("write","배포요청","",`
     <label class="chk"><input type="checkbox" id="dpAuto" ${ui.autoDeployPg===false?"":"checked"}> 배포요청 댓글을 올리면 <b>#번호</b> 노트의 진행 기록에 “배포 요청 날짜”를 남김</label>
     <div class="srow"><span class="sl">오늘 배포요청 알림</span><div class="sc"><select id="dpAl" style="max-width:24rem"><option value="off" ${dpMode()==="off"?"selected":""}>끔</option><option value="on" ${dpMode()==="on"?"selected":""}>켬 — 앱을 켤 때·창으로 돌아올 때 확인</option><option value="auto" ${dpMode()==="auto"?"selected":""}>자동 — 10분마다 확인하고 새로 올라오면 알림</option></select></div></div>
     ${sMore(`오늘 날짜의 배포요청 일감이 있으면 왼쪽 메뉴 <b>배포요청</b> 옆에 <b>🚀</b> 가 보여요. 누르면 오늘 배포요청이 열려요. 모양은 <b>댓글</b>로 정해요: <b>🚀</b> = 마지막 <b>절취선</b> 뒤에 배포 요청이 남아 있음 · <b>착륙한 로켓</b> = 요청이 모두 절취선 앞(배포 끝) · <b>흐린 🚀</b> = 일감만 있고 요청이 아직 없음. 완료 뒤에 요청이 더 올라오면 바로 🚀 로 돌아와요.`)}`)}

   ${sec("backup","이 PC 백업",`<b>하루 1회 자동</b>으로 만들어요(최근 14개). 복원 · 업데이트 직전에도 따로 만들어요.`,`
     <div class="srow"><span class="sl">지금</span><div class="sc"><button class="primary" id="bNow">백업 만들기</button><a class="btn" href="/api/backup/download">파일로 내려받기</a>
       <label class="btn" style="cursor:pointer;margin:0;font-weight:400">파일에서 복원…<input type="file" id="bFile" accept=".zip,.db" style="display:none"></label></div></div>
     ${sFold("bks","백업 파일",bks.length,bks.map(b=>`<div class="bk"><span class="nm">${esc(b.name)}</span><span class="meta">${b.mtime} · ${kb(b.size)}</span><a class="btn" href="/api/backup/download?name=${encodeURIComponent(b.name)}">받기</a><button data-restore="${esc(b.name)}">복원</button><button class="danger" data-delbk="${esc(b.name)}">삭제</button></div>`).join("")||`<span class="meta">아직 백업이 없어요.</span>`)}
     ${sMore(`노트 · 사전 · 연결 정보 · 설정 · 등록한 폰트가 zip 하나로 묶여요. 가져오기와 서버 시작 때 하루 1회 자동 백업(최근 14개 보관)되고, 복원 직전에는 현재 상태를 따로 백업해요. 업데이트 뒤 처음 켤 때는 구조 변경 전에 <code class="ic">before-upgrade-…</code> 백업(최근 5개)을 만들어요. 저장 위치 폴더의 <code class="ic">backups</code> 에 있어요. API 키는 들어가지 않아요.`)}`)}
   ${gst?gbSection(gst,sec):""}

   ${sec("help","변경 내용","새 버전을 처음 열 때 <b>최근 바뀐 것 "+PATCH_SHOW+"가지</b>만 보여 줘요. 그보다 오래된 것은 아래 <b>사용 팁</b>에 주제별로 모여 있어요.",`
     <div class="srow"><span class="sl">패치 노트</span><div class="sc"><button id="pnOpen">최근 변경 보기</button><button id="pnLegacy">처음 2.x 안내 (1.x 에서 달라진 점)</button></div></div>`)}
   ${sec("help","사용 팁","지금까지 생긴 기능을 주제별로 모았어요. 위쪽이 최근 것이에요.",helpHtml())}
   </div></div>
  </div>`;
  if(keepTop)$("#modal .spane").scrollTop=keepTop;
  const q=s=>$("#modal "+s);
  q("#mclose").onclick=closeSettings;
  document.querySelectorAll("#modal [data-sfold]").forEach(d=>d.ontoggle=()=>{ui.setFold={...(ui.setFold||{}),[d.dataset.sfold]:d.open};saveUI()});
  document.querySelectorAll("#modal [data-stab]").forEach(b=>b.onclick=()=>{     // 탭: 다시 그리지 않고 보이는 묶음만 바꾼다 (고른 탭은 기억)
    q(".mbox").dataset.st=ui.setTab=b.dataset.stab;saveUI();q(".spane").scrollTop=0;
    document.querySelectorAll("#modal [data-stab]").forEach(x=>x.classList.toggle("on",x===b))});
  q("#cKey").onclick=()=>{closeSettings();showSetup({first:false})};
  q("#pnOpen").onclick=()=>showPatchNote(false);
  q("#pnLegacy").onclick=()=>showPatchNote(false,true);
  wireHelp(q(".spane"));
  q("#dpAuto").onchange=e=>{ui.autoDeployPg=e.target.checked;saveUI()};
  q("#dpAl").onchange=e=>{ui.depAlert=e.target.value;saveUI();checkDeployAlert(true);toast({off:"오늘 배포요청 알림을 껐어요",on:"알림 켬: 앱을 켤 때·창으로 돌아올 때 확인해요",auto:"알림 자동: 10분마다 확인해요"}[e.target.value],2600)};
  q("#zAllow").onchange=e=>{ui.allowZoom=e.target.checked;saveUI();toast(ui.allowZoom?"확대/축소를 허용했어요":"확대/축소를 막았어요",2200)};
  const setTh=v=>{ui.theme=v;saveUI();applyTheme();renderSettings();if(view==="graph")renderGraph()};
  q("#thAuto").onchange=e=>setTh(e.target.checked?"auto":"light");
  document.querySelectorAll("#modal [data-th]").forEach(b=>b.onclick=()=>setTh(b.dataset.th));
  const setNs=v=>{ui.noteStyle=v;saveUI();renderSettings();if(view==="note")renderCenter()};
  q("#nsDoc").onclick=()=>setNs("doc");q("#nsCard").onclick=()=>setNs("card");
  const setDs=v=>{ui.design=v;saveUI();applyTheme();if(v!=="v2")eiRestore();renderAll();renderSettings()};
  q("#dsOld").onclick=()=>setDs("classic");q("#dsV2").onclick=()=>setDs("v2");
  const setNd=v=>{ui.navDense=v;saveUI();applyTheme();renderSettings()};
  q("#ndNorm").onclick=()=>setNd(false);q("#ndDense").onclick=()=>setNd(true);
  $("#modal").querySelectorAll("[data-navopt]").forEach(c=>c.onchange=()=>{const k=c.dataset.navopt,h=new Set(ui.navHide||[]);
    if(c.checked)h.delete(k);else h.add(k);ui.navHide=[...h];
    if(k==="dict"&&!c.checked){if(isNarrow())dictOv=false;else ui.hr=true;applyUI();renderDict()}     // 주제 사전 단추를 숨기면 열고 닫을 곳이 없어지니 칸도 닫는다
    saveUI();renderNav()});
  [["#wsDev","st_dev"],["#wsConf","st_confirm"],["#wsDone","st_done"]].forEach(([id,k])=>q(id).onchange=async e=>{
    const v=Math.max(1,parseInt(e.target.value,10)||0);if(!v){return}
    await saveS(k,v);cfg=await api("/api/config");toast("저장했습니다",1500)});
  q("#wsAck").onclick=async()=>{await saveS("write_ack_first","0");await saveS("write_ack_status","0");toast("다음에 쓸 때 안내 창이 다시 나옵니다",3000);renderSettings()};
  q("#cQuit").onclick=()=>confirmQuit();
  q("#cDirGo").onclick=async()=>{
    const path=q("#cDir").value.trim(),go=async(extra={})=>{
      try{
        const r=await post("/api/datadir",{path,...extra});
        if(r.restart){if(await askC("저장 위치를 바꿨습니다. 새 위치는 프로그램을 다시 시작해야 적용됩니다.\n지금 종료할까요? (종료 후 프로그램을 다시 실행하세요)"))quitApp()}
        else toast("이미 이 위치를 쓰고 있습니다",2500);
      }catch(e){
        const m=e.message;
        if(m.includes("네트워크 폴더")){if(await askC(m+"\n그래도 이 폴더를 쓸까요?"))go({...extra,force:true})}
        else if(m.includes("이미 notes.db")){if(await askC(m+"\n(확인: 그 파일을 그대로 사용 / 취소: 변경 안 함)"))go({...extra,use_existing:true})}
        else wdlg({title:"저장 위치를 바꾸지 못했어요",body:esc(m).replace(/\n/g,"<br>"),cancel:""});
      }
    };
    go();
  };
  q("#nFlash").onchange=e=>{saveS("notify_flash",e.target.checked?"1":"0");toast(e.target.checked?"보고 있지 않을 때 작업 표시줄 아이콘을 반짝여요":"반짝이지 않아요",2400)};
  q("#nToast").onchange=e=>{saveS("notify_toast",e.target.checked?"1":"0");toast(e.target.checked?"보고 있지 않을 때 윈도우 알림을 띄워요":"윈도우 알림을 띄우지 않아요",2400)};
  q("#sAuto").onchange=e=>{saveS("auto_check",e.target.checked?"1":"0");toast(e.target.checked?"처음 열 때 최근 7일 변경을 확인합니다":"처음 열 때 자동 확인을 끕니다",2500)};
  q("#sAutoSync").onchange=async e=>{
    const raw=parseInt(e.target.value,10)||0,v=raw>0?Math.max(AUTO_SYNC_MIN,Math.min(1440,raw)):0;e.target.value=v;
    await saveS("auto_sync_min",v);await autoSyncPoll();
    toast(!v?"자동 가져오기를 껐어요":`${raw<AUTO_SYNC_MIN?`레드마인 부하를 줄이려고 최소 ${AUTO_SYNC_MIN}분으로 맞췄어요 · `:""}${v}분마다 자동으로 가져와요${S.last_sync?"":" (처음 한 번은 왼쪽 가져오기로 직접 받아 주세요)"}`,4000)};
  const holToast=h=>h.days.length?h.days.map(d=>`${d.date.slice(5)} ${d.name}`).join(", "):"이번 주 공휴일 없음";
  if(q("#sHolFetch"))q("#sHolFetch").onclick=async()=>{
    try{const h=await post("/api/holiday/fetch",{});toast(`이번 주 공휴일을 받았어요 (${holToast(h)})`,4000)}catch(e){toast("공휴일을 받지 못했어요: "+e.message,10000)}
    await autoSyncPoll();renderSettings()};
  q("#sAutoNotify").onchange=e=>{saveS("auto_sync_notify",e.target.checked?"1":"0");toast(e.target.checked?"새 일감이 들어오면 알려 줘요":"새 일감 알림을 껐어요 (알림 없이 목록에만 반영해요)",2600)};
  q("#sAutoDays").onchange=async e=>{
    const v=Math.max(1,Math.min(AUTO_SYNC_MAX_DAYS,parseInt(e.target.value,10)||AUTO_SYNC_MAX_DAYS));e.target.value=v;
    await saveS("auto_sync_days",v);await autoSyncPoll();
    toast(v===1?"자동 가져오기는 오늘 바뀐 일감만 받아요":`자동 가져오기는 최근 ${v}일 동안 바뀐 일감을 받아요`,2600)};
  q("#sHol").onchange=async e=>{await saveS("holiday_extra",e.target.value.trim());sbc.hol=null;sbcLoad();toast("추가 휴일을 저장했어요",1800)};
  q("#sWatch").onchange=async e=>{await saveS("watch_auto_days",Math.max(0,Math.min(365,parseInt(e.target.value,10)||0)));renderList()};
  q("#sStale").onchange=async e=>{await saveS("stale_days",Math.max(1,Math.min(365,parseInt(e.target.value,10)||7)));renderTabs();renderList()};
  q("#sStaleP").onchange=async e=>{await saveS("stale_progress",e.target.checked?"1":"0");renderTabs();renderList()};
  q("#sTL").onchange=async e=>{await saveS("graph_term_link",Math.max(1,Math.min(50,parseInt(e.target.value,10)||2)))};
  q("#fBody").onchange=e=>{saveS("font_body",e.target.value);applyFont()};
  q("#fMono").onchange=e=>{saveS("font_mono",e.target.value);applyFont()};
  let tmr;const dsave=(k,v)=>{S[k]=String(v);applyFont();clearTimeout(tmr);tmr=setTimeout(()=>saveS(k,v),300)};
  q("#fSize").oninput=e=>{q("#vSize").textContent=e.target.value+"px";dsave("font_size",e.target.value)};
  q("#fLh").oninput=e=>{q("#vLh").textContent=(+e.target.value).toFixed(2);dsave("line_height",e.target.value)};
  q("#fReset").onclick=async()=>{for(const [k,v] of [["font_body",""],["font_mono",""],["font_size","14"],["line_height","1.55"]])await saveS(k,v);applyFont();renderSettings()};
  q("#nAdd").onclick=async()=>{const n=q("#nName").value.trim().replace(/["'\\]/g,"");if(!n)return;
    const list=[...new Set([...names,...n.split(",").map(s=>s.trim()).filter(Boolean)])];await saveS("font_names",JSON.stringify(list));renderSettings()};
  document.querySelectorAll("[data-rmname]").forEach(b=>b.onclick=async()=>{const n=b.dataset.rmname;
    await saveS("font_names",JSON.stringify(names.filter(x=>x!==n)));
    if(S.font_body===n)await saveS("font_body","");if(S.font_mono===n)await saveS("font_mono","");applyFont();renderSettings()});
  q("#fFile").onchange=e=>{const f=e.target.files[0];if(f&&!q("#fFname").value)q("#fFname").value=f.name.replace(/\.[^.]+$/,"")};
  q("#fUp").onclick=async()=>{const f=q("#fFile").files[0],name=q("#fFname").value.trim();
    if(!f||!name)return toast("파일과 폰트 이름을 입력하세요",3000);
    const ext=(f.name.match(/\.[^.]+$/)||[""])[0];
    try{fontsReg=await api(`/api/fonts?name=${encodeURIComponent(name)}&ext=${encodeURIComponent(ext)}`,{method:"POST",headers:{"Content-Type":"application/octet-stream"},body:await f.arrayBuffer()});
      applyFont();toast(`'${name}' 폰트를 등록했습니다. 위 목록에서 선택하세요`,4000);renderSettings()}catch(err){toast("등록 실패: "+err.message,6000)}};
  document.querySelectorAll("[data-rmfont]").forEach(b=>b.onclick=async()=>{
    const file=b.dataset.rmfont,fm=fontsReg.find(f=>f.file===file);
    fontsReg=await api("/api/fonts/"+encodeURIComponent(file),{method:"DELETE"});
    if(fm&&S.font_body===fm.family)await saveS("font_body","");if(fm&&S.font_mono===fm.family)await saveS("font_mono","");applyFont();renderSettings()});
  q("#bNow").onclick=async()=>{await api("/api/backup/now",{method:"POST"});toast("백업을 만들었습니다",2500);renderSettings()};
  const afterRestore=async r=>{await loadSettings();await loadAll();toast(`복원 완료: 노트 ${r.notes}건 · 용어 ${r.terms}개 (복원 직전 상태는 before-restore 백업에 보관)`,8000);renderSettings()};
  q("#bFile").onchange=async e=>{const f=e.target.files[0];if(!f)return;
    if(!await askC(`'${f.name}' 로 복원할까요?\n현재 노트·사전이 이 파일의 내용으로 교체됩니다. (복원 직전 상태는 자동으로 백업됩니다)`))return;
    try{afterRestore(await api("/api/restore",{method:"POST",headers:{"Content-Type":"application/octet-stream"},body:await f.arrayBuffer()}))}catch(err){toast("복원 실패: "+err.message,8000)}};
  document.querySelectorAll("[data-restore]").forEach(b=>b.onclick=async()=>{
    if(!await askC(`'${b.dataset.restore}' 로 복원할까요?\n현재 노트·사전이 이 백업의 내용으로 교체됩니다. (복원 직전 상태는 자동으로 백업됩니다)`))return;
    try{afterRestore(await api("/api/restore?name="+encodeURIComponent(b.dataset.restore),{method:"POST"}))}catch(err){toast("복원 실패: "+err.message,8000)}});
  document.querySelectorAll("[data-delbk]").forEach(b=>b.onclick=async()=>{
    if(!await askC(`백업 '${b.dataset.delbk}' 를 삭제할까요?`))return;
    await api("/api/backups/"+encodeURIComponent(b.dataset.delbk),{method:"DELETE"});renderSettings()});
  if(gst)gbWire(q,afterRestore);
  updWire();
}

/* ---------- 깃허브 백업: 올리기는 자동(고른 때), 내려받기(복원)는 백업 시점을 골라 직접 ---------- */
let gbHist=null,gbErr="";      // 백업 시점 목록 (누를 때만 깃허브에서 가져온다)
const gbWhen=s=>s?s.replace("T"," ").slice(0,16):"";
function gbLast(g){
  const l=g.last;if(!l)return `<span class="meta">아직 올린 적이 없어요.</span>`;
  const ok=l.ok?`<b style="color:#2b8a3e">✓ ${l.changed?"올림":"바뀐 것 없음"}</b>`:`<b style="color:#c0392b">✕ 실패</b>`;
  return `${ok} · ${esc(gbWhen(l.at))} (${esc(l.reason||"")})${l.ok?"":`<br><span style="color:#c0392b">${esc(l.error)}</span>`}${!l.ok&&g.last_ok?`<br><span class="meta">마지막으로 올린 때: ${esc(gbWhen(g.last_ok.at))}</span>`:""}`;
}
function gbSection(g,sec){
  const conflict=g.last&&!g.last.ok&&g.last.kind==="conflict",ready=g.token_set&&g.repo;
  const when=!g.auto?"자동으로 올리지 않아요. ‘지금 올리기’로 직접 올려요.":`앱 창을 닫을 때 올려요${g.hours?` · 켜져 있는 동안 <b>${g.hours}시간마다</b>${g.next?` (다음 <b>${esc(gbWhen(g.next))}</b>)`:""}`:""}.`;
  return sec("backup","깃허브 백업","노트 DB를 <b>내 비공개(Private) 깃허브 저장소</b>에 올려 둬요. 동기화가 아니라 백업이라, 내려받기(복원)는 직접 골라요.",`
     <div class="srow"><span class="sl">저장소</span><div class="sc"><input type="text" id="gbRepo" value="${esc(g.repo)}" placeholder="소유자/저장소 (예: kariyarn/redmine-notes-backup)"></div></div>
     <div class="srow"><span class="sl">브랜치</span><div class="sc"><input type="text" id="gbBranch" value="${esc(g.branch)}" style="width:10rem;flex:none"></div></div>
     <div class="srow"><span class="sl">토큰</span><div class="sc"><input type="text" id="gbToken" class="secret" autocomplete="off" spellcheck="false" placeholder="${g.token_set?"저장됨 — 바꿀 때만 새로 입력":"github_pat_…"}"><button id="gbSave" class="primary">저장 · 연결 확인</button>${g.token_set?`<button id="gbDisc" class="danger" title="토큰을 지우고 자동 올리기를 꺼요">연결 해제</button>`:""}</div></div>
     ${sMore(`준비: ① 깃허브에서 <b>Private</b> 저장소를 새로 만들고 ② <b>Settings → Developer settings → Fine-grained tokens</b> 에서 그 저장소 하나만 고르고 <b>Contents: Read and write</b> 권한으로 토큰을 만들어 넣으세요. 토큰은 이 PC에 암호화해서 저장하고 화면에 다시 보여 주지 않아요.<br>올리는 것은 노트 DB(노트 · 사전 · 메모 · 보관함 · 설정)뿐이에요. 폰트 · API 키 · 토큰은 올리지 않아요. 바뀐 게 없으면 올리지 않고, 저장소에 이 PC가 모르는 기록(다른 PC · 직접 수정)이 있으면 덮어쓰지 않고 멈춰요.`)}
     <div class="srow"><span class="sl">자동 올리기</span><div class="sc"><label class="chk"><input type="checkbox" id="gbAuto" ${g.auto?"checked":""} ${g.token_set?"":"disabled"}> 켜기</label>
       <span class="${g.auto?"":"dim"}">켜져 있는 동안 <input type="number" id="gbHours" min="0" max="${g.max_hours}" value="${g.hours}" class="num" ${g.auto?"":"disabled"}> 시간마다</span><span class="hint">0 = 앱을 닫을 때만</span></div></div>
     <p class="hint">${when} 꺼져 있는 사이에 시간이 지났으면 켤 때 한 번만 올려요. 요청이 겹치면 마지막 것 하나만 올려요.</p>
     <div class="srow"><span class="sl">마지막 결과</span><div class="sc" style="display:block;line-height:1.55">${g.busy?"올리는 중…":gbLast(g)}${g.queued?` <span class="meta">· 끝나면 한 번 더 올려요</span>`:""}</div></div>
     <div class="srow"><span class="sl"></span><div class="sc"><button id="gbUp" ${ready?"":"disabled"}>지금 올리기</button>${conflict?`<button id="gbForce" class="danger" title="저장소의 기록은 지우지 않고, 그 위에 이 PC의 노트를 이어서 올려요">그래도 이어서 올리기</button>`:""}<button id="gbHist" ${ready?"":"disabled"}>${gbHist?"백업 시점 다시 불러오기":"백업 시점 불러오기"}</button></div></div>
     ${gbErr?`<p class="hint bad">${esc(gbErr)}</p>`:""}
     ${gbHist?sFold("gbh","깃허브 백업 시점 (내려받기 · 복원)",gbHist.length,gbHist.length?gbHist.map(h=>`<div class="bk"><span class="nm" title="${esc(h.sha)}">${esc(h.message||h.sha.slice(0,7))}</span><span class="meta">${esc(h.at)} · ${esc(h.sha.slice(0,7))}</span><a class="btn" href="/api/gitbackup/download?sha=${encodeURIComponent(h.sha)}">받기</a><button data-gbrestore="${esc(h.sha)}" data-gbat="${esc(h.at)}">복원</button></div>`).join(""):`<span class="meta">저장소에 아직 백업이 없어요.</span>`):""}`,"gbSec");
}
function gbWire(q,afterRestore){
  const save=async(body,msg)=>{
    try{const r=await post("/api/gitbackup/config",body);
      if(r.check)toast(r.check.ok?"깃허브 저장소에 연결했어요":"연결 확인 실패: "+r.check.error,r.check.ok?2600:9000);else if(msg)toast(msg,2600);
      renderSettings()}catch(e){toast("저장하지 못했어요: "+e.message,6000)}};
  q("#gbSave").onclick=()=>{const tk=q("#gbToken").value.trim();gbHist=null;gbErr="";
    save({repo:q("#gbRepo").value.trim(),branch:q("#gbBranch").value.trim(),...(tk?{token:tk}:{})})};
  if(q("#gbDisc"))q("#gbDisc").onclick=async()=>{if(!await askC("깃허브 백업 연결을 해제할까요?\n이 PC에 저장된 토큰을 지우고 자동 올리기를 꺼요. 저장소의 백업은 그대로 남아요."))return;
    await post("/api/gitbackup/disconnect",{});gbHist=null;toast("연결을 해제했어요",2400);renderSettings()};
  q("#gbAuto").onchange=e=>save({auto:e.target.checked},e.target.checked?"깃허브 자동 올리기를 켰어요":"깃허브 자동 올리기를 껐어요");
  q("#gbHours").onchange=e=>{const v=Math.max(0,Math.min(24,parseInt(e.target.value,10)||0));save({hours:v},v?`켜져 있는 동안 ${v}시간마다 올려요`:"앱을 닫을 때만 올려요")};
  const up=async force=>{
    if(force&&!await askC("저장소에 이 PC가 모르는 기록이 있어요.\n그 기록은 지우지 않고, 그 위에 이 PC의 노트를 이어서 올릴까요?\n(다른 PC의 백업이라면 섞이지 않게 다른 저장소를 쓰는 편이 좋아요)"))return;
    toast("깃허브에 올리는 중…",0);
    try{const r=await post("/api/gitbackup/upload",{force});toast(r.changed?"깃허브에 올렸어요":"바뀐 게 없어서 올리지 않았어요",3000)}
    catch(e){toast("올리지 못했어요: "+e.message,9000)}
    renderSettings()};
  q("#gbUp").onclick=()=>up(false);
  if(q("#gbForce"))q("#gbForce").onclick=()=>up(true);
  q("#gbHist").onclick=async()=>{toast("백업 시점을 불러오는 중…",0);
    try{gbHist=await api("/api/gitbackup/history");gbErr="";ui.setFold={...(ui.setFold||{}),gbh:true};saveUI();toast(`백업 시점 ${gbHist.length}개를 불러왔어요`,2000)}catch(e){gbHist=null;gbErr=e.message;toast("불러오지 못했어요",3000)}
    renderSettings()};
  document.querySelectorAll("#modal [data-gbrestore]").forEach(b=>b.onclick=async()=>{
    if(!await askC(`깃허브 백업 (${b.dataset.gbat}) 으로 복원할까요?\n현재 노트·사전이 이 백업의 내용으로 교체됩니다. (복원 직전 상태는 이 PC의 backups 에 자동으로 백업됩니다)`))return;
    toast("깃허브에서 내려받아 복원하는 중…",0);
    try{afterRestore(await post("/api/gitbackup/restore",{sha:b.dataset.gbrestore}))}catch(err){toast("복원 실패: "+err.message,9000)}});
}

