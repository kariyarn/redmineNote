/* Full index.html + real scripts + temporary app + existing loopback fake Redmine. */
(async()=>{
  const checks=[],wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const result=document.createElement('pre');result.id='result';document.body.appendChild(result);
  const check=(name,ok)=>{if(!ok)throw Error(name);checks.push(name);result.textContent=JSON.stringify({ok:false,checks:checks.length,pendingAfter:name})};
  try{
    for(let i=0;i<100&&!(typeof all!=='undefined'&&all.some(n=>n.issue_id===93599));i++)await wait(50);
    check('configured fake origin',new URL(cfg.url).hostname==='127.0.0.1'&&new URL(cfg.url).origin!==location.origin);
    ui.design=new URLSearchParams(location.search).get('design');applyTheme();
    S.patchnote_seen=cfg.appVersion;S.write_ack_first='1';openNote(93599);
    await wait(150);
    const n=curNote(),root=()=>$('#sec-write .cmta');
    check('full screen boots and opens HTML composer',n?.issue_id===93599&&root()?._commentEditor?.format==='html');
    check('upstream layout and maximize controls survive',$('#jlay')&&$('#jmax'));
    check('upstream attachment block is collapsible',$('#sec-att')?.dataset.cf==='att');
    check('full attachment link is not nested with a delete button',!!$('#attwrap .attrow')&&![...document.querySelectorAll('#attwrap .attrow')].some(a=>a.querySelector('button')));
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
