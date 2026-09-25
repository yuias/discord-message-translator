export type ToastType = 'success' | 'error' | 'info';

/**
 * Shows a transient status message.
 * Uses #toastAlert / #toastText present in the page.
 */
export function showToast(message: string, type: ToastType = 'success'): void {
  const toastAlert = document.getElementById('toastAlert');
  const toastText = document.getElementById('toastText');
  if (!toastAlert || !toastText) {
    return;
  }

  toastAlert.className = `alert alert-${type} shadow-lg py-2 px-3`;
  toastText.textContent = message;
  toastAlert.classList.remove('hidden');

  setTimeout(() => {
    toastAlert.classList.add('hidden');
  }, 2000);
}
