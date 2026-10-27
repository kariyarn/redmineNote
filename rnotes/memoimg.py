"""메모(포스트잇)에 붙여 넣은 사진(스샷) 저장.
노트 DB 가 아니라 데이터 폴더의 memo_img/ 에 파일로 둔다: 깃허브 백업 · 로컬 백업(zip)은 notes.db(와 폰트)만 담으므로 사진은 들어가지 않는다.
이름은 내용의 해시라서 같은 사진을 또 붙여도 파일은 하나다. 어느 포스트잇도 쓰지 않는 사진은 켤 때 정리한다(되돌리기를 위해 하루는 둔다)."""
import hashlib
import json
import re
import time

from .config import MEMO_IMG_DIR
from .storage import db

IMG_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif"}
IMG_CTYPE = {v: k for k, v in IMG_TYPES.items()}
NAME_RE = re.compile(r"[0-9a-f]{40}\.(?:png|jpg|webp|gif)")
MAX_IMG = 15 * 1024 * 1024


def save(raw, ctype):
    ext = IMG_TYPES.get((ctype or "").split(";")[0].strip().lower())
    if not ext:
        raise ValueError("사진(png · jpg · webp · gif)만 붙일 수 있어요")
    if not raw or len(raw) > MAX_IMG:
        raise ValueError("사진이 비어 있거나 너무 커요 (최대 15MB)")
    name = hashlib.sha1(raw).hexdigest() + ext
    MEMO_IMG_DIR.mkdir(parents=True, exist_ok=True)
    p = MEMO_IMG_DIR / name
    if not p.exists():
        p.write_bytes(raw)
    return name


def path_of(name):
    """보낼 사진 파일 (이름이 올바르지 않거나 없으면 None)."""
    if not NAME_RE.fullmatch(name or ""):
        return None
    p = MEMO_IMG_DIR / name
    return p if p.is_file() else None


def clean_names(v):
    """포스트잇에 저장할 사진 이름 목록 (형식에 맞는 것만, 순서 유지, 최대 20장)."""
    out = []
    for x in v if isinstance(v, list) else []:
        if isinstance(x, str) and NAME_RE.fullmatch(x) and x not in out:
            out.append(x)
    return out[:20]


def gc(keep_sec=86400):
    """어느 포스트잇도 쓰지 않고, 만든 지 하루가 지난 사진 파일을 지운다. 지운 수를 돌려준다."""
    if not MEMO_IMG_DIR.is_dir():
        return 0
    used = set()
    with db() as c:
        for r in c.execute("SELECT imgs FROM sticky WHERE imgs IS NOT NULL AND imgs != '[]'"):
            try:
                used.update(clean_names(json.loads(r["imgs"] or "[]")))
            except ValueError:
                pass
    now, n = time.time(), 0
    for f in MEMO_IMG_DIR.iterdir():
        if f.is_file() and NAME_RE.fullmatch(f.name) and f.name not in used and now - f.stat().st_mtime > keep_sec:
            try:
                f.unlink()
                n += 1
            except OSError:
                pass
    return n
