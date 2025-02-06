// Add CSS to disable text selection highlighting
const style = document.createElement('style');
style.textContent = `
    ::selection {
        background-color: transparent !important;
        color: inherit !important;
    }
    ::-moz-selection {
        background-color: transparent !important;
        color: inherit !important;
    }
    ::-webkit-selection {
        background-color: transparent !important;
        color: inherit !important;
    }
`;
document.head.appendChild(style);

// Auto-copy selected text
document.addEventListener('selectionchange', () => {
    const selectedText = window.getSelection().toString();
    if (selectedText) {
        navigator.clipboard.writeText(selectedText)
            .then(() => {
                console.log('Text copied to clipboard:', selectedText);
            })
            .catch(err => {
                console.error('Failed to copy text:', err);
            });
    }
});