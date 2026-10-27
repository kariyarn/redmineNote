/* ---------- 원문 꾸미기 (2.26): 레드마인 원문 위에 형광펜 · 밑줄 · 굵게 · 메모를 덧입힌다 ----------
   레드마인 원문(desc_raw)은 그대로 두고, 화면에 그린 뒤에만 <mark> 로 감싼다. 저장은 노트 DB 의 annotations 표.
   - 원문에서 글자를 끌어서 고르면 작은 도구 막대가 뜬다 (형광펜 4색 · 밑줄 · 굵게 · 메모)
   - 칠한 곳(또는 💬)을 누르면 색 바꾸기 · 밑줄 · 굵게 · 메모 고치기 · 지우기
   - 다시 찾을 때는 고른 글자 + 앞뒤 글자로 찾는다: 원문이 조금 바뀌어도 따라가고, 못 찾으면 지우지 않고 '위치를 잃은 표시'로 남긴다
   - 코드 상자 안은 칠하지 않는다 (글자 위치 계산에서 빼므로, 걸쳐 고르면 코드 바깥만 칠해진다) */
const ANN_COLORS=[["yellow","노랑"],["green","초록"],["blue","파랑"],["red","빨강"]];
const ANN_CTX=32;      // 앞뒤로 기억하는 글자 수
const annRoot=()=>document.querySelector("#sec-orig .j.orig");
const annSkip=t=>t.parentElement&&t.parentElement.closest(".cbw,.ann-m,button,select");
function annText(root){   // 칠할 수 있는 글자 한 줄 + 글자 조각(텍스트 노드)마다 시작 위치
  const nodes=[];let full="";
  const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:t=>annSkip(t)?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
  for(let t;(t=w.nextNode());){nodes.push({t,s:full.length});full+=t.data}
  return {full,nodes};
}
function annOff(map,node,off){   // 고른 범위의 끝점(노드, 위치) -> 글자 한 줄에서의 위치
  if(node.nodeType===3){const e=map.nodes.find(x=>x.t===node);if(e)return e.s+off}
  const r=document.createRange();r.setStart(node,off);r.collapse(true);
  for(const e of map.nodes)if(r.comparePoint(e.t,0)>=0)return e.s;
  return map.full.length;
}
function annFind(full,a){   // 저장한 표시를 지금 원문에서 찾기 -> [시작, 끝] (못 찾으면 null)
  const score=(i,j)=>{
    let p=0,s=0;const pf=a.prefix||"",sf=a.suffix||"";
    while(p<pf.length&&full[i-1-p]===pf[pf.length-1-p])p++;
    while(s<sf.length&&full[j+s]===sf[s])s++;
    return p+s-Math.min(20,Math.abs(i-(a.start||0))/50);      // 앞뒤가 많이 맞을수록, 예전 위치에 가까울수록
  };
  let best=null,bs=-Infinity;
  for(let i=full.indexOf(a.quote);i>=0;i=full.indexOf(a.quote,i+1)){const sc=score(i,i+a.quote.length);if(sc>bs){bs=sc;best=[i,i+a.quote.length]}}
  if(best)return best;
  const q=a.quote.trim();if(!q)return null;      // 띄어쓰기 · 줄바꿈만 바뀐 경우
  const re=new RegExp(escRe(q).replace(/\s+/g,"\\s+"),"g");
  for(let m;(m=re.exec(full));){const sc=score(m.index,m.index+m[0].length);if(sc>bs){bs=sc;best=[m.index,m.index+m[0].length]}if(!m[0].length)re.lastIndex++}
  return best;
}
const annCls=a=>`ann${a.color?" c-"+a.color:""}${a.under?" u":""}${a.bold?" b":""}${!a.color&&!a.under&&!a.bold?" m":""}`;
function annWrap(root,s,e,a){   // [s,e) 를 <mark> 로 감싼다 (여러 글자 조각에 걸치면 조각마다)
  const marks=[];
  for(const {t,s:ts} of annText(root).nodes){
    const te=ts+t.data.length;if(te<=s||ts>=e)continue;
    const a0=Math.max(s,ts)-ts,a1=Math.min(e,te)-ts;if(a1<=a0)continue;
    if(/^(TABLE|TBODY|THEAD|TR)$/.test(t.parentNode.nodeName))continue;      // 표의 칸 사이 빈칸은 감쌀 수 없다
    let node=t;if(a1<node.data.length)node.splitText(a1);if(a0>0)node=node.splitText(a0);
    const m=document.createElement("mark");m.className=annCls(a);m.dataset.ann=a.id;
    if(a.memo)m.title=a.memo;
    node.replaceWith(m);m.appendChild(node);marks.push(m);
  }
  return marks;
}
function annClear(root){
  root.querySelectorAll(".ann-m").forEach(x=>x.remove());
  root.querySelectorAll("mark.ann").forEach(m=>m.replaceWith(...m.childNodes));
  root.normalize();
}
function annPaint(n){
  const root=annRoot();if(!root||!n||cur!==n.issue_id)return;
  annClear(root);
  const list=[...(annBy.get(n.issue_id)||[])].sort((a,b)=>(a.start||0)-(b.start||0)||a.id-b.id),lost=[];
  if(!ui.annHide)list.forEach(a=>{
    const r=annFind(annText(root).full,a),marks=r?annWrap(root,r[0],r[1],a):[];
    if(!marks.length){lost.push(a);return}
    if(a.memo){const sup=document.createElement("sup");sup.className="ann-m";sup.dataset.ann=a.id;sup.title=a.memo;sup.textContent="💬";marks[marks.length-1].after(sup)}
  });
  const hd=document.querySelector("#sec-orig .cfhd");
  if(hd){
    let x=hd.querySelector(".ann-hd");if(!x){x=document.createElement("span");x.className="ann-hd";hd.appendChild(x)}
    x.innerHTML=list.length?`<span class="meta" title="원문에 내가 덧입힌 표시 (레드마인 원문은 그대로예요)">🖍 ${list.length}</span><button type="button" class="mini" data-annhide>${ui.annHide?"표시 보이기":"표시 숨기기"}</button>`:"";
    const b=x.querySelector("[data-annhide]");if(b)b.onclick=e=>{e.stopPropagation();ui.annHide=!ui.annHide;saveUI();annPaint(n)};
  }
  let box=document.getElementById("annLost");
  if(!lost.length||ui.annHide){if(box)box.remove();return}
  if(!box){box=document.createElement("div");box.id="annLost";box.className="ann-lost";root.after(box)}
  box.innerHTML=`<div class="meta">원문이 바뀌어 <b>위치를 잃은 표시 ${lost.length}개</b> — 지우기 전까지 메모는 남아 있어요</div>${lost.map(a=>`<div class="ann-lr"><mark class="${annCls(a)}">${esc(a.quote.length>60?a.quote.slice(0,60)+"…":a.quote)}</mark>${a.memo?`<span class="ann-lm">💬 ${esc(a.memo)}</span>`:""}<span class="sp"></span><button type="button" class="mini" data-annlost="${a.id}">지우기</button></div>`).join("")}`;
  box.querySelectorAll("[data-annlost]").forEach(b=>b.onclick=()=>annDel(n,+b.dataset.annlost));
}
/* ---- 저장 ---- */
async function annSave(n,a){
  try{
    const r=await post("/api/annot",{...a,issue_id:n.issue_id});
    const L=annBy.get(n.issue_id)||[];annBy.set(n.issue_id,L);
    const i=L.findIndex(x=>x.id===r.id);if(i>=0)L[i]=r;else L.push(r);
    prep(n);annPaint(n);return r;
  }catch(e){toast("표시를 저장하지 못했어요: "+e.message,5000)}
}
async function annDel(n,id,undo=true){
  const L=annBy.get(n.issue_id)||[],a=L.find(x=>x.id===id);if(!a)return;
  try{await api("/api/annot/"+id,{method:"DELETE"})}catch(e){toast("지우지 못했어요: "+e.message,5000);return}
  annBy.set(n.issue_id,L.filter(x=>x.id!==id));prep(n);annPaint(n);
  if(undo)toastUndo("표시를 지웠어요",()=>annSave(n,{...a,id:null}),6000);
}
async function annMemoAsk(init){
  const v=await wdlg({title:init?"메모 고치기":"메모 달기",ok:"저장",body:`<textarea id="annMemoIn" rows="4" style="width:100%" placeholder="이 부분에 대한 내 메모 (원문에는 올라가지 않아요)">${esc(init||"")}</textarea>`,collect:()=>$("#annMemoIn").value});
  return v===false||v==null?null:v.trim();
}
/* ---- 고르면 뜨는 도구 막대 ---- */
const annBtns=(on={})=>`${ANN_COLORS.map(([k,l])=>`<button type="button" class="ann-dot ${on.color===k?"on":""}" data-annact="c-${k}" title="형광펜 · ${l}"><i class="c-${k}"></i></button>`).join("")}<span class="ann-sep"></span><button type="button" data-annact="u" class="${on.under?"on":""}" title="밑줄"><u>U</u></button><button type="button" data-annact="b" class="${on.bold?"on":""}" title="굵게"><b>B</b></button><button type="button" data-annact="memo" class="${on.memo?"on":""}" title="메모">💬</button>`;
function annBox(id){let b=document.getElementById(id);if(!b){b=document.createElement("div");b.id=id;b.className="ann-tb";document.body.appendChild(b);b.addEventListener("mousedown",e=>e.preventDefault())}return b}   // 누를 때 고른 글자가 풀리지 않게
function annShowAt(box,rect){
  box.style.display="flex";const w=box.offsetWidth,h=box.offsetHeight;
  let x=rect.left+rect.width/2-w/2,y=rect.top-h-8;if(y<8)y=rect.bottom+8;
  box.style.left=Math.max(8,Math.min(innerWidth-w-8,x))+"px";box.style.top=y+"px";
}
function annHide(){["annTb","annPop"].forEach(id=>{const b=document.getElementById(id);if(b)b.style.display="none"})}
function annSel(){   // 지금 고른 글자가 원문 안이면 {s,e,quote,...}
  const g=getSelection(),root=annRoot();if(!root||!g.rangeCount||g.isCollapsed)return null;
  const r=g.getRangeAt(0);if(!root.contains(r.commonAncestorContainer))return null;
  const map=annText(root);let s=annOff(map,r.startContainer,r.startOffset),e=annOff(map,r.endContainer,r.endOffset);
  while(s<e&&/\s/.test(map.full[s]))s++;while(e>s&&/\s/.test(map.full[e-1]))e--;      // 앞뒤 빈칸은 빼고
  if(e<=s)return null;
  return {quote:map.full.slice(s,e),prefix:map.full.slice(Math.max(0,s-ANN_CTX),s),suffix:map.full.slice(e,e+ANN_CTX),start:s,rect:r.getBoundingClientRect()};
}
document.addEventListener("mouseup",e=>{
  if(e.target.closest&&e.target.closest(".ann-tb"))return;
  setTimeout(()=>{
    const sel=annSel();const tb=annBox("annTb");
    if(!sel){tb.style.display="none";return}
    const p=document.getElementById("annPop");if(p)p.style.display="none";
    tb.innerHTML=annBtns();annShowAt(tb,sel.rect);
    tb.querySelectorAll("[data-annact]").forEach(b=>b.onclick=async()=>{
      const n=curNote(),s=annSel()||sel;if(!n)return;
      const act=b.dataset.annact,a={id:null,quote:s.quote,prefix:s.prefix,suffix:s.suffix,start:s.start,color:"",under:0,bold:0,memo:""};
      if(act.startsWith("c-"))a.color=act.slice(2);else if(act==="u")a.under=1;else if(act==="b")a.bold=1;
      tb.style.display="none";
      if(act==="memo"){const m=await annMemoAsk("");if(!m)return;a.memo=m}
      getSelection().removeAllRanges();if(ui.annHide){ui.annHide=false;saveUI()}
      await annSave(n,a);
    });
  },0);
});
/* ---- 칠한 곳을 누르면: 바꾸기 · 지우기 ---- */
document.addEventListener("click",e=>{
  const m=e.target.closest&&e.target.closest("#sec-orig mark.ann[data-ann],#sec-orig .ann-m");
  const pop=document.getElementById("annPop");
  if(!m){if(pop&&!e.target.closest("#annPop"))pop.style.display="none";return}
  if(!getSelection().isCollapsed)return;      // 끌어서 고르는 중이면 도구 막대가 우선
  const n=curNote(),a=n&&(annBy.get(n.issue_id)||[]).find(x=>x.id===+m.dataset.ann);if(!a)return;
  const box=annBox("annPop"),tb=document.getElementById("annTb");if(tb)tb.style.display="none";
  box.innerHTML=`${a.memo?`<div class="ann-pm">💬 ${esc(a.memo)}</div>`:""}<div class="ann-row">${annBtns(a)}<span class="ann-sep"></span><button type="button" data-annact="del" title="이 표시 지우기 (바로 되돌릴 수 있어요)">🗑</button></div>`;
  annShowAt(box,m.getBoundingClientRect());
  box.querySelectorAll("[data-annact]").forEach(b=>b.onclick=async()=>{
    const act=b.dataset.annact,x={...a};box.style.display="none";
    if(act==="del")return annDel(n,a.id);
    if(act.startsWith("c-"))x.color=x.color===act.slice(2)?"":act.slice(2);      // 같은 색을 또 누르면 형광펜만 뺀다
    else if(act==="u")x.under=x.under?0:1;else if(act==="b")x.bold=x.bold?0:1;
    else if(act==="memo"){const v=await annMemoAsk(a.memo);if(v==null)return;x.memo=v}
    if(!x.color&&!x.under&&!x.bold&&!x.memo)return annDel(n,a.id);      // 아무 표시도 안 남으면 지운다
    annSave(n,x);
  });
});
document.addEventListener("keydown",e=>{if(e.key==="Escape")annHide()});
document.addEventListener("scroll",annHide,true);
