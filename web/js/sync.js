/* ---------- 가져오기 ---------- */
async function doSync(f,t,auto=false){
  toast(auto?"최근 7일 변경된 일감을 확인하는 중…":"가져오는 중… 새로 생기거나 바뀐 일감만 상세 조회합니다 (처음에는 몇 분 걸릴 수 있어요)",0);$("#sync").disabled=true;
  try{const r=await post("/api/sync",{from:f,to:t});
    (r.added_ids||[]).forEach(i=>fresh[i]="신규");(r.changed_ids||[]).forEach(i=>fresh[i]="변경");
    await loadAll();await loadSettings();renderLastSync();
    const bad=r.failed.length?` · 확인 필요 ${r.failed.length}건`:"",sk=r.skipped&&r.skipped.length?` · 권한 없음 등 건너뜀 ${r.skipped.length}건`:"";
    if(auto)toast(r.added+r.changed?`최근 7일 확인: 신규 ${r.added} · 변경 ${r.changed}건이 있어요${bad}`:`새로 바뀐 일감이 없어요 (${r.found}건 확인)${bad}`,r.failed.length?10000:6000);
    else toast(`완료: ${r.found}건 (신규 ${r.added} · 변경 ${r.changed} · 그대로 ${r.unchanged})${bad}${sk}`,r.failed.length?12000:8000);
    if(r.aborted)toast(`연결이 불안정해서 중간에 멈췄어요 (${r.aborted}). 이미 받은 일감은 저장돼 있어요. 잠시 뒤 다시 가져오면 나머지를 이어서 받습니다`,15000);
    if(r.failed.length&&!auto)showSyncReport();      // 실패가 있으면 이유와 할 일을 바로 보여 준다
  }catch(e){
    const m=/Failed to fetch|NetworkError/i.test(e.message)?"프로그램(서버)에 연결할 수 없어요. 프로그램이 종료됐을 수 있으니 다시 실행해 주세요.":e.message;
    toast(`가져오기를 마치지 못했어요: ${m} (이미 받은 일감은 그대로이고, 다시 가져오면 나머지만 이어서 받습니다)`,14000);
  }
  $("#sync").disabled=false;
}
$("#sync").onclick=async()=>{
  const [f,t]=syncDates();
  if(!f||!t)return toast("가져오기 기간을 확인하세요",2500);
  if((new Date(t)-new Date(f))/864e5>92&&!await askC("기간이 3개월을 넘습니다. 처음 받을 때는 오래 걸리고 레드마인에 부하가 갑니다. 계속할까요?"))return;
  doSync(f,t);
};

/* ---------- 자동 가져오기 (2.15): 서버가 설정한 간격마다 스스로 가져온다 (rnotes/autosync.py) ----------
   창이 최소화돼 있거나 닫혀 트레이에만 있어도 서버가 돌고, 업무 시간(08:30 ~ 18:30)에만 가져온다.
   화면은 30초마다(창으로 돌아오면 바로) 결과를 확인해서, 바뀐 일감이 있으면 다시 읽어 그린다.
   글을 쓰는 중 · 편집 화면 · 대화 상자 · 창이 가려진 동안에는 '다시 그리기'만 미룬다 (쓰던 글이 날아가지 않게. 가져오기는 서버가 이미 했다) */
const AUTO_SYNC_MIN=5,AUTO_SYNC_MAX_DAYS=7;      // 서버(autosync.py)와 같은 값: 가장 짧은 간격(분) · 가장 긴 기간(일)
const autoSyncMin=()=>{const v=parseInt(S.auto_sync_min,10);return v>0?Math.max(AUTO_SYNC_MIN,Math.min(1440,v)):0};
const autoSyncDays=()=>{const v=parseInt(S.auto_sync_days,10);return v>0?Math.min(AUTO_SYNC_MAX_DAYS,v):AUTO_SYNC_MAX_DAYS};
const autoSync={seq:null,pend:null,err:"",st:null,timer:null,busy:null};      // seq: 마지막으로 본 결과 번호 · pend: 다시 그리기를 미룬 결과 · st: 서버 상태 · busy: 지금 확인 중(겹치지 않게)
const autoSyncHold=()=>document.hidden||(isTyping()&&document.activeElement!==$("#q"))||!!editing||trEd||qvEd||codeEd||$("#sync").disabled||$("#modal").classList.contains("show")||!!$("#wdlg.show")||!!$("#setup.show")||!!$("#lbox.show");      // 검색창은 다시 그려도 그대로라서 미루지 않는다
const autoSyncTip=st=>{const n=st.next?new Date(st.next):null,d=n?fmt(n):"";
  return `${st.minutes}분마다 최근 ${st.days}일 동안 바뀐 일감을 자동으로 가져와요 (영업일 ${st.window[0]} ~ ${st.window[1]}, 창을 닫아도 트레이에서)`+(st.holiday&&st.holiday.today_off?" · 오늘은 쉬는 날":"")+(n?` · 다음 ${d===todayStr()?"":d.slice(5)+" "}${z(n.getHours())}:${z(n.getMinutes())} 무렵`:"")};
/* 설정 창의 공휴일 한 줄: 이번 주에 받은 공휴일 · 받은 때 · 마지막 오류 (인증키가 없으면 내장 표로 본다는 안내) */
const holidayLine=h=>{
  if(!h.key_set)return `인증키가 없으면 공휴일을 새로 받지 않고, 내장 공휴일 표(2026 ~ 2028) · 아래 <b>경고 · 그래프 기준 › 추가 휴일</b> · 이미 받아 둔 공휴일로 쉬는 날을 판단해요.`;
  const w=`이번 주(${h.week[0].slice(5)} ~ ${h.week[1].slice(5)})`;
  const got=h.fetched?`${w} 공휴일: <b>${h.days.length?h.days.map(x=>`${esc(x.date.slice(5))} ${esc(x.name)}`).join(", "):"없음"}</b> · ${esc(h.fetched_at.slice(5).replace("T"," "))} 받음`:`${w} 공휴일은 아직 받지 않았어요 (영업일 업무 시간에 자동으로 받아요)`;
  return got+(h.error?` · <span style="color:#c0392b">${esc(h.error_at.slice(5).replace("T"," "))} ${esc(h.error)}</span>`:"");      // 설정 창의 다른 경고와 같은 색
};
function autoSyncPoll(){      // 타이머 · 창 복귀 · 설정 변경이 겹쳐 불러도 한 번만 돈다 (같은 결과를 두 번 받지 않게)
  return autoSync.busy||(autoSync.busy=autoSyncPollOnce().finally(()=>{autoSync.busy=null}));
}
async function autoSyncPollOnce(){
  let st;try{st=await api("/api/autosync"+(autoSync.seq==null?"":"?since="+autoSync.seq))}catch(e){return}
  autoSync.st=st;
  if(autoSync.seq==null){autoSync.seq=st.seq;renderLastSync();return}      // 처음 열었을 때: 그때까지의 결과는 이미 화면에 있다
  st.runs.forEach(r=>{
    const p=autoSync.pend||(autoSync.pend={added:new Set(),changed:new Set()});
    autoSync.seq=Math.max(autoSync.seq,r.seq);
    r.added_ids.forEach(id=>p.added.add(id));r.changed_ids.forEach(id=>p.changed.add(id));
    if(r.error&&r.error!==autoSync.err)toast(`자동 가져오기를 하지 못했어요: ${r.error} · ${st.minutes}분 뒤에 다시 시도해요`,8000);      // 같은 오류는 한 번만 알린다
    autoSync.err=r.error||"";
  });
  if(autoSync.pend&&!autoSyncHold())await autoSyncApply();else renderLastSync();
}
async function autoSyncApply(){
  const p=autoSync.pend;autoSync.pend=null;
  p.added.forEach(id=>fresh[id]="신규");p.changed.forEach(id=>{if(!p.added.has(id))fresh[id]="변경"});
  try{await loadSettings()}catch(e){}      // 마지막 가져오기 시각
  const nA=p.added.size,nC=[...p.changed].filter(id=>!p.added.has(id)).length;
  if(nA||nC){const c=$("#center"),top=c.scrollTop;await loadAll();c.scrollTop=top;if(cmOpen)cmPanelRender();
    if(nA&&autoSyncNotify())autoSyncNewDlg([...p.added],nC);else toast(`자동 가져오기: 신규 ${nA} · 변경 ${nC}건`,4000)}
  renderLastSync();
}
const autoSyncNotify=()=>S.auto_sync_notify!=="0";      // 새 일감 알림 (기본 켬)
/* 새 일감 알림 창: 자동 가져오기로 새로 들어온 일감 목록. 제목을 누르면 그 노트를 연다 (창이 안 보일 때는 서버가 트레이 말풍선으로 먼저 알린다) */
function autoSyncNewDlg(ids,nC){
  const list=ids.map(id=>all.find(x=>x.issue_id===id)).filter(Boolean);if(!list.length)return;
  wdlg({title:`🆕 새 레드마인 일감 ${list.length}건`,ok:"확인",cancel:"",wide:list.length>3,
    body:`<div class="meta" style="margin-bottom:8px">자동 가져오기로 새로 들어왔어요${nC?` · 바뀐 일감 ${nC}건도 반영했어요`:""}. 누르면 노트를 열어요.</div>`
      +list.map(n=>`<a class="rel" data-newopen="${n.issue_id}">${catPill(n)}<span class="meta">#${n.issue_id}</span><span>${title(n.subject)}</span><span class="meta" style="margin-left:auto">${esc(rolesOf(n).join(" · "))}</span></a>`).join("")});
  document.querySelectorAll("#wdlg [data-newopen]").forEach(a=>a.onclick=()=>{const id=+a.dataset.newopen;$("#wdlg #wyes").click();openNote(id)});
}
function startAutoSync(){
  clearInterval(autoSync.timer);autoSync.timer=setInterval(autoSyncPoll,30000);autoSyncPoll();
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)autoSyncPoll()});      // 창으로 돌아오면 밀린 것을 바로
}

