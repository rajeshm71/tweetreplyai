/** Shared chrome.storage.local key for X extension model preference (reply, improve, reuse). */
export const MODEL_STORAGE_KEY = 'tweetreply_model';

export function getModelSelectOptgroupLabel(tierId) {
  if (tierId === 'auto') return 'Auto';
  if (tierId === 'primary') return 'Tier 1';
  if (tierId === 'secondary') return 'Tier 2';
  if (tierId === 'tertiary') return 'Groq';
  return 'Models';
}

export function populateModelSelectFromUsage(select, selectableModels, savedModelKey) {
  if (!selectableModels || !Array.isArray(selectableModels) || selectableModels.length === 0) {
    const autoOpt = document.createElement('option');
    autoOpt.value = 'auto';
    autoOpt.textContent = 'Auto';
    select.appendChild(autoOpt);
    select.value = 'auto';
    return;
  }

  const groups = new Map();
  for (const model of selectableModels) {
    const tierId = model.tierId || 'secondary';
    if (!groups.has(tierId)) groups.set(tierId, []);
    groups.get(tierId).push(model);
  }

  const tierOrder = ['auto', 'primary', 'secondary', 'tertiary'];
  for (const tierId of tierOrder) {
    const entries = groups.get(tierId);
    if (!entries?.length) continue;
    const optgroup = document.createElement('optgroup');
    optgroup.label = getModelSelectOptgroupLabel(tierId);
    for (const model of entries) {
      const option = document.createElement('option');
      option.value = model.key;
      option.textContent = model.name;
      optgroup.appendChild(option);
    }
    select.appendChild(optgroup);
  }

  const options = Array.from(select.querySelectorAll('option'));
  if (savedModelKey && options.some((o) => o.value === savedModelKey)) {
    select.value = savedModelKey;
  } else {
    select.value = 'auto';
  }
}

/**
 * @param {{ selectableModels: Array<{ key: string, name: string, tierId?: string }> | null | undefined, storageKey?: string, className: string, title?: string }} opts
 */
export function createModelSelectElement({
  selectableModels,
  storageKey = MODEL_STORAGE_KEY,
  className,
  title = 'Choose AI model',
}) {
  const select = document.createElement('select');
  select.className = className;
  select.title = title;

  const applyOptions = (savedModelKey) => {
    select.replaceChildren();
    populateModelSelectFromUsage(select, selectableModels, savedModelKey);
  };

  try {
    const storage = chrome?.storage?.local;
    if (storage?.get) {
      storage.get([storageKey], (data) => {
        const saved = data && typeof data[storageKey] === 'string' ? data[storageKey] : 'auto';
        applyOptions(saved === '' ? 'auto' : saved);
      });
    } else {
      applyOptions('auto');
    }
  } catch (_) {
    applyOptions('auto');
  }

  select.addEventListener('change', () => {
    try {
      chrome?.storage?.local?.set({ [storageKey]: select.value || 'auto' });
    } catch (_) {}
  });

  return select;
}
