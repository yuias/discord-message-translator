/**
 * Debounce function that delays execution until after wait milliseconds
 * have elapsed since the last time it was invoked
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function (this: any, ...args: Parameters<T>) {
    const context = this;

    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      func.apply(context, args);
      timeout = null;
    }, wait);
  };
}

/**
 * Throttle function that ensures a function is called at most once
 * per specified time period
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false;
  let lastResult: ReturnType<T>;

  return function (this: any, ...args: Parameters<T>) {
    const context = this;

    if (!inThrottle) {
      inThrottle = true;
      lastResult = func.apply(context, args);

      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }

    return lastResult;
  };
}

/**
 * Request queue that limits concurrent execution
 * Useful for rate-limiting API requests
 */
export class RequestQueue<T = any> {
  private queue: Array<() => Promise<T>> = [];
  private running = 0;
  private maxConcurrent: number;

  constructor(maxConcurrent: number = 3) {
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Add a request to the queue
   */
  async add<R>(fn: () => Promise<R>): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result as any);
          return result as any;
        } catch (error) {
          reject(error);
          throw error;
        }
      });

      this.processQueue();
    });
  }

  /**
   * Process queued requests while respecting concurrency limit
   */
  private async processQueue() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const fn = this.queue.shift();
    if (!fn) return;

    this.running++;

    try {
      await fn();
    } catch (error) {
      console.error('[RequestQueue] Request failed:', error);
    } finally {
      this.running--;
      this.processQueue(); // Process next item
    }
  }

  /**
   * Get current queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Get number of running requests
   */
  getRunningCount(): number {
    return this.running;
  }

  /**
   * Clear all pending requests
   */
  clear() {
    this.queue = [];
  }
}
