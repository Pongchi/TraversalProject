(() => {
    // 한 번만 실행되도록 플래그 확인
    if (window.aiPromptBarInjected) {
        return;
    }
    window.aiPromptBarInjected = true;
    
    const createPromptBar = () => {
        // UI가 이미 주입되었는지 확인
        if (document.querySelector('.ai-prompt-container')) return null;

        // DOM이 준비되지 않았으면 아무것도 하지 않음
        if (!document.head || !document.body) return null;

        const style = document.createElement('style');
        style.innerHTML = `
            .ai-prompt-container {
                position: fixed;
                top: 20%; /* 화면 중앙에서 살짝 위로 조정 */
                left: 50%;
                transform: translate(-50%, -50%);
                z-index: 2147483647; /* Max z-index */
                width: 600px;
                display: none; /* 기본적으로 숨김 */
                background-color: white; /* 배경색 추가 */
            }
            .ai-prompt-input {
                width: 100%;
                padding: 16px 20px;
                font-size: 18px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                color: #222;
                border: 1px solid #ddd;
                border-radius: 12px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.2);
                outline: none;
                box-sizing: border-box; /* 패딩이 너비에 포함되도록 설정 */
                padding-right: 50px; /* 아이콘 공간 확보 */
            }
            .ai-prompt-submit-button {
                position: absolute;
                right: 8px;
                top: 50%;
                transform: translateY(-50%);
                background: transparent;
                border: none;
                padding: 8px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 8px;
                transition: background-color 0.2s;
            }
            .ai-prompt-submit-button:hover {
                background-color: #f0f0f0;
            }
            .ai-spinner {
                position: absolute;
                right: 16px;
                top: 50%;
                transform: translateY(-50%);
                width: 20px;
                height: 20px;
                border: 3px solid #f3f3f3;
                border-top: 3px solid #3498db;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                display: none; /* 기본적으로 숨김 */
            }
            @keyframes spin { 0% { transform: translateY(-50%) rotate(0deg); } 100% { transform: translateY(-50%) rotate(360deg); } }
            .ai-response-area {
                padding: 16px 20px;
                margin-top: 8px;
                border: 1px solid #ddd;
                border-radius: 12px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 16px;
                color: #333;
                white-space: pre-wrap; /* 줄바꿈 및 공백 유지 */
                word-wrap: break-word; /* 긴 단어 줄바꿈 */
                max-height: 400px; /* 최대 높이 지정 */
                overflow-y: auto; /* 내용이 길어지면 스크롤 */
            }
        `;
        document.head.appendChild(style);

        const container = document.createElement('div');
        container.className = 'ai-prompt-container';

        // 입력창과 버튼을 감싸는 래퍼
        const inputWrapper = document.createElement('div');
        inputWrapper.style.position = 'relative';
        inputWrapper.style.width = '100%';

        // Input 엘리먼트
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'ai-prompt-input';
        input.placeholder = 'Enter AI prompt...';

        // 아이콘을 포함할 버튼 엘리먼트
        const submitButton = document.createElement('button');
        submitButton.className = 'ai-prompt-submit-button';
        submitButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #555;"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>`;

        // 로딩 스피너 엘리먼트
        const spinner = document.createElement('div');
        spinner.className = 'ai-spinner';

        // 응답을 표시할 영역
        const responseArea = document.createElement('div');
        responseArea.className = 'ai-response-area';
        responseArea.style.display = 'none'; // 기본적으로 숨김

        inputWrapper.appendChild(input);
        inputWrapper.appendChild(submitButton);
        inputWrapper.appendChild(spinner);
        container.appendChild(inputWrapper);
        container.appendChild(responseArea); // 컨테이너에 응답 영역 추가
        document.body.appendChild(container);

        return { container, input, submitButton, responseArea, spinner };
    };

    const initialize = () => {
        const elements = createPromptBar();
        // createPromptBar가 DOM이 준비되지 않아 null을 반환하면 아무것도 하지 않음
        if (!elements) return;

        const { container, input, submitButton, responseArea, spinner } = elements;

        const togglePromptBar = (show) => {
            const isVisible = container.style.display === 'block';
            const showBar = show !== undefined ? show : !isVisible;

            if (showBar) {
                container.style.display = 'block';
                input.focus();
            } else {
                container.style.display = 'none';
                responseArea.style.display = 'none'; // 닫을 때 응답 영역도 숨김
                input.blur();
            }
        };

        // 다른 사이트의 키보드 이벤트가 포커스를 뺏는 것을 방지
        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            // Enter 키로 제출
            if (e.key === 'Enter') {
                e.preventDefault(); // 폼 제출 등 기본 동작 방지
                submitButton.click();
            }
        });

        submitButton.addEventListener('click', () => {
            const prompt = input.value.trim();
            if (prompt && window.handleAiPrompt) {
                console.log(`Sending prompt to AI: ${prompt}`);
                submitButton.style.display = 'none'; // 버튼 숨기기
                spinner.style.display = 'block'; // 스피너 보이기
                window.handleAiPrompt(prompt); // 백엔드 함수 호출
                input.value = '';
                // togglePromptBar(false); // 답변을 봐야하므로 자동으로 닫지 않음
            }
        });

        // Ctrl + Space 단축키 리스너
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.code === 'Space') {
                e.preventDefault();
                togglePromptBar();
            }
            // ESC 키로 닫기
            if (e.key === 'Escape') {
                togglePromptBar(false);
            }
        });

        // 입력창 외부 클릭 시 닫기
        document.addEventListener('click', (e) => {
            if (container.style.display === 'block' && !container.contains(e.target)) {
                togglePromptBar(false);
            }
        });

        // --- Python에서 호출할 함수들을 window 객체에 추가 ---
        window.startAiResponse = () => {
            responseArea.innerHTML = '';
            responseArea.style.display = 'block';
            spinner.style.display = 'none'; // 스피너 숨기기
            submitButton.style.display = 'flex'; // 버튼 다시 보이기
        };

        window.appendAiResponse = (text) => {
            // 텍스트를 그대로 추가하여 pre-wrap 스타일이 적용되도록 함
            responseArea.textContent += text;
            // 새 내용이 추가될 때마다 맨 아래로 스크롤
            responseArea.scrollTop = responseArea.scrollHeight;
        };
    }

    // DOM이 이미 로드되었는지 확인하고, 그렇지 않으면 이벤트를 기다립니다.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();