(function injectBackButton(documentObject) {
    const btn = documentObject.createElement("a");
    btn.className = "game-back-btn";
    btn.href = "../index.html";
    btn.setAttribute("aria-label", "返回游戏平台");

    btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg><span>返回</span>';

    documentObject.body.appendChild(btn);
})(document);
