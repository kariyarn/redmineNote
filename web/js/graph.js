/* ---------- 그래프 (드래그로 이동 · 휠로 확대/축소 · 클릭으로 포커스) ---------- */
let gHub=null,gPrevMode="all",gModel=null;   // 중심 보기의 중심 용어 / 용어 선택 전에 쓰던 그래프 모드 / 지금 그래프에 그려진 노드(왼쪽 목록용)
let sim=null,gFocusKey=null,gPinned=false;      // gFocusKey: 포커스한 노드(연결된 노드만 강조) · gPinned: 클릭해서 고정했는지(아니면 마우스를 올린 동안만)      // gFocusKey: 포커스한 노드(연결된 노드만 강조하고 나머지는 흐리게)
function stopSim(){if(sim){cancelAnimationFrame(sim.raf);if(sim.ro)sim.ro.disconnect();sim=null}}
/* 중심 보기: 그래프 기간 안에서 연결된 일감이 가장 많은 용어를 중심으로 그 주변만 보여 준다 */
/* 그래프에 넣을 일감: 기본은 내 일감(담당자·개발담당자)만. 관람·참조·완료는 위쪽 토글로 켠다. */
function gScope(n){return inScope(n)&&(ui.gDone||isActive(n))}
function hubRanks(){
  const [gf,gt]=rangeOf("graph"),base=all.filter(n=>(!gf||n._d>=gf)&&(!gt||n._d<=gt)&&gScope(n));
  return terms.map(t=>({t,c:base.filter(n=>has(n,t)).length})).filter(o=>o.c>0).sort((a,b)=>b.c-a.c);
}
const curHub=ranks=>graphMode!=="hub"?null:((ranks.find(o=>o.t.id===gHub)||ranks[0]||{}).t||null);   // 중심 보기에서만 중심 용어가 있다
function buildGraph(){
  const nodes=new Map(),edges=[],ek=new Set();
  const add=(k,o)=>{if(!nodes.has(k))nodes.set(k,{k,...o,x:0,y:0,vx:0,vy:0});return nodes.get(k)};
  const edge=(a,b,kind)=>{const key=a.k+"|"+b.k;if(ek.has(key)||ek.has(b.k+"|"+a.k))return;ek.add(key);edges.push([a,b,kind])};
  const inode=(n,ghost)=>add("i"+n.issue_id,{type:"i",n,label:"#"+n.issue_id,r:7,ghost});
  const focus=graphMode==="focus";
  const hub=graphMode==="hub"?curHub(hubRanks()):null;          // 중심 보기: 연결이 가장 많은 용어(또는 고른 용어)가 중심
  // 노드가 너무 많으면 화면이 느려지므로, 수정일이 최신인 일감부터 n개까지만 그린다 (0 = 제한 없음).
  // 중심 보기에서는 '주변 최대 N건'(기본 40, 연결이 많은 일감부터)을 쓰고, 그 외에는 '최대 N건'(최신순)을 쓴다.
  const lim=hub?Math.max(0,parseInt(ui.hubLim,10)||0):Math.max(0,parseInt(ui.gLim,10)||0);
  const lc=new Map();links.forEach(l=>{lc.set(l.src,(lc.get(l.src)||0)+1);lc.set(l.dst,(lc.get(l.dst)||0)+1)});
  const deg=n=>terms.reduce((a,t)=>a+(has(n,t)?1:0),0)+(lc.get(n.issue_id)||0);     // 연결 수 = 맞는 용어 수 + 일감 연결 수
  // 그래프는 목록의 필터(역할·구분·상태·검색)를 따르지 않는다. 오른쪽 용어 사전과 그래프 자체 기간으로만 제어한다.
  const [gf,gt]=rangeOf("graph");
  const coreAll=all.filter(n=>(!gf||n._d>=gf)&&(!gt||n._d<=gt)&&gScope(n)&&(focus?hasSel(n):(!hub||has(n,hub)))).sort(hub?(a,b)=>deg(b)-deg(a)||b.updated_on.localeCompare(a.updated_on):(a,b)=>b.updated_on.localeCompare(a.updated_on));
  const core=lim?coreAll.slice(0,lim):coreAll;
  core.forEach(n=>inode(n,false));
  const issueCount=()=>[...nodes.values()].filter(x=>x.type==="i").length;
  // 일감끼리 연결선: 그래프에 이미 그려진 일감 사이만 잇는다 (연결돼 있다는 이유로 다른 일감을 끌어오지 않는다)
  links.forEach(l=>{const a=nodes.get("i"+l.src),b=nodes.get("i"+l.dst);if(a&&b)edge(a,b,"link")});
  // 모든 일감 노드에 대해, 내용이 사전 용어와 맞으면 용어 노드와 연결한다.
  [...nodes.values()].filter(x=>x.type==="i").forEach(nd=>{
    terms.forEach(t=>{if(has(nd.n,t))edge(add("t"+t.id,{type:"t",label:t.term,r:hub&&hub.id===t.id?22:sel.includes(t.id)?18:14,t}),nd,"term")});
  });
  // 용어끼리 같은 일감을 n건 이상 공유하면 용어 사이도 선으로 잇는다 (선 옆 숫자 = 공유한 일감 수).
  if(S.graph_terms!=="0"){
    const minShare=Math.max(1,parseInt(S.graph_term_link,10)||2);
    const tn=[...nodes.values()].filter(x=>x.type==="t"),inc=new Map();
    edges.forEach(([a,b,k])=>{if(k==="term"){if(!inc.has(a.k))inc.set(a.k,new Set());inc.get(a.k).add(b.k)}});
    for(let i=0;i<tn.length;i++)for(let j=i+1;j<tn.length;j++){
      const A=inc.get(tn[i].k),B=inc.get(tn[j].k);if(!A||!B)continue;
      let c=0;A.forEach(k=>{if(B.has(k))c++});
      if(c>=minShare)edges.push([tn[i],tn[j],"tt",c]);
    }
  }
  return {nodes:[...nodes.values()],edges,total:coreAll.length,shown:core.length,lim,hub};
}
function renderGraph(){gModel=null;renderGraphInner();renderList()}      // 그린 뒤에 왼쪽 목록을 그래프에 나온 일감으로 갱신
function renderGraphInner(){
  stopSim();
  const colMode=S.graph_color==="cat"?"cat":"status";
  const ranks=graphMode==="hub"?hubRanks():[],hubNow=graphMode==="hub"?curHub(ranks):null;
  const hubHtml=graphMode==="hub"&&ranks.length?`<span class="meta">중심</span><span class="gsel">${ranks.slice(0,7).map(o=>`<span class="chip ${hubNow&&o.t.id===hubNow.id?"on":""}" data-hub="${o.t.id}" title="이 용어와 연결된 일감 ${o.c}건 · 눌러서 중심으로">${esc(o.t.term)} <small>${o.c}</small></span>`).join("")}</span>`:"";
  $("#center").innerHTML=`<div id="gbar">
    <div class="seg"><button data-gm="all" class="${graphMode==="all"?"on":""}" title="중심 없이 기간 안의 일감을 한꺼번에 (최신순 N건)">전체 한꺼번에</button>
      <button data-gm="hub" class="${graphMode==="hub"?"on":""}" title="연결이 가장 많은 용어를 중심으로, 그 주변만 보여 줍니다">중심 보기</button>
      <button data-gm="focus" class="${graphMode==="focus"?"on":""}" title="오른쪽 용어 사전에서 고른 용어 중심">선택한 용어 보기</button></div>
    ${hubHtml}
    ${sel.length?`<span class="gsel">${selTerms().map(t=>`<span class="chip" data-gt="${t.id}" title="눌러서 선택 취소">${esc(t.term)} ✕</span>`).join("")}</span>`:""}
    ${sel.length>1?`<div class="seg" title="선택한 용어를 모두 포함한 일감 / 하나라도 포함한 일감"><button data-selmode="and" class="${selMode==="and"?"on":""}">모두 포함</button><button data-selmode="or" class="${selMode==="or"?"on":""}">하나라도</button></div>`:""}
    <label class="meta gopt" title="완료된 일감도 그립니다"><input type="checkbox" id="gDone" ${ui.gDone?"checked":""}> 완료 포함</label>
    <span class="gopt">${scopeChecks()}</span>
    ${!dictVisible()?`<button type="button" class="mini" id="gopenDict">용어 사전 열기</button>`:""}
    <div class="seg" title="일감 색 기준 (보여 주는 방식만 바꿉니다)"><button data-gcol="status" class="${colMode==="status"?"on":""}">상태색</button><button data-gcol="cat" class="${colMode==="cat"?"on":""}">구분색</button></div>
    <label class="meta gopt"><input type="checkbox" id="gTT" ${S.graph_terms!=="0"?"checked":""}> 용어 연결 <input type="number" id="gTL" min="1" max="50" value="${Math.max(1,parseInt(S.graph_term_link,10)||2)}" style="width:3.6rem;padding:2px 5px"> 건 이상 공유</label>
    <label class="meta gopt">${hubNow?"주변 최대":"최대"} <input type="number" id="gLim" min="0" max="2000" step="10" value="${hubNow?Math.max(0,parseInt(ui.hubLim,10)||0):Math.max(0,parseInt(ui.gLim,10)||0)}" style="width:5rem;padding:2px 5px">건 <span title="${hubNow?"중심 용어와 연결된 일감 중 연결이 많은 순서로 표시합니다":"수정일이 최신인 일감부터 표시합니다"}. 0이면 제한 없음">(${hubNow?"연결이 많은 순":"최신순"} · 0=제한 없음)</span></label>
    <span class="meta" id="ginfo"></span></div>
    <div id="gwrap"><canvas id="g"></canvas>
      <div id="gcard" style="display:none"></div>
      <div id="zoom"><button data-z="in" title="확대">＋</button><button data-z="out" title="축소">－</button><button data-z="fit" title="전체가 보이게 맞춤">맞춤</button></div>
      <div id="legend">${colMode==="cat"?"일감 색: 분홍 BC / 청록 DR / 회색 기타":"일감 색: 주황 대기 / 파랑 진행 / 초록 완료 / 회색 중단"} · 큰 원=용어 · 보라 굵은 선=일감끼리 연관 · 파란 점선=용어끼리 연결(노드에 올리면 표시, 숫자=공유 일감)<br>왼쪽 목록: 한 번 클릭=노드 강조 고정(다시 클릭=해제) · 더블클릭=노트 열기 · 노드에 마우스를 올리면=연결된 노드만 강조(제목 표시) · 클릭=포커스 고정(빈 곳 클릭/Esc로 해제) · 더블클릭=노트 열기 · 빈 곳 드래그=이동 · 휠=확대/축소 · 빈 곳 더블클릭=맞춤</div><div id="tip"></div></div>`;
  document.querySelectorAll("[data-gm]").forEach(b=>b.onclick=()=>{if(b.dataset.gm==="focus"&&graphMode!=="focus")gPrevMode=graphMode;graphMode=b.dataset.gm;gFocusKey=null;renderGraph()});
  document.querySelectorAll("[data-hub]").forEach(b=>b.onclick=()=>{gHub=+b.dataset.hub;gFocusKey=null;renderGraph()});
  document.querySelectorAll("[data-gt]").forEach(b=>b.onclick=()=>toggleTerm(terms.find(t=>t.id==b.dataset.gt)));
  document.querySelectorAll("#gbar [data-selmode]").forEach(b=>b.onclick=()=>{selMode=b.dataset.selmode;renderAll()});
  if($("#gopenDict"))$("#gopenDict").onclick=()=>{if(isNarrow())dictOv=true;else{ui.hr=false;saveUI()}applyUI();renderNav();renderGraph()};
  document.querySelectorAll("[data-gcol]").forEach(b=>b.onclick=async()=>{await saveS("graph_color",b.dataset.gcol);renderGraph()});
  $("#gLim").onchange=async e=>{
    const v=Math.max(0,Math.min(2000,parseInt(e.target.value,10)||0));
    if(hubNow)ui.hubLim=v;else ui.gLim=v;saveUI();
    renderGraph();
  };
  [["gDone","gDone"]].forEach(([id,k])=>$("#"+id).onchange=e=>{ui[k]=e.target.checked;saveUI();renderGraph()});
  $("#gTT").onchange=async e=>{await saveS("graph_terms",e.target.checked?"1":"0");renderGraph()};
  $("#gTL").onchange=async e=>{await saveS("graph_term_link",Math.max(1,Math.min(50,parseInt(e.target.value,10)||2)));renderGraph()};
  const cv=$("#g"),ctx=cv.getContext("2d"),dpr=window.devicePixelRatio||1;
  let W=cv.clientWidth||600,H=cv.clientHeight||400;cv.width=W*dpr;cv.height=H*dpr;
  const css=getComputedStyle(document.documentElement),col=v=>css.getPropertyValue(v).trim();
  const FS=parseFloat(css.fontSize)||14,FF="'Malgun Gothic','Apple SD Gothic Neo',sans-serif";
  const msg=t=>{ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle=col("--sub");ctx.font=`${FS}px ${FF}`;ctx.fillText(t,24,36)};
  if(graphMode==="focus"&&!sel.length)return msg("오른쪽 사전에서 용어를 누르거나, 전체 보기에서 용어 원을 클릭해 선택하세요. (여러 개 선택 가능)");
  const {nodes,edges,total,shown,lim,hub}=buildGraph();
  gModel={nodes,hub,total,shown};
  $("#ginfo").innerHTML=hub?`중심 <b>${esc(hub.term)}</b> · 연결된 일감 ${total}건${total>shown?` 중 연결이 많은 ${shown}건`:""} 표시${total>shown?` <span class="meta">— 더 보려면 '주변 최대' 숫자를 늘리세요</span>`:""}`:total>shown?`<b style="color:var(--warn)">일감 ${total}건 중 최신 ${shown}건만 표시 중</b> — 더 보려면 '최대' 숫자를 늘리세요`:`일감 ${total}건 모두 표시`;
  if(!nodes.length)return msg(terms.length?"이 조건에 맞는 노트가 없습니다.":"오른쪽 사전에 용어를 등록하면 그래프가 그려집니다.");
  nodes.forEach((n,i)=>{const a=i*2.39996,r=28*Math.sqrt(i+.5);n.x=W/2+Math.cos(a)*r;n.y=H/2+Math.sin(a)*r;n.vx=n.vy=0});   // 해바라기 씨 모양으로 고르게 퍼뜨려 놓는다 (처음부터 겹쳐 있으면 서로 튕겨 나간다)
  const hubNode=hub?nodes.find(n=>n.type==="t"&&n.t.id===hub.id):null;      // 중심 용어는 가운데에 놓고, 처음 얼마 동안은 고정해서 주변이 둘러싸게 한다
  if(hubNode){hubNode.x=W/2;hubNode.y=H/2}
  const stCol={대기:col("--warn"),진행:col("--accent"),완료:col("--ok"),중단:col("--ext")};
  const catCol={BC:col("--c-bc"),DR:col("--c-dr"),기타:col("--c-etc")};
  const fillOf=n=>n.type==="t"?col("--accent"):n.type==="x"?col("--ext"):(colMode==="cat"?catCol[catOf(n.n)]:stCol[stOf(n.n)])||col("--ext");

  // 연결 관계(인접 목록): 클릭한 노드와 이어진 노드만 강조하는 데 쓴다
  const byKey=new Map(nodes.map(n=>[n.k,n])),adj=new Map(nodes.map(n=>[n.k,new Set()]));
  edges.forEach(([a,b])=>{adj.get(a.k).add(b.k);adj.get(b.k).add(a.k)});
  if(gFocusKey&&(!byKey.has(gFocusKey)||!gPinned))gFocusKey=null;
  if(!gFocusKey)gPinned=false;
  const inFocus=n=>!gFocusKey||n.k===gFocusKey||adj.get(gFocusKey).has(n.k);
  const shortTitle=(s,m=30)=>{s=(s||"").replace(/^\s*\[[^\]]{1,24}\]\s*(?=\S)/,"");return s.length>m?s.slice(0,m)+"…":s};
  const labelOf=n=>n.type==="t"?n.label:n.type==="x"?`#${n.id}`:`#${n.n.issue_id} ${shortTitle(n.n.subject)}`;

  const pinHint=()=>gPinned?"📌 고정됨 (빈 곳 클릭 / Esc 로 해제)":"클릭: 포커스 고정";
  function showCard(){
    const el=$("#gcard");if(!el)return;
    const n=gFocusKey&&byKey.get(gFocusKey);
    if(!n){el.style.display="none";return}
    const nb=[...adj.get(n.k)].map(k=>byKey.get(k)),nT=nb.filter(x=>x.type==="t").length,nI=nb.length-nT;
    let h;
    if(n.type==="t")h=`<div class="gc-h"><b>${esc(n.t.term)}</b><span class="tag">용어</span></div><div class="meta">${n.t.aliases?`대체 용어 · ${esc(n.t.aliases)}<br>`:""}연결된 일감 ${nI}건${nT?` · 연결된 용어 ${nT}개`:""}</div><div class="meta" style="margin-top:6px">${pinHint()} · 더블클릭: ${sel.includes(n.t.id)?"용어 선택 취소":"이 용어로 필터"}</div>`;
    else if(n.type==="x")h=`<div class="gc-h"><b>#${n.id}</b><span class="tag">미수집</span></div><div class="meta">아직 저장되지 않은 일감입니다.</div><div class="meta" style="margin-top:6px">${pinHint()} · 더블클릭: 레드마인에서 열기</div>`;
    else{const m=n.n,s=stOf(m);h=`<div class="gc-h">${catPill(m)}<span class="meta">#${m.issue_id} · ${m._d}</span></div><div style="font-weight:600;margin:4px 0">${title(m.subject)}</div><div class="chips" style="margin-top:2px"><span class="badge s-${s}">${s}</span>${staleBadge(m)}${rolesOf(m).map(r=>`<span class="tag ${r}">${r}</span>`).join("")}</div><div class="meta" style="margin-top:6px">연결 · 용어 ${nT}개 · 일감 ${nI}건</div><div class="meta" style="margin-top:6px">${pinHint()} · 더블클릭: 노트 열기</div>`}
    el.innerHTML=h;el.style.display="block";
    el.querySelectorAll("[data-ga]").forEach(b=>b.onclick=()=>{
      const a=b.dataset.ga;
      if(a==="clear"){gFocusKey=null;showCard()}
      else if(a==="open")openNote(n.n.issue_id);
      else if(a==="term")toggleTerm(n.t);
      else if(a==="ext")openExternal(`${cfg.url}/issues/${n.id}`);
    });
  }
  function activate(n){   // 더블클릭: 열기 / 용어 선택
    if(n.type==="t")toggleTerm(n.t);else if(n.type==="x")openExternal(`${cfg.url}/issues/${n.id}`);else openNote(n.n.issue_id);
  }

  const T={k:1,x:0,y:0};                                   // 화면 = 세계좌표 * k + (x, y)
  sim={alpha:1,drag:null,hover:null,pan:null,down:null,moved:false,user:false,frame:0};
  const S2=sim;S2.T=T;S2.nodes=nodes;S2.adj=adj;
  function fit(){
    let a=1e9,b=1e9,c=-1e9,d=-1e9;
    nodes.forEach(n=>{a=Math.min(a,n.x-n.r);b=Math.min(b,n.y-n.r);c=Math.max(c,n.x+n.r);d=Math.max(d,n.y+n.r)});
    const pad=70,k=Math.max(.15,Math.min(2,(W-pad*2)/Math.max(1,c-a),(H-pad*2)/Math.max(1,d-b)));
    T.k=k;T.x=W/2-(a+c)/2*k;T.y=H/2-(b+d)/2*k;
  }
  function zoomAt(sx,sy,f){const nk=Math.max(.15,Math.min(6,T.k*f));T.x=sx-(sx-T.x)*(nk/T.k);T.y=sy-(sy-T.y)*(nk/T.k);T.k=nk;S2.user=true}
  function tick(){
    const a=S2.alpha;
    for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
      const p=nodes[i],q=nodes[j];let dx=p.x-q.x,dy=p.y-q.y,d2=dx*dx+dy*dy+0.01;
      if(d2>360000)continue;const d=Math.sqrt(d2),f=3200*a/Math.max(d2,400);     // 아주 가까워도 밀어내는 힘은 거리 20 기준까지만 (너무 세면 튕겨 나간다)
      dx=dx/d*f;dy=dy/d*f;p.vx+=dx;p.vy+=dy;q.vx-=dx;q.vy-=dy;
    }
    edges.forEach(([p,q,k])=>{
      const L=k==="term"?110:k==="tt"?180:140,st2=k==="tt"?0.008:0.02;let dx=q.x-p.x,dy=q.y-p.y;const d=Math.sqrt(dx*dx+dy*dy)||1,f=(d-L)*st2*a;
      dx=dx/d*f;dy=dy/d*f;p.vx+=dx;p.vy+=dy;q.vx-=dx;q.vy-=dy;
    });
    nodes.forEach(n=>{
      n.vx+=(W/2-n.x)*0.0015*a;n.vy+=(H/2-n.y)*0.0015*a;
      const sp=Math.hypot(n.vx,n.vy);if(sp>20){n.vx*=20/sp;n.vy*=20/sp}     // 한 번에 움직이는 거리 제한
      if(n!==S2.drag&&n!==hubNode){n.x+=n.vx;n.y+=n.vy}n.vx*=0.8;n.vy*=0.8;     // 중심 용어는 가운데에 고정 (끌어서 옮길 수는 있다)
    });
    S2.alpha=Math.max(S2.alpha*0.985,S2.drag?0.3:0.02);
  }
  function pill(x,y,txt,fs,bold,strong){   // 글자 뒤에 연한 배경을 깔아 겹쳐도 읽히게 한다
    ctx.font=`${bold?"bold ":""}${fs}px ${FF}`;
    const w=ctx.measureText(txt).width,h=fs*1.55,pad=3/T.k;
    ctx.globalAlpha=.9;ctx.fillStyle=col("--surface");ctx.beginPath();
    if(ctx.roundRect)ctx.roundRect(x-pad,y-h/2,w+pad*2,h,4/T.k);else ctx.rect(x-pad,y-h/2,w+pad*2,h);
    ctx.fill();ctx.globalAlpha=1;
    if(strong){ctx.lineWidth=1/T.k;ctx.strokeStyle=col("--accent");ctx.stroke()}
    ctx.fillStyle=col("--text");ctx.fillText(txt,x,y+fs*.34);
  }
  function draw(){
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
    ctx.setTransform(dpr*T.k,0,0,dpr*T.k,dpr*T.x,dpr*T.y);
    const fk=gFocusKey,sq=Math.sqrt(T.k);
    edges.forEach(([p,q,k,w])=>{
      if(k==="tt"&&!fk)return;      // 용어끼리 점선은 노드에 마우스를 올렸을 때만 보여 준다 (평소에는 화면이 어지럽지 않게)
      const on=!fk||p.k===fk||q.k===fk;
      ctx.globalAlpha=on?(k==="tt"?.75:1):.06;
      ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);
      if(k==="tt"){ctx.setLineDash([6/T.k,5/T.k]);ctx.strokeStyle=col("--accent");ctx.lineWidth=(1.4+Math.min(w,8)*.45)/sq}
      else{ctx.setLineDash([]);ctx.strokeStyle=k==="term"?(fk&&on?col("--sub"):col("--line")):col("--dev");ctx.lineWidth=((k==="term"?1.2:2.6)*(fk&&on?1.8:1))/sq}
      ctx.stroke();ctx.setLineDash([]);
      if(k==="tt"&&on&&(fk||T.k>.7)){ctx.globalAlpha=1;pill((p.x+q.x)/2-4/T.k,(p.y+q.y)/2,String(w),FS*.78/T.k,true,false)}
    });
    ctx.globalAlpha=1;
    const order=fk?[...nodes].sort((a,b)=>(inFocus(a)?1:0)-(inFocus(b)?1:0)):nodes;   // 강조 노드를 위에 그린다
    order.forEach(n=>{
      const dim=fk&&!inFocus(n);
      ctx.beginPath();ctx.arc(n.x,n.y,n.r+(n===S2.hover||n.k===fk?2/T.k:0),0,7);
      ctx.fillStyle=fillOf(n);ctx.globalAlpha=dim?.1:(n.ghost?.45:1);ctx.fill();ctx.globalAlpha=1;
      if(n.k===fk||(n.type==="t"&&(sel.includes(n.t.id)||(hub&&hub.id===n.t.id))&&!dim)){ctx.lineWidth=3/T.k;ctx.strokeStyle=col("--text");ctx.stroke()}
    });
    // 글자: 포커스 중에는 강조된 노드만 제목까지 보여 주고, 평소에는 용어와 가까이 본 노드만 보여 준다
    order.forEach(n=>{
      const lx=n.x+n.r+4/T.k;
      if(fk){if(!inFocus(n))return;pill(lx,n.y,labelOf(n),(n.k===fk?FS:FS*.86)/T.k,n.k===fk||n.type==="t",n.k===fk)}
      else if(n.type==="t"||n===S2.hover||nodes.length<60||T.k>1.3){
        ctx.font=`${n.type==="t"?"bold ":""}${(n.type==="t"?FS*.93:FS*.8)/T.k}px ${FF}`;ctx.fillStyle=col("--text");ctx.fillText(n.type==="t"?n.label:`#${n.n?n.n.issue_id:n.id}`,lx,n.y+4/T.k)}
    });
  }
  function loop(){
    tick();
    if(!S2.user&&!S2.drag&&S2.frame<600&&S2.frame%5===0)fit();    // 처음 10초쯤은 자리 잡는 동안 계속 전체가 보이게 맞춘다
    S2.frame++;draw();S2.raf=requestAnimationFrame(loop)}
  fit();loop();showCard();
  if(window.ResizeObserver){      // 그린 뒤에 캔버스 크기가 바뀌면(레이아웃이 늦게 잡힌 경우 등) 다시 재서 늘어나거나 잘리지 않게 한다
    S2.ro=new ResizeObserver(()=>{
      const w=cv.clientWidth,h=cv.clientHeight;
      if(!w||!h||(Math.abs(w-W)<2&&Math.abs(h-H)<2))return;
      W=w;H=h;cv.width=W*dpr;cv.height=H*dpr;if(!S2.user)fit();
    });
    S2.ro.observe(cv);
  }

  const pos=e=>{const r=cv.getBoundingClientRect();return {sx:e.clientX-r.left,sy:e.clientY-r.top}};
  const hit=(sx,sy)=>[...nodes].reverse().find(n=>{if(gPinned&&!inFocus(n))return false;const dx=n.x*T.k+T.x-sx,dy=n.y*T.k+T.y-sy;return dx*dx+dy*dy<=(n.r*T.k+4)**2});
  const tip=$("#tip");
  const setFocus=(k,pin)=>{gFocusKey=k;gPinned=!!pin&&!!k;showCard();listMarkSel()};
  // 조작: 마우스를 올리면 포커스(연결된 노드만 강조) · 클릭하면 포커스 고정 · 빈 곳 클릭/Esc 로 해제 · 더블클릭하면 노트 열기 · 드래그는 이동
  cv.addEventListener("pointerdown",e=>{
    cv.setPointerCapture(e.pointerId);const {sx,sy}=pos(e),n=hit(sx,sy);
    S2.down={sx,sy};S2.moved=false;
    if(n){S2.drag=n;S2.alpha=Math.max(S2.alpha,0.3)}
    else{S2.pan={sx,sy,tx:T.x,ty:T.y};cv.style.cursor="grabbing"}
  });
  cv.addEventListener("pointermove",e=>{
    const {sx,sy}=pos(e);
    if(S2.down&&Math.hypot(sx-S2.down.sx,sy-S2.down.sy)>3)S2.moved=true;
    if(S2.drag){S2.drag.x=(sx-T.x)/T.k;S2.drag.y=(sy-T.y)/T.k;tip.style.display="none"}
    else if(S2.pan){T.x=S2.pan.tx+sx-S2.pan.sx;T.y=S2.pan.ty+sy-S2.pan.sy;S2.user=true}
    else{
      const n=hit(sx,sy);S2.hover=n||null;cv.style.cursor=n?"pointer":"grab";
      if(!gPinned&&(n?n.k:null)!==gFocusKey)setFocus(n?n.k:null,false);      // 올려 둔 동안만 포커스
      tip.style.display="none"}
  });
  cv.addEventListener("pointerup",e=>{
    const d=S2.drag,pan=S2.pan,click=!S2.moved;
    S2.drag=null;S2.pan=null;S2.down=null;cv.style.cursor="grab";
    try{cv.releasePointerCapture(e.pointerId)}catch(_){}
    if(click){
      if(d)setFocus(d.k,true);                 // 노드 클릭 = 포커스 고정
      else if(pan&&gPinned)setFocus(null,false); // 빈 곳 클릭 = 고정 해제
    }
  });
  cv.addEventListener("pointercancel",()=>{S2.drag=null;S2.pan=null;S2.down=null});
  cv.addEventListener("pointerleave",()=>{tip.style.display="none";S2.hover=null;if(!gPinned&&gFocusKey)setFocus(null,false)});
  cv.addEventListener("dblclick",e=>{const {sx,sy}=pos(e),n=hit(sx,sy);if(n)activate(n);else{S2.user=false;fit()}});     // 노드 더블클릭 = 열기 / 빈 곳 더블클릭 = 전체가 보이게 맞춤
  // 휠: 페이지 스크롤/브라우저 확대가 먼저 먹지 않도록 막고, 커서 위치를 기준으로 확대/축소한다.
  cv.addEventListener("wheel",e=>{e.preventDefault();const {sx,sy}=pos(e);zoomAt(sx,sy,Math.exp(-e.deltaY*0.0016))},{passive:false});
  document.querySelectorAll("[data-z]").forEach(b=>b.onclick=()=>{
    if(b.dataset.z==="fit"){S2.user=false;fit()}else zoomAt(W/2,H/2,b.dataset.z==="in"?1.3:1/1.3)});
  S2.clearFocus=()=>{if(gFocusKey){setFocus(null,false)}};
  S2.extHover=id=>{      // 왼쪽 목록에 커서를 올리면 그래프에서도 그 노드를 강조 (그래프에 없는 일감이면 아무 일도 안 함)
    const n=id?nodes.find(x=>x.n&&x.n.issue_id===id):null;
    if(!id){S2.hover=null;if(!gPinned&&gFocusKey)setFocus(null,false);return}
    if(!n)return;
    S2.hover=n;if(!gPinned&&gFocusKey!==n.k)setFocus(n.k,false);
  };
  S2.extPin=id=>{      // 목록 줄을 한 번 누르면 그 노드를 강조해 고정하고, 이미 고정된 줄을 다시 누르면 해제한다
    const n=nodes.find(x=>x.n&&x.n.issue_id===id);if(!n)return null;
    if(gPinned&&gFocusKey===n.k){setFocus(null,false);return "off"}
    setFocus(n.k,true);return "on";
  };
}
function graphHover(id){if(view==="graph"&&sim&&sim.extHover)sim.extHover(id)}
function graphPin(id){return view==="graph"&&sim&&sim.extPin?sim.extPin(id):null}
function listMarkSel(){   // 강조 고정된 노드의 일감 줄을 목록에서도 표시
  const id=(view==="graph"&&gPinned&&gFocusKey&&gFocusKey[0]==="i")?+gFocusKey.slice(1):0;
  document.querySelectorAll("#list .nrow").forEach(r=>r.classList.toggle("gsel",!!id&&+r.dataset.id===id));
}
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&view==="graph"&&sim&&sim.clearFocus&&!$("#modal").classList.contains("show"))sim.clearFocus()});
let rz;window.onresize=()=>{clearTimeout(rz);rz=setTimeout(()=>{applyUI();renderNav();if(view==="graph")renderGraph()},250)};

