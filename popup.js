const FEATURE_DEFS = [
  {
    id: 'YT_SHORTS',
    label: 'Hide Shorts surfaces',
    description: 'Navigation, shelves, tabs and related Shorts elements',
    defaultEnabled: true
  },
  {
    id: 'YT_VIDEO_SIDEBAR',
    label: 'Hide video sidebar',
    description: 'Recommended videos on the watch page',
    defaultEnabled: true
  },
  {
    id: 'YT_HOMESCREEN',
    label: 'Hide home recommendations',
    description: 'Home feed and end-screen recommendation cards',
    defaultEnabled: true
  },
  {
    id: 'YT_ADS',
    label: 'Block video ads',
    description: 'Skip or hide pre-roll and mid-roll ads',
    defaultEnabled: true
  }
];

const defaults = {
  globalEnabled: true,
  features: FEATURE_DEFS.reduce((acc, feature) => {
    acc[feature.id] = feature.defaultEnabled;
    return acc;
  }, {})
};
const SETTINGS_VERSION_KEY = 'settingsVersion';
const CURRENT_SETTINGS_VERSION = chrome.runtime.getManifest().version;

const masterToggle = document.getElementById('master-toggle');
const masterStatus = document.getElementById('master-status');
const featureRows = document.getElementById('feature-rows');

let state = {
  globalEnabled: defaults.globalEnabled,
  features: { ...defaults.features }
};

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

function saveAndBroadcast() {
  chrome.storage.sync.set({ ...state, [SETTINGS_VERSION_KEY]: CURRENT_SETTINGS_VERSION }, () => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab || typeof tab.id !== 'number') return;
      chrome.tabs.sendMessage(tab.id, { type: 'FF_STATE_UPDATE', state }, () => {
        void chrome.runtime.lastError;
      });
    });
  });
}

function renderFeatureRows() {
  featureRows.textContent = '';

  FEATURE_DEFS.forEach((feature) => {
    const row = document.createElement('div');
    row.className = 'row';

    const textWrap = document.createElement('div');

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = feature.label;

    const status = document.createElement('div');
    status.className = 'status';
    status.id = `status-${feature.id}`;
    status.textContent = feature.description;

    textWrap.appendChild(label);
    textWrap.appendChild(status);

    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'tog';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = `toggle-${feature.id}`;
    input.dataset.featureId = feature.id;

    const track = document.createElement('div');
    track.className = 'track';

    toggleLabel.appendChild(input);
    toggleLabel.appendChild(track);

    row.appendChild(textWrap);
    row.appendChild(toggleLabel);
    featureRows.appendChild(row);

    input.addEventListener('change', () => {
      state.features[feature.id] = input.checked;
      renderState();
      saveAndBroadcast();
    });
  });
}

function renderState() {
  masterToggle.checked = state.globalEnabled;
  masterStatus.textContent = state.globalEnabled ? 'Enabled' : 'Disabled';

  FEATURE_DEFS.forEach((feature) => {
    const input = document.getElementById(`toggle-${feature.id}`);
    const status = document.getElementById(`status-${feature.id}`);
    if (!input || !status) return;

    input.checked = Boolean(state.features[feature.id]);
    input.disabled = !state.globalEnabled;
    status.textContent = state.globalEnabled
      ? (input.checked ? 'Enabled' : 'Disabled')
      : 'Disabled by global switch';
  });
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

masterToggle.addEventListener('change', () => {
  state.globalEnabled = masterToggle.checked;
  renderState();
  saveAndBroadcast();
});

renderFeatureRows();
loadStateWithVersionReset((storedState) => {
  state = normalizeIncomingState(storedState);
  renderState();
});