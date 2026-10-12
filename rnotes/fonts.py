"""글꼴 파일 목록"""

from .config import FONT_DIR, FONT_EXT


def font_files():
    FONT_DIR.mkdir(exist_ok=True)
    return [
        {"file": f.name, "family": f.stem, "size": f.stat().st_size}
        for f in sorted(FONT_DIR.iterdir())
        if f.is_file() and f.suffix.lower() in FONT_EXT
    ]
