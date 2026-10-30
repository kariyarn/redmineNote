/* 댓글 전용 오프라인 편집기. 프로젝트 MIT 라이선스. 외부 코드/CDN/패키지 없음.
   서버 형식은 자동 추측하지 않는다. 원문은 수정 전까지 그대로 유지한다. */
const CommentCodec=(()=>{
  const tags=new Set("p div span br strong b em i u s strike del h1 h2 h3 h4 h5 h6 ul ol li blockquote a table thead tbody tfoot tr th td caption colgroup col pre code img hr font sup sub".split(" "));
  const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const base=()=>typeof cfg!=="undefined"?cfg.url:location.origin;
  function imagePath(value){
    try{
      let decoded=String(value||"").trim();for(let i=0;i<3;i++){decoded=decodeURIComponent(decoded);if(/[\x00-\x1f\x7f\\]/.test(decoded)||decoded.includes("..")||decoded.startsWith("//"))return null}
      const b=new URL(base()||location.origin),u=new URL(value,b);if(u.origin!==b.origin||u.username||u.password||!["http:","https:"].includes(u.protocol))return null;
      let p=u.pathname,prefix=b.pathname.replace(/\/$/,"");if(prefix&&p.startsWith(prefix+"/"))p=p.slice(prefix.length);
      if(!/^\/(?:system\/[^?#]+|attachments\/(?:download\/|thumbnail\/)?[0-9]+(?:\/[^?#]+)?|rich\/files\/[0-9]+\/[^?#]+)$/.test(decodeURIComponent(p)))return null;
      for(const [k,v]of u.searchParams)if(!["size","width","height","t"].includes(k)||!/^\d{1,13}(?:x\d{1,5})?$/.test(v))return null;
      return p+u.search;
    }catch{return null}
  }
  function url(value,image=false){
    if(image)return imagePath(value)?String(value).trim():null;
    value=String(value||"").trim();let decoded;try{decoded=decodeURIComponent(value)}catch{return null}
    if(!value||/[\x00-\x1f\x7f\\]/.test(decoded)||decoded.startsWith("//"))return null;
    try{
      const b=new URL(base()||location.origin),u=new URL(value,b);
      if(u.username||u.password||!["http:","https:","mailto:"].includes(u.protocol))return null;
      return value;
    }catch{return null}
  }
  function imageProxy(value){
    const path=imagePath(value);if(!path)return null;
    const p=path.split("?")[0];
    const m=/^\/attachments\/(?:download\/)?([0-9]+)\/(.+)$/.exec(p);
    return m&&!path.includes("?")?`/api/rm/attachment?id=${m[1]}&name=${encodeURIComponent(decodeURIComponent(m[2]))}`:"/api/rm/img?p="+encodeURIComponent(path);
  }
  function attachmentURL(a){
    if(!a||!Number.isSafeInteger(a.id)||a.id<=0||!url(a.content_url,true))return null;
    try{const u=new URL(a.content_url,base()),b=new URL(base()),prefix=b.pathname.replace(/\/$/,"");let p=decodeURIComponent(u.pathname);if(prefix&&p.startsWith(prefix+"/"))p=p.slice(prefix.length);
      return !u.search&&!u.hash&&new RegExp("^/attachments/(?:download/)?"+a.id+"/[^/]+$").test(p)?u.href:null;
    }catch{return null}
  }
  async function rasterFile(file,max=20*1024*1024){
    if(!file||!file.size||file.size>max||!/^.+\.(png|jpe?g|gif|webp)$/i.test(file.name)||/[\x00-\x1f\x7f/\\]/.test(file.name))throw Error("PNG/JPG/GIF/WebP 이미지만 선택하세요 (파일당 최대 "+Math.floor(max/1024/1024)+"MB)");
    const b=new Uint8Array(await file.slice(0,16).arrayBuffer()),ext=file.name.toLowerCase().split(".").at(-1),starts=xs=>xs.every((v,i)=>b[i]===v);
    const mime=ext==="png"&&starts([137,80,78,71,13,10,26,10])?"image/png":["jpg","jpeg"].includes(ext)&&starts([255,216,255])?"image/jpeg":ext==="gif"&&["GIF87a","GIF89a"].includes(String.fromCharCode(...b.slice(0,6)))?"image/gif":ext==="webp"&&String.fromCharCode(...b.slice(0,4))==="RIFF"&&String.fromCharCode(...b.slice(8,12))==="WEBP"?"image/webp":null;
    if(!mime)throw Error("확장자와 이미지 파일 서명이 맞지 않아요");return mime;
  }
  function style(value){
    const out=[];
    for(const part of String(value||"").split(";")){
      if(!part.trim())continue;const i=part.indexOf(":"),key=part.slice(0,i).trim().toLowerCase(),v=part.slice(i+1).trim().toLowerCase();let ok=false;
      if(i<0)return null;
      if(["color","background-color"].includes(key))ok=/^(?:#[0-9a-f]{3}(?:[0-9a-f]{3})?|rgba?\([0-9., %]+\)|black|white|red|blue|green|transparent)$/.test(v);
      else if(key==="font-size")ok=/^(?:(?:[1-6]?\d|7[0-2])px|(?:[89]|[12]\d|30)pt|(?:[5-9]\d|[12]\d\d|300)%|small|medium|large)$/.test(v);
      else if(key==="text-align")ok=["left","center","right","justify"].includes(v);
      else if(key==="margin-left")ok=/^(?:0|[1-9][0-9]?|1[0-5][0-9]|160)px$/.test(v);
      else if(key==="font-weight")ok=["normal","bold","400","700"].includes(v);
      else if(key==="font-style")ok=["normal","italic"].includes(v);
      else if(key==="text-decoration")ok=["none","underline","line-through","underline line-through"].includes(v);
      else if(key==="font-family")ok=/^[a-z0-9가-힣 ,"'-]{1,100}$/.test(v);
      else if(key==="line-height")ok=/^(?:normal|1(?:\.\d+)?|2(?:\.[0-5])?)$/.test(v);
      else if(["width","height","max-width"].includes(key))ok=v==="auto"||/^(?:[1-9]\d?|100)%$/.test(v)||(/^\d{1,4}px$/.test(v)&&parseInt(v)<=4096);
      else if(/^(?:margin|padding)(?:-(?:left|right|top|bottom))?$/.test(key))ok=v.split(/\s+/).length<=4&&v.split(/\s+/).every(x=>/^(?:0|[0-5]?\dpx|6[0-4]px|[0-2](?:\.\d)?em)$/.test(x));
      if(!ok)return null;out.push(key+":"+v);
    }
    return out.join(";");
  }
  function clean(html,{preview=false,internal=false}={}){
    const template=document.createElement("template");template.innerHTML=String(html||"");let changed=false;
    const container=document.createElement("div");
    const walk=(node,parent)=>{
      if(node.nodeType===3){parent.appendChild(document.createTextNode(node.data));return}
      if(node.nodeType!==1){changed=true;return}
      let tag=node.localName.toLowerCase();
      if(!tags.has(tag)){changed=true;if(!["script","style","iframe","object","embed","svg","math","form","input","button","link","meta","base"].includes(tag))node.childNodes.forEach(n=>walk(n,parent));return}
      const el=document.createElement(tag);
      for(const a of node.attributes){
        const k=a.name,v=a.value;
        if(internal&&["data-ce-src","data-ce-current"].includes(k))continue;
        if(k==="src"&&tag==="img"){
          const original=internal&&node.getAttribute("data-ce-src")||v;
          if(url(original,true)){el.setAttribute("src",preview?imageProxy(original):original);if(preview)el.dataset.ceSrc=original}else changed=true;
        }else if(k==="href"&&tag==="a"&&url(v)){el.setAttribute(k,v)}
        else if(k==="style"&&style(v)!==null)el.setAttribute(k,style(v));
        else if(["title","alt"].includes(k))el.setAttribute(k,v);
        else if(k==="data-rich-file-id"&&tag==="img"&&/^\d{1,12}$/.test(v))el.setAttribute(k,v);
        else if(tag==="font"&&k==="color"&&style("color:"+v)!==null)el.setAttribute(k,v);
        else if(tag==="font"&&k==="face"&&style("font-family:"+v)!==null)el.setAttribute(k,v);
        else if(tag==="font"&&k==="size"&&/^[1-7]$/.test(v))el.setAttribute(k,v);
        else if(k==="class"&&/^[A-Za-z0-9_ -]{0,200}$/.test(v))el.setAttribute(k,v);
        else if(["colspan","rowspan","width","height","start"].includes(k)&&/^[1-9][0-9]{0,3}$/.test(v))el.setAttribute(k,v);
        else changed=true;
      }
      if(tag==="img"&&!el.hasAttribute("src")){changed=true;return}
      if(preview&&tag==="a"){el.setAttribute("target","_blank");el.setAttribute("rel","noopener noreferrer")}
      node.childNodes.forEach(n=>walk(n,el));parent.appendChild(el);
    };
    template.content.childNodes.forEach(n=>walk(n,container));
    return {html:container.innerHTML,node:container,changed};
  }
  const inline=(text,mode)=>{
    const tokens=[],keep=html=>"\uE100"+(tokens.push(html)-1)+"\uE101";
    let s=String(text).replace(/\x60([^\x60\n]+)\x60/g,(_,x)=>keep("<code>"+escape(x)+"</code>"));
    if(mode==="markdown"){
      s=s.replace(/(!?)\[([^\]\n]*)\]\(([^)\n]+)\)/g,(_,im,t,u)=>keep(im?(url(u,true)?'<img src="'+escape(u)+'" alt="'+escape(t)+'">':escape(t)):(url(u)?'<a href="'+escape(u)+'">'+inline(t,mode)+'</a>':escape(t))));
      s=escape(s).replace(/\*\*([^*\n]+)\*\*/g,"<strong>$1</strong>").replace(/\*([^*\n]+)\*/g,"<em>$1</em>").replace(/~~([^~\n]+)~~/g,"<s>$1</s>");
    }else{
      s=s.replace(/"([^"\n]+)":([^\s]+)/g,(_,t,u)=>keep(url(u)?'<a href="'+escape(u)+'">'+inline(t,mode)+'</a>':escape(t)));
      s=s.replace(/!([^!\n]+)!/g,(_,u)=>keep(url(u,true)?'<img src="'+escape(u)+'" alt="">':escape(u)));
      s=escape(s).replace(/\*([^*\n]+)\*/g,"<strong>$1</strong>").replace(/_([^_\n]+)_/g,"<em>$1</em>").replace(/\+([^+\n]+)\+/g,"<u>$1</u>").replace(/-([^-\n]+)-/g,"<s>$1</s>");
    }
    return s.replace(/\uE100([0-9]+)\uE101/g,(_,i)=>tokens[+i]||"");
  };
  function parse(raw,mode){
    if(mode==="html")return clean(raw,{preview:true});
    if(mode==="textile")raw=raw.replace(/<pre>\s*(?:<code(?: class="(?:language-)?([A-Za-z0-9_+#.-]+)")?>)?([\s\S]*?)(?:<\/code>)?\s*<\/pre>/g,(_,lang,code)=>{const el=document.createElement("textarea");el.innerHTML=code;return "\n```"+(lang||"")+"\n"+el.value.replace(/^\n|\n$/g,"")+"\n```\n"});
    const lines=String(raw).replace(/\r\n/g,"\n").split("\n"),out=[];let list=null,inCode=false,code=[],lang="",unsupported=false;
    const close=()=>{if(list){out.push(`</${list}>`);list=null}};
    for(let i=0;i<lines.length;i++){
      const line=lines[i],f=/^```([A-Za-z0-9_+#.-]*)\s*$/.exec(line);
      if(f){close();if(inCode){out.push(`<pre><code${lang?` class="language-${escape(lang)}"`:""}>${escape(code.join("\n"))}</code></pre>`);code=[]}else lang=f[1];inCode=!inCode;continue}
      if(inCode){code.push(line);continue}
      if(/<\/?[A-Za-z]|^\s*\[[^\]]+\]:|^>\s*>/.test(line))unsupported=true;
      if(/^\s*\|.*\|\s*$/.test(line)){
        close();const rows=[];while(i<lines.length&&/^\s*\|.*\|\s*$/.test(lines[i])){
          const row=lines[i++];if(/^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(row))continue;
          rows.push("<tr>"+row.trim().slice(1,-1).split("|").map(c=>{const tag=mode==="textile"&&/^\s*_\./.test(c)?"th":"td";return `<${tag}>${inline(c.replace(/^\s*_\.\s*/,"").trim(),mode)}</${tag}>`}).join("")+"</tr>");
        }i--;out.push("<table><tbody>"+rows.join("")+"</tbody></table>");continue;
      }
      const heading=(mode==="markdown"?/^(#{1,6})\s+(.*)$/:/^h([1-6])\.\s+(.*)$/).exec(line);
      if(heading){close();const level=mode==="markdown"?heading[1].length:+heading[1];out.push(`<h${level}>${inline(heading[2],mode)}</h${level}>`);continue}
      const li=(mode==="markdown"?/^(\s*)([-*]|\d+\.)\s+(.*)$/:/^(\s*)([*#]+)\s+(.*)$/).exec(line);
      if(li){
        close();const roots=[],stack=[];
        while(i<lines.length){
          const item=(mode==="markdown"?/^(\s*)([-*]|\d+\.)\s+(.*)$/:/^(\s*)([*#]+)\s+(.*)$/).exec(lines[i]);if(!item)break;
          const type=(mode==="markdown"?/\d/.test(item[2]):item[2][0]==="#")?"ol":"ul";
          let depth=mode==="markdown"?Math.floor(item[1].replace(/\t/g,"    ").length/2):item[2].length-1;
          depth=Math.min(depth,stack.length);if(depth&&(!stack[depth-1]||!stack[depth-1].items.length))depth=0;
          stack.length=Math.min(stack.length,depth+1);
          if(!stack[depth]||stack[depth].type!==type){const block={type,items:[]};if(depth)stack[depth-1].items.at(-1).children.push(block);else roots.push(block);stack[depth]=block}
          stack[depth].items.push({body:item[3],children:[]});i++;
        }
        i--;const render=b=>`<${b.type}>`+b.items.map(x=>"<li>"+inline(x.body,mode)+x.children.map(render).join("")+"</li>").join("")+`</${b.type}>`;
        out.push(roots.map(render).join(""));continue;
      }
      close();if(!line){out.push("<p><br></p>");continue}
      const quote=(mode==="markdown"?/^>\s?(.*)$/:/^bq\.\s+(.*)$/).exec(line);
      out.push(quote?`<blockquote>${inline(quote[1],mode)}</blockquote>`:`<p>${inline(line,mode)}</p>`);
    }
    close();if(inCode)out.push("<pre><code>"+escape(code.join("\n"))+"</code></pre>");
    return {...clean(out.join(""),{preview:true}),unsupported};
  }
  function serialize(html,mode){
    const c=clean(html,{internal:true});if(mode==="html")return c.html;
    const text=n=>n.nodeType===3?n.data:[...n.childNodes].map(visit).join("");
    function visit(n){
      if(n.nodeType===3)return n.data;const tag=n.localName,t=text(n),wrap=(a,b=a)=>a+t+b;
      if(["strong","b"].includes(tag))return wrap(mode==="markdown"?"**":"*");
      if(["em","i"].includes(tag))return wrap(mode==="markdown"?"*":"_");
      if(tag==="u")return mode==="textile"?wrap("+"):t;
      if(["s","strike","del"].includes(tag))return wrap(mode==="markdown"?"~~":"-");
      if(tag==="br")return "\n";
      if(tag==="a"){const u=n.getAttribute("href");return !u?t:mode==="markdown"?`[${t.replace(/\]/g,"\\]")}](${u.replace(/\)/g,"%29")})`:`"${t.replace(/"/g,"'")}":${u}`}
      if(tag==="img"){const u=n.getAttribute("src");return mode==="markdown"?`![${n.getAttribute("alt")||""}](${u})`:`!${u}!`}
      if(tag==="pre"){const code=n.querySelector("code"),language=(code?.className||"").replace(/^language-/,"");return mode==="textile"?`\n<pre><code${language?` class="language-${escape(language)}"`:""}>${escape(n.textContent)}</code></pre>\n`:"\n```"+language+"\n"+n.textContent.replace(/\n$/,"")+"\n```\n"}
      if(tag==="code")return "`"+t+"`";
      if(/^h[1-6]$/.test(tag))return "\n"+(mode==="markdown"?"#".repeat(+tag[1]):tag+".")+" "+t+"\n";
      if(tag==="blockquote")return "\n"+(mode==="markdown"?"> ":"bq. ")+t.trim()+"\n";
      if(tag==="ul"||tag==="ol"){
        const depth=(()=>{let p=n.parentElement,d=0;while(p){if(["ul","ol"].includes(p.localName))d++;p=p.parentElement}return d})();
        return "\n"+[...n.children].filter(x=>x.localName==="li").map((li,i)=>{
          const prefix=mode==="markdown"?"  ".repeat(depth)+(tag==="ol"?(i+1)+".":"-"):(tag==="ol"?"#":"*").repeat(depth+1);
          return prefix+" "+text(li).trim();
        }).join("\n")+"\n";
      }
      if(tag==="table"){
        const rows=[...n.querySelectorAll("tr")].map(r=>"|"+[...r.children].map(cell=>text(cell).trim().replace(/\n/g," ").replace(/\|/g,"\\|")).join("|")+"|");
        if(mode==="markdown"&&rows.length)rows.splice(1,0,"|"+[...n.querySelector("tr").children].map(()=>"---").join("|")+"|");
        return "\n"+rows.join("\n")+"\n";
      }
      if(["p","div"].includes(tag))return t+"\n";
      return t;
    }
    return [...c.node.childNodes].map(visit).join("").replace(/^\n|\n$/g,"");
  }
  return {escape,url,clean,parse,serialize,style,attachmentURL,rasterFile,imagePath,imageProxy};
})();

function commentTextHTML(raw){
  return String(raw||"").split(/(```[^\n]*\n[\s\S]*?```)/).map((part,i)=>i%2?'<pre><code>'+CommentCodec.escape(part.replace(/^```[^\n]*\n|```$/g,""))+'</code></pre>':part.split(/\r?\n/).map(line=>'<p>'+(CommentCodec.escape(line)||'<br>')+'</p>').join("")).join("");
}
function commentEditFormat(raw){const outside=String(raw).replace(/```[^\n]*\n[\s\S]*?```|`[^`\n]*`/g,"");return /<(?:p|div|span|br|img|table|pre|h[1-6]|ul|ol|a|font|strong|b|em|i|u|s|blockquote)\b/i.test(outside)?"html":"source"}
function commentIcon(key){
  const letters={bold:'<b>B</b>',italic:'<i>I</i>',underline:'<u>U</u>',strikeThrough:'<s>S</s>',source:'&lt;/&gt;',code:'{ }',row:'↧+',column:'⇥+',removeRow:'↧−',removeColumn:'⇥−',imageSize:'↔',imageBefore:'↑▧',imageAfter:'↓▧',imageRemove:'▧×',undo:'↶',redo:'↷',indent:'⇥',outdent:'⇤'};
  if(letters[key])return '<span aria-hidden="true">'+letters[key]+'</span>';
  const paths={link:'<path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-2 2M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l2-2"/>',image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="2"/><path d="m3 18 6-6 4 4 3-3 5 5"/>',table:'<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',insertUnorderedList:'<path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/>',insertOrderedList:'<path d="M9 6h12M9 12h12M9 18h12M3 3h1v6M2 12h3l-3 6h3"/>'};
  if(key.startsWith('justify')){const center=key==='justifyCenter',right=key==='justifyRight';paths[key]=`<path d="M3 4h18M${center?6:right?9:3} 9h12M3 14h18M${center?6:right?9:3} 19h12"/>`}
  return '<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+(paths[key]||'')+'</svg>';
}
class CommentEditor{
  constructor(root,{value="",format="html",issueId=0,onFormat=()=>{},onChange=()=>{},allowLegacy=true,imageState=null,onImageUpload=null}={}){
    this.root=root;this.raw=String(value);this.format=format;this.issueId=issueId;this.onFormat=onFormat;this.onChange=onChange;this.composing=false;this.history=[this.raw];this.pos=0;this.range=null;this.sourceMode=["source","legacy"].includes(format);this.disabled=false;
    this.localImageState={};this.imageState=imageState||(()=>this.localImageState);this.onImageUpload=onImageUpload;this.imageLoading=false;this.imageSelecting=false;this.selectedImage=null;
    this.allowLegacy=allowLegacy;root._commentEditor=this;this.build();
  }
  build(){
    const e=CommentCodec.escape;
    this.root.innerHTML=`<div class="cebar"><span class="cemode">HTML 편집기</span><input type="hidden" class="ceformat"><button type="button" class="mini ceicon" data-ce="source" title="HTML 소스 / 시각 편집" aria-label="HTML 소스 / 시각 편집">${commentIcon("source")}</button></div><div class="cetools" role="toolbar" aria-label="댓글 서식"></div><div class="cehint meta" role="status"></div><div class="cevisual" role="textbox" aria-multiline="true" aria-label="댓글 시각 편집" contenteditable="true"></div><div class="celegacy rte cmta" hidden></div><textarea class="cesource" aria-label="댓글 소스" spellcheck="false"></textarea>`;
    this.select=this.root.querySelector(".ceformat");this.visual=this.root.querySelector(".cevisual");this.source=this.root.querySelector(".cesource");this.tools=this.root.querySelector(".cetools");this.hint=this.root.querySelector(".cehint");
    this.path=document.createElement("div");this.path.className="cepath";this.path.setAttribute("role","status");this.path.setAttribute("aria-live","off");this.path.setAttribute("aria-label","현재 커서의 요소 경로");this.root.appendChild(this.path);this.path.textContent="body";
    this.images=document.createElement("div");this.images.className="ceimages";this.images.setAttribute("role","dialog");this.images.setAttribute("aria-modal","true");this.images.setAttribute("aria-label","이미지 선택 및 업로드");this.images.hidden=true;this.hint.after(this.images);
    this.images.addEventListener("click",ev=>{if(ev.target===this.images)this.closeImages()});
    this.select.value=this.format;
    if(!this.allowLegacy)this.select.querySelector('option[value="legacy"]')?.remove();
    this.legacy=this.root.querySelector(".celegacy");
    this.root.addEventListener("mousedown",ev=>{if(ev.target.closest("button")){this.remember();ev.preventDefault()}});
    this.root.addEventListener("click",ev=>{const b=ev.target.closest("[data-ce]");if(b&&!b.disabled){ev.preventDefault();ev.stopPropagation();this.command(b.dataset.ce)}});
    for(const area of [this.visual,this.source]){
      area.addEventListener("compositionstart",()=>{this.composing=true;this.paragraphEdit=null});
      area.addEventListener("compositionend",()=>{this.composing=false;this.changed(area)});
      area.addEventListener("input",ev=>{ev.stopPropagation();if(!this.composing&&!ev.isComposing){if(area===this.visual){this.repairParagraphs(this.paragraphEdit||(!this.visual.firstChild||this.visual.innerHTML==="<br>"?{blocks:new Set()}:null));this.paragraphEdit=null}this.changed(area)}});
      area.addEventListener("paste",ev=>this.paste(ev,area));
    }
    this.legacy.addEventListener("compositionstart",()=>this.composing=true);
    this.legacy.addEventListener("compositionend",()=>{this.composing=false;this.changed(this.legacy)});
    this.legacy.addEventListener("input",ev=>{ev.stopPropagation();if(!this.composing&&!ev.isComposing)this.changed(this.legacy)});
    this.visual.addEventListener("keyup",()=>this.remember());this.visual.addEventListener("mouseup",()=>this.remember());
    this.visual.addEventListener("focus",()=>{if(this.format==="html"&&!this.sourceMode&&(!this.visual.firstChild||this.visual.innerHTML==="<br>"||!this.visual.textContent&&this.visual.children.length===1&&this.visual.children[0].localName==="p"&&!this.visual.querySelector("img,table,pre,ul,ol")))this.repairParagraphs({blocks:new Set(this.visual.children)});this.remember()});
    this.visual.addEventListener("beforeinput",ev=>{this.paragraphEdit=!this.composing&&!ev.isComposing&&/^(delete|insertParagraph|insertLineBreak)/.test(ev.inputType||"")?this.paragraphContext():null});
    this.visual.addEventListener("click",ev=>{const img=ev.target.closest("img");if(img&&this.visual.contains(img)){this.selectedImage=img;this.hint.textContent="이미지를 선택했어요. 툴바에서 크기·앞/뒤 이동·제거를 선택하세요. 제거는 본문에서만 지웁니다."}});
    this.visual.addEventListener("dragover",ev=>ev.preventDefault());
    this.visual.addEventListener("drop",ev=>{ev.preventDefault();ev.stopPropagation();if(ev.dataTransfer?.files?.length){toast("이미지 삽입에서 파일을 선택하세요. 파일을 본문에 직접 끌어 넣지 않습니다.",5000);return}this.paste({preventDefault(){},stopPropagation(){},clipboardData:ev.dataTransfer},this.visual)});
    this.images.addEventListener("keydown",ev=>{ev.stopPropagation();if(ev.key==="Escape"){ev.preventDefault();this.closeImages()}else if(ev.key==="Tab"){const list=[...this.images.querySelectorAll("button,input,select")].filter(b=>!b.disabled&&!b.hidden);const first=list[0],last=list.at(-1);if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last?.focus()}else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first?.focus()}}});
    this.visual.addEventListener("keydown",ev=>{
      if(ev.isComposing||this.composing||ev.keyCode===229)return;
      if(ev.key==="Backspace"||ev.key==="Delete")this.paragraphEdit=this.paragraphContext();
      if(this.paragraphKey(ev))return;
      if(ev.key==="Escape"&&this.codeAtSelection()){ev.preventDefault();ev.stopPropagation();this.exitCode();return}
      if((ev.ctrlKey||ev.metaKey)&&["z","y"].includes(ev.key.toLowerCase())){ev.preventDefault();ev.stopPropagation();this.command(ev.key.toLowerCase()==="y"||ev.shiftKey?"redo":"undo")}
    });
    this.render();
  }
  toolbar(){
    const all=[["bold","굵게"],["italic","기울임"],["underline","밑줄"],["strikeThrough","취소선"],["insertUnorderedList","글머리 목록"],["insertOrderedList","번호 목록"],["indent","들여쓰기"],["outdent","내어쓰기"],["justifyLeft","왼쪽 정렬"],["justifyCenter","가운데 정렬"],["justifyRight","오른쪽 정렬"],["link","링크"],["table","표 삽입"],["row","행 추가"],["column","열 추가"],["removeRow","행 삭제"],["removeColumn","열 삭제"],["image","이미지 삽입"],["imageSize","이미지 크기"],["imageBefore","이미지 앞으로"],["imageAfter","이미지 뒤로"],["imageRemove","이미지 제거"],["code","코드 블록"],["undo","실행 취소"],["redo","다시 실행"]];
    const htmlOnly=new Set(["justifyLeft","justifyCenter","justifyRight","imageSize"]),native=new Set(["bold","italic","underline","strikeThrough","insertUnorderedList","insertOrderedList","indent","outdent","justifyLeft","justifyCenter","justifyRight"]);
    this.tools.innerHTML=all.filter(([k])=>(this.format==="html"||!htmlOnly.has(k))&&(k!=="underline"||this.format!=="markdown")&&(!native.has(k)||(typeof document.queryCommandSupported==="function"&&document.queryCommandSupported(k)))).map(([k,l])=>`<button type="button" class="mini ceicon" data-ce="${k}" title="${l}" aria-label="${l}" aria-pressed="false">${commentIcon(k)}</button>`).join("")+`<label>문단 <select class="cestyle" aria-label="문단 스타일"><option value="p">문단</option>${[1,2,3,4,5,6].map(n=>`<option value="h${n}">제목 ${n}</option>`).join("")}</select></label>`+(this.format==="html"?`<label>글꼴 <select class="cefont" aria-label="글꼴"><option value="sans-serif">기본 글꼴</option><option value="Malgun Gothic">맑은 고딕</option><option value="Arial">Arial</option><option value="Consolas">Consolas</option><option value="serif">Serif</option></select></label><label>크기 <select class="cesize" aria-label="글자 크기">${[12,14,16,18,24,32,40].map(n=>`<option ${n===16?"selected":""}>${n}</option>`).join("")}</select></label><label>색상 <input type="color" class="cecolor" aria-label="글자 색상" value="#202020"></label>`:"");
    this.tools.querySelector(".cestyle").onchange=ev=>{this.restore();document.execCommand("formatBlock",false,ev.target.value);this.changed(this.visual)};
    const size=this.tools.querySelector(".cesize"),color=this.tools.querySelector(".cecolor");
    const font=this.tools.querySelector(".cefont");if(font)font.onchange=ev=>this.wrapStyle("font-family",ev.target.value);
    if(size)size.onchange=ev=>this.wrapStyle("font-size",ev.target.value+"px");
    if(color)color.onchange=ev=>this.wrapStyle("color",ev.target.value);
  }
  render(){
    this.updatePath(null);
    if(!this.images.hidden)this.closeImages();this.selectedImage=null;
    this.select.value=this.format;const rich=!["source","legacy"].includes(this.format);
    this.toolbar();this.source.value=this.raw;
      if(rich){const parsed=CommentCodec.parse(this.raw,this.format);this.visual.innerHTML=parsed.html;if((parsed.changed&&this.format==="html")||parsed.unsupported){this.sourceMode=true;this.hint.textContent="지원 밖 또는 위험한 서식이 있어 원문을 유지했습니다. 소스에서 확인하세요."}else if(typeof document.execCommand!=="function"){this.sourceMode=true;this.hint.textContent="이 브라우저에서는 소스 편집을 사용하세요."}else this.hint.textContent=""}
    else this.hint.textContent="과거 비HTML 댓글은 원문 호환 모드로 보존합니다. 내용을 변환하지 않고 수정합니다.";
    this.root.querySelector(".cemode").textContent=this.format==="html"?(this.sourceMode?"HTML 소스":"HTML 시각 편집"):"원문 호환 편집";
    this.root.querySelector('[data-ce="source"]').setAttribute("aria-pressed",String(this.sourceMode));
    this.source.hidden=rich&&!this.sourceMode;this.visual.hidden=!rich||this.sourceMode;this.tools.hidden=!rich||this.sourceMode;
    this.path.hidden=!rich||this.sourceMode;
    const legacy=this.format==="legacy"&&typeof edInit==="function";
    this.legacy.hidden=!legacy;if(legacy){this.source.hidden=true;edInit(this.legacy,this.raw)}
    this.root.querySelector('[data-ce="source"]').disabled=!rich||this.disabled;this.setDisabled(this.disabled);
  }
  setRaw(raw){raw=String(raw??"");if(raw===this.raw)return;this.raw=raw;this.render()}
  setPeer(raw,format){if(format&&format!==this.format){this.format=format;this.sourceMode=["source","legacy"].includes(format)}this.setRaw(raw);if(this.select.value!==this.format)this.render()}
  getRaw(){return this.raw}
setDisabled(on){this.disabled=on;this.visual.contentEditable=on?"false":"true";this.source.disabled=on;this.select.disabled=on;this.tools.querySelectorAll("button,select,input").forEach(b=>b.disabled=on);this.legacy.querySelectorAll("button,select,input,textarea").forEach(b=>b.disabled=on);this.legacy.querySelectorAll("[contenteditable]").forEach(el=>{if(on){el.dataset.ceOldEditable??=el.getAttribute("contenteditable")==="false"?"plaintext-only":el.getAttribute("contenteditable");el.setAttribute("contenteditable","false")}else if(el.dataset.ceOldEditable!==undefined&&el.dataset.ceOldEditable!==null){el.setAttribute("contenteditable",el.dataset.ceOldEditable);delete el.dataset.ceOldEditable}});this.root.querySelector('[data-ce="source"]').disabled=on||["source","legacy"].includes(this.format);const undo=this.tools.querySelector('[data-ce="undo"]'),redo=this.tools.querySelector('[data-ce="redo"]');if(undo)undo.disabled=on||this.pos===0;if(redo)redo.disabled=on||this.pos>=this.history.length-1;if(this.images&&!this.images.hidden){if(on)this.images.querySelectorAll("button,input").forEach(b=>b.disabled=true);else this.paintImages(this.imageList||[])}}
  remember(){const s=window.getSelection();if(s.rangeCount&&this.visual.contains(s.anchorNode))this.range=s.getRangeAt(0).cloneRange();this.updatePath(this.visual.contains(s.anchorNode)?s.anchorNode:null);this.tools.querySelectorAll("[data-ce]").forEach(b=>{let active=false;try{active=!!document.queryCommandState?.(b.dataset.ce)}catch{}b.setAttribute("aria-pressed",String(active));b.classList.toggle("is-active",active)})}
  updatePath(node){
    if(this.currentP){this.currentP.removeAttribute("data-ce-current");this.currentP=null}
    if(!this.path)return;
    if(!node||this.sourceMode||this.disabled||!this.visual.contains(node)){this.path.textContent="body";if(CommentEditor.active===this)CommentEditor.active=null;return}
    if(CommentEditor.active&&CommentEditor.active!==this)CommentEditor.active.updatePath(null);CommentEditor.active=this;
    const el=node.nodeType===1?node:node.parentElement,names=[];
    for(let p=el;p&&p!==this.visual;p=p.parentElement)if(p.localName!=="tbody")names.unshift(p.localName);
    this.path.textContent=["body",...names].join(" > ");
    const p=el?.closest("p");
    if(p?.parentElement===this.visual&&!p.querySelector("img,table,pre,ul,ol")){p.setAttribute("data-ce-current","");this.currentP=p}
  }
  paragraphKey(ev){
    if(ev.key!=="Enter"||ev.isComposing||this.composing||ev.keyCode===229||this.disabled||this.sourceMode||this.format!=="html"||ev.ctrlKey||ev.metaKey||ev.altKey)return false;
    const s=window.getSelection(),el=s.anchorNode?.nodeType===1?s.anchorNode:s.anchorNode?.parentElement;if(!el||!this.visual.contains(el))return false;
    const code=el.closest("pre"),structured=el.closest("li,td,th,table,ul,ol");
    if(structured&&!code)return false; // 목록 분할/빈 항목 탈출·표 내부 편집은 브라우저의 기존 동작을 보존한다.
    if(code&&s.rangeCount){
      const range=s.getRangeAt(0);if(!code.contains(range.commonAncestorContainer))return false;
      // Chromium insertText("\n") can create two br elements instead of a literal code newline.
      const line=document.createTextNode("\n");range.deleteContents();range.insertNode(line);range.setStartAfter(line);range.collapse(true);s.removeAllRanges();s.addRange(range);
      ev.preventDefault();ev.stopPropagation();this.changed(this.visual);return true;
    }
    const command=code?"insertText":ev.shiftKey?"insertLineBreak":"insertParagraph";
    if(typeof document.execCommand!=="function"||document.queryCommandSupported?.(command)===false)return false;
    let previous="div",done=false,configured=false;const before=this.visual.innerHTML;
    try{
      if(!code){previous=document.queryCommandValue?.("defaultParagraphSeparator")||"div";configured=true;document.execCommand("defaultParagraphSeparator",false,"p")}
      done=document.execCommand(command,false,code?"\n":null)!==false;
    }catch{}finally{if(configured)try{document.execCommand("defaultParagraphSeparator",false,previous)}catch{}}
    if(!done&&this.visual.innerHTML===before)return false;
    ev.preventDefault();ev.stopPropagation();this.changed(this.visual);return true;
  }
  paragraphContext(){
    if(this.disabled||this.sourceMode||this.format!=="html")return null;
    const s=window.getSelection(),el=s.anchorNode?.nodeType===1?s.anchorNode:s.anchorNode?.parentElement;
    if(!el||!this.visual.contains(el)||el!==this.visual&&el.closest("pre,code,ul,ol,li,table,td,th,blockquote,h1,h2,h3,h4,h5,h6"))return null;
    // Existing source divs are valid HTML; only newly generated ordinary divs may be retagged.
    return {blocks:new Set(this.visual.children)};
  }
  repairParagraphs(context){
    if(!context||this.composing||this.disabled||this.sourceMode||this.format!=="html")return;
    const root=this.visual,s=window.getSelection(),inside=root.contains(s.anchorNode),replaced=new Map();
    const points=inside?[s.anchorNode,s.anchorOffset||0,s.focusNode||s.anchorNode,s.focusOffset??s.anchorOffset??0]:document.activeElement===root?[root,0,root,0]:null;
    const original=[...root.childNodes];let changed=false,run=null;
    const inline=n=>n.nodeType===3||n.nodeType===1&&["a","span","b","strong","i","em","u","s","strike","font","sup","sub","br","img"].includes(n.localName);
    for(const node of original){
      if(node.nodeType===1&&node.localName==="div"&&!context.blocks.has(node)&&[...node.childNodes].every(inline)){
        const p=document.createElement("p");for(const a of node.attributes)p.setAttribute(a.name,a.value);
        node.before(p);for(const child of [...node.childNodes])p.appendChild(child);replaced.set(node,p);node.remove();changed=true;run=null;
      }else if(inline(node)){
        // Ignore source indentation between blocks; preserve meaningful spaces inside inline runs.
        if(node.nodeType===3&&!node.textContent.trim()&&!run)continue;
        if(!run){run=document.createElement("p");node.before?node.before(run):root.insertBefore(run,node)}
        run.appendChild(node);changed=true;
      }else run=null;
    }
    if(!root.firstChild||[...root.childNodes].every(n=>n.nodeType===3&&!n.textContent.trim())){
      root.innerHTML="<p><br></p>";changed=true;
    }
    for(const p of root.children){if(p.localName==="p"&&!p.textContent&&!p.querySelector("br,img,table,pre,ul,ol")){p.appendChild(document.createElement("br"));changed=true}}
    if(!changed&&!(points?.[0]===root&&root.children.length===1&&root.children[0].localName==="p"))return;
    if(points){
      const point=(node,offset)=>{
        if(replaced.has(node))node=replaced.get(node);
        if(node===root){const next=original[offset],prev=original[offset-1],candidate=replaced.get(next)||next||replaced.get(prev)||prev;
          if(candidate&&root.contains(candidate)){node=candidate;offset=next?0:node.nodeType===3?node.textContent.length:node.childNodes.length;
            if(node.nodeType===1&&["br","img"].includes(node.localName)){offset=[...node.parentElement.childNodes].indexOf(node)+(next?0:1);node=node.parentElement}}
          else {node=root.querySelector("p")||root;offset=0}
        }
        if(!root.contains(node)){node=root.querySelector("p")||root;offset=0}
        return [node,Math.min(offset,node.nodeType===3?node.textContent.length:node.childNodes.length)];
      };
      const [a,ao]=point(points[0],points[1]),[f,fo]=point(points[2],points[3]);
      if(s.setBaseAndExtent)s.setBaseAndExtent(a,ao,f,fo);
      else if(document.createRange){const r=document.createRange();r.setStart(a,ao);r.setEnd(f,fo);s.removeAllRanges();s.addRange(r)}
    }
    this.remember();
  }
  restore(){this.visual.focus();if(this.range&&this.visual.contains(this.range.commonAncestorContainer)){const s=window.getSelection();s.removeAllRanges();s.addRange(this.range)}}
  codeAtSelection(){const n=window.getSelection().anchorNode,p=(n?.nodeType===1?n:n?.parentElement)?.closest("pre");return p&&this.visual.contains(p)?p:null}
  exitCode(){const pre=this.codeAtSelection();if(!pre)return;let next=pre.nextElementSibling;if(!next){next=document.createElement("p");next.innerHTML="<br>";pre.after(next)}this.visual.focus();const r=document.createRange();r.selectNodeContents(next);r.collapse(true);const s=window.getSelection();s.removeAllRanges();s.addRange(r);this.remember();this.changed(this.visual)}
  emit(){this.onChange(this.raw);this.root.dispatchEvent(new Event("input",{bubbles:true}))}
  changed(area){if(this.disabled||this.composing)return;const value=area===this.legacy&&typeof edGet==="function"?edGet(this.legacy):area===this.source?this.source.value:CommentCodec.serialize(this.visual.innerHTML,this.format);if(value===this.raw)return;this.raw=value;this.history.splice(this.pos+1);this.history.push(value);if(this.history.length>100)this.history.shift();this.pos=this.history.length-1;this.remember();this.setDisabled(this.disabled);this.emit()}
  insert(html){this.restore();document.execCommand("insertHTML",false,html);this.changed(this.visual)}
  wrapStyle(key,value){this.restore();const s=window.getSelection();if(!s.rangeCount||s.isCollapsed){toast("먼저 서식을 바꿀 글자를 선택하세요",3000);return}const r=s.getRangeAt(0),span=document.createElement("span");span.setAttribute("style",key+":"+value);span.appendChild(r.extractContents());r.insertNode(span);this.changed(this.visual)}
  addCode(){if(this.format==="legacy"&&!this.legacy.hidden&&typeof addCodeBox==="function"){addCodeBox(this.legacy);this.changed(this.legacy);return}if(["legacy","source"].includes(this.format)||this.sourceMode){this.source.value=this.raw+(this.raw?"\n":"")+(["html","textile"].includes(this.format)?"<pre><code>코드를 입력하세요</code></pre>":"```\n코드를 입력하세요\n```");this.changed(this.source);return}this.insert("<pre><code>코드를 입력하세요</code></pre><p><br></p>")}
  async command(key){
    if(this.disabled)return;
    if(key==="source"){this.sourceMode=!this.sourceMode;this.render();return}
    if(key==="undo"||key==="redo"){const n=this.pos+(key==="undo"?-1:1);if(n<0||n>=this.history.length)return;this.pos=n;this.raw=this.history[n];this.render();this.emit();return}
    if(key==="code"){this.addCode();return}
    if(key==="link"){
      this.remember();const sel=window.getSelection(),node=sel.anchorNode?.nodeType===1?sel.anchorNode:sel.anchorNode?.parentElement,a=node?.closest("a");
      const address=window.prompt("링크 주소 (빈 값은 링크 제거)",a?.getAttribute("href")||"https://");if(address===null)return;
      this.restore();if(!address){document.execCommand("unlink");this.changed(this.visual);return}if(!CommentCodec.url(address)){toast("허용되지 않은 링크 주소예요",4000);return}
      if(sel.isCollapsed&&!a){const label=window.prompt("링크에 표시할 글자",address);if(label===null)return;this.insert(`<a href="${CommentCodec.escape(address)}">${CommentCodec.escape(label)}</a>`)}
      else{if(a){a.setAttribute("href",address)}else document.execCommand("createLink",false,address);this.changed(this.visual)}return;
    }
    if(key==="table"){
      const value=window.prompt("표 크기 (행 x 열, 최대 20 x 20)","2x2");if(value===null)return;const m=/^\s*([1-9][0-9]?)\s*[x×]\s*([1-9][0-9]?)\s*$/.exec(value);if(!m||+m[1]>20||+m[2]>20){toast("표 크기를 확인하세요",3000);return}
      this.insert("<table><tbody>"+Array.from({length:+m[1]},()=>"<tr>"+"<td><br></td>".repeat(+m[2])+"</tr>").join("")+"</tbody></table><p><br></p>");return;
    }
    if(["row","column","removeRow","removeColumn"].includes(key)){
      this.restore();const node=window.getSelection().anchorNode,cell=(node?.nodeType===1?node:node?.parentElement)?.closest("td,th");if(!cell||!this.visual.contains(cell)){toast("먼저 표 안의 칸을 선택하세요",3000);return}
      const table=cell.closest("table"),row=cell.parentElement,index=[...row.children].indexOf(cell);
      if([...table.querySelectorAll("td,th")].some(c=>+(c.getAttribute("colspan")||1)>1||+(c.getAttribute("rowspan")||1)>1)){toast("병합된 표의 행·열 변경은 소스 모드에서 편집하세요",5000);return}
      if(key==="row"){const r=row.cloneNode(true);r.querySelectorAll("td,th").forEach(c=>c.innerHTML="<br>");row.after(r)}
      if(key==="column")table.querySelectorAll("tr").forEach(r=>{const c=document.createElement("td");c.innerHTML="<br>";(r.children[index]||r.lastElementChild).after(c)});
      if(key==="removeRow"){row.remove();if(!table.querySelector("tr"))table.remove()}
      if(key==="removeColumn"){table.querySelectorAll("tr").forEach(r=>r.children[index]?.remove());if(!table.querySelector("td,th"))table.remove()}
      this.changed(this.visual);return;
    }
    if(key==="image"){this.remember();await this.openImages();return}
    if(["imageSize","imageBefore","imageAfter","imageRemove"].includes(key)){this.editImage(key);return}
    this.restore();
    if(["indent","outdent"].includes(key)&&this.format!=="html"){
      const node=window.getSelection().anchorNode,li=(node?.nodeType===1?node:node?.parentElement)?.closest("li");
      if(!li||!this.visual.contains(li)){toast("이 형식에서는 목록 안에서 들여쓰기를 사용하세요",4000);return}
    }
    if(document.queryCommandSupported(key)){if(document.queryCommandSupported("styleWithCSS"))document.execCommand("styleWithCSS",false,false);document.execCommand(key,false,null);this.changed(this.visual)}
  }
  paste(event,area){
    if(this.disabled)return;event.preventDefault();event.stopPropagation();const data=event.clipboardData;if(!data)return;
    if(area===this.source){const text=data.getData("text/plain");this.source.setRangeText(text,this.source.selectionStart,this.source.selectionEnd,"end");this.changed(this.source);return}
    this.remember();const html=data.getData("text/html"),text=data.getData("text/plain");
    const safe=html?CommentCodec.clean(html,{preview:true}):{html:CommentCodec.escape(text).replace(/\r?\n/g,"<br>")};this.insert(safe.html);
  }
  closeImages(){this.images.hidden=true;this.imageLoadVersion=(this.imageLoadVersion||0)+1;if(this.previewURL){URL.revokeObjectURL(this.previewURL);this.previewURL=null}this.root.querySelector('[data-ce="image"]')?.focus()}
  referenceImages(existing){
    if(typeof all==="undefined")return [];
    const n=all.find(n=>n.issue_id===this.issueId);if(!n)return [];
    const seen=new Set(existing.map(a=>CommentCodec.attachmentURL(a))),out=[];
    for(const raw of [n.desc_raw,...(n.journals||[]).map(j=>j.raw??j.notes)]){
      CommentCodec.clean(raw||"").node.querySelectorAll("img").forEach(img=>{const src=img.getAttribute("src");if(!CommentCodec.url(src,true))return;const u=new URL(src,cfg.url);if(seen.has(u.href))return;seen.add(u.href);
        out.push({reference_url:src,reference_key:"ref-"+out.length,filename:img.getAttribute("alt")||decodeURIComponent(u.pathname.split("/").at(-1))||"기존 본문 이미지",author:"본문/댓글 이미지 참조"});
      });
    }
    return out;
  }
  async openImages(){
    const focusPopup=this.images.hidden||!this.images.contains(document.activeElement);
    const version=this.imageLoadVersion=(this.imageLoadVersion||0)+1;this.images.hidden=false;this.imageListLoading=true;this.imageListError="";this.paintImages(this.imageList||[]);
    try{const list=await api("/api/rm/attachments?issue_id="+this.issueId);if(version!==this.imageLoadVersion)return;
      const images=list.filter(a=>/\.(png|jpe?g|gif|bmp|webp)$/i.test(a.filename||""));
      this.imageList=images.filter(a=>CommentCodec.attachmentURL(a));this.imageRejected=images.length-this.imageList.length;
      this.imageList.push(...this.referenceImages(this.imageList));
      this.imageListLoading=false;this.paintImages(this.imageList);
      if(focusPopup)this.images.querySelector(".ceimageclose").focus();
    }catch(e){if(version===this.imageLoadVersion){this.imageList=[];this.imageListLoading=false;this.imageListError=e.message;this.paintImages([])}}
  }
  imageListMessage(list,state){
    if(this.imageListLoading)return "등록된 이미지 목록을 조회하고 있어요…";
    if(this.imageListError)return "첨부 목록 조회 실패: "+this.imageListError+" · 목록 새로고침을 누르세요. 파일을 다시 첨부하지 마세요.";
    if(this.imageRejected)return `이미지 ${this.imageRejected}개의 content_url을 안전한 첨부 주소로 확인할 수 없어 제외했어요. Redmine에서 첨부를 확인하세요. 파일을 다시 첨부하지 마세요.`;
    if(list.length)return `등록된 이미지 ${list.length}개 · ID와 파일명을 확인하고 본문에 넣을 이미지를 누르세요. 마지막으로 댓글을 저장해야 반영됩니다.`;
    if(state.uploaded)return "첨부 등록은 완료됐지만 삽입 가능한 이미지를 목록에서 확인하지 못했어요. 목록 새로고침 또는 Redmine에서 확인하세요. 파일을 다시 첨부하지 마세요.";
    if(state.file)return "미리보기만 표시했어요. 업로드를 누르면 일감에 첨부하고 목록을 갱신합니다.";
    return "등록된 이미지가 없어요. ＋로 파일을 선택한 뒤 업로드하세요.";
  }
  paintImages(list){
    if(this.previewURL){URL.revokeObjectURL(this.previewURL);this.previewURL=null}
    const state=this.imageState(),e=CommentCodec.escape;
    this.images.innerHTML=`<div class="ceimagepanel"><div class="ceimagehead"><b>이미지 삽입 · 일감 #${this.issueId}</b><button type="button" class="mini ceimageclose">닫기</button></div><p class="meta">이미지를 눌러 본문에 넣으세요. 새 파일은 ＋로 선택하고 업로드합니다. 업로드 후에도 댓글 저장이 필요합니다.</p><strong class="ceimagephase" role="status"></strong><div class="ceimagestatus" role="status"></div><div class="ceimagenew"><button type="button" class="mini ceimagepick" title="새 이미지 선택" aria-label="새 이미지 선택">＋</button><label>새 이미지 (선택은 미리보기만) <input type="file" class="ceimagefile" hidden accept=".png,.jpg,.jpeg,.gif,.webp,image/png,image/jpeg,image/gif,image/webp"></label><div class="ceimagepreview"></div><button type="button" class="mini ceimageupload">업로드 · 일감에 첨부</button><div class="ceimagerecovery"></div></div><div class="ceimagehead"><b>등록된 이미지</b><button type="button" class="mini ceimagerefresh">목록 새로고침</button></div><p class="meta ceimageliststatus" role="status"></p><div class="ceimagelist">${list.map(a=>`<button type="button" class="ceimagechoice" ${a.reference_key?`data-image-ref="${a.reference_key}"`:`data-image-id="${a.id}"`}><img src="${e(a.reference_url?CommentCodec.imageProxy(a.reference_url):`/api/rm/attachment?id=${a.id}&name=${encodeURIComponent(a.filename)}`)}" alt=""><span>${a.reference_key?"기존 본문":`#${a.id}`} · ${e(a.filename)}<small>${e(a.author||"")} · ${e(a.created_on||"")}</small></span></button>`).join("")}</div></div>`;
    this.images.querySelector(".ceimageclose").onclick=()=>this.closeImages();
    const refresh=this.images.querySelector(".ceimagerefresh");refresh.disabled=this.disabled||this.imageLoading||this.imageListLoading;refresh.onclick=()=>this.openImages();
    this.images.querySelector(".ceimagephase").textContent=state.pending?"첨부 결과 미확정 · 확인 필요":this.imageLoading?"2단계: 첨부 처리 중…":state.file?"1단계: 파일 선택 완료 · 서버 미등록":state.uploaded?"2단계: 첨부 등록 완료 · 3단계에서 본문에 삽입하세요":"1단계: 새 파일을 선택하거나 아래 등록된 이미지를 선택하세요";
    this.images.querySelector(".ceimageliststatus").textContent=this.imageListMessage(list,state);
    this.images.querySelector(".ceimagestatus").textContent=state.message||"이미지는 현재 일감 목록의 검증된 Redmine 주소로 저장합니다.";
    if(state.file){const preview=this.images.querySelector(".ceimagepreview"),name=document.createElement("p");name.textContent=state.file.name+" · "+state.file.size+" B";preview.appendChild(name);
      if(typeof URL.createObjectURL==="function"){this.previewURL=URL.createObjectURL(state.file);const img=document.createElement("img");img.setAttribute("src",this.previewURL);img.setAttribute("alt","선택한 새 이미지 미리보기 (아직 본문에 삽입되지 않음)");preview.appendChild(img)}}
    const input=this.images.querySelector(".ceimagefile"),upload=this.images.querySelector(".ceimageupload");
    const pick=this.images.querySelector(".ceimagepick");pick.onclick=()=>input.click();
    input.disabled=this.disabled||state.pending||this.imageLoading||this.imageSelecting||!this.onImageUpload;
    upload.disabled=input.disabled||!state.file;
    pick.disabled=input.disabled;
    input.onchange=async()=>{
      const file=input.files?.[0];input.value="";if(!file||this.disabled||state.pending||this.imageSelecting)return;
      const selection=state.selectionVersion=(state.selectionVersion||0)+1;this.imageSelecting=true;input.disabled=upload.disabled=true;
      try{await CommentCodec.rasterFile(file,typeof cmLimits==="function"?cmLimits().max_file:undefined);if(state.pending||this.disabled||selection!==state.selectionVersion)return;state.file=file;state.uploaded=false;delete state.requestId;state.message="미리보기만 표시했어요. 2단계 ‘일감에 먼저 첨부’를 누르기 전에는 서버에 업로드하지 않습니다."}
      catch(err){state.message=err.message}finally{this.imageSelecting=false;this.paintImages(this.imageList||[])}
    };
    upload.onclick=()=>this.uploadImage();
    if(state.pending){const box=this.images.querySelector(".ceimagerecovery");box.innerHTML='<p>미확정 첨부: Redmine에서 확인하세요. 새 파일 선택과 재전송을 차단했습니다.</p><button type="button" class="mini" data-image-recover="check">반영 확인</button><button type="button" class="mini" data-image-recover="applied">등록됨 확인</button><button type="button" class="mini" data-image-recover="not_applied">미등록 확인 / 재시도 준비</button>';box.querySelectorAll("[data-image-recover]").forEach(b=>{b.disabled=this.disabled||this.imageLoading;b.onclick=()=>this.uploadImage(b.dataset.imageRecover)})}
    this.images.querySelectorAll("[data-image-id],[data-image-ref]").forEach(b=>{b.disabled=this.disabled||this.imageListLoading||!!this.imageListError;b.onclick=()=>{const a=list.find(a=>a.reference_key?b.dataset.imageRef===a.reference_key:String(a.id)===b.dataset.imageId);if(!b.disabled&&!this.disabled&&!this.imageListLoading&&!this.imageListError&&a)this.insertImage(a)};const img=b.querySelector("img");img.onerror=()=>{b.disabled=true;b.title="이미지를 불러오지 못했어요. 권한·경로를 확인하세요. 다시 업로드하지 않습니다.";this.images.querySelector(".ceimagestatus").textContent=b.title}});
  }
  async uploadImage(decision=null){
    if(this.disabled||this.imageLoading||!this.onImageUpload)return;
    this.imageLoading=true;this.paintImages(this.imageList||[]);
    this.imageState().selectionVersion=(this.imageState().selectionVersion||0)+1;
    try{await this.onImageUpload(this.imageState(),decision)}catch(e){this.imageState().message=e.message}
    finally{this.imageLoading=false;if(!this.images.hidden)await this.openImages()}
  }
  insertImage(a){
    const src=a.reference_url?CommentCodec.url(a.reference_url,true):CommentCodec.attachmentURL(a);if(this.disabled||!src)return false;
    const before=this.raw;this.insert(CommentCodec.clean(`<img src="${CommentCodec.escape(src)}" alt="${CommentCodec.escape(a.filename)}">`,{preview:true}).html);
    if(this.raw===before){this.images.querySelector(".ceimagestatus").textContent="브라우저가 본문에 이미지를 삽입하지 못했어요. 본문의 삽입 위치를 선택한 뒤 다시 누르거나 소스 모드에서 확인하세요. 파일은 다시 첨부하지 마세요.";return false}
    this.closeImages();this.restore();this.hint.textContent="본문에 이미지를 넣었어요. 이어서 글을 쓰고 댓글 올리기 또는 수정 저장을 누르세요.";return true;
  }
  editImage(key){
    const img=this.selectedImage;if(!img||!this.visual.contains(img)){toast("먼저 본문의 이미지를 클릭하세요",4000);return}
    if(key==="imageSize"){
      if(this.format!=="html")return;const width=window.prompt("이미지 너비 (1~4096 px, 빈 값은 원래 크기)",img.getAttribute("width")||"");if(width===null)return;
      if(width&&!/^[1-9][0-9]{0,3}$/.test(width)||+width>4096){toast("1~4096 사이의 너비를 입력하세요",4000);return}
      if(width)img.setAttribute("width",width);else img.removeAttribute("width");img.removeAttribute("height");
    }else if(key==="imageRemove"){img.remove();this.selectedImage=null}
    else{
      let block=img;while(block.parentElement&&block.parentElement!==this.visual)block=block.parentElement;
      const empty=block!==img&&block.localName==="p"&&block.childNodes.length===1;
      const p=document.createElement("p");if(key==="imageBefore")(block.previousElementSibling||block).before(p);else(block.nextElementSibling||block).after(p);p.appendChild(img);if(empty)block.remove();
    }
    this.changed(this.visual);
  }
}

document.addEventListener?.("selectionchange",()=>{const s=window.getSelection(),node=s.anchorNode?.nodeType===1?s.anchorNode:s.anchorNode?.parentElement,editor=node?.closest(".cevisual")?.parentElement?._commentEditor;if(editor&&!editor.sourceMode)editor.remember();else CommentEditor.active?.updatePath(null)});
function mountCommentEditor(root,options){return root._commentEditor||new CommentEditor(root,options)}
function commentSafeDisplay(raw,format){
  const display=result=>{
    result.node.querySelectorAll("img").forEach(img=>{img.classList.add("rimg");img.dataset.full=img.getAttribute("src");const m=/^\/api\/rm\/attachment\?id=(\d+)/.exec(img.getAttribute("src")||"");if(m)img.dataset.aid=m[1]});
    if(typeof renderMd==="function"&&typeof normLang==="function"&&typeof hlLines==="function")result.node.querySelectorAll("pre").forEach(pre=>{
      const lang=(pre.querySelector("code")?.className||"").replace(/^language-/,"");
      const box=document.createElement("div");box.innerHTML=renderMd("```"+lang+"\n"+pre.textContent+"\n```");
      if(box.firstElementChild)pre.replaceWith(box.firstElementChild);
    });
    const compact=node=>{if(["pre","code"].includes(node.localName))return;[...node.childNodes].forEach(n=>{if(n.nodeType===3&&/\n/.test(n.data)&&!n.data.trim())n.remove();else if(n.nodeType===1)compact(n)})};compact(result.node);
    return '<div class="remote-html">'+result.node.innerHTML+'</div>';
  };
  if(["markdown","textile"].includes(format))return display(CommentCodec.parse(raw,format));
  const outsideFences=String(raw).replace(/```[^\n]*\n[\s\S]*?```/g,"");
  if(/<(?:p|div|span|table|pre|h[1-6]|ul|ol|img|a)\b/i.test(outsideFences))return display(CommentCodec.clean(raw,{preview:true}));
  return null;
}
