(function registerStore(windowObject) {
    const APP_PREFIX = "app_";

    function getStorage() {
        if (!windowObject.localStorage) {
            throw new Error("当前环境不支持 localStorage。");
        }

        return windowObject.localStorage;
    }

    function parseJSON(value, fallbackValue) {
        if (value === null) {
            return fallbackValue;
        }

        try {
            return JSON.parse(value);
        } catch (error) {
            return fallbackValue;
        }
    }

    const store = {
        prefix: APP_PREFIX,
        consumeLegacyValue(legacyKeys = []) {
            const storage = getStorage();

            for (const legacyKey of legacyKeys) {
                const legacyValue = storage.getItem(legacyKey);

                if (legacyValue !== null) {
                    storage.removeItem(legacyKey);
                    return legacyValue;
                }
            }

            return null;
        },
        buildKey(name) {
            return `${APP_PREFIX}${name}`;
        },
        buildGameKey(slug, field) {
            return this.buildKey(`game_${slug}_${field}`);
        },
        get(name, fallbackValue = null) {
            const storage = getStorage();
            const value = storage.getItem(this.buildKey(name));
            return value === null ? fallbackValue : value;
        },
        set(name, value) {
            const storage = getStorage();
            storage.setItem(this.buildKey(name), String(value));
        },
        getJSON(name, fallbackValue = null) {
            const storage = getStorage();
            return parseJSON(storage.getItem(this.buildKey(name)), fallbackValue);
        },
        setJSON(name, value) {
            const storage = getStorage();
            storage.setItem(this.buildKey(name), JSON.stringify(value));
        },
        remove(name) {
            const storage = getStorage();
            storage.removeItem(this.buildKey(name));
        },
        getGameValue(slug, field, fallbackValue = null) {
            const storage = getStorage();
            const value = storage.getItem(this.buildGameKey(slug, field));
            return value === null ? fallbackValue : value;
        },
        getGameValueWithLegacy(slug, field, legacyKeys = [], fallbackValue = null) {
            const value = this.getGameValue(slug, field, null);

            if (value !== null) {
                return value;
            }

            const legacyValue = this.consumeLegacyValue(legacyKeys);

            if (legacyValue !== null) {
                this.setGameValue(slug, field, legacyValue);
                return legacyValue;
            }

            return fallbackValue;
        },
        setGameValue(slug, field, value) {
            const storage = getStorage();
            storage.setItem(this.buildGameKey(slug, field), String(value));
        },
        getGameJSON(slug, field, fallbackValue = null) {
            const storage = getStorage();
            return parseJSON(storage.getItem(this.buildGameKey(slug, field)), fallbackValue);
        },
        getGameJSONWithLegacy(slug, field, legacyKeys = [], fallbackValue = null) {
            const value = this.getGameJSON(slug, field, null);

            if (value !== null) {
                return value;
            }

            const legacyValue = this.consumeLegacyValue(legacyKeys);

            if (legacyValue !== null) {
                const parsedValue = parseJSON(legacyValue, fallbackValue);
                this.setGameJSON(slug, field, parsedValue);
                return parsedValue;
            }

            return fallbackValue;
        },
        setGameJSON(slug, field, value) {
            const storage = getStorage();
            storage.setItem(this.buildGameKey(slug, field), JSON.stringify(value));
        },
        removeGameValue(slug, field) {
            const storage = getStorage();
            storage.removeItem(this.buildGameKey(slug, field));
        }
    };

    windowObject.AppStore = store;
})(window);
