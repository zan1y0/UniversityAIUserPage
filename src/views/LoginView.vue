<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { request } from '../api/client';
import { backend } from '../api/backend';
import { useAppStore } from '../stores/app';
import { useLoad } from '../composables/useLoad';
import AppIcon from '../components/AppIcon.vue';
import { roleHome, allowedRolePath } from '../domain/auth';

const app = useAppStore();
const router = useRouter();
const route = useRoute();
const { status, error, run } = useLoad();
const registering = ref(false);
const email = ref('');
const code = ref('');
const acceptedTerms = ref(false);
const forgot = ref(false);
const sent = ref('');
const showTerms = ref(false);
const settingPassword = computed(() => registering.value || forgot.value);
async function sendCode() {
  if (!email.value.trim()) { error.value = '请输入邮箱'; return; }
  const result = await run(() => request('/auth/email/code', {
    method: 'POST', body: { email: email.value, purpose: forgot.value ? 'RESET' : 'REGISTER' },
  }));
  if (result) sent.value = '请求已受理，请查看邮箱。';
}

const displayName = ref('');
const password = ref('');
const confirmPassword = ref('');
const reveal = ref(false);
const busy = computed(() => status.value === 'loading');
function changeTab(value: boolean) {
  registering.value = value;
  forgot.value = false;
  code.value = '';
  sent.value = '';
  password.value = '';
  confirmPassword.value = '';
  error.value = '';
}
async function submit() {
  if (busy.value) return;
  error.value = '';
  if (new TextEncoder().encode(password.value).length > 72) {
    error.value = '密码长度不能超过72字节';
    return;
  }
  if (settingPassword.value && (!/[a-zA-Z]/.test(password.value) || !/\d/.test(password.value))) {
    error.value = '密码必须同时包含字母和数字';
    return;
  }
  if (settingPassword.value && password.value !== confirmPassword.value) {
    error.value = '两次输入的密码不一致';
    return;
  }
  if (forgot.value) {
    const complete = await run(async () => {
      await request('/auth/password/reset', {
        method: 'POST', body: { email: email.value, code: code.value,
          password: password.value, confirmPassword: confirmPassword.value },
      });
      return true;
    });
    if (complete) {
      changeTab(false);
      sent.value = '密码已重置，请使用新密码登录。';
    }
    return;
  }
  const user = await run(() => registering.value
    ? backend.register(email.value, password.value, displayName.value, code.value, confirmPassword.value, acceptedTerms.value)
    : backend.login(email.value, password.value));
  if (!user) return;
  password.value = '';
  confirmPassword.value = '';
  app.setMode('live');
  app.user = user;
  app.sessionChecked = true;
  const target = route.query.redirect;
  const redirect =
    typeof target === 'string' &&
    /^\/(?!\/)/.test(target) &&
    !target.includes('\\') &&
    !target.startsWith('/login') && allowedRolePath(user, target.split('?')[0]!)
      ? target
      : roleHome(user);
  await router.replace(redirect);
}
function demo() {
  app.setMode('demo');
  router.push('/dashboard');
}
</script>

<template>
  <main id="main-content" class="auth-page">
    <a class="auth-brand" href="/login">
      <span class="auth-brand-icon"><AppIcon name="sparkles" :size="22" /></span>
      <span class="auth-brand-text">研途<em>AI</em>导学</span>
      <span class="brand-caption">陪你，向理想生长</span>
    </a>

    <div class="auth-art" aria-hidden="true">
      <i class="ring ring-lg"></i>
      <i class="ring ring-md"></i>
      <i class="ring ring-sm"></i>
      <i class="core"></i>
    </div>

    <div class="auth-slogan" aria-hidden="true">
      <svg class="slogan-ink" viewBox="0 0 640 470" role="img" aria-label="研途">
        <defs>
          <linearGradient id="ink-yantu" x1="90" y1="20" x2="300" y2="470" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="#152c74" />
            <stop offset="0.24" stop-color="#1d4ed8" />
            <stop offset="0.48" stop-color="#3b82f6" />
            <stop offset="0.7" stop-color="#5aa0f2" />
            <stop offset="0.88" stop-color="#8fc0f8" />
            <stop offset="1" stop-color="#b6d6fb" />
          </linearGradient>
        </defs>
        <text class="slogan-svg-text" fill="url(#ink-yantu)">
          <tspan x="8" y="330">研</tspan>
          <tspan x="326" y="364">途</tspan>
        </text>
      </svg>
      <span class="slogan-note">以今日之勤，赴来年之约</span>
    </div>

    <section class="auth-card" :class="{ 'role-login': !registering }" aria-labelledby="auth-title">
      <div class="auth-emblem"><AppIcon name="sparkles" :size="26" /></div>
      <p class="auth-eyebrow">A LITTLE LIGHT, A LONG WAY</p>
      <h1 id="auth-title">{{ forgot ? '重置密码' : registering ? '开启你的研途' : '每一份努力，都有微光' }}</h1>
      <p class="auth-subtitle">
        {{ registering ? '种下一个目标，让未来慢慢发芽。' : '欢迎回来，继续向心中的理想靠近。' }}
      </p>
      <div class="auth-tabs" role="group" aria-label="登录或注册">
        <button
          type="button"
          :class="{ active: !registering }"
          :aria-pressed="!registering"
          :disabled="busy"
          @click="changeTab(false)"
        >
          登录
        </button>
        <button
          type="button"
          :class="{ active: registering }"
          :aria-pressed="registering"
          :disabled="busy"
          @click="changeTab(true)"
        >
          注册
        </button>
      </div>
      <form class="auth-form" :aria-busy="busy" @submit.prevent="submit">
        <label v-if="registering" class="auth-field" for="display-name"
          >昵称<input
            id="display-name"
            v-model="displayName"
            autocomplete="nickname"
            placeholder="我们该怎么称呼你"
            maxlength="32"
            required
            :disabled="busy"
        /></label>
        <label class="auth-field" for="email"
          >邮箱<input
            id="email"
            v-model="email"
            type="email"
            autocomplete="username"
            autocapitalize="none"
            spellcheck="false"
            placeholder="请输入注册邮箱"
            maxlength="254"
            required
            :disabled="busy"
        /></label>
        <label v-if="settingPassword" class="auth-field" for="email-code">
          邮箱验证码
          <span class="password-wrap">
            <input id="email-code" v-model="code" inputmode="numeric" autocomplete="one-time-code"
              pattern="[0-9]{6}" maxlength="6" required />
            <button type="button" :disabled="busy" @click="sendCode">获取验证码</button>
          </span>
        </label>
        <label class="auth-field" for="password"
          >密码<span class="password-wrap"
            ><input
              id="password"
              aria-label="密码"
              v-model="password"
              :type="reveal ? 'text' : 'password'"
              :autocomplete="settingPassword ? 'new-password' : 'current-password'"
              :placeholder="settingPassword ? '至少8位，包含字母和数字' : '请输入你的密码'"
              minlength="8"
              maxlength="72"
              required
              :disabled="busy"
            /><button
              type="button"
              :aria-label="reveal ? '隐藏密码' : '显示密码'"
              :aria-pressed="reveal"
              @click="reveal = !reveal"
            >
              {{ reveal ? '隐藏' : '显示' }}
            </button></span
          ></label
        >
        <label v-if="settingPassword" class="auth-field" for="confirm-password"
          >确认密码<input
            id="confirm-password"
            v-model="confirmPassword"
            :type="reveal ? 'text' : 'password'"
            autocomplete="new-password"
            placeholder="请再次输入密码"
            minlength="8"
            maxlength="72"
            required
            :disabled="busy"
        /></label>
        <div v-if="registering">
          <label><input v-model="acceptedTerms" type="checkbox" required /> 我已阅读并同意用户协议</label>
          <button type="button" class="auth-demo" @click="showTerms = !showTerms">查看协议</button>
          <p v-if="showTerms" class="muted">请使用本人可控制的邮箱，保管账号和验证码。邮箱用于账号验证和找回。请勿利用平台侵害他人权益。</p>
        </div>
        <button v-if="!settingPassword" type="button" class="auth-demo" :disabled="busy"
          @click="changeTab(false); forgot = true">忘记密码</button>
        <p v-if="sent" role="status" class="muted">{{ sent }}</p>
        <p v-if="error" class="auth-error" role="alert">{{ error }}</p>
        <button class="auth-submit" :disabled="busy" type="submit">
          <span>{{ busy ? '正在为你准备…' : forgot ? '重置密码' : registering ? '注册并开启学习' : '登录学习空间' }}</span
          ><AppIcon v-if="!busy" name="arrow" :size="18" /><span
            v-else
            class="auth-spinner"
            aria-hidden="true"
          ></span>
        </button>
      </form>
      <p class="auth-security"><AppIcon name="success" :size="14" />安心连接，守护每一次成长</p>
      <button type="button" class="auth-demo" :disabled="busy" @click="demo">
        先逛逛学习空间 <span aria-hidden="true">↗</span>
      </button>
    </section>

    <footer class="auth-footer">
      <span class="auth-footer-dot"></span>不必光芒万丈，只要一直向前。
    </footer>
  </main>
</template>

<style scoped>
.auth-page {
  --leaf: #4F46E5;
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  min-height: 100svh;
  overflow: hidden;
  isolation: isolate;
  padding: 96px clamp(28px, 7vw, 120px) 84px !important;
  max-width: none !important;
  color: #1F2937;
  background:
    radial-gradient(920px 540px at 86% 6%, rgb(191 219 254 / 55%) 0%, rgb(191 219 254 / 0%) 62%),
    radial-gradient(820px 520px at 6% 92%, rgb(219 234 254 / 60%) 0%, rgb(219 234 254 / 0%) 64%),
    radial-gradient(620px 380px at 62% 46%, rgb(255 255 255 / 85%) 0%, rgb(255 255 255 / 0%) 70%),
    linear-gradient(178deg, #cfe3ff 0%, #e2efff 24%, #f2f8ff 56%, #ffffff 100%);
}
.auth-page::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-image:
    linear-gradient(115deg, rgb(255 255 255 / 70%) 0%, rgb(255 255 255 / 0%) 42%),
    radial-gradient(rgb(30 64 175 / 6%) 1px, transparent 1px);
  background-size:
    auto,
    26px 26px;
  mask-image: linear-gradient(180deg, rgb(0 0 0 / 70%), rgb(0 0 0 / 12%) 70%, transparent);
}
.auth-page::after {
  content: '';
  position: absolute;
  left: -10vw;
  bottom: -32vw;
  width: 60vw;
  height: 60vw;
  z-index: -1;
  border-radius: 50%;
  pointer-events: none;
  background: radial-gradient(circle, rgb(147 197 253 / 38%) 0%, rgb(147 197 253 / 0%) 68%);
  filter: blur(12px);
}
.auth-art {
  position: absolute;
  left: 46%;
  top: 50%;
  width: 0;
  height: 0;
  z-index: 0;
  pointer-events: none;
}
.auth-art .ring {
  position: absolute;
  left: 50%;
  top: 50%;
  translate: -50% -50%;
  border-radius: 50%;
  border: 1px solid rgb(30 64 175 / 9%);
  background: radial-gradient(circle at 50% 50%, rgb(255 255 255 / 55%), rgb(255 255 255 / 0%) 70%);
}
.auth-art .ring-lg {
  width: 980px;
  height: 980px;
  border-color: rgb(30 64 175 / 6%);
}
.auth-art .ring-md {
  width: 660px;
  height: 660px;
  border-color: rgb(30 64 175 / 8%);
}
.auth-art .ring-sm {
  width: 380px;
  height: 380px;
  border-color: rgb(79 70 229 / 12%);
}
.auth-art .core {
  position: absolute;
  left: 50%;
  top: 50%;
  translate: -50% -50%;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  background: radial-gradient(circle, rgb(199 210 254 / 40%) 0%, rgb(199 210 254 / 0%) 72%);
  filter: blur(24px);
}
.auth-slogan {
  position: absolute;
  left: clamp(28px, 9vw, 150px);
  top: 50%;
  translate: 0 -52%;
  z-index: 2;
  pointer-events: none;
  user-select: none;
  display: grid;
  gap: 18px;
}
.slogan-ink {
  display: block;
  width: clamp(268px, 37.5vw, 720px);
  height: auto;
  overflow: visible;
  filter: drop-shadow(0 22px 34px rgb(30 64 175 / 16%));
  rotate: -3deg;
}
.slogan-svg-text {
  font-family: '华文行楷', 'STXingkai', '楷体', 'KaiTi', 'Kaiti SC', serif;
  font-size: 300px;
  letter-spacing: 0.02em;
}
.slogan-note {
  padding-left: 0.9em;
  font-size: clamp(11px, 1.05vw, 14px);
  letter-spacing: 0.42em;
  color: rgb(30 64 175 / 52%);
  font-weight: 500;
}
.auth-brand {
  position: absolute;
  top: 44px;
  left: clamp(28px, 6vw, 96px);
  display: flex;
  align-items: center;
  gap: 12px;
}
.auth-brand-icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  color: #ffffff;
  border-radius: 12px;
  background: linear-gradient(145deg, #6d63f2, #4338ca);
  box-shadow:
    0 10px 22px -12px rgb(67 56 202 / 70%),
    inset 0 1px 0 rgb(255 255 255 / 35%);
}
.auth-brand-text {
  font-size: 21px;
  font-weight: 700;
  letter-spacing: 0.6px;
  color: #10224a;
}
.auth-brand-text em {
  font-style: normal;
  color: #4f46e5;
  padding: 0 1px;
}
.brand-caption {
  margin-left: 6px;
  border-left: 1px solid rgb(16 34 74 / 14%);
  padding-left: 16px;
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 2px;
  color: #5b6a86;
}
.auth-card {
  position: relative;
  z-index: 1;
  width: min(100%, 420px);
  flex: none;
  border: 1px solid rgb(255 255 255 / 70%);
  border-radius: 18px;
  padding: 32px 36px 22px;
  background: linear-gradient(180deg, rgb(255 255 255 / 92%), rgb(255 255 255 / 80%));
  backdrop-filter: blur(18px) saturate(120%);
  box-shadow:
    0 1px 0 rgb(255 255 255 / 90%) inset,
    0 2px 6px rgb(16 24 40 / 6%),
    0 32px 70px -30px rgb(30 64 175 / 45%);
  text-align: center;
}
.auth-emblem {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  margin: 0 auto 14px;
  color: #4F46E5;
  background: linear-gradient(160deg, #ffffff, #eef2ff);
  border: 1px solid rgb(79 70 229 / 18%);
  border-radius: 13px;
  box-shadow:
    0 8px 18px -12px rgb(79 70 229 / 60%),
    inset 0 1px 0 #fff;
}
.auth-eyebrow {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 2.2px;
  color: #7a88a3;
  margin-bottom: 6px;
}
.auth-card h1 {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.2px;
  line-height: 1.5;
  color: #0f1e3d;
}
.auth-subtitle {
  font-size: 11px;
  color: #6b7c96;
  margin-top: 7px;
}
.auth-tabs {
  display: flex;
  margin: 20px 0;
  padding: 3px;
  border: 1px solid rgb(16 34 74 / 8%);
  background: rgb(246 249 255 / 80%);
  border-radius: 11px;
}
.auth-tabs button {
  flex: 1;
  padding: 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: #6b7c96;
  background: transparent;
  font-size: 12px;
  transition:
    background 0.2s,
    box-shadow 0.2s,
    color 0.2s;
}
.auth-tabs button.active {
  color: #3730a3;
  background: linear-gradient(180deg, #ffffff, #eef2ff);
  border-color: rgb(79 70 229 / 20%);
  font-weight: 600;
  box-shadow:
    0 1px 2px rgb(16 24 40 / 6%),
    inset 0 1px 0 #fff;
}
.auth-form {
  display: grid;
  gap: 14px;
  text-align: left;
}
.auth-field {
  display: grid;
  gap: 6px;
  font-size: 11px;
  font-weight: 500;
  color: #374151;
}
.auth-field input {
  width: 100%;
  min-width: 0;
  height: 42px;
  padding: 0 12px;
  border: 1px solid rgb(16 34 74 / 12%);
  border-radius: 9px;
  background: rgb(255 255 255 / 88%);
  color: #1F2937;
  outline: none;
  font-size: 12px;
  transition:
    border-color 0.2s,
    box-shadow 0.2s,
    background 0.2s;
}
.auth-field input::placeholder {
  color: #9CA3AF;
  font-size: 12px;
}
.auth-field input:focus {
  background: #fff;
  border-color: rgb(79 70 229 / 55%);
  box-shadow: 0 0 0 3px rgb(79 70 229 / 12%);
}
.password-wrap {
  position: relative;
}
.password-wrap input {
  padding-right: 60px;
}
.password-wrap button {
  position: absolute;
  right: 10px;
  top: 13px;
  background: transparent;
  font-size: 11px;
  color: #6B7280;
  padding: 0;
}
.auth-submit {
  margin-top: 5px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 14px;
  min-height: 44px;
  border-radius: 9px;
  background: linear-gradient(180deg, #5b54ea, #4338ca);
  color: #FFFFFF;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.3px;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 22%),
    0 2px 4px rgb(16 24 40 / 10%),
    0 14px 26px -14px rgb(79 70 229 / 80%);
  transition:
    background 0.2s,
    transform 0.2s,
    box-shadow 0.2s;
}
.auth-submit:hover:not(:disabled) {
  background: linear-gradient(180deg, #655df1, #4c41d8);
  transform: translateY(-1px);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 26%),
    0 3px 6px rgb(16 24 40 / 10%),
    0 18px 30px -14px rgb(79 70 229 / 85%);
}
.auth-page button:focus-visible,
.auth-page a:focus-visible {
  outline: 3px solid rgb(79 70 229 / 55%);
  outline-offset: 4px;
}
.auth-error {
  color: #B91C1C;
  background: #FFF7ED;
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 12px;
}
.auth-security {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  color: #7a88a3;
  font-size: 10px;
  margin: 16px 0 19px;
}
.auth-demo {
  background: transparent;
  color: #4338CA;
  font-size: 11px;
  padding: 7px 16px;
  border-top: 1px solid rgb(16 34 74 / 7%);
  width: 100%;
}
.auth-demo span {
  margin-left: 7px;
}
.auth-footer {
  position: absolute;
  left: clamp(28px, 6vw, 96px);
  bottom: 34px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #6b7c96;
  font-size: 11px;
  letter-spacing: 1px;
}
.auth-footer-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #4F46E5;
}
.auth-spinner {
  width: 15px;
  height: 15px;
  border: 2px solid #ffffff50;
  border-top-color: white;
  border-radius: 50%;
  animation: auth-spin 0.8s linear infinite;
}
@keyframes auth-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 1100px) {
  .brand-caption {
    display: none;
  }
}
@media (max-width: 760px) {
  .auth-page {
    justify-content: center;
    align-items: center;
    padding: 96px 18px 64px !important;
  }
  .auth-brand {
    top: 24px;
    left: 20px;
  }
  .auth-brand-text {
    font-size: 18px;
  }
  .auth-brand-icon {
    width: 32px;
    height: 32px;
    border-radius: 10px;
  }
  .auth-card {
    width: 100%;
    padding: 24px 22px 16px;
    border-radius: 16px;
  }
  .auth-card h1 {
    font-size: 17px;
  }
  .auth-footer {
    left: 20px;
    right: 20px;
    bottom: 16px;
    font-size: 10px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .auth-spinner {
    animation: none;
  }
  .auth-submit {
    transition: none;
  }
}
</style>