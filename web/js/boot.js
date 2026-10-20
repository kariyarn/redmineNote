async function boot(){
  if(cfg.newerDb)toast(`주의: 이 데이터는 더 새로운 버전(${cfg.newerDb})에서 만들어졌습니다. 지금 프로그램(${cfg.appVersion})은 오래된 버전이라 일부 기능이 빠지거나 오작동할 수 있습니다. 새 버전의 프로그램을 쓰세요.`,0);
  await loadSettings();await loadAll();renderLastSync();
  setTimeout(checkZoom,1800);startDeployAlert();startAlarms();startAutoSync();startOpenReq();updBootCheck();
  if((S.patchnote_seen||"")!==cfg.appVersion)setTimeout(()=>showPatchNote(true),700);   // 새 버전을 처음 열 때 한 번   // 처음에는 "내 현안"(담당자 · 완료 제외 · 기간 없음)을 보여 준다
  // 서버를 켠 뒤 처음 여는 경우에만, 설정이 켜져 있으면 최근 7일 변경을 한 번 확인한다.
  if(cfg.autoCheck&&cfg.firstOpen){const t=new Date(),a=new Date(t);a.setDate(t.getDate()-6);doSync(fmt(a),fmt(t),true)}
}
(async()=>{
  cfg=await api("/api/config");
  if(cfg.channel==="beta"){const b=document.querySelector(".nv-brand");if(b&&!b.querySelector(".beta")){const t=document.createElement("span");t.className="ver beta";t.textContent="베타";t.title=`베타 버전 ${cfg.versionLabel||""} — 정식 버전과 따로 설치 · 실행되고, 노트 데이터는 함께 써요`;b.append(t)}}
  if(!cfg.configured){await loadSettings().catch(()=>{});showSetup({first:true});return}
  await boot();
})();
