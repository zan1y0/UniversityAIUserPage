<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useAppStore } from '../stores/app';
import { useCatalogStore } from '../stores/catalog';
import { execute, type OperationId } from '../api/contract';
import { localDate } from '../domain/logic';
import ChartPanel from '../components/ChartPanel.vue';
import AppIcon from '../components/AppIcon.vue';

interface CurvePoint {
  date: string;
  studyMinutes: number;
  correctRate: number | null;
  attemptCount: number;
}

interface DashboardData {
  from: string;
  to: string;
  timezone: string;
  studyMinutes: number;
  focus: number | null;
  correctRate: number | null;
  attemptCount: number;
  curve: CurvePoint[];
  algorithmVersion: string;
}

interface RadarItem {
  knowledgeId: string;
  name: string;
  mastery: number | null;
  sampleCount: number;
}

interface RadarData {
  subjectId: string;
  from: string;
  to: string;
  items: RadarItem[];
  algorithmVersion: string;
}

interface WeeklyReport {
  weekStart: string;
  timezone: string;
  status: string;
  studyMinutes: number;
  correctRate: number | null;
  summary: string | null;
  suggestions: string[];
  algorithmVersion: string;
  generatedAt: string | null;
}

const app = useAppStore();
const catalog = useCatalogStore();

const days = ref(7);
const loading = ref(true);
const error = ref('');
const dashboard = ref<DashboardData | null>(null);
const radar = ref<RadarData | null>(null);
const weekly = ref<WeeklyReport | null>(null);

const subjectId = ref('');
const subjectOptions = computed(() => catalog.options('subjectId'));
const radarLoading = ref(false);
const radarError = ref('');

const saving = ref(false);
const saveError = ref('');
const savedMinutes = ref<number | null>(null);
const form = ref({
  type: 'reading',
  startAt: '',
  endAt: '',
  focus: '',
});

const typeOptions = [
  { value: 'reading', text: '阅读学习' },
  { value: 'practice', text: '刷题练习' },
  { value: 'qa', text: 'AI 答疑' },
  { value: 'mockExam', text: '模拟考试' },
  { value: 'interview', text: '复试训练' },
];

function today(): string {
  return localDate(new Date());
}

function minusDays(date: string, count: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() - count);
  return localDate(d);
}

function mondayOfWeek(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  const weekday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - weekday);
  return localDate(d);
}

function hours(minutes: number): string {
  if (!minutes) return '0';
  return (minutes / 60).toFixed(1);
}

function percent(value: number | null): string {
  return value === null || value === undefined ? '—' : `${Math.round(value * 100)}`;
}

function localTime(offsetMinutes: number): string {
  const d = new Date(Date.now() + offsetMinutes * 60000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const rangeText = computed(() => {
  if (!dashboard.value) return '';
  return `近 ${days.value} 天 · 学习 ${hours(dashboard.value.studyMinutes)} 小时`;
});

const stripRight = computed(() => {
  if (loading.value) return '正在读取学习数据…';
  if (error.value) return '数据读取失败，可稍后重试';
  return rangeText.value;
});

const trendOption = computed(() => {
  const curve = dashboard.value?.curve || [];
  return {
    color: ['#6366F1'],
    tooltip: { trigger: 'axis' },
    grid: { left: 35, right: 15, top: 20, bottom: 25 },
    xAxis: {
      type: 'category',
      data: curve.map((p) => p.date.slice(5)),
      axisLine: { lineStyle: { color: '#E5E7EB' } },
      axisTick: { show: false },
      axisLabel: { color: '#6B7280', fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      name: '分钟',
      nameTextStyle: { color: '#6B7280', fontSize: 10 },
      axisLabel: { color: '#6B7280', fontSize: 10 },
      splitLine: { lineStyle: { color: '#F9FAFB', type: 'dashed' } },
    },
    series: [
      {
        type: 'line',
        smooth: true,
        symbolSize: 5,
        areaStyle: { color: '#EEF2FF' },
        data: curve.map((p) => p.studyMinutes),
      },
    ],
  };
});

const radarOption = computed(() => {
  const items = radar.value?.items || [];
  return {
    color: ['#6366F1'],
    radar: {
      indicator: items.map((i) => ({ name: i.name, max: 100 })),
      axisName: { color: '#6B7280', fontSize: 11 },
      splitNumber: 3,
      splitLine: { lineStyle: { color: '#F3F4F6' } },
      splitArea: { areaStyle: { color: ['#FFFFFF', '#FBFBFE'] } },
      radius: '65%',
    },
    series: [
      {
        type: 'radar',
        symbolSize: 4,
        lineStyle: { width: 2 },
        data: [
          {
            value: items.map((i) => (i.mastery === null ? 0 : Math.round(i.mastery * 100))),
            areaStyle: { color: 'rgba(79, 70, 229, 0.14)' },
          },
        ],
      },
    ],
  };
});

const weeklySummary = computed(() => weekly.value?.summary || '本周还没有生成学习周报。');
const weeklySuggestions = computed(() => weekly.value?.suggestions || []);

async function loadDashboard(): Promise<void> {
  loading.value = true;
  error.value = '';
  const to = today();
  const from = minusDays(to, days.value - 1);
  try {
    const data = (await execute('op072' as OperationId, {
      query: { from, to, timezone: 'Asia/Shanghai' },
    })) as DashboardData;
    dashboard.value = data;
  } catch (e) {
    error.value = e instanceof Error ? e.message : '学习数据读取失败';
  } finally {
    loading.value = false;
  }
}

async function loadWeekly(): Promise<void> {
  try {
    const data = (await execute('op074' as OperationId, {
      query: { weekStart: mondayOfWeek(today()), timezone: 'Asia/Shanghai' },
    })) as WeeklyReport;
    weekly.value = data;
  } catch {
    weekly.value = null;
  }
}

async function loadRadar(): Promise<void> {
  if (!subjectId.value) {
    radar.value = null;
    return;
  }
  radarLoading.value = true;
  radarError.value = '';
  try {
    const to = today();
    const data = (await execute('op073' as OperationId, {
      query: { subjectId: subjectId.value, from: minusDays(to, 29), to },
    })) as RadarData;
    radar.value = data;
  } catch (e) {
    radarError.value = e instanceof Error ? e.message : '薄弱点读取失败';
    radar.value = null;
  } finally {
    radarLoading.value = false;
  }
}

function setDays(value: number): void {
  if (days.value === value) return;
  days.value = value;
  void loadDashboard();
  void loadWeekly();
}

async function saveEvent(): Promise<void> {
  saveError.value = '';
  savedMinutes.value = null;
  const start = new Date(form.value.startAt);
  const end = new Date(form.value.endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    saveError.value = '请填写开始与结束时间';
    return;
  }
  if (end.getTime() <= start.getTime()) {
    saveError.value = '结束时间需要晚于开始时间';
    return;
  }
  if (start.getTime() > Date.now() || end.getTime() > Date.now()) {
    saveError.value = '学习时间不能晚于当前时间';
    return;
  }
  const focusRaw = form.value.focus.trim();
  let focusSelfReport: number | null = null;
  if (focusRaw) {
    const parsed = Number(focusRaw);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 1) {
      saveError.value = '专注自评需要是 0 到 1 之间的数字';
      return;
    }
    focusSelfReport = parsed;
  }
  saving.value = true;
  try {
    const result = (await execute(
      'op071' as OperationId,
      {
        body: {
          eventId: crypto.randomUUID(),
          type: form.value.type,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          taskId: null,
          focusSelfReport,
        },
      },
      { key: crypto.randomUUID() },
    )) as { effectiveMinutes: number };
    savedMinutes.value = result.effectiveMinutes;
    app.notify(`已记录一次学习，计入 ${result.effectiveMinutes} 分钟`);
    void loadDashboard();
    void loadWeekly();
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : '记录失败';
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  form.value.startAt = localTime(-60);
  form.value.endAt = localTime(-30);
  subjectId.value = (subjectOptions.value[0]?.value as string) || '';
  void loadDashboard();
  void loadWeekly();
  void loadRadar();
});
</script>

<template>
  <section class="dash-strip">
    <div>
      <span class="dash-strip-dot"></span>
      <b>{{ app.displayName }}</b>，今天也一起向前吧
      <span class="dash-strip-sep"></span>
      <span class="muted small">真实学习数据 · 一个月内可回看</span>
    </div>
    <div class="dash-strip-right">
      <span>{{ stripRight }}</span>
    </div>
  </section>

  <div class="dl-tabs" role="tablist" aria-label="数据范围">
    <button
      v-for="option in [7, 14, 30]"
      :key="option"
      class="dl-tab"
      :class="{ active: days === option }"
      type="button"
      @click="setDays(option)"
    >
      近 {{ option }} 天
    </button>
    <span class="spacer"></span>
    <button class="text-btn small" type="button" :disabled="loading" @click="loadDashboard">
      刷新数据
    </button>
  </div>

  <div class="dash-kpi">
    <div class="dash-kpi-item">
      <p>累计学习时长</p>
      <b>{{ hours(dashboard?.studyMinutes || 0) }}<small>小时</small></b>
      <span>{{ dashboard?.from || '—' }} 至 {{ dashboard?.to || '—' }}</span>
    </div>
    <div class="dash-kpi-item">
      <p>练习正确率</p>
      <b>{{ percent(dashboard?.correctRate ?? null) }}<small>%</small></b>
      <span>累计 {{ dashboard?.attemptCount ?? 0 }} 次作答</span>
    </div>
    <div class="dash-kpi-item">
      <p>专注学习占比</p>
      <b>{{ percent(dashboard?.focus ?? null) }}<small>%</small></b>
      <span>来自学习记录里的专注自评</span>
    </div>
    <div class="dash-kpi-item">
      <p>数据口径</p>
      <b class="dl-version">{{ dashboard?.algorithmVersion || '—' }}</b>
      <span>聚合口径与后台算法版本</span>
    </div>
  </div>

  <div v-if="error" class="notice">
    {{ error }}
    <button class="text-btn small" type="button" @click="loadDashboard">重试</button>
  </div>

  <div class="dash-body">
    <div class="dash-main">
      <section class="card">
        <div class="card-heading">
          <h2>学习时长曲线</h2>
          <span class="muted small">近 {{ days }} 天 · 按天聚合</span>
        </div>
        <div v-if="loading" class="dash-empty-compact">正在读取学习数据…</div>
        <template v-else-if="dashboard && dashboard.studyMinutes > 0">
          <ChartPanel
            :option="trendOption"
            :summary="`近${days}天共学习${dashboard.studyMinutes}分钟，曲线按天展示有效学习时长。`"
          />
        </template>
        <div v-else class="dash-empty">
          <span class="dash-empty-icon"><AppIcon name="clock" :size="22" /></span>
          <b>这段时间还没有学习记录</b>
          <p>在右侧「记录一次学习」里补一条，或先去做一组题，曲线就会长出来。</p>
          <RouterLink to="/practice" class="btn dash-empty-cta">去刷几道题<AppIcon name="arrow" :size="15" /></RouterLink>
        </div>
      </section>

      <div class="dash-duo">
        <section class="card">
          <div class="card-heading">
            <h2>薄弱知识点雷达</h2>
            <span class="muted small">掌握度 = 1 - 错误率</span>
          </div>
          <div class="dl-field">
            <label for="radar-subject">学科</label>
            <select id="radar-subject" v-model="subjectId" class="dl-input" @change="loadRadar">
              <option value="">请选择学科</option>
              <option v-for="item in subjectOptions" :key="String(item.value)" :value="item.value">
                {{ item.text }}
              </option>
            </select>
          </div>
          <div v-if="radarLoading" class="dash-empty-compact">正在读取薄弱点…</div>
          <div v-else-if="radarError" class="notice">{{ radarError }}</div>
          <template v-else-if="radar && radar.items.length">
            <ChartPanel
              :option="radarOption"
              :summary="`${radar.items.length}个知识点的掌握度雷达，样本不足的知识点按0处理。`"
            />
          </template>
          <div v-else class="dash-empty">
            <span class="dash-empty-icon"><AppIcon name="target" :size="22" /></span>
            <b>{{ subjectId ? '这个学科还没有作答样本' : '还没有可选学科' }}</b>
            <p>{{ subjectId ? '做几道这个学科的题，掌握度才会被计算。' : '先在「公共课学习」或「学习计划」里加载学科后回到这里。' }}</p>
            <RouterLink to="/practice" class="btn secondary dash-empty-cta-sm">去练习</RouterLink>
          </div>
        </section>

        <section class="card">
          <div class="card-heading">
            <h2>本周学习报告</h2>
            <span class="tag">{{
            weekly === null
              ? '待生成'
              : weekly.status === 'completed'
                ? '已生成'
                : weekly.status === 'failed_retryable'
                  ? '生成失败'
                  : '生成中'
          }}</span>
          </div>
          <p class="muted small">
            本周累计学习 <strong>{{ hours(weekly?.studyMinutes || 0) }}</strong> 小时，正确率
            {{ percent(weekly?.correctRate ?? null) }}%。
          </p>
          <p class="dl-report">{{ weeklySummary }}</p>
          <ul v-if="weeklySuggestions.length" class="dash-steps">
            <li v-for="(item, index) in weeklySuggestions" :key="index">{{ item }}</li>
          </ul>
          <p class="muted small space-top">
            报告由后台按周聚合生成；未到生成时间会返回 pending。
          </p>
        </section>
      </div>
    </div>

    <aside class="dash-rail">
      <section class="card">
        <div class="card-heading">
          <h2>记录一次学习</h2>
          <button class="text-btn small" type="button" @click="form.startAt = localTime(-60); form.endAt = localTime(0)">
            用最近一小时
          </button>
        </div>
        <form class="dl-form" @submit.prevent="saveEvent">
          <div class="dl-field">
            <label for="dl-type">训练类型</label>
            <select id="dl-type" v-model="form.type" class="dl-input">
              <option v-for="item in typeOptions" :key="item.value" :value="item.value">{{ item.text }}</option>
            </select>
          </div>
          <div class="dl-field">
            <label for="dl-start">开始时间</label>
            <input id="dl-start" v-model="form.startAt" class="dl-input" type="datetime-local" />
          </div>
          <div class="dl-field">
            <label for="dl-end">结束时间</label>
            <input id="dl-end" v-model="form.endAt" class="dl-input" type="datetime-local" />
          </div>
          <div class="dl-field">
            <label for="dl-focus">专注自评（0–1，可选）</label>
            <input id="dl-focus" v-model="form.focus" class="dl-input" inputmode="decimal" placeholder="例如 0.8" />
          </div>
          <p v-if="saveError" class="dl-error">{{ saveError }}</p>
          <p v-if="savedMinutes !== null" class="dl-ok">已记录，本次计入 {{ savedMinutes }} 分钟。</p>
          <button class="btn" type="submit" :disabled="saving">{{ saving ? '正在记录…' : '记录一次学习' }}</button>
          <p class="muted small">单条记录不超过 24 小时；重叠时段会去重后计入。</p>
        </form>
      </section>

      <section class="card">
        <div class="card-heading">
          <h2>学习快捷入口</h2>
        </div>
        <div class="dash-quick">
          <RouterLink
            v-for="item in [
              { path: '/practice', icon: 'pen', title: '刷题练习' },
              { path: '/qa', icon: 'chat', title: 'AI 答疑' },
              { path: '/exams', icon: 'exam', title: '模考估分' },
              { path: '/planning', icon: 'calendar', title: '学习计划' },
            ]"
            :key="item.path"
            :to="item.path"
            class="dash-quick-link"
          >
            <span class="module-icon"><AppIcon :name="item.icon" :size="16" /></span>
            <span>{{ item.title }}</span>
            <AppIcon name="chevron" :size="14" />
          </RouterLink>
        </div>
      </section>

      <section class="card">
        <div class="card-heading">
          <h2>数据说明</h2>
        </div>
        <p class="muted small">
          本页所有数字来自学习数据仪表盘接口，按中国标准时间聚合；没有样本的指标显示「—」，不做估算。
        </p>
        <p class="muted small">算法版本：{{ dashboard?.algorithmVersion || '—' }}</p>
      </section>
    </aside>
  </div>
</template>