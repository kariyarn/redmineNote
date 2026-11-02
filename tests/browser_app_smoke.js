/* Full index.html + real scripts + temporary app + existing loopback fake Redmine. */
(async()=>{
  const checks=[],wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const result=document.createElement('pre');result.id='result';document.body.appendChild(result);
  const check=(name,ok)=>{if(!ok)throw Error(name);checks.push(name);result.textContent=JSON.stringify({ok:false,checks:checks.length,pendingAfter:name})};
  try{
    for(let i=0;i<100&&!(typeof all!=='undefined'&&all.some(n=>n.issue_id===93599));i++)await wait(50);
    check('configured fake origin',new URL(cfg.url).hostname==='127.0.0.1'&&new URL(cfg.url).origin!==location.origin);
    ui.design=new URLSearchParams(location.search).get('design');applyTheme();
    const navMoreWas=ui.navMore,navCollapsedWas=!!ui.navCollapsed;
    if(!$('#nav [data-nav="vaultCode"]')&&$('#navmore')){$('#navmore').click()}
    const historyNav=$('#nav [data-nav="history"]'),vaultNav=$('#nav [data-nav="vaultCode"]');
    check('vault submenu aligns with regular navigation items',!!historyNav&&!!vaultNav&&Math.abs(historyNav.getBoundingClientRect().left-vaultNav.getBoundingClientRect().left)<1&&Math.abs(historyNav.querySelector('.ic').getBoundingClientRect().left-vaultNav.querySelector('.ic').getBoundingClientRect().left)<1);
    ui.navCollapsed=false;applyUI();renderNav();
    const navToggle=$('#navToggle');navToggle.click();
    check('left navigation collapses to icon rail',ui.navCollapsed&&Math.abs($('#nav').getBoundingClientRect().width-56)<1&&navToggle.getAttribute('aria-label')==='왼쪽 메뉴 펼치기');
    navToggle.click();
    check('left navigation expands on second toggle',!ui.navCollapsed&&Math.abs($('#nav').getBoundingClientRect().width-216)<1&&navToggle.getAttribute('aria-label')==='왼쪽 메뉴 접기');
    ui.navCollapsed=navCollapsedWas;ui.navMore=navMoreWas;saveUI();applyUI();renderNav();
    S.patchnote_seen=cfg.appVersion;S.write_ack_first='1';openNote(93599);
    await wait(150);
    const n=curNote(),root=()=>$('#sec-write .cmta');
    check('full screen boots and opens HTML composer',n?.issue_id===93599&&root()?._commentEditor?.format==='html');
    check('upstream layout and maximize controls survive',$('#jlay')&&$('#jmax'));
    check('upstream attachment block is collapsible',$('#sec-att')?.dataset.cf==='att');
    check('full attachment link is not nested with a delete button',!!$('#attwrap .attrow')&&![...document.querySelectorAll('#attwrap .attrow')].some(a=>a.querySelector('button')));
    const savedJournals=n.journals,savedLayout=ui.nl;
    n.journals=[...savedJournals,...Array.from({length:18},(_,i)=>({id:9000+i,created_on:`2026-10-${String(i+1).padStart(2,"0")}T10:00:00Z`,user:{id:99,name:`스크롤 시험 ${i}`},notes:`최신 댓글 ${i}`}))];
    ui.nl=nlNorm({...NL_PRESET.cmSide[1],fold:{cm:"open"}});renderCenter();await wait(100);
    const side=$("#noteside"),comments=side?.querySelectorAll("#sec-cm .tl .cm[data-cmt]"),latest=comments?.[comments.length-1];
    const sideToolsToggle=side?.querySelector("#sec-write [data-ce-tools-toggle]"),sideTools=side?.querySelector("#sec-write .cetools");
    check('right-side composer hides formatting toolbar initially',!!sideToolsToggle&&sideTools.hidden&&sideToolsToggle.textContent==="서식 보이기");
    sideToolsToggle.click();check('right-side toolbar can be shown temporarily',!sideTools.hidden&&sideToolsToggle.textContent==="서식 숨기기");
    sideToolsToggle.click();check('right-side toolbar can be hidden again',sideTools.hidden&&sideToolsToggle.textContent==="서식 보이기");
    check('right-side scrolling is contained within its pane',getComputedStyle(side).overscrollBehaviorY==="contain");
    check('right-side expanded comments scroll to the latest comment',!!latest&&side.scrollTop>0&&latest.getBoundingClientRect().top>=side.getBoundingClientRect().top-1&&latest.getBoundingClientRect().bottom<=side.getBoundingClientRect().bottom+1);
    $("#sec-cm .cfhd").click();await wait(50);side.scrollTop=0;$("#sec-cm .cfhd").click();await wait(100);
    check('reopening right-side comments scrolls to the latest comment',side.scrollTop>0&&latest.getBoundingClientRect().top>=side.getBoundingClientRect().top-1&&latest.getBoundingClientRect().bottom<=side.getBoundingClientRect().bottom+1);
    n.journals=savedJournals;ui.nl=savedLayout;renderCenter();await wait(50);
    const raw='<p>전체 화면 문단</p><p>같은 문단<br>다음 줄</p>';
    root()._commentEditor.visual.innerHTML=raw;root()._commentEditor.changed(root()._commentEditor.visual);
    const file=new File(['smoke '+ui.design], 'browser-smoke-'+ui.design+'.txt', {type:'text/plain'});cmAddFiles(n,[file]);
    for(const preset of ['cmSide','focus','def']){
      ui.nl=nlNorm(NL_PRESET[preset][1]);renderCenter();await wait(80);
      check(preset+' preserves draft and selected file',draftOf(n.issue_id)===raw&&filesOf(n.issue_id).length===1&&root()._commentEditor.getRaw()===raw);
      check(preset+' keeps attachment block unique',document.querySelectorAll('#sec-att').length===1&&document.querySelectorAll('#attwrap').length===1);
      if(preset==='cmSide'){
        check('comment block moves into the actual side column',!!$('#noteside #sec-write'));
        focusSideCm();await wait(100);check('side composer gets actual visual focus',document.activeElement===root()._commentEditor.visual);
        await root()._commentEditor.command('source');focusSideCm();await wait(100);check('side composer gets actual source focus',document.activeElement===root()._commentEditor.source);
        await root()._commentEditor.command('source');
      }
      if(preset==='focus')check('hidden attachment block remains available without duplication',!!document.querySelector('.nl-hidden #sec-att'));
    }
    const ce=root()._commentEditor;
    const range=document.createRange();range.selectNodeContents(ce.visual.querySelector('p'));range.collapse(true);getSelection().removeAllRanges();getSelection().addRange(range);ce.remember();
    for(const theme of ['light','dark','nord','mocha','cyberpunk','terminal','kotori','emerald','lavender','hcl']){
      document.documentElement.dataset.theme=theme;
      check(theme+' full-page P backgrounds stay transparent',[...ce.visual.children].every(p=>getComputedStyle(p).backgroundColor==='rgba(0, 0, 0, 0)'));
    }
    check('full-page native comment and file save',await doWrite(n,{}));await wait(150);
    const updated=curNote();
    check('remote fake journal retains p and br HTML',updated.journals.some(j=>(j.raw??j.notes)===raw));
    check('successful save clears draft and file state',draftOf(n.issue_id)===''&&filesOf(n.issue_id).length===0);
    check('uploaded attachment is readable with no remote action buttons',[...document.querySelectorAll('#attwrap .attitem')].some(item=>item.querySelector('.an')?.textContent===file.name&&item.querySelector('a[download]'))&&!document.querySelector('#attwrap button'));
    check('existing comments are read-only',!document.querySelector('[data-jedit], [data-jeditor]'));
    const item=[...document.querySelectorAll('#attwrap .attitem')].find(item=>item.querySelector('.an')?.textContent===file.name);
    const response=await fetch(item.querySelector('a').getAttribute('href'));
    check('uploaded file remains downloadable',response.ok&&(await response.text())==='smoke '+ui.design);
    cmAddFiles(curNote(),[new File(['only file'], 'file-only-'+ui.design+'.txt',{type:'text/plain'})]);
    check('file-only save works with an empty comment',await doWrite(curNote(),{}));await wait(100);
    check('file-only save refreshes the attachment list',[...document.querySelectorAll('#attwrap .an')].some(el=>el.textContent==='file-only-'+ui.design+'.txt'));
    check('no uncaught full-page script errors',window.__smokeErrors.length===0);
    result.textContent=JSON.stringify({ok:true,checks:checks.length});
  }catch(error){result.textContent=JSON.stringify({ok:false,checks:checks.length,error:String(error.stack||error),scriptErrors:window.__smokeErrors})}
})();
