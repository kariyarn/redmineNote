"""인증 요청 공통 전송. 같은 origin을 포함한 모든 리다이렉트를 거절한다."""
import urllib.error
import urllib.request


class RedirectBlocked(urllib.error.HTTPError):
    def __init__(self, url, code):
        super().__init__(url, code, "인증 요청의 리다이렉트를 거절했어요. 설정의 최종 API 주소를 확인하세요", {}, None)


class NoAuthRedirect(urllib.request.HTTPRedirectHandler):
    def http_error_302(self, req, fp, code, msg, headers):
        fp.close()
        raise RedirectBlocked(req.full_url, code)

    http_error_301 = http_error_303 = http_error_307 = http_error_308 = http_error_302


def open_authenticated(request, timeout=30):
    # 전역 opener에 의존하지 않아 다른 기능이 등록한 redirect handler도 사용하지 않는다.
    return urllib.request.build_opener(NoAuthRedirect()).open(request, timeout=timeout)
