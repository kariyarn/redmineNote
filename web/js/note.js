/* ---------- 일감 1건 새로 읽기: 노트를 열 때(1분에 한 번) 자동으로, '↻ 새로 읽기'로 수동으로 ----------
   날짜 기준 가져오기는 '수정된 일감'만 다시 받으므로, 레드마인에서 댓글만 지운 경우를 놓친다. 그래서 열 때 그 일감만 한 번 더 읽는다(읽기 전용). */
const lastRef=new Map();
async function refreshOne(n,manual){
  const id=n.issue_id;lastRef.set(id,Date.now());
  try{
    const r=await post("/api/rm/refresh",{issue_id:id}),tgt=all.find(x=>x.issue_id===id);if(!tgt||!r.note)return;
    const f=x=>JSON.stringify([x.rm_status,x.assignee,x.updated_on,(x.journals||[]).map(j=>[j.id,j.notes]),(x.changes||[]).length,x.desc_raw||"",x.author_id||0]);
    const changed=f(tgt)!==f(r.note);
    if(changed){["subject","project","tracker","rm_status","author","assignee","updated_on","description","journals","roles","desc_raw","changes","author_id"].forEach(k=>{tgt[k]=r.note[k]});prep(tgt);buildTokens()}
    if(manual)toast(changed?"레드마인의 최신 내용으로 갱신했어요 ✓":"이미 최신이에요 ✓",2500);
    if(changed&&view==="note"&&cur===id){if(isTyping()&&!manual){toast("레드마인에서 바뀐 내용이 있어요. 입력을 마친 뒤 '↻ 새로 읽기'를 눌러 주세요",5000);return}
      const c=$("#center"),y=c.scrollTop;renderAll();c.scrollTop=y;if(cmOpen)cmPanelRender()}
  }catch(e){if(manual)toast("새로 읽지 못했어요: "+e.message,5000)}
}
function autoRefresh(n){if(Date.now()-(lastRef.get(n.issue_id)||0)>60000)refreshOne(n,false)}
/* ---------- 첨부파일: 본문 첨부 + 댓글 첨부를 보여 주고 내려받기 (읽기 전용) ---------- */
const attCache=new Map();
async function loadAtt(n){
  const id=n.issue_id,box=$("#attwrap");if(!box)return;
  let list=attCache.get(id+"|"+n.updated_on);
  if(!list){try{list=await api("/api/rm/attachments?issue_id="+id)}catch(e){return}attCache.set(id+"|"+n.updated_on,list)}
  const b2=$("#attwrap");if(!b2||cur!==id||view!=="note")return;
  if(!list.length){b2.innerHTML="";return}
  const src=a=>`/api/rm/attachment?id=${a.id}&name=${encodeURIComponent(a.filename)}`;
  const meta=a=>`${kb(a.filesize)} · ${esc(a.author)} · ${esc(lDay(a.created_on))} · ${a.source==="comment"?`댓글 (${esc(a.comment_by)} ${esc(lDay(a.comment_at).slice(5))})`:"본문"}`;
  b2.innerHTML=`<div class="card attcard"><div class="fhd"><span>첨부파일</span><small>${list.length}개 · 사진은 눌러서 크게 · 다른 파일은 눌러서 내려받기</small></div>
    ${list.map(a=>isImgAtt(a)
      ?`<div class="attrow img" title="${esc(a.description||a.filename)}"><img class="rimg athumb" loading="lazy" src="${src(a)}" data-full="${src(a)}" alt="${esc(a.filename)}" title="누르면 크게 봐요 (확대·축소 가능)"><div class="ab"><span class="an">${esc(a.filename)}</span><span class="am">${meta(a)}</span></div><a class="dl" href="${src(a)}" download="${esc(a.filename)}">⬇ 저장</a></div>`
      :`<a class="attrow" href="${src(a)}" download="${esc(a.filename)}" title="${esc(a.description||a.filename)}"><span class="ai">📎</span><span class="an">${esc(a.filename)}</span><span class="am">${meta(a)}</span><span class="dl">⬇ 다운로드</span></a>`).join("")}</div>`;
  setTimeout(()=>{fillAttImgs();fillAttPlaces();updThumbs(list)},0);
}
const isImgAtt=a=>/^image\//i.test(a.content_type||"")||/\.(png|jpe?g|gif|bmp|webp)$/i.test(a.filename||"");
/* 첨부로만 올린 사진도 원문처럼 그 자리에 바로 보여 준다: 쓴 댓글 아래 / 본문(원문) 아래. 글 속에 !파일.png! 로 이미 끼워져 있으면 또 보여 주지 않는다. */
function fillAttPlaces(){
  const list=curAtts().filter(isImgAtt);if(!list.length)return;
  [document.querySelector("#center"),document.querySelector("#cmphist")].forEach(root=>{
    if(!root)return;
    list.forEach(a=>{
      const enc=encodeURIComponent(a.filename);
      if(root.querySelector(`img.rimg[data-att="${CSS.escape(enc)}"]`)||root.querySelector(`img[data-aid="${a.id}"]`))return;
      const ph=root.querySelector(`.cmimgs[data-attj="${a.journal_id||0}"]`)||(a.journal_id?null:root.querySelector('.cmimgs[data-attj="0"]'));
      if(!ph)return;
      const u=`/api/rm/attachment?id=${a.id}&name=${encodeURIComponent(a.filename)}`;
      ph.insertAdjacentHTML("beforeend",`<figure class="attfig"><img class="rimg" loading="lazy" src="${u}" data-full="${u}" data-aid="${a.id}" alt="${esc(a.filename)}" title="누르면 크게 봐요 (확대·축소 가능)"><figcaption>${esc(a.filename)}</figcaption></figure>`);
    });
  });
}
function updThumbs(list){   // 노트 위 사진 줄에도 첨부 사진을 함께 보여 준다
  const n=curNote(),w=$("#thumbwrap");if(!n||!w)return;
  w.innerHTML=noteThumbs(n,(list||[]).filter(isImgAtt).map(a=>`/api/rm/attachment?id=${a.id}&name=${encodeURIComponent(a.filename)}`));
}
/* ---------- 정리 기록: 처리 내용 · 수정한 코드/방법 · 수정 이유 (탭 3개, 저장 데이터는 그대로) ---------- */
const ntabSel=new Map(),NT=[["ac","처리 내용"],["cc","수정한 코드/방법"],["rs","수정 이유"]];
const ntabOf=n=>ntabSel.get(n.issue_id)||(["ac","cc","rs"].find(k=>(n[{ac:"action",cc:"code_change",rs:"reason"}[k]]||"").trim())||"ac");
function nbCard(n){
  const has=k=>!!(n[{ac:"action",cc:"code_change",rs:"reason"}[k]]||"").trim(),any=["ac","cc","rs"].some(has),sel=ntabOf(n);
  const key=foldKey(n,"notes"),open=foldOpen.has(key)?foldOpen.get(key):any;
  const PH={ac:"어떻게 처리했는지 적으세요",cc:"코드를 붙여넣거나 &#96;&#96;&#96; 를 입력하고 Enter 를 누르세요",rs:"왜 이렇게 고쳤는지 적으세요"};
  return `<div class="card cfold ${open?"":"collapsed"}" id="sec-notes" data-cf="notes"><div class="cfhd" role="button" tabindex="0" aria-expanded="${open}" title="눌러서 접기/펼치기"><span class="chev">▸</span><span>정리 기록</span> <small>일이 끝난 뒤 정리 · 날짜별 메모는 위의 진행 기록</small><span class="cfsum"></span><span class="sp"></span><button type="button" class="mini" data-addcode="@tab" title="지금 보는 칸에 코드 상자를 추가합니다">＋ 코드 상자</button></div>
    <div class="cfbody"><div class="ntabs"><div class="seg">${NT.map(([k,l])=>`<button type="button" data-ntab="${k}" class="${k===sel?"on":""}">${l}<i class="ntd" ${has(k)?"":"hidden"}>●</i></button>`).join("")}</div></div>
      <div class="ntpane" data-npane="ac" ${sel==="ac"?"":"hidden"}><div class="rte" id="ac" data-ph="${PH.ac}"></div></div>
      <div class="ntpane" data-npane="cc" ${sel==="cc"?"":"hidden"}><div class="rte code" id="cc" data-ph="${PH.cc}"></div>
        <div class="fmtbar"><b>표기 형식</b>
          <select id="fsz"><option value="s">글자 작게</option><option value="m">글자 보통</option><option value="l">글자 크게</option></select>
          <label><input type="checkbox" id="fwrap"> 줄바꿈</label><label title="줄번호를 켜면 줄이 어긋나지 않도록 줄바꿈이 꺼집니다"><input type="checkbox" id="flnum"> 줄번호</label><span>(코드 상자에 적용)</span></div></div>
      <div class="ntpane" data-npane="rs" ${sel==="rs"?"":"hidden"}><div class="rte" id="rs" data-ph="${PH.rs}"></div></div>
    </div></div>`;
}
function updNotes(){   // 내용이 있는 탭에 ● 표시, 접힌 머리글에 한 줄 요약
  const card=$("#sec-notes");if(!card)return;
  const filled=NT.filter(([k])=>edGet($("#"+k)).trim());
  card.querySelectorAll("[data-ntab]").forEach(b=>{b.querySelector(".ntd").hidden=!filled.some(([k])=>k===b.dataset.ntab)});
  const sum=card.querySelector(".cfsum");
  sum.textContent=card.classList.contains("collapsed")?(filled.length?"· "+filled.map(([,l])=>l).join(" · "):"· 비어 있음"):"";
}
function showNtab(n,k){
  ntabSel.set(n.issue_id,k);
  document.querySelectorAll("#sec-notes [data-ntab]").forEach(b=>b.classList.toggle("on",b.dataset.ntab===k));
  document.querySelectorAll("#sec-notes [data-npane]").forEach(p=>{p.hidden=p.dataset.npane!==k});
  applyFmt($("#"+k));                                                // 숨겨져 있던 코드 상자의 높이를 다시 계산한다
}
function wireNotes(n){
  const card=$("#sec-notes");if(!card)return;
  card.querySelectorAll("[data-ntab]").forEach(b=>b.onclick=()=>showNtab(n,b.dataset.ntab));
  card.addEventListener("input",updNotes);
  card.querySelector(".cfhd").addEventListener("click",()=>setTimeout(updNotes,0));
  updNotes();
}
/* ---------- 2.1 : 일감 안에서 이동 · 접는 카드 ---------- */
const JUMPS=[["orig","원문","📄"],["notes","정리 기록","🗂"],["cm","댓글 이력","💬"],["rel","연결된 일감 ↓","🔗"]];   // 할 일 · 진행 기록은 노트 옆 칸에 있어서 이동 바에 두지 않는다 (2.27)
const jumpEl=k=>({notes:()=>$("#sec-notes"),
  cm:()=>$("#sec-cm"),rel:()=>$("#sec-rel"),orig:()=>$("#sec-orig")}[k]||(()=>null))();
function jumpHtml(n,nb){
  const c={cm:n.journals.length,rel:nb.length};
  return `<div id="jumpbar" role="navigation" aria-label="이 일감 안에서 이동">${peeking()?`<button type="button" id="jback" class="jback" title="${NAVLABEL[nav]} 화면으로 돌아가요 (Alt+←)">← 돌아가기 · ${NAVLABEL[nav]}</button>`:""}${JUMPS.map(([k,l,ic],i)=>`<button type="button" data-jump="${k}" title="${l} 로 이동 (Alt+${i+1})"><span class="ji">${ic}</span>${l}${c[k]?`<i>${c[k]}</i>`:""}</button>`).join("")}<span class="sp"></span><button type="button" id="jtop" title="맨 위로">↑</button></div>`;
}
function jumpTo(n,k){
  const el=jumpEl(k);if(!el)return;
  if(el.classList.contains("collapsed")&&el.dataset.cf)setCf(n,el,true)   // 접혀 있으면 펼친 뒤 이동
  if(k==="orig")el.open=true;
  jumpLock={k,t:Date.now()};                      // 맨 아래라 더 못 올라가는 칸도, 방금 누른 칸을 강조한다
  el.scrollIntoView({behavior:"smooth",block:"start"});
  setTimeout(spy,400);setTimeout(spy,1600);
}
function wireJump(n){
  document.querySelectorAll("#jumpbar [data-jump]").forEach(b=>b.onclick=()=>jumpTo(n,b.dataset.jump));
  $("#jtop").onclick=()=>$("#center").scrollTo({top:0,behavior:"smooth"});
  if($("#jback"))$("#jback").onclick=closePeek;
}
function composerVisible(){
  const w=$("#sec-write"),c=$("#center");if(!w||view!=="note")return false;
  const r=w.getBoundingClientRect(),cr=c.getBoundingClientRect();return r.top<cr.bottom-70&&r.bottom>cr.top;
}
function spy(){   // 지금 보고 있는 위치에 맞춰 이동 바 강조
  const c=$("#center"),jb=$("#jumpbar");if(!jb||view!=="note")return;
  const fab=$("#cmfab");if(fab&&curNote()){const d=composerVisible()&&!cmOpen?"none":"block";if(fab.style.display!==d){fab.style.display=d;placeCm()}}     // 💬 가 숨거나 나타나면 ↑ · ☑ 자리도 다시 (안 하면 ↑ 와 겹친다)
  if(cmOpen&&composerVisible())toggleCm(false);   // 스크롤해서 아래 댓글 쓰기 칸에 오면 팝업은 자동으로 닫는다 (초안은 두 곳이 같이 씀)
  const top=c.getBoundingClientRect().top+jb.offsetHeight+40;let on=JUMPS[0][0];
  for(const [k] of JUMPS){const el=jumpEl(k);if(el&&el.getBoundingClientRect().top<=top)on=k}
  if(jumpLock&&Date.now()-jumpLock.t<1500)on=jumpLock.k;
  jb.querySelectorAll("[data-jump]").forEach(b=>b.classList.toggle("on",b.dataset.jump===on));
}
let spyT=0,jumpLock=null;$("#center").addEventListener("scroll",()=>{if(!spyT)spyT=setTimeout(()=>{spyT=0;spy()},60)},{passive:true});
document.addEventListener("keydown",e=>{
  if(!e.altKey||e.ctrlKey||e.metaKey||view!=="note"||!/^Digit\d$/.test(e.code||"")||!JUMPS[+e.code.slice(5)-1])return;
  const n=all.find(x=>x.issue_id===cur);if(!n||!$("#jumpbar")||$("#modal").classList.contains("show"))return;
  e.preventDefault();jumpTo(n,JUMPS[+e.code.slice(5)-1][0]);
});
/* 접고 펼 수 있는 카드 (댓글 이력 · 연결된 일감). 기본은 접힘. .fold 와는 별개 (거기는 편집기 전용) */
const cf=(n,id,label,small,sum,extra,body,defOpen=false)=>{
  const key=foldKey(n,id),open=foldOpen.has(key)?foldOpen.get(key):defOpen;
  return `<div class="card cfold ${open?"":"collapsed"}" id="sec-${id}" data-cf="${id}"><div class="cfhd" role="button" tabindex="0" aria-expanded="${open}" title="눌러서 접기/펼치기"><span class="chev">▸</span><span>${label}</span> ${small}<span class="cfsum">${sum}</span><span class="sp"></span>${extra}</div><div class="cfbody">${body}</div></div>`;
};
function setCf(n,card,open){card.classList.toggle("collapsed",!open);if(open&&card.id==="sec-notes"){const k=ntabOf(n);if($("#"+k))applyFmt($("#"+k))}card.querySelector(".cfhd").setAttribute("aria-expanded",open);foldOpen.set(foldKey(n,card.dataset.cf),open)}
function wireCf(n){
  if($("#sec-cm"))wireCp($("#sec-cm"));
  document.querySelectorAll("#center .cfold").forEach(card=>{
    const hd=card.querySelector(".cfhd"),tg=()=>setCf(n,card,card.classList.contains("collapsed"));
    hd.onclick=e=>{if(!e.target.closest("button"))tg()};
    hd.onkeydown=e=>{if((e.key==="Enter"||e.key===" ")&&e.target===hd){e.preventDefault();tg()}};
  });
}
const _TAGS=/<\/?(?:p|div|span|br|ul|ol|li|strong|b|em|i|u|a|h[1-6]|table|thead|tbody|tr|td|th|blockquote|font|code|pre|img|hr|sup|sub)\b[^>]*>/gi;
function decodeEnt(t){if(!/&[#\w]+;/.test(t))return t;const d=document.createElement("textarea");d.innerHTML=t;return d.value}   // &nbsp; &lt; 등을 원래 글자로
/* HTML 표의 줄 -> Textile 꼴 |칸|칸| (머리칸은 |_. 칸|). 칸 안의 줄바꿈 · 문단은 띄어쓰기로, 사진은 그 자리에 */
function tblRows(b){
  const cell=c=>c.replace(/<img\b[^>]*>/gi,m=>{const u=(m.match(/\bsrc\s*=\s*["']([^"']+)["']/i)||[])[1];return u?` [[img:${encodeURIComponent(u)}]] `:""})
    .replace(/<br\s*\/?>|<\/(?:p|div|li)>/gi," ").replace(_TAGS,"").replace(/\|/g,"¦").replace(/\s+/g," ").trim();
  return (b.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)||[]).map(r=>"|"+(r.match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi)||[]).map(c=>(/^<th/i.test(c)?"_. ":"")+cell(c)).join("|")+"|").join("\n");
}
/* 레드마인 댓글(원문이 HTML 이든 Textile 이든 일반 글이든) -> 태그 없는 글 + 코드 상자(```) / 코드 모양(`) . 댓글을 보여 주는 모든 곳이 이 함수 하나를 쓴다. */
function remoteText(raw){
  let t=(raw||"").replace(/\r\n/g,"\n");
  const html=/<(?:p|div|br|ul|ol|li|h[1-6]|table)\b/i.test(t);          // 레드마인 웹 편집기(HTML)로 쓴 글인가
  if(html)t=t.replace(/>[ \t]*\n[ \t]*</g,"><");                         // 태그 사이의 서식용 줄바꿈은 글의 줄바꿈이 아니다
  const trimCode=c=>c.replace(/^(?:[ \t]*\n)+/,"").replace(/(?:\n[ \t]*)+$/,"");   // 코드 상자 맨 앞뒤의 빈 줄 제거
  const code=c=>trimCode(html?decodeEnt(c.replace(/<br\s*\/?>/gi,"\n").replace(_TAGS,"")):c);   // HTML 글 속 코드는 &#39; &amp; 같은 표기를 원래 글자로
  t=t.replace(/<pre><code(?: class="([^"]*)")?>\n?([\s\S]*?)\n?<\/code><\/pre>/g,(m,l,c)=>"\n```"+(l||"")+"\n"+code(c)+"\n```\n")
    .replace(/<pre[^>]*>\n?([\s\S]*?)\n?<\/pre>/g,(m,c)=>"\n```\n"+code(c)+"\n```\n");
  if(html)t=t.replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi,(m,b)=>"\n"+tblRows(b)+"\n");   // HTML 표 -> |칸|칸| 줄 (칸 태그를 그냥 지우면 글자가 붙어 버린다)
  const para=html?"\n\n":"\n";                                           // HTML 문단 사이는 빈 줄 한 줄 (레드마인 화면과 같은 모양)
  return t.split(/(```[\s\S]*?```)/).map((p,i)=>i%2?p:decodeEnt(
    p.replace(/<img\b[^>]*>/gi,m=>{const u=(m.match(/\bsrc\s*=\s*["']([^"']+)["']/i)||[])[1];return u?`\n[[img:${encodeURIComponent(u)}]]\n`:""})
     .replace(/(^|[\s(])!([^\s!]+\.(?:png|jpe?g|gif|bmp|webp))(?:\([^)]*\))?!/gi,(m,a,f)=>`${a}\n[[att:${encodeURIComponent(f)}]]\n`)
     .replace(/<br\s*\/?>\n?/gi,"\n").replace(/<\/(?:p|h[1-6]|blockquote)>/gi,para).replace(/<\/(?:div|tr|ul|ol)>/gi,"\n").replace(/<li[^>]*>/gi,"· ").replace(/<\/li>/gi,"\n")
     .replace(_TAGS,"")
     .replace(/(^|\s)@([^@\s][^@\n]*?)@(?=\s|$|[.,)])/g,"$1`$2`"))).join("").replace(/ /g," ")   // &nbsp; 는 풀린 뒤에 보통 공백으로
    .replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim();
}
/* ---- 사진: 본문·댓글의 <img> / !파일.png! 를 그 자리에 보여 준다 (사진은 앱 서버를 거쳐서 받는다) ---- */
function imgSrc(u){
  let path=u;
  if(/^https?:\/\//i.test(u)){try{const x=new URL(u),b=new URL(cfg.url);if(x.host!==b.host)return null;path=x.pathname+x.search}catch(e){return null}}
  return /^\/(?:system|attachments)\//.test(path)?"/api/rm/img?p="+encodeURIComponent(path):null;
}
function imgify(h){
  return h.replace(/\[\[img:([^\]]+)\]\]/g,(m,e)=>{const u=decodeURIComponent(e),src=imgSrc(u);
      return src?`<img class="rimg" loading="lazy" src="${src}" data-full="${src}" alt="사진" title="누르면 크게 봐요">`:`<a class="rimg-x" href="${esc(u)}" target="_blank" rel="noopener">외부 이미지 열기 ↗</a>`})
    .replace(/\[\[att:([^\]]+)\]\]/g,(m,e)=>`<img class="rimg" data-att="${e}" alt="${esc(decodeURIComponent(e))}" title="누르면 크게 봐요">`);
}
const curAtts=()=>{const n=curNote();return n?(attCache.get(n.issue_id+"|"+n.updated_on)||[]):[]};
function fillAttImgs(root){   // !첨부이름.png! 로 끼워 넣은 첨부 사진: 첨부 목록을 받은 뒤에 주소를 채운다
  const list=curAtts();if(!list.length)return;
  (root||document).querySelectorAll("img.rimg[data-att]:not([src])").forEach(im=>{
    const nm=decodeURIComponent(im.dataset.att),a=list.find(x=>x.filename===nm);
    if(a){im.src=`/api/rm/attachment?id=${a.id}&name=${encodeURIComponent(a.filename)}`;im.dataset.full=im.src}else{im.classList.add("bad")}});
}
function noteImgs(n){const out=[],seen=new Set(),grab=t=>{(t||"").replace(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi,(m,u)=>{const x=imgSrc(u);if(x&&!seen.has(x)){seen.add(x);out.push(x)}return m})};grab(n.desc_raw);n.journals.forEach(j=>grab(j.raw));return out}
const noteThumbs=(n,extra=[])=>{const im=[...new Set([...noteImgs(n),...extra])];return im.length?`<div class="chips erow thumbs"><span class="meta">사진 ${im.length}장</span>${im.slice(0,14).map(x=>`<img class="rimg th" loading="lazy" src="${x}" data-full="${x}" alt="사진" title="누르면 크게 봐요">`).join("")}${im.length>14?`<span class="meta">+${im.length-14}</span>`:""}</div>`:""};
/* ---- 사진 뷰어: 누르면 크게 뜨고, 휠·＋－·두 손가락으로 확대/축소, 끌어서 이동, ←→ 로 앞뒤 사진 ---- */
const lb={list:[],i:0,k:1,x:0,y:0,fit:1,nw:0,nh:0,ptr:new Map(),pin:0,moved:false};
function lbApply(){
  const im=$("#lbImg");if(!im)return;
  im.style.transform=`translate(${lb.x}px,${lb.y}px) scale(${lb.k})`;
  $("#lbPct").textContent=Math.round(lb.k*100)+"%";
  $("#lbBox").classList.toggle("pan",lb.k>lb.fit+.01);
}
function lbClamp(){   // 사진이 화면 밖으로 완전히 사라지지 않게
  const st=$("#lbBox").getBoundingClientRect(),w=lb.nw*lb.k,h=lb.nh*lb.k;
  const mx=Math.max(0,(w-st.width)/2)+st.width*.35,my=Math.max(0,(h-st.height)/2)+st.height*.35;
  lb.x=Math.max(-mx,Math.min(mx,lb.x));lb.y=Math.max(-my,Math.min(my,lb.y));
}
function lbZoom(nk,cx,cy){   // (cx,cy)=화면 좌표를 기준점으로 확대/축소
  nk=Math.max(.05,Math.min(10,nk));const st=$("#lbBox").getBoundingClientRect();
  const px=(cx==null?st.left+st.width/2:cx)-(st.left+st.width/2),py=(cy==null?st.top+st.height/2:cy)-(st.top+st.height/2);
  lb.x=px-(px-lb.x)*(nk/lb.k);lb.y=py-(py-lb.y)*(nk/lb.k);lb.k=nk;lbClamp();lbApply();
}
function lbFit(){const st=$("#lbBox").getBoundingClientRect();lb.fit=Math.min(1,(st.width*.94)/Math.max(1,lb.nw),(st.height*.84)/Math.max(1,lb.nh));lb.k=lb.fit;lb.x=lb.y=0;lbApply()}
function lbLoad(){
  const im=$("#lbImg"),u=lb.list[lb.i];if(!im||!u)return;
  $("#lbCnt").textContent=lb.list.length>1?`${lb.i+1} / ${lb.list.length}`:"";
  $("#lbox [data-lb=prev]").hidden=$("#lbox [data-lb=next]").hidden=lb.list.length<2;
  $("#lbDl").href=u;
  im.style.visibility="hidden";lb.nw=lb.nh=0;
  im.onload=()=>{lb.nw=im.naturalWidth;lb.nh=im.naturalHeight;im.style.width=lb.nw+"px";im.style.height=lb.nh+"px";lbFit();im.style.visibility=""};
  im.onerror=()=>{im.style.visibility="";toast("사진을 불러오지 못했어요",3000)};
  im.src=u;
}
function lbNav(d){if(lb.list.length<2)return;lb.i=(lb.i+d+lb.list.length)%lb.list.length;lbLoad()}
function lbClose(){const b=$("#lbox");if(b)b.classList.remove("show")}
function lbInit(b){
  b.innerHTML=`<div class="lb-stage" id="lbBox"><img id="lbImg" alt="사진" draggable="false"></div><div class="lb-hint">휠 · 두 손가락 · ＋－ 로 확대/축소 · 끌어서 이동 · ←→ 앞뒤 사진</div>
    <div class="lb-bar"><button type="button" data-lb="prev" title="앞 사진 (←)">‹</button><span id="lbCnt"></span><button type="button" data-lb="next" title="다음 사진 (→)">›</button>
      <button type="button" data-lb="out" title="축소 (-)">－</button><span class="lb-pct" id="lbPct">100%</span><button type="button" data-lb="in" title="확대 (+)">＋</button>
      <button type="button" data-lb="fit" title="화면에 맞춤 (0)">맞춤</button><button type="button" data-lb="one" title="원래 크기 (1)">100%</button>
      <a id="lbDl" download title="이 사진을 저장">저장</a><button type="button" data-lb="x" title="닫기 (Esc)">✕ 닫기</button></div>`;
  b.querySelector(".lb-bar").addEventListener("click",e=>{const t=e.target.closest("[data-lb]");if(!t)return;
    ({prev:()=>lbNav(-1),next:()=>lbNav(1),out:()=>lbZoom(lb.k/1.25),in:()=>lbZoom(lb.k*1.25),fit:lbFit,one:()=>lbZoom(1),x:lbClose})[t.dataset.lb]()});
  const st=b.querySelector(".lb-stage");
  st.addEventListener("wheel",e=>{e.preventDefault();lbZoom(lb.k*Math.exp(-e.deltaY*.0018),e.clientX,e.clientY)},{passive:false});
  st.addEventListener("pointerdown",e=>{st.setPointerCapture(e.pointerId);lb.ptr.set(e.pointerId,{x:e.clientX,y:e.clientY});lb.moved=false;lb.pin=0;lb.sx=e.clientX;lb.sy=e.clientY});
  st.addEventListener("pointermove",e=>{
    const o=lb.ptr.get(e.pointerId);if(!o)return;
    if(lb.ptr.size===2){   // 두 손가락: 벌리고 모으기
      const other=[...lb.ptr].find(([id])=>id!==e.pointerId)[1],d0=Math.hypot(o.x-other.x,o.y-other.y);
      lb.ptr.set(e.pointerId,{x:e.clientX,y:e.clientY});const d1=Math.hypot(e.clientX-other.x,e.clientY-other.y);
      if(d0>0)lbZoom(lb.k*d1/d0,(e.clientX+other.x)/2,(e.clientY+other.y)/2);lb.moved=true;return}
    const dx=e.clientX-o.x,dy=e.clientY-o.y;lb.ptr.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(!lb.moved&&Math.hypot(e.clientX-lb.sx,e.clientY-lb.sy)<4)return;
    lb.moved=true;if(lb.k>lb.fit+.01){st.classList.add("dragging");lb.x+=dx;lb.y+=dy;lbClamp();lbApply()}
  });
  const up=e=>{lb.ptr.delete(e.pointerId);st.classList.remove("dragging");
    if(e.type==="pointerup"&&!lb.moved&&!lb.ptr.size){   // 그냥 눌렀을 때: 사진 위 = 크게/맞춤 전환, 빈 곳 = 닫기
      if(e.target.closest("#lbImg"))lb.k>lb.fit+.01?lbFit():lbZoom(Math.max(1,lb.fit*2.5),e.clientX,e.clientY);else lbClose()}};
  st.addEventListener("pointerup",up);st.addEventListener("pointercancel",up);
  window.addEventListener("resize",()=>{if(b.classList.contains("show")&&lb.nw)lbFit()});
}
function openLbox(src){
  let b=$("#lbox");if(!b){b=document.createElement("div");b.id="lbox";document.body.appendChild(b);lbInit(b)}
  const urls=[...new Set([...document.querySelectorAll("#center img.rimg[data-full],#cmphist img.rimg[data-full]")].map(i=>i.dataset.full).filter(Boolean))];
  if(!urls.includes(src))urls.unshift(src);
  lb.list=urls;lb.i=urls.indexOf(src);b.classList.add("show");lbLoad();
}
document.addEventListener("click",e=>{const im=e.target.closest&&e.target.closest("img.rimg");if(!im||im.classList.contains("bad")||!(im.dataset.full||im.currentSrc))return;e.preventDefault();e.stopPropagation();openLbox(im.dataset.full||im.currentSrc)},true);
window.addEventListener("keydown",e=>{
  if(!$("#lbox.show"))return;
  const k=e.key;
  if(k==="Escape"){e.stopPropagation();e.preventDefault();lbClose()}
  else if(k==="ArrowLeft"){e.stopPropagation();e.preventDefault();lbNav(-1)}
  else if(k==="ArrowRight"){e.stopPropagation();e.preventDefault();lbNav(1)}
  else if(k==="+"||k==="="){e.stopPropagation();e.preventDefault();lbZoom(lb.k*1.25)}
  else if(k==="-"||k==="_"){e.stopPropagation();e.preventDefault();lbZoom(lb.k/1.25)}
  else if(k==="0"){e.stopPropagation();e.preventDefault();lbFit()}
  else if(k==="1"){e.stopPropagation();e.preventDefault();lbZoom(1)}
},true);
document.addEventListener("error",e=>{const t=e.target;if(t&&t.classList&&t.classList.contains("rimg")){t.classList.add("bad");t.alt="사진을 불러오지 못했어요";t.removeAttribute("title")}},true);
/* |칸|칸| 줄이 이어지면 표로 그린다: 레드마인 HTML 표(remoteText 가 바꾼 것) · Textile 표(|_. 머리칸|) · 마크다운 표(| a | b | 와 |---|---|) */
function tablify(h){
  const row=l=>/^\s*\|.*\|\s*$/.test(l)&&l.split("|").length>3,sep=l=>/^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(l);
  const L=h.split("\n"),out=[];
  for(let i=0;i<L.length;){
    if(!row(L[i])){out.push(L[i++]);continue}
    const rows=[];
    while(i<L.length&&row(L[i])){if(sep(L[i])){if(rows.length)rows[rows.length-1].head=true}else rows.push({c:L[i].trim().slice(1,-1).split("|")});i++}
    out.push("\uE003<div class=\"rtbl\"><table>"+rows.map(r=>"<tr>"+r.c.map(c=>{
      const m=/^\s*(?:(_)(?:[=^~]|&[lg]t;|[\\\/]\d+)*|(?:[=^~]|&[lg]t;|[\\\/]\d+)+)\.\s/.exec(c),th=r.head||!!(m&&m[1]);
      const v=(m?c.slice(m[0].length):c).trim(),nw=v.replace(/<[^>]+>|&\w+;/g,"x").length<=30;   // 짧은 칸(날짜 · 번호)은 한 줄로
      return `<${th?"th":"td"}${nw?' class="nw"':""}>${v}</${th?"th":"td"}>`}).join("")+"</tr>").join("")+"</table></div>\uE003");
  }
  return out.join("\n").replace(/\n?\uE003\n?/g,"");   // 표 앞뒤 줄바꿈은 빈 줄로 보이지 않게
}
const tablifyMd=h=>h.split(/(<div class="cbw">[\s\S]*?<\/pre><\/div>)/).map((p,i)=>i%2?p:tablify(p)).join("");   // 코드 상자 안의 | 는 건드리지 않는다
const richHtml=raw=>imgify(tablifyMd(renderMd(remoteText(raw))).replace(/\n(<div class="cbw">)/g,"$1").replace(/(<\/pre><\/div>)\n/g,"$1"));
const cmBody=j=>richHtml(j.raw!=null?j.raw:j.notes);
function origCard(n){
  const n2=noteImgs(n).length;
  return cf(n,"orig","레드마인 원문",`<small>요건 · 본문 그대로${n2?` · 사진 ${n2}장`:""}</small>`,"","",`<div class="j orig">${richHtml(n.desc_raw||n.description||"")||"(없음)"}</div><div class="cmimgs" data-attj="0"></div>`,true);   // 노트의 첫 구역: 기본은 펼침
}
/* 예전에 직접 고쳐 쓴 요건이 있는 노트에만, 읽기 전용으로 접어서 남긴다 (지우지 않고 보존) */
function legacyReqCard(n){
  if(!reqEdited(n))return "";
  return cf(n,"oldreq","예전에 내가 고친 요건",`<small>읽기 전용 · 이제는 고칠 수 없어요</small>`,"","",`<div class="${pvClass()}">${renderMd(n.requirement)}</div>`);
}
/* 댓글 이력 = 글 있는 댓글 + 상태·담당자 등 변경 줄을 시간순으로 한 줄기에. (레드마인 화면처럼) */
function cmEntries(n){
  const out=n.journals.map(j=>({t:j.created_on||"",k:0,id:j.id||0,j}));
  (n.changes||[]).forEach(c=>out.push({t:c.created_on||"",k:1,id:c.id||0,c}));
  return out.sort((a,b)=>a.t.localeCompare(b.t)||a.id-b.id||a.k-b.k);
}
const chgItem=it=>`<li><b>${esc(it.label)}</b> ${it.note?esc(it.note):(it.old&&it.new)?`${esc(it.old)} <span class="arr">→</span> <b>${esc(it.new)}</b>`:it.new?`<b>${esc(it.new)}</b>`:`${esc(it.old||"")} 제거`}</li>`;
const chgHtml=c=>`<div class="chg" data-cmt="${esc(c.created_on||"")}"${cfg.meName&&c.user===cfg.meName?" data-mine":""}><span class="chgdot" aria-hidden="true">↻</span><div class="chgbody"><b>${esc(c.user)}</b> <span class="meta">· ${dTime(c.created_on)} · 변경</span><ul>${c.items.map(chgItem).join("")}</ul><div class="cmimgs" data-attj="${c.id||0}"></div></div></div>`;
const cmHist=n=>cmEntries(n).map(e=>e.c?chgHtml(e.c):(j=>`<div class="cm ${j.user&&j.user.id===cfg.meId?"me":""}" data-cmt="${esc(j.created_on||"")}"${j.user&&cfg.meId&&j.user.id===cfg.meId?" data-mine":""}><div class="av">${esc(avatar(j.user.name))}</div><div style="flex:1;min-width:0"><div class="who"><b>${esc(j.user.name)}</b> · ${dTime(j.created_on)}</div><div class="bubble">${cmBody(j)}</div><div class="cmimgs" data-attj="${j.id||0}"></div></div></div>`)(e.j)).join("")||`<span class="meta">댓글이 없습니다.</span>`;
/* ---------- 새 댓글로 바로 (2.22) ----------
   안 본 일감(목록에서 강조된 것)을 처음 열면, 마지막으로 본 뒤에 남이 단 댓글 · 변경을 NEW 영역 하나로 묶어 칠하고 그 자리로 바로 이동한다.
   기준은 안 본 일감 강조와 같다(rm_seen: 마지막으로 열어 본 때의 수정일). 한 번 열면 본 것이 되므로 다음에 열 때는 하지 않는다.
   새로 들어온 일감(처음 받은 것)은 원문부터 읽도록 이동하지 않는다. 다른 노트로 가면 강조는 사라진다. */
let cmNew=null;
function cmNewMark(n){
  if(!n||!isUnseen(n)||fresh[n.issue_id]==="신규")return;
  const m=seenGet(),since=m.ids[n.issue_id]||m._base||"";
  if(since)cmNew={id:n.issue_id,since,jumped:false};
}
function cmNewApply(n){
  if(!cmNew||cmNew.id!==n.issue_id)return;
  const els=[...document.querySelectorAll("#sec-cm [data-cmt]")].filter(e=>e.dataset.cmt>cmNew.since&&!("mine" in e.dataset));
  if(!els.length){cmNew.jumped=true;return}
  /* 새 댓글 · 변경을 하나씩 칠하지 않고, 첫 번째부터 마지막까지 한 영역으로 묶는다 (사이에 낀 내 댓글도 같이) */
  const grp=document.createElement("div");grp.className="cm-newgrp";
  grp.innerHTML=`<div class="cm-newhd"><span class="cm-newtag">NEW</span><span>마지막으로 본 뒤 새 댓글 · 변경 <b>${els.length}</b>건</span></div>`;
  const last=els[els.length-1];els[0].before(grp);
  for(let x=grp.nextSibling;x;){const nx=x.nextSibling;grp.appendChild(x);if(x===last)break;x=nx}
  if(cmNew.jumped)return;
  cmNew.jumped=true;
  const card=$("#sec-cm");if(card&&card.classList.contains("collapsed"))setCf(n,card,true);   // 접혀 있으면 펼친 뒤
  const c=$("#center"),go=b=>{jumpLock={k:"cm",t:Date.now()};grp.scrollIntoView({block:"start",behavior:b});setTimeout(spy,b==="smooth"?500:60)};
  go("auto");const y=c.scrollTop;
  setTimeout(()=>{if(grp.isConnected&&Math.abs(c.scrollTop-y)<4)go("smooth")},450);      // 사진 · 첨부가 늦게 그려져 밀렸으면 한 번 더 (그사이 직접 스크롤했으면 두지 않는다)
  toast(`마지막으로 본 뒤 새 댓글 · 변경 ${els.length}건 — 그 자리로 이동했어요`,3500);
}
function cmSum(n){   // 접혀 있을 때 한 줄 미리보기: 마지막 댓글
  const j=n.journals[n.journals.length-1];if(!j)return "· 아직 댓글이 없어요";
  const t=remoteText(j.raw!=null?j.raw:j.notes).replace(/\|_\. /g,"|").replace(/```[A-Za-z0-9_+#.-]*/g," ").replace(/`/g,"").replace(/\s+/g," ").trim();
  return `· 마지막 ${esc(j.user.name)} ${dTime(j.created_on)} — ${esc(t.slice(0,60))}${t.length>60?"…":""}`;
}

