/* Read-only attachment/comment UI with actual scripts and a DOM double; no HTTP. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {Element}=require('./dom_stub');
const root=path.resolve(__dirname,'..'),escape=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let checks=0;
function check(name,fn){fn();checks++;console.log('PASS',name)}
async function suite(v2){
  const events={},box={innerHTML:''},card={style:{}},caption={};
  const n={issue_id:93599,updated_on:'fixture',journals:[{id:1,user:{id:7,name:'me'},raw:'own comment'},{id:2,user:{id:8,name:'other'},raw:'other comment'},{id:3,raw:'missing user'}],changes:[]};
  const attachments=[{id:11,filename:'<mine>.txt',filesize:3,author:'me'},{id:22,filename:'other.txt',filesize:4,author:'other'},{id:33,filename:'image.png',filesize:5,author:'me',content_type:'image/png'}];
  const context=vm.createContext({console,URL,setTimeout:()=>0,clearTimeout(){},n,cur:n.issue_id,view:'note',
    document:{querySelector:()=>null,querySelectorAll:()=>[],addEventListener(k,f){(events[k]??=[]).push(f)}},window:{addEventListener(){}},
    cfg:{url:'http://127.0.0.1:1',meId:7,meName:'me'},V2:()=>v2,esc:escape,commentSafeDisplay:escape,kb:x=>x+' B',lDay:x=>x||'',dTime:x=>x||'',avatar:()=>'*',nsCounts(){},
    $:s=>s==='#attwrap'?box:s==='#sec-att'?card:s==='#attsm'?caption:s==='#center'?{addEventListener(){}}:null,
    api:async url=>{assert.equal(url,'/api/rm/attachments?issue_id=93599');return attachments},fetch(){throw Error('Network forbidden')}});
  const run=s=>vm.runInContext(s,context);
  vm.runInContext(fs.readFileSync(path.join(root,'web/js/note.js'),'utf8'),context,{filename:'note.js'});
  await run('loadAtt(n)');
  check('attachment caption and visible card',()=>{assert.equal(card.style.display,'');assert.match(caption.textContent,/3/)});
  const dom=new Element('div');dom.innerHTML=box.innerHTML;
  check('all files are full-box download anchors without action buttons',()=>{
    assert.equal(dom.querySelectorAll('.attitem').length,3);assert.equal(dom.querySelectorAll('button').length,0);
    for(const item of dom.querySelectorAll('.attitem')){const row=item.querySelector('.attrow');assert.equal(row.localName,'a');assert.equal(row.parentElement,item);assert.ok(row.hasAttribute('download'));assert.match(row.getAttribute('href'),/^\/api\/rm\/attachment\?id=/)}
    assert.match(box.innerHTML,/&lt;mine&gt;/);
  });
  check('all historical comments are readable without edit controls',()=>{const html=run('cmHist(n)');for(const raw of ['own comment','other comment','missing user'])assert.ok(html.includes(raw));assert.doesNotMatch(html,/<button|data-jedit|data-jeditor/)});
  check('whole-box hover and theme styles remain',()=>{const css=fs.readFileSync(path.join(root,'web/css/note.css'),'utf8');assert.match(css,/\.attcard \.attitem\{[^}]*grid-template-columns:minmax\(0,1fr\)[^}]*width:100%/);assert.match(css,/\.attcard \.attrow:hover\{border-color:var\(--accent\);background:var\(--accent-soft\)/);assert.doesNotMatch(css,/\.attmain:hover[^}]*underline|attdelete/)});
  let expanded=null,prevented=false;context.viewer=url=>{expanded=url};run('openLbox=url=>viewer(url)');
  const click=events.click.find(fn=>String(fn).includes('img.rimg')),key=events.keydown.find(fn=>String(fn).includes('a.attrow.img'));
  click({target:dom.querySelector('img.rimg'),preventDefault(){prevented=true},stopPropagation(){}});
  check('thumbnail enlarges instead of downloading',()=>{assert.match(expanded,/id=33/);assert.ok(prevented)});
  expanded=null;key({target:dom.querySelector('.img'),key:' ',preventDefault(){},stopPropagation(){}});
  check('image box keyboard Space enlarges',()=>assert.match(expanded,/id=33/));
  const visual=new Element('div');visual.className='cevisual';const image=new Element('img');image.className='rimg';image.dataset.full='/api/rm/attachment?id=33';visual.appendChild(image);expanded=null;
  click({target:image,preventDefault(){throw Error('Editor image must stay editable')},stopPropagation(){}});
  check('new comment image selection does not open history viewer',()=>assert.equal(expanded,null));
  const failed=new Element('img');failed.className='rimg';failed.dataset.full='/api/rm/img?p=fixture';context.api=async()=>{const e=Error('fixture permission failure');e.status=403;throw e};await events.error[0]({target:failed});
  check('image load failure retains diagnostic reason',()=>{assert.ok(failed.classList.contains('bad'));assert.match(failed.alt,/fixture permission failure/)});
}
(async()=>{await suite(false);await suite(true);console.log(`${checks} checks passed`)})().catch(e=>{console.error(e);process.exitCode=1});
