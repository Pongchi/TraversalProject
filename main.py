import sys
import queue
import os
from PySide6.QtWidgets import QApplication
from PySide6.QtGui import QIcon
# Windows 작업 표시줄 아이콘 설정을 위해 추가
if sys.platform == 'win32':
    import ctypes

from gui import MainWindow
from proxy import MitmThread
from browser import PlaywrightThread

if __name__ == "__main__":
    # --- Windows 작업 표시줄 아이콘 설정 ---
    # 이 ID는 애플리케이션을 고유하게 식별하여 작업 표시줄에 아이콘이 올바르게 표시되도록 돕습니다.
    if sys.platform == 'win32':
        myappid = 'pongchi.clonecoding.burpsutie.1.0' 
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(myappid)
    # ------------------------------------
    os.environ['QTWEBENGINE_REMOTE_DEBUGGING'] = '9222' # Swagger 디버깅용

    app = QApplication(sys.argv)

    # --- 애플리케이션 아이콘 설정 ---
    # icon.svg 파일이 main.py와 같은 디렉토리에 있다고 가정합니다.
    icon_path = os.path.join(os.path.dirname(__file__), 'icon.svg')
    if os.path.exists(icon_path):
        app.setWindowIcon(QIcon(icon_path))
    # --------------------------------
    
    # mitmproxy <-> GUI 통신을 위한 큐
    shared_queue = queue.Queue()  # 데이터 전달용 (proxy -> gui)
    command_queue = queue.Queue() # 명령 전달용 (gui -> proxy)
    browser_command_queue = queue.Queue() # 명령 전달용 (proxy -> browser)

    # 메인 윈도우와 mitmproxy 스레드 생성
    main_window = MainWindow(shared_queue, command_queue)
    mitm_thread = MitmThread(shared_queue, command_queue, browser_command_queue)
    
    main_window.playwright_thread = PlaywrightThread(browser_command_queue)
    # 애플리케이션 종료 시 mitmproxy 스레드도 함께 종료되도록 연결
    app.aboutToQuit.connect(mitm_thread.shutdown)
    mitm_thread.start()

    main_window.show()
    sys.exit(app.exec())