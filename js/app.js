(function startGameHub(windowObject, documentObject) {
    const store = windowObject.AppStore;
    const games = Array.isArray(windowObject.GAME_CATALOG) ? windowObject.GAME_CATALOG : [];

    const elements = {
        sidebar: documentObject.getElementById("sidebar"),
        overlay: documentObject.getElementById("overlay"),
        gameList: documentObject.getElementById("game-list"),
        gameFrame: documentObject.getElementById("game-frame"),
        currentGameTitle: documentObject.getElementById("current-game-title"),
        currentGameDesc: documentObject.getElementById("current-game-desc"),
        gameCountBadge: documentObject.getElementById("game-count-badge"),
        sidebarToggle: documentObject.getElementById("sidebar-toggle"),
        sidebarClose: documentObject.getElementById("sidebar-close")
    };

    const activeGameStorageKey = "ui_active_game";
    let activeSlug = null;

    function isMobileViewport() {
        return windowObject.innerWidth <= 980;
    }

    function toggleSidebar(forceOpen) {
        const shouldOpen = typeof forceOpen === "boolean"
            ? forceOpen
            : !elements.sidebar.classList.contains("is-open");

        elements.sidebar.classList.toggle("is-open", shouldOpen);
        elements.overlay.classList.toggle("is-visible", shouldOpen);
        elements.overlay.hidden = !shouldOpen;
    }

    function closeSidebarOnMobile() {
        if (isMobileViewport()) {
            toggleSidebar(false);
        }
    }

    function getGameBySlug(slug) {
        return games.find((game) => game.slug === slug) || null;
    }

    function createGameItem(game) {
        const button = documentObject.createElement("button");
        button.className = "game-item";
        button.type = "button";
        button.dataset.slug = game.slug;
        button.setAttribute("aria-controls", "game-frame");

        const icon = documentObject.createElement("img");
        icon.className = "game-icon";
        icon.src = game.icon;
        icon.alt = `${game.title} 图标`;

        const body = documentObject.createElement("div");
        body.className = "game-item-body";

        const title = documentObject.createElement("p");
        title.className = "game-name";
        title.textContent = game.title;

        const description = documentObject.createElement("p");
        description.className = "game-desc";
        description.textContent = game.desc;

        body.appendChild(title);
        body.appendChild(description);
        button.appendChild(icon);
        button.appendChild(body);

        button.addEventListener("click", () => {
            setActiveGame(game.slug);
            closeSidebarOnMobile();
        });

        return button;
    }

    function renderGameList() {
        const fragment = documentObject.createDocumentFragment();

        games.forEach((game) => {
            fragment.appendChild(createGameItem(game));
        });

        elements.gameList.replaceChildren(fragment);
        elements.gameCountBadge.textContent = `${games.length} 款游戏`;
    }

    function syncActiveState() {
        const items = elements.gameList.querySelectorAll(".game-item");

        items.forEach((item) => {
            const isActive = item.dataset.slug === activeSlug;
            item.classList.toggle("is-active", isActive);
            if (isActive) {
                item.setAttribute("aria-current", "page");
            } else {
                item.removeAttribute("aria-current");
            }
        });
    }

    function setActiveGame(slug, updateHash = true) {
        const game = getGameBySlug(slug) || games[0];

        if (!game) {
            elements.currentGameTitle.textContent = "未找到游戏";
            elements.currentGameDesc.textContent = "请检查游戏清单配置。";
            return;
        }

        activeSlug = game.slug;
        elements.currentGameTitle.textContent = game.title;
        elements.currentGameDesc.textContent = game.desc;
        elements.gameFrame.src = game.path;
        elements.gameFrame.title = `${game.title} 游戏画面`;
        syncActiveState();

        if (store) {
            store.set(activeGameStorageKey, game.slug);
        }

        if (updateHash) {
            windowObject.location.hash = game.slug;
        }
    }

    function getInitialSlug() {
        const slugFromHash = windowObject.location.hash.replace("#", "");
        const hashGame = getGameBySlug(slugFromHash);

        if (hashGame) {
            return hashGame.slug;
        }

        if (store) {
            const storedSlug = store.get(activeGameStorageKey, "");
            const storedGame = getGameBySlug(storedSlug);
            if (storedGame) {
                return storedGame.slug;
            }
        }

        return games[0] ? games[0].slug : "";
    }

    function bindEvents() {
        elements.sidebarToggle.addEventListener("click", () => toggleSidebar(true));
        elements.sidebarClose.addEventListener("click", () => toggleSidebar(false));
        elements.overlay.addEventListener("click", () => toggleSidebar(false));

        windowObject.addEventListener("hashchange", () => {
            const slug = windowObject.location.hash.replace("#", "");
            const game = getGameBySlug(slug);

            if (game && game.slug !== activeSlug) {
                setActiveGame(game.slug, false);
            }
        });

        windowObject.addEventListener("resize", () => {
            if (!isMobileViewport()) {
                toggleSidebar(false);
            }
        });
    }

    function init() {
        if (!games.length) {
            elements.currentGameTitle.textContent = "暂无游戏";
            elements.currentGameDesc.textContent = "请先在 data/games.js 中维护游戏清单。";
            return;
        }

        renderGameList();
        bindEvents();
        setActiveGame(getInitialSlug(), false);
    }

    init();
})(window, document);
