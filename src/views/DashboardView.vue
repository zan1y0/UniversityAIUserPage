<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useAppStore } from '../stores/app';
import { useStudyStore } from '../stores/study';
import { localDate } from '../domain/logic';
import { questions } from '../data/demo';
import { backend } from '../api/backend';
import { useLoad } from '../composables/useLoad';
import AppIcon from '../components/AppIcon.vue';
import ChartPanel from '../components/ChartPanel.vue';
import AsyncState from '../components/AsyncState.vue';
const app = useAppStore();
const study = useStudyStore();
const { status, error, run } = useLoad();
const liveData = ref('');
const reportOpen = ref(false);
const mounted = ref(false);
const tasks = computed(
  () => study.state.plan?.tasks.filter((t) => t.date === localDate()).slice(0, 4) || [],
);
const doneCount = computed(() => tasks.value.filter((t) => t.done).length);
const taskProgress = computed(() =>
  tasks.value.length ? `${doneCount.value} / ${tasks.value.length} 已完成` : '暂无任务',
);
const subjectMinutes = computed(() =>
  ['数学', '英语', '政治', '专业课'].map((s) =>
    study.state.events.filter((e) => e.subject === s).reduce((n, e) => n + e.minutes, 0),
  ),
);
const focusedMinutes = computed(() =>
  study.state.events.filter((e) => e.focused).reduce((n, e) => n + e.minutes, 0),
);
const tasksLeft = computed(() => tasks.value.filter((t) => !t.done).length);
const stripText = computed(() => {
  if (!tasks.value.length) return '今天还没有安排功课';
  return tasksLeft.value ? `还有 ${tasksLeft.value} 项功课待完成` : '今天的功课已完成';
});
/** 小时数：有记录保留一位小数，没有记录时直接显示 0，避免 '0.0 小时' 的空洞感。 */
const hours = (minutes: number): string => (minutes > 0 ? (minutes / 60).toFixed(1) : '0');
const focusRate = computed(() =>
  study.totalMinutes
    ? Math.round(
        (study.state.events.filter((e) => e.focused).reduce((n, e) => n + e.minutes, 0) /
          study.totalMinutes) *
          100,
      )
    : 0,
);
const weekDays = computed(() =>
  Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    return localDate(d);
  }),
);
/** 最近 2 道错题：同一道题错多次只出现一次，按最近一次作答时间倒序。 */
const recentWrong = computed(() => {
  const latest = new Map<string, { time: string; misses: number }>();
  for (const a of study.state.attempts) {
    if (a.correct) continue;
    const seen = latest.get(a.questionId);
    if (seen) seen.misses += 1;
    else latest.set(a.questionId, { time: a.time, misses: 1 });
  }
  return [...latest.entries()]
    .sort((a, b) => (a[1].time < b[1].time ? 1 : -1))
    .slice(0, 2)
    .map(([id, meta]) => {
      const q = questions.find((item) => item.id === id);
      return {
        id,
        subject: q?.subject ?? '综合',
        topic: q?.topic ?? '待归类',
        stem: q?.stem ?? '题目暂未收录，去练习页查看记录。',
        misses: meta.misses,
      };
    });
});
/** 错题按学科分布：用于在错题卡里给出“哪一科更该先补”的判断依据。 */
const wrongBySubject = computed(() => {
  const counts = new Map<string, number>();
  for (const a of study.state.attempts) {
    if (a.correct) continue;
    const subject = questions.find((q) => q.id === a.questionId)?.subject ?? '综合';
    counts.set(subject, (counts.get(subject) ?? 0) + 1);
  }
  const max = Math.max(1, ...counts.values());
  return ['数学', '英语', '政治', '专业课'].map((subject) => ({
    subject,
    count: counts.get(subject) ?? 0,
    width: Math.round(((counts.get(subject) ?? 0) / max) * 100),
  }));
});
const examSummary = computed(() => {
  const exam = study.state.exam;
  if (!exam) return null;
  const rows = study.state.attempts.filter((a) => a.kind === 'exam');
  const correct = rows.filter((a) => a.correct).length;
  const usedAt = exam.submittedAt ?? Date.now();
  const minutes = Math.max(1, Math.round((usedAt - exam.startedAt) / 60000));
  return {
    total: exam.questionIds.length,
    correct,
    minutes,
    rate: rows.length ? Math.round((correct / rows.length) * 100) : 0,
  };
});
const focusDash = computed(() => (focusRate.value / 100) * 264);
const trendOption = computed(() => ({
  color: ['#6366F1'],
  tooltip: { trigger: 'axis' },
  grid: { left: 35, right: 15, top: 20, bottom: 25 },
  xAxis: {
    type: 'category',
    data: weekDays.value.map((d) => d.slice(5)),
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
      symbolSize: 6,
      areaStyle: { color: '#EEF2FF' },
      data: weekDays.value.map((d) =>
        study.state.events.filter((e) => e.date === d).reduce((n, e) => n + e.minutes, 0),
      ),
    },
  ],
}));
const radarOption = computed(() => ({
  color: ['#6366F1'],
  radar: {
    indicator: ['数学', '英语', '政治', '专业课'].map((s) => ({ name: s, max: 100 })),
    axisName: { color: '#6B7280', fontSize: 11 },
    splitLine: { lineStyle: { color: '#F3F4F6' } },
    splitNumber: 3,
    splitArea: { areaStyle: { color: ['#ffffff', '#fbfbfe'] } },
    radius: '64%',
  },
  series: [
    {
      type: 'radar',
      data: [
        {
          value: ['数学', '英语', '政治', '专业课'].map((s) => {
            const ids = study.state.attempts.filter((a) => {
              return (
                a.questionId.startsWith('q') &&
                (s === '数学'
                  ? Number(a.questionId.slice(1)) <= 3
                  : s === '英语'
                    ? Number(a.questionId.slice(1)) >= 4 && Number(a.questionId.slice(1)) <= 6
                    : s === '政治'
                      ? Number(a.questionId.slice(1)) >= 7 && Number(a.questionId.slice(1)) <= 9
                      : Number(a.questionId.slice(1)) >= 10)
              );
            });
            return ids.length
              ? Math.round((ids.filter((a) => a.correct).length / ids.length) * 100)
              : 0;
          }),
          lineStyle: { width: 2 },
          symbolSize: 4,
          areaStyle: { color: 'rgba(79, 70, 229, 0.14)' },
        },
      ],
    },
  ],
}));
const weekMinutes = computed(() =>
  study.state.events
    .filter((e) => weekDays.value.includes(e.date))
    .reduce((n, e) => n + e.minutes, 0),
);
async function load() {
  if (app.mode === 'live' && app.user) {
    const data = await run(() => backend.dashboard(app.user!.id));
    if (data !== undefined) liveData.value = JSON.stringify(data, null, 2);
  }
}
onMounted(() => {
  requestAnimationFrame(() => (mounted.value = true));
  load();
});
</script>
<template>
  <template v-if="app.mode === 'demo'">
    <section class="dash-strip">
      <span class="dash-strip-dot" aria-hidden="true"></span>
      <span
        ><b>{{ app.displayName }}</b
        >，今天也一起向前吧</span
      >
      <span class="dash-strip-right">{{ stripText }}</span>
    </section>

    <section class="dash-kpi" aria-label="学习概览">
      <div class="dash-kpi-item">
        <p>累计学习时长</p>
        <b>{{ hours(study.totalMinutes) }}<small>小时</small></b>
        <span>来自已完成课程与专注计时</span>
      </div>
      <div class="dash-kpi-item">
        <p>练习正确率</p>
        <b>{{ study.correctRate }}<small>%</small></b>
        <span>累计 {{ study.state.attempts.length }} 次作答</span>
      </div>
      <div class="dash-kpi-item">
        <p>累计打卡</p>
        <b>{{ study.state.checkins.length }}<small>天</small></b>
        <span>{{ study.checkedIn ? '今日已打卡，继续保持' : '今天的努力还待记录' }}</span>
      </div>
      <div class="dash-kpi-item">
        <p>专注学习占比</p>
        <b>{{ focusRate }}<small>%</small></b>
        <span>{{ study.wrongIds.length }} 道错题待复习</span>
      </div>
    </section>

    <div class="dash-body">
      <div class="dash-main">
        <section class="card">
          <div class="card-heading">
            <h2>今日功课</h2>
            <span class="muted small">{{ taskProgress }}</span>
          </div>
          <div v-if="!tasks.length" class="dash-empty">
            <span class="dash-empty-icon"><AppIcon name="calendar" :size="20" /></span>
            <p>今天还没有安排任务</p>
            <span class="muted small"
              >生成学习计划后，这里会按学科列出今天的功课。</span
            >
            <RouterLink to="/planning" class="dash-empty-cta"
              >去制定计划<AppIcon name="arrow" :size="14"
            /></RouterLink>
          </div>
          <div v-else class="dash-table" role="table" aria-label="今日功课">
            <div class="dash-tr dash-th" role="row">
              <span role="columnheader">学科</span>
              <span role="columnheader">任务</span>
              <span role="columnheader">状态</span>
            </div>
            <div
              v-for="task in tasks"
              :key="task.id"
              class="dash-tr"
              :class="{ done: task.done }"
              role="row"
            >
              <span class="dash-subject" role="cell">{{ task.subject }}</span>
              <span class="dash-task" role="cell">
                <input
                  v-model="task.done"
                  class="task-check"
                  type="checkbox"
                  :aria-label="`完成${task.title}`"
                />
                <span>{{ task.title }}</span>
                <span class="dash-dur">{{ task.minutes }} 分钟</span>
              </span>
              <span class="dash-state" :class="{ done: task.done }" role="cell"
                ><i aria-hidden="true"></i>{{ task.done ? '已完成' : '待完成' }}</span
              >
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-heading">
            <h2>学习时长趋势</h2>
            <span class="tag">近 7 天 · {{ weekMinutes }} 分钟</span>
          </div>
          <ChartPanel
            v-if="weekMinutes > 0"
            :option="trendOption"
            :summary="`近7天共学习${weekMinutes}分钟。统计仅来自本浏览器演示行为。`"
          />
          <div v-else class="dash-empty dash-empty-compact">
            <span class="dash-empty-icon"><AppIcon name="clock" :size="20" /></span>
            <p>本周还没有学习记录</p>
            <span class="muted small">上一节课或做一组题，这里就会画出这 7 天的趋势。</span>
            <RouterLink to="/public-courses" class="dash-empty-cta"
              >去看看课程<AppIcon name="arrow" :size="14"
            /></RouterLink>
          </div>
        </section>

        <div class="dash-duo">
          <section class="card">
            <div class="card-heading">
              <h2>错题回顾</h2>
              <RouterLink to="/practice" class="text-btn"
                >去巩固<AppIcon name="chevron" :size="14"
              /></RouterLink>
            </div>
            <div v-if="!recentWrong.length" class="dash-empty">
              <span class="dash-empty-icon"><AppIcon name="target" :size="20" /></span>
              <p>还没有错题记录</p>
              <span class="muted small"
                >答错的题会自动进入错题本，并按最近一次作答时间排在这里。</span
              >
              <ol class="dash-steps">
                <li>在「刷题与错题」里完成一组练习</li>
                <li>答错的题自动归入错题本</li>
                <li>回到工作台回顾，再练同类题</li>
              </ol>
              <RouterLink to="/practice" class="dash-empty-cta"
                >去刷几道题<AppIcon name="arrow" :size="14"
              /></RouterLink>
            </div>
            <div v-for="item in recentWrong" :key="item.id" class="dash-wrong">
              <span class="tag">{{ item.subject }}</span>
              <p>{{ item.stem }}</p>
              <span class="muted small">{{ item.topic }} · 错 {{ item.misses }} 次</span>
            </div>
            <div v-if="recentWrong.length" class="dash-stat">
              <p class="muted small">错题按学科分布</p>
              <div v-for="row in wrongBySubject" :key="row.subject" class="dash-stat-row">
                <span>{{ row.subject }}</span>
                <div class="dash-stat-bar"><i :style="{ width: `${row.width}%` }"></i></div>
                <b>{{ row.count }}</b>
              </div>
            </div>
          </section>
          <section class="card">
            <div class="card-heading">
              <h2>知识掌握概览</h2>
              <span class="muted small">练习正确率</span>
            </div>
            <ChartPanel
              :option="radarOption"
              :summary="`四科累计学习分钟数：数学${subjectMinutes[0]}、英语${subjectMinutes[1]}、政治${subjectMinutes[2]}、专业课${subjectMinutes[3]}。雷达表示练习正确率，无样本显示0，不代表实际能力。`"
            />
          </section>
        </div>
      </div>

      <aside class="dash-rail">
        <section class="card dash-focus">
          <div class="card-heading">
            <h2>专注学习占比</h2>
            <span class="muted small">全部记录</span>
          </div>
          <div class="dash-ring">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <circle class="dash-ring-bg" cx="50" cy="50" r="42" />
              <circle
                class="dash-ring-fg"
                cx="50"
                cy="50"
                r="42"
                :style="{ strokeDasharray: `${mounted ? focusDash : 0} 264` }"
              />
            </svg>
            <div class="dash-ring-label">
              <b>{{ focusRate }}%</b><span>专注占比</span>
            </div>
          </div>
          <p class="muted small">
            已专注 {{ hours(focusedMinutes) }} 小时 · 共记录 {{ hours(study.totalMinutes) }} 小时
          </p>
        </section>

        <section class="card">
          <div class="card-heading">
            <h2>最近模考</h2>
            <RouterLink v-if="examSummary" to="/exams" class="text-btn">去模考</RouterLink>
          </div>
          <template v-if="examSummary">
            <div class="dash-mock">
              <div>
                <b>{{ examSummary.correct }}</b
                ><small>/ {{ examSummary.total }} 题正确</small>
              </div>
              <div class="dash-mock-side">
                <span>正确率 {{ examSummary.rate }}%</span>
                <span>用时 {{ examSummary.minutes }} 分钟</span>
              </div>
            </div>
          </template>
          <template v-else
            ><p class="muted small">还没有模考记录，限时模考后这里会显示正确率与用时。</p>
            <RouterLink to="/exams" class="dash-empty-cta dash-empty-cta-sm"
              >去模考<AppIcon name="arrow" :size="13" /></RouterLink></template
          >
        </section>

        <section class="card">
          <div class="card-heading">
            <h2>快捷入口</h2>
            <span class="muted small">从这里开始</span>
          </div>
          <div class="dash-quick">
            <RouterLink
              v-for="item in [
                { path: '/qa', icon: 'chat', title: '问懂一道题' },
                { path: '/practice', icon: 'pen', title: '每天练一点' },
                { path: '/exams', icon: 'exam', title: '限时模考' },
                { path: '/schools', icon: 'school', title: '院校筛选' },
              ]"
              :key="item.path"
              :to="item.path"
              class="dash-quick-link"
              ><span class="module-icon"><AppIcon :name="item.icon" :size="15" /></span
              ><span>{{ item.title }}</span
              ><AppIcon name="chevron" :size="13"
            /></RouterLink>
          </div>
        </section>

        <section class="card">
          <div class="card-heading">
            <h2>本周学习报告</h2>
            <button class="text-btn" @click="reportOpen = !reportOpen">
              {{ reportOpen ? '收起' : '查看' }}
            </button>
          </div>
          <p class="muted small">
            本周累计学习 <strong>{{ weekMinutes }}</strong> 分钟。以实际记录为起点，制定下一周的节奏。
          </p>
          <div v-if="reportOpen" class="week-report space-top">
            学习记录：{{
              study.state.events.filter((e) => weekDays.includes(e.date)).length
            }}
            次。<br />累计作答正确率：{{ study.correctRate }}%（包含重复练习）。<br />建议：{{
              study.wrongIds.length
                ? '优先复习错题对应知识点，理解错误原因后再练同类题。'
                : '先建立稳定的学习记录，再结合练习反馈调整计划。'
            }}<br /><span class="muted small"
              >此报告为本地规则总结；真实周报、排名和估分待后端接入。</span
            >
          </div>
        </section>
      </aside>
    </div>
  </template>
  <template v-else
    ><section class="card">
      <div class="card-heading">
        <h2>真实学习数据</h2>
        <button class="btn secondary" :disabled="status === 'loading'" @click="load">
          刷新数据
        </button>
      </div>
      <AsyncState :status="status" :error="error" @retry="load" />
      <div v-if="liveData" class="notice">
        当前统计 DTO 尚未定义，以下展示接口原始数据供联调核验，不用于计算学习指标。
      </div>
      <pre v-if="liveData" class="reading">{{ liveData }}</pre>
    </section></template
  >
</template>