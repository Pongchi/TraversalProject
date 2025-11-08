import asyncio
import queue
from PySide6.QtCore import QThread
from dataclasses import dataclass, field
from typing import Dict
import mitmproxy.http

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

    def response(self, flow: mitmproxy.http.HTTPFlow):
        self.flows_by_id[flow.id] = flow

        status = "No Response"
        response_headers = {}
        response_body = b""
        if flow.response:
            status = str(flow.response.status_code)
            response_headers = dict(flow.response.headers)
            response_body = flow.response.content or b""

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
    def __init__(self, shared_queue: queue.Queue, command_queue: queue.Queue):
        super().__init__()
        self.shared_queue = shared_queue
        self.command_queue = command_queue
        self.master = None 
        self.addon = None 

    async def poll_command_queue(self):
        print("명령 큐 폴링 시작...")
        while True:
            try:
                command = self.command_queue.get_nowait()
                
                if command[0] == 'replay':
                    flow_id, modified_request_text = command[1], command[2]
                    print(f"명령 수신: Replay (Flow ID: {flow_id})")
                    await self.replay_flow(flow_id, modified_request_text)
                    
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
        opts = options.Options(listen_port=8080)
        self.master = DumpMaster(opts)
        self.addon = PySideAddon(self.shared_queue)
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