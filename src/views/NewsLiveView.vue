<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { execute } from '../api/contract';
import { ApiError } from '../api/client';
import type { Milestone, Notice, Notification } from '../api/generated';

const categoryText: Record<string, string> = {
  policy: '政策',
  schoolNotice: '院校通知',
  registration: '报名',
  confirmation: '确认',
  admissionTicket: '准考证',
  exam: '考试',
};
const milestoneText: Record<string, string> = {
  registration: '报名',
  confirmation: '报名确认',
  admissionTicket: '准考证',
  exam: '初试',
};

const year = ref(new Date().getFullYear() + 1);
const programId = ref('');
const region = ref('');
const notices = ref<Notice[]>([]);
const milestones = ref<Milestone[]>([]);
const notifications = ref<Notification[]>([]);
const busy = ref(false);
const errorText = ref('');
const notice = ref('');

const unread = computed(() => notifications.value.filter((n) => !n.read).length);

function msg(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}
function day(value: string | null): string {
  return value ? value.slice(0, 10) : '待公布';
}

async function load() {
  busy.value = true;
  errorText.value = '';
  try {
    const page = await execute('op075', {
      query: {
        year: Number(year.value),
        page: 1,
        pageSize: 20,
        ...(programId.value.trim() ? { programId: programId.value.trim() } : {}),
        ...(region.value.trim() ? { region: region.value.trim() } : {}),
      },
    });
    notices.value = page.items;
    const marks = await execute('op079', {
      query: {
        year: Number(year.value),
        ...(programId.value.trim() ? { programId: programId.value.trim() } : {}),
        ...(region.value.trim() ? { region: region.value.trim() } : {}),
      },
    });
    milestones.value = marks.items;
    const feed = await execute('op080', { query: { unreadOnly: false, page: 1, pageSize: 10 } });
    notifications.value = feed.items;
  } catch (error) {
    errorText.value = msg(error, '资讯读取失败，请稍后重试');
  } finally {
    busy.value = false;
  }
}

async function markRead(item: Notification) {
  if (item.read) return;
  notice.value = '正在标记已读…';
  try {
    await execute('op081', { path: { id: item.id }, body: { version: item.version } });
    notifications.value = notifications.value.map((n) => (n.id === item.id ? { ...n, read: true } : n));
    notice.value = '';
  } catch (error) {
    errorText.value = msg(error, '标记已读失败');
    notice.value = '';
  }
}

onMounted(load);
</script>

<template>
  <div class="dash-strip">
    <div class="strip-left">
      <span class="strip-dot"></span>资讯与政策<span class="strip-sep">·</span>{{ year }} 考研
      <span class="strip-sep">·</span>{{ region || '全国' }}
    </div>
    <div class="strip-right">{{ notice || `${notices.length} 条资讯 · ${unread} 条未读` }}</div>
  </div>

  <div class="dash-kpi three">
    <div class="dash-kpi-item">
      <span>政策与通知</span>
      <b>{{ notices.length }}<small>条</small></b>
      <em>{{ year }} 年</em>
    </div>
    <div class="dash-kpi-item">
      <span>关键节点</span>
      <b>{{ milestones.length }}<small>个</small></b>
      <em>报名 / 确认 / 准考证 / 初试</em>
    </div>
    <div class="dash-kpi-item">
      <span>未读提醒</span>
      <b>{{ unread }}<small>条</small></b>
      <em>共 {{ notifications.length }} 条</em>
    </div>
  </div>

  <div class="dash-body">
    <div class="dash-main">
      <section class="card">
        <div class="card-heading"><h2>筛选范围</h2><span class="muted small">{{ notice }}</span></div>
        <div class="dash-toolbar">
          <label class="field field-narrow">
            <span>年份</span>
            <input v-model.number="year" type="number" min="2000" max="2100" />
          </label>
          <label class="field">
            <span>院校专业 ID</span>
            <input v-model="programId" placeholder="可选，来自择校" />
          </label>
          <label class="field field-narrow">
            <span>地区</span>
            <input v-model="region" placeholder="如 北京" />
          </label>
          <button class="btn" :disabled="busy" @click="load">刷新资讯</button>
        </div>
        <p v-if="errorText" class="dash-error">{{ errorText }}</p>
      </section>

      <section class="card">
        <div class="card-heading"><h2>政策与院校通知</h2><span class="muted small">{{ notices.length }} 条</span></div>
        <div v-if="!notices.length" class="dash-empty">
          <h3>还没有资讯</h3>
          <p>换一个年份或地区再试；来源由服务端按关注范围推送。</p>
        </div>
        <div v-else class="dash-list">
          <div v-for="item in notices" :key="item.id" class="dash-row">
            <div class="dash-row-main">
              <div class="dash-row-title">
                {{ item.title }}
                <span class="tag">{{ categoryText[item.category] || item.category }}</span>
              </div>
              <div class="dash-row-meta">
                {{ day(item.publishedAt) }} · {{ item.sources[0]?.title || '来源待补充' }}
              </div>
              <p class="notice-body">{{ item.content.slice(0, 90) }}</p>
            </div>
          </div>
        </div>
      </section>
    </div>

    <aside class="dash-rail">
      <section class="card rail-card">
        <div class="card-heading"><h2>关键节点</h2></div>
        <p v-if="!milestones.length" class="muted small">暂无节点，换年份试试。</p>
        <ul v-else class="rail-notes">
          <li v-for="m in milestones" :key="m.id">
            <b>{{ milestoneText[m.type] || m.type }}</b>
            <span class="muted">{{ day(m.startsAt) }} → {{ day(m.endsAt) }}{{ m.verified ? '' : '（待核对）' }}</span>
          </li>
        </ul>
      </section>

      <section class="card rail-card">
        <div class="card-heading"><h2>提醒</h2><span class="muted small">{{ unread }} 条未读</span></div>
        <p v-if="!notifications.length" class="muted small">还没有提醒。</p>
        <ul v-else class="rail-notes">
          <li v-for="n in notifications.slice(0, 5)" :key="n.id" :class="{ unread: !n.read }">
            <b>{{ n.title }}</b>
            <span class="muted">{{ n.content.slice(0, 40) }}</span>
            <button v-if="!n.read" class="link-btn" @click="markRead(n)">标为已读</button>
          </li>
        </ul>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.field-narrow {
  flex: 0 0 110px;
}
.dash-error {
  margin: 8px 0 0;
  font-size: 11.5px;
  color: #b91c1c;
}
.notice-body {
  margin: 4px 0 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: #6b7280;
}
.rail-notes li.unread b {
  color: #4338ca;
}
.link-btn {
  margin-top: 4px;
  padding: 0;
  font-size: 11px;
  color: #4f46e5;
  background: none;
  border: 0;
  cursor: pointer;
}
</style>