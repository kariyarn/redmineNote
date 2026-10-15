/* ---------- 설정 창 (글꼴 · 시작 설정 · 백업/복원) ---------- */
function openSettings(){$("#modal").classList.add("show");renderSettings()}
function closeSettings(){$("#modal").classList.remove("show");if(view==="graph")renderGraph()}
$("#btnSet").onclick=openSettings;
$("#modal").onclick=e=>{if(e.target.id==="modal")closeSettings()};
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&$("#modal").classList.contains("show"))closeSettings()});
const fontOpts=(base,cur)=>`<option value="">기본값</option>`+fontList(base).map(n=>`<option value="${esc(n)}" ${n===cur?"selected":""}>${esc(KO[n]||n)}${installed(n)?"":" (이 PC에 없음)"}</option>`).join("");
async function renderSettings(){
  const keepTop=$("#modal").classList.contains("show")&&$("#modal .mbox")?$("#modal .mbox").scrollTop:0;     // 테마·노트 모양을 눌러 다시 그릴 때 보던 자리를 유지한다
  let bks=[];try{bks=await api("/api/backups")}catch(e){}
  let wlog=[];try{wlog=await api("/api/write/log?limit=12")}catch(e){}
  let ast=autoSync.st;try{ast=await api("/api/autosync")}catch(e){}
  let gst=null;try{gst=await api("/api/gitbackup")}catch(e){}      // 깃허브 백업 설정 · 마지막 결과 (토큰은 있는지만)      // 자동 가져오기 · 공휴일 상태 (서버가 알려 준 값)
  const aw=(ast&&ast.window)||["08:30","18:30"],hs=(ast&&ast.holiday)||{key_set:false,days:[],week:["",""]};
  const wc=wcfg(),names=extraNames();
  $("#modal").innerHTML=`<div class="mbox">
   <div class="mhead"><h3>설정</h3><button class="icon" id="mclose">✕</button></div>

   <div class="msec"><h4>계정 · 저장 위치</h4>
     <div class="desc">연결된 레드마인: <b>${esc(cfg.url)}</b> · 사용자 <b>${esc(cfg.meName||"확인 안 됨")}</b>. API 키는 화면에 표시하지 않습니다. 프로그램 버전 <b>${esc(cfg.appVersion||"")}</b>${cfg.newerDb?` · <span style="color:#c0392b">데이터는 더 새 버전(${esc(cfg.newerDb)})</span>`:""}</div>
     <div class="row" style="margin:0 0 14px"><button id="cKey">API 키 변경</button></div>
     <div class="desc">노트 DB(<code class="ic">notes.db</code>)·백업·폰트가 저장되는 폴더입니다. 기본값은 자동으로 정해지고, 바꾸면 현재 데이터를 새 폴더로 <b>복사</b>한 뒤 <b>프로그램을 다시 시작해야</b> 적용됩니다. 네트워크 폴더는 파일이 깨질 수 있어 권하지 않습니다. API 키 설정 파일은 항상 기본 위치에 남습니다.</div>
     <div class="frow"><label>저장 위치</label><input type="text" id="cDir" value="${esc(cfg.dataDir||"")}"><button id="cDirGo">변경</button></div>
     <div class="row"><button class="danger" id="cQuit" title="서버를 끕니다. 다시 쓰려면 프로그램을 실행하세요">프로그램 종료</button></div></div>

   <div class="msec"><h4>시작 설정</h4>
     <div class="desc">서버를 켠 뒤 처음 화면을 열 때 한 번만 실행됩니다. 이미 받은 일감은 다시 내려받지 않고, 바뀐 것만 갱신합니다.</div>
     <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="sAuto" ${S.auto_check==="1"?"checked":""}> 처음 열 때 최근 7일 동안 바뀐 일감을 자동으로 확인</label></div>

   <div class="msec"><h4>자동 가져오기</h4>
     <div class="desc">정한 간격마다 레드마인에서 바뀐 일감을 가져옵니다. 창을 최소화하거나 닫아 <b>트레이에만 있어도</b> 동작하고, <b>영업일(토 · 일 · 공휴일 제외) ${aw[0]} ~ ${aw[1]}</b> 에만 가져옵니다. 켜 두면 창을 닫아도 프로그램이 스스로 꺼지지 않습니다 (트레이 아이콘 우클릭 → 서버 닫기, 또는 Ctrl+Q).</div>
     <div class="frow"><label>간격</label><input type="number" id="sAutoSync" min="0" max="1440" step="5" value="${autoSyncMin()}" style="width:5.5rem;flex:none"> 분마다 (0 = 끔, 최소 ${AUTO_SYNC_MIN}분)</div>
     <div class="frow"><label>가져올 기간</label><input type="number" id="sAutoDays" min="1" max="${AUTO_SYNC_MAX_DAYS}" value="${autoSyncDays()}" style="width:5.5rem;flex:none"> 일 (최근 N일 동안 바뀐 일감 · 1 = 오늘만 · 최대 ${AUTO_SYNC_MAX_DAYS}일)</div>
     <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="sAutoNotify" ${autoSyncNotify()?"checked":""}> 새 일감이 들어오면 알림 (창이 보이면 알림 창, 최소화 · 트레이에 있으면 윈도우 알림)</label>
     <div class="desc">마지막으로 가져온 때부터 시간을 잽니다. 한 번도 가져온 적이 없으면 시작하지 않으니, 처음에는 왼쪽 <b>가져오기</b>로 직접 받아 주세요. 글을 쓰는 중에는 화면을 다시 그리지 않고 기다렸다가 반영합니다.</div>
     <div class="frow"><label>공휴일</label><span class="meta" style="flex:1">공공데이터포털 <b>한국천문연구원_특일 정보</b>(공휴일 정보 조회)로 <b>매주 첫 영업일</b>에 그 주(월 ~ 일) 공휴일만 받아요 (인증키 내장, 넣을 필요 없음)</span><button type="button" id="sHolFetch">이번 주 다시 받기</button></div>
     <div class="desc">${holidayLine(hs)}</div></div>

   <div class="msec"><h4>경고 · 그래프 기준</h4>
     <div class="desc">⏳ 표시는 레드마인에서 <b>마지막으로 수정된 날</b>부터 지난 일수 기준입니다.</div>
     <div class="frow"><label>오래 대기</label><input type="number" id="sStale" min="1" max="365" value="${staleDays()}" style="width:5.5rem;flex:none"> 일 이상 지난 대기 일감에 ⏳ 표시
       <label style="width:auto;display:inline-flex;gap:5px;align-items:center;font-weight:400"><input type="checkbox" id="sStaleP" ${S.stale_progress==="1"?"checked":""}> 진행 중도 포함</label></div>
     <div class="frow"><label>추가 휴일</label><input type="text" id="sHol" value="${esc(S.holiday_extra||"")}" placeholder="예) 2026-12-31, 2027-01-04" style="flex:1;min-width:12rem"> 알림이 건너뛸 날 (내장: 2026~2028 공휴일)</div>
     <div class="frow"><label>지켜보는 중</label><input type="number" id="sWatch" min="0" max="365" value="${watchAutoDays()}" style="width:5.5rem;flex:none"> 일 동안 변화가 없으면 오늘 화면에서 자동으로 숨김 (0 = 끔)</div>
     <div class="frow"><label>용어 연결</label><input type="number" id="sTL" min="1" max="50" value="${Math.max(1,parseInt(S.graph_term_link,10)||2)}" style="width:5.5rem;flex:none"> 건 이상 같은 일감을 가진 용어끼리 그래프에서 점선으로 연결</div>
   </div>

   <div class="msec"><h4>글꼴</h4>
     <div class="desc">설정은 서버에 저장되어 어느 브라우저에서 열어도 같고, 백업에도 포함됩니다.</div>
     <div class="frow"><label>본문 글꼴</label><select id="fBody">${fontOpts(BODY_FONTS,S.font_body)}</select></div>
     <div class="frow"><label>코드 글꼴</label><select id="fMono">${fontOpts(MONO_FONTS,S.font_mono)}</select></div>
     <div class="frow"><label>글자 크기</label><input type="range" id="fSize" min="12" max="20" step="1" value="${+S.font_size||14}"><span class="val" id="vSize">${+S.font_size||14}px</span></div>
     <div class="frow"><label>줄 간격</label><input type="range" id="fLh" min="1.3" max="2" step="0.05" value="${+S.line_height||1.55}"><span class="val" id="vLh">${(+S.line_height||1.55).toFixed(2)}</span></div>
     <div class="frow"><button id="fReset">기본값으로</button></div>
     <div class="sample">가나다라마바사 ABC abc 0123 — 레드마인 노트<br><code class="ic">SELECT * FROM TPROD_DRAW</code></div>

     <h4 style="margin-top:18px">폰트 등록</h4>
     <div class="desc">① 이 PC에 이미 설치된 폰트는 이름만 적어 추가하고, ② 설치되지 않은 폰트는 파일(.ttf .otf .woff .woff2)을 올려 등록합니다. 등록한 폰트는 위 선택 목록에 나타납니다.</div>
     <div class="frow"><label>설치된 폰트</label><input type="text" id="nName" placeholder="예: NanumSquare, 나눔바른고딕"><button id="nAdd">추가</button></div>
     <div class="frow"><label>파일 올리기</label><input type="file" id="fFile" accept=".ttf,.otf,.woff,.woff2"><input type="text" id="fFname" placeholder="폰트 이름 (자동 입력)" style="max-width:12rem"><button id="fUp">등록</button></div>
     <div>${names.map(n=>`<span class="fitem">${esc(n)} <span class="meta">${installed(n)?"설치됨":"이 PC에 없음"}</span><button class="x icon" data-rmname="${esc(n)}" style="border:0;padding:0 6px">✕</button></span>`).join("")}
          ${fontsReg.map(f=>`<span class="fitem">${esc(f.family)} <span class="meta">파일 ${kb(f.size)}</span><button class="x icon" data-rmfont="${esc(f.file)}" style="border:0;padding:0 6px">✕</button></span>`).join("")}</div></div>

   <div class="msec"><h4>화면 테마</h4>
     <div class="desc">너무 쨍하게 밝거나 너무 짙게 어둡지 않도록 맞춘 <b>10가지</b>예요. 누르면 바로 바뀌고 저장돼요.</div>
     <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="thAuto" ${ui.theme==="auto"?"checked":""}> 컴퓨터 설정 따라가기 (낮에는 밝게, 어두운 모드면 다크)</label>
     <div class="thgrid">${THEMES.map(t=>`<button type="button" class="thc ${t.id===ui.theme?"on":""}" data-th="${t.id}"><span class="sw">${t.c.map(c=>`<i style="background:${c}"></i>`).join("")}</span><b>${t.name}</b><small>${t.k}</small></button>`).join("")}</div></div>

   <div class="msec"><h4>화면 디자인</h4>
     <div class="desc"><b>새 디자인</b>은 선 아이콘 · 밑줄 탭 · 묶은 메뉴로 화면을 덜어 낸 모양이에요. 정리 기록 자동 저장, 댓글 상태 선택칸, 목록형 오늘 화면 같은 몇 가지 동작도 함께 바뀌어요. 누르면 바로 바뀌고, 언제든 기존으로 돌아갈 수 있어요. 저장된 데이터는 똑같아요.</div>
     <div class="row" style="margin:0"><div class="seg"><button type="button" id="dsOld" class="${V2()?"":"on"}">기존 디자인</button><button type="button" id="dsV2" class="${V2()?"on":""}">새 디자인</button></div></div>
     <div class="desc" style="margin-top:12px"><b>왼쪽 메뉴 줄 간격</b> — 메뉴가 길어 스크롤이 생기면 <b>촘촘</b>으로 바꿔 보세요. 새 디자인에서는 <b>일감 · 내 도구 · 보관함 · 분석</b> 제목을 누르면 묶음을 접을 수 있고, 가져오기 단추 옆 ▸ 로 마지막 가져오기 · 기간을 접을 수 있어요.</div>
     <div class="row" style="margin:0"><div class="seg"><button type="button" id="ndNorm" class="${ui.navDense?"":"on"}">보통</button><button type="button" id="ndDense" class="${ui.navDense?"on":""}">촘촘</button></div></div></div>

   <div class="msec"><h4>노트 모양</h4>
     <div class="desc">노트 화면을 <b>한 장의 문서</b>(굵은 구분선 + 큰 제목)처럼 보거나, 예전처럼 <b>카드</b>로 나눠 볼 수 있어요. 누르면 바로 바뀌고, 선택은 저장돼요. 내용·저장 데이터는 똑같아요.</div>
     <div class="row" style="margin:0"><div class="seg"><button type="button" id="nsDoc" class="${ui.noteStyle==="card"?"":"on"}">문서 스타일</button><button type="button" id="nsCard" class="${ui.noteStyle==="card"?"on":""}">기존 스타일 (카드)</button></div></div></div>

   <div class="msec"><h4>배포요청</h4>
     <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="dpAuto" ${ui.autoDeployPg===false?"":"checked"}> 배포요청 댓글을 올리면, 댓글에 적은 <b>#번호</b> 노트의 진행 기록에 “배포 요청 날짜”를 자동으로 남김</label>
     <div class="frow" style="margin-top:10px"><label>오늘 배포요청 알림</label><select id="dpAl" style="max-width:24rem"><option value="off" ${dpMode()==="off"?"selected":""}>끔</option><option value="on" ${dpMode()==="on"?"selected":""}>켬 — 앱을 켤 때·창으로 돌아올 때 확인</option><option value="auto" ${dpMode()==="auto"?"selected":""}>자동 — 10분마다 확인하고 새로 올라오면 알림</option></select></div>
     <div class="desc">오늘 날짜의 배포요청 일감이 있으면 왼쪽 메뉴 <b>배포요청</b> 옆에 <b>🚀</b> 가 보여요(‘더 보기’가 접혀 있으면 거기에도). 누르면 오늘 배포요청이 열려요. 모양은 <b>댓글</b>로 정해요: <b>🚀</b> = 마지막 <b>절취선</b>(구분선) 뒤에 배포 요청이 남아 있음 · <b>착륙한 로켓</b> = 요청이 모두 절취선 앞(배포 끝) · <b>흐린 🚀</b> = 일감만 있고 요청이 아직 없음. 완료 뒤에 요청이 더 올라오면 바로 🚀 로 돌아와요. (상태 ‘완료’는 요청이 없는 날에도 찍혀서 쓰지 않아요)</div></div>

   <div class="msec"><h4>화면 확대/축소</h4>
     <div class="desc">크롬 기반이라 확대/축소하면 화면이 어긋날 수 있어서 <b>기본은 막혀 있어요</b> (Ctrl+휠 · Ctrl +/- · 두 손가락 확대). 글자 크기는 위쪽 <b>글꼴 → 글자 크기</b>에서 바꾸세요. 막힌 상태에서도 <b>Ctrl+0</b> 은 100% 로 되돌려요.</div>
     <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="zAllow" ${ui.allowZoom?"checked":""}> 확대/축소 허용 (기본: 꺼짐)</label></div>

   <div class="msec"><h4>패치 노트</h4>
     <div class="desc"><b>이번 변경</b>은 오늘 바뀐 내용만 짧게 모았어요. <b>레거시</b>는 예전(1.x → 2.x) 안내 전체예요.</div>
     <div class="row" style="margin:0"><button id="pnOpen">이번 변경 보기</button><button id="pnLegacy">이전 패치 노트 (레거시)</button></div></div>

   <div class="msec"><h4>레드마인에 쓰기</h4>
     <div class="desc">이 프로그램이 레드마인에 쓰는 것은 <b>댓글 · 상태 · 담당자/개발담당자</b> 세 가지뿐이고, 삭제는 못 합니다.
       ${wc.test?`현재 <b>시험 모드</b>라서 ${wc.allow.map(x=>"#"+x).join(", ")} 에서만 올라갑니다. (해제하려면 허용 목록을 비우고 프로그램을 다시 빌드합니다)`:`시험 모드가 꺼져 있어 모든 일감에 쓸 수 있습니다.`}</div>
     <div class="frow"><label>상태 번호</label>개발중 <input type="number" id="wsDev" value="${wc.statuses.dev}" style="width:5rem;flex:none"> 최종확인요청 <input type="number" id="wsConf" value="${wc.statuses.confirm}" style="width:5rem;flex:none"> 완료 <input type="number" id="wsDone" value="${wc.statuses.done}" style="width:5rem;flex:none"></div>
     <div class="desc">버튼이 보내는 레드마인 상태 번호입니다. 서버가 다르면 맞게 바꾸세요 (기본값은 이 회사 레드마인 기준).</div>
     <div class="row" style="margin:0 0 10px"><button id="wsAck" title="처음 한 번만 나오는 안내 창을 다시 나오게 합니다">안내 창 다시 보기</button><span class="meta">지금: 안내 ${S.write_ack_first==="1"?"끔":"켬"}</span></div>
     <div class="desc"><b>최근 쓰기 기록</b> (성공·실패 모두)</div>
     ${wlog.map(l=>`<div class="bk"><span class="nm">${l.ok?"✓":"✕"} #${l.issue_id} · ${esc(l.action)}</span><span class="meta">${esc(l.at.replace("T"," "))} · ${esc(l.result)}</span></div>`).join("")||`<span class="meta">아직 쓴 기록이 없습니다.</span>`}</div>

   <div class="msec"><h4>백업 · 복원</h4>
     <div class="desc">노트·사전·연결 정보·설정·등록한 폰트가 zip 하나로 묶입니다. 가져오기와 서버 시작 때 <b>하루 1회 자동 백업</b>되고(최근 ${14}개 보관), 복원 직전에는 현재 상태를 자동으로 따로 백업합니다. 프로그램을 업데이트한 뒤 처음 켤 때는 <b>구조 변경 전에 <code class="ic">before-upgrade-…</code> 백업</b>이 따로 만들어집니다(최근 5개 보관). 백업은 위 저장 위치 폴더의 <code class="ic">backups</code>에 저장됩니다. (API 키는 백업에 들어가지 않습니다)</div>
     <div class="row" style="margin:0 0 12px"><button class="primary" id="bNow">지금 백업 만들기</button><a class="btn" href="/api/backup/download" style="padding:6px 12px">현재 상태를 파일로 내려받기</a>
       <label class="btn" style="padding:6px 12px;cursor:pointer;margin:0;font-weight:400">파일에서 복원…<input type="file" id="bFile" accept=".zip,.db" style="display:none"></label></div>
     ${bks.map(b=>`<div class="bk"><span class="nm">${esc(b.name)}</span><span class="meta">${b.mtime} · ${kb(b.size)}</span><a class="btn" href="/api/backup/download?name=${encodeURIComponent(b.name)}">다운로드</a><button data-restore="${esc(b.name)}">복원</button><button class="danger" data-delbk="${esc(b.name)}">삭제</button></div>`).join("")||`<span class="meta">아직 백업이 없습니다.</span>`}</div>
   ${gst?gbSection(gst):""}
  </div>`;
  if(keepTop)$("#modal .mbox").scrollTop=keepTop;
  const q=s=>$("#modal "+s);
  q("#mclose").onclick=closeSettings;
  q("#cKey").onclick=()=>{closeSettings();showSetup({first:false})};
  q("#pnOpen").onclick=()=>showPatchNote(false);
  q("#pnLegacy").onclick=()=>showPatchNote(false,true);
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
}

/* ---------- 깃허브 백업: 올리기는 자동(고른 때), 내려받기(복원)는 백업 시점을 골라 직접 ---------- */
let gbHist=null,gbErr="";      // 백업 시점 목록 (누를 때만 깃허브에서 가져온다)
const GB_MODE={off:"끔",close:"앱 창을 닫을 때",hours:"정한 시간마다",daily:"매일 정한 시각"};
const gbWhen=s=>s?s.replace("T"," ").slice(0,16):"";
function gbLast(g){
  const l=g.last;if(!l)return `<span class="meta">아직 올린 적이 없어요.</span>`;
  const ok=l.ok?`<b style="color:#2b8a3e">✓ ${l.changed?"올림":"바뀐 것 없음"}</b>`:`<b style="color:#c0392b">✕ 실패</b>`;
  return `${ok} · ${esc(gbWhen(l.at))} (${esc(l.reason||"")})${l.ok?"":`<br><span style="color:#c0392b">${esc(l.error)}</span>`}${!l.ok&&g.last_ok?`<br><span class="meta">마지막으로 올린 때: ${esc(gbWhen(g.last_ok.at))}</span>`:""}`;
}
function gbSection(g){
  const conflict=g.last&&!g.last.ok&&g.last.kind==="conflict";
  return `<div class="msec" id="gbSec"><h4>깃허브 백업</h4>
     <div class="desc">노트 DB와 등록한 폰트를 <b>내 비공개(Private) 깃허브 저장소</b>에 올려 둡니다. <b>동기화가 아니라 백업</b>이라, 올리기만 자동이고 내려받기(복원)는 아래 목록에서 직접 골라요. 바뀐 게 없으면 올리지 않고, 저장소에 이 PC가 모르는 기록(다른 PC · 직접 수정)이 있으면 덮어쓰지 않고 멈춰요. API 키 · 토큰은 올라가지 않아요.</div>
     <div class="desc">준비: ① 깃허브에서 <b>Private</b> 저장소를 새로 만들고 ② <b>Settings → Developer settings → Fine-grained tokens</b> 에서 그 저장소 하나만 고르고 <b>Contents: Read and write</b> 권한으로 토큰을 만들어 아래에 넣으세요. 토큰은 이 PC에 암호화해서 저장하고 화면에 다시 보여 주지 않아요.</div>
     <div class="frow"><label>저장소</label><input type="text" id="gbRepo" value="${esc(g.repo)}" placeholder="소유자/저장소 (예: kariyarn/redmine-notes-backup)"></div>
     <div class="frow"><label>브랜치</label><input type="text" id="gbBranch" value="${esc(g.branch)}" style="width:10rem;flex:none"></div>
     <div class="frow"><label>토큰</label><input type="password" id="gbToken" autocomplete="off" placeholder="${g.token_set?"저장됨 — 바꿀 때만 새로 입력":"github_pat_…"}"><button id="gbSave" class="primary">저장 · 연결 확인</button>${g.token_set?`<button id="gbDisc" class="danger" title="토큰을 지우고 자동 올리기를 꺼요">연결 해제</button>`:""}</div>
     <div class="frow"><label>올리는 때</label><select id="gbMode" style="max-width:14rem" ${g.token_set?"":"disabled"}>${Object.entries(GB_MODE).map(([k,v])=>`<option value="${k}" ${g.mode===k?"selected":""}>${v}</option>`).join("")}</select>
       <span id="gbHoursW" ${g.mode==="hours"?"":"hidden"}><input type="number" id="gbHours" min="${g.min_hours}" max="${g.max_hours}" value="${g.hours}" style="width:4.5rem"> 시간마다</span>
       <span id="gbAtW" ${g.mode==="daily"?"":"hidden"}><input type="time" id="gbAt" value="${esc(g.at)}" style="width:7.5rem"> 에</span></div>
     <div class="desc">${g.mode==="close"?"앱 창을 닫거나 프로그램을 끌 때 올려요.":g.mode==="hours"||g.mode==="daily"?`프로그램이 켜져 있는 동안 올려요 (창을 닫아 트레이에만 있어도). 켜 두면 창을 닫아도 프로그램이 스스로 꺼지지 않아요.${g.mode==="daily"?" 그 시각에 꺼져 있었으면 다음에 켤 때 올려요.":""}`:"자동으로 올리지 않아요. 아래 '지금 올리기'로 직접 올릴 수 있어요."}${g.next?` · 다음 예정 <b>${esc(gbWhen(g.next))}</b>`:""}</div>
     <div class="frow"><label>마지막 결과</label><span style="flex:1;line-height:1.5">${g.busy?"올리는 중…":gbLast(g)}</span></div>
     <div class="row" style="margin:0 0 12px"><button id="gbUp" ${g.token_set&&g.repo?"":"disabled"}>지금 올리기</button>${conflict?`<button id="gbForce" class="danger" title="저장소의 기록은 지우지 않고, 그 위에 이 PC의 노트를 이어서 올려요">그래도 이어서 올리기</button>`:""}<button id="gbHist" ${g.token_set&&g.repo?"":"disabled"}>${gbHist?"백업 시점 다시 불러오기":"백업 시점 불러오기 (내려받기 · 복원)"}</button></div>
     ${gbErr?`<div class="desc" style="color:#c0392b">${esc(gbErr)}</div>`:""}
     ${gbHist?(gbHist.length?gbHist.map(h=>`<div class="bk"><span class="nm" title="${esc(h.sha)}">${esc(h.message||h.sha.slice(0,7))}</span><span class="meta">${esc(h.at)} · ${esc(h.sha.slice(0,7))}</span><a class="btn" href="/api/gitbackup/download?sha=${encodeURIComponent(h.sha)}">파일로 받기</a><button data-gbrestore="${esc(h.sha)}" data-gbat="${esc(h.at)}">복원</button></div>`).join(""):`<span class="meta">저장소에 아직 백업이 없어요.</span>`):""}
   </div>`;
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
  q("#gbMode").onchange=e=>{const m=e.target.value;save({mode:m},m==="off"?"깃허브 자동 올리기를 껐어요":`이제 '${GB_MODE[m]}' 올려요`)};
  q("#gbHours").onchange=e=>save({hours:e.target.value},"올리는 간격을 저장했어요");
  q("#gbAt").onchange=e=>e.target.value&&save({at:e.target.value},"올리는 시각을 저장했어요");
  const up=async force=>{
    if(force&&!await askC("저장소에 이 PC가 모르는 기록이 있어요.\n그 기록은 지우지 않고, 그 위에 이 PC의 노트를 이어서 올릴까요?\n(다른 PC의 백업이라면 섞이지 않게 다른 저장소를 쓰는 편이 좋아요)"))return;
    toast("깃허브에 올리는 중…",0);
    try{const r=await post("/api/gitbackup/upload",{force});toast(r.changed?"깃허브에 올렸어요":"바뀐 게 없어서 올리지 않았어요",3000)}
    catch(e){toast("올리지 못했어요: "+e.message,9000)}
    renderSettings()};
  q("#gbUp").onclick=()=>up(false);
  if(q("#gbForce"))q("#gbForce").onclick=()=>up(true);
  q("#gbHist").onclick=async()=>{toast("백업 시점을 불러오는 중…",0);
    try{gbHist=await api("/api/gitbackup/history");gbErr="";toast(`백업 시점 ${gbHist.length}개를 불러왔어요`,2000)}catch(e){gbHist=null;gbErr=e.message;toast("불러오지 못했어요",3000)}
    renderSettings()};
  document.querySelectorAll("#modal [data-gbrestore]").forEach(b=>b.onclick=async()=>{
    if(!await askC(`깃허브 백업 (${b.dataset.gbat}) 으로 복원할까요?\n현재 노트·사전이 이 백업의 내용으로 교체됩니다. (복원 직전 상태는 이 PC의 backups 에 자동으로 백업됩니다)`))return;
    toast("깃허브에서 내려받아 복원하는 중…",0);
    try{afterRestore(await post("/api/gitbackup/restore",{sha:b.dataset.gbrestore}))}catch(err){toast("복원 실패: "+err.message,9000)}});
}

