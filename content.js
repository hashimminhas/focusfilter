const FEATURE_DEFS = [
    { id: 'YT_SHORTS', defaultEnabled: true },
    { id: 'YT_VIDEO_SIDEBAR', defaultEnabled: true },
    { id: 'YT_HOMESCREEN', defaultEnabled: true },
    { id: 'YT_ADS', defaultEnabled: true }
];

const RULE_DEFS = [
    { id: 'yt-shorts-nav', keys: ['YT_SHORTS'], mode: 'any' },
    { id: 'yt-shorts-home-shelf', keys: ['YT_SHORTS', 'YT_HOMESCREEN'], mode: 'any' },
    { id: 'yt-shorts-search-shelf', keys: ['YT_SHORTS', 'YT_HOMESCREEN'], mode: 'any' },
    { id: 'yt-home-feed', keys: ['YT_HOMESCREEN'], mode: 'any' },
    { id: 'yt-watch-endscreen', keys: ['YT_HOMESCREEN'], mode: 'any' },
    { id: 'yt-video-sidebar', keys: ['YT_VIDEO_SIDEBAR'], mode: 'any' },
    { id: 'yt-channel-shorts-tab', keys: ['YT_SHORTS'], mode: 'any' },
    { id: 'yt-channel-shorts-grid', keys: ['YT_SHORTS'], mode: 'any' },
    { id: 'yt-channel-shorts-shelf', keys: ['YT_SHORTS'], mode: 'any' },
    { id: 'yt-mobile-shorts-lockup', keys: ['YT_SHORTS'], mode: 'any' },
    { id: 'yt-ads', keys: ['YT_ADS'], mode: 'any' }
];

const INLINE_HIDE_ATTR = 'data-ff-inline-hidden';
const SETTINGS_VERSION_KEY = 'settingsVersion';
const CURRENT_SETTINGS_VERSION = chrome.runtime.getManifest().version;
const defaults = {
    globalEnabled: true,
    features: FEATURE_DEFS.reduce((acc, feature) => {
        acc[feature.id] = feature.defaultEnabled;
        return acc;
    }, {})
};

let state = {
    globalEnabled: defaults.globalEnabled,
    features: { ...defaults.features }
};
let initialized = false;

const observer = new MutationObserver(() => {
    applyDynamicRules();
});

let isObserverRunning = false;

function isFeatureEnabled(featureKey) {
    return Boolean(state.features[featureKey]);
}

// Evaluates a rule based on its keys and mode. For 'all' mode, all keys must be enabled. For 'any' mode, at least one key must be enabled.
function evaluateRule(rule) {
    if (!state.globalEnabled || !rule.keys.length) return false;
    if (rule.mode === 'all') {
        return rule.keys.every(isFeatureEnabled);
    }
    return rule.keys.some(isFeatureEnabled);
}

function setRootAttr(name, enabled) {
    if (enabled) {
        document.documentElement.setAttribute(name, '1');
        return;
    }
    document.documentElement.removeAttribute(name);
}

function applyRuleAttributes() {
    setRootAttr('data-ff-global', state.globalEnabled);

    FEATURE_DEFS.forEach((feature) => {
        setRootAttr(`data-ff-feature-${feature.id.toLowerCase()}`, state.globalEnabled && isFeatureEnabled(feature.id));
    });

    RULE_DEFS.forEach((rule) => {
        setRootAttr(`data-ff-rule-${rule.id}`, evaluateRule(rule));
    });
}

// Hides Shorts elements that may not be covered by CSS rules, based on their aria-label. This is necessary because some Shorts elements are rendered in a way that makes them difficult to target with CSS alone. By using an inline style, we can ensure they are hidden regardless of their position in the DOM or how they are rendered.
function hideShortsByAriaLabel() {
    document.querySelectorAll('[aria-label*="Shorts"]').forEach((el) => {
        const container = el.closest('ytd-rich-item-renderer');
        if (!container || container.hasAttribute(INLINE_HIDE_ATTR)) return;
        container.setAttribute(INLINE_HIDE_ATTR, '1');
        container.style.display = 'none';
    });
}

function restoreInlineHiddenElements() {
    document.querySelectorAll(`[${INLINE_HIDE_ATTR}]`).forEach((el) => {
        el.removeAttribute(INLINE_HIDE_ATTR);
        el.style.display = '';
    });
}

function shouldRunDynamicShortsCleanup() {
    return state.globalEnabled && isFeatureEnabled('YT_SHORTS');
}

function skipAds() {
    if (!state.globalEnabled || !isFeatureEnabled('YT_ADS')) return;

    // Auto-click skip button when it appears
    const skipBtn = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button');
    if (skipBtn) skipBtn.click();

    // Mute and fast-forward short unskippable ads
    const video = document.querySelector('video');
    const adBadge = document.querySelector('.ad-showing');
    if (video && adBadge) {
        video.muted = true;
        video.playbackRate = 16;
    } else if (video) {
        video.muted = false;
        if (video.playbackRate === 16) video.playbackRate = 1;
    }
}

function applyDynamicRules() {
    skipAds();
    if (shouldRunDynamicShortsCleanup()) {
        hideShortsByAriaLabel();
        return;
    }
    restoreInlineHiddenElements();
}

function updateObserverState() {
    const shouldRun = shouldRunDynamicShortsCleanup();
    if (!shouldRun && isObserverRunning) {
        observer.disconnect();
        isObserverRunning = false;
        return;
    }
    if (shouldRun && !isObserverRunning) {
        observer.observe(document.body, { childList: true, subtree: true });
        isObserverRunning = true;
    }
}

function normalizeIncomingState(incoming) {
    const next = {
        globalEnabled: typeof incoming.globalEnabled === 'boolean' ? incoming.globalEnabled : defaults.globalEnabled,
        features: { ...defaults.features }
    };

    const sourceFeatures = incoming.features || {};
    FEATURE_DEFS.forEach((feature) => {
        if (typeof sourceFeatures[feature.id] === 'boolean') {
            next.features[feature.id] = sourceFeatures[feature.id];
        }
    });

    return next;
}

function applyState(nextState) {
    state = normalizeIncomingState(nextState);
    applyRuleAttributes();
    applyDynamicRules();
    if (document.body) {
        updateObserverState();
    }
}

function loadStateWithVersionReset(callback) {
    chrome.storage.sync.get(
        {
            globalEnabled: defaults.globalEnabled,
            features: defaults.features,
            [SETTINGS_VERSION_KEY]: ''
        },
        (stored) => {
            const storedVersion = typeof stored[SETTINGS_VERSION_KEY] === 'string' ? stored[SETTINGS_VERSION_KEY] : '';
            if (storedVersion === CURRENT_SETTINGS_VERSION) {
                callback({ globalEnabled: stored.globalEnabled, features: stored.features });
                return;
            }

            const resetState = {
                globalEnabled: defaults.globalEnabled,
                features: { ...defaults.features },
                [SETTINGS_VERSION_KEY]: CURRENT_SETTINGS_VERSION
            };

            chrome.storage.sync.set(resetState, () => {
                callback(resetState);
            });
        }
    );
}

function init() {
    if (initialized) return;
    initialized = true;

    loadStateWithVersionReset((storedState) => {
        applyState(storedState);
        if (!document.body) return;
        updateObserverState();
    });
}

document.addEventListener('DOMContentLoaded', init, { once: true });
if (document.readyState !== 'loading') {
    init();
}

document.addEventListener('yt-navigate-finish', () => {
    applyDynamicRules();
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    const hasRelevantChange = Object.prototype.hasOwnProperty.call(changes, 'globalEnabled') || Object.prototype.hasOwnProperty.call(changes, 'features');
    if (!hasRelevantChange) return;

    chrome.storage.sync.get({ globalEnabled: defaults.globalEnabled, features: defaults.features }, (storedState) => {
        applyState(storedState);
    });
});

chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'FF_STATE_UPDATE' && msg.state) {
        applyState(msg.state);
    }
});