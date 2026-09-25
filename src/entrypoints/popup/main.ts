import { getSettings } from '@/lib/utils/settings';
import { populateLanguageSelect } from '@/lib/utils/dom-helpers';
import { applyI18n, t } from '@/lib/utils/i18n';
import { showToast } from '@/lib/ui/toast';
import { createAutoSaver } from '@/lib/ui/auto-save';
import './styles.css';

// DOM elements
const autoTranslateToggle = document.getElementById('autoTranslate') as HTMLInputElement;
const targetLanguageSelect = document.getElementById('targetLanguage') as HTMLSelectElement;
const translationModeSelect = document.getElementById('translationMode') as HTMLSelectElement;
const openOptionsButton = document.getElementById('openOptions') as HTMLButtonElement;

const autoSave = createAutoSaver((error) => {
  console.error('[Popup] Failed to save settings:', error);
  showToast(t('status_saveFailed'), 'error');
});

// Apply i18n to static elements
applyI18n();

// Load settings and reflect in UI
async function loadSettings() {
  populateLanguageSelect(targetLanguageSelect);
  const settings = await getSettings();

  autoTranslateToggle.checked = settings.autoTranslate;
  targetLanguageSelect.value = settings.targetLanguage;
  translationModeSelect.value = settings.translationMode;
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

// Open Options
openOptionsButton.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// Initialize
loadSettings();
