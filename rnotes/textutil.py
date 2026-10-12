"""레드마인 본문(HTML)을 읽기 쉬운 글자로 바꾸는 작은 도구"""
import html
import re



def plain(text):
    """레드마인 본문(HTML일 수 있음)을 읽기 쉬운 일반 글자로 바꾼다."""
    text = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</li>", "\n", text or "")
    text = html.unescape(re.sub(r"<[^>]+>", "", text)).replace("\xa0", " ")
    return re.sub(r"\n\s*\n+", "\n", text).strip()


def make_draft(description):
    """요건 초안 = 레드마인 본문 전체 (description은 이미 plain 처리된 값이라 다시 가공하지 않는다)."""
    return description
