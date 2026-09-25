import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce, throttle, RequestQueue } from './async-control';

describe('Async Control Utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('debounce', () => {
    it('should delay function execution', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn();
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(99);
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should reset timer on multiple calls', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn();
      vi.advanceTimersByTime(50);
      debouncedFn(); // Reset timer
      vi.advanceTimersByTime(50);
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should pass arguments correctly', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn('arg1', 'arg2');
      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should only execute once for multiple rapid calls', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn();
      debouncedFn();
      debouncedFn();
      debouncedFn();

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('throttle', () => {
    it('should limit function execution rate', () => {
      const fn = vi.fn();
      const throttledFn = throttle(fn, 100);

      throttledFn();
      expect(fn).toHaveBeenCalledTimes(1);

      throttledFn();
      throttledFn();
      expect(fn).toHaveBeenCalledTimes(1); // Still only 1

      vi.advanceTimersByTime(100);
      throttledFn();
      expect(fn).toHaveBeenCalledTimes(2); // Now it can be called again
    });

    it('should pass arguments correctly', () => {
      const fn = vi.fn();
      const throttledFn = throttle(fn, 100);

      throttledFn('arg1', 'arg2');
      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should allow calls after limit period', () => {
      const fn = vi.fn();
      const throttledFn = throttle(fn, 100);

      throttledFn();
      expect(fn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(100);
      throttledFn();
      expect(fn).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(100);
      throttledFn();
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('RequestQueue', () => {
    it('should limit concurrent requests', async () => {
      vi.useRealTimers(); // Use real timers for async queue tests

      const queue = new RequestQueue(2); // Max 2 concurrent
      const activeRequests: number[] = [];
      let maxConcurrent = 0;

      const createRequest = (id: number, delay: number) => async () => {
        activeRequests.push(id);
        maxConcurrent = Math.max(maxConcurrent, activeRequests.length);

        await new Promise((resolve) => setTimeout(resolve, delay));

        const index = activeRequests.indexOf(id);
        activeRequests.splice(index, 1);
        return id;
      };

      const promises = [
        queue.add(createRequest(1, 100)),
        queue.add(createRequest(2, 100)),
        queue.add(createRequest(3, 100)),
        queue.add(createRequest(4, 100)),
      ];

      await Promise.all(promises);

      expect(maxConcurrent).toBeLessThanOrEqual(2);

      vi.useFakeTimers(); // Restore fake timers
    });

    it('should process requests in order', async () => {
      vi.useRealTimers();

      const queue = new RequestQueue(1); // Sequential
      const results: number[] = [];

      const createRequest = (id: number) => async () => {
        results.push(id);
        return id;
      };

      const promises = [
        queue.add(createRequest(1)),
        queue.add(createRequest(2)),
        queue.add(createRequest(3)),
      ];

      await Promise.all(promises);

      expect(results).toEqual([1, 2, 3]);

      vi.useFakeTimers();
    });

    it('should handle request failures gracefully', async () => {
      vi.useRealTimers();

      const queue = new RequestQueue(2);

      const failingRequest = async () => {
        throw new Error('Request failed');
      };

      const successRequest = async () => {
        return 'success';
      };

      await expect(queue.add(failingRequest)).rejects.toThrow('Request failed');

      const result = await queue.add(successRequest);
      expect(result).toBe('success');

      vi.useFakeTimers();
    });

    it('should track queue size correctly', async () => {
      vi.useRealTimers();

      const queue = new RequestQueue(1);

      expect(queue.getQueueSize()).toBe(0);
      expect(queue.getRunningCount()).toBe(0);

      const promise1 = queue.add(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // Give time for first request to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      const promise2 = queue.add(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      // First request is running, second is queued
      expect(queue.getRunningCount()).toBe(1);
      expect(queue.getQueueSize()).toBe(1);

      await Promise.all([promise1, promise2]);

      vi.useFakeTimers();
    });

    it('should clear pending requests', async () => {
      vi.useRealTimers();

      const queue = new RequestQueue(1);
      const fn = vi.fn(async () => 'done');

      const promise1 = queue.add(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Give time for first request to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      queue.add(fn);
      queue.add(fn);

      expect(queue.getQueueSize()).toBe(2);

      queue.clear();

      expect(queue.getQueueSize()).toBe(0);

      await promise1;
      await new Promise((resolve) => setTimeout(resolve, 50));

      // The cleared requests should not execute
      expect(fn).not.toHaveBeenCalled();

      vi.useFakeTimers();
    });
  });
});
