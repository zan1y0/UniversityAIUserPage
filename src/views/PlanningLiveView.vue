<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { execute } from '../api/contract';
import { ApiError } from '../api/client';
import { useCatalogStore } from '../stores/catalog';
import { localDate } from '../domain/logic';
import type { Plan, PlanProgress, PlanTask } from '../api/generated';

const catalog = useCatalogStore();

const targetDate = ref(localDate(new Date(Date.now() + 60 * 86400000)));
const dailyMinutes = ref(120);
const planId = ref('');
const plan = ref<Plan | null>(null);
const progress = ref<PlanProgress | null>(null);
const view = ref<'day' | 'week' | 'month'>('day');
const busy = ref(false);
const jobText = ref('');
const errorText = ref('');
const adjustReason = ref('进度落后，需要压缩每日任务');
const adjustBudget = ref(90);

const statusText: Record<string, string> = { draft: '候选计划', active: '执行中', superseded: '已被新计划替代' };
const taskStatusText: Record<string, string> = { pending: '待完成', completed: '已完成', overdue: '已超期' };

const pendingTasks = computed(() => plan.value?.tasks.filter((t) => t.status !== 'completed').length ?? 0);
const doneTasks = computed(() => plan.value?.tasks.filter((t) => t.status === 'completed').length ?? 0);
const totalMinutes = computed(() => plan.value?.tasks.reduce((n, t) => n + t.minutes, 0) ?? 0);
const rate = computed(() => progress.value?.completionRate ?? null);

function uid(): string {
  return crypto.randomUUID();
}

function planIdFromResult(result: unknown): string {
  if (!result || typeof result !== 'object') return '';
  const record = result as Record<string, unknown>;
  const direct = record.planId;
  if (typeof direct === 'string') return direct;
  const inner = record.plan;
  if (inner && typeof inner === 'object' && typeof (inner as Record<string, unknown>).id === 'string')
    return String((inner as Record<string, unknown>).id);
  if (typeof record.id === 'string') return record.id;
  return '';
}

const jobStatusText: Record<string, string> = {
  queued: '排队中',
  running: '生成中',
  completed: '已完成',
  failed: '生成失败',
  failed_retryable: '可重试的失败',
  cancelled: '已取消',
};

async function waitJob(jobId: string): Promise<unknown> {
  for (let i = 0; i < 20; i += 1) {
    const job = await execute('op009', { path: { id: jobId } });
    jobText.value = `计划生成${jobStatusText[job.status] || job.status} · ${job.progress}%`;
    if (job.status === 'completed') return job.result;
    if (job.status === 'failed' || job.status === 'cancelled') throw new Error(job.error?.message || '计划生成失败');
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  return null;
}

async function generate() {
  busy.value = true;
  errorText.value = '';
  jobText.value = '正在创建计划生成任务…';
  try {
    const accepted = await execute(
      'op050',
      {
        body: {
          profileVersion: catalog.profile?.version ?? 1,
          targetDate: targetDate.value,
          dailyMinutes: Number(dailyMinutes.value),
          baseline: [],
        },
      },
      { key: uid() },
    );
    const result = await waitJob(accepted.jobId);
    if (!result) {
      jobText.value = '任务仍在生成，稍后可在下方查看';
      return;
    }
    const id = planIdFromResult(result);
    if (!id) throw new Error('任务已完成，但没有返回计划编号');
    planId.value = id;
    await loadPlan();
  } catch (error) {
    errorText.value = error instanceof ApiError ? error.message : String((error as Error)?.message ?? error);
  } finally {
    busy.value = false;
  }
}

async function loadPlan() {
  if (!planId.value) return;
  errorText.value = '';
  try {
    plan.value = await execute('op051', {
      path: { id: planId.value },
      query: { view: view.value, date: localDate() },
    });
    progress.value = await execute('op056', { path: { id: planId.value }, query: { timeRange: 'week' } });
  } catch (error) {
    errorText.value = error instanceof ApiError ? error.message : '计划读取失败，请稍后重试';
  }
}

async function setView(next: 'day' | 'week' | 'month') {
  view.value = next;
  await loadPlan();
}

async function complete(task: PlanTask) {
  if (!plan.value) return;
  try {
    const updated = await execute(
      'op055',
      { path: { id: plan.value.id, taskId: task.id }, body: { version: task.version, eventId: uid() } },
      { key: uid() },
    );
    plan.value = {
      ...plan.value,
      tasks: plan.value.tasks.map((t) => (t.id === task.id ? updated : t)),
    };
    progress.value = await execute('op056', { path: { id: plan.value.id }, query: { timeRange: 'week' } });
  } catch (error) {
    errorText.value = error instanceof ApiError ? error.message : '标记完成失败，请稍后重试';
  }
}

async function confirmPlan() {
  if (!plan.value) return;
  try {
    plan.value = await execute(
      'op053',
      { path: { id: plan.value.id }, body: { version: plan.value.version } },
      { key: uid() },
    );
  } catch (error) {
    errorText.value = error instanceof ApiError ? error.message : '确认计划失败，请稍后重试';
  }
}

async function adjust() {
  if (!plan.value || !progress.value) return;
  busy.value = true;
  try {
    const accepted = await execute(
      'op054',
      {
        path: { id: plan.value.id },
        body: {
          reason: adjustReason.value,
          timeBudget: Number(adjustBudget.value),
          progressVersion: progress.value.version,
        },
      },
      { key: uid() },
    );
    const result = await waitJob(accepted.jobId);
    if (result) await loadPlan();
  } catch (error) {
    errorText.value = error instanceof ApiError ? error.message : '调整计划失败，请稍后重试';
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  if (planId.value) void loadPlan();
});
</script>

<template>
  <div class="dash-strip">
    <div class="strip-left">
      <span class="strip-dot"></span>学习计划<span class="strip-sep">·</span>
      目标 {{ targetDate }}<span class="strip-sep">·</span>每日 {{ dailyMinutes }} 分钟
    </div>
    <div class="strip-right">
      {{ plan ? `${statusText[plan.status] || plan.status} · ${doneTasks}/${plan.tasks.length} 项` : '还没有计划' }}
    </div>
  </div>

  <div class="dash-kpi three">
    <div class="dash-kpi-item">
      <span>计划状态</span>
      <b class="dash-kpi-word">{{ plan ? statusText[plan.status] || plan.status : '未生成' }}</b>
      <em>{{ plan ? `版本 v${plan.version}` : '先生成候选计划' }}</em>
    </div>
    <div class="dash-kpi-item">
      <span>任务完成</span>
      <b>{{ doneTasks }}<small>/{{ plan?.tasks.length ?? 0 }}</small></b>
      <em>{{ pendingTasks }} 项待完成</em>
    </div>
    <div class="dash-kpi-item">
      <span>本周完成率</span>
      <b>{{ rate === null ? '—' : Math.round(rate * 100) }}<small v-if="rate !== null">%</small></b>
      <em>{{ progress ? `已完成 ${progress.completedMinutes} / ${progress.plannedMinutes} 分钟` : '按周统计' }}</em>
    </div>
  </div>

  <div class="dash-body">
    <div class="dash-main">
      <section class="card">
        <div class="card-heading">
          <h2>{{ plan ? '计划任务' : '生成候选计划' }}</h2>
          <span class="muted small">{{ jobText }}</span>
        </div>

        <div v-if="!plan" class="dash-toolbar">
          <label class="field">
            <span>目标考试日期</span>
            <input v-model="targetDate" type="date" />
          </label>
          <label class="field field-narrow">
            <span>每日学习分钟</span>
            <input v-model.number="dailyMinutes" type="number" min="30" max="600" step="10" />
          </label>
          <button class="btn" :disabled="busy" @click="generate">
            {{ busy ? '生成中…' : '生成候选计划' }}
          </button>
        </div>
        <div v-else class="dash-toolbar">
          <label class="field">
            <span>视图</span>
            <select :value="view" @change="setView(($event.target as HTMLSelectElement).value as 'day' | 'week' | 'month')">
              <option value="day">按天</option>
              <option value="week">按周</option>
              <option value="month">按月</option>
            </select>
          </label>
          <button class="btn secondary" :disabled="!plan" @click="confirmPlan" v-if="plan.status === 'draft'">
            确认这份计划
          </button>
          <button class="btn secondary" @click="loadPlan">刷新</button>
        </div>

        <p v-if="errorText" class="dash-error">{{ errorText }}</p>
        <p class="dash-notice">
          生成走异步任务：先创建任务、再轮询任务状态，完成后读取计划正文；计划任务的完成与调整都写回服务端。
        </p>
      </section>

      <section v-if="plan" class="card">
        <div class="card-heading">
          <h2>任务清单</h2>
          <span class="muted small">{{ plan.tasks.length }} 项 · 合计 {{ totalMinutes }} 分钟</span>
        </div>
        <div v-if="!plan.tasks.length" class="dash-empty">
          <h3>这个视图还没有任务</h3>
          <p>换一个视图，或调整目标日期后重新生成。</p>
        </div>
        <div v-else class="dash-list">
          <div v-for="task in plan.tasks" :key="task.id" class="dash-row">
            <div class="dash-row-main">
              <div class="dash-row-title">
                {{ task.content || '学习任务' }}
                <span class="tag">{{ taskStatusText[task.status] || task.status }}</span>
              </div>
              <div class="dash-row-meta">{{ task.scheduledDate }} · {{ task.minutes }} 分钟</div>
            </div>
            <button
              v-if="task.status !== 'completed'"
              class="btn secondary dash-row-btn"
              @click="complete(task)"
            >
              标记完成
            </button>
            <span v-else class="muted small">已完成</span>
          </div>
        </div>
      </section>
    </div>

    <aside class="dash-rail">
      <section class="card rail-card">
        <div class="card-heading"><h2>计划进度</h2></div>
        <ul class="rail-stats">
          <li><span>本周计划</span><b>{{ progress ? `${progress.plannedMinutes} 分` : '—' }}</b></li>
          <li><span>已完成</span><b>{{ progress ? `${progress.completedMinutes} 分` : '—' }}</b></li>
          <li><span>任务数</span><b>{{ progress ? `${progress.completedTasks}/${progress.plannedTasks}` : '—' }}</b></li>
          <li><span>完成率</span><b>{{ rate === null ? '—' : Math.round((rate ?? 0) * 100) + '%' }}</b></li>
        </ul>
        <div class="rail-bar"><i :style="{ width: `${Math.round((rate ?? 0) * 100)}%` }"></i></div>
        <p class="muted small">按时完成比一次做很多更重要。</p>
      </section>

      <section v-if="plan" class="card rail-card">
        <div class="card-heading"><h2>调整计划</h2></div>
        <label class="field">
          <span>调整原因</span>
          <input v-model="adjustReason" placeholder="例如：进度落后" />
        </label>
        <label class="field">
          <span>新的每日分钟</span>
          <input v-model.number="adjustBudget" type="number" min="30" max="600" step="10" />
        </label>
        <button class="btn secondary block" :disabled="busy" @click="adjust">
          {{ busy ? '调整中…' : '按进度调整' }}
        </button>
      </section>

      <section class="card rail-card">
        <div class="card-heading"><h2>计划提醒</h2></div>
        <ul class="rail-notes">
          <li>计划由服务端按目标日期与每日时长排布。</li>
          <li>候选计划确认后才进入执行状态。</li>
          <li>完成情况会进入学习数据页的统计。</li>
        </ul>
        <RouterLink to="/dashboard" class="btn secondary block">去看学习数据</RouterLink>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.block {
  width: 100%;
  margin-top: 10px;
}
.dash-error {
  margin: 8px 0 0;
  font-size: 11.5px;
  color: #b91c1c;
}
.field-narrow {
  flex: 0 0 150px;
}
</style>