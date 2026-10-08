(function injectBackButton(documentObject) {
    // 防止页面重复引入脚本时注入多个按钮
    if (documentObject.querySelector(".game-back-btn")) return;

    // 按钮样式随脚本自包含注入，游戏页无需额外引入 custom.css
    const style = documentObject.createElement("style");
    style.textContent = [
        ".game-back-btn {",
        "    position: fixed;",
        "    top: max(12px, env(safe-area-inset-top));",
        "    left: max(12px, env(safe-area-inset-left));",
        "    z-index: 9999;",
        "    display: flex;",
        "    align-items: center;",
        "    gap: 6px;",
        "    padding: 8px 14px;",
        "    border: 0;",
        "    border-radius: 20px;",
        "    background: rgba(17, 24, 39, 0.72);",
        "    backdrop-filter: blur(8px);",
        "    color: #fff;",
        "    font-size: 13px;",
        "    font-weight: 600;",
        "    font-family: inherit;",
        "    cursor: pointer;",
        "    text-decoration: none;",
        "    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);",
        "    transition: background 150ms, transform 150ms;",
        "    line-height: 1;",
        "}",
        ".game-back-btn:active {",
        "    background: rgba(17, 24, 39, 0.9);",
        "    transform: scale(0.95);",
        "}",
        ".game-back-btn svg {",
        "    width: 16px;",
        "    height: 16px;",
        "    fill: none;",
        "    stroke: currentColor;",
        "    stroke-width: 2.5;",
        "    stroke-linecap: round;",
        "    stroke-linejoin: round;",
        "}"
    ].join("\n");
    documentObject.head.appendChild(style);

    const btn = documentObject.createElement("a");
    btn.className = "game-back-btn";
    btn.href = "../../index.html";
    btn.setAttribute("aria-label", "返回游戏平台");

    btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg><span>返回</span>';

    documentObject.body.appendChild(btn);
})(document);
