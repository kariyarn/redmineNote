/* ---------- 코드 도우미: 언어 추정 · 색칠(하이라이트) · 정리(포맷) · 이름표(자리표시자) 복사 ----------
   외부 라이브러리 없이 직접 만든 가벼운 도구다. 완벽한 파서가 아니라 '보기 좋게'가 목표라서, 정리 결과는 항상 미리보기에서 눈으로 확인하고 직접 고친 뒤 적용한다. */
const LANGS=[["","자동"],["sql","SQL"],["js","JavaScript"],["java","Java"],["html","HTML/XML"],["mybatis","MyBatis XML"],["css","CSS"],["json","JSON"],["sh","쉘"],["py","Python"],["text","일반 글"]];
const LANG_ALIAS={sql:"sql",plsql:"sql",mysql:"sql",oracle:"sql",pgsql:"sql",psql:"sql",tsql:"sql",mssql:"sql",js:"js",javascript:"js",jsx:"js",ts:"js",tsx:"js",typescript:"js",node:"js",java:"java",kt:"java",kotlin:"java",groovy:"java",scala:"java",html:"html",htm:"html",xml:"html",mybatis:"mybatis",ibatis:"mybatis",mapper:"mybatis",xhtml:"html",jsp:"html",vue:"html",svg:"html",css:"css",scss:"css",less:"css",json:"json",sh:"sh",bash:"sh",shell:"sh",zsh:"sh",bat:"sh",cmd:"sh",py:"py",python:"py",text:"text",txt:"text",plain:"text",plaintext:"text"};
const normLang=l=>LANG_ALIAS[String(l||"").toLowerCase()]||"";
const langLabel=l=>(LANGS.find(x=>x[0]===l)||["","자동"])[1];
const unesc=s=>String(s||"").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&amp;/g,"&");

/* 언어 추정: 코드 내용의 특징으로 점수를 매겨 가장 높은 것 (애매하면 일반 글) */
function detectLang(code){
  const c=String(code||"").trim();if(!c)return "text";
  if(/^[\[{]/.test(c)){try{JSON.parse(c);return "json"}catch(e){}}
  if((/^<(?:select|insert|update|delete|sql|resultMap|mapper)\b/i.test(c)||/<mapper\b/i.test(c))&&/\b(?:select|insert|update|delete|from|where|values)\b/i.test(c))return "mybatis";      // MyBatis/iBatis 매퍼: 태그 안의 글은 SQL
  if(/^<(?:!doctype|\?xml|!--|\/?[a-z][\w:-]*[\s>\/])/i.test(c)&&/<\/?[a-z][\w:.-]*[^<>]*>/i.test(c))return "html";
  const sc={sql:0,js:0,java:0,css:0,py:0,sh:0},has=(re,k,n)=>{if(re.test(c))sc[k]+=n};
  has(/\b(?:select\b[\s\S]*?\bfrom|insert\s+into|update\s+[\w."]+\s+set|delete\s+from|create\s+(?:or\s+replace\s+)?(?:table|view|index|procedure|function|sequence)|alter\s+table|merge\s+into|drop\s+table|truncate\s+table|with\s+\w+\s+as\s*\()/i,"sql",5);
  has(/\b(?:inner\s+join|left\s+join|right\s+join|group\s+by|order\s+by|nvl|decode|rownum|sysdate|dual)\b/i,"sql",2);
  has(/@(?:Override|Autowired|Controller|RestController|Service|Repository|Mapper|RequestMapping|GetMapping|PostMapping|Entity|Test|Component|Transactional)\b/,"java",4);
  has(/\b(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?[\w<>\[\],? ]+\s+\w+\s*\(/,"java",3);
  has(/^\s*(?:import\s+[\w.]+\*?;|package\s+[\w.]+;)/m,"java",3);
  has(/System\.(?:out|err)\.print|\bnew\s+[A-Z]\w*(?:<[^>]*>)?\s*\(/,"java",2);
  has(/\b(?:String|int|long|boolean|double|void|List<|Map<)\s+\w+\s*[=;(]/,"java",2);
  has(/\b(?:function\s*\w*\s*\(|=>|const\s+\w+\s*=|let\s+\w+\s*=|var\s+\w+\s*=|console\.\w+|document\.\w+|window\.\w+|require\(|module\.exports|\$\(|async\s+function|await\s)/,"js",3);
  has(/(?:^|\})\s*[.#]?[\w-]+(?:\s*[,>+~]\s*[.#]?[\w-]+)*\s*\{[^{}]*:[^{}]*;?[^{}]*\}/,"css",5);
  has(/^\s*(?:def\s+\w+\(.*\):|class\s+\w+.*:|import\s+\w+|from\s+\w+\s+import|print\()/m,"py",4);
  has(/^#!\/|^\s*(?:echo|cd|ls|grep|sudo|chmod|export|curl|git|npm|mvn|cat|rm|mkdir)\s/m,"sh",3);
  let best="text",bn=2;for(const k of Object.keys(sc))if(sc[k]>bn){bn=sc[k];best=k}
  return best;
}

/* ---- 색칠 ---- */
const _W=s=>"\\b(?:"+s.trim().split(/\s+/).join("|")+")\\b";
const SQL_KW=_W("SELECT FROM WHERE AND OR NOT IN IS NULL LIKE BETWEEN EXISTS ANY SOME JOIN INNER LEFT RIGHT OUTER FULL CROSS NATURAL ON USING GROUP BY ORDER HAVING UNION ALL INTERSECT MINUS EXCEPT DISTINCT AS INSERT INTO VALUES UPDATE SET DELETE CREATE ALTER DROP TRUNCATE TABLE VIEW INDEX SEQUENCE PROCEDURE FUNCTION TRIGGER PACKAGE BEGIN END DECLARE IF ELSE ELSIF ELSEIF THEN CASE WHEN LOOP FOR WHILE RETURN RETURNS RETURNING PRIMARY KEY FOREIGN REFERENCES CONSTRAINT DEFAULT UNIQUE CHECK ASC DESC LIMIT OFFSET FETCH FIRST NEXT ROWS ROW ONLY WITH MERGE MATCHED GRANT REVOKE COMMIT ROLLBACK SAVEPOINT OVER PARTITION CONNECT PRIOR START NOCOPY REPLACE TEMPORARY ADD COLUMN MODIFY RENAME TO USE DATABASE SCHEMA EXPLAIN FOR LOCK NOWAIT");
const SQL_TY=_W("VARCHAR VARCHAR2 NVARCHAR NVARCHAR2 NUMBER INT INTEGER BIGINT SMALLINT TINYINT DATE DATETIME TIMESTAMP TIME CHAR NCHAR CLOB NCLOB BLOB BOOLEAN BOOL DECIMAL NUMERIC FLOAT DOUBLE REAL TEXT LONGTEXT");
const JS_KW=_W("break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new of return super switch this throw try typeof var void while with yield async await static get set null true false undefined NaN");
const JAVA_KW=_W("abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while var record null true false");
const PY_KW=_W("False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield self");
const SH_KW=_W("if then else elif fi for while do done case esac function in echo cd export source exit return local read set unset");
const NUM="\\b(?:0[xX][\\da-fA-F]+|\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?[lLfFdD]?)\\b";
const RULES={
  sql:{flags:"gi",r:[["c","\\/\\*[\\s\\S]*?(?:\\*\\/|$)|--[^\\n]*"],["st","'(?:[^']|'')*(?:'|$)"],["st","\"[^\"\\n]*\"?"],["pa",":[A-Za-z_\\uAC00-\\uD7A3][\\w\\uAC00-\\uD7A3]*|#\\{[^}\\n]*\\}|\\$\\{[^}\\n]*\\}|&&?[A-Za-z_]\\w*"],["nu",NUM],["ty",SQL_TY],["k",SQL_KW],["fn","\\b[A-Za-z_][\\w$#]*(?=\\s*\\()"]]},
  js:{flags:"g",r:[["c","\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)"],["st","`(?:\\\\[\\s\\S]|[^`\\\\])*`?|\"(?:\\\\.|[^\"\\\\\\n])*\"?|'(?:\\\\.|[^'\\\\\\n])*'?"],["nu",NUM],["k",JS_KW],["fn","\\b[A-Za-z_$][\\w$]*(?=\\s*\\()"],["ty","\\b[A-Z][A-Za-z0-9_]*\\b"]]},
  java:{flags:"g",r:[["c","\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)"],["st","\"\"\"[\\s\\S]*?(?:\"\"\"|$)|\"(?:\\\\.|[^\"\\\\\\n])*\"?|'(?:\\\\.|[^'\\\\\\n])*'?"],["ty","@[A-Za-z_]\\w*"],["nu",NUM],["k",JAVA_KW],["fn","\\b[A-Za-z_$][\\w$]*(?=\\s*\\()"],["ty","\\b[A-Z][A-Za-z0-9_]*\\b"]]},
  css:{flags:"g",r:[["c","\\/\\*[\\s\\S]*?(?:\\*\\/|$)"],["st","\"(?:\\\\.|[^\"\\\\\\n])*\"?|'(?:\\\\.|[^'\\\\\\n])*'?"],["k","@[\\w-]+|!important"],["nu","#[\\da-fA-F]{3,8}\\b|-?\\d*\\.?\\d+(?:px|em|rem|%|vh|vw|s|ms|deg|pt)?\\b"],["fn","[\\w-]+(?=\\()"],["at","[A-Za-z-]+(?=\\s*:(?!:))"],["ty","[.#][A-Za-z_][\\w-]*"]]},
  json:{flags:"g",r:[["at","\"(?:\\\\.|[^\"\\\\])*\"(?=\\s*:)"],["st","\"(?:\\\\.|[^\"\\\\\\n])*\"?"],["nu","-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?"],["k","\\b(?:true|false|null)\\b"]]},
  sh:{flags:"g",r:[["c","(?:^|(?<=\\s))#[^\\n]*"],["st","\"(?:\\\\.|[^\"\\\\])*\"?|'[^']*'?"],["pa","\\$\\{[^}\\n]*\\}|\\$[A-Za-z_]\\w*|\\$\\("],["k",SH_KW],["at","(?<=\\s)-{1,2}[A-Za-z][\\w-]*"],["nu",NUM]]},
  py:{flags:"g",r:[["c","#[^\\n]*"],["st","\"\"\"[\\s\\S]*?(?:\"\"\"|$)|'''[\\s\\S]*?(?:'''|$)|\"(?:\\\\.|[^\"\\\\\\n])*\"?|'(?:\\\\.|[^'\\\\\\n])*'?"],["ty","@[A-Za-z_][\\w.]*"],["nu",NUM],["k",PY_KW],["fn","\\b[A-Za-z_]\\w*(?=\\s*\\()"]]},
};
const _rx={};
function _compiled(lang){
  if(_rx[lang])return _rx[lang];const d=RULES[lang];if(!d)return null;
  return _rx[lang]={re:new RegExp(d.r.map(x=>"("+x[1]+")").join("|"),d.flags),types:d.r.map(x=>x[0])};
}
/* HTML/XML: 태그 안만 색칠하고 글자(본문)는 그대로 */
function _htmlTokens(code,sqlText){
  const out=[],re=/<!--[\s\S]*?(?:-->|$)|<![A-Za-z][^>]*>?|<\/?[A-Za-z][^<>]*>?/g;let last=0,m;
  const inner=tag=>{
    const t=/^(<\/?)([A-Za-z][\w:.-]*)|"[^"]*"?|'[^']*'?|[A-Za-z_:@#][\w:.@#-]*(?=\s*=)|\/?>|&[#\w]+;/g;let l=0,q;
    while((q=t.exec(tag))){
      if(q.index>l)out.push(["",tag.slice(l,q.index)]);
      if(q[2]){out.push(["tg",q[1]+q[2]])}else if(q[0][0]==='"'||q[0][0]==="'"){out.push(["st",q[0]])}else if(q[0].endsWith(">")){out.push(["tg",q[0]])}else if(q[0][0]==="&"){out.push(["nu",q[0]])}else out.push(["at",q[0]]);
      l=q.index+q[0].length;
    }
    if(l<tag.length)out.push(["",tag.slice(l)]);
  };
  while((m=re.exec(code))){
    if(m.index>last){const tx=code.slice(last,m.index);if(sqlText)out.push(...hlTokens(tx,"sql"));else out.push(["",tx])}
    if(m[0].startsWith("<!"))out.push(["c",m[0]]);else inner(m[0]);
    last=m.index+m[0].length;
  }
  if(last<code.length){const tx=code.slice(last);if(sqlText)out.push(...hlTokens(tx,"sql"));else out.push(["",tx])}
  return out;
}
function hlTokens(code,lang){
  code=String(code||"");
  if(code.length>40000||!lang||lang==="text")return [["",code]];
  if(lang==="html")return _htmlTokens(code);
  if(lang==="mybatis")return _htmlTokens(code,true);
  const c=_compiled(lang);if(!c)return [["",code]];
  const out=[];let last=0,m;c.re.lastIndex=0;
  while((m=c.re.exec(code))){
    if(m[0]==="")c.re.lastIndex++;
    else{
      if(m.index>last)out.push(["",code.slice(last,m.index)]);
      let k=1;while(k<m.length&&m[k]===undefined)k++;
      out.push([c.types[k-1],m[0]]);last=m.index+m[0].length;
    }
  }
  if(last<code.length)out.push(["",code.slice(last)]);
  return out;
}
const _hlSpan=(t,s)=>t?`<i class="tk-${t}">${esc(s)}</i>`:esc(s);
function hlLines(code,lang){      // 줄마다 나눈 HTML (여러 줄에 걸친 주석·문자열은 줄마다 다시 감싼다) — 줄번호 표시용
  const lines=[""];
  hlTokens(code,lang).forEach(([t,s])=>{s.split("\n").forEach((part,i)=>{if(i>0)lines.push("");if(part)lines[lines.length-1]+=_hlSpan(t,part)})});
  return lines;
}
const hlHtml=(code,lang)=>hlLines(code,lang).join("\n");

/* ---- 정리(포맷) ---- */
const _blank=s=>s.replace(/[ \t]+$/gm,"").replace(/\n{3,}/g,"\n\n").replace(/^\n+|\n+$/g,"");
function fmtPlain(code){return _blank(String(code||"").replace(/\r\n?/g,"\n").replace(/\t/g,"    "))}
function fmtJson(code){try{return JSON.stringify(JSON.parse(code),null,2)}catch(e){return fmtBrace(code,"js")}}

/* 중괄호 언어(JS · Java · CSS): 줄바꿈이 없는 코드는 ; { } 에서 줄을 나누고, 괄호 깊이대로 들여쓰기 */
function fmtBrace(code,lang){
  code=String(code||"").replace(/\r\n?/g,"\n").replace(/\t/g,"  ");
  const unit=lang==="java"?"    ":"  ",toks=hlTokens(code,lang==="css"?"css":lang),plainish=t=>t===""||t==="k"||t==="fn"||t==="ty"||t==="at"||t==="nu"||t==="pa";
  let s="",paren=0;const atLineStart=()=>/(^|\n)[ \t]*$/.test(s);
  const nextNonSp=(arr,ti,ci)=>{      // 이 글자 다음에 오는 첫 의미 있는 글자 (같은 줄 안에서)
    for(let a=ti;a<arr.length;a++){const txt=arr[a][1];for(let b=a===ti?ci+1:0;b<txt.length;b++){const ch=txt[b];if(ch===" "||ch==="\t")continue;return [ch,arr[a][0],txt.slice(b,b+8)]}}return ["\n","",""];
  };
  toks.forEach(([t,txt],ti)=>{
    if(!plainish(t)){s+=txt;return}
    for(let ci=0;ci<txt.length;ci++){
      const ch=txt[ci];
      if(ch==="("||ch==="["){paren++;s+=ch}
      else if(ch===")"||ch==="]"){paren=Math.max(0,paren-1);s+=ch}
      else if(ch==="{"){s+=ch;const [n]=nextNonSp(toks,ti,ci);if(n!=="\n"&&n!=="}")s+="\n"}
      else if(ch==="}"){
        if(!atLineStart()&&!/\{[ \t]*$/.test(s))s=s.replace(/[ \t]+$/,"")+"\n";
        s+=ch;const [n,nt,rest]=nextNonSp(toks,ti,ci);
        if(n!=="\n"&&!/^[;,)\]]/.test(n)&&!/^(?:else|catch|finally|while)\b/.test(rest)&&!(lang==="css"&&false))s+="\n";
      }
      else if(ch===";"&&paren===0){s+=ch;const [n,nt,rest]=nextNonSp(toks,ti,ci);if(n!=="\n"&&!(n==="/"&&/^\/[\/*]/.test(rest)))s+="\n"}
      else s+=ch;
    }
  });
  // 줄마다 들여쓰기: 줄 시작의 닫는 기호만큼 먼저 내리고, 그 줄의 열고 닫은 수만큼 깊이를 바꾼다. 여러 줄 주석·문자열 안쪽 줄은 건드리지 않는다.
  const t2=hlTokens(s,lang==="css"?"css":lang),mask=new Array(s.length).fill(true),starts=new Set();let pos=0;
  t2.forEach(([t,txt])=>{if(!plainish(t)){starts.add(pos);for(let i=0;i<txt.length;i++)mask[pos+i]=false}pos+=txt.length});
  let depth=0,off=0;const lines=s.split("\n"),out=[];
  lines.forEach(line=>{
    const start=off;off+=line.length+1;
    const lead=line.search(/\S/);
    if(lead<0){out.push("");return}
    if(!mask[start]&&!starts.has(start)){out.push(line);   // 앞 줄에서 시작한 여러 줄 주석/문자열의 안쪽 줄은 그대로
      for(let i=0;i<line.length;i++){if(!mask[start+i])continue;const ch=line[i];if("{([".includes(ch))depth++;else if("})]".includes(ch))depth=Math.max(0,depth-1)}return}
    let lc=0;for(let i=lead;i<line.length&&"})]".includes(line[i])&&mask[start+i];i++)lc++;
    out.push(unit.repeat(Math.max(0,depth-lc))+line.trim());
    for(let i=0;i<line.length;i++){if(!mask[start+i])continue;const ch=line[i];if("{([".includes(ch))depth++;else if("})]".includes(ch))depth=Math.max(0,depth-1)}
  });
  return _blank(out.join("\n"));
}

/* SQL: 절(SELECT FROM WHERE …)마다 줄을 나누고 키워드는 대문자, 목록은 한 줄에 하나씩 */
function _sqlTok(code){
  const re=/\/\*[\s\S]*?(?:\*\/|$)|--[^\n]*|'(?:[^']|'')*(?:'|$)|"[^"\n]*"?|:[A-Za-z_\uAC00-\uD7A3][\w\uAC00-\uD7A3]*|#\{[^}\n]*\}|\$\{[^}\n]*\}|<>|!=|<=|>=|\|\||:=|=>|\d+(?:\.\d+)?|[A-Za-z_\uAC00-\uD7A3$#][\w\uAC00-\uD7A3$#.]*|\S/g,out=[];let m;
  while((m=re.exec(code))){const v=m[0];out.push({v,k:v.startsWith("--")||v.startsWith("/*")?"c":v[0]==="'"||v[0]==='"'?"s":/^[A-Za-z_\uAC00-\uD7A3$#]/.test(v)&&!v.startsWith("#{")?"w":/^(?::[A-Za-z_\uAC00-\uD7A3]|#\{|\$\{)/.test(v)?"p":/^\d/.test(v)?"n":"o"})}
  return out;
}
const _SQL_UP=new Set(SQL_KW.slice(5,-3).split("|").concat(SQL_TY.slice(5,-3).split("|")));
function fmtSql(code){
  const T=_sqlTok(String(code||"").replace(/\r\n?/g,"\n")),IND="    ",out=[];
  let line="",level=0,ind=0,clause="",between=false;const frames=[];let inl=0;
  const flush=()=>{if(line.trim())out.push(IND.repeat(ind)+line.trim());line=""};
  const up=i=>(T[i]&&T[i].k==="w")?T[i].v.toUpperCase():"";
  const add=(txt,noSpace)=>{line+=(line&&!noSpace&&!/[(.]$/.test(line)?" ":"")+txt};
  const ITEMS=new Set(["SELECT","GROUP BY","ORDER BY","SET"]);
  for(let i=0;i<T.length;i++){
    const t=T[i],u=up(i);
    if(t.k==="c"){if(t.v.startsWith("--")){add(t.v);flush()}else add(t.v);continue}
    if(t.k==="w"){
      let kw=u,adv=0;
      if(u==="GROUP"&&up(i+1)==="BY"){kw="GROUP BY";adv=1}else if(u==="ORDER"&&up(i+1)==="BY"){kw="ORDER BY";adv=1}
      else if(u==="UNION"&&up(i+1)==="ALL"){kw="UNION ALL";adv=1}
      else if(u==="INSERT"&&up(i+1)==="INTO"){kw="INSERT INTO";adv=1}
      else if(u==="DELETE"&&up(i+1)==="FROM"){kw="DELETE FROM";adv=1}
      else if(u==="MERGE"&&up(i+1)==="INTO"){kw="MERGE INTO";adv=1}
      const MAJOR=["SELECT","FROM","WHERE","GROUP BY","HAVING","ORDER BY","UNION","UNION ALL","INTERSECT","MINUS","EXCEPT","LIMIT","OFFSET","INSERT INTO","UPDATE","DELETE FROM","SET","VALUES","MERGE INTO","WITH","RETURNING"];
      if(inl===0&&MAJOR.includes(kw)&&!(kw==="SET"&&clause==="")&&!(kw==="WITH"&&line)){
        flush();ind=level;add(kw);i+=adv;clause=kw;between=false;
        if(ITEMS.has(kw)){
          // DISTINCT 는 같은 줄에 둔다
          if(up(i+1)==="DISTINCT"||up(i+1)==="ALL"){add(up(i+1));i++}
          flush();ind=level+1;
        }
        continue;
      }
      if(inl===0&&(u==="JOIN"||((u==="LEFT"||u==="RIGHT"||u==="INNER"||u==="FULL"||u==="CROSS"||u==="NATURAL")&&(up(i+1)==="JOIN"||up(i+1)==="OUTER"||up(i+2)==="JOIN")))){
        let j=u;while(up(i+1)&&up(i)!=="JOIN"){i++;j+=" "+up(i)}
        flush();ind=level;add(j);clause="JOIN";continue;
      }
      if(inl===0&&u==="ON"&&clause==="JOIN"){flush();ind=level+1;add("ON");clause="ON";continue}
      if(inl===0&&(u==="AND"||u==="OR")&&(clause==="WHERE"||clause==="HAVING"||clause==="ON")){
        if(u==="AND"&&between){between=false;add("AND");continue}
        flush();ind=level+1;add(u);continue;
      }
      if(u==="BETWEEN")between=true;
      add(_SQL_UP.has(u)||["AND","OR","NOT","IN","IS","NULL","LIKE","AS","BETWEEN","EXISTS","CASE","WHEN","THEN","ELSE","END","DISTINCT","ON","USING","ASC","DESC"].includes(u)?u:t.v);
      continue;
    }
    if(t.v==="("){
      const sub=up(i+1)==="SELECT"||up(i+1)==="WITH";
      const prev=T[i-1],fn=prev&&prev.k==="w"&&!_SQL_UP.has(up(i-1))&&!["IN","AND","OR","NOT","ON","AS","EXISTS","VALUES","SET","WHERE","WHEN","THEN","ELSE","FROM","JOIN","BETWEEN"].includes(up(i-1));
      if(fn||line.endsWith("(")){line+="("}else add("(");
      if(sub&&inl===0){frames.push({sub:true,level,clause});flush();level+=1;ind=level;clause=""}
      else{frames.push({sub:false});inl++}
      continue;
    }
    if(t.v===")"){
      const f=frames.pop();
      if(f&&f.sub){flush();level=f.level;ind=level;clause=f.clause;line=")"}
      else{if(f)inl=Math.max(0,inl-1);line=line.replace(/\s+$/,"")+")"}
      continue;
    }
    if(t.v===","){
      line=line.replace(/\s+$/,"")+",";
      if(inl===0&&(ITEMS.has(clause)||clause==="FROM"||clause==="VALUES"&&false)){flush();ind=level+1}
      continue;
    }
    if(t.v===";"){line=line.replace(/\s+$/,"")+";";flush();out.push("");level=0;ind=0;clause="";frames.length=0;inl=0;continue}
    if(t.v==="."){line=line.replace(/\s+$/,"")+".";continue}
    add(t.v);
  }
  flush();
  // 항목이 하나뿐인 SELECT/GROUP BY/ORDER BY/SET 은 한 줄로 합친다
  const res=[];const indOf=l=>l.length-l.replace(/^ +/,"").length;
  for(let i=0;i<out.length;i++){
    const l=out[i],tr=l.trim();
    if(/^(?:SELECT(?: DISTINCT| ALL)?|GROUP BY|ORDER BY|SET)$/.test(tr)&&out[i+1]!==undefined&&out[i+1]!==""&&indOf(out[i+1])===indOf(l)+4&&!out[i+1].trim().endsWith(",")&&!out[i+1].trim().startsWith(")")&&(i+2>=out.length||indOf(out[i+2])<=indOf(l)||out[i+2]==="")&&out[i+1].trim().length<70){
      res.push(l+" "+out[i+1].trim());i++;continue;
    }
    res.push(l);
  }
  return _blank(res.join("\n"));
}

/* HTML/XML: 태그마다 줄을 나누고 깊이대로 들여쓰기 (script · style · pre 안쪽은 그대로) */
function fmtHtml(code,sqlText){
  code=String(code||"").replace(/\r\n?/g,"\n");
  const VOID=new Set("br img input meta link hr area base col embed source track wbr".split(" ")),RAW=new Set(["script","style","pre","textarea"]);
  const parts=[],re=/<!--[\s\S]*?(?:-->|$)|<![A-Za-z][^>]*>|<\?[\s\S]*?\?>|<\/?[A-Za-z][^<>]*>/g;let last=0,m;
  while((m=re.exec(code))){if(m.index>last)parts.push({t:"text",v:code.slice(last,m.index)});parts.push({t:"tag",v:m[0]});last=m.index+m[0].length}
  if(last<code.length)parts.push({t:"text",v:code.slice(last)});
  const nodes=[];
  for(let i=0;i<parts.length;i++){
    const p=parts[i];
    if(p.t==="text"){if(sqlText){const v=p.v.trim();if(v)nodes.push({k:"sql",v})}else{const v=p.v.replace(/\s+/g," ").trim();if(v)nodes.push({k:"text",v})}continue}
    const v=p.v,name=((v.match(/^<\/?([A-Za-z][\w:.-]*)/)||[])[1]||"").toLowerCase();
    if(/^<!--|^<!|^<\?/.test(v)){nodes.push({k:"raw",v});continue}
    if(v[1]==="/"){nodes.push({k:"close",v,name});continue}
    const self=/\/>$/.test(v)||VOID.has(name);
    if(!self&&RAW.has(name)){      // 닫는 태그까지의 안쪽은 그대로
      let j=i+1,inner="";while(j<parts.length&&!(parts[j].t==="tag"&&new RegExp("^</"+name+"\\s*>","i").test(parts[j].v))){inner+=parts[j].v;j++}
      nodes.push({k:"rawblock",open:v,inner:inner.replace(/^\n+|\s+$/g,""),close:parts[j]?parts[j].v:""});i=j;continue;
    }
    nodes.push({k:self?"self":"open",v,name});
  }
  const out=[];let d=0;const pad=()=>"  ".repeat(Math.max(0,d));
  for(let i=0;i<nodes.length;i++){
    const n=nodes[i];
    if(n.k==="open"&&nodes[i+1]&&nodes[i+1].k==="text"&&nodes[i+2]&&nodes[i+2].k==="close"&&nodes[i+2].name===n.name&&(n.v+nodes[i+1].v+nodes[i+2].v).length<=100){out.push(pad()+n.v+nodes[i+1].v+nodes[i+2].v);i+=2;continue}
    if(n.k==="open"&&nodes[i+1]&&nodes[i+1].k==="close"&&nodes[i+1].name===n.name){out.push(pad()+n.v+nodes[i+1].v);i++;continue}
    if(n.k==="open"){out.push(pad()+n.v);d++}
    else if(n.k==="close"){d--;out.push(pad()+n.v)}
    else if(n.k==="sql"){fmtSql(n.v).split("\n").forEach(l=>out.push(l?pad()+l:""))}
    else if(n.k==="rawblock"){out.push(pad()+n.open);if(n.inner){const lines=n.inner.split("\n"),min=Math.min(...lines.filter(l=>l.trim()).map(l=>l.length-l.replace(/^[ \t]+/,"").length),99);lines.forEach(l=>out.push(pad()+"  "+l.slice(Math.min(min,l.length-l.replace(/^[ \t]+/,"").length)).replace(/\s+$/,"")))}out.push(pad()+n.close)}
    else out.push(pad()+n.v);
  }
  return _blank(out.join("\n"));
}
function fmtCode(code,lang){
  lang=normLang(lang)||detectLang(code);
  if(lang==="sql")return fmtSql(code);if(lang==="json")return fmtJson(code);
  if(lang==="js"||lang==="java"||lang==="css")return fmtBrace(code,lang);
  if(lang==="html")return fmtHtml(code);
  if(lang==="mybatis")return fmtHtml(code,true);
  return fmtPlain(code);
}
/* 정리 미리보기: 왼쪽 정리 전 / 오른쪽 정리 후(직접 고칠 수 있음). 적용하면 글자를, 취소하면 null */
async function codeFmtDialog(code,lang0){
  const lang=normLang(lang0)||detectLang(code);
  const first=fmtCode(code,lang);
  if(first===String(code||"").replace(/\r\n?/g,"\n").trim()){toast("이미 정리된 코드예요 ✓",2000);return null}
  const body=`<div class="cf-wrap"><div class="cf-bar"><span class="meta">언어</span><select id="cfL">${LANGS.filter(x=>x[0]).map(([v,l])=>`<option value="${v}" ${v===lang?"selected":""}>${l}</option>`).join("")}</select>
      <span class="meta">정리 결과가 이상하면 오른쪽 칸에서 직접 고친 뒤 <b>적용</b>하세요. <b>취소</b>하면 원본 그대로예요.</span></div>
    <div class="cf-cols"><div class="cf-col"><div class="meta">정리 전</div><pre class="cf-pre" id="cfPre"></pre></div>
      <div class="cf-col"><div class="meta">정리 후 (고칠 수 있어요)</div><div class="cf-edit"><pre class="cf-hl" id="cfHl" aria-hidden="true"></pre><textarea id="cfT" spellcheck="false" wrap="off"></textarea></div></div></div></div>`;
  const pr=wdlg({title:"✨ 코드 정리",body,ok:"적용",wide:true,collect:()=>({text:$("#cfT").value,lang:$("#cfL").value})});
  const ta=$("#cfT"),hl=$("#cfHl"),sel=$("#cfL");
  const paint=()=>{hl.innerHTML=hlHtml(ta.value,sel.value)+"\n ";hl.scrollTop=ta.scrollTop;hl.scrollLeft=ta.scrollLeft};
  $("#cfPre").innerHTML=hlHtml(code,lang);
  ta.value=first;paint();
  ta.oninput=paint;ta.onscroll=()=>{hl.scrollTop=ta.scrollTop;hl.scrollLeft=ta.scrollLeft};
  sel.onchange=()=>{ta.value=fmtCode(code,sel.value);$("#cfPre").innerHTML=hlHtml(code,sel.value);paint()};
  const r=await pr;return r||null;
}

/* ---- 이름표(자리표시자): :이름 · #{이름} · ${이름} 을 찾아서 값을 넣어 복사 ---- */
const _isSqlish=(code,lang)=>{const l=normLang(lang)||detectLang(code);return l==="sql"||l==="mybatis"};
function findPlaceholders(code,lang){
  const names=[],seen=new Set(),push=n=>{if(!seen.has(n)){seen.add(n);names.push(n)}};
  const sqlish=_isSqlish(code,lang),hl=(normLang(lang)||detectLang(code));
  // 문자열 · 주석 안은 제외하고 찾는다 (MyBatis 는 태그 밖 글이 SQL)
  hlTokens(code,sqlish?(hl==="mybatis"?"mybatis":"sql"):"js").forEach(([t,s])=>{
    if(t==="c")return;
    if(t==="st"&&!/#\{|\$\{/.test(s))return;
    let m;const re=/#\{\s*([^}\s,]+)[^}]*\}|\$\{\s*([^}\s]+)\s*\}/g;
    while((m=re.exec(s)))push(m[1]||m[2]);
    if(sqlish&&hl==="sql"&&(t==="pa"||t==="")){const r2=/(?:^|[^\w:]):([A-Za-z_\uAC00-\uD7A3][\w\uAC00-\uD7A3]*)/g;let q;while((q=r2.exec(s)))push(q[1]);if(t==="pa"&&s[0]===":"&&!/^::/.test(s))push(s.slice(1))}
  });
  return names;
}
function fillPlaceholders(code,vals,lang){
  const sqlish=_isSqlish(code,lang),hl=(normLang(lang)||detectLang(code));
  let out=code;
  out=out.replace(/#\{\s*([^}\s,]+)[^}]*\}/g,(m,n)=>n in vals?vals[n]:m);
  out=out.replace(/\$\{\s*([^}\s]+)\s*\}/g,(m,n)=>n in vals?vals[n]:m);
  if(sqlish&&hl==="sql")out=out.replace(/(^|[^\w:]):([A-Za-z_\uAC00-\uD7A3][\w\uAC00-\uD7A3]*)/g,(m,pre,n)=>n in vals?pre+vals[n]:m);
  return out;
}
const _SQL_BARE=/^(?:null|sysdate|systimestamp|current_timestamp|current_date|now\(\)|default|true|false|-?\d+(?:\.\d+)?)$/i;

function _phQuote(v,q,sqlish){      // 값에 따옴표를 붙일지: 자동 = 숫자 · NULL · SYSDATE 같은 것은 그대로, 나머지는 '문자열'
  if(v==="")return undefined;
  const wrap=sqlish&&(q==="str"||(q==="auto"&&!_SQL_BARE.test(v)&&!/^'.*'$/.test(v)&&!/^\w+\(.*\)$/.test(v)));
  return wrap?"'"+v.replace(/'/g,"''")+"'":v;
}
async function copyCodeSmart(code,lang,okMsg){      // 이름표가 있으면 값을 물어보고 채워서 복사, 없으면 그냥 복사
  const names=findPlaceholders(code,lang);
  if(!names.length){copyText(code,okMsg||"복사했어요");return true}
  const sqlish=_isSqlish(code,lang),saved=ui.phVals||{};      // 지난번에 입력한 값은 미리 채워 둔다
  const buildFrom=get=>{const vals={};names.forEach(n=>{const r=get(n);if(r&&r.v!==""){const v=_phQuote(r.v,r.q||"auto",sqlish);if(v!==undefined)vals[n]=v}});return fillPlaceholders(code,vals,lang)};
  const rows=names.map(n=>`<div class="frow phrow"><label title="${esc(n)}">${esc(n)}</label><input type="text" data-ph="${esc(n)}" value="${esc(saved[n]||"")}" placeholder="값" autocomplete="off">${sqlish?`<select data-pq="${esc(n)}" title="SQL 문자열이면 따옴표를 붙여요"><option value="auto">자동</option><option value="raw">그대로</option><option value="str">'문자열'</option></select>`:""}</div>`).join("");
  const body=`<div class="rngd">${rows}<div class="meta" style="margin:8px 0 4px">미리보기</div><pre class="qv-peek" id="phPre"></pre><div class="meta">값을 비워 두면 그 이름표는 그대로 남아요. 입력한 값은 다음에 미리 채워 줘요.</div></div>`;
  const cur=n=>({v:($(`[data-ph="${CSS.escape(n)}"]`)||{}).value||"",q:($(`[data-pq="${CSS.escape(n)}"]`)||{}).value||"raw"});
  let raw=false;
  const snapAll=()=>{const sn={};names.forEach(n=>{sn[n]=cur(n)});return sn};      // 창이 닫히면 칸이 사라지므로, 닫히는 순간에 값을 모아 둔다
  const pr=wdlg({title:"📋 이름표에 값 넣어 복사",body,ok:"값 넣어 복사",cancel:"취소",wide:true,collect:snapAll});
  const extra=document.createElement("button");extra.type="button";extra.textContent="이름표 그대로 복사";extra.onclick=()=>{raw=true;$("#wyes").click()};
  const btns=document.querySelector("#wdlg .wbtn");btns.insertBefore(extra,$("#wyes"));
  const paint=()=>{const el=$("#phPre");if(el)el.innerHTML=hlHtml(buildFrom(cur),(normLang(lang)||detectLang(code)))};
  document.querySelectorAll("#wdlg [data-ph],#wdlg [data-pq]").forEach(e=>{e.oninput=paint;e.onchange=paint});paint();
  const first=document.querySelector("#wdlg [data-ph]");if(first)first.focus();
  const snap=await pr;
  if(!snap)return false;
  if(raw){copyText(code,"이름표 그대로 복사했어요");return true}
  const keep={...saved};names.forEach(n=>{if(snap[n].v)keep[n]=snap[n].v});
  ui.phVals=Object.fromEntries(Object.entries(keep).slice(-60));saveUI();
  copyText(buildFrom(n=>snap[n]),okMsg||"값을 넣어 복사했어요");return true;
}
