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

