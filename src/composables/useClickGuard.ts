import { ref } from 'vue';

/**
 * 防抖：把一串连续触发合并成最后一次。
 * 适合输入框、窗口 resize 这类"只关心最终结果"的场景。
 */
export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  cancel(): void;
  flush(): void;
}

export function debounce<A extends unknown[]>(
  fn: (...args: A) => unknown,
  wait = 300,
): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: A | undefined;
  const run = (): void => {
    timer = undefined;
    const args = lastArgs;
    lastArgs = undefined;
    if (args) fn(...args);
  };
  const debounced = ((...args: A): void => {
    lastArgs = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, wait);
  }) as Debounced<A>;
  debounced.cancel = (): void => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    lastArgs = undefined;
  };
  debounced.flush = (): void => {
    if (timer) clearTimeout(timer);
    run();
  };
  return debounced;
}

/**
 * 节流：固定窗口内最多执行一次，第一次立即执行。
 * 适合翻页、拖拽、滚动这类"要即时反馈但别太频繁"的场景。
 */
export interface Throttled<A extends unknown[]> {
  (...args: A): void;
  cancel(): void;
}

export function throttle<A extends unknown[]>(
  fn: (...args: A) => unknown,
  wait = 300,
): Throttled<A> {
  let lastAt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingArgs: A | undefined;
  const throttled = ((...args: A): void => {
    const now = Date.now();
    const remain = wait - (now - lastAt);
    if (remain <= 0) {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      pendingArgs = undefined;
      lastAt = now;
      fn(...args);
      return;
    }
    pendingArgs = args;
    if (!timer) {
      timer = setTimeout(() => {
        timer = undefined;
        const nextArgs = pendingArgs;
        pendingArgs = undefined;
        if (nextArgs) {
          lastAt = Date.now();
          fn(...nextArgs);
        }
      }, remain);
    }
  }) as Throttled<A>;
  throttled.cancel = (): void => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    pendingArgs = undefined;
  };
  return throttled;
}

export interface ClickGuardOptions {
  /** 两次有效点击之间的最小间隔（毫秒），默认 0 = 只防重入 */
  cooldown?: number;
}

/**
 * 点击闸门：防止"连续点击/重复提交"。
 *
 * 与防抖的区别：闸门在第一次点击时立即执行，不延迟、不丢点击，
 * 只在动作未完成（pending）或落在冷却窗口内时丢弃后续点击。
 * 提交类按钮应当用这个语义（防抖会让请求晚 300ms 才发，体验更差）。
 */
export function useClickGuard<A extends unknown[], R>(
  action: (...args: A) => R | Promise<R>,
  options: ClickGuardOptions = {},
) {
  const pending = ref(false);
  let lastAt = 0;

  async function trigger(...args: A): Promise<R | undefined> {
    if (pending.value) return undefined;
    const now = Date.now();
    if (options.cooldown && now - lastAt < options.cooldown) return undefined;
    pending.value = true;
    lastAt = now;
    try {
      return await action(...args);
    } finally {
      pending.value = false;
    }
  }

  return { trigger, pending };
}
