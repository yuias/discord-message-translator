import { SUPPORTED_LANGUAGES } from '@/lib/constants/languages';

export function populateLanguageSelect(select: HTMLSelectElement): void {
  select.innerHTML = '';
  for (const lang of SUPPORTED_LANGUAGES) {
    const option = document.createElement('option');
    option.value = lang.code;
    option.textContent = lang.code === 'en'
      ? lang.name
      : `${lang.name} (${lang.nativeName})`;
    select.appendChild(option);
  }
}

export function setupPasswordToggle(
  toggleButton: HTMLButtonElement,
  input: HTMLInputElement,
): void {
  toggleButton.addEventListener('click', () => {
    input.type = input.type === 'password' ? 'text' : 'password';
  });
}
