(function startGameHub(windowObject, documentObject) {
    const games = Array.isArray(windowObject.GAME_CATALOG) ? windowObject.GAME_CATALOG : [];
    const grid = documentObject.getElementById("game-grid");

    if (!grid || !games.length) return;

    /* 每个游戏的 banner 图标和标签 */
    const gameMeta = {
        "2048":            { icon: "🎲", tag: "休闲" },
        "gomoku-advanced": { icon: "♟️", tag: "策略" },
        "tetris":          { icon: "🧩", tag: "经典" },
        "maze":            { icon: "🌊", tag: "冒险" },
        "color-challenge": { icon: "🎨", tag: "休闲" },
        "sliding-puzzle":  { icon: "🯰", tag: "益智" },
        "hidden-cats":     { icon: "🐱", tag: "休闲" },
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
        const fragment = documentObject.createDocumentFragment();
        games.forEach((game) => fragment.appendChild(createCard(game)));
        grid.replaceChildren(fragment);
    }

    render();
})(window, document);
