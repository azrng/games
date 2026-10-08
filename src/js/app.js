(function startGameHub(windowObject, documentObject) {
    const games = Array.isArray(windowObject.GAME_CATALOG) ? windowObject.GAME_CATALOG : [];
    const grid = documentObject.getElementById("game-grid");
    const tabsContainer = documentObject.getElementById("age-tabs");

    if (!grid || !games.length || !tabsContainer) return;

    /* 年龄筛选 Tab 定义，value 与 data/games.js 的 meta.age 取值一致 */
    const AGE_TABS = [
        { value: "all", label: "全部" },
        { value: "kids", label: "儿童" },
        { value: "adult", label: "成人" }
    ];

    /* 当前选中的年龄筛选，仅影响首页展示，不持久化 */
    let currentAge = "all";

    /* meta 缺失、缺少 age 键或取值非法时按全龄兜底，保证游戏不被错误隐藏（CON-GH001） */
    function normalizeAge(game) {
        const age = game.meta && game.meta.age;
        return AGE_TABS.some((tab) => tab.value === age) ? age : "all";
    }

    /* 筛选语义为包含关系：儿童/成人 Tab 均展示全龄游戏（DES-GH001） */
    function matchesAge(game, age) {
        const normalized = normalizeAge(game);
        return age === "all" || normalized === age || normalized === "all";
    }

    function countGames(age) {
        return games.filter((game) => matchesAge(game, age)).length;
    }

    function renderTabs() {
        const fragment = documentObject.createDocumentFragment();
        AGE_TABS.forEach((tab) => {
            const button = documentObject.createElement("button");
            button.type = "button";
            button.className = "hub-tab";
            button.dataset.age = tab.value;
            button.setAttribute("role", "tab");
            button.setAttribute("aria-selected", currentAge === tab.value ? "true" : "false");

            const label = documentObject.createElement("span");
            label.textContent = tab.label;

            const count = documentObject.createElement("span");
            count.className = "hub-tab-count";
            count.textContent = String(countGames(tab.value));

            button.appendChild(label);
            button.appendChild(count);
            fragment.appendChild(button);
        });
        tabsContainer.replaceChildren(fragment);
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
        const visible = games.filter((game) => matchesAge(game, currentAge));

        /* 防御性空态：当前目录下三个分类均非空，仅数据异常时出现 */
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

    tabsContainer.addEventListener("click", (event) => {
        const button = event.target.closest(".hub-tab");
        const age = button && button.dataset.age;
        if (!AGE_TABS.some((tab) => tab.value === age) || age === currentAge) return;
        currentAge = age;
        renderTabs();
        render();
    });

    renderTabs();
    render();
})(window, document);
