import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce, throttle, useClickGuard } from '../../src/composables/useClickGuard';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('debounce', () => {
  it('合并连续调用，只执行最后一次', () => {
    const spy = vi.fn();
    const fn = debounce(spy, 300);
    fn(1);
    fn(2);
    fn(3);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(299);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(3);
  });

  it('cancel 之后不再执行', () => {
    const spy = vi.fn();
    const fn = debounce(spy, 300);
    fn();
    fn.cancel();
    vi.advanceTimersByTime(1000);
    expect(spy).not.toHaveBeenCalled();
  });

  it('flush 立即执行挂起的调用', () => {
    const spy = vi.fn();
    const fn = debounce(spy, 300);
    fn('x');
    fn.flush();
    expect(spy).toHaveBeenCalledWith('x');
    vi.advanceTimersByTime(1000);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('throttle', () => {
  it('窗口内只执行第一次，窗口结束后补一次尾调用', () => {
    const spy = vi.fn();
    const fn = throttle(spy, 300);
    fn('a');
    fn('b');
    fn('c');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('a');
    vi.advanceTimersByTime(300);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith('c');
  });
});

describe('useClickGuard', () => {
  it('动作未完成时忽略后续点击', async () => {
    let release: (() => void) | undefined;
    const action = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const { trigger, pending } = useClickGuard(action);
    const first = trigger();
    void trigger();
    void trigger();
    expect(action).toHaveBeenCalledTimes(1);
    expect(pending.value).toBe(true);
    release?.();
    await vi.advanceTimersByTimeAsync(0);
    await first;
    expect(pending.value).toBe(false);
    void trigger();
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('冷却窗口内忽略后续点击', async () => {
    const action = vi.fn(() => 'ok');
    const { trigger } = useClickGuard(action, { cooldown: 500 });
    expect(await trigger()).toBe('ok');
    expect(await trigger()).toBeUndefined();
    vi.advanceTimersByTime(500);
    expect(await trigger()).toBe('ok');
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('动作抛错后允许再次触发', async () => {
    const action = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error('boom'));
    const { trigger, pending } = useClickGuard(action);
    await expect(trigger()).rejects.toThrow('boom');
    expect(pending.value).toBe(false);
    action.mockResolvedValueOnce(undefined);
    await trigger();
    expect(action).toHaveBeenCalledTimes(2);
  });
});
