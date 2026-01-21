document.addEventListener('DOMContentLoaded', function () {
    const apiKeyContainer = document.getElementById('api-key-container');
    const apiKeyInput = document.getElementById('api-key-input');
    const saveApiKeyButton = document.getElementById('save-api-key');
    const answerTextarea = document.getElementById('answer');

    // Check if API key is already saved
    chrome.storage.local.get(['apiKey'], function (result) {
        if (!result.apiKey) {
            // Show API key input if not saved
            apiKeyContainer.style.display = 'block';
        } else {
            // Proceed with the main functionality
            fetchAnswer();
        }
    });

    // Save API key
    saveApiKeyButton.addEventListener('click', function () {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            chrome.storage.local.set({ apiKey: apiKey }, function () {
                apiKeyContainer.style.display = 'none';
                fetchAnswer();
            });
        }
    });

    function fetchAnswer() {
        setTimeout(() => {
            navigator.clipboard.readText()
                .then(text => {
                    const prefix = "Provide only the single correct answer for this multiple choice question. Do not include explanations or additional options. If the question is unclear, respond with 'Invalid question'.\n";
                    const question = prefix + text;
                    answerTextarea.value = "Fetching answer...";
                    callGeminiApi(question);
                })
                .catch(err => {
                    console.error('Failed to read clipboard: ', err);
                    answerTextarea.value = "Error reading clipboard. Please copy text and try again.";
                });
        }, 100);
    }

    function callGeminiApi(question) {
        chrome.storage.local.get(['apiKey'], function (result) {
            const apiKey = result.apiKey;
            if (!apiKey) {
                answerTextarea.value = "API key not found. Please reload the extension.";
                return;
            }

            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

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
            .then(response => response.json())
            .then(data => {
                console.log("Gemini API Response:", JSON.stringify(data, null, 2));

                let geminiAnswer = "";
                try {
                    geminiAnswer = data?.candidates?.[0]?.content?.parts?.[0]?.text;

                    // Validate the response
                    if (!geminiAnswer || geminiAnswer.toLowerCase().includes("invalid question")) {
                        geminiAnswer = "Invalid question or no answer found.";
                    } else if (geminiAnswer.split("\n").length > 1) {
                        // If multiple lines, take the first line as the answer
                        geminiAnswer = geminiAnswer.split("\n")[0];
                    }

                } catch (error) {
                    console.error("Error extracting answer:", error, data);
                    geminiAnswer = "Error extracting answer. Check the console.";
                }

                answerTextarea.value = geminiAnswer || "No answer received.";

                setTimeout(() => {
                    adjustPopupSize();
                }, 0);
            })
            .catch(error => {
                console.error('Error calling Gemini API:', error);
                answerTextarea.value = "Error getting answer from Gemini. Check the console.";
            });
        });
    }

    function adjustPopupSize() {
        const body = document.body;
        const answerTextarea = document.getElementById('answer');

        body.style.width = answerTextarea.offsetWidth + "px";
        body.style.height = answerTextarea.offsetHeight + "px";

        chrome.windows.getCurrent(function (window) {
            chrome.windows.update(window.id, {
                width: body.offsetWidth,
                height: body.offsetHeight
            });
        });
    }
});