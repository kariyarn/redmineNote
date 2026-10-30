/* 실제 JS 편집기/전송 코드 → 격리 앱 HTTP → 기존 fake_rm_write.py.
   DOM/선택 영역은 대역이다. 네이티브 브라우저나 픽셀 레이아웃 검사를 대신하지 않는다. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const http=require('node:http'),net=require('node:net'),dns=require('node:dns'),crypto=require('node:crypto');
const {File}=require('node:buffer'),{document,Element,escape}=require('./dom_stub');
const root=path.resolve(__dirname,'..'),[BASE,FAKE]=process.argv.slice(2),ports=new Set();
assert.equal(process.env.RN_TEST_ISOLATED,'1','Run through isolated Python harness');
for(const value of [BASE,FAKE]){const u=new URL(value);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.protocol,'http:');ports.add(Number(u.port))}
const connect=net.Socket.prototype.connect,lookup=dns.lookup;
net.Socket.prototype.connect=function(...args){let opt=Array.isArray(args[0])?args[0][0]:args[0];if(typeof opt==='number')opt={port:opt,host:args[1]};if(opt?.host!=='127.0.0.1'||!ports.has(Number(opt.port)))throw Error('TEST BLOCKED: non-loopback socket');return connect.apply(this,args)};
dns.lookup=function(host,...args){if(host!=='127.0.0.1')throw Error('TEST BLOCKED: non-loopback DNS');return lookup.call(this,host,...args)};
assert.throws(()=>new net.Socket().connect({host:'192.0.2.1',port:443}),/TEST BLOCKED/);
assert.throws(()=>dns.lookup('outside.invalid',()=>{}),/TEST BLOCKED/);
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS',name)};
async function request(url,options={}){
  const u=new URL(url,BASE);assert.equal(u.hostname,'127.0.0.1');assert.ok(ports.has(Number(u.port)));assert.equal(u.protocol,'http:');
  const r=await new Promise((resolve,reject)=>{const q=http.request(u,{method:options.method||'GET',headers:{Origin:BASE,...options.headers}},r=>{const chunks=[];r.on('data',x=>chunks.push(x));r.on('end',()=>resolve({status:r.statusCode,headers:r.headers,bytes:Buffer.concat(chunks)}))});q.on('error',reject);q.setTimeout(10000,()=>q.destroy(Error('timeout')));q.end(options.body)});
  if(options.binary)return r;
  const value=JSON.parse(r.bytes.toString()||'{}');if(r.status>=400){const e=Error(value.error||String(r.status));Object.assign(e,{status:r.status,body:value,code:value.code});throw e}return value;
}
const post=(url,body)=>request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
async function api(url,options={}){
  if(!options.body)return request(url,options);
  const boundary='flow-'+crypto.randomUUID(),chunks=[];
  for(const [name,value]of options.body.entries()){
    if(typeof value==='string')chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
    else chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${value.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`),Buffer.from(await value.arrayBuffer()),Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));return request(url,{method:'POST',headers:{'Content-Type':'multipart/form-data; boundary='+boundary},body:Buffer.concat(chunks)});
}
async function suite(design){
  const cfg=await request('/api/config');assert.equal(cfg.url,FAKE);assert.equal(path.resolve(cfg.dataDir),path.resolve(process.env.REDMINE_NOTES_HOME));
  await post('/api/fetch',{ids:[93599,200]});await post(FAKE+'/__test/control',{upload_token_only:true});
  const n=(await request('/api/notes')).find(n=>n.issue_id===93599),body=new Element('div'),cmp=new Element('div'),editor=new Element('div'),attbox=new Element('div'),center=new Element('div');
  cmp.className='cmp';cmp.dataset.issue=n.issue_id;editor.className='cmta';cmp.appendChild(editor);body.appendChild(cmp);center.scrollTop=0;
  document.addEventListener=()=>{};document.querySelector=()=>null;document.querySelectorAll=selector=>selector.startsWith('[data-jeditor')?[]:body.querySelectorAll(selector);
  let liveEditor;document.execCommand=(key,_,html)=>{if(key==='insertHTML')liveEditor.visual.innerHTML+=html;return true};
  const selection={rangeCount:0,anchorNode:null,setBaseAndExtent(a,ao,f,fo){Object.assign(this,{anchorNode:a,anchorOffset:ao,focusNode:f,focusOffset:fo})}};
  const notices=[],context=vm.createContext({document,URL,Event:class{constructor(type,o={}){this.type=type;Object.assign(this,o)}},crypto,FormData,console,
    location:{origin:BASE},window:{getSelection:()=>selection,addEventListener(){}},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    cfg,n,all:[n],cur:n.issue_id,view:'note',S:{},api,post,fetch(){throw Error('Use guarded local HTTP only')},
    V2:()=>design==='v2',esc:escape,kb:x=>x+' B',lDay:x=>x||'',dTime:x=>x||'',avatar:()=>'',fmt:d=>d.toISOString().slice(0,10),
    setTimeout:()=>0,clearTimeout(){},prep(){},buildTokens(){},markSeen(){},renderAll(){},autoDeployProgress(){},toast:s=>notices.push(s),askC:async()=>true,
    $:s=>s==='#attwrap'?attbox:s==='#center'?center:null,cmdWireComposer(){}});
  const run=s=>vm.runInContext(s,context);
  for(const file of ['comment_editor.js','note.js','write.js','common.js'])vm.runInContext(fs.readFileSync(path.join(root,'web/js',file),'utf8'),context,{filename:file});
  run('refreshToday=()=>{};updFab=()=>{};wdlg=async()=>true');context.editor=editor;
  context.baseline='<p>이미지 흐름 확인 · 앞 문단</p><p>다른 문단<br>같은 문단의 다음 줄</p>\n<p><img data-rich-file-id="42" src="/system/rich/rich_files/001/original/my%20image.png"></p>\n<p>기존 이미지 뒤</p><table><tr><td>표와 이미지</td></tr></table>';
  run('ce=new CommentEditor(editor,{value:baseline,issueId:n.issue_id,...cmImageOptions(n),onChange:v=>setDraft(n.issue_id,v)});setDraft(n.issue_id,ce.getRaw())');liveEditor=run('ce');
  check(design+' HTML default keeps existing CKEditor source without a menu',()=>{assert.equal(run('ce.format'),'html');assert.equal(run('cmFormatOf(n.issue_id)'),'html');assert.equal(run('ce.getRaw()'),context.baseline)});
  // Simulate a native first-p unwrap before exercising the existing real HTTP image/save/edit flow.
  const p=run('ce.visual.querySelector("p")'),text=p.firstChild;selection.setBaseAndExtent(text,0,text,0);
  run('ce.visual.dispatchEvent({type:"beforeinput",inputType:"deleteContentBackward"})');p.before(text);p.remove();
  run('ce.visual.dispatchEvent({type:"input",inputType:"deleteContentBackward"})');
  check(design+' paragraph repair preserves image table source and draft before HTTP save',()=>{assert.equal(run('ce.getRaw()'),context.baseline);assert.equal(run('draftOf(n.issue_id)'),context.baseline);assert.equal(selection.anchorNode,text);assert.equal(text.parentElement.localName,'p')});
  const png=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63f8cfc0f01f00050001ff89993d1d0000000049454e44ae426082','hex');
  const file=new File([png],design+'-'+crypto.randomUUID()+'.png',{type:'image/png'});context.file=file;
  const counts=async()=>[(await request(FAKE+'/__uploads')).length,(await request(FAKE+'/__puts')).length];
  const before=await counts();await run('ce.command("image")');run('ce.images.querySelector(".ceimagefile").files=[file]');await run('ce.images.querySelector(".ceimagefile").onchange()');
  check(design+' selection previews without upload',()=>{assert.equal(run('ce.getRaw()'),context.baseline);assert.match(run('ce.images.querySelector(".ceimagephase").textContent'),/서버 미등록/);assert.match(run('ce.images.querySelector(".ceimagepreview").innerHTML'),/blob:/)});assert.deepEqual(await counts(),before);
  const upload=run('ce.images.querySelector(".ceimageupload").onclick()');await run('ce.uploadImage()');await upload;
  const list=await request('/api/rm/attachments?issue_id='+n.issue_id),a=list.find(a=>a.filename===file.name);assert.ok(a);context.attachment=a;
  check(design+' explicit upload creates ID and actual content_url once',()=>{assert.ok(Number.isInteger(a.id)&&a.id>0);assert.match(a.content_url,new RegExp('/attachments/download/'+a.id+'/'));assert.equal(run('cmImageState(n.issue_id).file'),undefined)});
  assert.deepEqual(await counts(),[before[0]+1,before[1]+1]);
  check(design+' upload automatically refreshes editor choices and main attachment box',()=>{assert.ok(run('ce.images.querySelector(`[data-image-id="${attachment.id}"]`)'));assert.match(run('ce.images.querySelector(".ceimageliststatus").textContent'),/등록된 이미지/);assert.match(run('ce.images.querySelector(".ceimagephase").textContent'),/등록 완료/)});
  await run('loadAtt(n)');assert.match(attbox.innerHTML,new RegExp('data-delete-att="'+a.id+'"'));
  run('ce.images.querySelector(`[data-image-id="${attachment.id}"]`).onclick()');
  run('ce.visual.innerHTML+="<p>새 이미지 뒤에도 한국어를 계속 작성</p>";ce.changed(ce.visual)');
  const raw=run('ce.getRaw()');check(design+' chosen registered image coexists with CKEditor image table and following text',()=>{assert.ok(raw.includes(a.content_url));assert.equal(run('ce.visual.querySelectorAll("img").length'),2);assert.match(raw,/<table/);assert.match(raw,/뒤에도 한국어/);assert.doesNotMatch(raw,/blob:|\/api\/rm\//)});
  await run('ce.command("source")');await run('ce.command("source")');check(design+' source visual round trip keeps image exact',()=>assert.equal(run('ce.getRaw()'),raw));
  run('ce.updatePath(ce.visual.querySelector("p").firstChild)');assert.ok(run('ce.visual.querySelector("[data-ce-current]")'));
  const beforeSave=await counts();assert.equal(await run('doWrite(n,{})'),true);assert.deepEqual(await counts(),[beforeSave[0],beforeSave[1]+1]);
  const saved=(await request('/api/notes')).find(x=>x.issue_id===n.issue_id).journals.find(j=>(j.raw||j.notes||'').includes(a.content_url));assert.ok(saved);context.saved=saved;
  check(design+' explicit comment save preserves p br and image without UI markers',()=>{assert.equal(saved.raw||saved.notes,raw);assert.doesNotMatch(saved.raw||saved.notes,/data-ce-current|cepath/);assert.match(saved.raw||saved.notes,/<p>다른 문단<br>같은 문단의 다음 줄<\/p>/);assert.equal(run('draftOf(n.issue_id)'),"")});
  const html=run('cmBody(saved)');const display=new Element('div');display.innerHTML=html;const img=display.querySelectorAll('img').find(img=>img.dataset.aid===String(a.id));assert.ok(img);check(design+' saved history renders both images using local read-only proxies',()=>{assert.equal(display.querySelectorAll('img').length,2);assert.match(img.getAttribute('src'),new RegExp('^/api/rm/attachment\\?id='+a.id));assert.equal(img.getAttribute('data-ce-src'),a.content_url)});
  const response=await request(img.getAttribute('src'),{binary:true});assert.equal(response.status,200);assert.equal(response.headers['content-type'],'image/png');assert.deepEqual(response.bytes,png);
  check(design+' rendered image downloads exact PNG bytes',()=>true);
  const journal=await request('/api/rm/journal?issue_id='+n.issue_id+'&journal_id='+saved.id),notes=raw+'<p>기존 댓글 수정</p>';
  const countBefore=(await request('/api/notes')).find(x=>x.issue_id===n.issue_id).journals.length;
  await post('/api/rm/journal/edit',{issue_id:n.issue_id,target_id:saved.id,request_id:crypto.randomUUID(),version:journal.version,notes,notes_format:'html'});
  const after=(await request('/api/notes')).find(x=>x.issue_id===n.issue_id);
  check(design+' editing keeps both image addresses and existing journal count',()=>{assert.equal(after.journals.length,countBefore);assert.equal(after.journals.find(j=>j.id===saved.id).raw,notes)});
}
(async()=>{await suite('classic');await suite('v2');console.log(`ALL PASS (${checks} flow checks; actual local HTTP, DOM doubles)`)})().catch(e=>{console.error(e);process.exitCode=1});
