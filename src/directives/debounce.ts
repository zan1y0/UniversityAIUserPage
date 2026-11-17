import type { Directive } from 'vue';
import { debounce, type Debounced } from '../composables/useClickGuard';

type ClickHandler = (event: Event) => unknown;

interface State {
  handler: ClickHandler;
  wait: number;
  run: Debounced<[Event]>;
}

const states = new WeakMap<HTMLElement, State>();
const DEFAULT_WAIT = 300;

function toHandler(value: unknown): ClickHandler {
  return typeof value === 'function' ? (value as ClickHandler) : () => undefined;
}

function toWait(arg: string | undefined): number {
  const wait = Number(arg);
  return Number.isFinite(wait) && wait > 0 ? wait : DEFAULT_WAIT;
}

function bind(el: HTMLElement, value: unknown, arg: string | undefined): void {
  const handler = toHandler(value);
  const wait = toWait(arg);
  const existing = states.get(el);
  if (existing && existing.wait === wait) {
    existing.handler = handler;
    return;
  }
  if (existing) {
    el.removeEventListener('click', existing.run);
    states.delete(el);
  }
  const state = { handler, wait } as State;
  state.run = debounce((event: Event) => state.handler(event), wait);
  states.set(el, state);
  el.addEventListener('click', state.run);
}

/**
 * 模板里给按钮加点击防抖：`<button v-debounce:500="submit">`。
 * 只用于"重复执行虽无副作用但会抖"的纯前端动作；
 * 提交类按钮请用 useClickGuard（立即执行 + 未完成时不再发送）。
 */
export const vDebounce: Directive<HTMLElement, unknown> = {
  mounted(el, binding) {
    bind(el, binding.value, binding.arg);
  },
  updated(el, binding) {
    bind(el, binding.value, binding.arg);
  },
  unmounted(el) {
    const state = states.get(el);
    if (!state) return;
    el.removeEventListener('click', state.run);
    states.delete(el);
  },
};
