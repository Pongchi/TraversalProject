import queue
from PySide6.QtWidgets import (
    QMainWindow, QTableWidget, QTableWidgetItem, QVBoxLayout, QWidget,
    QSplitter, QTabWidget, QTextEdit, QPushButton, QHBoxLayout, QSpacerItem, QSizePolicy,
    QLabel, QLineEdit
)
from PySide6.QtCore import QTimer, Qt

from proxy import FlowData
from browser import PlaywrightThread

class MainWindow(QMainWindow):
    def __init__(self, shared_queue: queue.Queue, command_queue: queue.Queue):
        super().__init__()
        self.setWindowTitle("AutoSitemap")
        self.resize(1024, 768) 

        self.queue = shared_queue
        self.command_queue = command_queue
        self.flows_data_list = []
        self.current_selected_flow_data: FlowData | None = None

        # --- 메인 위젯 및 레이아웃 설정 ---
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QVBoxLayout(central_widget)

        # --- 상단 버튼 영역 ---
        top_layout = QHBoxLayout()
        
        top_layout.addWidget(QLabel("Scope:"))
        self.scope_input = QLineEdit()
        self.scope_input.setPlaceholderText("https://*.example.com/*")
        self.scope_input.textChanged.connect(self.on_scope_changed)
        top_layout.addWidget(self.scope_input)

        top_layout.addSpacerItem(QSpacerItem(40, 20, QSizePolicy.Expanding, QSizePolicy.Minimum))

        self.open_button = QPushButton("Open Browser")
        top_layout.addWidget(self.open_button)
        main_layout.addLayout(top_layout)

        # --- History UI (테이블 및 상세 보기) ---
        history_splitter = QSplitter(Qt.Vertical)
        main_layout.addWidget(history_splitter)

        self.table = QTableWidget()
        self.table.setColumnCount(3)
        self.table.setHorizontalHeaderLabels(["Method", "URL", "Status"])
        self.table.setColumnWidth(0, 100)
        self.table.setColumnWidth(1, 650)
        self.table.setColumnWidth(2, 100)
        history_splitter.addWidget(self.table)

        history_bottom_widget = QWidget()
        history_bottom_layout = QVBoxLayout(history_bottom_widget)
        history_bottom_layout.setContentsMargins(0, 0, 0, 0)
        history_splitter.addWidget(history_bottom_widget)
        
        self.details_tabs = QTabWidget()
        self.request_text = QTextEdit()
        self.response_text = QTextEdit()
        self.response_text.setReadOnly(True) 
        self.details_tabs.addTab(self.request_text, "Request")
        self.details_tabs.addTab(self.response_text, "Response")
        history_bottom_layout.addWidget(self.details_tabs)

        self.send_button = QPushButton("Send (Replay)")
        self.send_browser_button = QPushButton("Send with Browser")
        self.render_browser_button = QPushButton("Render in Browser")
        button_layout = QHBoxLayout()
        button_layout.addWidget(self.send_button)
        button_layout.addWidget(self.send_browser_button)
        button_layout.addWidget(self.render_browser_button)
        history_bottom_layout.addLayout(button_layout)

        history_splitter.setStretchFactor(0, 4)
        history_splitter.setStretchFactor(1, 6)

        # --- 시그널 연결 ---
        self.open_button.clicked.connect(self.on_open_browser_clicked)
        self.scope_input.textChanged.connect(self.on_scope_changed)
        self.table.itemSelectionChanged.connect(self.display_flow_details)
        self.send_button.clicked.connect(self.on_send_clicked)
        self.send_browser_button.clicked.connect(self.on_send_browser_clicked)
        self.render_browser_button.clicked.connect(self.on_render_in_browser_clicked)

        self.timer = QTimer(self)
        self.timer.timeout.connect(self.check_queue) 
        self.timer.start(100) 

    def check_queue(self):
        try:
            while True:
                flow_data: FlowData = self.queue.get_nowait()
                self._add_flow_to_table(flow_data)
        except queue.Empty:
            pass

    def _add_flow_to_table(self, flow_data: FlowData):
        self.flows_data_list.append(flow_data)
        row_count = self.table.rowCount()
        self.table.insertRow(row_count)
        self.table.setItem(row_count, 0, QTableWidgetItem(flow_data.method))
        self.table.setItem(row_count, 1, QTableWidgetItem(flow_data.url))
        self.table.setItem(row_count, 2, QTableWidgetItem(flow_data.status_code))
        
        self.table.scrollToBottom()

    def display_flow_details(self):
        selected_items = self.table.selectedItems()
        if not selected_items:
            self.request_text.clear()
            self.response_text.clear()
            self.current_selected_flow_data = None
            return

        selected_row = selected_items[0].row()

        try:
            flow_data = self.flows_data_list[selected_row]
            self.current_selected_flow_data = flow_data
        except IndexError:
            print(f"오류: {selected_row} 인덱스의 데이터를 찾을 수 없습니다.")
            self.current_selected_flow_data = None
            return

        self.request_text.setText(flow_data.get_request_display())
        self.response_text.setText(flow_data.get_response_display())

    def on_send_clicked(self):
        if self.current_selected_flow_data is None:
            print("리플레이할 요청이 선택되지 않았습니다.")
            return
            
        flow_id = self.current_selected_flow_data.flow_id
        modified_request_text = self.request_text.toPlainText()
        
        command = ('replay', flow_id, modified_request_text)
        try:
            self.command_queue.put(command)
            print(f"명령 전송: Replay (Flow ID: {flow_id})")
        except Exception as e:
            print(f"명령 큐 전송 오류: {e}")

    def on_send_browser_clicked(self):
        """선택된 요청을 브라우저에서 직접 보내도록 명령합니다."""
        if self.current_selected_flow_data is None:
            print("브라우저에서 리플레이할 요청이 선택되지 않았습니다.")
            return

        modified_request_text = self.request_text.toPlainText()
        
        command = ('replay_in_browser', modified_request_text)
        try:
            self.command_queue.put(command)
            print(f"명령 전송: Replay in Browser")
        except Exception as e:
            print(f"브라우저 리플레이 명령 큐 전송 오류: {e}")

    def on_render_in_browser_clicked(self):
        """선택된 응답을 브라우저에서 렌더링하도록 명령합니다."""
        if self.current_selected_flow_data is None:
            print("브라우저에서 렌더링할 응답이 선택되지 않았습니다.")
            return

        modified_response_text = self.response_text.toPlainText()
        
        # 응답 텍스트에서 바디 부분만 추출
        body_marker = "\n\n--- BODY ---\n"
        if body_marker in modified_response_text:
            response_body = modified_response_text.split(body_marker, 1)[1]
        else:
            response_body = "" # 바디 마커가 없으면 빈 문자열로 처리

        command = ('render_in_browser', response_body)
        try:
            self.command_queue.put(command)
            print(f"명령 전송: Render in Browser")
        except Exception as e:
            print(f"브라우저 렌더링 명령 큐 전송 오류: {e}")

    def on_open_browser_clicked(self):
        """'Open' 버튼 클릭 시 Playwright 브라우저를 백그라운드에서 실행합니다."""
        print("Playwright 브라우저를 시작합니다...")
        self.playwright_thread.start()

    def on_scope_changed(self, text: str):
        """Scope 입력이 변경되면 command 큐에 'set_scope' 명령을 보냅니다."""
        command = ('set_scope', text)
        try:
            self.command_queue.put(command)
        except Exception as e:
            print(f"Scope 설정 명령 전송 오류: {e}")