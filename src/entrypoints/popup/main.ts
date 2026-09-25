import { getSettings } from '@/lib/utils/settings';
import { createStorage } from '@/lib/cache/factory';
import { populateLanguageSelect, setupPasswordToggle } from '@/lib/utils/dom-helpers';
import { applyI18n, t } from '@/lib/utils/i18n';
import { showToast } from '@/lib/ui/toast';
import { createAutoSaver } from '@/lib/ui/auto-save';
import { renderCacheStats } from '@/lib/ui/cache-stats';
import { getTranslatorApiStatus, getLanguageDetectorStatus } from '@/lib/ui/api-availability';
import './styles.css';

// DOM elements
const tabs = document.querySelectorAll('[data-tab]');
const panels = document.querySelectorAll('[data-panel]');
const autoTranslateToggle = document.getElementById('autoTranslate') as HTMLInputElement;
const targetLanguageSelect = document.getElementById('targetLanguage') as HTMLSelectElement;
const translationModeSelect = document.getElementById('translationMode') as HTMLSelectElement;
const translationProviderSelect = document.getElementById('translationProvider') as HTMLSelectElement;
const chromeBuiltinHint = document.getElementById('chromeBuiltinHint') as HTMLLabelElement;
const skipTargetLanguageToggle = document.getElementById('skipTargetLanguage') as HTMLInputElement;
const languageDetectorHint = document.getElementById('languageDetectorHint') as HTMLLabelElement;
const googleApiKeySection = document.getElementById('googleApiKeySection') as HTMLDivElement;
const googleApiKeyInput = document.getElementById('googleApiKey') as HTMLInputElement;
const toggleGoogleApiKeyVisibility = document.getElementById('toggleGoogleApiKeyVisibility') as HTMLButtonElement;
const deeplApiKeySection = document.getElementById('deeplApiKeySection') as HTMLDivElement;
const deeplApiKeyInput = document.getElementById('deeplApiKey') as HTMLInputElement;
const toggleDeeplApiKeyVisibility = document.getElementById('toggleDeeplApiKeyVisibility') as HTMLButtonElement;
const openaiApiSection = document.getElementById('openaiApiSection') as HTMLDivElement;
const openaiApiKeyInput = document.getElementById('openaiApiKey') as HTMLInputElement;
const toggleOpenaiApiKeyVisibility = document.getElementById('toggleOpenaiApiKeyVisibility') as HTMLButtonElement;
const openaiBaseUrlInput = document.getElementById('openaiBaseUrl') as HTMLInputElement;
const openaiModelInput = document.getElementById('openaiModel') as HTMLInputElement;
const chromeBuiltinSection = document.getElementById('chromeBuiltinSection') as HTMLDivElement;
const cacheTTLDaysInput = document.getElementById('cacheTTLDays') as HTMLInputElement;
const cacheTTLValue = document.getElementById('cacheTTLValue') as HTMLSpanElement;
const cacheUsageProgress = document.getElementById('cacheUsageProgress') as HTMLProgressElement;
const cacheUsageText = document.getElementById('cacheUsageText') as HTMLSpanElement;
const cacheBytesUsed = document.getElementById('cacheBytesUsed') as HTMLSpanElement;
const cacheEntryCount = document.getElementById('cacheEntryCount') as HTMLSpanElement;
const cacheExpiredCount = document.getElementById('cacheExpiredCount') as HTMLSpanElement;
const refreshCacheStatsButton = document.getElementById('refreshCacheStats') as HTMLButtonElement;
const clearCacheButton = document.getElementById('clearCache') as HTMLButtonElement;

let chromeBuiltinAvailable = false;
let languageDetectorAvailable = false;

const autoSave = createAutoSaver((error) => {
  console.error('[Popup] Failed to save settings:', error);
  showToast(t('status_saveFailed'), 'error');
});

// Apply i18n to static elements
applyI18n();

// Tab switching
tabs.forEach((tab) => {
  tab.addEventListener('click', (e) => {
    e.preventDefault();
    const targetTab = (tab as HTMLElement).dataset.tab;

    tabs.forEach((t) => t.classList.remove('tab-active'));
    tab.classList.add('tab-active');

    panels.forEach((panel) => {
      const panelElement = panel as HTMLElement;
      if (panelElement.dataset.panel === targetTab) {
        panelElement.classList.remove('hidden');
      } else {
        panelElement.classList.add('hidden');
      }
    });

    // Load cache stats when switching to cache tab
    if (targetTab === 'cache') {
      loadCacheStats();
    }
  });
});

// Update provider-specific API section visibility
function updateApiSectionVisibility(provider: string) {
  googleApiKeySection.classList.toggle('hidden', provider !== 'google');
  deeplApiKeySection.classList.toggle('hidden', provider !== 'deepl');
  openaiApiSection.classList.toggle('hidden', provider !== 'openai');
  chromeBuiltinSection.classList.toggle('hidden', provider !== 'chrome-builtin');
}

// Check Chrome Built-in Translator API availability
async function checkChromeBuiltinAvailability(): Promise<void> {
  const chromeBuiltinOption = translationProviderSelect.querySelector(
    'option[value="chrome-builtin"]'
  ) as HTMLOptionElement;

  const { supported } = await getTranslatorApiStatus();
  if (supported) {
    chromeBuiltinAvailable = true;
    chromeBuiltinOption.disabled = false;
    chromeBuiltinOption.textContent = t('options_chromeBuiltinFree');
    chromeBuiltinHint.style.display = 'none';
  } else {
    chromeBuiltinAvailable = false;
    chromeBuiltinOption.disabled = true;
    chromeBuiltinOption.textContent = t('options_chromeBuiltinUnavailable');
    chromeBuiltinHint.style.display = 'block';
  }
}

// Check Chrome Language Detector API availability
async function checkLanguageDetectorAvailability(): Promise<void> {
  const status = await getLanguageDetectorStatus();
  if (status !== 'unavailable') {
    languageDetectorAvailable = true;
    skipTargetLanguageToggle.disabled = false;
    languageDetectorHint.style.display = 'none';
    return;
  }

  languageDetectorAvailable = false;
  skipTargetLanguageToggle.disabled = true;
  skipTargetLanguageToggle.checked = false;
  languageDetectorHint.style.display = 'block';
}

// Load settings and reflect in UI
async function loadSettings() {
  populateLanguageSelect(targetLanguageSelect);
  const settings = await getSettings();

  await checkChromeBuiltinAvailability();
  await checkLanguageDetectorAvailability();

  // If saved provider is chrome-builtin but unavailable, fall back
  if (settings.translationProvider === 'chrome-builtin' && !chromeBuiltinAvailable) {
    translationProviderSelect.value = 'google';
    autoSave({ translationProvider: 'google' });
  } else {
    translationProviderSelect.value = settings.translationProvider;
  }

  autoTranslateToggle.checked = settings.autoTranslate;
  targetLanguageSelect.value = settings.targetLanguage;
  translationModeSelect.value = settings.translationMode;
  googleApiKeyInput.value = settings.apiKeys.google || '';
  deeplApiKeyInput.value = settings.apiKeys.deepl || '';
  openaiApiKeyInput.value = settings.apiKeys.openai || '';
  openaiBaseUrlInput.value = settings.openaiConfig?.baseUrl || 'https://api.openai.com/v1';
  openaiModelInput.value = settings.openaiConfig?.model || 'gpt-4';
  cacheTTLDaysInput.value = settings.cacheTTLDays.toString();
  updateCacheTTLDisplay(settings.cacheTTLDays);

  if (languageDetectorAvailable) {
    skipTargetLanguageToggle.checked = settings.skipTargetLanguage;
  } else if (settings.skipTargetLanguage) {
    autoSave({ skipTargetLanguage: false });
  }

  // Show correct API section
  updateApiSectionVisibility(translationProviderSelect.value);
}

// Update cache TTL display
function updateCacheTTLDisplay(days: number) {
  const key = days === 1 ? 'options_cacheTTLDay' : 'options_cacheTTLDays';
  cacheTTLValue.textContent = t(key, [days.toString()]);
}

// Load cache statistics
async function loadCacheStats() {
  try {
    await renderCacheStats({
      progress: cacheUsageProgress,
      usageText: cacheUsageText,
      bytesUsed: cacheBytesUsed,
      entryCount: cacheEntryCount,
      expiredCount: cacheExpiredCount,
    });
  } catch (error) {
    console.error('[Popup] Failed to load cache stats:', error);
    cacheUsageText.textContent = 'Error';
  }
}

// --- Event Listeners ---

// Auto Translate toggle
autoTranslateToggle.addEventListener('change', () => {
  autoSave({ autoTranslate: autoTranslateToggle.checked });
  showToast(
    autoTranslateToggle.checked
      ? t('status_autoTranslateEnabled')
      : t('status_autoTranslateDisabled')
  );
});

// Target Language change
targetLanguageSelect.addEventListener('change', () => {
  autoSave({ targetLanguage: targetLanguageSelect.value });
});

// Translation Mode change
translationModeSelect.addEventListener('change', () => {
  autoSave({ translationMode: translationModeSelect.value as 'replace' | 'append' });
});

// Skip Target Language toggle
skipTargetLanguageToggle.addEventListener('change', () => {
  autoSave({ skipTargetLanguage: skipTargetLanguageToggle.checked });
});

// Translation Provider change
translationProviderSelect.addEventListener('change', () => {
  const provider = translationProviderSelect.value;
  autoSave({
    translationProvider: provider as 'google' | 'deepl' | 'openai' | 'chrome-builtin',
  });
  updateApiSectionVisibility(provider);
});

// Google API Key input
googleApiKeyInput.addEventListener('input', () => {
  const apiKey = googleApiKeyInput.value.trim();
  autoSave({ apiKeys: { google: apiKey || undefined } });
});

// DeepL API Key input
deeplApiKeyInput.addEventListener('input', () => {
  const apiKey = deeplApiKeyInput.value.trim();
  autoSave({ apiKeys: { deepl: apiKey || undefined } });
});

// OpenAI API Key input
openaiApiKeyInput.addEventListener('input', () => {
  const apiKey = openaiApiKeyInput.value.trim();
  const baseUrl = openaiBaseUrlInput.value.trim() || 'https://api.openai.com/v1';
  const model = openaiModelInput.value.trim() || 'gpt-4';
  autoSave({
    apiKeys: { openai: apiKey || undefined },
    openaiConfig: apiKey ? { baseUrl, model } : undefined,
  });
});

// OpenAI Base URL input
openaiBaseUrlInput.addEventListener('input', () => {
  const baseUrl = openaiBaseUrlInput.value.trim() || 'https://api.openai.com/v1';
  const model = openaiModelInput.value.trim() || 'gpt-4';
  autoSave({ openaiConfig: { baseUrl, model } });
});

// OpenAI Model input
openaiModelInput.addEventListener('input', () => {
  const baseUrl = openaiBaseUrlInput.value.trim() || 'https://api.openai.com/v1';
  const model = openaiModelInput.value.trim() || 'gpt-4';
  autoSave({ openaiConfig: { baseUrl, model } });
});

// Toggle API Key visibility
setupPasswordToggle(toggleGoogleApiKeyVisibility, googleApiKeyInput);
setupPasswordToggle(toggleDeeplApiKeyVisibility, deeplApiKeyInput);
setupPasswordToggle(toggleOpenaiApiKeyVisibility, openaiApiKeyInput);

// Cache TTL input
cacheTTLDaysInput.addEventListener('input', () => {
  const days = parseInt(cacheTTLDaysInput.value) || 7;
  updateCacheTTLDisplay(days);
  autoSave({ cacheTTLDays: days });
});

// Refresh cache stats
refreshCacheStatsButton.addEventListener('click', async () => {
  try {
    refreshCacheStatsButton.disabled = true;
    refreshCacheStatsButton.classList.add('loading');
    await loadCacheStats();
    showToast(t('status_cacheRefreshed'), 'success');
  } catch (error) {
    console.error('[Popup] Failed to refresh cache stats:', error);
    showToast(t('status_cacheRefreshFailed'), 'error');
  } finally {
    refreshCacheStatsButton.disabled = false;
    refreshCacheStatsButton.classList.remove('loading');
  }
});

// Clear cache
clearCacheButton.addEventListener('click', async () => {
  if (!confirm(t('confirm_clearCache'))) {
    return;
  }

  try {
    clearCacheButton.disabled = true;
    clearCacheButton.classList.add('loading');
    const storage = await createStorage();
    await storage.clear();
    await loadCacheStats();
    showToast(t('status_cacheCleared'), 'success');
  } catch (error) {
    console.error('[Popup] Failed to clear cache:', error);
    showToast(t('status_cacheClearFailed'), 'error');
  } finally {
    clearCacheButton.disabled = false;
    clearCacheButton.classList.remove('loading');
  }
});

// Initialize
loadSettings();
