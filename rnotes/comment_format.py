"""댓글 전송 형식. HTML은 허용 목록을 검증하며 서버의 formatter를 추측하지 않는다."""
from html.parser import HTMLParser
import re
import urllib.parse

FORMATS = {"legacy", "source", "html", "markdown", "textile"}
TAGS = set("p div span br strong b em i u s strike del h1 h2 h3 h4 h5 h6 ul ol li blockquote a table thead tbody tfoot tr th td caption colgroup col pre code img hr font sup sub".split())
VOID = {"br", "img", "hr", "col"}
ATTRS = {"title", "class", "style", "href", "src", "alt", "width", "height", "colspan", "rowspan", "start", "data-rich-file-id", "face", "color", "size"}


def image_path(value, base=""):
    """이미지 전용 상대 경로. 인코딩은 보존하고 인증/관리 URL과 우회 경로는 거절한다."""
    try:
        if not isinstance(value, str): return ""
        value = value.strip()
        decoded = value
        for _ in range(3):
            decoded = urllib.parse.unquote(decoded)
            if re.search(r"[\x00-\x1f\x7f\\]", decoded) or ".." in decoded or decoded.startswith("//"): return ""
        parsed, origin = urllib.parse.urlsplit(value), urllib.parse.urlsplit(base)
        def key(p): return p.scheme.lower(), (p.hostname or "").lower(), p.port or {"http": 80, "https": 443}.get(p.scheme.lower())
        if parsed.username or parsed.password or parsed.netloc and not parsed.scheme: return ""
        if parsed.scheme and (parsed.scheme not in ("http", "https") or key(parsed) != key(origin)): return ""
        path = parsed.path
        prefix = origin.path.rstrip("/")
        if prefix and path.startswith(prefix + "/"): path = path[len(prefix):]
        decoded_path = urllib.parse.unquote(path)
        if not re.fullmatch(r"/(?:system/[^?#]+|attachments/(?:download/|thumbnail/)?[0-9]+(?:/[^?#]+)?|rich/files/[0-9]+/[^?#]+)", decoded_path): return ""
        for name, val in urllib.parse.parse_qsl(parsed.query, keep_blank_values=True):
            if name not in ("size", "width", "height", "t") or not re.fullmatch(r"[0-9]{1,13}(?:x[0-9]{1,5})?", val): return ""
        return urllib.parse.quote(path, safe="/%:@!$&'()*+,;=-._~") + ("?" + parsed.query if parsed.query else "")
    except (ValueError, TypeError):
        return ""


def attachment_image_url(value, aid, base):
    """REST content_url만 공개한다. 자격 증명/쿼리/다른 origin/다른 첨부 ID는 거절."""
    try:
        if not isinstance(value, str) or not safe_url(value, True, base):
            return ""
        absolute = urllib.parse.urljoin(base.rstrip("/") + "/", value)
        parsed = urllib.parse.urlsplit(absolute)
        path = urllib.parse.unquote(parsed.path)
        prefix = urllib.parse.urlsplit(base).path.rstrip("/")
        if prefix and path.startswith(prefix + "/"):
            path = path[len(prefix):]
        if parsed.query or parsed.fragment or not re.fullmatch(r"/attachments/(?:download/)?" + re.escape(str(aid)) + r"/[^/]+", path):
            return ""
        return absolute
    except (ValueError, TypeError):
        return ""


def safe_url(value, image=False, base=""):
    if image:
        return bool(image_path(value, base))
    value = value.strip()
    decoded = urllib.parse.unquote(value)
    if not value or re.search(r"[\x00-\x1f\x7f\\]", decoded) or decoded.startswith("//"):
        return False
    parsed = urllib.parse.urlsplit(value)
    if parsed.username or parsed.password:
        return False
    return parsed.scheme.lower() in ("http", "https", "mailto") or (not parsed.scheme and not value.startswith("//"))


def safe_style(value):
    for part in value.split(";"):
        if not part.strip():
            continue
        key, sep, val = part.partition(":")
        key, val = key.strip().lower(), val.strip().lower()
        if not sep:
            return False
        if key in ("color", "background-color"):
            if not re.fullmatch(r"#[0-9a-f]{3}(?:[0-9a-f]{3})?|rgba?\([0-9., %]+\)|black|white|red|blue|green|transparent", val):
                return False
        elif key == "font-size":
            if not re.fullmatch(r"(?:[1-6]?\d|7[0-2])px|(?:[89]|[12]\d|30)pt|(?:[5-9]\d|[12]\d\d|300)%|small|medium|large", val): return False
        elif key == "text-align":
            if val not in ("left", "center", "right", "justify"): return False
        elif key == "margin-left":
            if not re.fullmatch(r"(?:0|[1-9][0-9]?|1[0-5][0-9]|160)px", val): return False
        elif key == "font-weight":
            if val not in ("normal", "bold", "400", "700"): return False
        elif key == "font-style":
            if val not in ("normal", "italic"): return False
        elif key == "text-decoration":
            if val not in ("none", "underline", "line-through", "underline line-through"): return False
        elif key == "font-family":
            if not re.fullmatch(r"[a-z0-9가-힣 ,\"'-]{1,100}", val): return False
        elif key == "line-height":
            if not re.fullmatch(r"normal|1(?:\.\d+)?|2(?:\.[0-5])?", val): return False
        elif key in ("width", "height", "max-width"):
            if not (val == "auto" or re.fullmatch(r"(?:[1-9]\d?|100)%", val) or re.fullmatch(r"\d{1,4}px", val) and int(val[:-2]) <= 4096): return False
        elif re.fullmatch(r"(?:margin|padding)(?:-(?:left|right|top|bottom))?", key):
            if len(val.split()) > 4 or not all(re.fullmatch(r"0|[0-5]?\dpx|6[0-4]px|[0-2](?:\.\d)?em", x) for x in val.split()): return False
        else:
            return False
    return True


class _CheckHTML(HTMLParser):
    def __init__(self, base):
        super().__init__(convert_charrefs=False)
        self.base, self.stack, self.visible = base, [], False

    def handle_starttag(self, tag, attrs):
        if tag not in TAGS:
            raise ValueError("허용되지 않은 HTML 태그가 있어요. 원문과 서버 형식을 확인하세요")
        if tag in ("img", "table", "pre", "hr"):
            self.visible = True
        for key, value in attrs:
            value = value or ""
            if key not in ATTRS or key.startswith("on"):
                raise ValueError("허용되지 않은 HTML 속성이 있어요")
            if key in ("href", "src") and (key == "href" and tag != "a" or key == "src" and tag != "img" or not safe_url(value, key == "src", self.base)):
                raise ValueError("안전하지 않은 링크 또는 이미지 주소예요")
            if key == "style" and not safe_style(value):
                raise ValueError("허용되지 않은 HTML 스타일이 있어요")
            if key == "class" and not re.fullmatch(r"[A-Za-z0-9_ -]{0,200}", value):
                raise ValueError("허용되지 않은 HTML 클래스예요")
            if (key == "data-rich-file-id" and (tag != "img" or not re.fullmatch(r"[0-9]{1,12}", value)) or
                key in ("face", "color", "size") and (tag != "font" or not (safe_style(("font-family:" if key == "face" else "color:") + value) if key != "size" else re.fullmatch(r"[1-7]", value)))):
                raise ValueError("HTML 글꼴·이미지 속성이 올바르지 않아요")
            if key in ("width", "height", "colspan", "rowspan", "start") and not re.fullmatch(r"[1-9][0-9]{0,3}", value):
                raise ValueError("HTML 표·이미지 크기가 올바르지 않아요")
        if tag not in VOID:
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag not in TAGS or tag in VOID or not self.stack or self.stack.pop() != tag:
            raise ValueError("HTML 태그의 짝이 맞지 않아요. 원문을 확인하세요")

    def handle_comment(self, data):
        raise ValueError("HTML 주석은 지원하지 않아요")

    def handle_decl(self, decl):
        raise ValueError("HTML 문서 선언은 지원하지 않아요")

    def handle_data(self, data):
        if "<" in data:
            raise ValueError("닫히지 않은 HTML 표기가 있어요. 코드의 < 문자는 &lt;로 작성하세요")
        if data.strip():
            self.visible = True

    def handle_entityref(self, name):
        if name != "nbsp": self.visible = True

    def handle_charref(self, name):
        try:
            if chr(int(name[1:], 16) if name.startswith(("x", "X")) else int(name)).strip(): self.visible = True
        except (ValueError, OverflowError):
            raise ValueError("HTML 문자 참조가 올바르지 않아요")


class _ActiveHTMLCheck(HTMLParser):
    """원문/마크업 모드도 실행 가능한 HTML은 전송하지 않는다. 원문 자체는 변환하지 않는다."""
    def __init__(self, base):
        super().__init__(convert_charrefs=True)
        self.base = base

    def handle_starttag(self, tag, attrs):
        if tag in set("script style iframe object embed svg math form input button link meta base template video audio source".split()):
            raise ValueError("실행 가능한 HTML은 댓글로 전송할 수 없어요")
        for key, value in attrs:
            value = value or ""
            if key.startswith("on") or key in ("srcdoc", "formaction", "action"):
                raise ValueError("실행 가능한 HTML 속성이 있어요")
            if key in ("href", "src", "xlink:href", "data-cke-saved-src", "data-cke-saved-href") and not safe_url(value, key in ("src", "data-cke-saved-src"), self.base):
                raise ValueError("안전하지 않은 HTML 주소예요")
            if key == "style" and not safe_style(value):
                raise ValueError("안전하지 않은 HTML 스타일이에요")

    handle_startendtag = handle_starttag


def check_format(value, mode, base=""):
    if mode not in FORMATS:
        raise ValueError("지원하지 않는 댓글 형식이에요")
    if mode == "html" and value:
        parser = _CheckHTML(base)
        parser.feed(value)
        if "<" in parser.rawdata:
            raise ValueError("닫히지 않은 HTML 표기가 있어요")
        parser.close()
        if parser.stack or parser.rawdata.strip():
            raise ValueError("HTML 태그가 닫히지 않았어요")
        if not parser.visible:
            return ""
    elif value:
        checked = re.sub(r"```[^\n]*\n[\s\S]*?```", "", value) if mode in ("legacy", "markdown") else value
        if mode in ("legacy", "markdown"):
            checked = re.sub(r"`[^`\n]+`", "", checked)
        parser = _ActiveHTMLCheck(base)
        parser.feed(checked)
        if "<" in parser.rawdata:
            raise ValueError("닫히지 않은 HTML 표기가 있어요")
        parser.close()
        if "<" in parser.rawdata:
            raise ValueError("닫히지 않은 HTML 표기가 있어요")
    return value
