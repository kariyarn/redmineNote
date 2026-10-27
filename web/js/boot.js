async function boot(){
  if(cfg.newerDb)toast(`주의: 이 데이터는 더 새로운 버전(${cfg.newerDb})에서 만들어졌습니다. 지금 프로그램(${cfg.appVersion})은 오래된 버전이라 일부 기능이 빠지거나 오작동할 수 있습니다. 새 버전의 프로그램을 쓰세요.`,0);
  await loadSettings();await bootLoad();renderLastSync();
  setTimeout(checkZoom,1800);startDeployAlert();startAlarms();startAutoSync();startOpenReq();updBootCheck();
  if((S.patchnote_seen||"")!==cfg.appVersion)setTimeout(()=>showPatchNote(true),700);   // 새 버전을 처음 열 때 한 번   // 처음에는 "내 현안"(담당자 · 완료 제외 · 기간 없음)을 보여 준다
  // 서버를 켠 뒤 처음 여는 경우에만, 설정이 켜져 있으면 최근 7일 변경을 한 번 확인한다.
  if(cfg.autoCheck&&cfg.firstOpen){const t=new Date(),a=new Date(t);a.setDate(t.getDate()-6);doSync(fmt(a),fmt(t),true)}
}
/* 처음 불러오기: 업데이트 직후 첫 실행처럼 서버가 아직 바쁠 때(업데이트 전 백업 · DB 구조 추가) 실패할 수 있어서, 빈 화면으로 두지 않고 몇 번 다시 시도한다 */
async function bootLoad(){
  for(let i=0;;i++){
    try{await loadAll();return}
    catch(e){
      if(i>=4){toast(`노트를 불러오지 못했어요: ${e.message} — 앱을 다시 열어 주세요 (데이터는 그대로예요)`,0);throw e}
      if(i===0)toast("노트를 불러오는 중이에요… (업데이트 직후에는 조금 걸릴 수 있어요)",3000);
      await new Promise(r=>setTimeout(r,1500*(i+1)));
    }
  }
}
(async()=>{
  cfg=await api("/api/config");
  if(cfg.channel==="beta"){const b=document.querySelector(".nv-brand");if(b&&!b.querySelector(".beta")){const t=document.createElement("span");t.className="ver beta";t.textContent="베타";t.title=`베타 버전 ${cfg.versionLabel||""} — 정식 버전과 따로 설치 · 실행되고, 노트 데이터는 함께 써요`;b.append(t)}}
  if(!cfg.configured){await loadSettings().catch(()=>{});showSetup({first:true});return}
  await boot();
})();
