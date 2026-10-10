(function startGameHub(windowObject, documentObject) {
    const games = Array.isArray(windowObject.GAME_CATALOG) ? windowObject.GAME_CATALOG : [];
    const grid = documentObject.getElementById("game-grid");
    const ageTabsContainer = documentObject.getElementById("age-tabs");
    const deviceTabsContainer = documentObject.getElementById("device-tabs");

    if (!grid || !games.length || !ageTabsContainer || !deviceTabsContainer) return;

    /* 年龄筛选 Tab 定义，value 与 data/games.js 的 meta.age 取值一致 */
    const AGE_TABS = [
        { value: "all", label: "全部" },
        { value: "kids", label: "儿童" },
        { value: "adult", label: "成人" }
    ];

    /* 设备筛选 Tab 定义，value 与 data/games.js 的 meta.device 取值一致 */
    const DEVICE_TABS = [
        { value: "all", label: "全部" },
        { value: "desktop", label: "电脑端" },
        { value: "mobile", label: "移动端" }
    ];

    /* 当前选中的年龄/设备筛选，持久化到 localStorage，从游戏页返回平台时恢复上次选择 */
    let currentAge = "all";
    let currentDevice = "all";

    const FILTERS_STORAGE_KEY = "app_game_hub_filters";

    /* 读取上次筛选；存储不可用（隐私模式等）或取值非法时按「全部」兜底 */
    function loadFilterPrefs() {
        try {
            const saved = JSON.parse(windowObject.localStorage.getItem(FILTERS_STORAGE_KEY) || "null") || {};
            return {
                age: AGE_TABS.some((tab) => tab.value === saved.age) ? saved.age : "all",
                device: DEVICE_TABS.some((tab) => tab.value === saved.device) ? saved.device : "all",
                scrollY: typeof saved.scrollY === "number" && saved.scrollY > 0 ? saved.scrollY : 0
            };
        } catch (error) {
            return { age: "all", device: "all", scrollY: 0 };
        }
    }

    /* 筛选变化与离开页面前写入存储，存储失败时静默降级为不持久化 */
    function saveFilterPrefs() {
        try {
            windowObject.localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify({
                age: currentAge,
                device: currentDevice,
                scrollY: windowObject.scrollY || 0
            }));
        } catch (error) {
            /* localStorage 不可用时跳过持久化，不影响筛选本身 */
        }
    }

    /* meta 缺失、缺少 age 键或取值非法时按全龄兜底，保证游戏不被错误隐藏（CON-GH001） */
    function normalizeAge(game) {
        const age = game.meta && game.meta.age;
        return AGE_TABS.some((tab) => tab.value === age) ? age : "all";
    }

    /* device 兜底规则与 age 一致：缺失或非法按「全部设备」处理 */
    function normalizeDevice(game) {
        const device = game.meta && game.meta.device;
        return DEVICE_TABS.some((tab) => tab.value === device) ? device : "all";
    }

    /* 筛选语义为包含关系：儿童/成人 Tab 均展示全龄游戏，电脑端/移动端 Tab 均展示双端游戏（DES-GH001） */
    function matchesAge(game, age) {
        const normalized = normalizeAge(game);
        return age === "all" || normalized === age || normalized === "all";
    }

    function matchesDevice(game, device) {
        const normalized = normalizeDevice(game);
        return device === "all" || normalized === device || normalized === "all";
    }

    function countGames(age, device) {
        return games.filter((game) => matchesAge(game, age) && matchesDevice(game, device)).length;
    }

    function renderTabs(tabsElement, tabDefs, current, dimension) {
        const fragment = documentObject.createDocumentFragment();
        tabDefs.forEach((tab) => {
            const button = documentObject.createElement("button");
            button.type = "button";
            button.className = "hub-tab";
            button.setAttribute("aria-selected", current === tab.value ? "true" : "false");
            button.dataset[dimension] = tab.value;

            const label = documentObject.createElement("span");
            label.textContent = tab.label;

            const count = documentObject.createElement("span");
            count.className = "hub-tab-count";
            count.textContent = String(countGames(
                dimension === "age" ? tab.value : currentAge,
                dimension === "device" ? tab.value : currentDevice
            ));
            button.appendChild(label);
            button.appendChild(count);
            fragment.appendChild(button);
        });
        tabsElement.replaceChildren(fragment);
    }

    /* 两行 Tab 各自按本维度计数：数量独立于另一维度的选中态（用户已确认口径） */
    function renderAllTabs() {
        renderTabs(ageTabsContainer, AGE_TABS, currentAge, "age");
        renderTabs(deviceTabsContainer, DEVICE_TABS, currentDevice, "device");
    }

    /* 每个游戏的 banner 图标和标签 */
    const gameMeta = {
        "2048":            { icon: "🎲", tag: "休闲" },
        "gomoku-advanced": { icon: "♟️", tag: "策略" },
        "tetris":          { icon: "🧩", tag: "经典" },
        "maze":            { icon: "🌊", tag: "冒险" },
        "color-challenge": { icon: "🎨", tag: "休闲" },
        "sliding-puzzle":  { icon: "🯰", tag: "益智" },
        "hidden-cats":     { icon: "🐱", tag: "休闲" },
        "yibihua":         { icon: "✏️", tag: "益智" },
        "animal-flip-chess": { icon: "🐘", tag: "策略" },
        "pipes":           { icon: "🚰", tag: "益智" },
        "lights-out":      { icon: "💡", tag: "益智" },
        "minesweeper":     { icon: "💣", tag: "经典" },
        "typing-cannon":   { icon: "🔤", tag: "学习" },
        "math-hero":       { icon: "🛡️", tag: "学习" },
        "zh-poem":         { icon: "📜", tag: "学习" },
        "pinyin-typing":   { icon: "⌨️", tag: "学习" },
        "tangram":         { icon: "🔺", tag: "益智" },
        "clock-learning":  { icon: "🕐", tag: "学习" },
        "shopping-cashier": { icon: "🛒", tag: "学习" },
        "pattern-quest":   { icon: "🔀", tag: "学习" },
        "code-robot":      { icon: "🤖", tag: "益智" },
        "balance-scale":   { icon: "⚖️", tag: "学习" },
        "water-pour":      { icon: "🥛", tag: "益智" },
        "hanzi-parts":     { icon: "✍️", tag: "学习" },
        "mini-sudoku":     { icon: "🔢", tag: "益智" },
        "memory-match":    { icon: "🧠", tag: "益智" },
        "snake":           { icon: "🐍", tag: "休闲" },
        "breakout":        { icon: "🧱", tag: "经典" },
        "math-24":         { icon: "🧮", tag: "益智" },
        "nonogram":        { icon: "🖼️", tag: "益智" },
        "sokoban":         { icon: "📦", tag: "益智" },
        "idiom-guess":     { icon: "🀄", tag: "学习" },
    };

    function getGamePath(game) {
        const isMobile = windowObject.innerWidth <= 640;
        if (isMobile && game.mobilePath) return game.mobilePath;
        return game.path;
    }

    function createCard(game) {
        const meta = gameMeta[game.slug] || { icon: "🎮", tag: "游戏" };

        const a = documentObject.createElement("a");
        a.className = "game-card";
        a.href = getGamePath(game);
        a.dataset.slug = game.slug;
        a.setAttribute("role", "listitem");

        const banner = documentObject.createElement("div");
        banner.className = "game-card-banner";
        banner.textContent = meta.icon;

        const body = documentObject.createElement("div");
        body.className = "game-card-body";

        const title = documentObject.createElement("p");
        title.className = "game-card-title";
        title.textContent = game.title;

        const desc = documentObject.createElement("p");
        desc.className = "game-card-desc";
        desc.textContent = game.desc;

        const tag = documentObject.createElement("span");
        tag.className = "game-card-tag";
        tag.textContent = meta.tag;

        body.appendChild(title);
        body.appendChild(desc);
        body.appendChild(tag);
        a.appendChild(banner);
        a.appendChild(body);

        return a;
    }

    function render() {
        const visible = games.filter((game) => matchesAge(game, currentAge) && matchesDevice(game, currentDevice));

        /* 防御性空态：当前目录下各维度组合均有游戏，仅数据异常时出现 */
        if (!visible.length) {
            const empty = documentObject.createElement("p");
            empty.className = "hub-empty";
            empty.textContent = "该分类下暂无游戏，看看其他分类吧";
            grid.replaceChildren(empty);
            return;
        }

        const fragment = documentObject.createDocumentFragment();
        visible.forEach((game) => fragment.appendChild(createCard(game)));
        grid.replaceChildren(fragment);
    }

    ageTabsContainer.addEventListener("click", (event) => {
        const button = event.target.closest(".hub-tab");
        const age = button && button.dataset.age;
        if (!AGE_TABS.some((tab) => tab.value === age) || age === currentAge) return;
        currentAge = age;
        renderAllTabs();
        render();
        saveFilterPrefs();
    });

    deviceTabsContainer.addEventListener("click", (event) => {
        const button = event.target.closest(".hub-tab");
        const device = button && button.dataset.device;
        if (!DEVICE_TABS.some((tab) => tab.value === device) || device === currentDevice) return;
        currentDevice = device;
        renderAllTabs();
        render();
        saveFilterPrefs();
    });

    /* 启动时恢复上次筛选与浏览位置（无存储时为默认「全部 / 全部」） */
    const prefs = loadFilterPrefs();
    currentAge = prefs.age;
    currentDevice = prefs.device;
    renderAllTabs();
    render();
    if (prefs.scrollY && typeof windowObject.scrollTo === "function") {
        windowObject.scrollTo(0, prefs.scrollY);
    }

    /* 离开页面前记录滚动位置；测试桩等无 addEventListener 的环境自动跳过 */
    if (typeof windowObject.addEventListener === "function") {
        windowObject.addEventListener("pagehide", saveFilterPrefs);
    }
})(window, document);
