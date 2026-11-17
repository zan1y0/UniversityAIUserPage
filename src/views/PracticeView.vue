<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { questions } from '../data/demo';
import type { Question } from '../domain/types';
import { useAppStore } from '../stores/app';
import { useStudyStore } from '../stores/study';
import { useLoad } from '../composables/useLoad';
import { backend } from '../api/backend';
import AsyncState from '../components/AsyncState.vue';
import LiveUnavailable from '../components/LiveUnavailable.vue';
import AppIcon from '../components/AppIcon.vue';
const app = useAppStore();
const study = useStudyStore();
const { status, error, run } = useLoad();
const kind = ref('每日一练');
const subject = ref('全部科目');
const topic = ref('全部知识点');
const bank = ref<Question[]>(app.mode === 'demo' ? questions : []);
const index = ref(0);
const selected = ref<number | null>(null);
const submitted = ref(false);
const topics = computed(() => [
  ...new Set(
    bank.value
      .filter((q) => subject.value === '全部科目' || q.subject === subject.value)
      .map((q) => q.topic),
  ),
]);
const pool = computed(() =>
  bank.value.filter(
    (q) =>
      (subject.value === '全部科目' || q.subject === subject.value) &&
      (topic.value === '全部知识点' || q.topic === topic.value) &&
      (kind.value !== '错题本' || study.wrongIds.includes(q.id)),
  ),
);
const question = computed(() => pool.value[index.value]);
const wrongCount = computed(() => study.wrongIds.length);
watch([subject, topic, kind], () => {
  index.value = 0;
  selected.value = null;
  submitted.value = false;
});
watch(subject, () => (topic.value = '全部知识点'));
function submit() {
  if (!question.value || selected.value === null || submitted.value || app.mode !== 'demo') return;
  submitted.value = true;
  study.state.attempts.push({
    questionId: question.value.id,
    selected: selected.value,
    correct: selected.value === question.value.answer,
    time: new Date().toISOString(),
    kind: 'practice',
  });
}
function next() {
  if (index.value < pool.value.length - 1) index.value++;
  else index.value = 0;
  selected.value = null;
  submitted.value = false;
}
async function similar() {
  const q = question.value;
  if (!q) return;
  const nextQ = questions.find((v) => v.id !== q.id && v.subject === q.subject);
  if (!nextQ) {
    app.notify('示例题库没有更多同类题');
    return;
  }
  kind.value = '专项训练';
  subject.value = q.subject;
  topic.value = '全部知识点';
  await nextTick();
  index.value = Math.max(
    0,
    pool.value.findIndex((v) => v.id === nextQ.id),
  );
  selected.value = null;
  submitted.value = false;
  app.notify(`已切换至${q.subject}专项训练，示例题按同学科推荐`);
}
async function load() {
  if (app.mode === 'live' && app.user) {
    const data = await run(() => backend.questions(app.user!.id));
    if (data) bank.value = data;
  }
}
onMounted(load);
</script>
<template>
  <section class="dash-strip">
    <div class="strip-left">
      <strong>{{ kind }}</strong>
      <span class="strip-dot">·</span>
      <span>{{ subject }}{{ topic === '全部知识点' ? '' : ` · ${topic}` }}</span>
    </div>
    <span class="strip-right">题库 {{ pool.length }} 题 · 错题 {{ wrongCount }} 道</span>
  </section>

  <div class="dash-kpi">
    <div class="dash-kpi-item">
      <p>累计作答</p>
      <b>{{ study.state.attempts.length }}<small>次</small></b>
      <span>记录在本机</span>
    </div>
    <div class="dash-kpi-item">
      <p>正确率</p>
      <b>{{ study.correctRate }}<small>%</small></b>
      <span>包含重复练习</span>
    </div>
    <div class="dash-kpi-item">
      <p>错题收录</p>
      <b>{{ wrongCount }}<small>道</small></b>
      <span>保留首次错误记录</span>
    </div>
    <div class="dash-kpi-item">
      <p>当前进度</p>
      <b>{{ pool.length ? index + 1 : 0 }}<small>/ {{ pool.length }}</small></b>
      <span>{{ kind }}</span>
    </div>
  </div>

  <div class="dash-body">
    <div class="dash-main">
      <section class="card">
        <div class="card-heading">
          <h2>练习</h2>
          <div class="seg" role="group" aria-label="练习类型">
            <button
              v-for="k in ['每日一练', '周测', '专项训练', '错题本']"
              :key="k"
              class="seg-item"
              :class="{ active: kind === k }"
              @click="kind = k"
            >
              {{ k }}<template v-if="k === '错题本'"> ({{ wrongCount }})</template>
            </button>
          </div>
        </div>
        <div class="dash-toolbar practice-toolbar">
          <label class="field"
            >科目<select v-model="subject">
              <option v-for="s in ['全部科目', '数学', '英语', '政治', '专业课']" :key="s">
                {{ s }}
              </option>
            </select></label
          >
          <label class="field"
            >知识点<select v-model="topic">
              <option>全部知识点</option>
              <option v-for="t in topics" :key="t">{{ t }}</option>
            </select></label
          >
          </div>
        <AsyncState :status="status" :error="error" @retry="load" />
        <LiveUnavailable v-if="app.mode === 'live'" capability="练习提交、错题同步与周测评分" />
        <template v-if="question">
          <div class="question-head">
            <span class="tag purple">{{ question.subject }} · {{ question.topic }}</span>
            <span class="muted small">{{ index + 1 }} / {{ pool.length }}</span>
          </div>
          <h2 class="question-title">{{ question.stem }}</h2>
          <div class="option-list">
            <label
              v-for="(option, i) in question.options"
              :key="i"
              class="option"
              :class="{
                selected: selected === i,
                correct: submitted && i === question.answer,
                wrong: submitted && selected === i && i !== question.answer,
              }"
              ><input
                v-model="selected"
                type="radio"
                name="answer"
                :value="i"
                :disabled="submitted"
              /><span>{{ String.fromCharCode(65 + i) }}.</span>{{ option }}</label
            >
          </div>
          <div v-if="submitted" class="answer-feedback" role="status">
            <strong
              >{{
                selected === question.answer ? '回答正确，继续保持。' : '这道题已加入本地错题本。'
              }}
              正确选项：{{ String.fromCharCode(65 + question.answer) }}</strong
            >{{ question.explanation }}
          </div>
          <div class="form-actions">
            <button
              v-if="!submitted"
              class="btn"
              :disabled="selected === null || app.mode === 'live'"
              @click="submit"
            >
              提交答案</button
            ><button v-else class="btn" @click="next">
              {{ index === pool.length - 1 ? '再练一轮' : '下一题'
              }}<AppIcon name="arrow" :size="15" /></button
            ><button v-if="submitted" class="btn secondary" @click="similar">练同学科题</button
            ><RouterLink
              v-if="submitted"
              class="text-btn"
              :to="{ path: '/qa', query: { question: `请引导我理解：${question.stem}` } }"
              >向 AI 追问</RouterLink
            >
          </div>
        </template>
        <div v-else-if="status !== 'loading'" class="dash-empty">
          <span class="dash-empty-icon"><AppIcon name="pen" :size="20" /></span>
          <h3>{{ kind === '错题本' ? '还没有错题' : '暂无匹配题目' }}</h3>
          <p>
            {{
              kind === '错题本'
                ? '完成练习后，答错的题会自动收录。'
                : '换一个科目或知识点，或者等后端提供题库。'
            }}
          </p>
        </div>
      </section>
    </div>

    <aside class="dash-rail">
      <section class="card">
        <div class="card-heading">
          <h2>练习概览</h2>
          <AppIcon name="pen" :size="15" />
        </div>
        <ul class="rail-stats">
          <li>
            <span>累计作答</span><b>{{ study.state.attempts.length }} 次</b>
          </li>
          <li>
            <span>正确率</span><b>{{ study.correctRate }}%</b>
          </li>
          <li>
            <span>错题收录</span><b>{{ wrongCount }} 道</b>
          </li>
        </ul>
        <p class="muted small">
          以上为本地演示统计。错题保留首次错误记录，方便反复巩固；真实环境由后端按账户隔离。
        </p>
      </section>
      <section class="card">
        <div class="card-heading">
          <h2>{{ kind === '周测' ? '本周小测建议' : '让练习更有效' }}</h2>
        </div>
        <ul class="rail-notes">
          <li>先独立作答，再看解释</li>
          <li>记录概念、方法或计算错误</li>
          <li>理解后再做同学科题</li>
          <li>每周回顾错题知识点</li>
        </ul>
        <RouterLink to="/exams" class="btn stretch">进入限时模考</RouterLink>
      </section>
    </aside>
  </div>
</template>