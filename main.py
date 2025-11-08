import sys
import queue
from PySide6.QtWidgets import QApplication

from gui import MainWindow
from proxy import MitmThread

if __name__ == "__main__":
    app = QApplication(sys.argv)
    
    # mitmproxy <-> GUI 통신을 위한 큐
    shared_queue = queue.Queue()  # 데이터 전달용 (proxy -> gui)
    command_queue = queue.Queue() # 명령 전달용 (gui -> proxy)

    # 메인 윈도우와 mitmproxy 스레드 생성
    main_window = MainWindow(shared_queue, command_queue)
    mitm_thread = MitmThread(shared_queue, command_queue)
    
    # 애플리케이션 종료 시 mitmproxy 스레드도 함께 종료되도록 연결
    app.aboutToQuit.connect(mitm_thread.shutdown)
    mitm_thread.start()

    main_window.show()
    sys.exit(app.exec())