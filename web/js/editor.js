/* ---------- 코드/강조 표기 ( ```전체 코드``` , `일부 코드` ) ---------- */
function renderMd(src){
  const s=esc(src);
  const inline=t=>t.replace(/\n{3,}/g,"\n\n").replace(/`([^`\n]+)`/g,'<code class="ic">$1</code>');   // 빈 줄은 최대 한 줄 (예전에 저장된 겹빈줄도 깔끔하게)
  let out="",last=0,m;const re=/```(?:([A-Za-z0-9_+#.-]*)\n)?([\s\S]*?)```/g;
  while((m=re.exec(s))){
    out+=inline(s.slice(last,m.index));
    const code=m[2].replace(/\n$/,""),raw=unesc(code),lg=normLang(m[1])||detectLang(raw);      // 펜스의 언어 이름이 우선, 없으면 내용으로 추정
    out+=`<div class="cbw"><button class="cp" data-code="${code}">복사</button><span class="cblg" title="언어 (${lg==="text"?"색칠 없음":"자동 추정 또는 ``` 뒤에 적은 이름"})">${esc(langLabel(lg))}</span><pre class="cb"><code>${hlLines(raw,lg).map(l=>`<div class="ln">${l||" "}</div>`).join("")}</code></pre></div>`;
    last=re.lastIndex;
  }
  return out+inline(s.slice(last));
}
const pvClass=()=>`pv sz-${ui.fsz}${ui.wrap?"":" nowrap"}${ui.lnum?" lnum":""}`;
const langKeyOf=label=>(LANGS.find(x=>x[1]===label)||[""])[0];
function wireCp(root){
  root.querySelectorAll(".cp").forEach(b=>{
    b.onclick=()=>{copyText(b.dataset.code,"코드를 복사했어요");b.textContent="복사됨";setTimeout(()=>b.textContent="복사",1000)};
    if((b.dataset.code||"").trim()&&!b.closest(".qv-doc")&&!(b.parentElement.querySelector(".qvs"))){      // 모든 코드 상자에 보관함 저장
      const s=document.createElement("button");s.type="button";s.className="qvs";s.textContent="📚 보관함";s.title="보관함에 저장";
      s.onclick=()=>qvSaveFrom(b.dataset.code,b.parentElement.querySelector(".cblg")?langKeyOf(b.parentElement.querySelector(".cblg").textContent):"");b.after(s)}
  })}

/* ---------- 편집기: 코드 상자 자동 변환 ----------
   저장 형식은 그대로 ``` 와 ` 를 쓰는 글이고, 화면에서만 구분된 상자/코드 모양으로 바뀌어 보인다.
   - ``` (언어명 선택) + Enter  -> 구분된 코드 상자가 열린다
   - ```코드``` 를 통째로 붙여넣기 -> 코드 상자로 바뀐다
   - `글자` 를 입력/붙여넣기     -> 그 자리에서 코드 모양으로 바뀐다
   - 코드 상자 안: ``` 입력 또는 Ctrl+Enter/Esc = 상자 밖으로 나가기, Tab = 들여쓰기 */
const LANG="[A-Za-z0-9_+#.-]*";
const SOFT_BREAK="\uE002";
function parseSegs(s,open){
  const out=[];let last=0,m;const re=new RegExp("```(?:("+LANG+")\\n)?([\\s\\S]*?)```","g");
  while((m=re.exec(s))){
    let t=s.slice(last,m.index);if(last>0)t=t.replace(/^\n/,"");
    out.push({t:"x",s:t.replace(/\n$/,"")},{t:"c",s:m[2].replace(/\n$/,""),lang:m[1]||""});
    last=re.lastIndex;
  }
  let tail=s.slice(last);if(last>0)tail=tail.replace(/^\n/,"");
  if(open){   // 닫는 ``` 없이 여는 줄(```+Enter)만 있는 경우: 빈 코드 상자를 연다
    const o=new RegExp("(^|\\n)```("+LANG+")\\n").exec(tail);
    if(o){out.push({t:"x",s:tail.slice(0,o.index)},{t:"c",s:"",lang:o[2],focus:true},...parseSegs(tail.slice(o.index+o[0].length),false));return out}
  }
  out.push({t:"x",s:tail});
  return out;
}
function serText(el){   // 글 블록 -> 문자열 (인라인 코드는 ` ` 로 되돌린다)
  let s="";
  el.childNodes.forEach(n=>{
    if(n.nodeType===3)s+=n.data;
    else if(n.nodeName==="CODE")s+="`"+n.textContent+"`";
    else if(n.nodeName==="BR")s+=n.dataset.softBreak!==undefined?SOFT_BREAK:"\n";
    else if(n.nodeName==="DIV"){   // 편집기가 Enter 를 <div> 줄로 만든 경우: 줄 하나 = 줄바꿈 하나 (빈 줄 <div><br></div> 도 빈 줄 하나로)
      if(s&&!s.endsWith("\n"))s+="\n";
      if(n.childNodes.length===1&&n.firstChild.nodeName==="BR"){if(n.nextSibling)s+="\n"}
      else{s+=serText(n);if(n.nextSibling&&!s.endsWith("\n"))s+="\n"}
    }
    else s+=n.textContent;
  });
  return s.replace(/​/g,"");
}
function fillText(el,s){   // 문자열 -> 글 블록 (`글자` 는 코드 모양 요소로)
  el.textContent="";
  s.split(new RegExp("(`[^`\\n]+`|"+SOFT_BREAK+")")).forEach(p=>{
    if(/^`[^`\n]+`$/.test(p)){const c=document.createElement("code");c.className="ic";c.textContent=p.slice(1,-1);el.appendChild(c);el.appendChild(document.createTextNode("​"))}
    else if(p===SOFT_BREAK){const br=document.createElement("br");br.dataset.softBreak="";el.appendChild(br);el.appendChild(document.createTextNode("​"))}
    else if(p)el.appendChild(document.createTextNode(p));
  });
}
function caretAt(node,off){const r=document.createRange();r.setStart(node,off);r.collapse(true);const g=getSelection();g.removeAllRanges();g.addRange(r)}
function focusTb(tb,end){tb.focus();const r=document.createRange();r.selectNodeContents(tb);r.collapse(!end);const g=getSelection();g.removeAllRanges();g.addRange(r)}
function autoInline(tb){   // 닫는 ` 를 치는 순간 `글자` 를 코드 모양으로 바꾼다
  const g=getSelection();if(!g.rangeCount)return;const node=g.anchorNode;
  if(!node||node.nodeType!==3||!tb.contains(node)||(node.parentElement&&node.parentElement.closest("code")))return;
  const m=/`([^`\n]+)`/.exec(node.data);if(!m)return;
  const code=document.createElement("code");code.className="ic";code.textContent=m[1];
  const before=document.createTextNode(node.data.slice(0,m.index)),after=document.createTextNode("​"+node.data.slice(m.index+m[0].length));
  const p=node.parentNode;p.insertBefore(before,node);p.insertBefore(code,node);p.insertBefore(after,node);p.removeChild(node);
  caretAt(after,1);
}
function mkText(s){
  const d=document.createElement("div");d.className="tb";
  d.contentEditable="plaintext-only";if(d.contentEditable!=="plaintext-only")d.contentEditable="true";
  d.spellcheck=false;fillText(d,s);
  d.addEventListener("keydown",e=>{
    if(e.key==="`"&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&!e.isComposing&&wrapSel(d,e))return;
    if(e.key!=="`")d._bq=null;
    if(e.key!=="Enter"||e.isComposing)return;
    e.preventDefault();
    if(e.shiftKey){
      const g=getSelection();if(!g.rangeCount||!d.contains(g.anchorNode))return;
      const r=g.getRangeAt(0);r.deleteContents();
      const br=document.createElement("br");br.dataset.softBreak="";
      r.insertNode(br);
      const after=document.createTextNode("​");br.after(after);caretAt(after,1);
      d.dispatchEvent(new Event("input",{bubbles:true}));
      return;
    }
    const g=getSelection(),c=g.anchorNode&&g.anchorNode.parentElement&&g.anchorNode.parentElement.closest("code.ic");
    if(c){const nx=c.nextSibling;if(nx&&nx.nodeType===3)caretAt(nx,nx.data.startsWith("​")?1:0)}   // 코드 모양 밖으로 나온 뒤 줄바꿈
    document.execCommand("insertText",false,"\n");
  });
  d.addEventListener("paste",e=>{
    e.preventDefault();document.execCommand("insertText",false,(e.clipboardData||window.clipboardData).getData("text/plain"));
  });
  d.addEventListener("input",e=>{if(!e.isComposing)processText(d)});
  d.addEventListener("compositionend",()=>processText(d));
  return d;
}
/* 글자를 끌어서 고른 뒤 ` 를 누르면: 한 번 = 작은 코드(`글자`), 이어서 세 번째(```)까지 누르면 = 큰 코드 상자.
   여러 줄을 골랐으면 작은 코드가 될 수 없으니 바로 큰 코드 상자로 바꾼다. */
const BQ_S="\uE000",BQ_E="\uE001";
function wrapSel(tb,e){
  const g=getSelection();if(!g.rangeCount||g.isCollapsed)return false;
  const r=g.getRangeAt(0),root=tb.parentElement;if(!tb.contains(r.startContainer)||!tb.contains(r.endContainer))return false;
  const inCode=n=>(n.nodeType===3?n.parentElement:n).closest("code.ic"),cs=inCode(r.startContainer),ce=inCode(r.endContainer);
  e.preventDefault();
  if(cs&&cs===ce){      // 이미 작은 코드인 글자를 골라 ` 를 또 누름: 세 번째에서 큰 코드 상자로
    const q=tb._bq&&tb._bq.code===cs?tb._bq:(tb._bq={code:cs,n:1});
    if(++q.n<3)return true;
    tb._bq=null;cs.replaceWith(document.createTextNode(BQ_S+cs.textContent+BQ_E));
  }else{
    if(cs)r.setStartBefore(cs);if(ce)r.setEndAfter(ce);    // 코드 모양에 걸쳐 고르면 그 코드까지 통째로
    const en=r.cloneRange();en.collapse(false);en.insertNode(document.createTextNode(BQ_E));
    r.insertNode(document.createTextNode(BQ_S));
  }
  const s=serText(tb),i=s.indexOf(BQ_S),j=s.indexOf(BQ_E);
  const pre=s.slice(0,i),body=s.slice(i+1,j).replace(/`/g,""),post=s.slice(j+1);
  if(!body.trim()){fillText(tb,pre+body+post);return true}
  if(/\n/.test(body)||cs&&cs===ce){   // 큰 코드 상자: 위아래 줄을 나눠 ``` 로 감싼다
    tb._bq=null;const pre2=pre.replace(/[ \t]+$/,""),post2=post.replace(/^[ \t]+/,"");   // 줄 가운데서 바꾸면 상자 앞뒤에 남는 공백은 버린다
    convertBlock(tb,pre2+(pre2&&!pre2.endsWith("\n")?"\n":"")+"```\n"+body.replace(/^\n+|\n+$/g,"")+"\n```"+(post2&&!post2.startsWith("\n")?"\n":"")+post2);
  }else{                               // 작은 코드: 그 자리에서 코드 모양으로 바꾸고, 고른 상태는 그대로 둔다 (` 를 두 번 더 누르면 큰 상자)
    fillText(tb,pre+"`"+body+"`"+post);
    const code=tb.querySelectorAll("code.ic")[(pre.match(/`[^`\n]+`/g)||[]).length];
    if(code){g.removeAllRanges();const rr=document.createRange();rr.selectNodeContents(code);g.addRange(rr);tb._bq={code,n:1}}
  }
  root.dispatchEvent(new Event("input",{bubbles:true}));   // 저장(자동 저장 · 초안)이 바뀐 글을 알게 한다
  return true;
}
function processText(tb){
  if(!tb.isConnected||!tb.parentElement)return;      // 이미 코드 상자로 바뀌어 사라진 입력칸에 남은 이벤트는 무시
  const s=serText(tb);
  if(/```(?:[A-Za-z0-9_+#.-]*\n)?[\s\S]*?```/.test(s)||new RegExp("(^|\\n)```"+LANG+"\\n").test(s))return convertBlock(tb,s);
  autoInline(tb);
}
function convertBlock(tb,s){
  const root=tb.parentElement,segs=parseSegs(s,true);
  const els=segs.map(g=>g.t==="x"?mkText(g.s):mkCode(g.s,g.lang));
  els.forEach(e=>root.insertBefore(e,tb));tb.remove();
  fixStructure(root);applyFmt(root);
  const fi=segs.findIndex(g=>g.focus);
  if(fi>=0){els[fi].querySelector("textarea").focus();return}
  const lastCode=[...els].reverse().find(e=>e.classList.contains("cbk")),nx=lastCode&&lastCode.nextElementSibling;
  if(nx)focusTb(nx,false);
}
function fixStructure(root){
  const kids=[...root.children];
  for(let i=kids.length-1;i>0;i--){   // 이웃한 글 블록은 하나로 합친다
    if(kids[i].classList.contains("tb")&&kids[i-1].classList.contains("tb")){
      const a=serText(kids[i-1]),b=serText(kids[i]);fillText(kids[i-1],a&&b?a+"\n"+b:a+b);kids[i].remove();
    }
  }
  const k=[...root.children];
  if(!k.length||!k[0].classList.contains("tb"))root.prepend(mkText(""));
  [...root.children].forEach(el=>{if(el.classList.contains("cbk")&&!(el.nextElementSibling&&el.nextElementSibling.classList.contains("tb")))el.after(mkText(""))});
  const first=root.querySelector(".tb");if(first&&root.dataset.ph)first.dataset.ph=root.dataset.ph;
}
function exitBox(box){const nx=box.nextElementSibling;if(nx)focusTb(nx,false)}
function removeBox(box){
  const root=box.parentElement,prev=box.previousElementSibling;box.remove();fixStructure(root);
  focusTb(prev&&prev.isConnected?prev:root.querySelector(".tb"),true);
}
function mkCode(text,lang){
  const box=document.createElement("div");box.className="cbk";box.dataset.lang=lang||"";
  box.innerHTML=`<div class="cbh"><select class="cbl" title="언어 (색칠 · 정리 기준). 자동 = 코드 내용으로 추정">${LANGS.map(([v,l])=>`<option value="${v}">${l}</option>`).join("")}</select><span class="cbd"></span><span class="sp"></span><button type="button" class="mini" data-a="fmt" title="코드를 보기 좋게 정리해요 (미리보기에서 확인하고 적용)">✨ 정리</button><button type="button" class="mini" data-a="qsave" title="보관함에 저장해요">📚 보관함</button><button type="button" class="mini" data-a="copy">복사</button><button type="button" class="mini" data-a="unbox" title="코드 상자를 풀어 일반 글로 되돌립니다">일반 글로</button><button type="button" class="mini danger" data-a="del">삭제</button></div><div class="cbb"><pre class="gut"></pre><div class="cbw2"><pre class="hlo" aria-hidden="true"></pre><textarea class="cbt" spellcheck="false"></textarea></div></div>`;
  box.querySelector(".cbh .sp").style.flex="1";
  const ta=box.querySelector("textarea"),gut=box.querySelector(".gut"),hlo=box.querySelector(".hlo"),sel=box.querySelector(".cbl"),det=box.querySelector(".cbd");
  sel.value=normLang(box.dataset.lang);      // 목록에 없는 이름(예: ```xyz)은 '자동'으로 보이지만 글에는 그대로 남는다
  const eff=()=>normLang(box.dataset.lang)||detectLang(ta.value);
  let hlT=0;
  const paint=()=>{hlo.innerHTML=hlHtml(ta.value,eff())+"\n ";hlo.scrollLeft=ta.scrollLeft};
  const upd=()=>{
    const nw=!(ui.wrap&&!ui.lnum);
    ta.setAttribute("wrap",nw?"off":"soft");box.classList.toggle("nw",nw);   // 줄번호를 켜면 줄이 어긋나지 않게 줄바꿈을 끈다
    ta.style.height="auto";ta.style.height=(ta.scrollHeight+2)+"px";
    const qb=box.querySelector("[data-a=qsave]");if(qb)qb.hidden=!ta.value.trim();
    det.textContent=normLang(box.dataset.lang)||!ta.value.trim()?"":"· "+langLabel(eff());      // 자동일 때만, 내용이 있을 때만 추정한 언어를 보여 준다
    gut.textContent=Array.from({length:ta.value.split("\n").length},(_,i)=>i+1).join("\n");gut.style.height=ta.style.height;
    clearTimeout(hlT);hlT=setTimeout(paint,30);paint();
  };
  box._upd=upd;ta.value=text;
  ta.addEventListener("input",()=>{
    const v=ta.value,mm=new RegExp("^```"+LANG+"\\n([\\s\\S]*?)\\n?```\\s*$").exec(v);
    if(mm)ta.value=mm[1];                                         // 겉의 ``` 까지 통째로 붙여넣은 경우 벗겨낸다
    else if(/(^|\n)```[ \t]*$/.test(v)){ta.value=v.replace(/\n?```[ \t]*$/,"");upd();return exitBox(box)}   // ``` 를 치면 상자를 닫는다
    upd();
  });
  sel.addEventListener("change",()=>{box.dataset.lang=sel.value;upd();ta.dispatchEvent(new Event("input",{bubbles:true}))});
  ta.addEventListener("keydown",e=>{
    if(e.key==="Tab"){e.preventDefault();document.execCommand("insertText",false,"  ")}
    else if(e.key==="Escape"||(e.key==="Enter"&&(e.ctrlKey||e.metaKey))){e.preventDefault();exitBox(box)}
    else if(e.key==="Backspace"&&!ta.value&&!box.dataset.keep){e.preventDefault();removeBox(box)}
    else if(e.key==="ArrowDown"&&ta.selectionStart===ta.value.length&&box.nextElementSibling){e.preventDefault();focusTb(box.nextElementSibling,false)}
    else if(e.key==="ArrowUp"&&ta.selectionStart===0&&box.previousElementSibling){e.preventDefault();focusTb(box.previousElementSibling,true)}
  });
  ta.addEventListener("scroll",()=>{gut.scrollTop=ta.scrollTop;hlo.scrollLeft=ta.scrollLeft});
  box.querySelector(".cbh").addEventListener("click",e=>{
    const a=e.target.dataset&&e.target.dataset.a;if(!a)return;
    if(a==="qsave")qvSaveFrom(ta.value,eff());
    else if(a==="fmt"){(async()=>{
      const before=ta.value,r=await codeFmtDialog(before,eff());if(!r)return;
      ta.value=r.text;if(r.lang&&!normLang(box.dataset.lang)&&r.lang!==detectLang(before)){box.dataset.lang=r.lang;sel.value=r.lang}
      upd();ta.dispatchEvent(new Event("input",{bubbles:true}));
      toastUndo("코드를 정리했어요",()=>{ta.value=before;upd();ta.dispatchEvent(new Event("input",{bubbles:true}))},6000);
    })()}
    else if(a==="copy"){copyText(ta.value,"코드를 복사했어요");e.target.textContent="복사됨";setTimeout(()=>e.target.textContent="복사",1000)}
    else if(a==="del"){(async()=>{if(ta.value.trim().length>30&&!await askC("이 코드 상자를 삭제할까요?"))return;removeBox(box)})()}
    else if(a==="unbox"){const root=box.parentElement,t=mkText(ta.value);box.after(t);box.remove();fixStructure(root);focusTb(t.isConnected?t:root.querySelector(".tb"),true)}
  });
  setTimeout(upd,0);
  return box;
}
function applyFmt(root){
  root.classList.remove("sz-s","sz-m","sz-l");root.classList.add("sz-"+ui.fsz);root.classList.toggle("lnum",ui.lnum);
  root.querySelectorAll(".cbk").forEach(b=>b._upd&&b._upd());
}
function edInit(root,md){
  root.textContent="";
  parseSegs(md||"",false).forEach(g=>root.appendChild(g.t==="x"?mkText(g.s):mkCode(g.s,g.lang)));
  fixStructure(root);applyFmt(root);
}
function edGet(root){   // 편집기 -> 저장용 글 (``` 와 ` 로 되돌린다)
  return [...root.children].map(el=>el.classList.contains("cbk")
    ?"```"+(el.dataset.lang||"")+"\n"+el.querySelector("textarea").value.replace(/\n+$/,"")+"\n```":serText(el)).filter(s=>s!=="").join("\n");
}
function addCodeBox(root){
  const act=document.activeElement,after=act&&act.classList&&act.classList.contains("tb")&&root.contains(act)?act:root.lastElementChild;
  const box=mkCode("","");after.after(box);fixStructure(root);applyFmt(root);box.querySelector("textarea").focus();
}
/* 머리글은 <label> 이 아니라 <div>: label 은 안에 든 버튼을 같이 눌러 버려서(코드 상자가 저절로 추가됨) 쓰지 않는다 */
const field=(id,label,hint,ph,cls="")=>`<div class="card fld"><div class="fhd"><span>${label}</span> <small>${hint}</small><span class="sp"></span><button type="button" class="mini" data-addcode="${id}" title="코드 상자를 추가합니다 (백틱 3개 + Enter 로도 됩니다)">＋ 코드 상자</button></div><div class="rte ${cls}" id="${id}" data-ph="${esc(ph)}"></div>`;
/* 접기/펼치기: 내용이 없으면 기본으로 접어 두고, 내용이 있으면 펼쳐 두되 언제든 접고 펼 수 있다.
   사용자가 직접 접거나 편 상태는 이번 접속 동안 유지한다. */
const foldOpen=new Map();                                     // "일감번호:칸" -> 펼침 여부
const foldKey=(n,id)=>n.issue_id+":"+id;
const avatar=name=>{const t=(name||"?").replace(/\[[^\]]*\]/g,"").trim();return (t[0]||"?")};

/* 새 디자인: 원문 아래 '같은 주제' 구역. 이 노트의 드문 용어(simInfo)를 모두 가진 과거 일감 중 최근 3건을
   제목 · 상태 · 그때 남긴 기록 첫 줄(정리 기록 → 마지막 진행 기록 → 마지막 댓글)로 보여 주고, 누르면 그 노트를 연다. */
function simLine(x){
  const first=s=>(s||"").replace(/```[\s\S]*?```/g," ").split("\n").map(t=>t.trim()).find(Boolean)||"";
  const a=first(x.action);if(a)return "정리: "+a;
  const p=(x._pg||[])[0];if(p&&first(p.text))return "진행 기록: "+first(p.text);
  const j=[...(x.journals||[])].reverse().find(j=>first(j.notes));if(j)return "댓글: "+first(j.notes);
  return "";
}
function simBlock(n,sim){
  if(!sim.list.length)return "";
  const top=[...sim.list].sort((a,b)=>(b.updated_on||"").localeCompare(a.updated_on||"")).slice(0,3);
  const mon=x=>{const d=new Date(x.updated_on);return isNaN(d)?"":(d.getFullYear()===new Date().getFullYear()?`${d.getMonth()+1}월`:`${d.getFullYear()}.${d.getMonth()+1}`)};
  return `<div class="card v2sim" id="sec-sim">
    <div class="v2sim-h">${NAVICON.dict}<b>같은 주제</b>${sim.ts.map(t=>`<span class="chip" data-t="${t.id}">${esc(t.term)}</span>`).join("")}<span class="sp"></span>
      <button type="button" class="mini" data-sim="${n.issue_id}">전체 ${sim.list.length}건 이력에서 보기</button></div>
    ${top.map(x=>{const l=simLine(x);return `<a class="v2sim-r" data-open="${x.issue_id}"><span class="t">${esc(x.subject)}</span><span class="s s-${stOf(x)}">${stOf(x)} · ${mon(x)}</span>${l?`<span class="l">${esc(l)}</span>`:""}</a>`}).join("")}
  </div>`;
}
function renderCenter(){
  flushEdits();                       // 다른 노트/보기로 가기 전에, 저장하지 않은 변경이 있으면 먼저 자동 저장한다
  if(view!=="note")edNote=null;
  $("#center").classList.remove("todo-on");
  updFab();
  $("#center").dataset.ns=ui.noteStyle==="card"?"card":"doc";   // 노트 모양: 설정에서 고른 문서 스타일 / 기존(카드) 스타일
  $("#center").dataset.vw=view;   // 주의: data-view 는 위쪽 보기 탭 버튼이 쓰는 이름이라 겹치면 안 된다
  if(view!=="graph")stopSim();
  if(view==="graph")return renderGraph();
  if(view==="mine")return renderMine();
  if(view==="code")return renderCode();
  if(view==="memo")return renderMemo();
  if(view==="deploy")return renderDeploy();
  if(view==="trouble")return renderTrouble();
  if(view==="queries")return renderQueries();
  if(view==="commands")return renderCommands();
  if(view==="summary")return renderSummary();
  const n=all.find(x=>x.issue_id===cur);
  if(!n){edNote=null;$("#center").innerHTML=`<div class="empty" style="padding-top:12vh"><b>노트를 선택하세요</b>왼쪽 목록에서 일감을 누르면 레드마인 원문을 보고 처리·코드·이유를 기록할 수 있습니다.</div>`;return}
  const nb=neighbors(n.issue_id),s=stOf(n),sim=simInfo(n);
  $("#center").innerHTML=`
   <div class="notebox">
   ${jumpHtml(n,nb)}
   <div class="card ehead">
     <div class="itop">${catPill(n,true)}<a class="meta" href="${cfg.url}/issues/${n.issue_id}" target="_blank" title="레드마인에서 #${n.issue_id} 열기">레드마인 ↗</a><span class="cpno"><button type="button" class="mini" id="cpNo" title="‘#번호’ 로 복사해요 (▾ 로 제목 포함 · 번호만 · 링크)">📋 #${n.issue_id} 복사</button><button type="button" class="mini" id="cpNoM" title="다른 모양으로 복사">▾</button></span><span class="sp"></span><button type="button" class="mini" id="refone" title="이 일감을 레드마인에서 다시 읽어 옵니다 (레드마인에서 지운 댓글·바뀐 상태 반영)">↻ 새로 읽기</button>${starBtn(n)}</div>
     <h2>${title(n.subject)}</h2>
     <div class="chips" style="margin-top:0"><span class="badge s-${s}">${s}</span>${staleBadge(n)}${rolesOf(n).map(r=>`<span class="tag ${r}">${r}</span>`).join("")}</div>
     <div class="emeta">레드마인 상태 <b>${esc(n.rm_status)}</b> · ${esc(n.project)} · ${esc(n.tracker)} · 담당 ${esc(n.assignee)} · 작성 ${esc(n.author)} · ${n._d}</div>
     <div id="thumbwrap">${noteThumbs(n)}</div>
     <div class="ehr"></div>
     <div class="chips erow recbox" id="recbox"></div>
     ${terms.some(t=>has(n,t))?`<div class="chips erow"><span class="meta">관련 용어</span>${terms.filter(t=>has(n,t)).map(t=>`<span class="chip" data-t="${t.id}">${esc(t.term)}</span>`).join("")}</div>`:""}
     ${sim.list.length&&!V2()?`<div class="chips erow"><span class="meta">비슷한 과거</span><button type="button" class="sim" data-sim="${n.issue_id}" title="${esc(sim.ts.map(t=>t.term).join(" · "))} 를 가진 과거 일감">같은 주제 ${sim.list.length}건 보기 →</button></div>`:""}
     ${(()=>{   // 코드 대상: 내 기록에 쓴 이름을 먼저, 그다음 여러 일감에 나온 이름 순
       // 계층 순서(컨트롤러 → 서비스 → SQL → 테이블 → 화면)로 묶어 보여 준다. 컬럼은 내 기록에 쓴 것만.
       const tk=[...n._tok.entries()].filter(([k,ty])=>!COMMON_COLS.has(k)&&(ty!==T_COL||n._tokMine.has(k)))
         .sort((a,b)=>FLOW_ORDER.indexOf(a[1])-FLOW_ORDER.indexOf(b[1])||tokIdx.get(b[0]).notes.length-tokIdx.get(a[0]).notes.length).slice(0,18);
       return tk.length?`<div class="chips erow"><span class="meta">코드 대상</span>${tk.map(([k,ty])=>`<span class="chip tokchip" data-tok="${esc(k)}" title="${ty} · 이 이름이 나온 일감 ${tokIdx.get(k).notes.length}건의 이력 보기">${typePill(ty)}${esc(k)} ${relPill(n._rel.get(k)||"ref")} <small>${tokIdx.get(k).notes.length}</small></span>`).join("")}</div>`:"";
     })()}
   </div>
   ${origCard(n)}${V2()?simBlock(n,sim):""}${legacyReqCard(n)}
   <div class="card qrelcard" id="qvrel" style="display:none"></div>
   <div id="attwrap"></div>
   <div class="card" id="pgcard"><label>진행 기록 <small>같은 일감도 날짜마다 어디까지 했는지 따로 남깁니다 (저장 버튼과 별개로 바로 저장)</small></label>
     <div class="pgnew">
       <div class="frow" style="margin-top:0"><input type="date" id="pgday" style="flex:none;min-width:0"><button type="button" class="mini" id="pgtoday">오늘</button><button type="button" class="mini" id="pgyest">어제</button><span class="meta" id="pgrel"></span></div>
       <div class="rte" id="pgtext" data-ph="이 날 어디까지 했는지 적으세요 (예: 쿼리 작성 완료, 테스트 서버 반영 대기)"></div>
       <div class="row"><button type="button" class="primary" id="pgadd">기록 추가</button><span class="meta">코드는 백틱 3개 + Enter 로 코드 상자를 쓸 수 있습니다</span></div>
     </div>
     <div id="pglist"></div></div>
   ${nbCard(n)}
   ${cf(n,"cm","댓글 이력",`<small>레드마인 댓글 ${n.journals.length}건${(n.changes||[]).length?` · 변경 ${n.changes.length}건`:""}</small>`,cmSum(n),`<button type="button" class="mini" data-cmnew title="어디서든 바로 댓글을 쓰는 창을 엽니다 (C)">＋ 새 댓글 쓰기</button>`,
      `<div class="tl">${cmHist(n)}</div>`)}

   <div class="card" id="sec-write"><div class="fhd"><span>댓글 쓰기</span> <small>레드마인에 바로 올립니다</small></div>${composerHtml("b",n)}</div>
   </div>
   ${cf(n,"rel","연결된 일감",`<small>${nb.length}건</small>`,nb.length?"":"· 없음","",
      nb.map(x=>{const l=all.find(a=>a.issue_id===x.id);
        return l?`<a class="rel" data-open="${x.id}"><span class="k">${relLabel(x)}</span><span class="meta">#${x.id}</span><span>${esc(l.subject)}</span></a>`
               :skipped[x.id]?`<a class="rel missing" href="${cfg.url}/issues/${x.id}" target="_blank"><span class="k">${relLabel(x)}</span><span class="meta">#${x.id}</span><span class="meta">받을 수 없음 (${esc(skipped[x.id])})</span><span class="go">레드마인에서 열기 ↗</span></a>`
               :`<a class="rel missing" data-fetch="${x.id}"><span class="k">${relLabel(x)}</span><span class="meta">#${x.id}</span><span class="meta">아직 저장되지 않은 일감</span><span class="go">눌러서 가져오기</span></a>`}).join("")||`<span class="meta">연결된 일감이 없습니다.</span>`)}
   <div class="savebar"><button class="primary" id="save">저장</button><span class="meta" id="sv">✓ 저장된 상태 · Ctrl+S 로 저장 · 내 기록은 이 PC에만 저장됩니다</span></div>`;
  document.querySelectorAll("[data-open]").forEach(e=>e.onclick=()=>openNote(+e.dataset.open));
  document.querySelectorAll("[data-fetch]").forEach(e=>e.onclick=async()=>{
    const id=+e.dataset.fetch;toast(`#${id} 가져오는 중…`,0);
    try{const r=await post("/api/fetch",{ids:[id]});await loadAll();
      if(r.got.includes(id)){toast(`#${id} 저장했습니다`,2500);openNote(id)}
      else{toast(`#${id} 가져오지 못했습니다: ${(r.failed[0]||{}).reason||"알 수 없음"}`,7000);renderAll()}}
    catch(err){toast("오류: "+err.message,7000)}
  });
  document.querySelectorAll("#center .chip[data-t]").forEach(e=>e.onclick=()=>selectTerm(terms.find(t=>t.id==e.dataset.t)));
  document.querySelectorAll("#center .tokchip").forEach(e=>e.onclick=()=>openCode(e.dataset.tok));
  document.querySelectorAll("#center [data-sim]").forEach(b=>b.onclick=ev=>{ev.stopPropagation();openSimilar(all.find(x=>x.issue_id===+b.dataset.sim))});
  wireStars($("#center"));
  wireCpNo(n);
  updTodoFloat();renderNoteQueries(n);
  // 편집기는 내용 길이에 맞춰 자동으로 늘어난다 (직접 늘릴 필요 없음)
  const vals={ac:n.action,cc:n.code_change,rs:n.reason};
  ["ac","cc","rs"].forEach(id=>edInit($("#"+id),vals[id]));
  edNote=n;edBase=readEdits();edSavedAt=null;      // 편집기가 정리한 형태 그대로를 기준으로 삼아야 '바뀌었나' 판단이 정확하다
  wireNotes(n);
  document.querySelectorAll("[data-addcode]").forEach(b=>b.onclick=()=>addCodeBox($("#"+(b.dataset.addcode==="@tab"?ntabOf(n):b.dataset.addcode))));
  initPg(n);wireRec(n);
  $("#fsz").value=ui.fsz;$("#fwrap").checked=ui.wrap;$("#flnum").checked=ui.lnum;
  const refmt=()=>{ui.fsz=$("#fsz").value;ui.wrap=$("#fwrap").checked;ui.lnum=$("#flnum").checked;saveUI();["ac","cc","rs"].forEach(id=>applyFmt($("#"+id)))};
  $("#fsz").onchange=$("#fwrap").onchange=$("#flnum").onchange=refmt;
  if($("#reltip"))$("#reltip").style.display="none";
  $("#save").onclick=()=>saveNote();
  wireCf(n);wireJump(n);wireComposer($("#sec-write"),n);loadAtt(n);fillAttImgs();
  $("#refone").onclick=()=>refreshOne(n,true);autoRefresh(n);
  document.querySelectorAll("[data-cmnew]").forEach(b=>b.onclick=ev=>{ev.stopPropagation();toggleCm(true)});
  spy();
}
