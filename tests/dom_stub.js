/* 검사 전용 DOM 대역. HTML5 파서/레이아웃/네이티브 execCommand 검증을 대신하지 않는다. */
const escape=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const decode=s=>s.replace(/&#(?:x([\da-f]+)|(\d+));?/gi,(_,h,d)=>String.fromCodePoint(parseInt(h||d,h?16:10))).replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,n)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:'\u00a0'}[n]));
const voids=new Set('br img hr col input meta link'.split(' '));
class Text{
  constructor(data){this.nodeType=3;this.data=data;this.parentElement=null}
  get textContent(){return this.data}set textContent(x){this.data=String(x)}
  get outerHTML(){return escape(this.data)}cloneNode(){return new Text(this.data)}
  remove(){if(this.parentElement){const p=this.parentElement;p.childNodes.splice(p.childNodes.indexOf(this),1);this.parentElement=null}}
}
class Element{
  constructor(name='div'){
    this.localName=name;this.tagName=name.toUpperCase();this.nodeType=1;this.childNodes=[];this.parentElement=null;this.attrs=new Map();this.events={};this.disabled=false;this.hidden=false;this.value='';this.selectionStart=this.selectionEnd=0;
    this.dataset=new Proxy({}, {get:(_,k)=>this.getAttribute('data-'+String(k).replace(/[A-Z]/g,c=>'-'+c.toLowerCase())),set:(_,k,v)=>{this.setAttribute('data-'+String(k).replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),v);return true}});
    this.classList={contains:c=>this.className.split(/\s+/).includes(c),add:(...c)=>this.className=[...new Set([...this.className.split(/\s+/).filter(Boolean),...c])].join(' '),remove:(...c)=>this.className=this.className.split(/\s+/).filter(x=>!c.includes(x)).join(' '),toggle:(c,on)=>{const has=this.classList.contains(c);if(on??!has)this.classList.add(c);else this.classList.remove(c)}};
  }
  get attributes(){return [...this.attrs].map(([name,value])=>({name,value}))}
  get children(){return this.childNodes.filter(n=>n.nodeType===1)}
  get firstChild(){return this.childNodes[0]||null}get lastElementChild(){return this.children.at(-1)||null}
  setAttribute(k,v){this.attrs.set(k,String(v));if(k==='value')this.value=String(v)}getAttribute(k){return this.attrs.get(k)??null}hasAttribute(k){return this.attrs.has(k)}
  removeAttribute(k){this.attrs.delete(k)}
  get className(){return this.getAttribute('class')||''}set className(v){this.setAttribute('class',v)}
  appendChild(n){if(n.parentElement)n.remove();n.parentElement=this;this.childNodes.push(n);return n}
  insertBefore(n,ref){if(n.parentElement)n.remove();n.parentElement=this;this.childNodes.splice(ref?this.childNodes.indexOf(ref):this.childNodes.length,0,n);return n}
  after(n){if(!this.parentElement)return;const p=this.parentElement;if(n.parentElement)n.remove();n.parentElement=p;p.childNodes.splice(p.childNodes.indexOf(this)+1,0,n)}
  before(n){if(!this.parentElement)return;const p=this.parentElement;if(n.parentElement)n.remove();n.parentElement=p;p.childNodes.splice(p.childNodes.indexOf(this),0,n)}
  get previousElementSibling(){return this.parentElement?.children[this.parentElement.children.indexOf(this)-1]||null}
  get nextElementSibling(){return this.parentElement?.children[this.parentElement.children.indexOf(this)+1]||null}
  remove(){if(this.parentElement){const p=this.parentElement;p.childNodes.splice(p.childNodes.indexOf(this),1);this.parentElement=null}}
  get textContent(){return this.childNodes.map(n=>n.textContent).join('')}set textContent(v){this.childNodes=[];this.appendChild(new Text(String(v)))}
  get innerHTML(){return this.childNodes.map(n=>n.outerHTML).join('')}
  set innerHTML(s){this.childNodes=[];parse(String(s),this);if(this.localName==='textarea')this.value=this.textContent}
  get outerHTML(){return '<'+this.localName+[...this.attrs].map(([k,v])=>' '+k+'="'+escape(v)+'"').join('')+'>'+ (voids.has(this.localName)?'':this.innerHTML+'</'+this.localName+'>')}
  contains(node){while(node){if(node===this)return true;node=node.parentElement}return false}
  matches(selector){return selector.split(',').some(part=>{part=part.trim();const tag=/^[a-z][\w-]*/i.exec(part);if(tag&&this.localName!==tag[0])return false;for(const m of part.matchAll(/\.([\w-]+)/g))if(!this.classList.contains(m[1]))return false;for(const m of part.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g))if(!this.hasAttribute(m[1])||(m[2]!==undefined&&this.getAttribute(m[1])!==m[2]))return false;return true})}
  closest(selector){for(let n=this;n;n=n.parentElement)if(n.matches(selector))return n;return null}
  querySelectorAll(selector){const out=[];const walk=p=>{for(const n of p.children){if(n.matches(selector))out.push(n);walk(n)}};walk(this);return out}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null}
  addEventListener(type,fn){(this.events[type]??=[]).push(fn)}
  dispatchEvent(event){if(!event.target)event.target=this;event.stopPropagation??=()=>{};event.preventDefault??=()=>{};this['on'+event.type]?.(event);for(const fn of this.events[event.type]||[])fn(event);return true}
  focus(){document.activeElement=this}
  setRangeText(text,start,end){this.value=this.value.slice(0,start)+text+this.value.slice(end);this.selectionStart=this.selectionEnd=start+text.length}
  cloneNode(deep=false){const n=new Element(this.localName);for(const [k,v]of this.attrs)n.setAttribute(k,v);if(deep)for(const c of this.childNodes)n.appendChild(c.cloneNode(true));return n}
}
function parse(html,root){
  const stack=[root];for(const m of html.matchAll(/<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>|[^<]+|</g)){
    const token=m[0];if(token.startsWith('<!--')){const n={nodeType:8,outerHTML:token,textContent:'',parentElement:null};stack.at(-1).appendChild(n);continue}
    if(/^<\//.test(token)){if(stack.length>1)stack.pop();continue}
    if(token.startsWith('<')&&token.length>1){const name=/^<([\w-]+)/.exec(token)?.[1]?.toLowerCase();if(!name)continue;const el=new Element(name),attr=token.slice(name.length+1).replace(/\/?>$/,'');for(const a of attr.matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+)))?/g))el.setAttribute(a[1].toLowerCase(),decode(a[2]??a[3]??a[4]??''));stack.at(-1).appendChild(el);if(!voids.has(name)&&!token.endsWith('/>'))stack.push(el);continue}
    stack.at(-1).appendChild(new Text(decode(token)));
  }
}
const document={activeElement:null,createElement(name){if(name==='template'){const e=new Element(name),content=new Element('fragment');Object.defineProperty(e,'content',{value:content});Object.defineProperty(e,'innerHTML',{set:v=>content.innerHTML=v,get:()=>content.innerHTML});return e}return new Element(name)},createTextNode:s=>new Text(s),queryCommandSupported:()=>true,execCommand:()=>true};
module.exports={document,Element,Text,escape};
