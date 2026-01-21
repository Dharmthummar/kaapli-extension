document.addEventListener('DOMContentLoaded', function () {
    const apiKeyContainer = document.getElementById('api-key-container');
    const apiKeyInput = document.getElementById('api-key-input');
    const saveApiKeyButton = document.getElementById('save-api-key');
    const getApiKeyButton = document.getElementById('get-api-key');
    const answerTextarea = document.getElementById('answer');
    const submitPromptButton = document.getElementById('submit-prompt');
    const imagePreviewContainer = document.getElementById('image-preview-container');
    const imagePreview = document.getElementById('image-preview');
    const imageClose = document.getElementById('image-close');
    const mainContainer = document.getElementById('main-container');

    // Default model to use if we can't determine the latest
    const DEFAULT_MODEL = "gemini-3-flash-preview";
    let currentModel = DEFAULT_MODEL;

    // Variables to track state
    let isCustomMode = false;
    let imageData = null;
    let initialHeight = answerTextarea.style.height;

    // Chat history variables
    let chatHistory = [];
    let currentHistoryIndex = -1;

    // Variables for resizing
    let isResizing = false;
    let isResizingWidth = false;
    let isResizingLeft = false;
    let startY, startHeight, startX, startWidth;


    // Check if API key, model, and chat history are already saved
    chrome.storage.local.get(['apiKey', 'currentModel', 'customMode', 'textareaHeight', 'textareaWidth', 'chatHistory', 'lastPrompt'], function (result) {
        if (result.currentModel) {
            currentModel = result.currentModel;
        } else {
            chrome.storage.local.set({ currentModel: DEFAULT_MODEL });
        }

        isCustomMode = result.customMode === true;

        if (result.textareaHeight) {
            answerTextarea.style.height = result.textareaHeight;
        }

        if (result.textareaWidth) {
            answerTextarea.style.width = result.textareaWidth;
            document.body.style.width = result.textareaWidth;
        }

        // Restore chat history if available
        if (result.chatHistory && Array.isArray(result.chatHistory)) {
            chatHistory = result.chatHistory;
            currentHistoryIndex = chatHistory.length - 1;
        }

        updateUIMode(isCustomMode);

        if (!result.apiKey) {
            apiKeyContainer.style.display = 'block';
            mainContainer.style.display = 'none';
        } else {
            if (!isCustomMode) {
                fetchLatestModelAndAnswer(result.apiKey);
            } else if (result.lastPrompt) {
                // Restore the last prompt in custom mode
                answerTextarea.value = result.lastPrompt;
            }
        }
    });

    // Add cursor styles to the textarea
    answerTextarea.style.cursor = 'default';

    // Make textarea resizable via drag
    answerTextarea.addEventListener('mousedown', function (e) {
        // Check for vertical resize (bottom edge)
        if (e.offsetY > answerTextarea.offsetHeight - 5) {
            isResizing = true;
            isResizingWidth = false;
            isResizingLeft = false;
            startY = e.clientY;
            startHeight = parseInt(window.getComputedStyle(answerTextarea).height);
            answerTextarea.style.cursor = 'ns-resize';
            document.addEventListener('mousemove', resizeTextarea);
            document.addEventListener('mouseup', stopResize);
            e.preventDefault();
        }
        // Check for horizontal resize (right edge)
        else if (e.offsetX > answerTextarea.offsetWidth - 5) {
            isResizing = true;
            isResizingWidth = true;
            isResizingLeft = false;
            startX = e.clientX;
            startWidth = parseInt(window.getComputedStyle(answerTextarea).width);
            answerTextarea.style.cursor = 'ew-resize';
            document.addEventListener('mousemove', resizeTextarea);
            document.addEventListener('mouseup', stopResize);
            e.preventDefault();
        }
        // Check for horizontal resize (left edge)
        else if (e.offsetX < 5) {
            isResizing = true;
            isResizingWidth = true;
            isResizingLeft = true;
            startX = e.clientX;
            startWidth = parseInt(window.getComputedStyle(answerTextarea).width);
            answerTextarea.style.cursor = 'ew-resize';
            document.addEventListener('mousemove', resizeTextarea);
            document.addEventListener('mouseup', stopResize);
            e.preventDefault();
        }
    });

    // Add mousemove event to show resize cursor when hovering over edges
    answerTextarea.addEventListener('mousemove', function (e) {
        if (isResizing) return;

        if (e.offsetY > answerTextarea.offsetHeight - 5) {
            answerTextarea.style.cursor = 'ns-resize';
        }
        else if (e.offsetX > answerTextarea.offsetWidth - 5) {
            answerTextarea.style.cursor = 'ew-resize';
        }
        else if (e.offsetX < 5) {
            answerTextarea.style.cursor = 'ew-resize';
        }
        else {
            answerTextarea.style.cursor = 'default';
        }
    });

    // Resize function for both width and height
    function resizeTextarea(e) {
        if (!isResizing) return;

        if (isResizingWidth) {
            // Resize width
            let newWidth;

            if (isResizingLeft) {
                // Left side resizing - for a popup window
                // Calculate how much the mouse has moved (moving left is positive)
                const diff = startX - e.clientX;
                // Add this difference to the starting width
                newWidth = startWidth + diff;
            } else {
                // Right side resizing
                newWidth = startWidth + (e.clientX - startX);
            }

            // Apply min/max constraints
            if (newWidth < 100) newWidth = 100; // Min width
            if (newWidth > 400) newWidth = 400; // Max width

            // Apply the new width to both the textarea and body
            answerTextarea.style.width = newWidth + 'px';
            document.body.style.width = newWidth + 'px';

            // Update all elements inside that might need width adjustment
            const elements = document.querySelectorAll('#api-key-container, #main-container, #api-key-input, .button-container');
            elements.forEach(el => {
                if (el.id !== 'answer') {
                    el.style.width = newWidth + 'px';
                }
            });

            chrome.storage.local.set({ textareaWidth: newWidth + 'px' });
        } else {
            // Resize height (existing code)
            let newHeight = startHeight + (e.clientY - startY);
            if (newHeight < 23) newHeight = 23; // Min height
            if (newHeight > 400) newHeight = 400; // Max height

            answerTextarea.style.height = newHeight + 'px';
            answerTextarea.style.overflow = newHeight > 23 ? 'auto' : 'hidden';

            chrome.storage.local.set({ textareaHeight: newHeight + 'px' });
        }
    }

    // Stop resize function
    function stopResize() {
        isResizing = false;
        isResizingWidth = false;
        isResizingLeft = false;
        document.removeEventListener('mousemove', resizeTextarea);
        document.removeEventListener('mouseup', stopResize);

        // Reset cursor back to default after resize
        if (!answerTextarea.matches(':hover')) {
            answerTextarea.style.cursor = 'default';
        } else {
            // Trigger a mousemove to update cursor based on position
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: window.event.clientX,
                clientY: window.event.clientY
            });
            answerTextarea.dispatchEvent(mouseEvent);
        }
    }

    // Save API key
    saveApiKeyButton.addEventListener('click', function () {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            chrome.storage.local.set({ apiKey: apiKey }, function () {
                apiKeyContainer.style.display = 'none';
                mainContainer.style.display = 'block';
                if (!isCustomMode) {
                    fetchLatestModelAndAnswer(apiKey);
                }
            });
        }
    });

    // Get API key button - opens the API key instructions
    getApiKeyButton.addEventListener('click', function () {
        chrome.tabs.create({ url: 'https://aistudio.google.com/app/apikey' });
    });

    // Double-click to toggle mode or change API key
    answerTextarea.addEventListener('dblclick', function () {
        if (answerTextarea.value.includes("Invalid API key") ||
            answerTextarea.value.includes("No API key")) {
            // Show API key input if invalid key
            chrome.storage.local.get(['apiKey'], function (result) {
                apiKeyInput.value = result.apiKey || '';
                apiKeyContainer.style.display = 'block';
                mainContainer.style.display = 'none';
            });
        } else {
            // Toggle custom mode
            isCustomMode = !isCustomMode;
            chrome.storage.local.set({ customMode: isCustomMode });
            updateUIMode(isCustomMode);

            if (!isCustomMode) {
                chrome.storage.local.get(['apiKey'], function (result) {
                    if (result.apiKey) {
                        fetchLatestModelAndAnswer(result.apiKey);
                    }
                });
            }
        }
    });

    // Submit custom prompt button
    submitPromptButton.addEventListener('click', function () {
        if (!isCustomMode) {
            // Switch to custom mode
            isCustomMode = true;
            chrome.storage.local.set({ customMode: true });
            updateUIMode(true);
            return;
        }

        const customPrompt = answerTextarea.value.trim();
        if (customPrompt || imageData) {
            processCustomPrompt(customPrompt);
        }
    });

    // Handle Enter key in textarea
    answerTextarea.addEventListener('keydown', function (event) {
        // Add keyboard navigation for chat history
        if (isCustomMode) {
            if (event.key === 'ArrowUp' && event.ctrlKey) {
                event.preventDefault();
                navigateHistory(-1); // Go back in history
            } else if (event.key === 'ArrowDown' && event.ctrlKey) {
                event.preventDefault();
                navigateHistory(1); // Go forward in history
            }
        }

        if (event.key === 'Enter' && event.ctrlKey) {
            event.preventDefault();
            const customPrompt = answerTextarea.value.trim();
            if ((customPrompt || imageData) && isCustomMode) {
                processCustomPrompt(customPrompt);
            }
        }
    });

    // Chat history navigation
    function navigateHistory(direction) {
        if (chatHistory.length === 0) return;

        const newIndex = currentHistoryIndex + direction;

        // Boundary checks
        if (newIndex < 0) {
            currentHistoryIndex = 0;
        } else if (newIndex >= chatHistory.length) {
            currentHistoryIndex = chatHistory.length - 1;
        } else {
            currentHistoryIndex = newIndex;
        }

        // Update textarea with selected history item
        const historyItem = chatHistory[currentHistoryIndex];
        if (historyItem) {
            answerTextarea.value = historyItem.userPrompt || "";

            // If there's an associated image, restore it
            if (historyItem.imageData) {
                imageData = historyItem.imageData;
                imagePreview.src = `data:image/png;base64,${imageData}`;
                imagePreviewContainer.style.display = 'block';
            } else {
                imageData = null;
                imagePreviewContainer.style.display = 'none';
            }
        }
    }

    // Save current input to storage
    function saveCurrentInput() {
        if (isCustomMode) {
            const currentPrompt = answerTextarea.value.trim();
            chrome.storage.local.set({ lastPrompt: currentPrompt });
        }
    }

    // Save input when popup loses focus or closes
    window.addEventListener('blur', saveCurrentInput);
    window.addEventListener('beforeunload', saveCurrentInput);

    // Handle paste event for both text and images
    answerTextarea.addEventListener('paste', function (event) {
        if (!isCustomMode) {
            return; // Only handle paste in custom mode
        }

        const items = (event.clipboardData || event.originalEvent.clipboardData).items;

        for (const item of items) {
            if (item.type.indexOf('image') === 0) {
                event.preventDefault();

                const blob = item.getAsFile();
                const reader = new FileReader();
                reader.onload = function (e) {
                    imageData = e.target.result.split(',')[1]; // Get base64 data
                    imagePreview.src = e.target.result;
                    imagePreviewContainer.style.display = 'block';

                    // Position the floating image icon outside the textarea
                    positionImagePreview();
                };
                reader.readAsDataURL(blob);
                return;
            }
        }
    });

    // Function to position the image preview
    function positionImagePreview() {
        // Make sure it's positioned relative to the window
        imagePreviewContainer.style.position = 'fixed';

        // Keep it in the bottom right corner
        imagePreviewContainer.style.bottom = '10px';
        imagePreviewContainer.style.right = '10px';
    }

    // Add click event to show full image preview
    imagePreviewContainer.addEventListener('click', function (e) {
        if (e.target !== imageClose) {
            // Create a modal to show the full image
            const modal = document.createElement('div');
            modal.style.position = 'fixed';
            modal.style.top = '0';
            modal.style.left = '0';
            modal.style.width = '100%';
            modal.style.height = '100%';
            modal.style.backgroundColor = 'rgba(0,0,0,0.8)';
            modal.style.zIndex = '1000';
            modal.style.display = 'flex';
            modal.style.justifyContent = 'center';
            modal.style.alignItems = 'center';

            const fullImg = document.createElement('img');
            fullImg.src = imagePreview.src;
            fullImg.style.maxWidth = '90%';
            fullImg.style.maxHeight = '90%';
            fullImg.style.objectFit = 'contain';
            fullImg.style.borderRadius = '5px';

            modal.appendChild(fullImg);
            document.body.appendChild(modal);

            // Close modal when clicked
            modal.addEventListener('click', function () {
                document.body.removeChild(modal);
            });
        }
    });

    // Close button for image preview
    imageClose.addEventListener('click', function (e) {
        e.stopPropagation();
        imagePreviewContainer.style.display = 'none';
        imageData = null;
    });

    // Update the UI based on mode
    function updateUIMode(isCustom) {
        if (isCustom) {
            // Custom prompt mode
            document.body.classList.add('custom-mode');
            answerTextarea.placeholder = "Type prompt...";
            answerTextarea.readOnly = false;

            // Restore last prompt if available
            chrome.storage.local.get(['lastPrompt'], function (result) {
                if (result.lastPrompt) {
                    answerTextarea.value = result.lastPrompt;
                } else {
                    answerTextarea.value = "";
                }
                answerTextarea.style.color = "rgba(205, 204, 204, 0.8)";
            });

            if (parseInt(answerTextarea.style.height) > 23 || !answerTextarea.style.height) {
                answerTextarea.style.overflow = "auto";
            }

            // Show image preview if there's image data
            if (imageData) {
                imagePreviewContainer.style.display = 'block';
                positionImagePreview();
            }
        } else {
            // Auto mode
            document.body.classList.remove('custom-mode');
            answerTextarea.placeholder = "...";
            answerTextarea.readOnly = true;
            answerTextarea.value = "select...";
            answerTextarea.style.color = "rgba(205, 204, 204, 0.5)";
            imagePreviewContainer.style.display = 'none';
            imageData = null;

            answerTextarea.style.overflow = "hidden";
        }
    }

    // Process a custom prompt (with or without image)
    function processCustomPrompt(prompt) {
        // Save the prompt to history and storage
        const promptData = {
            userPrompt: prompt,
            imageData: imageData,
            timestamp: Date.now()
        };

        // Add to history and limit size to last 50 entries
        chatHistory.push(promptData);
        if (chatHistory.length > 50) {
            chatHistory.shift();
        }

        // Update current index
        currentHistoryIndex = chatHistory.length - 1;

        // Save history to storage
        chrome.storage.local.set({
            chatHistory: chatHistory,
            lastPrompt: prompt
        });

        // Continue with processing the prompt
        answerTextarea.value = "Processing...";
        answerTextarea.readOnly = true;

        if (imageData) {
            callGeminiApiWithImage(prompt, imageData);
        } else {
            callGeminiApi(prompt);
        }
    }

    function fetchLatestModelAndAnswer(apiKey) {
        // Try to get the latest available model
        fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
            .then(response => response.json())
            .then(data => {
                // Look for the latest flash model (free tier)
                const flashModels = data.models.filter(model =>
                    model.name.includes('flash') &&
                    !model.name.includes('lite') &&
                    model.supportedGenerationMethods.includes('generateContent')
                );

                if (flashModels.length > 0) {
                    // Sort by version number to get the latest
                    flashModels.sort((a, b) => {
                        const versionA = parseFloat(a.name.match(/\d+\.\d+/)[0]);
                        const versionB = parseFloat(b.name.match(/\d+\.\d+/)[0]);
                        return versionB - versionA;
                    });

                    // Get the model name from the full path
                    const latestModel = flashModels[0].name.split('/').pop();
                    currentModel = latestModel;

                    // Save the latest model for future use
                    chrome.storage.local.set({ currentModel: latestModel });
                    console.log("Using model:", latestModel);
                }
            })
            .catch(error => {
                console.error("Error fetching models, using default:", error);
            })
            .finally(() => {
                // Proceed with the answer fetch regardless of model check success
                fetchAnswer();
            });
    }

    function fetchAnswer() {
        setTimeout(() => {
            navigator.clipboard.readText()
                .then(text => {
                    if (text) {
                        const prefix = "Provide only the correct answer for this quiz question. The question can be of any type, including multiple choice, fill in the blanks, true/false, or multiple correct options. Do not include explanations or additional text. If the question is unclear, respond with 'Invalid question'.\n";
                        const question = prefix + text;
                        answerTextarea.value = "Fetching answer...";
                        callGeminiApi(question);
                    } else {
                        // If no text, check for image in clipboard
                        navigator.clipboard.read().then(clipboardItems => {
                            for (const clipboardItem of clipboardItems) {
                                for (const type of clipboardItem.types) {
                                    if (type.startsWith('image/')) {
                                        clipboardItem.getType(type).then(blob => {
                                            const reader = new FileReader();
                                            reader.onload = function () {
                                                const base64data = reader.result.split(',')[1];
                                                const question = "Provide only the correct answer for this quiz question based on the image. The question can be of any type, including multiple choice, fill in the blanks, true/false, or multiple correct options. Do not include explanations or additional text. If the question is unclear, respond with 'Invalid question'.";
                                                answerTextarea.value = "Fetching answer...";
                                                callGeminiApiWithImage(question, base64data);
                                            };
                                            reader.readAsDataURL(blob);
                                        });
                                    }
                                }
                            }
                        }).catch(err => {
                            console.error('Failed to read clipboard: ', err);
                            answerTextarea.value = "Error reading clipboard. Double-click to switch modes.";
                        });
                    }
                })
                .catch(err => {
                    console.error('Failed to read clipboard: ', err);
                    answerTextarea.value = "Error reading clipboard. Double-click to switch modes.";
                });
        }, 100);
    }

    // Handle API key error
    function handleApiKeyError() {
        answerTextarea.value = "Invalid API key. Double-click to fix.";
        answerTextarea.style.color = "red";
        answerTextarea.style.fontWeight = "bold";

        console.error("API key validation failed");

        if (isCustomMode) {
            answerTextarea.readOnly = false;
        }
    }

    // Update answer function
    function updateAnswer(text) {
        answerTextarea.value = text;

        if (isCustomMode) {
            answerTextarea.readOnly = false;
        }

        // Auto-adjust height based on content length in auto mode
        if (!isCustomMode && text.length > 50 && answerTextarea.style.height === '23px') {
            answerTextarea.style.height = Math.min(80, Math.ceil(text.length / 20) * 20) + 'px';
            answerTextarea.style.overflow = "auto";

            chrome.storage.local.set({ textareaHeight: answerTextarea.style.height });
        }
    }

    // Add theme detection and adaptation
    function applyTheme() {
        const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

        // Apply theme to any elements that need dynamic styling
        if (isDarkMode) {
            document.body.classList.add('dark-theme');
            document.body.classList.remove('light-theme');
        } else {
            document.body.classList.add('light-theme');
            document.body.classList.remove('dark-theme');
        }

        // Update any custom mode colors based on theme
        if (isCustomMode) {
            answerTextarea.style.color = isDarkMode ? "white" : "black";
        } else {
            answerTextarea.style.color = isDarkMode ? "rgba(205, 204, 204, 0.5)" : "rgba(50, 50, 50, 0.5)";
        }
    }

    // Apply theme on load
    applyTheme();

    // Listen for theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

    // Modify your existing API call functions to respect the theme
    function callGeminiApi(question) {
        chrome.storage.local.get(['apiKey', 'currentModel'], function (result) {
            const apiKey = result.apiKey;
            const modelToUse = result.currentModel || DEFAULT_MODEL;

            if (!apiKey) {
                updateAnswer("No API key. Double-click to add.");
                return;
            }

            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${apiKey}`;

            fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    "contents": [{
                        "parts": [{ "text": question }]
                    }]
                })
            })
                .then(response => {
                    if (!response.ok) {
                        if (response.status === 400 || response.status === 401 || response.status === 403) {
                            throw new Error("API_KEY_ERROR");
                        }
                        throw new Error("API_ERROR");
                    }
                    return response.json();
                })
                .then(data => {
                    let geminiAnswer = "";
                    try {
                        geminiAnswer = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No answer received.";

                        // Format the answer to remove markdown formatting
                        geminiAnswer = formatPlainText(geminiAnswer);

                        // Reset styling based on current theme
                        const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                        answerTextarea.style.color = isCustomMode ?
                            (isDarkMode ? "white" : "black") :
                            (isDarkMode ? "rgba(205, 204, 204, 0.5)" : "rgba(50, 50, 50, 0.5)");

                        answerTextarea.style.fontWeight = "normal";

                        updateAnswer(geminiAnswer);

                        // Save answer to history if in custom mode
                        if (isCustomMode && chatHistory.length > 0) {
                            // Update the latest history entry with the answer
                            chatHistory[chatHistory.length - 1].aiResponse = geminiAnswer;
                            chrome.storage.local.set({ chatHistory: chatHistory });

                            // Only copy to clipboard if in custom mode
                            navigator.clipboard.writeText(geminiAnswer)
                                .then(() => {
                                    console.log('Answer copied to clipboard');
                                })
                                .catch(err => {
                                    console.error('Failed to copy answer to clipboard:', err);
                                });
                        }

                    } catch (error) {
                        console.error("Error extracting answer:", error, data);
                        updateAnswer("Error processing answer.");
                    }
                })
                .catch(error => {
                    console.error('Error calling Gemini API:', error);

                    if (error.message === "API_KEY_ERROR") {
                        handleApiKeyError();
                    } else {
                        updateAnswer("Error. Double-click to retry.");
                    }
                });
        });
    }

    // Add the same formatting function to the image API call
    function callGeminiApiWithImage(question, base64data) {
        chrome.storage.local.get(['apiKey', 'currentModel'], function (result) {
            const apiKey = result.apiKey;
            const modelToUse = result.currentModel || DEFAULT_MODEL;

            if (!apiKey) {
                updateAnswer("No API key. Double-click to add.");
                return;
            }

            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${apiKey}`;

            fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    "contents": [{
                        "parts": [
                            { "text": question || "Analyze this image and provide a detailed description:" },
                            { "inline_data": { "mime_type": "image/png", "data": base64data } }
                        ]
                    }]
                })
            })
                .then(response => {
                    if (!response.ok) {
                        if (response.status === 400 || response.status === 401 || response.status === 403) {
                            throw new Error("API_KEY_ERROR");
                        }
                        throw new Error("API_ERROR");
                    }
                    return response.json();
                })
                .then(data => {
                    let geminiAnswer = "";
                    try {
                        geminiAnswer = data?.candidates?.[0]?.content?.parts?.[0]?.text;

                        if (!geminiAnswer) {
                            geminiAnswer = "No answer received.";
                        }

                        // Reset styling based on current theme
                        const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                        answerTextarea.style.color = isCustomMode ? "white" : "rgba(205, 204, 204, 0.5)";
                        answerTextarea.style.fontWeight = "normal";

                        updateAnswer(geminiAnswer);

                        // Save answer to history if in custom mode
                        if (isCustomMode && chatHistory.length > 0) {
                            // Update the latest history entry with the answer
                            chatHistory[chatHistory.length - 1].aiResponse = geminiAnswer;
                            chrome.storage.local.set({ chatHistory: chatHistory });
                        }

                        if (isCustomMode) {
                            // Keep image preview visible for reference
                            // Will be hidden when user clicks close button

                            // Copy answer to clipboard
                            navigator.clipboard.writeText(geminiAnswer)
                                .then(() => {
                                    console.log('Answer copied to clipboard');
                                })
                                .catch(err => {
                                    console.error('Failed to copy answer to clipboard:', err);
                                });
                        }

                    } catch (error) {
                        console.error("Error extracting answer:", error, data);
                        updateAnswer("Error extracting answer.");
                    }
                })
                .catch(error => {
                    console.error('Error calling Gemini API:', error);

                    if (error.message === "API_KEY_ERROR") {
                        handleApiKeyError();
                    } else {
                        updateAnswer("Error getting answer from Gemini.");
                    }
                });
        });
    }
});

// Add this new function to format text by removing markdown symbols
function formatPlainText(text) {
    if (!text) return text;

    // Remove asterisks for bold/italic
    text = text.replace(/\*\*\*(.*?)\*\*\*/g, '$1'); // Bold italic
    text = text.replace(/\*\*(.*?)\*\*/g, '$1');     // Bold
    text = text.replace(/\*(.*?)\*/g, '$1');         // Italic

    // Remove underscores for italic/bold
    text = text.replace(/___(.*)___/g, '$1');        // Bold italic
    text = text.replace(/__(.*)__/g, '$1');          // Bold
    text = text.replace(/_(.*)_/g, '$1');            // Italic

    // Remove backticks for code
    text = text.replace(/```(.*?)```/gs, '$1');      // Code blocks
    text = text.replace(/`(.*?)`/g, '$1');           // Inline code

    // Remove hash symbols for headers but keep the text
    text = text.replace(/^#+\s+(.*?)$/gm, '$1');

    // Remove bullet points but keep the text
    text = text.replace(/^\s*[\*\-\+]\s+(.*?)$/gm, '$1');

    // Remove numbered lists but keep the text
    text = text.replace(/^\s*\d+\.\s+(.*?)$/gm, '$1');

    return text;
}
