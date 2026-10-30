/* 댓글 전송 UI 회귀 시험. Node 표준 모듈과 작은 DOM 대역만 사용하며 HTTP는 호출하지 않는다. */
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),crypto=require("node:crypto");
const path=require("node:path"),root=path.resolve(__dirname,"..");
let checks=0;
function check(name,fn){fn();checks++;console.log("PASS",name)}
function button(kind=""){return {disabled:false,textContent:"",dataset:{},matches:s=>!!kind&&s.includes(kind),classList:{toggle(){}}}}
function composer(id){
  const refs={".cmta":{value:"",events:{},addEventListener(type,fn){this.events[type]=fn}},".cmmsg":{},".stsel":{value:"",options:[{}],insertAdjacentHTML(){}},
    "[data-send]":button("[data-send]"),"[data-add-file]":button("[data-add-file]"),"[data-file-input]":{files:[],value:"",disabled:false,matches:()=>true,click(){}},
    "[data-fence]":button(),"[data-fromac]":button()};
  const box={html:"",buttons:[],set innerHTML(html){this.html=html;this.buttons=[...html.matchAll(/data-remove-file="([^"]+)"/g)].map(m=>({...button(),dataset:{removeFile:m[1]}}))},get innerHTML(){return this.html},querySelectorAll(){return this.buttons}};
  refs[".cmfiles"]=box;
  const recovery={html:"",buttons:[],set innerHTML(html){this.html=html;this.buttons=[...html.matchAll(/data-recover="([^"]+)"/g)].map(m=>({...button(),dataset:{recover:m[1]}}))},get innerHTML(){return this.html},querySelectorAll(){return this.buttons}};
  refs[".cmrecovery"]=recovery;
  const editable={dataset:{},editable:"plaintext-only",getAttribute(){return this.editable},setAttribute(k,v){this.editable=v}};
  return {id,refs,editable,querySelector:s=>refs[s]||null,querySelectorAll(s){
    if(s==="button,input,select,textarea")return [refs["[data-send]"],refs["[data-add-file]"],refs["[data-file-input]"],...(refs[".wsel"]?[refs[".wsel"]]:[]),...box.buttons,...recovery.buttons];
    if(s==="[contenteditable]")return [editable];
    return [];
  }};
}
async function suite(v2){
console.log(v2?"Design: v2":"Design: classic");
const comps=[composer(93599),composer(93599),composer(200)],storage=new Map(),sent=[],notices=[];
if(v2)comps.forEach(c=>c.refs[".wsel"]={value:"",disabled:false,matches:s=>s.includes(".wsel")});
const n={issue_id:93599,updated_on:"2026-10-06T00:00:00Z",journals:[]};
const context=vm.createContext({crypto,console,setTimeout,clearTimeout,innerWidth:1000,innerHeight:800,
  document:{activeElement:null,addEventListener(){},querySelectorAll:s=>comps.filter(c=>s===".cmp"||s.includes(`data-issue="${c.id}"`))},
  window:{addEventListener(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  FormData:class{constructor(){this.parts=[]}append(...args){this.parts.push(args)}},
  cfg:{meId:7,meName:"tester",write:{allow:[],test:false,statuses:{dev:11,confirm:15,done:5},uploads:{max_file:10,max_total:15,max_count:2}}},S:{write_ack_first:"1"},all:[n],cur:93599,view:"note",n,
  V2:()=>v2,esc:s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])),kb:s=>s+" B",
  edGet:el=>el.value,edInit:(el,v)=>{el.value=v},toast:s=>notices.push(s),cmdWireComposer(){},
  prep(){},buildTokens(){},markSeen(){},renderAll(){context.renders=(context.renders||0)+1},autoDeployProgress(){},invalidateAtt:id=>{context.invalidated=id},
  $:s=>s==="#center"?{scrollTop:0}:null,fetch:()=>{throw Error("Unexpected network call")},
  api:async()=>[],post:async()=>({ok:true}),
});
for(const file of ["write.js","common.js"])vm.runInContext(fs.readFileSync(path.join(root,"web/js",file),"utf8"),context,{filename:file});
vm.runInContext("updFab=()=>{};refreshToday=()=>{};wdlg=async()=>true",context);
const run=s=>vm.runInContext(s,context);
check('new composers default to HTML without a format prompt',()=>assert.equal(run('cmFormatOf(93599)'),'html'));
run('cmFormats.set(cmFormatKey(93599),"legacy")'); // 과거 요청/복구 호환 경로도 그대로 검증한다.
function transport(handler){context.api=async(url,options)=>{
  assert.equal(url,"/api/rm/write");const parts=options.body.parts,body=JSON.parse(parts.find(p=>p[0]==="data")[1]);
  sent.push({body,files:parts.filter(p=>p[0]==="files")});return handler(body);
};context.post=async(url,body)=>{assert.equal(url,"/api/rm/write");sent.push({body,files:[]});return handler(body)}}
async function main(){
  check("composer contains multiple file selector and attachment button",()=>{
    const html=run('composerHtml("inline",n)');assert.match(html,/type="file"[^>]+multiple/);assert.match(html,/＋ 파일 첨부/);
    if(v2)assert.match(html,/class="wsel"/);else assert.match(html,/data-w="dev"/);
  });
  run("wireComposer({querySelectorAll:()=>[]},n)");
  // 두 입력창의 실제 onchange/onClick 콜백을 연결한다.
  context.testRoot={querySelectorAll:()=>comps.slice(0,2)};
  run("wireComposer(testRoot,n)");await Promise.resolve();
  let keyboardSends=0;const originalWrite=context.doWrite;context.doWrite=()=>keyboardSends++;
  const keydown=comps[0].refs['.cmta'].events.keydown;
  keydown({key:'Enter',ctrlKey:true,isComposing:false,target:{tagName:'INPUT',closest:()=>({})},preventDefault(){throw Error('Image picker shortcut must be ignored')}});
  keydown({key:'Enter',ctrlKey:true,isComposing:true,target:{tagName:'DIV'},preventDefault(){throw Error('IME must be ignored')}});
  keydown({key:'Enter',ctrlKey:true,isComposing:false,keyCode:229,target:{tagName:'DIV'},preventDefault(){throw Error('IME code must be ignored')}});
  comps[0].refs['.cmta']._commentEditor={composing:true};
  keydown({key:'Enter',ctrlKey:true,isComposing:false,target:{tagName:'DIV'},preventDefault(){throw Error('Active composition must be ignored')}});delete comps[0].refs['.cmta']._commentEditor;
  check('image chooser and Korean composition cannot accidentally submit comment',()=>assert.equal(keyboardSends,0));
  keydown({key:'Enter',ctrlKey:true,isComposing:false,target:{tagName:'DIV',closest:()=>null},preventDefault(){}});assert.equal(keyboardSends,1);context.doWrite=originalWrite;
  if(v2){
    comps[0].refs[".wsel"].value="dev";await comps[0].refs[".wsel"].onchange();
    check("v2 preset selector synchronizes composer state",()=>{assert.equal(run("stageOf(93599).status_id"),11);assert.equal(comps[1].refs[".wsel"].value,"dev")});
    run("cmStage.delete(93599);syncComposers(n)");
  }
  comps[0].refs["[data-file-input]"].files=[{name:'<one>.txt',size:4},{name:'two.txt',size:6}];
  comps[0].refs["[data-file-input]"].onchange();
  check("file selection syncs both composers for the same issue",()=>{
    assert.equal(comps[0].refs[".cmfiles"].html,comps[1].refs[".cmfiles"].html);
    assert.match(comps[1].refs[".cmfiles"].html,/&lt;one&gt;[.]txt/);assert.match(comps[1].refs[".cmfiles"].html,/6 B/);
    assert.equal(run("filesOf(93599).length"),2);assert.equal(comps[2].refs[".cmfiles"].html,"");
  });
  check("file data is never stored in localStorage",()=>assert.equal(storage.size,0));
  comps[1].refs[".cmfiles"].buttons[0].onclick();
  check("remove from floating composer updates inline composer",()=>{
    assert.equal(run("filesOf(93599).length"),1);assert.doesNotMatch(comps[0].refs[".cmfiles"].html,/one/);
  });
  context.bigFile={name:"large.txt",size:20};run("cmAddFiles(n,[bigFile])");
  check("oversized selection is rejected without losing existing files",()=>assert.equal(run("filesOf(93599).length"),1));
  transport(async()=>{const err=new Error("synthetic failure");err.status=502;err.body={};throw err});
  run('setDraft(93599,"keep draft");stageOf(93599).status_id=5');
  assert.equal(await run("doWrite(n,{})"),false);
  const failedId=sent.at(-1).body.request_id;
  check("failed registration retains draft, files and selected state",()=>{
    assert.equal(run("draftOf(93599)"),"keep draft");assert.equal(run("filesOf(93599).length"),1);assert.equal(run("stageOf(93599).status_id"),5);
    assert.equal(comps[0].refs["[data-send]"].disabled,false);assert.equal(comps[0].editable.editable,"plaintext-only");
  });
  transport(async()=>({ok:true,verified:false,note:null}));assert.equal(await run("doWrite(n,{})"),true);
  check("normal success without identity verification clears shared draft and attachment state",()=>{
    assert.equal(sent.at(-1).body.request_id,failedId);assert.equal(run("filesOf(93599).length"),0);assert.equal(run("draftOf(93599)"),"");
    assert.equal(run("stageOf(93599).status_id"),undefined);assert.equal(context.invalidated,93599);
  });
  run('cmAddFiles(n,[{name:"only.txt",size:2}])');
  assert.equal(await run("doWrite(n,{})"),true);
  check("file-only registration submits multipart with empty notes",()=>{
    assert.equal(sent.at(-1).body.notes,"");assert.equal(sent.at(-1).files.length,1);
  });
  run('cmAddFiles(n,[{name:"conflict.txt",size:2}]);setDraft(93599,"conflict")');
  transport(async body=>{if(!body.force){const err=new Error("changed");err.status=409;err.code="changed";err.body={};throw err}return {ok:true}});
  assert.equal(await run("doWrite(n,{})"),true);
  check("409 confirmation keeps the same request ID and files",()=>{
    assert.equal(sent.at(-1).body.force,true);assert.equal(sent.at(-1).body.request_id,sent.at(-2).body.request_id);
    assert.equal(sent.at(-1).files[0][1],sent.at(-2).files[0][1]);
  });
  let complete;transport(()=>new Promise(resolve=>{complete=resolve}));
  run('cmAddFiles(n,[{name:"busy.txt",size:2}]);firstSend=doWrite(n,{})');
  const count=sent.length;
  assert.equal(await run("doWrite(n,{})"),false);
  comps[1].refs[".cmfiles"].buttons[0].onclick();
  check("double click is blocked and file selection is frozen in both composers",()=>{
    assert.equal(sent.length,count);assert.equal(run("filesOf(93599).length"),1);
    assert.equal(comps[0].refs["[data-send]"].disabled,true);assert.equal(comps[1].refs["[data-add-file]"].disabled,true);
    assert.equal(comps[2].refs["[data-send]"].disabled,false);assert.equal(comps[0].editable.editable,"false");
  });
  complete({ok:true});assert.equal(await context.firstSend,true);
  check("successful send restores editor controls",()=>assert.equal(comps[0].editable.editable,"plaintext-only"));
  run('cmAddFiles(n,[{name:"uncertain.txt",size:2}]);setDraft(93599,"uncertain")');
  transport(async body=>{const err=new Error("needs review");err.status=502;err.body={needs_review:true,request_id:body.request_id};throw err});
  assert.equal(await run("doWrite(n,{})"),false);
  const beforeRecovery=sent.length;
  check("uncertain result keeps files and renders recovery in both composers",()=>{
    assert.equal(run("filesOf(93599).length"),1);assert.equal(run("draftOf(93599)"),"uncertain");
    assert.match(comps[0].refs[".cmrecovery"].html,/data-recover="check"/);
    assert.equal(comps[0].refs[".cmrecovery"].html,comps[1].refs[".cmrecovery"].html);
  });
  assert.equal(await run("doWrite(n,{})"),false);
  check("uncertain result prevents another automatic write",()=>assert.equal(sent.length,beforeRecovery));
  context.post=async(url,data)=>{assert.equal(url,"/api/rm/write/recover");assert.equal(data.decision,"not_applied");return {retry_allowed:true}};
  assert.equal(await run('recoverComposer(n,"not_applied")'),true);
  check("manual non-application confirmation prepares but does not send a new request",()=>{
    assert.equal(sent.length,beforeRecovery);assert.equal(run("filesOf(93599).length"),1);assert.equal(run("draftOf(93599)"),"uncertain");assert.equal(run("cmRecovery.has(93599)"),false);
  });
  transport(async()=>({ok:true}));assert.equal(await run("doWrite(n,{})"),true);
  check("explicit send after recovery uses a fresh request ID",()=>assert.notEqual(sent.at(-1).body.request_id,sent.at(-2).body.request_id));
  run('cmAddFiles(n,[{name:"recovery.txt",size:2}]);setDraft(93599,"original");cmRecovery.set(93599,cmRequestId(93599,"original",cmFields(93599),filesOf(93599)))');
  const renderCount=context.renders;
  context.post=async()=>({ok:true,verified:true,note:{issue_id:93599,updated_on:"recovered-time"}});
  assert.equal(await run('recoverComposer(n,"check")'),true);
  check("verified recovery clears original draft and refreshes attachment display",()=>{
    assert.equal(run("filesOf(93599).length"),0);assert.equal(run("draftOf(93599)"),"");
    assert.equal(context.invalidated,93599);assert.equal(n.updated_on,"recovered-time");assert.ok(context.renders>renderCount);
  });
  run('cmAddFiles(n,[{name:"edited.txt",size:2}]);setDraft(93599,"original");cmRecovery.set(93599,cmRequestId(93599,"original",cmFields(93599),filesOf(93599)));setDraft(93599,"new draft")');
  context.post=async()=>({ok:true,manual:true});
  assert.equal(await run('recoverComposer(n,"applied")'),true);
  check("manual confirmation of an older request preserves newly edited draft and files",()=>{
    assert.equal(run("draftOf(93599)"),"new draft");assert.equal(run("filesOf(93599).length"),1);assert.equal(run("cmRecovery.has(93599)"),false);
  });
  run('clearComposer(93599);cmSetFormat(93599,"html");setDraft(93599,"<p><b>서식 댓글</b></p>");cmAddFiles(n,[{name:"rich.txt",size:2}]);stageOf(93599).status_id=5');
  transport(async body=>{const err=new Error("uncertain rich result");err.status=502;err.body={needs_review:true,request_id:body.request_id};throw err});
  assert.equal(await run("doWrite(n,{})"),false);
  check("formatted comment preserves file and status payload and failed draft",()=>{
    assert.equal(sent.at(-1).body.notes_format,"html");assert.equal(sent.at(-1).body.notes,"<p><b>서식 댓글</b></p>");assert.equal(sent.at(-1).body.status_id,5);assert.equal(sent.at(-1).files.length,1);assert.equal(run("filesOf(93599).length"),1);
  });
  context.post=async()=>({ok:true,verified:true});
  assert.equal(await run('recoverComposer(n,"check")'),true);
  check("formatted uncertain recovery clears matching shared draft and files",()=>{
    assert.equal(run("draftOf(93599)"),"");assert.equal(run("filesOf(93599).length"),0);assert.equal(run("cmRecovery.has(93599)"),false);
  });
  run('setDraft(93599,"<p>이미지 편집 중</p>");cmAddFiles(n,[{name:"keep.txt",size:2}]);stageOf(93599).status_id=5;imageState=cmImageState(93599);imageState.file={name:"new.png",size:8}');
  context.imageFile=run('imageState.file');
  transport(async()=>{const err=Error('upload rejected');err.status=502;err.body={code:'upload_failed'};throw err});
  assert.equal(await run('uploadEditorImage(n,imageState)'),false);const imageId=sent.at(-1).body.request_id;
  check("image upload reuses multipart and sends file only without consuming composer fields",()=>{
    assert.equal(sent.at(-1).body.notes,"");assert.equal(sent.at(-1).body.status_id,undefined);assert.equal(sent.at(-1).body.notes_format,undefined);assert.equal(sent.at(-1).files.length,1);assert.equal(run('imageState.file'),context.imageFile);assert.equal(run('draftOf(93599)'),'<p>이미지 편집 중</p>');assert.equal(run('filesOf(93599).length'),1);assert.equal(run('stageOf(93599).status_id'),5);assert.notEqual(run('imageState.pending'),true);
  });
  let imageDone;transport(()=>new Promise(resolve=>imageDone=resolve));const imageSend=run('uploadEditorImage(n,imageState)');const imageCount=sent.length;
  assert.equal(await run('uploadEditorImage(n,imageState)'),false);assert.equal(await run('doWrite(n,{})'),false);
  check("image upload and regular comment share issue busy guard",()=>assert.equal(sent.length,imageCount));
  imageDone({ok:true,note:null});assert.equal(await imageSend,true);
  check("confirmed image upload keeps comment and files and requests manual attachment ID selection",()=>{assert.equal(sent.at(-1).body.request_id,imageId);assert.equal(run('imageState.file'),undefined);assert.equal(run('draftOf(93599)'),'<p>이미지 편집 중</p>');assert.equal(run('filesOf(93599).length'),1);assert.match(run('imageState.message'),/ID/)});
  run('imageState.file=imageFile');transport(async body=>{const err=Error('unknown image outcome');err.status=502;err.body={needs_review:true,request_id:body.request_id};throw err});assert.equal(await run('uploadEditorImage(n,imageState)'),false);
  const unresolvedId=run('imageState.requestId'),unknownCount=sent.length;
  assert.equal(await run('uploadEditorImage(n,imageState)'),false);assert.equal(await run('doWrite(n,{})'),false);
  check("uncertain image blocks retransmission and retains file and HTML draft",()=>{assert.equal(sent.length,unknownCount);assert.equal(run('imageState.pending'),true);assert.equal(run('imageState.file'),context.imageFile);assert.equal(run('draftOf(93599)'),'<p>이미지 편집 중</p>')});
  const recoveries=[];context.post=async(url,body)=>{recoveries.push({url,body});return {retry_allowed:true}};
  assert.equal(await run('uploadEditorImage(n,imageState,"not_applied")'),false);
  check("explicit image recovery prepares a new request without sending binary",()=>{assert.equal(recoveries.length,1);assert.equal(recoveries[0].url,'/api/rm/write/recover');assert.equal(recoveries[0].body.request_id,unresolvedId);assert.equal(sent.length,unknownCount);assert.equal(run('imageState.pending'),false);assert.equal(run('imageState.file'),context.imageFile)});
  transport(async()=>({ok:true}));assert.equal(await run('uploadEditorImage(n,imageState)'),true);
  check("explicit retry after image recovery uses a fresh request ID",()=>assert.notEqual(sent.at(-1).body.request_id,unresolvedId));
  run('imageState.file=imageFile');transport(async()=>{throw Error('local response lost')});assert.equal(await run('uploadEditorImage(n,imageState)'),false);
  check("local response loss is uncertain rather than retried",()=>{assert.equal(run('imageState.pending'),true);assert.equal(run('imageState.file'),context.imageFile)});
  context.post=async()=>({ok:true,manual:true});assert.equal(await run('uploadEditorImage(n,imageState,"applied")'),true);
  check("confirmed old image does not clear unrelated comment files or status",()=>{assert.equal(run('imageState.file'),undefined);assert.equal(run('filesOf(93599).length'),1);assert.equal(run('stageOf(93599).status_id'),5)});
  run('imageState.file=imageFile');transport(async()=>({ok:true,note:{...n}}));context.prep=()=>{throw Error('UI refresh failed')};assert.equal(await run('uploadEditorImage(n,imageState)'),true);context.prep=()=>{};
  check("UI refresh error after confirmed upload cannot cause duplicate image",()=>{assert.equal(run('imageState.file'),undefined);assert.equal(run('imageState.pending'),false);assert.match(run('imageState.message'),/완료/)});
  run('imageState.file=imageFile');transport(async()=>{const err=Error('previous request needs review');err.status=409;err.body={needs_review:true,request_id:'prior-durable-request'};throw err});assert.equal(await run('uploadEditorImage(n,imageState)'),false);
  check("prior durable request is recovered separately and new image is retained",()=>{assert.equal(run('cmRecovery.get(93599)'),'prior-durable-request');assert.equal(run('imageState.file'),context.imageFile);assert.equal(run('imageState.pending'),false)});
  run('cfg.write.test=true;cfg.write.allow=[200];syncComposers(n)');
  const unauthorizedCount=sent.length;assert.equal(await run('uploadEditorImage(n,imageState)'),false);
  check("image uploads respect existing allow list",()=>assert.equal(sent.length,unauthorizedCount));
  check("authorization controls remain disabled in this design",()=>{
    assert.equal(comps[0].refs["[data-send]"].disabled,true);assert.equal(comps[1].refs["[data-add-file]"].disabled,true);
    if(v2)assert.equal(comps[0].refs[".wsel"].disabled,true);
  });
}
await main();
}
(async()=>{await suite(false);await suite(true);console.log(`ALL PASS (${checks} checks)`)} )().catch(err=>{console.error(err);process.exitCode=1});
