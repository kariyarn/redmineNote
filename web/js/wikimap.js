/* ---------- 업무 위키 마인드맵 (2.42) ----------
   문서 제목만 가지로 펼쳐 전체 흐름을 본다 (본문은 길어서 그리지 않는다). 제목을 누르면 그 문서 편집기로 바로 간다.
   - 가지 모양: 트리(위 → 아래) · 좌우 갈래 · 오른쪽 갈래 · 왼쪽 갈래 · 인덱스(들여쓴 목차). 고른 모양은 기억한다 (ui.wkMapLayout)
   - 범위: 주제 전체 / 지금 문서부터. 처음에는 3단계까지만 펼친다 (가지 끝의 ○ 로 접고 펴기, 접힌 가지는 그 아래 문서 수)
   - 빈 문서는 점선 · 흐리게, 확인 안 한 문서는 점 · 굵게, 지금 문서는 테두리 강조, 잠긴(안 연) 주제는 🔒 하나만 (아래는 그리지 않는다)
   - 끌어서 이동 · 휠 = 위아래(Shift+휠 = 좌우) · Ctrl+휠 = 확대/축소 · 맞춤 · Esc = 닫기
   그림은 SVG 한 장. 글자 폭은 canvas 로 재서 상자 크기를 정한다 */
let wkMapOn=false,wkMapRoot=null,wkMapV={x:0,y:0,k:1},wkMapNodes=[];
const wkMapFold=new Map();      // 문서 id -> 펼침(true)/접힘(false). 없으면 깊이로 정한다 (3단계까지 펼침)
const WK_MAP_LAYOUTS=[["tree","트리",'<path d="M12 4v5M12 9H6v5M12 9h6v5"/><rect x="9" y="2" width="6" height="3" rx="1"/><rect x="3" y="14" width="6" height="4" rx="1"/><rect x="15" y="14" width="6" height="4" rx="1"/>'],
  ["both","좌우 갈래",'<rect x="9" y="10" width="6" height="4" rx="1"/><path d="M9 12H6M6 6v12M6 6H3M6 18H3M15 12h3M18 6v12M18 6h3M18 18h3"/>'],
  ["right","오른쪽 갈래",'<rect x="2" y="10" width="6" height="4" rx="1"/><path d="M8 12h4M12 5v14M12 5h4M12 12h4M12 19h4"/><path d="M17 5h4M17 12h4M17 19h4" opacity=".55"/>'],
  ["left","왼쪽 갈래",'<rect x="16" y="10" width="6" height="4" rx="1"/><path d="M16 12h-4M12 5v14M12 5H8M12 12H8M12 19H8"/><path d="M7 5H3M7 12H3M7 19H3" opacity=".55"/>'],
  ["index","인덱스",'<path d="M4 5h10M8 10h12M8 15h12M12 20h8"/><path d="M5 6v9h2M5 10h2" opacity=".55"/>']];
const WKM={H:30,GX:46,GY:10,GV:54,GH:14,MAXW:240,PAD:12,IND:30};
const wkMapLayout=()=>WK_MAP_LAYOUTS.some(l=>l[0]===ui.wkMapLayout)?ui.wkMapLayout:"both";
function wkMapToggle(){wkMapOn?wkMapClose():wkMapShow(ui.wkMapScope==="here"&&wkCur()&&!wkShut(wkCur())?wkCur().id:null)}
function wkMapShow(rootId){
  wkFlush();wkMapOn=true;wkMapRoot=rootId!=null&&wkById(rootId)?rootId:null;
  const w=$(".wk-wrap");if(!w)return;w.classList.add("map-on");
  const b=$("#wkMapB");if(b){b.classList.add("on");b.setAttribute("aria-pressed","true")}
  $("#wkMapBox").hidden=false;wkMapDraw(true);
  const st=$("#wkmStage");if(st)st.focus({preventScroll:true});
}
function wkMapClose(){
  if(!wkMapOn)return;wkMapOn=false;
  const w=$(".wk-wrap");if(w)w.classList.remove("map-on");
  const box=$("#wkMapBox");if(box){box.hidden=true;box.innerHTML=""}
  const b=$("#wkMapB");if(b){b.classList.remove("on");b.setAttribute("aria-pressed","false")}
}
function wkMapRestore(){if(wkMapOn){wkMapOn=false;wkMapShow(wkMapRoot)}}      // 위키 화면을 다시 그렸을 때 (다른 화면에 다녀옴)
function wkMapRedraw(){if(wkMapOn){if(wkMapRoot!=null&&!wkById(wkMapRoot))wkMapRoot=null;wkMapDraw(false)}}
const wkMapIsOpen=(id,d)=>wkMapFold.has(id)?wkMapFold.get(id):d<3;
function wkMapTree(){
  const mk=(w,d)=>{const shut=wkShut(w),kids=shut?[]:wkKids(w.id),open=wkMapIsOpen(w.id,d);
    return {id:w.id,t:w.title,d,shut,locked:!!w.locked,empty:!shut&&wkBodyEmpty(w.body)&&!kids.length,unread:wkUnread(w),subUn:!wkUnread(w)&&!!kids.length&&wkUnreadIn(w.id),
      n:kids.length,all:shut?(w.hidden||[]).length:wkCount(w.id),open,kids:open?kids.map(k=>mk(k,d+1)):[]}};
  const r=wkMapRoot!=null?wkById(wkMapRoot):null;
  if(r)return mk(r,0);
  const roots=wkKids(null);
  return {id:null,t:"업무 위키",d:0,root:true,n:roots.length,all:wikis.length,open:true,kids:roots.map(k=>mk(k,1))};
}
let wkMapCtx=null;
function wkMapMeasure(nd){
  if(!wkMapCtx)wkMapCtx=document.createElement("canvas").getContext("2d");
  const fam=getComputedStyle(document.body).fontFamily||"sans-serif",big=nd.d===0,mid=nd.d===1;
  nd.fs=big?15:mid?14:13;nd.fw=big||mid?600:400;
  wkMapCtx.font=`${nd.fw} ${nd.fs}px ${fam}`;
  let t=(nd.shut?"🔒 ":"")+nd.t;
  const max=WKM.MAXW-WKM.PAD*2;
  if(wkMapCtx.measureText(t).width>max){while(t.length>1&&wkMapCtx.measureText(t+"…").width>max)t=t.slice(0,-1);t+="…"}
  nd.label=t;nd.w=Math.ceil(wkMapCtx.measureText(t).width)+WKM.PAD*2+(nd.unread?10:0);nd.h=big?WKM.H+6:WKM.H;
}
/* 배치: 모든 모양이 nd.x(왼쪽 끝) · nd.cy(가운데 높이)를 정한다. dir = 가지가 뻗는 쪽 (1 = 오른쪽, -1 = 왼쪽, 0 = 아래) */
function wkMapSpan(nd,vert){      // 하위 가지가 차지하는 폭(트리) · 높이(좌우)
  const self=vert?nd.w:nd.h,gap=vert?WKM.GH:WKM.GY;
  if(!nd.kids.length)return nd.span=self;
  const s=nd.kids.reduce((a,k)=>a+wkMapSpan(k,vert),0)+gap*(nd.kids.length-1);
  return nd.span=Math.max(self,s);
}
function wkMapPlaceH(nd,x,top,dir){      // 좌우 갈래: x = 부모 쪽 끝, top = 이 가지 몫의 위쪽
  nd.dir=dir;nd.x=dir>0?x:x-nd.w;nd.cy=top+nd.span/2;
  const s=nd.kids.reduce((a,k)=>a+k.span,0)+WKM.GY*(nd.kids.length-1);let y=top+(nd.span-s)/2;
  const nx=dir>0?nd.x+nd.w+WKM.GX:nd.x-WKM.GX;
  nd.kids.forEach(k=>{wkMapPlaceH(k,nx,y,dir);y+=k.span+WKM.GY});
}
function wkMapPlaceV(nd,left,depthY){
  nd.dir=0;nd.x=left+(nd.span-nd.w)/2;nd.cy=depthY+nd.h/2;
  const s=nd.kids.reduce((a,k)=>a+k.span,0)+WKM.GH*(nd.kids.length-1);let x=left+(nd.span-s)/2;
  nd.kids.forEach(k=>{wkMapPlaceV(k,x,depthY+nd.h+WKM.GV);x+=k.span+WKM.GH});
}
function wkMapLayoutTree(root,lay){
  const all=[];(function walk(n){wkMapMeasure(n);all.push(n);n.kids.forEach(walk)})(root);
  if(lay==="tree"){wkMapSpan(root,true);wkMapPlaceV(root,0,0)}
  else if(lay==="index"){let row=0;all.forEach(n=>{n.dir=0;n.x=n.d*WKM.IND;n.cy=row*(WKM.H+8)+n.h/2;row++})}      // 그린 순서 = 위에서 아래 (목차)
  else if(lay==="both"&&root.kids.length>1){
    root.kids.forEach(k=>wkMapSpan(k,false));
    const tot=root.kids.reduce((a,k)=>a+k.span,0);let acc=0,cut=root.kids.length;      // 위쪽 절반(높이 기준)은 오른쪽, 나머지는 왼쪽: 순서를 지키며 양쪽 높이를 비슷하게
    for(let i=0;i<root.kids.length;i++){if(acc>0&&acc+root.kids[i].span/2>tot/2){cut=i;break}acc+=root.kids[i].span}
    const R=root.kids.slice(0,cut),L=root.kids.slice(cut);
    root.dir=0;root.x=-root.w/2;root.cy=0;
    const side=(list,dir)=>{const s=list.reduce((a,k)=>a+k.span,0)+WKM.GY*Math.max(0,list.length-1);let y=-s/2;
      list.forEach(k=>{wkMapPlaceH(k,dir>0?root.x+root.w+WKM.GX:root.x-WKM.GX,y,dir);y+=k.span+WKM.GY})};
    side(R,1);side(L,-1);root.split={R:new Set(R),L:new Set(L)};
  }else{const dir=lay==="left"?-1:1;wkMapSpan(root,false);wkMapPlaceH(root,0,0,dir)}
  return all;
}
const WKM_COLORS=6;
function wkMapSvg(root,all,lay){
  const cur=wkCur()?wkCur().id:null,edges=[],nodes=[];
  const br=new Map();(function col(n,c){br.set(n,c);n.kids.forEach((k,i)=>col(k,n.d===0||n.root?i%WKM_COLORS:c))})(root,-1);
  const outX=(n,dir)=>dir>0?n.x+n.w:n.x;
  const kidDir=(n,k)=>lay==="both"&&n===root&&root.split?(root.split.L.has(k)?-1:1):k.dir;
  all.forEach(n=>n.kids.forEach(k=>{
    const c=br.get(k);let d;
    if(lay==="tree"){const x1=n.x+n.w/2,y1=n.cy+n.h/2,x2=k.x+k.w/2,y2=k.cy-k.h/2,m=(y1+y2)/2;d=`M${x1} ${y1}C${x1} ${m} ${x2} ${m} ${x2} ${y2}`}
    else if(lay==="index"){const x1=n.x+12,y1=n.cy+n.h/2,x2=k.x,y2=k.cy;d=`M${x1} ${y1}V${y2-6}Q${x1} ${y2} ${x1+6} ${y2}H${x2}`}
    else{const dir=kidDir(n,k),x1=outX(n,dir),y1=n.cy,x2=dir>0?k.x:k.x+k.w,y2=k.cy,m=(x1+x2)/2;d=`M${x1} ${y1}C${m} ${y1} ${m} ${y2} ${x2} ${y2}`}
    edges.push(`<path class="wkm-e c${c}" d="${d}"/>`);
  }));
  all.forEach(n=>{
    const c=br.get(n),y=n.cy-n.h/2,cls=["wkm-n",n.root||n.d===0?"root":"c"+c,n.id===cur?"cur":"",n.empty?"empty":"",n.shut?"shut":"",n.unread?"unread":""].filter(Boolean).join(" ");
    const tip=n.root?`업무 위키 · 주제 ${n.n}개 · 문서 ${n.all}개`:`${wkTrail(n.id).map(x=>x.title).join(" › ")}${n.shut?" (잠긴 주제 · 눌러서 암호 넣기)":n.empty?" (본문이 비어 있어요)":""}${n.unread?" · 확인 안 한 변경":""} · 눌러서 문서 열기`;
    let tg="";
    if(n.n&&!n.shut&&!n.root){      // 가지 접기/펴기: 가지가 뻗는 쪽 끝에
      const dir=lay==="tree"?0:lay==="index"?2:n.dir;
      const tx=dir===0?n.x+n.w/2:dir===2?n.x-11:dir>0?n.x+n.w+9:n.x-9,ty=dir===0?n.cy+n.h/2+9:n.cy;
      tg=`<g class="wkm-t c${c}" data-wmt="${n.id}" role="button" tabindex="-1" aria-label="${n.open?"가지 접기":`가지 펴기 (아래 문서 ${n.all}개)`}"><title>${n.open?"가지 접기":`가지 펴기 · 아래 문서 ${n.all}개`}</title><circle cx="${tx}" cy="${ty}" r="${n.open?7:9}"/>${n.open?`<path d="M${tx-3.5} ${ty}h7"/>`:`<text x="${tx}" y="${ty}" dy=".35em">${n.all>99?"99+":n.all}</text>`}</g>`;
    }
    nodes.push(`<g class="${cls}" data-wmn="${n.id??""}" role="link" tabindex="-1"><title>${esc(tip)}</title><rect x="${n.x}" y="${y}" width="${n.w}" height="${n.h}" rx="${n.root||n.d===0?n.h/2:7}"/>`
      +`<text x="${n.x+WKM.PAD}" y="${n.cy}" dy=".35em" style="font-size:${n.fs}px;font-weight:${n.unread?700:n.fw}">${esc(n.label)}</text>`
      +(n.unread?`<circle class="wkm-dot" cx="${n.x+n.w-10}" cy="${n.cy}" r="3.5"/>`:n.subUn&&!n.open?`<circle class="wkm-dot ring" cx="${n.x+n.w-5}" cy="${y+5}" r="3"/>`:"")+`</g>${tg}`);
  });
  return edges.join("")+nodes.join("");
}
function wkMapDraw(fit,keep){
  const box=$("#wkMapBox");if(!box||!wkMapOn)return;
  const lay=wkMapLayout(),cur=wkCur(),rootW=wkMapRoot!=null?wkById(wkMapRoot):null;
  if(!box.querySelector(".wkm-bar")){
    box.innerHTML=`<div class="wkm-bar" role="toolbar" aria-label="마인드맵"><span class="wkm-seg" role="radiogroup" aria-label="가지 모양">${WK_MAP_LAYOUTS.map(([k,n,ic])=>`<button type="button" role="radio" data-wml="${k}" title="${n}">${IC(ic)}<span>${n}</span></button>`).join("")}</span>
      <select id="wkmScope" aria-label="범위" title="마인드맵 범위"></select>
      <span class="wkm-g"><button type="button" class="mini" data-wma="open" title="모든 가지 펴기">모두 펴기</button><button type="button" class="mini" data-wma="fold" title="첫 단계만 남기고 접기">모두 접기</button></span>
      <span class="wkm-g"><button type="button" class="mini" data-wma="out" title="축소 (Ctrl+휠)" aria-label="축소">−</button><span class="wkm-z" id="wkmZ">100%</span><button type="button" class="mini" data-wma="in" title="확대 (Ctrl+휠)" aria-label="확대">＋</button><button type="button" class="mini" data-wma="fit" title="한 화면에 맞추기">맞춤</button></span>
      <span class="sp"></span><button type="button" data-wma="close" title="마인드맵 닫기 (Esc)">닫기</button></div>
      <div class="wkm-stage" id="wkmStage" tabindex="0" aria-label="마인드맵. 끌어서 이동, Ctrl+휠로 확대"><svg id="wkmSvg" xmlns="http://www.w3.org/2000/svg"><g id="wkmG"></g></svg></div>
      <div class="wkm-hint meta">제목을 누르면 그 문서로 · ○ 로 가지 접기/펴기 · 빈 곳을 끌어서 이동 · Ctrl+휠 확대 · <span class="wkm-dot-k"></span> 확인 안 한 변경<span class="sp"></span><span id="wkmInfo"></span></div>`;
    wkMapWire(box);
  }
  box.querySelectorAll("[data-wml]").forEach(b=>{const on=b.dataset.wml===lay;b.classList.toggle("on",on);b.setAttribute("aria-checked",on)});
  const sc=$("#wkmScope"),canHere=cur&&!wkShut(cur);
  sc.innerHTML=`<option value="">주제 전체</option>${rootW?`<option value="${rootW.id}">‘${esc(rootW.title)}’ 부터</option>`:""}${canHere&&(!rootW||rootW.id!==cur.id)?`<option value="${cur.id}">지금 문서 ‘${esc(cur.title)}’ 부터</option>`:""}${rootW&&rootW.parent_id!=null&&wkById(rootW.parent_id)?`<option value="${rootW.parent_id}">↑ 한 단계 위 ‘${esc(wkById(rootW.parent_id).title)}’ 부터</option>`:""}`;
  sc.value=rootW?String(rootW.id):"";
  const root=wkMapTree(),all=wkMapLayoutTree(root,lay);wkMapNodes=all;
  let anchor=null;      // 가지를 접고 펼 때 누른 문서가 화면에서 제자리에 있도록
  if(keep!=null){const o=wkMapNodes.find(n=>n.id===keep);if(o)anchor=o}
  const before=keep!=null&&wkMapDraw.last?wkMapDraw.last.get(keep):null;
  $("#wkmG").innerHTML=wikis.length?wkMapSvg(root,all,lay):"";
  wkMapDraw.last=new Map(all.map(n=>[n.id,{x:n.x,cy:n.cy}]));
  $("#wkmInfo").textContent=wikis.length?`문서 ${all.length-(root.root?1:0)}개 보임${root.all>all.length?` · 전체 ${root.all}개`:""}`:"아직 문서가 없어요";
  if(fit)wkMapFit();
  else if(anchor&&before){wkMapV.x-=(anchor.x-before.x)*wkMapV.k;wkMapV.y-=(anchor.cy-before.cy)*wkMapV.k;wkMapApply()}
  else wkMapApply();
}
function wkMapApply(){const g=$("#wkmG");if(g)g.setAttribute("transform",`translate(${wkMapV.x},${wkMapV.y}) scale(${wkMapV.k})`);const z=$("#wkmZ");if(z)z.textContent=Math.round(wkMapV.k*100)+"%"}
function wkMapFit(){
  const st=$("#wkmStage");if(!st||!wkMapNodes.length){wkMapApply();return}
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;wkMapNodes.forEach(n=>{x0=Math.min(x0,n.x-14);x1=Math.max(x1,n.x+n.w+14);y0=Math.min(y0,n.cy-n.h/2-4);y1=Math.max(y1,n.cy+n.h/2+20)});
  const W=st.clientWidth||800,H=st.clientHeight||500,k=Math.max(.25,Math.min(1.1,(W-48)/(x1-x0),(H-48)/(y1-y0)));
  wkMapV={k,x:(W-(x1-x0)*k)/2-x0*k,y:Math.max(24,(H-(y1-y0)*k)/2)-y0*k};
  if(wkMapLayout()==="index")wkMapV.x=Math.min(wkMapV.x,32-x0*k);      // 인덱스는 왼쪽 위에서 시작
  wkMapApply();
}
function wkMapZoom(f,cx,cy){
  const st=$("#wkmStage");if(!st)return;if(cx==null){cx=st.clientWidth/2;cy=st.clientHeight/2}
  const k=Math.max(.2,Math.min(2.5,wkMapV.k*f)),r=k/wkMapV.k;wkMapV.x=cx-(cx-wkMapV.x)*r;wkMapV.y=cy-(cy-wkMapV.y)*r;wkMapV.k=k;wkMapApply();
}
function wkMapSetAll(open){
  const root=wkMapRoot!=null?wkById(wkMapRoot):null,base=root?0:1;
  (function walk(pid,d){wkKids(pid).forEach(k=>{if(wkShut(k))return;if(wkKids(k.id).length)wkMapFold.set(k.id,open||d<base);walk(k.id,d+1)})})(root?root.id:null,base);
  if(root)wkMapFold.set(root.id,true);
  wkMapDraw(true);
}
function wkMapWire(box){
  box.querySelector(".wkm-bar").onclick=e=>{
    const l=e.target.closest("[data-wml]");if(l){ui.wkMapLayout=l.dataset.wml;saveUI();wkMapDraw(true);return}
    const a=e.target.closest("[data-wma]");if(!a)return;const k=a.dataset.wma;
    if(k==="close")wkMapClose();else if(k==="fit")wkMapFit();else if(k==="in")wkMapZoom(1.2);else if(k==="out")wkMapZoom(1/1.2);
    else if(k==="open")wkMapSetAll(true);else if(k==="fold")wkMapSetAll(false);
  };
  $("#wkmScope").onchange=e=>{const v=e.target.value;wkMapRoot=v?+v:null;ui.wkMapScope=v?"here":"all";saveUI();wkMapDraw(true)};
  const st=$("#wkmStage");
  st.addEventListener("wheel",e=>{e.preventDefault();const r=st.getBoundingClientRect();
    if(e.ctrlKey||e.metaKey)wkMapZoom(Math.exp(-e.deltaY*.0015),e.clientX-r.left,e.clientY-r.top);
    else{wkMapV.x-=e.shiftKey?e.deltaY:e.deltaX;wkMapV.y-=e.shiftKey?0:e.deltaY;wkMapApply()}},{passive:false});
  let pan=null;
  st.addEventListener("pointerdown",e=>{if(e.button!==0||e.target.closest("[data-wmn],[data-wmt]"))return;pan={x:e.clientX,y:e.clientY,vx:wkMapV.x,vy:wkMapV.y};st.setPointerCapture(e.pointerId);st.classList.add("panning")});
  st.addEventListener("pointermove",e=>{if(!pan)return;wkMapV.x=pan.vx+e.clientX-pan.x;wkMapV.y=pan.vy+e.clientY-pan.y;wkMapApply()});
  const end=()=>{pan=null;st.classList.remove("panning")};st.addEventListener("pointerup",end);st.addEventListener("pointercancel",end);
  st.addEventListener("click",e=>{
    const t=e.target.closest("[data-wmt]");
    if(t){const id=+t.dataset.wmt,n=wkMapNodes.find(x=>x.id===id);if(n){wkMapFold.set(id,!n.open);wkMapDraw(false,id)}return}
    const n=e.target.closest("[data-wmn]");if(!n||n.dataset.wmn==="")return;
    const id=+n.dataset.wmn;wkMapClose();wkOpen(id);
    const w=wkById(id);if(w&&wkShut(w))setTimeout(()=>$("#wkPw")&&$("#wkPw").focus(),0);
  });
  st.addEventListener("keydown",e=>{
    if(e.key==="+"||e.key==="="){e.preventDefault();wkMapZoom(1.2)}else if(e.key==="-"){e.preventDefault();wkMapZoom(1/1.2)}
    else if(e.key==="0"){e.preventDefault();wkMapFit()}
    else if(e.key.startsWith("Arrow")){e.preventDefault();const s=60;if(e.key==="ArrowLeft")wkMapV.x+=s;if(e.key==="ArrowRight")wkMapV.x-=s;if(e.key==="ArrowUp")wkMapV.y+=s;if(e.key==="ArrowDown")wkMapV.y-=s;wkMapApply()}
  });
}
document.addEventListener("keydown",e=>{
  if(e.key!=="Escape"||!wkMapOn||view!=="wiki"||e.defaultPrevented||document.querySelector("#wdlg.show,.wk-menu"))return;
  const a=document.activeElement;if(a&&(a.isContentEditable||/^(INPUT|TEXTAREA)$/.test(a.tagName)))return;
  e.preventDefault();e.stopImmediatePropagation();wkMapClose();
},true);
addEventListener("resize",()=>{if(wkMapOn&&view==="wiki")wkMapApply()});
