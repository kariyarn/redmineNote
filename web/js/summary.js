/* ---------- 요약 (주간 · 월간 · 직접 지정 기간) ---------- */
/* ---------- 요약: DR 도우미 (제목만 모아 보기 · 복사 · 파일로 저장) ----------
   DR 이번 주 = 구분 DR · 내가 개발담당자 · 오늘부터 7일 전까지 · 모든 상태
   DR 현안   = 구분 DR · 내가 담당자 · 기간 없음 · 대기/진행 */
let drSel="week",sumKp="";
/* DR 제목 모아보기: 탭(이번 주 / 현안) + 필터(기간 · 상태 · 내 역할 · 내가 요청한 것). 선택은 기억한다. */
const DRF_DEF={per:"7d",from:"",to:"",role:"auto",status:[],mine:false};
const drF=()=>Object.assign({},DRF_DEF,ui.drF||{});
const drPick=new Set();      // 선택 복사용으로 체크한 일감 번호
const setDrF=o=>{ui.drF={...drF(),...o};saveUI()};
function drPeriod(f){const t=todayStr();return f.per==="month"?[t.slice(0,8)+"01",t]:f.per==="custom"?[f.from||t,f.to||t]:[fmt(new Date(Date.now()-7*864e5)),t]}
function drCands(){   // 기간·역할·요청자까지 적용한 목록 (상태 칩의 개수는 여기서 센다)
  const f=drF(),[a,b]=drPeriod(f),role=f.role==="auto"?(drSel==="week"?"dev":"assigned"):f.role;
  return all.filter(n=>{
    if(catOf(n)!=="DR")return false;
    const r=rolesOf(n),as=r.includes("담당자"),dv=r.includes("개발담당자");
    if(role==="assigned"&&!as)return false;if(role==="dev"&&!dv)return false;if(role==="both"&&!(as&&dv))return false;
    if(drSel==="now"){if(!isActive(n))return false}                    // 현안: 대기·진행, 기간 무관
    else if(!(n._d>=a&&n._d<=b))return false;
    if(f.mine&&!authoredByMe(n))return false;
    return true;
  });
}
function drList(){
  const f=drF(),c=drCands(),present=new Set(c.map(n=>n.rm_status)),st=f.status.filter(x=>present.has(x));
  return c.filter(n=>!st.length||st.includes(n.rm_status)).sort(byUpdDesc);
}
function drCard(){
  const f=drF(),l=drList(),cands=drCands(),w=drSel==="week",cnt=new Map();
  cands.forEach(n=>cnt.set(n.rm_status,(cnt.get(n.rm_status)||0)+1));
  const sts=[...cnt.entries()].sort((x,y)=>y[1]-x[1]),picked=f.status.filter(x=>cnt.has(x));
  const role=f.role==="auto"?(w?"개발담당자":"담당자"):({assigned:"담당자",dev:"개발담당자",both:"담당자 + 개발담당자"}[f.role]);
  const [pa,pb]=drPeriod(f),opt=(v,t,cur)=>`<option value="${v}" ${cur===v?"selected":""}>${t}</option>`;
  return `<div class="card drcard"><div class="fhd"><span>DR 제목 모아보기</span><small>${esc(role)}인 DR · ${w?`${pa.slice(5)} ~ ${pb.slice(5)}`:"대기·진행 중"}${f.mine?" · 내가 요청한 것":""}</small></div>
    <div class="drtop"><div class="seg"><button type="button" data-dr="week" class="${w?"on":""}">이번 주</button><button type="button" data-dr="now" class="${w?"":"on"}">현안</button></div>
      ${w?`<select id="drPer" title="기간">${opt("7d","최근 7일",f.per)}${opt("month","이번 달",f.per)}${opt("custom","직접 지정",f.per)}</select>${f.per==="custom"?`<input type="date" id="drFrom" value="${pa}"><span class="meta">~</span><input type="date" id="drTo" value="${pb}">`:""}`:""}
      <select id="drRole" title="내 역할">${opt("auto","역할 자동",f.role)}${opt("assigned","담당자",f.role)}${opt("dev","개발담당자",f.role)}${opt("both","둘 다 나",f.role)}</select>
      <label class="drmine" title="내가 요청한 일감만"><input type="checkbox" id="drMine" ${f.mine?"checked":""}> 내가 요청</label>
      <button type="button" class="mini" id="drReset" title="필터를 처음 상태로">↺</button></div>
    <div class="drsts"><button type="button" class="dchip ${picked.length?"":"on"}" data-drs="*">전체 <small>${cands.length}</small></button>${sts.map(([x,c])=>`<button type="button" class="dchip ${picked.includes(x)?"on":""}" data-drs="${esc(x)}">${esc(x)} <small>${c}</small></button>`).join("")}</div>
    <div class="drlist">${l.map(n=>`<div class="drrow${drPick.has(n.issue_id)?" picked":""}"><input type="checkbox" class="drck" data-drsel="${n.issue_id}" ${drPick.has(n.issue_id)?"checked":""} tabindex="-1" aria-hidden="true"><div class="drnr">${nrow(n,{age:drSel==="now"})}</div></div>`).join("")||`<div class="meta" style="padding:10px 0">조건에 맞는 DR 일감이 없어요.</div>`}</div>
    <div class="dract"><button type="button" class="primary" id="drcopy" ${l.length?"":"disabled"}>전체 복사 (${l.length})</button><button type="button" id="drcopySel" disabled>선택 복사 (0)</button><button type="button" class="mini" id="drAll" ${l.length?"":"disabled"}>모두 선택</button><button type="button" class="mini" id="drNone">해제</button><button type="button" class="mini" id="drdl" ${l.length?"":"disabled"} title="텍스트 파일로 저장">파일</button>
      <label class="meta drmine"><input type="checkbox" id="drnum" ${ui.copyNum?"checked":""}> 번호</label><label class="meta drmine"><input type="checkbox" id="drst" ${ui.copySt?"checked":""}> 상태</label><span class="meta drhint">한 번 클릭 = 선택 · 두 번 클릭 = 열기</span></div></div>`;
}
function wireDr(){
  const go=o=>{setDrF(o);renderCenter()};
  document.querySelectorAll("[data-dr]").forEach(b=>b.onclick=()=>{drSel=b.dataset.dr;renderCenter()});
  if($("#drRole"))$("#drRole").onchange=e=>go({role:e.target.value});
  if($("#drPer"))$("#drPer").onchange=e=>{const k=e.target.value,t=todayStr();go(k==="custom"&&!drF().from?{per:k,from:fmt(new Date(Date.now()-7*864e5)),to:t}:{per:k})};
  if($("#drFrom"))$("#drFrom").onchange=e=>go({from:e.target.value});if($("#drTo"))$("#drTo").onchange=e=>go({to:e.target.value});
  document.querySelectorAll("[data-drs]").forEach(b=>b.onclick=()=>{
    const k=b.dataset.drs;if(k==="*")return go({status:[]});
    const cur=drF().status;go({status:cur.includes(k)?cur.filter(x=>x!==k):[...cur,k]})});
  if($("#drMine"))$("#drMine").onchange=e=>go({mine:e.target.checked});
  if($("#drReset"))$("#drReset").onclick=()=>go({...DRF_DEF});
  if($("#drnum"))$("#drnum").onchange=e=>{ui.copyNum=e.target.checked;saveUI()};
  if($("#drst"))$("#drst").onchange=e=>{ui.copySt=e.target.checked;saveUI()};
  const fmtLine=n=>{let t=ui.copyNum?`#${n.issue_id} ${n.subject}`:n.subject;if(ui.copySt)t+=` — ${n.rm_status}`;return t};
  const lines=()=>drList().map(fmtLine),selLines=()=>drList().filter(n=>drPick.has(n.issue_id)).map(fmtLine);
  const updSel=()=>{const k=selLines().length,b=$("#drcopySel");if(b){b.textContent=`선택 복사 (${k})`;b.disabled=!k}};
  const mark=c=>c.closest(".drrow").classList.toggle("picked",c.checked);
  document.querySelectorAll("#center [data-drsel]").forEach(c=>c.onchange=()=>{const id=+c.dataset.drsel;if(c.checked)drPick.add(id);else drPick.delete(id);mark(c);updSel()});
  if($("#drAll"))$("#drAll").onclick=()=>{drList().forEach(n=>drPick.add(n.issue_id));document.querySelectorAll("#center [data-drsel]").forEach(c=>{c.checked=true;mark(c)});updSel()};
  if($("#drNone"))$("#drNone").onclick=()=>{drPick.clear();document.querySelectorAll("#center [data-drsel]").forEach(c=>{c.checked=false;mark(c)});updSel()};
  if($("#drcopySel"))$("#drcopySel").onclick=()=>{const l=selLines();copyText(l.join("\n"),`선택한 ${l.length}줄 복사했어요`)};
  updSel();
  if($("#drcopy"))$("#drcopy").onclick=()=>copyText(lines().join("\n"),`${lines().length}줄 복사했어요`);
  if($("#drdl"))$("#drdl").onclick=()=>{
    const a=document.createElement("a"),name=`${drSel==="week"?"DR-이번주":"DR-현안"}-${fmt(new Date())}.txt`;
    a.href=URL.createObjectURL(new Blob(["﻿"+lines().join("\r\n")+"\r\n"],{type:"text/plain;charset=utf-8"}));a.download=name;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);toast(`${name} 저장했어요`,3000)};
}
/* DR 제목 모아보기: 한 번 클릭 = 선택/해제, 두 번 클릭 = 노트 열기 (두 번 누르면 선택이 두 번 뒤집혀 원래대로라서 그대로 열기만 하면 된다) */
function wireDrRows(){
  document.querySelectorAll("#center .drrow").forEach(row=>{
    const r=row.querySelector(".nrow"),c=row.querySelector(".drck");if(!r||!c)return;
    r.onclick=()=>{c.checked=!c.checked;c.dispatchEvent(new Event("change"))};
    r.ondblclick=()=>openNote(+r.dataset.id);
  });
}
function renderSummary(){
  if(!trLoaded)trLoad().then(()=>{if(view==="summary")renderSummary()});
  const q=$("#q").value.trim().toLowerCase(),[f,t]=q?["",""]:rangeOf("summary");
  const trIn=troubles.filter(x=>{const d=(x.updated_at||x.day||"").slice(0,10);return (!f||d>=f)&&(!t||d<=t)&&(!q||trText(x).includes(q))}).sort((a,b)=>(b.updated_at||"").localeCompare(a.updated_at||""));      // 이 기간에 수정된 트러블슈팅
  const rng=all.filter(n=>notDeploy(n)&&(!f||n._d>=f)&&(!t||n._d<=t)&&qmatch(n,q));      // 이 기간에 수정된 일감 (배포요청 제외)
  const base=scoped(rng),total=base.length;
  const cnt=Object.fromEntries(["대기","진행","완료","중단"].map(s=>[s,base.filter(n=>stOf(n)===s).length]));
  const done=base.filter(n=>stOf(n)==="완료"),recDocs=base.filter(n=>n.rec_mode==="record"),withRec=recDocs.filter(isMine),rate=recDocs.length?Math.round(withRec.length/recDocs.length*100):0;
  const sCol={대기:"var(--warn)",진행:"var(--accent)",완료:"var(--ok)",중단:"var(--ext)"};
  const cCol={BC:"var(--c-bc)",DR:"var(--c-dr)",기타:"var(--c-etc)"};

  // 일자별 건수 (기간이 길면 주 단위, 더 길면 월 단위로 묶는다)
  const ds=base.map(n=>n._d).sort(),lo=ds[0]||f,hi=ds[ds.length-1]||t;
  const span=ds.length?Math.round((new Date(hi)-new Date(lo))/864e5)+1:0,mode=span<=45?"day":span<=200?"week":"month";
  const bk=new Map(),D0=new Date(lo+"T00:00:00");
  if(ds.length){
    if(mode==="day"){for(let i=0;i<span;i++)bk.set(fmt(new Date(D0.getTime()+i*864e5)),0)}
    else if(mode==="week"){for(let i=0;i<Math.ceil(span/7);i++)bk.set(fmt(new Date(D0.getTime()+i*7*864e5)),0)}
    else{const e0=new Date(hi+"T00:00:00");for(let d=new Date(D0.getFullYear(),D0.getMonth(),1);d<=e0;d=new Date(d.getFullYear(),d.getMonth()+1,1))bk.set(fmt(d).slice(0,7),0)}
  }
  const keyOf=d=>mode==="day"?d:mode==="month"?d.slice(0,7):fmt(new Date(D0.getTime()+Math.floor((new Date(d+"T00:00:00")-D0)/(7*864e5))*7*864e5));
  base.forEach(n=>{const k=keyOf(n._d);bk.set(k,(bk.get(k)||0)+1)});
  const arr=[...bk.entries()],mx=Math.max(1,...arr.map(a=>a[1])),W=600,H=110,bw=W/Math.max(arr.length,1);
  const lab=(i,a)=>`<text x="${i*bw+(a==="end"?bw:a==="middle"?bw/2:0)}" y="${H+16}" font-size="11" text-anchor="${a}" fill="var(--sub)">${arr[i][0]}</text>`;
  const svg=arr.length?`<svg viewBox="0 0 ${W} ${H+22}" width="100%" role="img" aria-label="${mode==="day"?"일자별":mode==="week"?"주별":"월별"} 건수">`
    +arr.map(([k,v],i)=>{const h=v/mx*H;return `<rect x="${(i*bw+bw*.12).toFixed(1)}" y="${(H-h).toFixed(1)}" width="${(bw*.76).toFixed(1)}" height="${Math.max(h,v?2:0).toFixed(1)}" rx="2" fill="var(--accent)"><title>${k} · ${v}건</title></rect>`}).join("")
    +lab(0,"start")+(arr.length>2?lab(Math.floor(arr.length/2),"middle"):"")+(arr.length>1?lab(arr.length-1,"end"):"")+`</svg>`:`<span class="meta">이 기간에 수정된 일감이 없습니다.</span>`;

  const tt=terms.map(x=>({x,c:base.filter(n=>has(n,x)).length})).filter(o=>o.c).sort((a,b)=>b.c-a.c).slice(0,8);
  const tc=new Map();base.forEach(n=>n._tok&&n._tok.forEach((type,k)=>{if(!COMMON_COLS.has(k))tc.set(k,(tc.get(k)||0)+1)}));
  const topTok=[...tc.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,10);
  const stale=scoped(all).filter(isStale).sort((a,b)=>ageDays(b)-ageDays(a)).slice(0,8);
  const needAll=scoped(all).filter(n=>notDeploy(n)&&needsRec(n)),noRec=needAll.slice(0,8);
  const item=n=>`<a class="rel" data-open="${n.issue_id}">${catPill(n)}<span class="meta">#${n.issue_id}</span><span>${esc(n.subject)}</span>${staleBadge(n)}</a>`;
  const rangeBtn=(k,l)=>`<button data-sr="${k}">${l}</button>`;
  const kpMap={all:["전체 일감",base],active:["현안 (담당자 · 대기+진행 · 기간 무관)",all.filter(isNow)],대기:["대기",byStat(base,"대기")],진행:["진행",byStat(base,"진행")],완료:["완료",byStat(base,"완료")],중단:["중단",byStat(base,"중단")],need:["✎ 기록 필요 (전체 기간)",needAll]};
  const trHtml=sumKp==="tr"?`<div class="card kplist"><div class="fhd"><span>🛠 트러블슈팅</span><small>${trIn.length}건 · ${q?"전체 기간":esc(rangeText("summary"))} · 수정일 기준</small><span class="sp"></span><button type="button" class="mini" data-kp="tr">닫기</button></div>
    <div class="chips">${TRST.map(st=>`<span class="badge s-${TRCLS[st]}">${st} ${trIn.filter(x=>x.status===st).length}</span>`).join("")}</div>
    <div class="mini-list">${trIn.slice(0,12).map(x=>`<a class="rel" data-trop="${x.id}">${trBadge(x.status)}<span>${esc(x.title)}</span><span class="meta">${esc((x.updated_at||"").slice(5,10))}</span></a>`).join("")||`<span class="meta">이 기간에 수정한 트러블슈팅이 없어요.</span>`}${trIn.length>12?`<div class="meta">외 ${trIn.length-12}건 · 트러블슈팅 화면에서 모두 볼 수 있어요</div>`:""}</div></div>`:"";
  const kpHtml=sumKp&&kpMap[sumKp]?`<div class="card kplist"><div class="fhd"><span>${kpMap[sumKp][0]}</span><small>${kpMap[sumKp][1].length}건 · ${sumKp==="need"||sumKp==="active"?"기간 무관":esc(rangeText("summary"))} · 눌러서 열기</small><span class="sp"></span><button type="button" class="mini" data-kp="${sumKp}">닫기</button></div>
    <div class="klist">${[...kpMap[sumKp][1]].sort(byUpdDesc).map(n=>nrow(n,{age:sumKp==="active"})).join("")||`<span class="meta">해당하는 일감이 없어요.</span>`}</div></div>`:"";

  $("#center").innerHTML=`<div class="mine-h">
      <span class="meta"><b>${q?"전체 기간":rangeText("summary")}</b> 에 수정된 내 일감${q?` · 검색 '${esc(q)}'`:""}</span><span class="sp"></span><button id="sumcopy">요약 복사 (마크다운)</button></div>
    <div class="kpis">
      <div class="kpi ${sumKp==="all"?"on":""}" data-kp="all" role="button" tabindex="0" title="눌러서 목록 보기" style="--c:var(--text)"><b>${total}</b><span>전체 일감</span></div>
      <div class="kpi ${sumKp==="active"?"on":""}" data-kp="active" role="button" tabindex="0" title="지금 담당자가 나이고 대기·진행인 일감 — 기간과 상관없이 (오늘 화면의 '지금 할 일'과 같은 기준)" style="--c:var(--accent)"><b>${all.filter(isNow).length}</b><span>현안 · 기간 무관</span></div>
      ${["대기","진행","완료","중단"].map(s=>`<div class="kpi ${sumKp===s?"on":""}" data-kp="${s}" role="button" tabindex="0" title="눌러서 목록 보기" style="--c:${sCol[s]}"><b>${cnt[s]}</b><span>${s}</span></div>`).join("")}
      <div class="kpi" style="--c:var(--dev)" title="기록 모드인 문서 중 내가 기록을 쓴 비율"><b>${recDocs.length?rate+"%":"—"}</b><span>기록 작성률 (${withRec.length}/${recDocs.length})</span></div>
      <div class="kpi ${sumKp==="need"?"on":""}" data-kp="need" role="button" tabindex="0" title="기록 모드인데 아직 내용이 없는 문서 (기간 무관) — 눌러서 목록 보기" style="--c:#d92d20"><b>${needAll.length}</b><span>✎ 기록 필요</span></div>
      <div class="kpi ${sumKp==="tr"?"on":""}" data-kp="tr" role="button" tabindex="0" title="이 기간에 수정한 트러블슈팅 — 눌러서 목록 보기" style="--c:var(--ext)"><b>${trIn.length}</b><span>🛠 트러블슈팅</span></div>
    </div>
    ${kpHtml}${trHtml}
    ${drCard()}
    <div class="sumgrid">
      <div class="card"><label>구분 × 상태</label>
        <table class="mx"><tr><th></th>${["대기","진행","완료","중단"].map(s=>`<th style="color:${sCol[s]}">${s}</th>`).join("")}<th>합계</th></tr>
        ${["BC","DR","기타"].map(c=>{const b=byCat(base,c);return `<tr><td><span class="cat ${c}" style="margin:0">${c}</span></td>${["대기","진행","완료","중단"].map(s=>`<td>${byStat(b,s).length||"·"}</td>`).join("")}<td><b>${b.length}</b></td></tr>`}).join("")}
        <tr class="tot"><td>합계</td>${["대기","진행","완료","중단"].map(s=>`<td>${cnt[s]}</td>`).join("")}<td>${total}</td></tr></table>
        <div class="chips" style="margin-top:10px"><span class="meta">역할</span>${["담당자","개발담당자","관람자","연관"].map(r=>`<span class="tag ${r}">${r} ${byRole(base,r).length}</span>`).join("")}</div></div>
      <div class="card"><label>${mode==="day"?"일자별":mode==="week"?"주별":"월별"} 수정된 일감 <small>수정일 기준</small></label>${svg}</div>
      <div class="card"><label>많이 나온 용어 <small>눌러서 목록 보기</small></label>
        ${tt.map(o=>`<div class="hbar" data-term="${o.x.id}"><span class="lab" title="${esc(o.x.term)}">${esc(o.x.term)}</span><span class="bar"><i style="width:${o.c/tt[0].c*100}%"></i></span><span class="v">${o.c}건</span></div>`).join("")||`<span class="meta">사전 용어가 나온 일감이 없습니다.</span>`}</div>
      <div class="card"><label>많이 나온 코드 대상 <small>눌러서 코드 이력 보기</small></label>
        <div class="chips">${topTok.map(([k,c])=>`<span class="chip tokchip" data-tok="${esc(k)}">${esc(k)} <small>${c}</small></span>`).join("")||`<span class="meta">추출된 이름이 없습니다.</span>`}</div></div>
      <div class="card"><label>⏳ 오래 대기 중 <small>${staleDays()}일 이상 · 기간과 무관</small></label><div class="mini-list">${stale.map(item).join("")||`<span class="meta">오래 대기 중인 일감이 없습니다.</span>`}</div></div>
      <div class="card"><label>✎ 기록해야 하는 문서 <small>'기록' 모드인데 내용이 비어 있음 · 기간과 무관</small></label><div class="mini-list">${noRec.map(item).join("")||`<span class="meta">기록해야 하는 문서가 없습니다.</span>`}${needAll.length>8?`<div class="meta">외 ${needAll.length-8}건 · 이력 → 필터 → ‘기록 필요’에서 모두 볼 수 있습니다</div>`:""}</div></div>
    </div>`;
  document.querySelectorAll("#center [data-open]").forEach(b=>b.onclick=()=>openNote(+b.dataset.open));
  document.querySelectorAll("#center [data-term]").forEach(b=>b.onclick=()=>{toggleTerm(terms.find(x=>x.id==b.dataset.term))});
  document.querySelectorAll("#center .tokchip").forEach(b=>b.onclick=()=>openCode(b.dataset.tok));
  document.querySelectorAll("#center [data-trop]").forEach(b=>b.onclick=()=>openTrouble(+b.dataset.trop));
  wireDr();wireRows($("#center"));wireDrRows();
  document.querySelectorAll("#center [data-kp]").forEach(k=>{
    const go=()=>{sumKp=sumKp===k.dataset.kp?"":k.dataset.kp;renderCenter()};
    k.onclick=go;k.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();go()}}});
  $("#sumcopy").onclick=ev=>{
    const md=[`# 업무 요약 (${rangeText("summary")})`,"",`- 범위: 내 일감 · 총 ${total}건`,
      `- 상태: 대기 ${cnt.대기} · 진행 ${cnt.진행} · 완료 ${cnt.완료} · 중단 ${cnt.중단}`,
      `- 기록 모드 문서 중 작성: ${withRec.length}/${recDocs.length}${recDocs.length?` (${rate}%)`:""} · 기록 필요 ${needAll.length}건`,"","## 구분별",
      ...["BC","DR","기타"].map(c=>`- ${c}: ${byCat(base,c).length}건`),"","## 많이 나온 용어",...tt.map(o=>`- ${o.x.term}: ${o.c}건`),
      "","## 많이 나온 코드 대상",...topTok.map(([k,c])=>`- ${k}: ${c}건`),"",`## 오래 대기 중 (${staleDays()}일 이상)`,
      ...stale.map(n=>`- #${n.issue_id} ${n.subject} (${ageDays(n)}일)`),
      "",`## 트러블슈팅 (수정 ${trIn.length}건 · ${TRST.map(st=>`${st} ${trIn.filter(x=>x.status===st).length}`).join(" · ")})`,
      ...trIn.map(x=>`- [${x.status}] ${x.title}`)].join("\n");
    copyText(md,"요약을 복사했어요");
  };
}

