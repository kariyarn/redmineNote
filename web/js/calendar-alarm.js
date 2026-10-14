/* ===================== 2.9.0 : 사이드바 달력 · 메모 알림 ===================== */
const sbcOpen=()=>sbc.tmp||(ui.calOpen===undefined?innerHeight>=900:!!ui.calOpen);     // 화면이 낮으면 처음엔 접어 둔다
async function sbcLoad(){
  const n=new Date();if(!sbc.y){sbc.y=n.getFullYear();sbc.m=n.getMonth()}
  try{sbc.items=await api(`/api/sticky/calendar?month=${sbc.y}-${z(sbc.m+1)}`)}catch(e){sbc.items=[]}
  if(!sbc.hol)sbc.hol={};
  if(!sbc.hol[sbc.y]){try{sbc.hol[sbc.y]=new Set(await api("/api/holidays?year="+sbc.y))}catch(e){sbc.hol[sbc.y]=new Set()}}
  sbcDraw();
}
const isOffDay=ds=>{const d=new Date(ds+"T00:00:00").getDay();return d===0||d===6||!!(sbc.hol&&sbc.hol[+ds.slice(0,4)]&&sbc.hol[+ds.slice(0,4)].has(ds))};      // 토 · 일 · 공휴일
const isHoliday=ds=>!!(sbc.hol&&sbc.hol[+ds.slice(0,4)]&&sbc.hol[+ds.slice(0,4)].has(ds));
const sbcRefresh=()=>{clearTimeout(sbc.t);sbc.t=setTimeout(sbcLoad,250)};
function sbcMap(){      // 날짜별: 메모 개수 · 알림 여부 · 미리보기 (기간 메모는 기간의 모든 날)
  const mp=new Map(),mo=`${sbc.y}-${z(sbc.m+1)}`,last=new Date(sbc.y,sbc.m+1,0).getDate();
  sbc.items.forEach(it=>{
    const a=it.day,b=it.until&&it.until>it.day?it.until:it.day;
    for(let d=1;d<=last;d++){const ds=`${mo}-${z(d)}`;if(ds<a||ds>b)continue;
      const e=mp.get(ds)||{n:0,bell:0,tip:[]};e.n++;if(it.remind_time&&(it.alarm_dates&&it.alarm_dates.length?it.alarm_dates.includes(ds):!(b>a&&isOffDay(ds))))e.bell=1;      // 기간 알림은 쉬는 날을 건너뛰므로 🔔 도 그 날에는 표시하지 않는다
if(e.tip.length<4)e.tip.push((it.remind_time?"🔔"+it.remind_time+" ":"")+(it.preview||"(빈 메모)"));mp.set(ds,e)}
  });return mp;
}
function sbcGo(ds){memoDay=ds;if(nav==="memo")gotoMemo(ds);else setNav("memo",{keepDay:true});toTop()}
function sbcDraw(){
  const box=$("#sbCal");if(!box||!sbc.y)return;
  const open=sbcOpen(),t=todayStr(),mp=sbcMap();
  let h=`<div class="sbc-h"><button type="button" data-sc="tog" title="달력 접기/펴기">${open?"▾":"▸"}</button><b>${sbc.y}.${z(sbc.m+1)}</b>${open?`<button type="button" data-sc="-1" title="이전 달">◀</button><button type="button" data-sc="0" title="이번 달">●</button><button type="button" data-sc="1" title="다음 달">▶</button>`:""}</div>`;
  if(open){
    const first=new Date(sbc.y,sbc.m,1).getDay(),last=new Date(sbc.y,sbc.m+1,0).getDate(),cells=[];
    for(let i=0;i<first;i++)cells.push("<i></i>");
    for(let d=1;d<=last;d++){const ds=`${sbc.y}-${z(sbc.m+1)}-${z(d)}`,e=mp.get(ds);
      cells.push(`<button type="button" class="sbc-d ${e?"has":""} ${e&&e.bell?"bell":""} ${ds===t?"today":""} ${nav==="memo"&&ds===memoDay?"sel":""} ${isHoliday(ds)||(first+d-1)%7===0?"off":(first+d-1)%7===6?"sat":""}" data-cd="${ds}" title="${e?esc(e.tip.join("\n")):"메모 없음 — 메모를 여기로 끌어다 놓으면 알림이 걸려요"}">${d}</button>`)}
    h+=`<div class="sbc-w">${WD2.map(w=>`<span>${w}</span>`).join("")}</div><div class="sbc-g">${cells.join("")}</div>`;
  }
  box.innerHTML=h;
  box.querySelectorAll("[data-sc]").forEach(b=>b.onclick=()=>{
    const k=b.dataset.sc;
    if(k==="tog"){ui.calOpen=!sbcOpen();saveUI();sbcDraw();return}
    if(k==="0"){const n=new Date();sbc.y=n.getFullYear();sbc.m=n.getMonth()}
    else{const d=new Date(sbc.y,sbc.m+ +k,1);sbc.y=d.getFullYear();sbc.m=d.getMonth()}
    sbcLoad()});
  box.querySelectorAll("[data-cd]").forEach(b=>b.onclick=()=>sbcGo(b.dataset.cd));
}
window.addEventListener("resize",()=>{if(ui.calOpen===undefined)sbcDraw()});
/* ---- 메모를 달력으로 끌기: 보드 밖으로 나가면 고스트가 따라다니고, 놓을 수 있는 날짜가 강조된다 ---- */
const calGhost={el:null,hot:""};
function calDragUpdate(el,sn,ev){
  const cork=$("#cork");if(!cork)return;const r=cork.getBoundingClientRect();
  const out=ev.clientX<r.left-6||ev.clientX>r.right+6||ev.clientY<r.top-6||ev.clientY>r.bottom+6;
  if(!out){calDragClear();return}
  if(!calGhost.el){
    const g=document.createElement("div");g.className="cal-ghost";g.style.setProperty("--sc",STK[sn.color]||STK.yellow);
    g.textContent=(sn.text||"").replace(/\s+/g," ").trim().slice(0,60)||"(빈 메모)";document.body.appendChild(g);calGhost.el=g;
    if(!sbcOpen()){sbc.tmp=true;sbcDraw()}
    $("#sbCal").classList.add("dropping");
  }
  calGhost.el.style.left=ev.clientX+"px";calGhost.el.style.top=ev.clientY+"px";
  const c=document.elementFromPoint(ev.clientX,ev.clientY),cell=c&&c.closest?c.closest(".sbc-d"):null;
  document.querySelectorAll("#sbCal .sbc-d.hot").forEach(x=>x.classList.remove("hot"));
  calGhost.hot=cell?cell.dataset.cd:"";if(cell)cell.classList.add("hot");
}
function calDragClear(){
  if(!calGhost.el)return;
  calGhost.el.remove();calGhost.el=null;calGhost.hot="";
  const b=$("#sbCal");if(b)b.classList.remove("dropping");
  document.querySelectorAll("#sbCal .sbc-d.hot").forEach(x=>x.classList.remove("hot"));
  if(sbc.tmp){sbc.tmp=false;sbcDraw()}
}
const calDragEnd=()=>{const d=calGhost.hot;calDragClear();return d};
async function calDropMemo(el,sn,date){      // 달력 날짜에 놓았을 때: 기간이 되면 '알림 받을 날'을 묻고, 하루짜리면 시각만 묻는다 (이미 시각이 있으면 바로 건다)
  const prev={day:sn.day,until:sn.until||"",remind_time:sn.remind_time||"",wake:sn.wake||0,alarm_dates:[...(sn.alarm_dates||[])]};
  const a=sn.day,b=sn.until&&sn.until>sn.day?sn.until:sn.day;
  let nd=a,nu=b;if(date<a)nd=date;else if(date>b)nu=date;      // 놓은 날이 앞이면 놓은 날 ~ 원래 날짜, 뒤면 원래 날짜 ~ 놓은 날
  let time=sn.remind_time||"",wake=sn.wake||0,picks=[];
  if(nu>nd){      // 기간이 있으면: 어느 날에 알림을 넣을지 고른다 (놓은 날은 미리 체크, 기본은 평일 + 놓은 날)
    const days=daysBetween(nd,nu);
    if(days.length<=62){
      await Promise.all([...new Set(days.map(d=>+d.slice(0,4)))].map(loadHol));
      const base=(sn.alarm_dates&&sn.alarm_dates.length)?sn.alarm_dates:days.filter(d=>!isOffDay(d));
      const init=[...new Set([...base,date])].filter(d=>days.includes(d)).sort();
      const r=await pickAlarm({from:nd,to:nu,time,wake,has:!!sn.remind_time,picks:init},`${+date.slice(5,7)}월 ${+date.slice(8)}일을 넣어 알림 받을 날 고르기`);
      if(!r||r.off||!r.time)return;      // 취소하면 아무것도 바뀌지 않는다
      time=r.time;wake=r.wake?1:0;nd=r.from;nu=r.to&&r.to>r.from?r.to:"";picks=nu?(r.alarm_dates||[]):[];
    }else{
      if(!time){const r=await pickAlarm({from:date,to:"",time:"",wake:0},`${date} 에 알림 걸기`,{timeOnly:true});if(!r||r.off||!r.time)return;time=r.time;wake=r.wake?1:0}
    }
  }else if(!time){
    const r=await pickAlarm({from:date,to:"",time:"",wake:0},`${date} 에 알림 걸기`,{timeOnly:true});
    if(!r||r.off||!r.time)return;
    time=r.time;wake=r.wake?1:0;
  }
  sn.day=nd;sn.until=nu>nd?nu:"";sn.remind_time=time;sn.wake=wake;sn.alarm_dates=sn.until?picks:[];
  clearTimeout(stkDeb.get(sn));await stkSave(sn);
  memoDays=await api("/api/sticky/days").catch(()=>memoDays);
  const go=date>=sn.day&&(!sn.until||date<=sn.until)?date:sn.day;      // 놓은 날이 기간 안이면 그 날 보드로
  gotoMemo(go);await memoReady;sbcRefresh();checkAlarms();
  const pk=sn.alarm_dates&&sn.alarm_dates.length;
  toastUndo(`${+go.slice(5,7)}월 ${+go.slice(8)}일 ${time} 알림 설정${sn.until?` (기간 ${nd.slice(5)} ~ ${nu.slice(5)}${pk?` · 고른 ${pk}일`:""})`:""}`,async()=>{
    Object.assign(sn,prev);clearTimeout(stkDeb.get(sn));await stkSave(sn);gotoMemo(prev.day);await memoReady;sbcRefresh();checkAlarms()},7000);
}
/* ---- 🔔 알림 설정 창 ---- */
const loadHol=async y=>{if(!sbc.hol)sbc.hol={};if(!sbc.hol[y]){try{sbc.hol[y]=new Set(await api("/api/holidays?year="+y))}catch(e){sbc.hol[y]=new Set()}}};
const daysBetween=(a,b)=>{const out=[];for(let d=a,k=0;d<=b&&k<400;d=shiftDay(d,1),k++)out.push(d);return out};
async function pickAlarm(init,title,o={}){
  const t=todayStr(),mkp=m=>{const d=new Date(Date.now()+m*60000);return [fmt(d),`${z(d.getHours())}:${z(d.getMinutes())}`]};
  const p10=mkp(10),p60=mkp(60);let off=false;
  const pre=o.timeOnly?[["09:00",init.from,"09:00"],["12:00",init.from,"12:00"],["15:00",init.from,"15:00"],["18:00",init.from,"18:00"]]
    :[["10분 뒤",p10[0],p10[1]],["1시간 뒤",p60[0],p60[1]],["오늘 18:00",t,"18:00"],["내일 09:00",shiftDay(t,1),"09:00"]];
  const body=`<div class="rngd"><div class="frow"><label>알림 시각</label><input type="time" id="alT" value="${init.time||""}"></div>
    ${o.timeOnly?"":`<div class="frow"><label>날짜</label><input type="date" id="alF" value="${init.from}"><span class="meta">~</span><input type="date" id="alE" value="${init.to||""}" title="비우면 그 하루만"></div><div id="alDays" class="aldays" hidden></div>`}
    <div class="row" style="gap:6px;flex-wrap:wrap;margin:8px 0">${pre.map(([l,f,tm])=>`<button type="button" class="mini" data-ap="${f}|${tm}">${l}</button>`).join("")}</div>
    <label class="meta" style="display:flex;gap:6px;align-items:center;margin:6px 0"><input type="checkbox" id="alW" ${init.wake?"checked":""}> 중요: 창이 닫혀 있어도 앱을 다시 열어서 알려요</label>
    ${init.has?`<button type="button" class="mini" id="alOff">🔕 알림 끄기</button>`:""}
    <div class="meta" style="margin-top:8px">${o.timeOnly?"":"날짜 뒤에 종료일을 적으면 그 기간의 <b>평일</b> 이 시각에 울리고, 아래 <b>체크한 날에만</b> 울리게 바꿀 수도 있어요. "}알림을 건 시각보다 이른 시각은 울리지 않아요. 소리는 나지 않고, 알림 창이 떠요.${o.timeOnly?"":"<br>기본은 <b>주말 · 공휴일을 건너뛰어요</b>. 직접 체크한 날은 주말 · 공휴일이어도 울리고, 하루만 정한 알림도 그 날 그대로 울려요."}</div></div>`;
  /* 기간이면 날짜마다 체크박스: 기본 = 평일 전부, 직접 바꾸면 체크한 날에만 (기본과 같으면 따로 저장하지 않는다) */
  let picked=new Set(init.picks||[]),custom=!!(init.picks&&init.picks.length);
  const rangeOf=()=>{const a=$("#alF")&&$("#alF").value,b=$("#alE")&&$("#alE").value;return a&&b&&b>a?daysBetween(a,b):[]};
  const defSet=days=>new Set(days.filter(d=>!isOffDay(d)));
  const drawDays=async()=>{
    const box=$("#alDays");if(!box)return;const days=rangeOf();
    if(days.length<2){box.hidden=true;box.innerHTML="";return}
    await Promise.all([...new Set(days.map(d=>+d.slice(0,4)))].map(loadHol));
    if(days.length>62){box.hidden=false;box.innerHTML='<div class="meta">기간이 62일보다 길어서 날짜 선택은 쓸 수 없어요 (평일 전체에 울려요).</div>';custom=false;picked=new Set();return}
    if(!custom)picked=defSet(days);else picked=new Set([...picked].filter(d=>days.includes(d)));
    const wd=["일","월","화","수","목","금","토"];
    box.hidden=false;
    box.innerHTML=`<div class="aldh"><b>알림 받을 날</b><span class="meta" id="alCnt"></span><span class="sp"></span><button type="button" class="mini" data-ds="def" title="주말 · 공휴일을 뺀 모든 날">평일만</button><button type="button" class="mini" data-ds="all">모두</button><button type="button" class="mini" data-ds="none">해제</button></div>
      <div class="aldg">${days.map(d=>{const x=new Date(d+"T00:00:00");return `<label class="aldc ${isOffDay(d)?"off":""}"><input type="checkbox" data-dd="${d}" ${picked.has(d)?"checked":""}><span>${+d.slice(5,7)}/${+d.slice(8)}</span><small>${wd[x.getDay()]}</small></label>`}).join("")}</div>`;
    const upd=()=>{const el=$("#alCnt");if(el)el.textContent=`${picked.size}일 선택`};upd();
    box.querySelectorAll("[data-dd]").forEach(c=>c.onchange=()=>{custom=true;if(c.checked)picked.add(c.dataset.dd);else picked.delete(c.dataset.dd);upd()});
    box.querySelectorAll("[data-ds]").forEach(b=>b.onclick=()=>{const k=b.dataset.ds;custom=k!=="def";picked=k==="all"?new Set(days):k==="none"?new Set():defSet(days);drawDays()});
  };
  const pr=wdlg({title,body,ok:"알림 설정",collect:()=>{
    const days=rangeOf(),sel=[...picked].filter(d=>days.includes(d)).sort(),def=[...defSet(days)].sort();
    return {off,time:$("#alT").value,from:o.timeOnly?init.from:$("#alF").value,to:o.timeOnly?"":$("#alE").value,wake:$("#alW").checked,
      alarm_dates:days.length>1&&custom&&days.length<=62&&JSON.stringify(sel)!==JSON.stringify(def)?sel:[],nopick:days.length>1&&custom&&days.length<=62&&!sel.length}}});
  if(!o.timeOnly){const re=()=>{drawDays()};$("#alF").onchange=re;$("#alE").onchange=re;drawDays()}
  document.querySelectorAll("#wdlg [data-ap]").forEach(b=>b.onclick=()=>{const [f,tm]=b.dataset.ap.split("|");$("#alT").value=tm;if($("#alF")){$("#alF").value=f;$("#alE").value="";custom=false;drawDays()}});
  if($("#alOff"))$("#alOff").onclick=()=>{off=true;$("#wyes").click()};
  const r=await pr;if(!r)return null;
  if(r.off)return r;
  if(!/^\d{2}:\d{2}$/.test(r.time)){toast("알림 시각을 정해 주세요",2500);return null}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(r.from)){toast("날짜를 골라 주세요",2500);return null}
  if(r.to&&r.to<r.from){toast("종료일이 시작일보다 빨라요",3000);return null}
  if(r.nopick){toast("알림 받을 날을 하나 이상 골라 주세요",3000);return null}
  return r;
}
async function memoAlarmDlg(sn){
  const r=await pickAlarm({from:sn.day,to:sn.until||"",time:sn.remind_time||"",wake:sn.wake||0,has:!!sn.remind_time,picks:sn.alarm_dates||[]},"🔔 메모 알림");if(!r)return;
  clearTimeout(stkDeb.get(sn));
  if(r.off){sn.remind_time="";sn.wake=0;sn.alarm_dates=[]}else{sn.remind_time=r.time;sn.wake=r.wake?1:0;sn.day=r.from;sn.until=r.to&&r.to>r.from?r.to:"";sn.alarm_dates=sn.until?(r.alarm_dates||[]):[]}
  await stkSave(sn);memoDays=await api("/api/sticky/days").catch(()=>memoDays);await loadMemo();drawMemo();sbcRefresh();checkAlarms();
  const past=!r.off&&!sn.until&&sn.day===todayStr()&&r.time<=`${z(new Date().getHours())}:${z(new Date().getMinutes())}`;
  toast(r.off?"알림을 껐어요":past?"지금보다 이른 시각이라 오늘은 울리지 않아요 (내일로 바꿔 보세요)":`${sn.day.slice(5)}${sn.until?"~"+sn.until.slice(5):""} ${sn.remind_time} 알림을 걸었어요${sn.alarm_dates&&sn.alarm_dates.length?` (고른 ${sn.alarm_dates.length}일에만)`:""} ✓`,past?4500:2600);
}
/* ---- 알림 가져오기 · 알림 창 (소리 없음) ---- */
const alKey=a=>a.id+"|"+a.latest;
async function checkAlarms(){
  let r;try{r=await api("/api/alarms/due?hidden="+(document.hidden?1:0))}catch(e){return}
  alr.list=r.alarms||[];alr.notice=r.notice||[];alr.started=r.server_started||"";
  const sig=alr.list.map(alKey).join(",")+"#"+alr.notice.length+"#"+ui.memoSeenDay;
  if(sig!==alr.sig){alr.sig=sig;renderNav()}
  if(alr.notice.length&&ui.memoSeenDay!==todayStr()&&ui.memoToastDay!==todayStr()){ui.memoToastDay=todayStr();saveUI();toast(`📝 오늘 볼 메모 ${alr.notice.length}개가 있어요 (미리 적어 둔 것) — 메뉴 '메모' 옆 아이콘을 눌러 보세요`,7000)}
  alDraw();
}
function alDraw(){
  const now=Date.now(),vis=alr.list.filter(a=>!(alr.hide.get(alKey(a))>now));
  let el=$("#alDlg");
  if(!vis.length){if(el)el.classList.remove("show");alr.drawn="";return}
  if(!el){el=document.createElement("div");el.id="alDlg";document.body.appendChild(el)}
  const sig=vis.map(alKey).join(",");if(el.classList.contains("show")&&sig===alr.drawn)return;
  alr.drawn=sig;
  const missed=a=>a.latest<alr.started,mN=vis.filter(missed).length;
  const title=mN===vis.length?`꺼져 있는 동안 지난 알림 ${vis.length}개`:`⏰ 메모 알림 ${vis.length}개`;
  el.innerHTML=`<div class="albox" role="alertdialog" aria-modal="true"><h3>${title}<span class="sp"></span><button type="button" class="mini" id="alX" title="닫기 (5분 뒤 다시 알려요 · 메뉴 '메모' 옆 🔔 로 다시 열 수 있어요)">✕</button></h3>
    ${vis.map(a=>{const when=a.single?`${a.fire_at.slice(5,10).replace("-","/")} ${a.remind_time}`:`${a.dates[0].slice(5)}${a.count>1?"~"+a.dates[a.count-1].slice(5):""} · 매일 ${a.remind_time}`;
      return `<div class="alc" style="--sc:${STK[a.color]||STK.yellow}"><div class="alt"><b>${a.remind_time}</b> · ${when}${a.count>1?` (${a.count}일치)`:""}${missed(a)?" · 꺼져 있는 동안":""}</div><div class="alp">${esc(a.preview||"(내용 없음)")}</div>
      <div class="alb"><button type="button" class="primary" data-aa="ack" data-ai="${a.id}">확인</button><button type="button" data-aa="s10" data-ai="${a.id}">10분 뒤</button><button type="button" data-aa="s60" data-ai="${a.id}">1시간 뒤</button>${a.single?`<button type="button" data-aa="tmr" data-ai="${a.id}">내일 같은 시각</button>`:""}<button type="button" data-aa="open" data-ai="${a.id}">보드 열기</button></div></div>`}).join("")}
    ${vis.length>1?`<div class="wbtn"><button type="button" id="alAll">모두 확인</button></div>`:""}</div>`;
  el.classList.add("show");
  el.querySelectorAll("[data-aa]").forEach(b=>b.onclick=()=>alAct(+b.dataset.ai,b.dataset.aa));
  $("#alX").onclick=alClose;if($("#alAll"))$("#alAll").onclick=async()=>{for(const a of vis)await post("/api/alarms/ack",{id:a.id}).catch(()=>{});await checkAlarms();sbcRefresh()};
}
function alClose(){const t=Date.now()+5*60000;alr.list.forEach(a=>alr.hide.set(alKey(a),t));alDraw()}      // 5분 동안 숨김 (🔔 배지는 남는다)
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&$("#alDlg.show")&&!$("#wdlg.show")){e.preventDefault();alClose()}},true);
async function alAct(id,act){
  const a=alr.list.find(x=>x.id===id);if(!a)return;
  if(act==="open"){alr.hide.set(alKey(a),Date.now()+3e5);alDraw();sbcGo(a.dates[a.dates.length-1]);return}
  const body=act==="ack"?{id}:act==="s10"?{id,snooze:10}:act==="s60"?{id,snooze:60}:{id,postpone:true};
  try{await post("/api/alarms/ack",body)}catch(e){toast(e.message,4000)}
  await checkAlarms();sbcRefresh();if(nav==="memo"&&view==="memo")renderMemo();
  if(act==="tmr")toast("내일 같은 시각으로 미뤘어요 ✓",2200);
}
function startAlarms(){
  sbcLoad();checkAlarms();setInterval(checkAlarms,15000);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)checkAlarms()});
}
