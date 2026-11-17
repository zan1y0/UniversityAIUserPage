<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { questions } from '../data/demo';
import { useAppStore } from '../stores/app';
import { useStudyStore } from '../stores/study';
import { gradeQuestions, remainingSeconds } from '../domain/logic';
import { useClickGuard } from '../composables/useClickGuard';
import AppIcon from '../components/AppIcon.vue';
import LiveUnavailable from '../components/LiveUnavailable.vue';
const app = useAppStore();
const study = useStudyStore();
const subject = ref('综合');
const duration = ref(10);
const index = ref(0);
const now = ref(Date.now());
const review = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;
const session = computed(() => study.state.exam);
const paper = computed(() => questions.filter((q) => session.value?.questionIds.includes(q.id)));
const question = computed(() => paper.value[index.value]);
const remaining = computed(() => (session.value ? remainingSeconds(session.value, now.value) : 0));
const display = computed(
  () =>
    `${String(Math.floor(remaining.value / 60)).padStart(2, '0')}:${String(remaining.value % 60).padStart(2, '0')}`,
);
const result = computed(() => gradeQuestions(paper.value, session.value?.answers || {}));
const answered = computed(() => Object.keys(session.value?.answers || {}).length);
function start() {
  const pool = questions.filter((q) => subject.value === '综合' || q.subject === subject.value);
  study.state.exam = {
    id: crypto.randomUUID(),
    questionIds: pool.map((q) => q.id),
    answers: {},
    startedAt: Date.now(),
    durationSeconds: duration.value * 60,
  };
  index.value = 0;
  now.value = Date.now();
  review.value = false;
}
function submit(auto = false) {
  const s = session.value;
  if (!s || s.submittedAt) return;
  if (
    !auto &&
    !confirm(`已答 ${answered.value}/${paper.value.length} 题，确认交卷？交卷后不能更改答案。`)
  )
    return;
  s.submittedAt = Math.min(Date.now(), s.startedAt + s.durationSeconds * 1000);
  paper.value.forEach((q) => {
    const chosen = s.answers[q.id];
    study.state.attempts.push({
      questionId: q.id,
      selected: chosen ?? -1,
      correct: chosen === q.answer,
      time: new Date(s.submittedAt!).toISOString(),
      kind: 'exam',
    });
  });
  app.notify(auto ? '考试时间结束，已自动交卷。' : '演示试卷已交卷并完成客观题评分。');
}
// 连点保护：800ms 内的重复点击直接忽略，首次点击立即生效
const startGuard = useClickGuard(() => start(), { cooldown: 800 });
const submitGuard = useClickGuard(() => submit(), { cooldown: 800 });
function choose(value: number) {
  if (!session.value || session.value.submittedAt) return;
  if (remainingSeconds(session.value) === 0) {
    submit(true);
    return;
  }
  if (question.value) session.value.answers[question.value.id] = value;
}
function again() {
  if (confirm('开始新的演示模考？当前答卷详情将被替换，历史作答统计会保留。')) {
    study.state.exam = null;
    index.value = 0;
    review.value = false;
  }
}
onMounted(() => {
  if (app.mode !== 'demo') return;
  now.value = Date.now();
  if (session.value && !session.value.submittedAt && !remainingSeconds(session.value)) submit(true);
  timer = setInterval(() => {
    now.value = Date.now();
    if (session.value && !session.value.submittedAt && remaining.value === 0) submit(true);
  }, 250);
});
onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});
</script>
<template>
  <LiveUnavailable v-if="app.mode === 'live'" capability="试卷、模考会话、交卷评分与估分" />
  <template v-else>
    <section class="dash-strip">
      <div class="strip-left">
        <strong>模考与估分</strong>
        <span class="strip-dot">·</span>
        <span>示例客观题试卷 · 综合卷 12 题</span>
      </div>
      <span class="strip-right">
        {{ session ? (session.submittedAt ? '已交卷' : `剩余 ${display}`) : '尚未开始' }}
      </span>
    </section>

    <div class="dash-kpi">
      <div class="dash-kpi-item">
        <p>{{ session ? '本卷题量' : '卷面题量' }}</p>
        <b>{{ session ? paper.length : 12 }}<small>题</small></b>
        <span>每科 3 题</span>
      </div>
      <div class="dash-kpi-item">
        <p>{{ session ? '已作答' : '可选时长' }}</p>
        <b>{{ session ? answered : duration }}<small>{{ session ? `/${paper.length}` : '分钟' }}</small></b>
        <span>{{ session ? (session.submittedAt ? '已交卷' : '提交前可修改') : '1 / 10 / 30 分钟' }}</span>
      </div>
      <div class="dash-kpi-item">
        <p>{{ session ? '剩余时间' : '评分方式' }}</p>
        <b class="dash-kpi-word">{{ session ? display : '按正确比例' }}</b>
        <span>{{ session ? '超时自动交卷' : '折算为 100 分' }}</span>
      </div>
      <div class="dash-kpi-item">
        <p>{{ session && session.submittedAt ? '本次得分' : '真实估分' }}</p>
        <b>{{ session && session.submittedAt ? result.score : '—' }}<small v-if="session && session.submittedAt">分</small></b>
        <span>排名与估分待后端接入</span>
      </div>
    </div>

    <div class="dash-body">
      <div class="dash-main">
        <section v-if="!session" class="card">
          <div class="card-heading">
            <h2>开始一次限时检验</h2>
            <span class="tag">示例客观题试卷</span>
          </div>
          <p class="muted small">
            综合卷共 12 题，每科 3 题。演示评分按正确比例折算为 100
            分，不代表真实考研科目分值或预测总分。
          </p>
          <form class="dash-toolbar exam-toolbar" @submit.prevent="startGuard.trigger()">
            <label class="field"
              >试卷科目<select v-model="subject">
                <option v-for="s in ['综合', '数学', '英语', '政治', '专业课']" :key="s">
                  {{ s }}
                </option>
              </select></label
            >
            <label class="field"
              >演示时长<select v-model.number="duration">
                <option :value="1">1 分钟 · 测试计时</option>
                <option :value="10">10 分钟 · 快速模考</option>
                <option :value="30">30 分钟 · 深度练习</option>
              </select></label
            >
            <button class="btn"><AppIcon name="play" :size="15" />开始模考</button>
          </form>
          <ul class="rail-notes exam-notes">
            <li>开始后按绝对截止时间计时；刷新后继续原答卷。</li>
            <li>超时自动交卷，主观题与服务端评分尚未接入。</li>
            <li>离线演示只做浏览器流程验证，不具备正式考试防作弊能力。</li>
          </ul>
        </section>

        <section v-else-if="!session.submittedAt" class="card">
          <div class="card-heading">
            <h2>限时模考</h2>
            <span class="exam-timer" :class="{ urgent: remaining < 60 }" role="timer"
              ><AppIcon name="clock" :size="16" /> {{ display }}</span
            >
          </div>
          <div v-if="question">
            <div class="question-head">
              <span class="tag">{{ question.subject }} · 第 {{ index + 1 }} 题</span>
              <span class="muted small">{{ answered }} / {{ paper.length }} 已答</span>
            </div>
            <h2 class="question-title">{{ question.stem }}</h2>
            <div class="option-list">
              <label
                v-for="(option, i) in question.options"
                :key="i"
                class="option"
                :class="{ selected: session.answers[question.id] === i }"
                ><input
                  name="exam-answer"
                  type="radio"
                  :checked="session.answers[question.id] === i"
                  :disabled="remaining === 0"
                  @change="choose(i)"
                /><span>{{ String.fromCharCode(65 + i) }}.</span>{{ option }}</label
              >
            </div>
          </div>
          <div class="form-actions">
            <button class="btn secondary" :disabled="index === 0" @click="index--">上一题</button>
            <button class="btn" :disabled="index === paper.length - 1" @click="index++">
              下一题<AppIcon name="arrow" :size="15" />
            </button>
          </div>
        </section>

        <template v-else>
          <section class="card">
            <div class="card-heading">
              <h2>模考结果</h2>
              <span class="tag green">已交卷</span>
            </div>
            <div class="exam-result">
              <div class="score-circle">
                <strong>{{ result.score }}</strong><span>演示客观题折算分 / 100</span>
              </div>
              <ul class="rail-stats exam-stats">
                <li>
                  <span>正确题数</span><b>{{ result.correct }} / {{ result.total }}</b>
                </li>
                <li>
                  <span>答题用时</span>
                  <b>{{ Math.ceil((session.submittedAt - session.startedAt) / 60000) }} 分钟</b>
                </li>
                <li>
                  <span>排名 / 真实估分</span><b>待后端接入</b>
                </li>
              </ul>
            </div>
            <div class="form-actions">
              <button class="btn" @click="review = !review">
                {{ review ? '收起解析' : '查看答卷与解析' }}</button
              ><button class="btn secondary" @click="again">再做一次模考</button>
            </div>
          </section>

          <section v-if="review" class="card">
            <div class="card-heading"><h2>答卷复盘</h2></div>
            <div v-for="(q, i) in paper" :key="q.id" class="list-item">
              <h3>{{ i + 1 }}. {{ q.stem }}</h3>
              <p>
                你的选项：{{
                  session.answers[q.id] === undefined
                    ? '未作答'
                    : String.fromCharCode(65 + session.answers[q.id]!)
                }}
                · 正确选项：{{ String.fromCharCode(65 + q.answer) }}
              </p>
              <p>{{ q.explanation }}</p>
            </div>
          </section>
        </template>
      </div>

      <aside class="dash-rail">
        <section v-if="!session" class="card">
          <div class="card-heading"><h2>模考提醒</h2></div>
          <ul class="rail-notes">
            <li>先做限时卷，再用复盘定位薄弱项。</li>
            <li>模考成绩只用于流程演示，不等同预测总分。</li>
            <li>想先熟悉题型，可以先去刷题页。</li>
          </ul>
          <RouterLink to="/practice" class="btn secondary stretch">先去刷几道题</RouterLink>
        </section>

        <section v-else-if="!session.submittedAt" class="card">
          <div class="card-heading">
            <h2>答题卡</h2>
            <span class="muted small">{{ answered }} / {{ paper.length }}</span>
          </div>
          <div class="answer-sheet">
            <button
              v-for="(q, i) in paper"
              :key="q.id"
              class="answer-number"
              :class="{ answered: session.answers[q.id] !== undefined, current: index === i }"
              :aria-label="`第${i + 1}题${session.answers[q.id] !== undefined ? '已作答' : '未作答'}`"
              @click="index = i"
            >
              {{ i + 1 }}
            </button>
          </div>
          <p class="muted small space-top">蓝色表示已作答。提交前检查未答题。</p>
          <button class="btn stretch space-top" @click="submitGuard.trigger()">提交试卷</button>
        </section>

        <section v-else class="card">
          <div class="card-heading"><h2>薄弱项与冲刺建议</h2></div>
          <ul class="rail-stats">
            <li v-for="s in ['数学', '英语', '政治', '专业课']" :key="s">
              <span>{{ s }}</span>
              <b v-if="paper.some((q) => q.subject === s)">
                {{ paper.filter((q) => q.subject === s && session!.answers[q.id] === q.answer).length }}
                / {{ paper.filter((q) => q.subject === s).length }}
              </b>
              <b v-else class="muted">未涉及</b>
            </li>
          </ul>
          <p class="muted small">
            优先回顾未掌握的题目知识点；本次试卷未涉及的科目不参与统计。
          </p>
          <RouterLink to="/practice" class="btn stretch">回到错题专项训练</RouterLink>
        </section>
      </aside>
    </div>
  </template>
</template>