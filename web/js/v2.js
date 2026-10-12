/* ---------- 새 디자인(v2) 전용: 버튼 · 제목의 이모지를 선 아이콘으로 ----------
   기존 디자인은 건드리지 않는다. 새 디자인일 때만, 화면에 그려진 '틀'(버튼 · 제목 · 칩) 속 이모지를
   같은 모양의 선 아이콘으로 바꿔 끼운다. 사용자가 쓴 글(편집기 · 코드 · 메모 본문 · 원문)은 그대로 둔다.
   기존 디자인으로 돌아가면 원래 이모지로 되돌린다(eiRestore). */
const EI_PATH={
  "📌":'<path d="M9 3h6l-1 6 3 3H7l3-3z"/><path d="M12 12v9"/>',
  "📚":'<path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M8 7h7"/>',
  "🔔":'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  "🔕":'<path d="M6 8a6 6 0 0 1 9.5-4.9M18 8c0 7 3 9 3 9H7"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0M3 3l18 18"/>',
  "🚀":'<path d="M5 19l4-1 9-9a2.5 2.5 0 0 0-3.5-3.5l-9 9z"/><path d="M13 7l4 4"/>',
  "☑":'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>',
  "📋":'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  "✨":'<path d="M12 3l1.8 4.7L18 9.5l-4.2 1.8L12 16l-1.8-4.7L6 9.5l4.2-1.8z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  "📅":'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  "✎":'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  "💬":'<path d="M5 5h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H10l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>',
  "📄":'<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h4"/>',
  "⏳":'<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9"/>',
  "🎨":'<path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-1.2-1-1.5-1-2.5s.8-1.5 2-1.5H17a4 4 0 0 0 4-4c0-4.7-4-8.5-9-8.5z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  "📝":'<path d="M5 4h10l4 4v12H5z"/><path d="M9 12h6M9 16h4"/>',
  "🕘":'<circle cx="12" cy="12" r="9"/><path d="M12 7v5H8"/>',
  "🔗":'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  "🛠":'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.6-.6-2.6z"/>',
  "📎":'<path d="M20 11.5l-8.3 8.3a5 5 0 0 1-7-7L13 4.5a3.3 3.3 0 0 1 4.7 4.7l-8.3 8.3a1.7 1.7 0 0 1-2.3-2.3L14.8 7.5"/>',
  "🗂":'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  "🙈":'<path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3 3.4M6.6 6.6C3.9 8.3 2 12 2 12s4 6 10 6a9.6 9.6 0 0 0 4.4-1.1"/>',
};
EI_PATH["🛠️"]=EI_PATH["🛠"];EI_PATH["🗂️"]=EI_PATH["🗂"];EI_PATH["☑️"]=EI_PATH["☑"];
const EI_RE=new RegExp("("+Object.keys(EI_PATH).sort((a,b)=>b.length-a.length).join("|")+")️?","gu");
const EI_SVG=e=>`<svg class="ei" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${EI_PATH[e]}</svg>`;
/* 바꿔도 되는 곳(틀) / 절대 바꾸면 안 되는 곳(사용자 글) */
const EI_OK="button,h1,h2,h3,h4,summary,label,.nvb,.chip,.tg,.badge,.ji,.cfh,.memo-h,.popmenu,.toast,#toast,.seg,.stale,.alarm-badge,.dpic";
const EI_NO=".dpdot,[contenteditable],textarea,input,select,pre,code,.rte,.cm-body,.memo-t,.memo-b,.jbody,.ndesc,.orig,.pgtext,.trb,.qcode";
function eiSwap(root){
  if(!V2())return;
  const w=document.createTreeWalker(root||document.body,NodeFilter.SHOW_TEXT,{acceptNode:t=>{
    if(!EI_RE.test(t.data)){EI_RE.lastIndex=0;return NodeFilter.FILTER_REJECT}EI_RE.lastIndex=0;
    const p=t.parentElement;if(!p||p.closest(".ei-w")||p.closest(EI_NO)||!p.closest(EI_OK))return NodeFilter.FILTER_REJECT;
    return NodeFilter.FILTER_ACCEPT}});
  const list=[];while(w.nextNode())list.push(w.currentNode);
  list.forEach(t=>{
    const frag=document.createDocumentFragment();let last=0;const s=t.data;
    s.replace(EI_RE,(m,e,i)=>{
      if(i>last)frag.appendChild(document.createTextNode(s.slice(last,i)));
      const sp=document.createElement("span");sp.className="ei-w";sp.dataset.e=m;sp.innerHTML=EI_SVG(e);frag.appendChild(sp);
      last=i+m.length;return m});
    if(last<s.length)frag.appendChild(document.createTextNode(s.slice(last)));
    t.replaceWith(frag);
  });
}
function eiRestore(){document.querySelectorAll(".ei-w").forEach(sp=>sp.replaceWith(document.createTextNode(sp.dataset.e||"")))}
let eiQ=false;
new MutationObserver(()=>{if(!V2()||eiQ)return;eiQ=true;setTimeout(()=>{eiQ=false;eiSwap()},0)})
  .observe(document.body,{childList:true,subtree:true});     // 화면은 innerHTML 로 다시 그리므로 childList 만 보면 된다 (글자 입력마다 돌지 않게)
