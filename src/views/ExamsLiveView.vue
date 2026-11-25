<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { execute } from '../api/contract';
import { ApiError } from '../api/client';
import type { Answer, ExamResult, ExamSession, Paper, PaperPage, Question, Ranking } from '../api/generated';

const subjects = [
  { value: 'politics', label: '政治' },
  { value: 'english', label: '英语' },
  { value: 'math', label: '数学' },
] as const;
type Subject = (typeof subjects)[number]['value'];

const subject = ref<Subject>('politics');
const examType = ref('考研真题');
const yearText = ref('');
const papers = ref<Paper[]>([]);
const session = ref<ExamSession | null>(null);
const result = ref<ExamResult | null>(null);
const ranking = ref<Ranking | null>(null);
const answers = ref<Record<string, Answer>>({});
const versions = ref<Record<string, number>>({});
const activeId = ref('');
const remaining = ref(0);
const busy = ref(false);
const errorText = ref('');
const notice = ref('');
let clock = 0;
let offset = 0;

const stage = computed<'list' | 'taking' | 'scoring' | 'done'>(() => {
  if (result.value && result.value.scoringStatus !== 'queued' && result.value.scoringStatus !== 'running')
    return 'done';
  if (result.value) return 'scoring';
  if (session.value) return 'taking';
  return 'list';
});
const answeredCount = computed(() => Object.keys(answers.value).length);
const totalQuestions = computed(() => session.value?.questions.length ?? 0);
const currentIndex = computed(() => {
  const list = session.value?.questions ?? [];
  return list.findIndex((q) => q.id === activeId.value);
});
const clockText = computed(() => {
  const s = Math.max(0, remaining.value);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
});
const active = computed<Question | null>(
  () => session.value?.questions.find((q) => q.id === activeId.value) ?? null,
);
const subjectLabel = computed(
  () => subjects.find((s) => s.value === subject.value)?.label ?? subject.value,
);

function uid(): string {
  return crypto.randomUUID();
}

function message(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function savedOf(questionId: string): { answer: Answer; version: number } | null {
  const fromServer = session.value?.answers.find((a) => a.questionId === questionId);
  if (fromServer) return { answer: fromServer.answer, version: fromServer.version };
  const local = answers.value[questionId];
  return local ? { answer: local, version: versions.value[questionId] ?? session.value?.version ?? 1 } : null;
}

function tick() {
  if (!session.value) return;
  const deadline = Date.parse(session.value.deadlineAt);
  remaining.value = Math.floor((deadline - (Date.now() - offset)) / 1000);
}

async function search() {
  busy.value = true;
  errorText.value = '';
  try {
    const query = {
      subject: subject.value,
      examType: examType.value.trim() || '考研真题',
      ...(yearText.value ? { year: Number(yearText.value) } : {}),
    };
    const page = (await execute('op057', { query })) as unknown as PaperPage;
    papers.value = page.items;
  } catch (error) {
    errorText.value = message(error, '试卷读取失败，请稍后重试');
  } finally {
    busy.value = false;
  }
}

async function start(paper: Paper) {
  busy.value = true;
  errorText.value = '';
  notice.value = '';
  try {
    const created = await execute(
      'op058',
      { body: { paperVersionId: paper.versionId, requestId: uid() } },
      { key: uid() },
    );
    session.value = created;
    answers.value = {};
    versions.value = {};
    for (const saved of created.answers) {
      answers.value[saved.questionId] = saved.answer;
      versions.value[saved.questionId] = saved.version;
    }
    result.value = null;
    ranking.value = null;
    activeId.value = created.questions[0]?.id ?? '';
    offset = Date.now() - Date.parse(created.serverTime);
    tick();
    clock = window.setInterval(tick, 1000);
  } catch (error) {
    errorText.value = message(error, '开始模考失败，请稍后重试');
  } finally {
    busy.value = false;
  }
}

function choose(question: Question, optionId: string) {
  if (question.kind === 'multipleChoice') {
    const current = answers.value[question.id];
    const picked = current && current.kind === 'multipleChoice' ? [...current.optionIds] : [];
    const next = picked.includes(optionId)
      ? picked.filter((id) => id !== optionId)
      : [...picked, optionId];
    if (!next.length) return;
    answers.value[question.id] = { kind: 'multipleChoice', optionIds: next };
  } else {
    answers.value[question.id] = { kind: 'singleChoice', optionId };
  }
  void save(question);
}

function isChosen(question: Question, optionId: string): boolean {
  const saved = savedOf(question.id);
  if (!saved) return false;
  if (saved.answer.kind === 'singleChoice') return saved.answer.optionId === optionId;
  if (saved.answer.kind === 'multipleChoice') return saved.answer.optionIds.includes(optionId);
  return false;
}

async function save(question: Question) {
  if (!session.value) return;
  const saved = savedOf(question.id);
  if (!saved) return;
  try {
    const stored = await execute(
      'op060',
      {
        path: { id: session.value.id, qid: question.id },
        body: { answer: saved.answer, version: saved.version, requestId: uid() },
      },
      { key: uid() },
    );
    versions.value[question.id] = stored.version;
    notice.value = `答案已保存 · ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`;
  } catch (error) {
    errorText.value = message(error, '答案保存失败，请检查网络后重试');
  }
}

async function submit() {
  if (!session.value) return;
  busy.value = true;
  errorText.value = '';
  try {
    const submitted = await execute(
      'op061',
      { path: { id: session.value.id }, body: { version: session.value.version } },
      { key: uid() },
    );
    if (submitted && typeof submitted === 'object' && 'scoringStatus' in submitted) {
      result.value = submitted as unknown as ExamResult;
    }
    if (clock) clearInterval(clock);
    await pollResult();
  } catch (error) {
    errorText.value = message(error, '交卷失败，请稍后重试');
  } finally {
    busy.value = false;
  }
}

async function pollResult() {
  if (!session.value) return;
  for (let i = 0; i < 15; i += 1) {
    const current = await execute('op062', { path: { id: session.value.id } });
    result.value = current;
    if (current.scoringStatus === 'completed' || current.scoringStatus === 'failed') break;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  if (result.value?.scoringStatus === 'completed') await loadRanking();
}

async function loadRanking() {
  if (!session.value) return;
  try {
    ranking.value = await execute('op063', {
      path: { id: session.value.id },
      query: { paperVersionId: session.value.paperVersionId },
    });
  } catch {
    ranking.value = null;
  }
}

function go(step: number) {
  const list = session.value?.questions ?? [];
  const index = list.findIndex((q) => q.id === activeId.value);
  const target = list[index + step];
  if (target) activeId.value = target.id;
}

function canGo(step: number): boolean {
  const list = session.value?.questions ?? [];
  const index = list.findIndex((q) => q.id === activeId.value);
  return index + step >= 0 && index + step < list.length;
}

function reset() {
  if (clock) clearInterval(clock);
  session.value = null;
  result.value = null;
  ranking.value = null;
  answers.value = {};
  versions.value = {};
  activeId.value = '';
  notice.value = '';
  void search();
}

onMounted(search);
onBeforeUnmount(() => {
  if (clock) clearInterval(clock);
});
</script>

<template>
  <div class="dash-strip">
    <div class="strip-left">
      <span class="strip-dot"></span>模考与估分<span class="strip-sep">·</span>{{ subjectLabel }}
      <span class="strip-sep">·</span>{{ examType }}
    </div>
    <div class="strip-right" :class="{ 'strip-warn': stage === 'taking' && remaining < 300 }">
      <template v-if="stage === 'taking'">剩余 {{ clockText }}</template>
      <template v-else-if="stage === 'scoring'">评分中…</template>
      <template v-else-if="stage === 'done'">已出分</template>
      <template v-else>{{ papers.length }} 份试卷</template>
    </div>
  </div>

  <div class="dash-kpi three">
    <div class="dash-kpi-item">
      <span>{{ stage === 'list' ? '可选试卷' : '本卷题量' }}</span>
      <b>{{ stage === 'list' ? papers.length : totalQuestions }}<small v-if="stage !== 'list'">题</small></b>
      <em>{{ stage === 'list' ? '按科目与年份筛选' : '客观题自动评分' }}</em>
    </div>
    <div class="dash-kpi-item">
      <span>{{ stage === 'list' ? '卷面时长' : '已作答' }}</span>
      <b v-if="stage === 'list'">{{ papers[0]?.durationMinutes ?? '—' }}<small>分</small></b>
      <b v-else>{{ answeredCount }}<small>/{{ totalQuestions }}</small></b>
      <em>{{ stage === 'list' ? '同一版本可匿名排名' : '每选一次自动保存' }}</em>
    </div>
    <div class="dash-kpi-item">
      <span>{{ stage === 'done' ? '本次得分' : stage === 'taking' ? '剩余时间' : '题量参考' }}</span>
      <b v-if="stage === 'done'">{{ result?.totalScore ?? '—' }}<small v-if="result?.totalScore != null">/{{ result?.maxScore }}</small></b>
      <b v-else-if="stage === 'taking'">{{ clockText }}</b>
      <b v-else>{{ papers[0]?.questionCount ?? '—' }}<small v-if="stage === 'list'">题</small></b>
      <em>{{ stage === 'done' ? '主观题按评分口径估算' : stage === 'taking' ? '倒计时结束自动交卷' : '题量参考' }}</em>
    </div>
  </div>

  <div class="dash-body">
    <div class="dash-main">
      <template v-if="stage === 'list'">
        <section class="card">
          <div class="card-heading"><h2>选择试卷</h2><span class="muted small">{{ papers.length }} 份可考</span></div>
          <div class="dash-toolbar">
            <label class="field">
              <span>科目</span>
              <select v-model="subject">
                <option v-for="s in subjects" :key="s.value" :value="s.value">{{ s.label }}</option>
              </select>
            </label>
            <label class="field">
              <span>试卷类型</span>
              <input v-model="examType" placeholder="例如：考研真题" />
            </label>
            <label class="field field-narrow">
              <span>年份（可选）</span>
              <input v-model="yearText" inputmode="numeric" placeholder="2026" />
            </label>
            <button class="btn" :disabled="busy" @click="search">查询试卷</button>
          </div>
          <p v-if="errorText" class="dash-error">{{ errorText }}</p>
          <div v-if="!papers.length" class="dash-empty">
            <h3>没有匹配的试卷</h3>
            <p>换一个科目或试卷类型再试；试卷由服务端按版本发布。</p>
          </div>
          <div v-else class="dash-list">
            <div v-for="paper in papers" :key="paper.id" class="dash-row">
              <div class="dash-row-main">
                <div class="dash-row-title">{{ paper.title }}</div>
                <div class="dash-row-meta">
                  {{ paper.subject }} · {{ paper.examType }} · {{ paper.year }} · {{ paper.questionCount }} 题 ·
                  {{ paper.durationMinutes }} 分钟 · 满分 {{ paper.maxScore }}
                </div>
              </div>
              <button class="btn secondary dash-row-btn" :disabled="busy" @click="start(paper)">开始模考</button>
            </div>
          </div>
        </section>
      </template>

      <template v-else-if="stage === 'taking' && active">
        <section class="card">
          <div class="card-heading">
            <h2>第 {{ currentIndex + 1 }} / {{ totalQuestions }} 题</h2>
            <span class="muted small">{{ active.kind }} · {{ active.maxScore }} 分</span>
          </div>
          <p class="question-head">{{ active.stem }}</p>
          <div class="dash-list">
            <button
              v-for="option in active.options"
              :key="option.id"
              class="option"
              :class="{ chosen: isChosen(active, option.id) }"
              @click="choose(active, option.id)"
            >
              <span class="option-key">{{ option.id }}</span>{{ option.text }}
            </button>
          </div>
          <div class="dash-toolbar">
            <button class="btn secondary" :disabled="!canGo(-1)" @click="go(-1)">
              上一题
            </button>
            <button class="btn secondary" :disabled="!canGo(1)" @click="go(1)">
              下一题
            </button>
            <span class="muted small">{{ notice }}</span>
          </div>
          <p v-if="errorText" class="dash-error">{{ errorText }}</p>
        </section>
      </template>

      <template v-else-if="stage === 'scoring'">
        <section class="card">
          <div class="card-heading"><h2>正在评分</h2><span class="muted small">异步评分</span></div>
          <p class="dash-notice">客观题即时判分，主观题按评分口径估算，出分后这里会自动更新。</p>
        </section>
      </template>

      <template v-else>
        <section class="card">
          <div class="card-heading"><h2>本次成绩</h2><span class="muted small">{{ result?.rubricVersion }}</span></div>
          <div class="exam-result">
            <div class="score-circle">
              <b>{{ result?.totalScore ?? '—' }}</b>
              <small>满分 {{ result?.maxScore ?? '—' }}</small>
            </div>
            <ul class="rail-stats exam-stats">
              <li><span>客观题</span><b>{{ result?.objectiveScore ?? '—' }}</b></li>
              <li><span>主观题估算</span><b>{{ result?.subjectiveEstimate ?? '—' }}</b></li>
              <li><span>已作答</span><b>{{ answeredCount }}/{{ totalQuestions }}</b></li>
              <li><span>我的排名</span><b>{{ ranking?.myRank ? `第 ${ranking.myRank} 名` : '—' }}</b></li>
            </ul>
          </div>
          <div v-if="result?.dimensions.length" class="dash-list">
            <div v-for="dim in result.dimensions" :key="dim.name" class="dash-row">
              <div class="dash-row-main">
                <div class="dash-row-title">{{ dim.name }}</div>
                <div class="dash-row-meta">{{ dim.feedback }}</div>
              </div>
              <span class="dash-row-col">{{ dim.score }}/{{ dim.maxScore }}</span>
            </div>
          </div>
          <div class="dash-toolbar">
            <button class="btn secondary" @click="reset">再考一场</button>
          </div>
        </section>
        <section v-if="ranking?.items.length" class="card">
          <div class="card-heading"><h2>同卷匿名排名</h2><span class="muted small">{{ ranking.sampleCount }} 人样本</span></div>
          <div class="dash-list">
            <div v-for="entry in ranking.items" :key="entry.rank" class="dash-row">
              <div class="dash-row-main">
                <div class="dash-row-title">第 {{ entry.rank }} 名 · {{ entry.anonymousName }}</div>
                <div class="dash-row-meta">{{ entry.submittedAt.slice(0, 16).replace('T', ' ') }}</div>
              </div>
              <span class="dash-row-col">{{ entry.score }} 分</span>
            </div>
          </div>
        </section>
      </template>
    </div>

    <aside class="dash-rail">
      <section v-if="stage === 'taking'" class="card rail-card">
        <div class="card-heading"><h2>答题卡</h2></div>
        <div class="answer-sheet">
          <button
            v-for="(q, index) in session?.questions"
            :key="q.id"
            class="sheet-dot"
            :class="{ done: !!savedOf(q.id), active: q.id === activeId }"
            @click="activeId = q.id"
          >
            {{ index + 1 }}
          </button>
        </div>
        <button class="btn block" :disabled="busy" @click="submit">交卷并评分</button>
        <p class="muted small">交卷后不再允许修改答案。</p>
      </section>

      <section v-if="stage === 'list'" class="card rail-card">
        <div class="card-heading"><h2>考前提醒</h2></div>
        <ul class="rail-notes">
          <li>开考后计时按服务端时间校准。</li>
          <li>每选一次自动保存，断网重进可恢复。</li>
          <li>交卷后客观题即时判分。</li>
        </ul>
      </section>

      <section v-if="stage === 'done'" class="card rail-card">
        <div class="card-heading"><h2>薄弱项</h2></div>
        <p v-if="!result?.weakSubjectIds.length" class="muted small">本次没有识别到明显薄弱科目。</p>
        <ul v-else class="rail-notes">
          <li v-for="id in result?.weakSubjectIds" :key="id">{{ id }}</li>
        </ul>
        <RouterLink to="/planning" class="btn secondary block">去调整学习计划</RouterLink>
      </section>

      <section class="card rail-card">
        <div class="card-heading"><h2>模考怎么用</h2></div>
        <ul class="rail-notes">
          <li>先用一套真题定基线，再按薄弱项排计划。</li>
          <li>每次模考都会生成成绩快照。</li>
          <li>排名只用同试卷版本样本，不做跨版本比较。</li>
        </ul>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.block {
  width: 100%;
  margin-top: 10px;
}
.field-narrow {
  flex: 0 0 130px;
}
.dash-error {
  margin: 8px 0 0;
  font-size: 11.5px;
  color: #b91c1c;
}
.dash-row-col {
  min-width: 64px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.stip-warn {
  color: #b45309;
}
.option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  font-size: 12.5px;
  text-align: left;
  color: #1f2937;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
}
.option:hover {
  border-color: var(--c-accent-ring);
}
.option.chosen {
  color: var(--c-accent-ink);
  background: var(--c-accent-soft);
  border-color: var(--c-accent-ring);
}
.option-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--c-accent);
  background: var(--c-accent-soft);
  border-radius: 6px;
}
.answer-sheet {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 12px;
}
.sheet-dot {
  height: 28px;
  font-size: 11px;
  color: #6b7280;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  cursor: pointer;
}
.sheet-dot.done {
  color: var(--c-accent-ink);
  background: var(--c-accent-soft);
  border-color: var(--c-accent-ring);
}
.sheet-dot.active {
  outline: 2px solid var(--c-accent);
  outline-offset: 1px;
}
</style>