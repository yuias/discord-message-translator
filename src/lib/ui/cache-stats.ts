import { createStorage } from '@/lib/cache/factory';

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export interface CacheStatsElements {
  progress: HTMLProgressElement;
  usageText: HTMLElement;
  bytesUsed: HTMLElement;
  entryCount: HTMLElement;
  expiredCount: HTMLElement;
}

export async function renderCacheStats(els: CacheStatsElements): Promise<void> {
  const storage = await createStorage();
  const stats = await storage.getStats();

  els.progress.value = stats.usagePercent;
  els.usageText.textContent = `${stats.usagePercent}%`;
  els.bytesUsed.textContent = formatBytes(stats.bytesInUse);
  els.entryCount.textContent = stats.entryCount.toString();
  els.expiredCount.textContent = stats.expiredCount.toString();

  if (stats.usagePercent >= 80) {
    els.progress.className = 'progress progress-error w-full h-2';
  } else if (stats.usagePercent >= 60) {
    els.progress.className = 'progress progress-warning w-full h-2';
  } else {
    els.progress.className = 'progress progress-primary w-full h-2';
  }
}
