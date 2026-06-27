let overlayElement = null;
let onCloseCallback = null;

export function showPopupOverlay(onClose) {
    // 既存オーバーレイを削除
    hidePopupOverlay();
    
    onCloseCallback = onClose;
    
    overlayElement = document.createElement('div');
    overlayElement.className = 'popup-overlay';
    overlayElement.style.position = 'fixed';
    overlayElement.style.top = '0';
    overlayElement.style.left = '0';
    overlayElement.style.width = '100%';
    overlayElement.style.height = '100%';
    overlayElement.style.zIndex = '10002';
    overlayElement.style.backgroundColor = 'rgba(0,0,0,0.2)';
    
    overlayElement.addEventListener('click', () => {
        if (onCloseCallback) {
            onCloseCallback();
        }
        hidePopupOverlay();
    });
    
    document.body.appendChild(overlayElement);
}

export function hidePopupOverlay() {
    if (overlayElement) {
        overlayElement.remove();
        overlayElement = null;
        onCloseCallback = null;
    }
}
