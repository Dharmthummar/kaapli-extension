let currentInput = '0';
let previousInput = null;
let operator = null;
let waitingForSecondOperand = false;
let geminiAnswer = null; // To store the fetched answer
let isFetching = false;

document.addEventListener('DOMContentLoaded', function () {
    const display = document.getElementById('display');
    const apiKeyOverlay = document.getElementById('api-key-overlay');
    const apiKeyInput = document.getElementById('api-key-input');
    const saveApiKeyButton = document.getElementById('save-api-key');
    const resultContent = document.getElementById('result-content');
    const resultOverlay = document.getElementById('result-overlay');
    const closeResultBtn = document.getElementById('close-result');

    // Check for API key on startup
    chrome.storage.local.get(['apiKey'], function (result) {
        if (!result.apiKey) {
            apiKeyOverlay.style.display = 'flex';
        } else {
            // Silently fetch answer if key exists
            fetchAnswer();
        }
    });

    saveApiKeyButton.addEventListener('click', function () {
        const key = apiKeyInput.value.trim();
        if (key) {
            chrome.storage.local.set({ apiKey: key }, function () {
                apiKeyOverlay.style.display = 'none';
                fetchAnswer();
            });
        }
    });

    closeResultBtn.addEventListener('click', () => {
        resultOverlay.style.display = 'none';
    });

    // Calculator Logic
    document.querySelectorAll('button').forEach(button => {
        button.addEventListener('click', () => {
            const action = button.dataset.action;
            const value = button.dataset.value;

            if (button.id === 'save-api-key' || button.id === 'close-result') return;

            if (!action) {
                inputDigit(value);
            } else if (action === 'operator') {
                handleOperator(value);
            } else if (action === 'calculate') {
                calculate();
            } else if (action === 'clear') {
                clear();
            } else if (action === 'decimal') {
                inputDecimal();
            } else if (action === 'percent') {
                inputPercent();
            } else if (action === 'toggle-sign') {
                toggleSign();
            }
            updateDisplay();
        });
    });

    // Secret Triggers
    // 1. Double click on display to show result overlay
    document.getElementById('display-container').addEventListener('dblclick', () => {
        showResult();
    });

    // 2. Long press on AC to reset API key (optional)
    let acTimer;
    const acBtn = document.querySelector('button[data-action="clear"]');
    acBtn.addEventListener('mousedown', () => {
        acTimer = setTimeout(() => {
            chrome.storage.local.remove(['apiKey'], () => {
                location.reload();
            });
        }, 3000); // 3 seconds
    });
    acBtn.addEventListener('mouseup', () => clearTimeout(acTimer));
    acBtn.addEventListener('mouseleave', () => clearTimeout(acTimer));

    function inputDigit(digit) {
        if (waitingForSecondOperand) {
            currentInput = digit;
            waitingForSecondOperand = false;
        } else {
            currentInput = currentInput === '0' ? digit : currentInput + digit;
        }
    }

    function inputDecimal() {
        if (!currentInput.includes('.')) {
            currentInput += '.';
        }
    }

    function clear() {
        currentInput = '0';
        previousInput = null;
        operator = null;
        waitingForSecondOperand = false;
    }

    function toggleSign() {
        currentInput = (parseFloat(currentInput) * -1).toString();
    }

    function inputPercent() {
        currentInput = (parseFloat(currentInput) / 100).toString();
    }

    function handleOperator(nextOperator) {
        const inputValue = parseFloat(currentInput);

        if (operator && waitingForSecondOperand) {
            operator = nextOperator;
            return;
        }

        if (previousInput === null) {
            previousInput = inputValue;
        } else if (operator) {
            const result = performCalculation(operator, previousInput, inputValue);
            currentInput = String(result);
            previousInput = result;
        }

        waitingForSecondOperand = true;
        operator = nextOperator;
    }

    function calculate() {
        // SECRET: If calculation is "0 / 0", show result
        if (previousInput === 0 && operator === '/' && currentInput === '0') {
            showResult();
            clear();
            return;
        }

        // SECRET: If user just types "=" without operation, show result if ready
        if (previousInput === null && operator === null) {
             // Maybe just show it? No, let's stick to the /0 trick or double click
        }

        if (operator === null || waitingForSecondOperand) {
            return;
        }

        const inputValue = parseFloat(currentInput);
        const result = performCalculation(operator, previousInput, inputValue);
        currentInput = String(result);
        previousInput = null;
        operator = null;
        waitingForSecondOperand = false;
    }

    function performCalculation(op, first, second) {
        if (op === '+') return first + second;
        if (op === '-') return first - second;
        if (op === '*') return first * second;
        if (op === '/') return first / second;
        return second;
    }

    function updateDisplay() {
        display.value = currentInput;
    }

    function showResult() {
        if (geminiAnswer) {
            resultContent.textContent = geminiAnswer;
        } else if (isFetching) {
            resultContent.textContent = "Fetching answer...";
        } else {
            resultContent.textContent = "No answer available or clipboard empty.";
        }
        resultOverlay.style.display = 'flex';
    }

    // --- Gemini Logic ---

    async function fetchAnswer() {
        isFetching = true;

        try {
            // Check for image first
            const clipboardItems = await navigator.clipboard.read();
            let imageBlob = null;
            let text = null;

            for (const item of clipboardItems) {
                if (item.types.includes('image/png') || item.types.includes('image/jpeg')) {
                    const type = item.types.find(t => t.startsWith('image/'));
                    imageBlob = await item.getType(type);
                }
                if (item.types.includes('text/plain')) {
                    const blob = await item.getType('text/plain');
                    text = await blob.text();
                }
            }

            // Fallback to readText if no clipboard items found (some browsers restriction)
            // But read() requires permission. readText() is simpler.
            if (!text && !imageBlob) {
                try {
                     text = await navigator.clipboard.readText();
                } catch (e) {
                    console.log("readText failed or empty", e);
                }
            }

            if (!text && !imageBlob) {
                console.log("Clipboard empty");
                isFetching = false;
                return;
            }

            callGeminiApi(text, imageBlob);

        } catch (err) {
            console.error('Failed to read clipboard: ', err);
            // Fallback for Firefox or if read() is not supported/permitted
            try {
                const text = await navigator.clipboard.readText();
                if (text) callGeminiApi(text, null);
            } catch (e) {
                console.error("Fallback readText also failed", e);
                isFetching = false;
            }
        }
    }

    function callGeminiApi(text, imageBlob) {
        chrome.storage.local.get(['apiKey'], function (result) {
            const apiKey = result.apiKey;
            if (!apiKey) {
                isFetching = false;
                return;
            }

            const parts = [];
            const prefix = "Provide only the single correct answer for this multiple choice question. Do not include explanations or additional options. If the question is unclear, respond with 'Invalid question'.\n";

            if (text) {
                parts.push({ "text": prefix + text });
            } else if (imageBlob) {
                parts.push({ "text": prefix + "Analyze this image and provide the answer." });
            }

            if (imageBlob) {
                const reader = new FileReader();
                reader.onloadend = function() {
                    const base64data = reader.result.split(',')[1];
                    const mimeType = imageBlob.type;
                    parts.push({
                        "inline_data": {
                            "mime_type": mimeType,
                            "data": base64data
                        }
                    });
                    sendRequest(apiKey, parts);
                }
                reader.readAsDataURL(imageBlob);
            } else {
                sendRequest(apiKey, parts);
            }
        });
    }

    function sendRequest(apiKey, parts) {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

        fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                "contents": [{ "parts": parts }]
            })
        })
        .then(response => response.json())
        .then(data => {
            console.log("Gemini API Response:", data);
            let ans = "";
            try {
                ans = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!ans) ans = "No answer found.";
            } catch (e) {
                ans = "Error parsing response.";
            }
            geminiAnswer = ans;
        })
        .catch(error => {
            console.error('Error calling Gemini API:', error);
            geminiAnswer = "API Error.";
        })
        .finally(() => {
            isFetching = false;
        });
    }
});
