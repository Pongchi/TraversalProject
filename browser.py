import asyncio
from PySide6.QtCore import QThread
from playwright.async_api import async_playwright

class PlaywrightThread(QThread):
    def __init__(self, parent=None):
        super().__init__(parent)
        
    def run(self):
        """Playwright를 실행하여 브라우저를 엽니다."""
        try:
            asyncio.run(self.start_browser())
        except Exception as e:
            print(f"Playwright 스레드 오류: {e}")

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
            
            context = await browser.new_context(
                proxy={"server": "http://127.0.0.1:8080"},
                ignore_https_errors=True
            )
            page = await context.new_page()
            
            print(f"Playwright 브라우저가 시작되었습니다.")
            await page.goto("about:blank")

            # 사용자가 브라우저를 닫을 때까지 대기
            await disconnected_future
            await browser.close()