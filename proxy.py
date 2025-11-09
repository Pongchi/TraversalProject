import asyncio
import queue
from PySide6.QtCore import QThread
from dataclasses import dataclass, field
from typing import Dict
import re
import mitmproxy.http
from urllib.parse import urlparse
import os

from mitmproxy.tools.dump import DumpMaster
from mitmproxy import options
from mitmproxy import http

@dataclass
class FlowData:
    flow_id: str  
    method: str
    url: str
    path: str
    http_version: str
    status_code: str
    request_headers: dict
    request_body: bytes
    response_headers: dict
    response_body: bytes
    
    def get_request_display(self) -> str:
        first_line = f"{self.method} {self.path} {self.http_version}"
        headers = "\n".join(f"{k}: {v}" for k, v in self.request_headers.items())
        try:
            body = self.request_body.decode('utf-8', errors='replace')
        except: body = "[Error] 바디를 디코딩할 수 없습니다."
        return f"{first_line}\n{headers}\n\n{body}"

    def get_response_display(self) -> str:
        headers = "\n".join(f"{k}: {v}" for k, v in self.response_headers.items())
        try:
            body = self.response_body.decode('utf-8', errors='replace')
        except: body = "[Error] 바디를 디코딩할 수 없습니다."
        return f"--- HEADERS ---\n{headers}\n\n--- BODY ---\n{body}"

class PySideAddon:
    def __init__(self, shared_queue: queue.Queue):
        self.queue = shared_queue
        self.flows_by_id: Dict[str, mitmproxy.http.HTTPFlow] = {}
        self.scope_regex = None
        # 차단할 정적 파일 확장자 목록
        self.blocked_extensions = {
            '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
            '.mp3', '.mp4', '.woff', '.woff2', '.ttf', '.eot', '.webp'
        }
        # 차단할 Content-Type 목록 (소문자로 비교)
        self.blocked_content_types = {
            'application/javascript', 'text/css', 'image/', 'video/', 'audio/',
            'font/', 'application/font-woff'
        }
        self.blocked_domains = {
            "google-analytics.com", "googletagmanager.com",
            "content-autofill.googleapis.com",
        }

    def set_scope(self, pattern: str):
        """와일드카드 패턴을 정규식으로 변환하여 저장합니다."""
        if not pattern:
            self.scope_regex = None
            print("Scope 필터가 해제되었습니다.")
            return

        try:
            # 와일드카드(*)를 정규식(.*)으로 변환하고, 다른 특수문자는 escape 처리
            regex_pattern = re.escape(pattern).replace('\\*', '.*')
            self.scope_regex = re.compile(f"^{regex_pattern}$")
            print(f"Scope 필터가 설정되었습니다: {pattern}")
        except re.error as e:
            print(f"잘못된 Scope 패턴입니다: {e}")
            self.scope_regex = None

    def request(self, flow: mitmproxy.http.HTTPFlow):
        """요청 단계에서 차단할 도메인을 필터링합니다."""
        # flow.request.host는 'www.google-analytics.com'과 같은 형태입니다.
        for domain in self.blocked_domains:
            if domain in flow.request.host:
                flow.kill() # 요청을 즉시 중단시킵니다.
                return

    def response(self, flow: mitmproxy.http.HTTPFlow):
        # Scope 필터 확인
        if self.scope_regex and not self.scope_regex.match(flow.request.pretty_url):
            return # Scope에 맞지 않으면 무시

        # 정적 파일 확장자 필터 확인
        parsed_path = urlparse(flow.request.path).path.lower()
        _, extension = os.path.splitext(parsed_path)
        if extension in self.blocked_extensions:
            return # 차단 목록에 있는 확장자면 무시

        # Content-Type 헤더 필터 확인
        if flow.response and 'content-type' in flow.response.headers:
            content_type = flow.response.headers['content-type'].lower().split(';')[0]
            for blocked_type in self.blocked_content_types:
                # 'image/'와 같이 부분 일치를 허용하기 위해 startswith 사용
                if content_type.startswith(blocked_type):
                    return # 차단 목록에 있는 Content-Type이면 무시

        status = "No Response"
        response_headers = {}
        response_body = b""
        if flow.response:
            status = str(flow.response.status_code)
            response_headers = dict(flow.response.headers)
            response_body = flow.response.content or b""

        self.flows_by_id[flow.id] = flow
        flow_data = FlowData(
            flow_id=flow.id,
            method=flow.request.method,
            url=flow.request.pretty_url,
            path=flow.request.path,
            http_version=flow.request.http_version,
            status_code=status,
            request_headers=dict(flow.request.headers),
            request_body=flow.request.content or b"",
            response_headers=response_headers,
            response_body=response_body
        )
        
        try:
            self.queue.put(flow_data)
        except Exception as e:
            print(f"큐에 데이터 넣기 오류: {e}")

    def get_flow_by_id(self, flow_id: str) -> mitmproxy.http.HTTPFlow | None:
        return self.flows_by_id.get(flow_id)

class MitmThread(QThread):
    def __init__(self, shared_queue: queue.Queue, command_queue: queue.Queue, browser_command_queue: queue.Queue | None = None):
        super().__init__()
        self.shared_queue = shared_queue
        self.command_queue = command_queue
        self.browser_command_queue = browser_command_queue
        self.master = None 
        self.addon = PySideAddon(self.shared_queue)

    async def poll_command_queue(self):
        print("명령 큐 폴링 시작...")
        while True:
            try:
                command = self.command_queue.get_nowait()
                
                if command[0] == 'replay':
                    flow_id, modified_request_text = command[1], command[2]
                    print(f"명령 수신: Replay (Flow ID: {flow_id})")
                    await self.replay_flow(flow_id, modified_request_text)
                
                elif command[0] == 'set_scope':
                    scope_pattern = command[1]
                    self.addon.set_scope(scope_pattern)

                elif command[0] == 'replay_in_browser':
                    if self.browser_command_queue:
                        request_text = command[1]
                        self.browser_command_queue.put(('replay', request_text))
                    else:
                        print("오류: 브라우저 명령 큐가 설정되지 않았습니다.")
                
                elif command[0] == 'render_in_browser':
                    if self.browser_command_queue:
                        response_body = command[1]
                        self.browser_command_queue.put(('render', response_body))
                    else:
                        print("오류: 브라우저 명령 큐가 설정되지 않았습니다.")
                    
            except queue.Empty:
                await asyncio.sleep(0.1)
            except Exception as e:
                print(f"명령 큐 처리 중 오류: {e}")

    async def replay_flow(self, flow_id: str, request_text: str):
        if not self.addon or not self.master:
            print("오류: 애드온 또는 마스터가 준비되지 않음")
            return
            
        original_flow = self.addon.get_flow_by_id(flow_id)
        if not original_flow:
            print(f"오류: {flow_id}를 가진 Flow를 찾을 수 없음")
            return

        try:
            parts = request_text.replace('\r\n', '\n').split('\n\n', 1)
            header_part = parts[0]
            body_part = parts[1] if len(parts) > 1 else ""
            
            header_lines = header_part.split('\n')
            
            first_line_parts = header_lines[0].split()
            method = first_line_parts[0]
            path = first_line_parts[1]
            http_version = first_line_parts[2] if len(first_line_parts) > 2 else "HTTP/1.1"

            headers_list = [] 
            for line in header_lines[1:]:
                if ':' in line:
                    key, value = line.split(':', 1)
                    headers_list.append((key.strip().encode('utf-8'), 
                                         value.strip().encode('utf-8'))) 
            
            new_flow = original_flow.copy()
            
            new_flow.request.method = method
            new_flow.request.path = path
            new_flow.request.http_version = http_version
            new_flow.request.headers = http.Headers(headers_list) 
            new_flow.request.content = body_part.encode('utf-8', errors='replace')
            
            print(f"리플레이 실행: {method} {new_flow.request.url}")

            self.master.commands.call("replay.client", [new_flow])

        except Exception as e:
            print(f"HTTP 요청 파싱 또는 리플레이 중 오류: {e}")
            import traceback
            traceback.print_exc()

    async def main_async(self):
        # 옵션 설정
        opts = options.Options()
        opts.listen_port = 8080

        self.master = DumpMaster(opts)
        self.master.addons.add(self.addon)
        
        print("mitmproxy 마스터 및 명령 큐 폴링 동시 시작...")
        
        try:
            await asyncio.gather(
                self.master.run(),
                self.poll_command_queue()
            )
        except Exception as e:
            print(f"asyncio.gather 실행 중 예외: {e}")
            
        print("mitmproxy 마스터 및 폴링 종료됨.")

    def run(self):
        try:
            asyncio.run(self.main_async())
        except Exception as e:
            print(f"mitmproxy 스레드 종료됨: {e}")
        finally:
            print("MitmThread.run() 완전 종료.")

    def shutdown(self):
        print("mitmproxy 종료 중...")
        if self.master:
            self.master.shutdown()