document.addEventListener('DOMContentLoaded', function () {
    const setupCard = document.getElementById('setup-card');
    const mainCard = document.getElementById('main-card');
    const apiKeyInput = document.getElementById('api-key-input');
    const saveKeyBtn = document.getElementById('save-api-key');
    const analyzeBtn = document.getElementById('analyze-btn');
    const resetKeyBtn = document.getElementById('reset-key');
    const resultArea = document.getElementById('result-area');
    const statusMsg = document.getElementById('status-msg');

    // Initialize state
    checkApiKey();

    saveKeyBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        if (key) {
            chrome.storage.local.set({ apiKey: key }, () => {
                checkApiKey();
                statusMsg.textContent = "API Key saved!";
                setTimeout(() => statusMsg.textContent = "", 2000);
            });
        }
    });

    resetKeyBtn.addEventListener('click', () => {
        chrome.storage.local.remove(['apiKey'], () => {
            checkApiKey();
            resultArea.textContent = "Ready to help! Copy a question or image and click Analyze.";
        });
    });

    analyzeBtn.addEventListener('click', fetchAnswer);

    function checkApiKey() {
        chrome.storage.local.get(['apiKey'], (result) => {
            if (result.apiKey) {
                setupCard.classList.add('hidden');
                mainCard.classList.remove('hidden');
            } else {
                setupCard.classList.remove('hidden');
                mainCard.classList.add('hidden');
            }
        });
    }

    async function fetchAnswer() {
        resultArea.textContent = "Reading clipboard...";
        statusMsg.textContent = "Processing...";
        analyzeBtn.disabled = true;

        try {
            // 1. Try to read Image or Text from Clipboard
            // Note: navigator.clipboard.read() requires user gesture and permission (usually granted in extension popup)
            const clipboardItems = await navigator.clipboard.read();
            let imageBlob = null;
            let text = null;

            for (const item of clipboardItems) {
                // Check for images
                const imageType = item.types.find(t => t.startsWith('image/'));
                if (imageType) {
                    imageBlob = await item.getType(imageType);
                }

                // Check for text
                if (item.types.includes('text/plain')) {
                    const blob = await item.getType('text/plain');
                    text = await blob.text();
                }
            }

            // Fallback for text if read() didn't return text explicitly or failed partially
            if (!text && !imageBlob) {
                 try {
                     text = await navigator.clipboard.readText();
                 } catch (e) {
                     console.log("readText fallback failed or empty");
                 }
            }

            if (!text && !imageBlob) {
                resultArea.textContent = "Clipboard is empty. Please copy some text or an image first.";
                analyzeBtn.disabled = false;
                statusMsg.textContent = "";
                return;
            }

            // Display what we found
            if (imageBlob && text) resultArea.textContent = "Found Image and Text. Analyzing...";
            else if (imageBlob) resultArea.textContent = "Found Image. Analyzing...";
            else resultArea.textContent = `Found Text: "${text.substring(0, 50)}...". Analyzing...`;

            // 2. Call Gemini
            callGeminiApi(text, imageBlob);

        } catch (err) {
            console.error('Clipboard error:', err);
            // Fallback: try simple readText
            try {
                const text = await navigator.clipboard.readText();
                if (text) {
                     resultArea.textContent = `Found Text: "${text.substring(0, 50)}...". Analyzing...`;
                     callGeminiApi(text, null);
                } else {
                    throw new Error("No text found");
                }
            } catch (e) {
                resultArea.textContent = "Error reading clipboard. Please ensure you have copied content.";
                analyzeBtn.disabled = false;
                statusMsg.textContent = "";
            }
        }
    }

    function callGeminiApi(text, imageBlob) {
        chrome.storage.local.get(['apiKey'], function (result) {
            const apiKey = result.apiKey;
            if (!apiKey) {
                resultArea.textContent = "Error: API Key missing.";
                analyzeBtn.disabled = false;
                return;
            }

            const parts = [];
            // Educational Prompt
            const prefix = "You are a helpful study assistant. Please explain the answer to this question clearly. If it's a multiple choice question, indicate the correct option and explain why it is correct.\nQuestion: ";

            if (text) {
                parts.push({ "text": prefix + text });
            } else if (imageBlob) {
                parts.push({ "text": "Please analyze this image and explain the educational concept or solve the problem shown. " + prefix });
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
                if (!ans) ans = "No answer generated.";
            } catch (e) {
                ans = "Error parsing API response.";
            }
            resultArea.textContent = ans;
        })
        .catch(error => {
            console.error('API Error:', error);
            resultArea.textContent = "Failed to connect to Gemini API.";
        })
        .finally(() => {
            analyzeBtn.disabled = false;
            statusMsg.textContent = "Done.";
        });
    }
});
