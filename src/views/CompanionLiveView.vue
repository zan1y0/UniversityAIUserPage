<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { execute } from '../api/contract';
import { ApiError } from '../api/client';
import { localDate } from '../domain/logic';
import type { Checkin, StudySupervisionState } from '../api/generated';

const today = localDate();
const state = ref<StudySupervisionState | null>(null);
const checkin = ref<Checkin | null>(null);
const reply = ref('');
const input = ref('');
const busy = ref(false);
const errorText = ref('');
const notice = ref('');

const modeText: Record<string, string> = {
  GENTLE: '温和陪伴',
  STRICT: '严格督学',
  FOCUS: '专注模式',
};

const doneCount = computed(() => state.value?.tasks.filter((t) => t.started).length ?? 0);
const streak = computed(() => checkin.value?.streakDays ?? 0);

function msg(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

async function load() {
  busy.value = true;
  errorText.value = '';
  try {
    state.value = await execute('op099', { query: { date: today } });
  } catch (error) {
    errorText.value = msg(error, '督学状态读取失败，请稍后重试');
  } finally {
    busy.value = false;
  }
}

async function doCheckin() {
  busy.value = true;
  notice.value = '正在打卡…';
  try {
    checkin.value = await execute('op015', { body: { localDate: today } }, { key: crypto.randomUUID() });
    notice.value = `打卡成功，连续 ${checkin.value.streakDays} 天`;
  } catch (error) {
    errorText.value = msg(error, '打卡失败，今天可能已经打过');
    notice.value = '';
  } finally {
    busy.value = false;
  }
}

async function startTask(taskId: string) {
  busy.value = true;
  try {
    await execute('op100', { path: { taskId }, body: { action: 'START' } });
    notice.value = '已开始这项功课';
    await load();
  } catch (error) {
    errorText.value = msg(error, '更新功课状态失败');
  } finally {
    busy.value = false;
  }
}

async function talk() {
  const text = input.value.trim();
  if (!text) return;
  busy.value = true;
  errorText.value = '';
  reply.value = '';
  try {
    const accepted = await execute(
      'op014',
      { body: { text, contextId: crypto.randomUUID() } },
      { key: crypto.randomUUID() },
    );
    let answer = '研小途正在想，稍后可以在消息里看到回复。';
    for (let i = 0; i < 15; i += 1) {
      const job = await execute('op009', { path: { id: accepted.jobId } });
      if (job.status === 'completed') {
        const result = job.result as unknown as { text?: string } | null;
        if (result && typeof result.text === 'string') answer = result.text;
        break;
      }
      if (job.status === 'failed' || job.status === 'cancelled') break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    reply.value = answer;
    input.value = '';
  } catch (error) {
    errorText.value = msg(error, '研小途暂时没有回应');
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="dash-strip">
    <div class="strip-left">
      <span class="strip-dot"></span>陪伴督学<span class="strip-sep">·</span>
      {{ modeText[state?.mode ?? 'GENTLE'] || state?.mode }}<span class="strip-sep">·</span>{{ today }}
    </div>
    <div class="strip-right">{{ notice || `${doneCount}/${state?.tasks.length ?? 0} 项功课已开始` }}</div>
  </div>

  <div class="dash-kpi three">
    <div class="dash-kpi-item">
      <span>陪伴模式</span>
      <b class="dash-kpi-word">{{ modeText[state?.mode ?? 'GENTLE'] || '温和陪伴' }}</b>
      <em>{{ state?.reminders.length ?? 0 }} 条提醒</em>
    </div>
    <div class="dash-kpi-item">
      <span>连续打卡</span>
      <b>{{ streak }}<small>天</small></b>
      <em>{{ checkin ? '今天已打卡' : '今天还没打卡' }}</em>
    </div>
    <div class="dash-kpi-item">
      <span>今日功课</span>
      <b>{{ doneCount }}/{{ state?.tasks.length ?? 0 }}<small>项</small></b>
      <em>{{ state?.timers.length ?? 0 }} 个专注计时</em>
    </div>
  </div>

  <div class="dash-body">
    <div class="dash-main">
      <section class="card">
        <div class="card-heading"><h2>今天的功课</h2><span class="muted small">{{ notice }}</span></div>
        <div v-if="!state?.tasks.length" class="dash-empty">
          <h3>今天还没有安排</h3>
          <p>去学习计划里生成一份，功课会自动同步到这里。</p>
          <RouterLink to="/planning" class="btn secondary">去制定计划</RouterLink>
        </div>
        <div v-else class="dash-list">
          <div v-for="task in state.tasks" :key="task.id" class="dash-row">
            <div class="dash-row-main">
              <div class="dash-row-title">{{ task.title }}</div>
              <div class="dash-row-meta">
                {{ task.scheduledAt ? task.scheduledAt.slice(11, 16) : '时间待定' }} ·
                {{ task.started ? '已开始' : '未开始' }}
              </div>
            </div>
            <button class="btn secondary dash-row-btn" :disabled="busy || task.started" @click="startTask(task.id)">
              {{ task.started ? '进行中' : '开始' }}
            </button>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-heading"><h2>和研小途说一句</h2>
          <span class="muted small">{{ busy ? '思考中…' : '说点什么' }}</span></div>
        <label class="field">
          <span>我想说</span>
          <textarea v-model="input" rows="3" placeholder="例如：今天有点累，只能学半小时"></textarea>
        </label>
        <button class="btn" :disabled="busy || !input.trim()" @click="talk">发送</button>
        <p v-if="reply" class="companion-reply">{{ reply }}</p>
        <p v-if="errorText" class="dash-error">{{ errorText }}</p>
      </section>
    </div>

    <aside class="dash-rail">
      <section class="card rail-card">
        <div class="card-heading"><h2>今日打卡</h2></div>
        <p class="muted small">{{ checkin ? `连续 ${checkin.streakDays} 天，保持住。` : '打卡记录会累计连续天数。' }}</p>
        <button class="btn secondary block" :disabled="busy" @click="doCheckin">打卡</button>
      </section>

      <section class="card rail-card">
        <div class="card-heading"><h2>专注计时</h2></div>
        <p v-if="!state?.timers.length" class="muted small">还没有进行中的计时。</p>
        <ul v-else class="rail-notes">
          <li v-for="timer in state.timers" :key="timer.id">
            <b>{{ timer.focusStart ? timer.focusStart.slice(11, 16) : '—' }} 开始</b>
            <span class="muted">{{ timer.focusEnd ? '已结束' : '计时中' }}</span>
          </li>
        </ul>
        <RouterLink to="/practice" class="btn secondary block">去做一组题</RouterLink>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.block {
  width: 100%;
  margin-top: 8px;
}
.dash-error {
  margin: 8px 0 0;
  font-size: 11.5px;
  color: #b91c1c;
}
.companion-reply {
  margin: 10px 0 0;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.7;
  color: #3730a3;
  background: #eef2ff;
  border: 1px solid #ddd6fe;
  border-radius: 10px;
}
</style>