<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { execute } from '../api/contract';
import { ApiError } from '../api/client';
import { useCatalogStore } from '../stores/catalog';
import type {
  Answer,
  PracticeAttempt,
  PracticeSession,
  Question,
  WrongItem,
} from '../api/generated';

const catalog = useCatalogStore();
const route = useRoute();

const type = ref<'daily' | 'weekly' | 'special'>('daily');
const difficulty = ref<'easy' | 'medium' | 'hard'>('medium');
const subjectId = ref('');
const session = ref<PracticeSession | null>(null);
const index = ref(0);
const picked = ref<string[]>([]);
const attempts = ref<Record<string, PracticeAttempt>>({});
const wrongItems = ref<WrongItem[]>([]);
const busy = ref(false);
const errorText = ref('');

const subjects = computed(() => catalog.options('subjectId'));
const question = computed<Question | null>(() => session.value?.questions[index.value] ?? null);
const attempt = computed(() => (question.value ? attempts.value[question.value.id] : undefined));
const answered = computed(() => Object.keys(attempts.value).length);
const total = computed(() => session.value?.questions.length ?? 0);
const correctCount = computed(
  () => Object.values(attempts.value).filter((a) => a.correct).length,
);

const typeText = { daily: '每日一练', weekly: '周测', special: '专项训练' } as const;
const difficultyText = { easy: '简单', medium: '中等', hard: '较难' } as const;

function uid(): string {
  return crypto.randomUUID();
}

async function loadWrongItems() {
  try {
    const page = await execute('op046', { query: { page: 1, pageSize: 5 } });
    wrongItems.value = page.items;
  } catch {
    wrongItems.value = [];
  }
}

async function start() {
  if (!subjectId.value) {
    errorText.value = '请先从学科列表里选择学科（可在公共课学习页加载后回来）。';
    return;
  }
  busy.value = true;
  errorText.value = '';
  try {
    session.value = await execute(
      'op043',
      { body: { type: type.value, subjectId: subjectId.value, knowledgeId: null, difficulty: difficulty.value } },
      { key: uid() },
    );
    index.value = 0;
    picked.value = [];
    attempts.value = {};
  } catch (error) {
    errorText.value = error instanceof ApiError ? error.message : '创建练习失败，请稍后重试';
  } finally {
    busy.value = false;
  }
}

function toggleOption(id: string) {
  if (attempt.value) return;
  if (question.value?.kind === 'multipleChoice') {
    picked.value = picked.value.includes(id)
      ? picked.value.filter((x) => x !== id)
      : [...picked.value, id];
  } else {
    picked.value = [id];
  }
}

async function submit() {
  if (!question.value || !session.value || !picked.value.length) return;
  busy.value = true;
  errorText.value = '';
  const q = question.value;
  const answer: Answer =
    q.kind === 'multipleChoice'
      ? { kind: 'multipleChoice', optionIds: picked.value }
      : { kind: 'singleChoice', optionId: picked.value[0] };
  try {
    const result = await execute(
      'op045',
      { path: { id: session.value.id }, body: { questionVersionId: q.versionId, answer, requestId: uid() } },
      { key: uid() },
    );
    attempts.value = { ...attempts.value, [q.id]: result };
    if (!result.correct) void loadWrongItems();
  } catch (error) {
    errorText.value = error instanceof ApiError ? error.message : '提交失败，请稍后重试';
  } finally {
    busy.value = false;
  }
}

function next() {
  if (!session.value) return;
  if (index.value < session.value.questions.length - 1) index.value += 1;
  picked.value = [];
}

function prev() {
  if (index.value > 0) index.value -= 1;
  picked.value = [];
}

onMounted(() => {
  const fromQuery = route.query.subjectId;
  if (typeof fromQuery === 'string' && fromQuery) subjectId.value = fromQuery;
  void loadWrongItems();
});
</script>

<template>
  <div class="dash-strip">
    <div class="strip-left">
      <span class="strip-dot"></span>刷题与错题<span class="strip-sep">·</span>
      {{ typeText[type] }}<span class="strip-sep">·</span>{{ difficultyText[difficulty] }}
    </div>
    <div class="strip-right">
      {{ session ? `第 ${index + 1} / ${total} 题` : `错题本 ${wrongItems.length} 条` }}
    </div>
  </div>

  <div class="dash-kpi three">
    <div class="dash-kpi-item">
      <span>本轮作答</span>
      <b>{{ answered }}<small>题</small></b>
      <em>提交后立即批改</em>
    </div>
    <div class="dash-kpi-item">
      <span>本轮正确</span>
      <b>{{ correctCount }}<small>题</small></b>
      <em>来自本人作答记录</em>
    </div>
    <div class="dash-kpi-item">
      <span>错题收录</span>
      <b>{{ wrongItems.length }}<small>条</small></b>
      <em>答错自动进入错题本</em>
    </div>
  </div>

  <div class="dash-body">
    <div class="dash-main">
      <section class="card">
        <div class="card-heading">
          <h2>开始练习</h2>
          <span class="muted small">{{ session ? '练习中' : '未开始' }}</span>
        </div>
        <div class="dash-toolbar">
          <label class="field">
            <span>练习类型</span>
            <select v-model="type">
              <option value="daily">每日一练</option>
              <option value="weekly">周测</option>
              <option value="special">专项训练</option>
            </select>
          </label>
          <label class="field">
            <span>学科</span>
            <select v-model="subjectId">
              <option value="">请选择学科</option>
              <option v-for="s in subjects" :key="s.value" :value="s.value">
                {{ s.text }}
              </option>
            </select>
          </label>
          <label class="field">
            <span>难度</span>
            <select v-model="difficulty">
              <option value="easy">简单</option>
              <option value="medium">中等</option>
              <option value="hard">较难</option>
            </select>
          </label>
          <button class="btn" :disabled="busy" @click="start">
            {{ busy ? '处理中…' : session ? '重新生成' : '生成练习' }}
          </button>
        </div>
        <p v-if="!subjects.length" class="dash-notice">
          还没有可选学科：先去
          <RouterLink to="/public-courses">公共课学习</RouterLink>
          或 <RouterLink to="/professional-courses">专业课学习</RouterLink>
          加载学科，再回来开始练习。
        </p>
        <p v-else class="dash-notice">
          题目、选项与批改结果全部来自接口；答错会自动写入错题本。
        </p>
        <p v-if="errorText" class="dash-error">{{ errorText }}</p>
      </section>

      <section class="card">
        <div class="card-heading">
          <h2>{{ session ? '题目' : '练习预览' }}</h2>
          <span class="muted small">
            {{ session ? `${index + 1} / ${total}` : '生成练习后开始作答' }}
          </span>
        </div>

        <div v-if="!session" class="dash-empty">
          <h3>还没有生成练习</h3>
          <p>选择学科与难度，点「生成练习」，题目会按难度从题库抽取。</p>
        </div>

        <template v-else-if="question">
          <div class="question-head">
            <span class="tag">{{ question.kind === 'multipleChoice' ? '多选' : '单选' }}</span>
            <span class="tag">{{ difficultyText[question.difficulty] }}</span>
            <span class="muted small">满分 {{ question.maxScore }}</span>
          </div>
          <p class="question-stem">{{ question.stem }}</p>
          <div class="q-options">
            <button
              v-for="option in question.options"
              :key="option.id"
              class="q-option"
              :class="{
                picked: picked.includes(option.id),
                right: attempt?.correct && attempt.correctAnswer.kind === 'singleChoice' && attempt.correctAnswer.optionId === option.id,
                wrong: attempt && !attempt.correct && picked.includes(option.id),
              }"
              :disabled="!!attempt"
              @click="toggleOption(option.id)"
            >
              <span class="q-key">{{ option.text }}</span>
              <span v-if="attempt && attempt.correctAnswer.kind === 'singleChoice' && attempt.correctAnswer.optionId === option.id" class="q-badge">正确答案</span>
              <span v-else-if="attempt && !attempt.correct && picked.includes(option.id)" class="q-badge is-bad">你的选择</span>
            </button>
          </div>

          <div v-if="attempt" class="dash-notice" :class="attempt.correct ? 'is-right' : 'is-wrong'">
            <b>{{ attempt.correct ? '回答正确' : '回答错误' }}</b>
            · 得分 {{ attempt.score }} / {{ attempt.maxScore }}
            <p>{{ attempt.explanation.summary }}</p>
            <ul v-if="attempt.explanation.steps.length" class="rail-notes">
              <li v-for="(step, i) in attempt.explanation.steps" :key="i">{{ step }}</li>
            </ul>
          </div>

          <div class="question-actions">
            <button class="btn secondary" :disabled="index === 0" @click="prev">上一题</button>
            <button v-if="!attempt" class="btn" :disabled="busy || !picked.length" @click="submit">
              提交答案
            </button>
            <button v-else class="btn" :disabled="index >= total - 1" @click="next">下一题</button>
          </div>
        </template>
      </section>
    </div>

    <aside class="dash-rail">
      <section class="card rail-card">
        <div class="card-heading"><h2>练习概览</h2></div>
        <ul class="rail-stats">
          <li><span>本轮题目</span><b>{{ total || '—' }}</b></li>
          <li><span>已作答</span><b>{{ answered }}</b></li>
          <li><span>正确</span><b>{{ correctCount }}</b></li>
          <li><span>错题本</span><b>{{ wrongItems.length }}</b></li>
        </ul>
        <p class="muted small">
          {{ answered === 0 ? '还没有作答记录。' : `已完成 ${answered} / ${total} 题。` }}
        </p>
      </section>

      <section class="card rail-card">
        <div class="card-heading">
          <h2>错题本</h2>
          <span class="muted small">最近 5 条</span>
        </div>
        <p v-if="!wrongItems.length" class="muted small">还没有错题，先做一组练习吧。</p>
        <div v-else class="rail-list">
          <div v-for="item in wrongItems" :key="item.id" class="rail-item">
            <div>
              <b>{{ item.question.stem.slice(0, 18) }}…</b>
              <span>作答 {{ item.attemptCount }} 次 · {{ item.mastered ? '已掌握' : '待复习' }}</span>
            </div>
          </div>
        </div>
      </section>

      <section class="card rail-card">
        <div class="card-heading"><h2>让练习更有效</h2></div>
        <ul class="rail-notes">
          <li>先做每日一练，再用专项训练补薄弱知识点。</li>
          <li>错题按最近作答时间排列，优先复习反复错的。</li>
          <li>批改与解析来自接口，不理解时可在 AI 答疑追问。</li>
        </ul>
        <RouterLink to="/qa" class="btn secondary block">去 AI 答疑</RouterLink>
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
.question-stem {
  margin: 10px 0 12px;
  font-size: 13.5px;
  line-height: 1.75;
  color: #111827;
}
.q-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.q-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  text-align: left;
  font-size: 12.5px;
  color: #1f2937;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.q-option:hover:not(:disabled) {
  border-color: var(--c-accent-ring);
  background: #f8faff;
}
.q-option:disabled {
  cursor: default;
}
.q-key {
  flex: 1;
}
.q-badge {
  flex: 0 0 auto;
  font-size: 10.5px;
  color: #047857;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 999px;
  padding: 1px 8px;
}
.q-badge.is-bad {
  color: #b91c1c;
  background: #fef2f2;
  border-color: #fecaca;
}
.q-option.picked {
  border-color: var(--c-accent-ring);
  background: var(--c-accent-soft);
}
.q-option.right {
  border-color: #bbf7d0;
  background: #f0fdf4;
}
.q-option.wrong {
  border-color: #fecaca;
  background: #fef2f2;
}
.dash-notice.is-right {
  border-color: #bbf7d0;
  background: #f0fdf4;
  color: #047857;
}
.dash-notice.is-wrong {
  border-color: #fecaca;
  background: #fef2f2;
  color: #b91c1c;
}
.question-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}
</style>