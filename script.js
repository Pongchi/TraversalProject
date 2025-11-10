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
                transform: translateX(-50%); /* 수평 중앙 정렬만 */
                z-index: 2147483647; /* Max z-index */
                width: 600px;
                display: none; /* 기본적으로 숨김 */
                background-color: white; /* 배경색 추가 */
                padding: 16px; /* 컨테이너 내부 패딩 추가 */
                border-radius: 12px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.2);
            }
            .ai-prompt-input {
                width: 100%;
                padding: 16px 20px;
                font-size: 18px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                color: #222;
                border: 1px solid #ddd; /* 테두리만 남김 */
                border-radius: 8px; /* 컨테이너와 다르게 약간 작은 둥근 모서리 */
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
                padding: 12px 16px;
                margin-top: 12px;
                border: 1px solid #ddd;
                border-radius: 8px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 15px;
                color: #444;
                white-space: pre-wrap; /* 줄바꿈 및 공백 유지 */
                word-wrap: break-word; /* 긴 단어 줄바꿈 */
                max-height: 400px; /* 최대 높이 지정 */
                overflow-y: auto; /* 내용이 길어지면 스크롤 */
            }
            .ai-response-step {
                padding: 8px;
                border-bottom: 1px solid #eee;
            }
            .ai-response-step:last-child {
                border-bottom: none;
            }
            .ai-debug-info {
                font-style: italic;
                color: #888;
                font-size: 13px;
                margin-top: 4px;
                padding-left: 8px;
                border-left: 2px solid #eee;
            }
        `;
        document.head.appendChild(style);

        const container = document.createElement('div');
        container.className = 'ai-prompt-container';

        // Checkbox for including HTML
        const includeHtmlContainer = document.createElement('div');
        includeHtmlContainer.style.marginBottom = '8px'; // Spacing below checkbox
        includeHtmlContainer.style.display = 'flex';
        includeHtmlContainer.style.alignItems = 'center';

        const includeHtmlCheckbox = document.createElement('input');
        includeHtmlCheckbox.type = 'checkbox';
        includeHtmlCheckbox.id = 'ai-include-html-checkbox';
        includeHtmlCheckbox.style.marginRight = '8px'; // Space between checkbox and label

        const includeHtmlLabel = document.createElement('label');
        includeHtmlLabel.htmlFor = 'ai-include-html-checkbox';
        includeHtmlLabel.textContent = '현재 페이지 HTML 포함';
        includeHtmlLabel.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        includeHtmlLabel.style.fontSize = '14px';
        includeHtmlLabel.style.color = '#555';
        includeHtmlContainer.appendChild(includeHtmlCheckbox);
        includeHtmlContainer.appendChild(includeHtmlLabel);

        // Checkbox for including URL
        const includeUrlCheckbox = document.createElement('input');
        includeUrlCheckbox.type = 'checkbox';
        includeUrlCheckbox.id = 'ai-include-url-checkbox';
        includeUrlCheckbox.style.marginRight = '8px';
        includeUrlCheckbox.style.marginLeft = '16px'; // Add some space from the first checkbox

        const includeUrlLabel = document.createElement('label');
        includeUrlLabel.htmlFor = 'ai-include-url-checkbox';
        includeUrlLabel.textContent = '현재 URL 포함';
        includeUrlLabel.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        includeUrlLabel.style.fontSize = '14px';
        includeUrlLabel.style.color = '#555';
        includeHtmlContainer.appendChild(includeUrlCheckbox); // Add to the same container
        includeHtmlContainer.appendChild(includeUrlLabel);

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

        // 여러 응답을 담을 컨테이너
        const responsesContainer = document.createElement('div');
        responsesContainer.className = 'ai-responses-container';
        
        container.appendChild(includeHtmlContainer); // Add checkbox container to main container
        inputWrapper.appendChild(input);
        inputWrapper.appendChild(submitButton);
        inputWrapper.appendChild(spinner);
        container.appendChild(inputWrapper);
        container.appendChild(responsesContainer); // 컨테이너에 응답 컨테이너 추가
        document.body.appendChild(container);

        return { container, input, submitButton, responsesContainer, spinner, includeHtmlContainer, includeHtmlCheckbox, includeUrlCheckbox };
    };

    const initialize = () => {
        const elements = createPromptBar();
        // createPromptBar가 DOM이 준비되지 않아 null을 반환하면 아무것도 하지 않음
        if (!elements) return;

        const { container, input, submitButton, responsesContainer, spinner, includeHtmlContainer, includeHtmlCheckbox, includeUrlCheckbox } = elements;

        const togglePromptBar = (show) => {
            const isVisible = container.style.display === 'block';
            const showBar = show !== undefined ? show : !isVisible;

            if (showBar) {
                container.style.display = 'block';
                includeHtmlContainer.style.display = 'flex'; // Show checkbox container
                input.focus();
            } else {
                container.style.display = 'none';
                includeHtmlContainer.style.display = 'none'; // Hide checkbox container
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
            let htmlContent = null;
            let currentUrl = null;

            if (includeHtmlCheckbox.checked) {
                htmlContent = document.documentElement.outerHTML;
            }
            if (includeUrlCheckbox.checked) {
                currentUrl = window.location.href;
            }

            if (prompt && window.handleAiPrompt) {
                console.log(`Sending prompt to AI: ${prompt}`);
                submitButton.style.display = 'none'; // 버튼 숨기기
                spinner.style.display = 'block'; // 스피너 보이기
                window.handleAiPrompt(prompt, htmlContent, currentUrl); // HTML 및 URL 콘텐츠도 함께 전달
                input.value = '';
                // 답변을 봐야하므로 자동으로 닫지 않음
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
            const newResponseArea = document.createElement('div');
            newResponseArea.className = 'ai-response-area';
            responsesContainer.appendChild(newResponseArea);
            // 새 응답 영역으로 스크롤
            responsesContainer.scrollTop = responsesContainer.scrollHeight;
        };

        window.appendAiResponse = (text) => {
            const responseAreas = responsesContainer.querySelectorAll('.ai-response-area');
            if (responseAreas.length === 0) {
                window.startAiResponse(); // 응답 영역이 없으면 하나 생성
            }
            const lastResponseArea = responseAreas[responseAreas.length - 1];

            // 각 응답을 별도의 div로 감싸서 시각적으로 분리
            const stepDiv = document.createElement('div');
            stepDiv.className = 'ai-response-step';
            stepDiv.textContent = text;
            lastResponseArea.appendChild(stepDiv);

            // 새 내용이 추가될 때마다 맨 아래로 스크롤
            responsesContainer.scrollTop = responsesContainer.scrollHeight;
        };
        
        window.appendAiDebugInfo = (text) => {
            const lastResponseArea = document.querySelector('.ai-response-area:last-child');
            if (!lastResponseArea) return;
            const debugDiv = document.createElement('div');
            debugDiv.className = 'ai-debug-info';
            debugDiv.textContent = text;
            lastResponseArea.appendChild(debugDiv);
            responsesContainer.scrollTop = responsesContainer.scrollHeight;
        }

        window.applyHtmlUpdates = async (args) => {
            const [updates, is_final_step] = args;

            if (!Array.isArray(updates)) {
                console.error("HTML Updates: The provided data is not an array.", updates);
                return null;
            }
            console.log("Applying HTML updates:", updates);

            // Use a for...of loop to handle async operations correctly
            for (const update of updates) {
                if (update.action === 'jscode') {
                    console.log(`Executing jscode: ${update.content}`);                    
                    try {
                        // The AI-generated code is the body of an async function.
                        const result = await new Function(`return (async () => { ${update.content} })();`)();
                        console.log("jscode execution result:", result);

                        // If the AI has a followUpPrompt, trigger it immediately. This takes priority.
                        if (result && result.followUpPrompt && window.handleAiPrompt) {
                            console.log("Follow-up prompt detected, triggering next AI action:", result.followUpPrompt);
                            window.handleAiPrompt(result.followUpPrompt, document.documentElement.outerHTML, window.location.href);
                            return; // Stop further processing
                        }

                        // If it's not the final step, return the result to Python backend.
                        if (!is_final_step) {
                            return result;
                        } else {
                            // This was the final step, so ensure the UI is reset.
                            // This handles cases where jscode was the last action.
                            console.log("Final jscode execution complete. Resetting UI.");
                            spinner.style.display = 'none';
                            submitButton.style.display = 'flex';
                        }

                    } catch (e) {
                        console.error("Error executing jscode:", e);
                        // If not final, return error to Python so AI can see it.
                        if (!is_final_step) {
                            return { error: e.message };
                        } else {
                            // Also reset UI on error in final step.
                            spinner.style.display = 'none';
                            submitButton.style.display = 'flex';
                        }
                    }
                    continue; // Continue to the next update if any
                }
                try {
                    const elements = document.querySelectorAll(update.selector);
                    if (elements.length === 0) {
                        console.warn(`HTML Update: No elements found for selector "${update.selector}"`);
                        continue;
                    }

                    elements.forEach(element => {
                        switch (update.action) {
                            case 'replace':
                                element.outerHTML = update.content;
                                break;
                            case 'append':
                                element.innerHTML += update.content;
                                break;
                            case 'prepend':
                                element.innerHTML = update.content + element.innerHTML;
                                break;
                            case 'remove':
                                element.remove();
                                break;
                            case 'style':
                                // 여러 스타일 속성을 한 번에 적용하기 위해 cssText 사용
                                element.style.cssText += update.content;
                                break;
                            default:
                                console.warn(`HTML Update: Unknown action "${update.action}"`);
                        }
                    });
                } catch (e) {
                    console.error(`HTML Update: Failed to apply update for selector "${update.selector}"`, e);
                }
            }
            // If the updates were final (and not jscode), reset the UI.
            if (is_final_step) {
                spinner.style.display = 'none';
                submitButton.style.display = 'flex';
            }

            return null; // Default return value if no jscode result is needed
        };
    }

    // --- SPA Navigation Handling ---
    // This function ensures the prompt bar is present after a navigation.
    const ensurePromptBarExists = () => {
        // Use a short delay to allow the SPA's rendering to complete.
        setTimeout(() => {
            if (!document.querySelector('.ai-prompt-container')) {
                console.log("AI Prompt Bar not found after navigation. Re-initializing.");
                initialize();
            }
        }, 100); // 100ms delay as a starting point.
    };

    // Monkey-patch history.pushState and history.replaceState
    const originalPushState = history.pushState;
    history.pushState = function(...args) {
        originalPushState.apply(this, args);
        ensurePromptBarExists();
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function(...args) {
        originalReplaceState.apply(this, args);
        ensurePromptBarExists();
    };

    // Listen for browser back/forward button clicks
    window.addEventListener('popstate', ensurePromptBarExists);

    // DOM이 이미 로드되었는지 확인하고, 그렇지 않으면 이벤트를 기다립니다.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();