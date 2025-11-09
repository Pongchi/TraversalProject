import asyncio
import queue
import json
from PySide6.QtCore import QThread
from playwright.async_api import async_playwright
import os
import google.generativeai as genai
from dotenv import load_dotenv

class PlaywrightThread(QThread):
    def __init__(self, browser_command_queue: queue.Queue, parent=None):
        super().__init__(parent)
        self.command_queue = browser_command_queue
        self.page = None
        
    def run(self):
        """Playwright를 실행하여 브라우저를 엽니다."""
        try:
            asyncio.run(self.start_browser())
        except Exception as e:
            print(f"Playwright 스레드 오류: {e}")

    async def poll_command_queue(self):
        """GUI로부터 오는 명령을 처리합니다."""
        print("Playwright 명령 큐 폴링 시작...")
        while True:
            try:
                command = self.command_queue.get_nowait()
                if command[0] == 'replay':
                    request_text = command[1]
                    await self.replay_in_browser(request_text)
                elif command[0] == 'render':
                    html_content = command[1]
                    await self.render_in_browser(html_content)
            except queue.Empty:
                await asyncio.sleep(0.1)
            except Exception as e:
                print(f"Playwright 명령 처리 중 오류: {e}")

    async def replay_in_browser(self, request_text: str):
        """브라우저의 현재 페이지에서 fetch를 사용하여 요청을 보냅니다."""
        if not self.page:
            print("오류: Playwright 페이지가 준비되지 않았습니다.")
            return

        print("브라우저에서 fetch 요청 실행...")
        try:
            # 브라우저 컨텍스트에서 실행할 JavaScript 코드
            # request_text를 파싱하여 fetch 옵션을 만듭니다.
            js_code = f"""
            async (rawRequest) => {{
                const parts = rawRequest.replace(/\\r\\n/g, '\\n').split('\\n\\n');
                const headerPart = parts[0];
                const body = parts.length > 1 ? parts[1] : undefined;
                const headerLines = headerPart.split('\\n');
                const [method, path, ..._] = headerLines.shift().split(' ');
                const headers = {{}};
                headerLines.forEach(line => {{ const [key, value] = line.split(/:(.*)/s); if (key) headers[key.trim()] = value.trim(); }});
                
                const options = {{ method, headers }};
                if (method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') {{
                    options.body = body;
                }}

                await fetch(path, options);
            }}
            """
            await self.page.evaluate(js_code, request_text)
            print("브라우저 fetch 요청 완료.")
        except Exception as e:
            print(f"브라우저에서 요청 리플레이 중 오류 발생: {e}")

    async def render_in_browser(self, html_content: str):
        """브라우저의 현재 페이지 내용을 주어진 HTML로 설정합니다."""
        if not self.page:
            print("오류: Playwright 페이지가 준비되지 않았습니다.")
            return
        
        print("브라우저에서 응답 렌더링 실행...")
        try:
            await self.page.set_content(html_content)
            print("브라우저 응답 렌더링 완료.")
        except Exception as e:
            print(f"브라우저에서 응답 렌더링 중 오류 발생: {e}")

    async def _send_ai_chunk_to_browser(self, chunk: str):
        """AI 응답 텍스트 조각을 브라우저로 전송합니다."""
        if not self.page:
            return
        try:
            await self.page.evaluate("window.appendAiResponse", chunk)
        except Exception as e:
            print(f"AI 응답 조각 전송 중 오류: {e}")

    async def _apply_html_updates_in_browser(self, updates: list):
        """AI가 생성한 HTML 수정사항을 브라우저에 적용하도록 명령합니다."""
        if not self.page or not updates:
            return
        try:
            await self.page.evaluate("window.applyHtmlUpdates", updates)
        except Exception as e:
            print(f"HTML 업데이트 적용 중 오류: {e}")

    async def handle_ai_prompt(self, prompt: str, html_content: str | None = None, current_url: str | None = None):
        """브라우저로부터 AI 프롬프트를 받아 처리합니다."""
        print(f"\n[AI Prompt] 수신: {prompt}")
        
        context_info = []
        if current_url:
            print(f"[AI Prompt] URL 포함: {current_url}")
            context_info.append(f"--- Current Page URL ---\n{current_url}")

        if html_content:
            print(f"[AI Prompt] HTML 콘텐츠 포함 (길이: {len(html_content)} bytes)")
            context_info.append(f"--- Current Page HTML ---\n{html_content}")

        context_str = "\n\n".join(context_info)

        json_format_instruction = """
IMPORTANT: Your response MUST be in the following JSON format only.

1.  If the user asks a general question, or you are just providing an answer, set "isOnlyAnswer" to true.
2.  If the user explicitly asks to modify the current page's HTML (e.g., "change the background color", "remove this button"), you MUST set "isOnlyAnswer" to false and provide the necessary changes in the "updates" array.
3.  If you need to change an element's property that is not in the HTML source (like an input's `value`), use the "jscode" action.

{
  "isOnlyAnswer": <boolean>,
  "result": "<string: Your textual answer to the user's prompt.>",
  "updates": [
    { "selector": "<string: A valid CSS selector, can be null for general jscode>", "action": "<'replace'|'append'|'prepend'|'remove'|'style'|'jscode'>", "content": "<string: The new HTML, CSS rules, or JavaScript code to execute>" }
  ]
}"""
        final_prompt = f"{prompt}\n\n{context_str}\n\n{json_format_instruction}"

        try:
            # 1. API 키 설정 (환경 변수에서 로드)
            load_dotenv() # .env 파일에서 환경 변수를 로드합니다.
            api_key = os.getenv("GEMINI_API_KEY") 
            
            if not api_key:
                error_message = "[AI Error] GEMINI_API_KEY 환경 변수가 설정되지 않았습니다."
                print(error_message)
                await self._send_ai_chunk_to_browser(error_message)
                return

            genai.configure(api_key=api_key)

            # 2. 모델 초기화 및 스트리밍으로 프롬프트 전송
            model = genai.GenerativeModel('gemini-2.5-flash')
            response_stream = await model.generate_content_async(final_prompt, stream=True)

            # 3. 스트리밍 결과를 실시간으로 브라우저에 전송
            if self.page:
                await self.page.evaluate("window.startAiResponse()")

            full_response = ""
            async for chunk in response_stream:
                full_response += chunk.text
            
            print(f"[AI Raw Response]\n---\n{full_response}\n---")

            # 4. JSON 파싱 및 결과 전송
            try:
                # 응답에서 JSON 객체만 추출
                json_match = re.search(r'\{.*\}', full_response, re.DOTALL)
                if json_match:
                    json_data = json.loads(json_match.group(0))
                    # 1. 항상 result 값을 브라우저에 표시
                    result_text = json_data.get("result", "Error: 'result' field not found in JSON response.")
                    await self._send_ai_chunk_to_browser(result_text)

                    # 2. isOnlyAnswer가 false이고 updates가 있으면 HTML 수정 적용
                    if not json_data.get("isOnlyAnswer", True) and "updates" in json_data:
                        updates = json_data["updates"]
                        await self._apply_html_updates_in_browser(updates)
            except json.JSONDecodeError:
                await self._send_ai_chunk_to_browser(f"Error: Failed to decode AI's JSON response.\n\nRaw response:\n{full_response}")
        except Exception as e:
            error_message = f"[AI Error] Gemini API 처리 중 오류 발생: {e}"
            print(error_message)
            await self._send_ai_chunk_to_browser(error_message)

    async def start_browser(self):
        """사용자가 수동으로 탐색할 수 있도록 프록시가 설정된 브라우저를 실행합니다."""
        async with async_playwright() as p:
            disconnected_future = asyncio.Future()

            def on_disconnected(browser):
                print("Playwright 브라우저가 닫혔습니다.")
                if not disconnected_future.done():
                    disconnected_future.set_result(True)

            chromium_args = [
                '--disable-background-networking', '--disable-component-update',
                '--disable-sync', '--disable-default-apps', '--no-first-run',
                '--safebrowsing-disable-auto-update', '--metrics-recording-only',
                '--no-default-browser-check', '--disable-extensions',
                '--disable-gcm', '--disable-breakpad'
            ]

            browser = await p.chromium.launch(headless=False, args=chromium_args)
            browser.on("disconnected", on_disconnected)
            
            context = await browser.new_context(proxy={"server": "http://127.0.0.1:8080"}, ignore_https_errors=True)

            # --- [핵심] Python 함수를 브라우저의 window 객체에 노출 ---
            await context.expose_function("handleAiPrompt", self.handle_ai_prompt)

            # --- [핵심 수정] script.js 파일에서 스크립트를 읽어와 주입 ---
            script_path = os.path.join(os.path.dirname(__file__), 'script.js')
            with open(script_path, 'r', encoding='utf-8') as f:
                script = f.read()

            await context.add_init_script(script)
            # ----------------------------------------------------

            self.page = await context.new_page()
            
            print(f"Playwright 브라우저가 시작되었습니다.")
            await self.page.goto("about:blank")

            # 브라우저 닫힘 이벤트와 명령 큐 폴링을 동시에 대기
            await asyncio.gather(
                disconnected_future,
                self.poll_command_queue()
            )

            await browser.close()
            self.page = None
import re