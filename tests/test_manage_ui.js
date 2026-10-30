/* 관리 UI: 실제 스크립트와 작은 DOM 대역, 기존/새 디자인. 네트워크 사용 없음. */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),crypto=require("node:crypto");
const root=path.resolve(__dirname,".."),escape=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const {Element}=require('./dom_stub');
let checks=0;
function check(name,fn){fn();checks++;console.log("PASS",name)}
function control(attr,journal=101){return {dataset:{issue:"93599",journal:String(journal)},disabled:false,hasAttribute:k=>k===attr,closest(){return this}}}
async function suite(v2){
  console.log("Design:",v2?"v2":"classic");
  const events={},posts=[],notices=[],confirmations=[],attbox={innerHTML:""},center={scrollTop:40,addEventListener(){}};
  const editors=[{dataset:{jeditor:"93599:101"},value:"",disabled:false},{dataset:{jeditor:"93599:101"},value:"",disabled:false}];
  const controls=[control("data-jsave"),control("data-jcancel"),control("data-jreload")];
  const j={id:101,user:{id:7,name:"me"},created_on:"2026-10-01",raw:"original",notes:"original"};
  const n={issue_id:93599,updated_on:"initial",journals:[j],changes:[]};
  let atts=[{id:11,filename:'<mine>.txt',filesize:3,can_delete:true,content_type:"text/plain",author:"me"},
            {id:22,filename:"other.txt",filesize:4,can_delete:false,content_type:"text/plain",author:"other"},
            {id:33,filename:"mine.png",filesize:5,can_delete:true,content_type:"image/png",author:"me"}];
  const original='\n<p>first<br />second</p>\n<pre><code class="python">\nx = "&lt;"\n\nprint(x)\n</code></pre>\n';
  const context=vm.createContext({crypto,console,URL,setTimeout:()=>0,clearTimeout(){},innerWidth:1000,innerHeight:800,
    document:{activeElement:null,querySelector:()=>null,addEventListener(k,f){(events[k]??=[]).push(f)},querySelectorAll(s){
      if(s.startsWith("[data-jeditor"))return editors;
      if(s.includes("[data-delete-att]"))return controls;
      return [];
    }},window:{addEventListener(){}},localStorage:{getItem:()=>null,setItem(){throw Error("Unexpected storage")},removeItem(){}},
    n,j,all:[n],cur:93599,view:"note",cfg:{url:"http://127.0.0.1:1",meId:7,write:{test:false,allow:[]}},S:{},
    V2:()=>v2,esc:escape,kb:x=>x+" B",lDay:x=>x||"",dTime:x=>x||"",avatar:()=>"me",renderMd:escape,
    prep(){},buildTokens(){},markSeen(){},renderAll(){context.renders=(context.renders||0)+1},
    $:s=>s==="#attwrap"?attbox:s==="#center"?center:null,
    toast:s=>notices.push(s),fetch(){throw Error("Network forbidden")},
    api:async url=>url.startsWith("/api/rm/journal?")?{raw:original,version:"version-1"}:atts,
    post:async(url,body)=>{posts.push({url,body});return {ok:true,note:{...n,updated_on:"updated"}}},
  });
  const run=s=>vm.runInContext(s,context);
  for(const file of ["note.js","write.js"])vm.runInContext(fs.readFileSync(path.join(root,"web/js",file),"utf8"),context,{filename:file});
  const click=events.click.at(-1),input=events.input.at(-1);
  vm.runInContext(fs.readFileSync(path.join(root,"web/js/common.js"),"utf8"),context,{filename:"common.js"});
  run("remoteText=s=>s;updFab=()=>{}");
  let answer=true;
  context.confirmHandler=async options=>{confirmations.push({msg:options.body,options});return answer};
  run("wdlg=options=>confirmHandler(options)");
  context.a=atts[0];
  check("only own editable comments show pencil",()=>{
    assert.match(run("managedJournalHtml(n,j)"),/data-jedit/);
    assert.doesNotMatch(run("managedJournalHtml(n,{...j,user:{id:60,name:'other'}})"),/data-jedit/);
    assert.doesNotMatch(run("managedJournalHtml(n,{...j,editable:false})"),/data-jedit/);
  });
  await run("loadAtt(n)");
  const attDOM=new Element('div');attDOM.innerHTML=attbox.innerHTML;
  check("every bordered file box is the download anchor with deletion outside",()=>{
    for(const row of attDOM.querySelectorAll('.attrow')){assert.equal(row.localName,'a');assert.ok(row.hasAttribute('href'));assert.ok(row.hasAttribute('download'));assert.equal(row.querySelectorAll('button').length,0)}
    assert.ok(attDOM.querySelector('.img').querySelector('img.rimg'));
  });
  check("delete lives outside bordered file box in an equal-width grid wrapper",()=>{
    const items=attDOM.querySelectorAll('.attitem');assert.equal(items.length,3);
    for(const item of items){const row=item.querySelector('.attrow'),del=item.querySelector('.attdelete');assert.equal(row.parentElement,item);if(del){assert.equal(del.parentElement,item);assert.equal(del.closest('.attrow'),null);assert.ok(item.classList.contains('has-delete'))}else assert.equal(item.classList.contains('has-delete'),false)}
    const css=fs.readFileSync(path.join(root,'web/css/note.css'),'utf8');assert.match(css,/\.attcard \.attitem\{[^}]*grid-template-columns:minmax\(0,1fr\)[^}]*gap:8px[^}]*width:100%/);assert.match(css,/\.attcard \.attitem\.has-delete\{grid-template-columns:minmax\(0,1fr\) auto\}/);assert.match(css,/\.attcard \.attitem>\.attdelete\{[^}]*align-self:stretch/);
  });
  check("delete icon and text are red while background border and rounding match file box",()=>{
    const css=fs.readFileSync(path.join(root,'web/css/note.css'),'utf8'),v2css=fs.readFileSync(path.join(root,'web/css/v2.css'),'utf8');
    assert.match(css,/\.attcard \.attdelete\{[^}]*background:var\(--surface2\);border:1px solid var\(--line\);border-radius:10px/);assert.match(css,/\.attcard \.attdelete-label\{color:inherit/);assert.match(v2css,/html\[data-design=v2\] \.attcard \.attdelete\{[^}]*background:var\(--surface2\)/);
    assert.match(css,/\.attcard \.attrow:hover\{border-color:var\(--accent\);background:var\(--accent-soft\)/);assert.doesNotMatch(css,/\.attmain:hover[^}]*underline/);
    assert.doesNotMatch(css+v2css,/#fff0f1|#ffdde2|#d98994/);
  });
  let expanded=null;context.viewer=url=>{expanded=url};run('openLbox=url=>viewer(url)');
  const imageClick=events.click.find(fn=>String(fn).includes('button.attpreview'));
  imageClick({target:attDOM.querySelector('.img').querySelector('img.rimg'),preventDefault(){},stopPropagation(){}});
  check('image thumbnail click enlarges and cancels containing download anchor',()=>assert.match(expanded,/id=33/));
  expanded=null;const imageKey=events.keydown.find(fn=>String(fn).includes('a.attrow.img'));
  imageKey({target:attDOM.querySelector('.img'),key:' ',preventDefault(){},stopPropagation(){}});
  check('image file box supports keyboard Space enlargement',()=>assert.match(expanded,/id=33/));
  const editImage=new Element('img');editImage.className='rimg';editImage.dataset.full='/api/rm/attachment?id=33';const visual=new Element('div');visual.className='cevisual';visual.appendChild(editImage);expanded=null;
  imageClick({target:editImage,preventDefault(){throw Error('Editor image click must remain in editor')},stopPropagation(){}});
  check('editor image selection never opens read-only image viewer',()=>assert.equal(expanded,null));
  const failedImage=new Element('img');failedImage.className='rimg';failedImage.dataset.full='/api/rm/img?p=%2Fsystem%2Frich%2Fa.png';
  const savedImageApi=context.api;context.api=async()=>{const e=Error('이미지에 접근할 권한이 없어요');e.status=403;throw e};
  await events.error[0]({target:failedImage});context.api=savedImageApi;
  check('image failure exposes access reason rather than only generic broken-image text',()=>{assert.match(failedImage.alt,/권한/);assert.ok(failedImage.classList.contains('bad'))});
  check("delete buttons are outside download links and limited to eligible files",()=>{
    assert.match(attbox.innerHTML,/data-delete-att="11"/);assert.match(attbox.innerHTML,/data-delete-att="33"/);
    assert.match(attbox.innerHTML,/<svg aria-hidden="true"[^>]*stroke="currentColor"/);assert.match(attbox.innerHTML,/<span class="attdelete-label">삭제<\/span>/);
    assert.doesNotMatch(attbox.innerHTML,/data-delete-att="22"/);assert.match(attbox.innerHTML,/<\/a><button[^>]+attdelete/);
    assert.match(attbox.innerHTML,/&lt;mine&gt;/);
  });
  answer=false;assert.equal(await run("deleteRemoteAttachment(n,a)"),false);
  let stopped=false,prevented=false;expanded=null;
  const deleteEvent={target:attDOM.querySelector('[data-delete-att="11"]').querySelector('.attdelete-label'),preventDefault(){prevented=true},stopPropagation(){stopped=true}};
  imageClick(deleteEvent);await click(deleteEvent);assert.equal(expanded,null);
  check("delete click cancels navigation and bubbling before confirmation",()=>{assert.equal(stopped,true);assert.equal(prevented,true);assert.equal(posts.length,0)});
  check("delete confirmation identifies issue attachment and filename and cancel sends nothing",()=>{
    assert.match(confirmations[0].msg,/#93599/);assert.match(confirmations[0].msg,/#11/);assert.match(confirmations[0].msg,/&lt;mine&gt;\.txt/);assert.equal(posts.length,0);
  });
  answer=true;
  context.post=async(url,body)=>{posts.push({url,body});atts=atts.filter(a=>a.id!==11);return {ok:true,note:{...n,updated_on:"deleted",changes:[{id:111,user:"me",items:[{label:"첨부",old:"<mine>.txt",new:""}]}]}}};
  assert.equal(await run("deleteRemoteAttachment(n,a)"),true);await run("loadAtt(n)");
  check("successful deletion refreshes attachment list and deletion history",()=>{
    assert.doesNotMatch(attbox.innerHTML,/data-delete-att="11"/);assert.match(attbox.innerHTML,/other\.txt/);
    assert.equal(posts[0].url,"/api/rm/attachment/delete");assert.equal(posts[0].body.target_id,11);
    assert.match(run("cmHist(n)"),/제거/);
  });
  const savedApi=context.api;let finishLoad;
  context.api=()=>new Promise(resolve=>finishLoad=resolve);
  const firstLoad=run("openJournalEdit(n,101)");
  assert.equal(await run("openJournalEdit(n,101)"),false);
  finishLoad({raw:original,version:"version-1"});assert.equal(await firstLoad,true);context.api=savedApi;
  check("duplicate edit-open does not overwrite a later draft with a second response",()=>assert.equal(run("rmEditLoading.size"),0));
  check("editor loads original markup code and line breaks without conversion",()=>{
    assert.equal(run("rmEditDraft.get('93599:101').raw"),original);
    assert.match(run("managedJournalHtml(n,j)"),/&lt;pre&gt;&lt;code/);
    assert.match(run("managedJournalHtml(n,j)"),/<textarea[^>]*>\n\n/); // 첫 LF는 textarea HTML 규칙이 제거하고 원문 LF는 남긴다.
  });
  editors[0].value=original+"<p>edited</p>";
  input({target:editors[0]});
  check("editing synchronizes inline and floating comment editors",()=>assert.equal(editors[1].value,editors[0].value));
  context.post=async(url,body)=>{posts.push({url,body});const e=Error("API unsupported");e.status=422;e.body={code:"unsupported",retry_allowed:true};throw e};
  assert.equal(await run("sendManaged(n,'edit_journal',101,{notes:rmEditDraft.get('93599:101').raw,version:'version-1'})"),false);
  check("unsupported API retains draft and offers original Redmine",()=>{
    assert.equal(run("rmEditDraft.get('93599:101').raw"),editors[0].value);
    const html=run("managedJournalHtml(n,j)");assert.match(html,/원본 Redmine/);assert.match(html,/API unsupported/);
  });
  context.post=async()=>{const e=Error("conflict");e.status=409;e.body={code:"changed"};throw e};
  const count=posts.length;
  assert.equal(await run("sendManaged(n,'edit_journal',101,{notes:rmEditDraft.get('93599:101').raw,version:'version-1'})"),false);
  check("conflict retains draft and does not force retry",()=>{assert.equal(posts.length,count);assert.equal(run("rmEditDraft.get('93599:101').raw"),editors[0].value)});
  let done;context.post=(url,body)=>{posts.push({url,body});return new Promise(resolve=>done=resolve)};
  context.first=run("sendManaged(n,'edit_journal',101,{notes:rmEditDraft.get('93599:101').raw,version:'version-1'})");
  assert.equal(await run("sendManaged(n,'edit_journal',101,{notes:'double',version:'version-1'})"),false);
  check("duplicate save is blocked and both editors are disabled",()=>{assert.ok(editors.every(e=>e.disabled));assert.ok(controls[0].disabled);assert.equal(posts.length,count+1)});
  const saved=posts.at(-1).body.notes;done({ok:true,note:{...n,updated_on:"edited",journals:[{...j,raw:saved,notes:saved}]}});assert.equal(await context.first,true);
  check("save updates existing journal clears edit mode and restores controls",()=>{
    assert.equal(run("rmEditDraft.has('93599:101')"),false);assert.equal(n.journals.length,1);assert.equal(n.journals[0].id,101);assert.equal(n.journals[0].raw,saved);assert.ok(editors.every(e=>!e.disabled));
  });
  await run("openJournalEdit(n,101)");
  await click({target:control("data-jcancel"),preventDefault(){},stopPropagation(){}});
  check("cancel exits edit mode without remote write",()=>{assert.equal(run("rmEditDraft.has('93599:101')"),false);assert.equal(posts.length,count+1)});
  await run("openJournalEdit(n,101)");
  await click({target:control("data-jcode"),preventDefault(){},stopPropagation(){}});
  check("code box insertion keeps original text",()=>{const raw=run("rmEditDraft.get('93599:101').raw");assert.ok(raw.startsWith(original));assert.match(raw,/<pre><code>\n코드를 입력하세요/)});
  context.post=async(url,body)=>{posts.push({url,body});const e=Error("uncertain");e.status=502;e.body={needs_review:true,request_id:body.request_id,operation:"edit_journal",target_id:101};throw e};
  assert.equal(await run("sendManaged(n,'edit_journal',101,{notes:rmEditDraft.get('93599:101').raw,version:'version-1'})"),false);
  const uncertainCount=posts.length;
  assert.equal(await run("sendManaged(n,'edit_journal',101,{notes:'retry',version:'version-1'})"),false);
  check("uncertain result preserves draft shows recovery and blocks resend",()=>{
    assert.equal(posts.length,uncertainCount);assert.ok(run("rmEditDraft.has('93599:101')"));assert.match(run("cmHist(n)"),/data-manage-recover/);
  });
  context.post=async(url,body)=>{posts.push({url,body});assert.equal(url,"/api/rm/manage/recover");return {retry_allowed:true}};
  assert.equal(await run("recoverManaged(n,'not_applied')"),true);
  check("explicit recovery prepares next attempt without resending modification",()=>{
    assert.equal(posts.length,uncertainCount+1);assert.ok(run("rmEditDraft.has('93599:101')"));assert.equal(run("rmManagePending.has(93599)"),false);
  });
  run("cfg.write.test=true;cfg.write.allow=[200]");
  await run("loadAtt(n)");
  check("write allow list removes management controls in either design",()=>{
    const html=run("managedJournalHtml(n,j)");assert.doesNotMatch(html,/data-jedit[\s>]/);assert.match(html,/data-jsave[^>]+disabled/);assert.doesNotMatch(attbox.innerHTML,/data-delete-att/);
  });
}
(async()=>{await suite(false);await suite(true);console.log(`ALL PASS (${checks} checks)`)})().catch(e=>{console.error(e);process.exitCode=1});
