chrome.commands.onCommand.addListener((command) => {
    if (command === "_execute_action") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                function: copySelectedText
            });
        });
    }
});

function copySelectedText() {
    const selectedText = window.getSelection().toString();
    if (selectedText) {
        navigator.clipboard.writeText(selectedText).then(() => {
            console.log("Text copied to clipboard:", selectedText);
        }).catch(err => {
            console.error("Failed to copy text:", err);
        });
    }
}