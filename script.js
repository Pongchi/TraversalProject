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
        `;
        document.head.appendChild(style);

        const container = document.createElement('div');
        container.className = 'ai-prompt-container';

        // Input 엘리먼트
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'ai-prompt-input';
        input.placeholder = 'Enter AI prompt...';

        // 아이콘을 포함할 버튼 엘리먼트
        const submitButton = document.createElement('button');
        submitButton.className = 'ai-prompt-submit-button';
        submitButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #555;"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>`;

        container.appendChild(input);
        container.appendChild(submitButton);
        document.body.appendChild(container);

        return { container, input, submitButton };
    };

    const initialize = () => {
        const elements = createPromptBar();
        // createPromptBar가 DOM이 준비되지 않아 null을 반환하면 아무것도 하지 않음
        if (!elements) return;

        const { container, input, submitButton } = elements;

        const togglePromptBar = (show) => {
            const isVisible = container.style.display === 'block';
            const showBar = show !== undefined ? show : !isVisible;

            if (showBar) {
                container.style.display = 'block';
                input.focus();
            } else {
                container.style.display = 'none';
                input.blur();
            }
        };

        // 다른 사이트의 키보드 이벤트가 포커스를 뺏는 것을 방지
        input.addEventListener('keydown', (e) => {
            // 이벤트 전파를 막아 페이지의 다른 단축키가 실행되지 않도록 함
            e.stopPropagation();
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
    }

    // DOM이 이미 로드되었는지 확인하고, 그렇지 않으면 이벤트를 기다립니다.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();