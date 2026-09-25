import { ChromeBuiltinTranslator, type AvailabilityStatus } from '@/lib/api/chrome-builtin';
import { ChromeLanguageDetector } from '@/lib/api/chrome-language-detector';

const AVAILABILITY_STATUSES: AvailabilityStatus[] = [
  'unavailable',
  'downloadable',
  'downloading',
  'available',
];

export async function getTranslatorApiStatus(): Promise<{ supported: boolean }> {
  return { supported: ChromeBuiltinTranslator.isAvailable() };
}

export async function getLanguageDetectorStatus(): Promise<AvailabilityStatus> {
  if (!ChromeLanguageDetector.isAvailable()) {
    return 'unavailable';
  }

  const status = await ChromeLanguageDetector.checkAvailability();
  return AVAILABILITY_STATUSES.includes(status as AvailabilityStatus)
    ? (status as AvailabilityStatus)
    : 'unavailable';
}
