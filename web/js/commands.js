/* ---------- 보관함 · 명령어: 단축어를 누르면 댓글 초안에 설명을 넣는다 ---------- */
let cmdItems=[],cmdLoaded=false,cmdLoading=null,cmdSelected=null,cmdDraft=null,cmdSearch="";

async function cmdLoad(force=false){
  if(cmdLoaded&&!force)return cmdItems;
  if(cmdLoading&&!force)return cmdLoading;
  cmdLoading=api("/api/commands").then(rows=>{cmdItems=rows;cmdLoaded=true;return rows})
    .finally(()=>{cmdLoading=null});
  return cmdLoading;
}
function cmdSort(){cmdItems.sort((a,b)=>a.shortcut.localeCompare(b.shortcut,"ko")||a.id-b.id)}
function cmdPut(row){
  const i=cmdItems.findIndex(x=>x.id===row.id);
  if(i<0)cmdItems.push(row);else cmdItems[i]=row;
  cmdSort();
}
const cmdSig=d=>JSON.stringify([d.shortcut,d.description]);
const cmdDirty=()=>!!(cmdDraft&&$("#cmdShortcut")&&cmdSig({shortcut:$("#cmdShortcut").value,description:$("#cmdDescription").value})!==cmdDraft._base);
function cmdPaintComposer(c){
  const box=c.querySelector(".cmcmd");if(!box)return;
  if(!cmdLoaded){box.innerHTML=`<span class="meta">명령어 불러오는 중…</span>`;return}
  if(!cmdItems.length){
    box.innerHTML=`<span class="meta">자주 쓰는 댓글은 <button type="button" class="mini" data-cmd-open>보관함 · 명령어</button>에 등록해 두세요.</span>`;
    box.querySelector("[data-cmd-open]").onclick=()=>setNav("vaultCommands");
    return;
  }
  box.innerHTML=`<span class="meta">명령어</span>${cmdItems.map(x=>`<button type="button" class="mini cmd-shortcut" data-cmd-id="${x.id}" title="${esc(x.description)}">${esc(x.shortcut)}</button>`).join("")}`;
  box.querySelectorAll("[data-cmd-id]").forEach(b=>b.onclick=()=>{
    const item=cmdItems.find(x=>x.id===+b.dataset.cmdId),ta=c.querySelector(".cmta");
    if(!item||!ta)return;
    const current=edGet(ta),next=current?current+(current.endsWith("\n")?"":"\n")+item.description:item.description;
    edInit(ta,next);setDraft(nIssueId(c),edGet(ta));syncComposers(curNote(),ta);
    const last=ta.querySelector(".tb:last-of-type")||ta.lastElementChild;if(last&&last.focus)last.focus();
  });
}
function nIssueId(c){return +(c.closest("#cmpanel")?$("#cmpanel").dataset.id:cur)}
function cmdWireComposer(root){
  root.querySelectorAll(".cmp").forEach(c=>{
    cmdPaintComposer(c);
    cmdLoad().then(()=>cmdPaintComposer(c)).catch(e=>{
      const box=c.querySelector(".cmcmd");if(!box)return;
      box.innerHTML=`<span class="meta">명령어를 불러오지 못했어요 (${esc(e.message)}).</span><button type="button" class="mini">다시 시도</button>`;
      box.querySelector("button").onclick=()=>cmdWireComposer(c);
    });
  });
}
function cmdRefreshComposers(){document.querySelectorAll(".cmp").forEach(cmdPaintComposer)}

function renderCommands(){
  $("#center").innerHTML=`<div class="tr-wrap"><div class="tr-side">
    <div class="nv-vault-title">보관함 · 명령어</div>
    <button type="button" class="primary" id="cmdNew">＋ 새 명령어</button>
    <input id="cmdQ" placeholder="단축어 · 설명 검색" value="${esc(cmdSearch)}" autocomplete="off">
    <div class="tr-list" id="cmdList"></div></div>
    <div class="tr-main" id="cmdMain"></div></div>`;
  $("#cmdNew").onclick=async()=>{if(cmdDirty()&&!await askC("수정한 내용이 저장되지 않았어요. 버리고 새 명령어를 만들까요?"))return;
    cmdSelected=null;cmdDraft={id:null,shortcut:"",description:""};cmdDraft._base=cmdSig(cmdDraft);cmdDrawList();cmdDrawMain();setTimeout(()=>$("#cmdShortcut")&&$("#cmdShortcut").focus(),0)};
  $("#cmdQ").oninput=e=>{cmdSearch=e.target.value.trim();cmdDrawList()};
  cmdLoad().then(()=>{
    if(view!=="commands")return;
    if(cmdSelected&&!cmdItems.some(x=>x.id===cmdSelected))cmdSelected=null;
    cmdSort();cmdDrawList();cmdDrawMain();
  }).catch(e=>{
    const main=$("#cmdMain");if(view!=="commands"||!main)return;
    main.innerHTML=`<div class="card"><b>명령어를 불러오지 못했어요.</b><div class="meta">${esc(e.message)}</div><button type="button" class="mini" id="cmdRetry">다시 시도</button></div>`;
    $("#cmdRetry").onclick=()=>renderCommands();
  });
}
function cmdDrawList(){
  const list=cmdItems.filter(x=>!cmdSearch||`${x.shortcut}\n${x.description}`.toLowerCase().includes(cmdSearch.toLowerCase()));
  const el=$("#cmdList");if(!el)return;
  el.innerHTML=list.map(x=>`<div class="tr-item ${x.id===cmdSelected&&!cmdDraft?"on":""}" data-cmd-select="${x.id}">
    <div class="tt">${esc(x.shortcut)}</div><div class="sn">${esc(x.description.replace(/\s+/g," ").slice(0,160))}</div></div>`).join("")
    ||`<div class="meta" style="padding:10px 4px">${cmdItems.length?"검색 결과가 없어요":"아직 명령어가 없어요. ＋ 새 명령어로 단축어와 댓글 문구를 등록해 보세요."}</div>`;
  el.querySelectorAll("[data-cmd-select]").forEach(b=>b.onclick=async()=>{if(cmdDirty()&&!await askC("수정한 내용이 저장되지 않았어요. 버리고 이동할까요?"))return;
    cmdSelected=+b.dataset.cmdSelect;cmdDraft=null;cmdDrawList();cmdDrawMain()});
}
function cmdDrawMain(){
  const el=$("#cmdMain");if(!el)return;
  if(cmdDraft){
    el.innerHTML=`<div class="card tr-doc tr-ed">
      <label class="tr-lab" for="cmdShortcut" style="margin-top:0">단축어</label>
      <input type="text" id="cmdShortcut" maxlength="40" placeholder="예) 배포요청" value="${esc(cmdDraft.shortcut)}">
      <label class="tr-lab" for="cmdDescription">댓글에 넣을 설명 문구</label>
      <textarea id="cmdDescription" rows="8" maxlength="20000" placeholder="예) 운영 서버 배포를 요청드립니다.">${esc(cmdDraft.description)}</textarea>
      <div class="row" style="margin-top:14px"><button type="button" class="primary" id="cmdSave">저장</button><button type="button" id="cmdCancel">취소</button></div></div>`;
    $("#cmdSave").onclick=async()=>{
      try{
        const row=await post("/api/commands",{id:cmdDraft.id,shortcut:$("#cmdShortcut").value,description:$("#cmdDescription").value});
        cmdPut(row);cmdSelected=row.id;cmdDraft=null;cmdDrawList();cmdDrawMain();cmdRefreshComposers();toast("명령어를 저장했어요 ✓",1800);
      }catch(e){toast("저장하지 못했어요: "+e.message,4500)}
    };
    cmdDraft._base=cmdDraft._base||cmdSig(cmdDraft);
    $("#cmdCancel").onclick=async()=>{if(cmdDirty()&&!await askC("수정한 내용이 저장되지 않았어요. 버릴까요?"))return;cmdDraft=null;cmdDrawList();cmdDrawMain()};
    return;
  }
  const x=cmdItems.find(v=>v.id===cmdSelected);
  if(!x){el.innerHTML=`<div class="empty" style="padding-top:8vh"><b>댓글에 자주 쓰는 문구를 빠르게 넣어 보세요</b>단축어와 설명 문구를 저장한 뒤, 노트의 댓글 입력창에서 단축어 버튼을 누르면 설명이 댓글 초안에 추가됩니다.</div>`;return}
  el.innerHTML=`<div class="card tr-doc"><div class="tr-hd"><h2>${esc(x.shortcut)}</h2><button type="button" id="cmdEdit">편집</button><button type="button" id="cmdDelete">삭제</button></div>
    <div class="tr-sec"><h4>댓글에 넣을 설명 문구</h4><div class="cmd-description">${esc(x.description)}</div></div>
    <div class="meta" style="margin-top:12px">수정 ${esc((x.updated_at||"").replace("T"," ").slice(0,16))}</div></div>`;
  $("#cmdEdit").onclick=()=>{cmdDraft={...x};cmdDraft._base=cmdSig(cmdDraft);cmdDrawList();cmdDrawMain()};
  $("#cmdDelete").onclick=async()=>{
    if(!await askC(`‘${x.shortcut}’ 명령어를 삭제할까요?`))return;
    try{await api("/api/commands/"+x.id,{method:"DELETE"});cmdItems=cmdItems.filter(v=>v.id!==x.id);cmdSelected=null;cmdDrawList();cmdDrawMain();cmdRefreshComposers();toast("명령어를 삭제했어요",1800)}
    catch(e){toast("삭제하지 못했어요: "+e.message,4500)}
  };
}
