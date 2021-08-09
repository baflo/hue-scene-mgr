// @ts-check

(function (/** @type {any} */ root) {
    const CONFIG_FILE = ".hue-scene-mgr.json";
    const HUE_BRIGE_HOST = "192.168.86.245";
    const DEVICE_TYPE = "hue-scene-mgr";
    const fetch = typeof window !== "undefined" && window.fetch || require("node-fetch").default;

    root.discoverHueBridges = discoverHueBridges;
    root.createNewUser = createNewUser;
    root.load = load;
    root.save = save;
    root.getLights = getLights;
    root.getGroups = getGroups;
    root.getScenes = getScenes;
    root.getFilterValues = getFilterValues;
    root.filterEntries = filterEntries;
    root.getLightState = getLightState;
    root.setLightState = setLightState;

    /****************************************************************************************
     * Helper functions
     ****************************************************************************************/

    function getHueBridgeHost() {
        return `http://${load('hue-bridge-ip')}`;
    }

    function discoverHueBridges() {
        return fetch("https://discovery.meethue.com/").then(getJsonResponse).then(parseError({ expectArray: true }));
    }

    /**
     * Creates a new user on hue bridge. Button must be pushed immediately before running this.
     * @param {string} devicetype 
     * @returns string
     */
    async function createNewUser(devicetype) {
        return fetch(`${getHueBridgeHost()}/api`, {
            method: "POST",
            body: serializeJSON({
                devicetype: devicetype || DEVICE_TYPE,
            }),
        })
            .then(getJsonResponse)
            .then(parseError({ expectArray: true }))
            .then(([{ success }]) => success.username);
    }


    /**
     * 
     * @param {string} [id] Pass ID to only get that light
     * @returns 
     */
    async function getLights(id) {
        return fetch(`${getHueBridgeHost()}/api/${load("username")}/lights/${id || ""}`)
            .then(getJsonResponse)
            .then(parseError({ expectArray: !!id, expectObject: !id }));
    }

    /**
     * 
     * @param {string} [id] Pass ID to only get that scene
     * @returns 
     */
    async function getScenes(id) {
        return fetch(`${getHueBridgeHost()}/api/${load("username")}/scenes/${id || ""}`)
            .then(getJsonResponse)
            .then(parseError({ expectArray: !!id, expectObject: !id }));
    }


    async function getGroups(id) {
        return fetch(`${getHueBridgeHost()}/api/${load("username")}/groups/${id || ""}`)
            .then(getJsonResponse)
            .then(parseError({ expectArray: !!id, expectObject: !id }));
    }

    async function getLightState(sceneId, lightId) {
        return fetch(`${getHueBridgeHost()}/api/${load("username")}/scenes/${sceneId}/`)
            .then(getJsonResponse)
            .then(parseError())
            .then(scene => scene.lightstates[lightId])
    }

    async function setLightState(sceneId, lightId, lightstate) {
        return fetch(`${getHueBridgeHost()}/api/${load("username")}/scenes/${sceneId}/lightstates/${lightId}`, {
            method: "PUT",
            body: typeof lightstate === "string" ? lightstate : JSON.stringify(lightstate)
        })
            .then(parseError())
            .then(getJsonResponse);
    }


    /**
     * 
     * @template {string} T 
     * @param {{ [id: string]: Record<T, string> }} entries 
     * @param {T} filterKey 
     * @returns 
     */
    function getFilterValues(entries, filterKey) {
        return Object.entries(entries)
            .map(([id, entry]) => ({ id, ...entry }))
            .filter((value, index, target) => target.findIndex(v => v[filterKey] === value[filterKey]) === index)
    }

    /**
     * 
     * @param {{ [id: string]: any }} entries Input entries to be filtered
     * @param {{ [key: string]: any }} filters Maps key of entry to current expected value.
     */
    function filterEntries(entries, filters) {
        return Object.entries(entries)
            .map(([id, entry]) => ({ id, ...entry }))
            .filter(entry => Object.entries(filters)
                .every(([key, expectedValue]) =>
                    ["ALL"].concat(entry[key]).includes(expectedValue))
            )
    }

    /**
     * Parses errors in response from Hue bridge and throws.
     * @param {{ expectArray?: boolean; expectObject?: boolean }} [options]
     * @returns {(response: any) => any}
     */
    function parseError(options) {
        const expectArray = options && options.expectArray;
        const expectObject = options && options.expectObject;

        return function (response) {
            if (expectArray && !Array.isArray(response)) {
                console.error("Response unexpectedly was not an array:", response);
                throw new Error("Reponse unexpectedly was not an array!");
            }

            if (expectObject && typeof response !== "object" && Array.isArray(response)) {
                console.error("Response unexpectedly was an array:", response);
                throw new Error("Reponse unexpectedly was an array!");
            }

            if (Array.isArray(response) && response.some(r => r.error)) {
                console.error("At least one error occured:", response);
                throw new Error(`At least one error occured:${response.filter(r => r.error).map(r => `\n - ${r.error.description}`).join("")}`);
            }

            return response;
        }
    }

    /**
     * Saves config to a target key.
     * Isomorphic: saves to localStorage in browser or to config file in nodejs.
     * @param {string} target 
     * @param {string | number | boolean | {}} data 
     */
    function save(target, data) {
        if (typeof window !== "undefined" && window.localStorage) {
            window.localStorage[target] = serializeJSON(data);
            return;
        }

        const fs = require("fs");
        const loadedData = fs.existsSync(CONFIG_FILE) ? deserializeJSON(fs.readFileSync(CONFIG_FILE, "utf-8")) : {};
        loadedData[target] = data;
        fs.writeFileSync(CONFIG_FILE, serializeJSON(loadedData), { encoding: "utf-8" });
    }

    /**
     * Loads config from a target.
     * Isomorphic: loads from localStorage in browser or from config file in nodejs.
     * @param {string} target 
     * @returns any
     */
    function load(target) {
        if (typeof window !== "undefined" && window.localStorage) {
            return deserializeJSON(window.localStorage[target]);
        }

        const fs = require("fs");
        const loadedData = fs.existsSync(CONFIG_FILE) ? deserializeJSON(fs.readFileSync(CONFIG_FILE, "utf-8")) : {};
        return loadedData[target];
    }

    /**
     * Serializes JSON prettily.
     * @param {any} data 
     * @returns string
     */
    function serializeJSON(data) {
        return JSON.stringify(data, null, 2);

    }

    /**
     * Parses a JSON string to data. If parsing fails, it returns the `fallback` instead of failing.
     * @param {string} str 
     * @param {any} fallback 
     * @returns any
     */
    function deserializeJSON(str, fallback) {
        try {
            return JSON.parse(str);
        } catch (parseError) {
            return fallback;
        }
    }

    function getJsonResponse(response) {
        return response.json();
    }
})(typeof window !== "undefined" ? window : module);