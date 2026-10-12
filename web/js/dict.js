/* ---------- 용어 사전 ---------- */
function renderDict(){
  const form=editing?(()=>{const t=editing==="new"?{term:"",aliases:"",description:""}:terms.find(x=>x.id===editing)||{};
    return `<div class="card"><input id="fn" placeholder="용어 (예: POBA누리)" value="${esc(t.term)}">
      <input id="fa" placeholder="대체 용어 - 쉼표로 구분 (예: 포바누리, 포바)" value="${esc(t.aliases)}">
      <textarea id="fd" placeholder="설명 (선택)">${esc(t.description)}</textarea>
      <div class="row" style="margin-top:0"><button class="primary" id="fs">저장</button><button id="fc">취소</button></div></div>`})()
    :"";
  const picked=selTerms(),one=picked.length===1?picked[0]:null;
  const rk=rangeKeyOf(),pool0=dictPool(),baseSet=picked.length?pool0.filter(hasSel):pool0;      // 지금 기간 안에서, 선택한 용어를 포함한 노트
  const detail=editing?"":one?`<div class="card"><b>${esc(one.term)}</b> <span class="meta">${baseSet.length}건</span>
     ${one.aliases?`<div class="meta" style="margin-top:4px">대체 용어 · ${esc(one.aliases)}</div>`:""}
     ${one.description?`<div style="white-space:pre-wrap;margin-top:6px">${esc(one.description)}</div>`:""}
     <div class="row"><button id="fe">수정</button><button id="fdel">삭제</button><button id="fclr">선택 해제</button></div></div>`
    :picked.length>1?`<div class="card"><b>${picked.map(t=>esc(t.term)).join(selSym())}</b> <span class="meta">${selMode==="or"?"하나라도 포함한":"모두 포함한"} 노트 ${baseSet.length}건</span>
     <div class="seg" style="margin-top:8px"><button data-selmode="and" class="${selMode==="and"?"on":""}">모두 포함</button><button data-selmode="or" class="${selMode==="or"?"on":""}">하나라도</button></div>
     <div class="meta" style="margin-top:6px">선택한 용어를 다시 누르면 취소됩니다. 다른 칩의 숫자는 지금 선택과 겹치는 노트 수입니다.</div>
     <div class="row"><button id="fclr">선택 모두 해제</button></div></div>`:"";
  const gl=V2()&&view==="graph"&&ui.hl&&picked.length&&!editing?(()=>{   // 새 디자인 · 그래프: 왼쪽 목록을 숨겼을 때만, 고른 주제의 일감을 사전 칸 아래에 보여 준다 (보일 때는 왼쪽 목록과 같은 내용이라 겹침)
    const l=[...baseSet].sort(byUpdDesc),top=l.slice(0,10);
    return `<div class="card v2gl"><div class="meta">고른 주제의 일감 <b>${l.length}건</b>${picked.length>1?` · ${selMode==="or"?"하나라도 포함":"모두 포함"}`:""}</div>
      ${top.map(n=>`<a class="v2gl-r" data-gopen="${n.issue_id}" title="눌러서 노트 열기 (← 돌아가기로 그래프에 돌아와요)"><span class="d s-${stOf(n)}"></span><span class="t">${esc(n.subject)}</span><span class="m">#${n.issue_id} · ${stOf(n)} · ${n._d}</span></a>`).join("")||`<span class="meta">이 기간에는 없어요</span>`}
      ${l.length?`<button type="button" class="mini" data-ghist>이력에서 ${l.length}건 모두 보기</button>`:""}</div>`})():"";
  $("#dict").innerHTML=`<div class="top2"><h3>용어 사전</h3>${editing?"":`<button class="primary" id="fnew">+ 용어 추가</button>`}</div>${form}
    ${editing||!terms.length?"":`<div class="meta" style="margin:-2px 0 6px">숫자 = <b>${esc(searching()&&rk!=="graph"?"전체 기간":rangeText(rk))}</b> · <b>${scopeText()}</b> 일감 수</div><div class="dscope">${scopeChecks()}</div>`}
    ${picked.length||editing||!terms.length?"":`<div class="meta" style="margin-bottom:-4px">누르면 선택, 다시 누르면 취소 · 여러 개를 누르면 모두 포함한 노트만 찾습니다</div>`}
    <div id="dchips">${terms.map(t=>{const on=sel.includes(t.id),c=on?baseSet.length:baseSet.filter(n=>has(n,t)).length;
      return `<span class="dc ${on?"on":""} ${!on&&picked.length&&!c?"dim":""}" data-t="${t.id}" title="${esc(t.description||"")}"><b>${esc(t.term)}</b><span class="n">${c}</span></span>`}).join("")||`<span class="meta">아직 등록된 용어가 없습니다. 오른쪽 위 '+ 용어 추가'로 시작하세요.</span>`}</div>${detail}${gl}`;
  document.querySelectorAll("#dict [data-gopen]").forEach(a=>a.onclick=()=>openNote(+a.dataset.gopen));
  document.querySelectorAll("#dict [data-ghist]").forEach(b=>b.onclick=()=>setNav("history",{keepSel:true}));
  document.querySelectorAll(".dc").forEach(a=>a.onclick=()=>toggleTerm(terms.find(x=>x.id==a.dataset.t)));
  if($("#fclr"))$("#fclr").onclick=clearTerms;
  document.querySelectorAll("#dict [data-selmode]").forEach(b=>b.onclick=()=>{selMode=b.dataset.selmode;renderAll()});
  const g=id=>$(id);
  if(g("#fnew"))g("#fnew").onclick=()=>{editing="new";renderDict();$("#fn").focus()};
  if(g("#fc"))g("#fc").onclick=()=>{editing=null;renderDict()};
  if(g("#fs")){
    const save=async()=>{const name=$("#fn").value.trim();if(!name)return $("#fn").focus();
      await post("/api/terms",{id:editing==="new"?null:editing,term:name,aliases:$("#fa").value,description:$("#fd").value});
      editing=null;terms=await api("/api/terms");terms.forEach(prepTerm);
      sel=sel.filter(id=>terms.some(t=>t.id===id));renderAll()};
    g("#fs").onclick=save;
    ["#fn","#fa"].forEach(i=>g(i).onkeydown=e=>{if(e.key==="Enter")save();if(e.key==="Escape"){editing=null;renderDict()}});
  }
  if(g("#fe"))g("#fe").onclick=()=>{editing=one.id;renderDict();$("#fn").focus()};
  if(g("#fdel"))g("#fdel").onclick=async()=>{
    if(!await askC(`'${one.term}' 용어를 삭제할까요? (일감 데이터는 그대로입니다)`))return;
    await api("/api/terms/"+one.id,{method:"DELETE"});terms=terms.filter(t=>t.id!==one.id);clearTerms()};
}

