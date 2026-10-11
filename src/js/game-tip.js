// @ts-check
/* 首次进入玩法提示组件（游戏页共享，范式同 game-back.js：样式随脚本自包含注入，
 * 游戏页只加一个带 data 配置的 script 标签，游戏逻辑脚本与本组件零耦合）。
 *
 * 用法（放在页面 body 末尾、与 game-back.js 并列）：
 *   <script src="../js/game-tip.js"
 *           data-slug="tangram"
 *           data-text="先在托盘点选一块板，再点拼板上的对应位置放入；放错会退回，拼满剪影即过关。"></script>
 *
 * 行为：
 *   - 首次进入（无关闭记录）在 main 顶部展示玩法提示条；
 *   - 点「知道了」记入 localStorage（键 app_game_<slug>_howto_seen，与 store.js 的
 *     buildGameKey 命名约定一致），之后进入不再展示；
 *   - 右上角常驻「?」按钮随时可重新展开提示条，错过首次提示也能找回。
 */
(function injectGameTip(documentObject, windowObject) {
    /* 防止页面重复引入脚本时注入多个提示条与按钮 */
    if (documentObject.querySelector(".game-first-tip")) return;

    const scriptElement = /** @type {HTMLElement & {dataset: Record<string, string>} | null} */ (documentObject.currentScript);
    const slug = scriptElement && scriptElement.dataset ? scriptElement.dataset.slug : "";
    const tipText = scriptElement && scriptElement.dataset ? scriptElement.dataset.text : "";
    if (!slug || !tipText) {
        if (windowObject.console && windowObject.console.warn) {
            windowObject.console.warn("[game-tip] 缺少 data-slug 或 data-text 配置，本次不注入提示组件。");
        }
        return;
    }

    /* 存档读写兜底：localStorage 不可用时退回内存，保证页面加载不报错（仅当次会话内生效） */
    const memoryStorage = {};
    function readSeenFlag() {
        try {
            return windowObject.localStorage.getItem("app_game_" + slug + "_howto_seen");
        } catch (error) {
            return Object.prototype.hasOwnProperty.call(memoryStorage, "seen") ? memoryStorage.seen : null;
        }
    }
    function writeSeenFlag() {
        memoryStorage.seen = "1";
        try {
            windowObject.localStorage.setItem("app_game_" + slug + "_howto_seen", "1");
        } catch (error) {
            /* 隐私模式等存储不可用场景：本次会话内靠内存兜底，静默跳过持久化 */
        }
    }

    /* 组件样式自包含注入，游戏页无需额外引入 CSS */
    const style = documentObject.createElement("style");
    style.textContent = [
        ".game-first-tip {",
        "    display: flex;",
        "    align-items: center;",
        "    gap: 12px;",
        "    margin: 0 0 14px;",
        "    padding: 12px 14px;",
        "    border: 2px dashed #e8a33d;",
        "    border-radius: 14px;",
        "    background: #fff7e6;",
        "    animation: gameTipFadeIn 240ms ease;",
        "}",
        ".game-first-tip[hidden] { display: none; }",
        ".game-first-tip__text {",
        "    margin: 0;",
        "    flex: 1;",
        "    font-size: 13.5px;",
        "    line-height: 1.7;",
        "    font-weight: 600;",
        "    color: #6b4e16;",
        "}",
        ".game-first-tip__close {",
        "    flex-shrink: 0;",
        "    min-height: 44px;",
        "    padding: 0 16px;",
        "    border: 0;",
        "    border-radius: 999px;",
        "    background: #e8a33d;",
        "    color: #5c4300;",
        "    font-size: 14px;",
        "    font-weight: 800;",
        "    font-family: inherit;",
        "    cursor: pointer;",
        "    transition: transform 120ms ease;",
        "}",
        ".game-first-tip__close:active { transform: scale(0.95); }",
        ".game-tip-help {",
        "    flex-shrink: 0;",
        "    display: flex;",
        "    align-items: center;",
        "    justify-content: center;",
        "    width: 40px;",
        "    height: 40px;",
        "    margin-left: 8px;",
        "    border: 2px solid #e8a33d;",
        "    border-radius: 50%;",
        "    background: #fff7e6;",
        "    color: #b07a1e;",
        "    font-size: 18px;",
        "    font-weight: 800;",
        "    font-family: inherit;",
        "    line-height: 1;",
        "    cursor: pointer;",
        "    transition: transform 150ms ease;",
        "}",
        ".game-tip-help:active { transform: scale(0.92); }",
        "/* 无 .game-header 的页面：回退为右上角浮层按钮（低层级，不遮弹窗） */",
        ".game-tip-help.is-floating {",
        "    position: fixed;",
        "    top: max(12px, env(safe-area-inset-top));",
        "    right: max(12px, env(safe-area-inset-right));",
        "    z-index: 15;", /* 低于各游戏弹窗遮罩层（≥20），弹窗期间不抢交互 */
        "    margin-left: 0;",
        "    border: 0;",
        "    background: rgba(17, 24, 39, 0.72);",
        "    backdrop-filter: blur(8px);",
        "    color: #fff;",
        "    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);",
        "}",
        "@media (prefers-reduced-motion: reduce) {",
        "    .game-first-tip { animation: none; }",
        "    .game-first-tip__close, .game-tip-help { transition: none; }",
        "}",
        "@keyframes gameTipFadeIn {",
        "    from { opacity: 0; transform: translateY(-6px); }",
        "    to { opacity: 1; transform: translateY(0); }",
        "}"
    ].join("\n");
    documentObject.head.appendChild(style);

    /* 提示条：插入 main 首位继承游戏内容宽度；无 main 时兜底挂 body 顶部 */
    const tipBar = documentObject.createElement("section");
    tipBar.id = "game-first-tip-bar";
    tipBar.className = "game-first-tip";
    tipBar.setAttribute("role", "note");
    tipBar.setAttribute("aria-label", "玩法说明");

    const tipParagraph = documentObject.createElement("p");
    tipParagraph.className = "game-first-tip__text";
    tipParagraph.textContent = tipText;

    const closeButton = documentObject.createElement("button");
    closeButton.type = "button";
    closeButton.className = "game-first-tip__close";
    closeButton.textContent = "知道了";
    closeButton.addEventListener("click", () => {
        tipBar.hidden = true;
        helpButton.setAttribute("aria-expanded", "false");
        writeSeenFlag();
    });

    tipBar.appendChild(tipParagraph);
    tipBar.appendChild(closeButton);

    /* 「?」按钮：优先插入 .game-header 行尾（随各游戏页头布局自适应，
     * 避免浮层遮住关卡胶囊、撤销等既有右上角控件）；无页头时回退右上角浮层 */
    const helpButton = documentObject.createElement("button");
    helpButton.type = "button";
    helpButton.className = "game-tip-help";
    helpButton.textContent = "?";
    helpButton.setAttribute("aria-label", "查看玩法说明");
    helpButton.setAttribute("aria-controls", "game-first-tip-bar");
    helpButton.setAttribute("aria-expanded", "false");
    helpButton.addEventListener("click", () => {
        tipBar.hidden = false;
        helpButton.setAttribute("aria-expanded", "true");
        closeButton.focus();
    });

    const mainContainer = documentObject.querySelector("main");
    const gameHeader = documentObject.querySelector(".game-header");
    /* 提示条位置：有页头时插到页头之后（标题在上、提示在下，同 memory-match 形态）；
     * 无页头插 main 首位；无 main 兜底挂 body 顶部 */
    if (mainContainer) {
        const tipAnchor = gameHeader && gameHeader.parentElement === mainContainer
            ? gameHeader.nextSibling
            : mainContainer.firstChild;
        mainContainer.insertBefore(tipBar, tipAnchor);
    } else {
        documentObject.body.insertBefore(tipBar, documentObject.body.firstChild);
    }

    if (gameHeader) {
        gameHeader.appendChild(helpButton);
    } else {
        helpButton.className = "game-tip-help is-floating";
        documentObject.body.appendChild(helpButton);
    }

    /* 首次进入（无关闭记录）自动展开；已关闭过则只留右上角入口 */
    const seen = readSeenFlag();
    tipBar.hidden = seen === "1";
    helpButton.setAttribute("aria-expanded", seen === "1" ? "false" : "true");
})(document, window);
