"""설정 · 경로 · 첫 실행 준비 · 공유 상태(conn, STATE, RUN)"""
import datetime
import json
import os
import shutil
import sqlite3
import sys
import time
from pathlib import Path
from types import SimpleNamespace

from . import channel as _channel



FROZEN = getattr(sys, "frozen", False)  # exe 로 묶여 실행 중인지
ROOT_DIR = Path(__file__).resolve().parent.parent   # 소스로 실행할 때의 프로젝트 폴더 (main.py 가 있는 곳)
APP_DIR = Path(getattr(sys, "_MEIPASS", None) or ROOT_DIR)  # web/ · icon.ico 가 있는 곳 (읽기 전용)
WEB_DIR = APP_DIR / "web"   # 화면(HTML · CSS · JS)
EXE_DIR = Path(sys.executable).parent if FROZEN else ROOT_DIR  # 예전 방식(프로그램 폴더)의 데이터 위치
DEFAULT_URL = ""  # 레드마인 주소는 첫 실행 설정 화면에서 입력
APP_VERSION = "2.21.2"  # 기능을 고칠 때 올린다. DB 에 기록되어 업데이트 직전 백업 · 낮은 버전 경고에 쓴다.
UPGRADE_BACKUP_KEEP = 5
ALIVE_SEC = int(os.environ.get("REDMINE_NOTES_ALIVE_SEC") or 90)  # 화면 신호가 이 안에 있었으면 "창이 열려 있다"고 본다
IDLE_QUIT_SEC = int(os.environ.get("REDMINE_NOTES_IDLE_SEC") or 600)  # 화면 신호가 이만큼 끊기면 스스로 종료 (0 = 끄지 않음)
# 정식(stable) / 베타(beta): 실행 환경(포트 · 창 제목 · 앱 창 프로필 · 작업 표시줄 묶음 · 설치 위치 · exe 이름)은 따로,
# 노트 데이터(HOME_DIR · DATA_DIR)는 같이 쓴다. 같은 데이터를 쓰므로 한 번에 하나만 켠다 (main.run 이 다른 채널이 켜져 있으면 알리고 끝낸다).
CHANNEL = os.environ.get("REDMINE_NOTES_CHANNEL") or _channel.CHANNEL
CHANNEL = CHANNEL if CHANNEL in ("stable", "beta") else "stable"
BETA = CHANNEL == "beta"
BUILD = (os.environ.get("REDMINE_NOTES_BUILD") or _channel.BUILD or "").strip()
APP_TITLE = "레드마인 노트 2 (베타)" if BETA else "레드마인 노트 2"   # 화면 <title> · 앱 창 찾기 · 작업 표시줄 이름
VERSION_LABEL = (f"{APP_VERSION} 베타" + (f" ({BUILD[:7]})" if BUILD else "")) if BETA else APP_VERSION   # 보여 줄 때만 (DB 에 남기는 버전은 APP_VERSION)
CHANNEL_PORTS = {"stable": 8791, "beta": 8792}
PORT = int(os.environ.get("REDMINE_NOTES_PORT") or CHANNEL_PORTS[CHANNEL])   # 2.0 은 1.x(8790)와 따로 쓴다
OTHER_CHANNEL = "stable" if BETA else "beta"
LINKED_LIMIT = 300  # 한 번에 받아올 연관 일감 최대 수 (레드마인 부하 방지)
AUTO_BACKUP_KEEP = 14  # 자동 백업 보관 개수
MAX_UPLOAD = 80 * 1024 * 1024
FONT_EXT = {".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2"}
SETTING_KEYS = {
    "auto_check", "font_body", "font_mono", "font_size", "line_height", "font_names",
    "notify_flash", "notify_toast",                                   # 앱 창을 보고 있지 않을 때: 작업 표시줄 반짝임 · 윈도우 알림 (기본 켬)
    "update_auto", "update_skip",                                     # 앱 업데이트: 자동 확인(기본 켬) · '이 버전 건너뛰기'
    "auto_sync_min", "auto_sync_days", "auto_sync_notify",           # 자동 가져오기: 간격(분, 0 = 끔) · 기간(최근 N일, 최대 7) · 새 일감 알림
    "graph_limit", "graph_terms", "graph_term_link", "graph_color",  # 그래프
    "stale_days", "stale_progress", "watch_hidden", "watch_auto_days", "holiday_extra",                                  # 오래 대기 경고 기준
    "st_dev", "st_confirm", "st_done",                               # 상태 버튼이 보내는 레드마인 상태 번호 (개발중 / 최종확인요청 / 완료)
    "write_ack_first", "write_ack_status", "patchnote_seen",                           # 쓰기 안내 창을 '다시 보지 않기' 했는지
    "ui_prefs2",                                                     # 화면 설정(테마·정렬·패널 너비 등): 어느 창으로 열어도 같게
    "rm_seen",                                                       # 안 본 일감 강조: 일감별로 마지막으로 열어 본 레드마인 수정일
}

# 저장 위치: 사용자별 폴더에 자동으로 만든다 (바꾸고 싶으면 설정 화면에서 지정).
#  - HOME_DIR : 항상 고정. 설정 파일(API 키)과 '데이터 위치 포인터'가 있다.
#  - DATA_DIR : 노트 DB · 백업 · 폰트. 기본은 HOME_DIR 과 같고, 설정에서 옮길 수 있다.
HOME_DIR = Path(
    os.environ.get("REDMINE_NOTES_HOME")
    or (Path(os.environ.get("APPDATA") or (Path.home() / "AppData" / "Roaming")) / "RedmineNotes2")
)
CONFIG_PATH = HOME_DIR / "config.json"
POINTER_PATH = HOME_DIR / "location.json"


def _read_json(p):
    try:
        return json.loads(p.read_text(encoding="utf-8-sig"))
    except Exception:
        return {}


def resolve_data_dir():
    d = _read_json(POINTER_PATH).get("data_dir")
    if d and Path(d).is_dir():
        return Path(d)
    return HOME_DIR


def load_env(folder):
    env = {}
    p = folder / ".env"
    if p.exists():
        for line in p.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


conn = SimpleNamespace(url="", key="", dev_field="18", key_problem=False)   # 바뀔 수 있는 연결 설정(주소 · 키 · 개발담당자 필드)은 한 객체에 둔다
RUN = SimpleNamespace(tray=None)   # 실행 중에 생기는 것(트레이 아이콘)


def _read_key(cfg):
    """설정 파일에서 API 키를 꺼낸다. 암호화돼 있으면 풀고, 예전 평문이면 그대로 돌려준다."""
    if cfg.get("api_key_enc"):
        v = None
        try:
            from . import secret
            v = secret.unprotect(cfg["api_key_enc"])
        except Exception:
            pass
        if v is None:
            conn.key_problem = True
            return ""
        return v
    return cfg.get("api_key", "")


def _write_config(url, key, field_id):
    """설정 파일 쓰기. 윈도우에서는 API 키를 사용자별 암호화(DPAPI)해서 저장하고, 안 되면 평문으로 둔다."""
    data = {"url": url, "dev_field_id": field_id}
    enc = None
    if sys.platform == "win32" and key:
        try:
            from . import secret
            enc = secret.protect(key)
        except Exception:
            enc = None
    if enc:
        data["api_key_enc"] = enc
        data["protected"] = "windows-dpapi"
    else:
        data["api_key"] = key
    CONFIG_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _legacy_home():
    env = os.environ.get("REDMINE_NOTES_LEGACY_HOME")
    if env:
        return Path(env)
    if os.environ.get("REDMINE_NOTES_HOME"):  # 시험·개발용으로 홈을 따로 지정했으면 자동으로 가져오지 않는다
        return None
    return Path(os.environ.get("APPDATA") or (Path.home() / "AppData" / "Roaming")) / "RedmineNotes"


def import_legacy(data):
    """2.0 을 처음 켤 때 1.x(레드마인 노트)의 노트·설정을 '복사'해 온다. 1.x 데이터는 건드리지 않는다."""
    mark = HOME_DIR / ".imported-v1"
    if mark.exists() or (data / "notes.db").exists():
        return
    old = _legacy_home()
    if not old or not old.is_dir():
        return
    old_data = Path(_read_json(old / "location.json").get("data_dir") or old)
    src_db = old_data / "notes.db"
    if not src_db.is_file():
        return
    try:
        src = sqlite3.connect(src_db.as_uri() + "?mode=ro", uri=True)
        dst = sqlite3.connect(data / "notes.db")
        with dst:
            src.backup(dst)
        src.close()
        dst.close()
        if (old_data / "fonts").is_dir():
            shutil.copytree(old_data / "fonts", data / "fonts", dirs_exist_ok=True)
        if not CONFIG_PATH.exists() and (old / "config.json").is_file():
            shutil.copy2(old / "config.json", CONFIG_PATH)  # 암호화된 키는 같은 PC·같은 계정에서 그대로 열린다
        mark.write_text("1")
    except Exception:
        pass  # 가져오기에 실패해도 2.0 은 빈 상태로 시작한다 (1.x 데이터는 그대로)


def bootstrap():
    """처음 실행 준비: 폴더 만들기, 예전(프로그램 폴더) 데이터와 .env 를 한 번만 가져오기."""
    HOME_DIR.mkdir(parents=True, exist_ok=True)
    data = resolve_data_dir()
    data.mkdir(parents=True, exist_ok=True)
    import_legacy(data)
    if EXE_DIR.resolve() != data.resolve():
        if not (data / "notes.db").exists() and (EXE_DIR / "notes.db").exists():
            shutil.copy2(EXE_DIR / "notes.db", data / "notes.db")  # 원본은 그대로 둔다 (복사)
            for sub in ("backups", "fonts"):
                if (EXE_DIR / sub).is_dir():
                    shutil.copytree(EXE_DIR / sub, data / sub, dirs_exist_ok=True)
        if not CONFIG_PATH.exists() and (EXE_DIR / ".env").exists():
            env = load_env(EXE_DIR)
            if env.get("REDMINE_API_KEY"):
                _write_config(env.get("REDMINE_URL", DEFAULT_URL).rstrip("/"), env["REDMINE_API_KEY"],
                              env.get("DEV_FIELD_ID", "18"))
    return data


DATA_DIR = bootstrap()
DB_PATH = DATA_DIR / "notes.db"
BACKUP_DIR = DATA_DIR / "backups"
FONT_DIR = DATA_DIR / "fonts"

CFG = _read_json(CONFIG_PATH)
conn.url = (CFG.get("url") or DEFAULT_URL).rstrip("/")
conn.key = _read_key(CFG)
conn.dev_field = str(CFG.get("dev_field_id") or "18")  # 개발담당자 사용자 지정 필드
STATE = {"served": False, "me_id": None, "me_name": None, "newer_db": None, "last_ping": time.time(),
         "last_active": time.time(), "started": datetime.datetime.now().isoformat(timespec="minutes")}
