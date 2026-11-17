<script setup lang="ts">
import { ref } from 'vue';
import { execute } from '../api/contract';
import { ApiError } from '../api/client';
import type { Interview, InterviewGuidance, InterviewQuestion, InterviewReport, InterviewTurn } from '../api/generated';

const modes = [
  { value: 'professional', label: '专业课面试' },
  { value: 'english', label: '英语面试' },
  { value: 'pressure', label: '压力面' },
] as const;
type Mode = (typeof modes)[number]['value'];

const programId = ref('');
const mode = ref<Mode>('professional');
const language = ref<'zh-CN' | 'en-US'>('zh-CN');
const duration = ref(15);
const interview = ref<Interview | null>(null);
const question = ref<InterviewQuestion | null>(null);
const turns = ref<InterviewTurn[]>([]);
const report = ref<InterviewReport | null>(null);
const guidance = ref<InterviewGuidance | null>(null);
const answer = ref('');
const busy = ref(false);
const errorText = ref('');
const notice = ref('');

const statusText: Record<string, string> = {
  queued: '排队中',
  running: '生成中',
  completed: '已完成',
  failed: '失败',
  failed_retryable: '可重试',
};

function uid(): string {
  return crypto.randomUUID();
}
function msg(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

async function loadGuidance() {
  if (!programId.value.trim()) return;
  try {
    guidance.value = await execute('op070', {
      query: { type: 'etiquette', programId: programId.value.trim() },
    });
  } catch {
    guidance.value = null;
  }
}

async function start() {
  if (!programId.value.trim()) {
    errorText.value = '请先填写院校专业 ID（来自智能择校）';
    return;
  }
  busy.value = true;
  errorText.value = '';
  notice.value = '正在准备复试问题…';
  try {
    interview.value = await execute(
      'op065',
      {
        body: {
          programId: programId.value.trim(),
          mode: mode.value,
          language: language.value,
          duration: Number(duration.value),
          consent: true,
        },
      },
      { key: uid() },
    );
    question.value = interview.value.firstQuestion;
    turns.value = [];
    report.value = null;
    notice.value = '';
    void loadGuidance();
  } catch (error) {
    errorText.value = msg(error, '创建复试失败，请稍后重试');
    notice.value = '';
  } finally {
    busy.value = false;
  }
}

async function submitAnswer() {
  const content = answer.value.trim();
  if (!content || !interview.value) return;
  busy.value = true;
  errorText.value = '';
  notice.value = '正在生成追问…';
  try {
    const accepted = await execute(
      'op066',
      { path: { id: interview.value.id }, body: { text: content, requestId: uid() } },
      { key: uid() },
    );
    answer.value = '';
    for (let i = 0; i < 20; i += 1) {
      const job = await execute('op009', { path: { id: accepted.jobId } });
      if (job.status === 'completed') {
        const turn = job.result as unknown as InterviewTurn | null;
        if (turn && turn.kind === 'interviewTurn') {
          turns.value = [...turns.value, turn];
          question.value = turn.followup;
        }
        notice.value = '';
        return;
      }
      if (job.status === 'failed' || job.status === 'cancelled') throw new Error('追问生成失败');
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    notice.value = '追问仍在生成，稍后重试';
  } catch (error) {
    errorText.value = msg(error, '提交回答失败，请稍后重试');
    notice.value = '';
  } finally {
    busy.value = false;
  }
}

async function finish() {
  if (!interview.value) return;
  busy.value = true;
  errorText.value = '';
  notice.value = '正在生成面试总结…';
  try {
    const accepted = await execute(
      'op067',
      { path: { id: interview.value.id }, body: { version: interview.value.version } },
      { key: uid() },
    );
    for (let i = 0; i < 20; i += 1) {
      const job = await execute('op009', { path: { id: accepted.jobId } });
      if (job.status === 'completed') break;
      if (job.status === 'failed' || job.status === 'cancelled') throw new Error('总结生成失败');
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    for (let i = 0; i < 10; i += 1) {
      const current = await execute('op068', { path: { id: interview.value.id } });
      report.value = current;
      if (current.status === 'completed' || current.status === 'failed') break;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    notice.value = report.value?.status === 'completed' ? '' : '总结仍在生成，稍后刷新';
  } catch (error) {
    errorText.value = msg(error, '结束复试失败，请稍后重试');
    notice.value = '';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="dash-strip">
    <div class="strip-left">
      <span class="strip-dot"></span>复试训练<span class="strip-sep">·</span>
      {{ modes.find((m) => m.value === mode)?.label }}<span class="strip-sep">·</span>{{ duration }} 分钟
    </div>
    <div class="strip-right">{{ notice || (interview ? `已答 ${turns.length} 轮` : '未开始') }}</div>
  </div>

  <div class="dash-kpi three">
    <div class="dash-kpi-item">
      <span>训练模式</span>
      <b class="dash-kpi-word">{{ modes.find((m) => m.value === mode)?.label }}</b>
      <em>{{ language === 'zh-CN' ? '中文' : 'English' }}</em>
    </div>
    <div class="dash-kpi-item">
      <span>已答轮次</span>
      <b>{{ turns.length }}<small>轮</small></b>
      <em>每轮都会生成追问</em>
    </div>
    <div class="dash-kpi-item">
      <span>{{ report ? '总结状态' : '面试时长' }}</span>
      <b v-if="report" class="dash-kpi-word">{{ statusText[report.status] || report.status }}</b>
      <b v-else>{{ duration }}<small>分钟</small></b>
      <em>{{ report ? `评分口径 ${report.rubricVersion}` : '可按需提前结束' }}</em>
    </div>
  </div>

  <div class="dash-body">
    <div class="dash-main">
      <section v-if="!interview" class="card">
        <div class="card-heading"><h2>开始一场模拟面试</h2><span class="muted small">{{ notice }}</span></div>
        <div class="dash-toolbar">
          <label class="field">
            <span>院校专业 ID</span>
            <input v-model="programId" placeholder="专业 UUID（来自智能择校）" />
          </label>
          <label class="field">
            <span>模式</span>
            <select v-model="mode">
              <option v-for="m in modes" :key="m.value" :value="m.value">{{ m.label }}</option>
            </select>
          </label>
          <label class="field field-narrow">
            <span>时长</span>
            <input v-model.number="duration" type="number" min="5" max="60" />
          </label>
          <button class="btn" :disabled="busy" @click="start">开始复试</button>
        </div>
        <p v-if="errorText" class="dash-error">{{ errorText }}</p>
        <p class="dash-notice">面试由服务端按院校专业出题，回答后生成追问，结束后出维度评分与建议。</p>
      </section>

      <template v-else>
        <section class="card">
          <div class="card-heading">
            <h2>{{ question ? '当前问题' : '面试已结束' }}</h2>
            <span class="muted small">{{ interview.status === 'finished' ? '已结束' : '进行中' }}</span>
          </div>
          <p v-if="question" class="interview-prompt">{{ question.text }}</p>
          <p v-else class="muted">这场面试已经结束，可以查看总结或再开一场。</p>
          <label v-if="question" class="field">
            <span>你的回答</span>
            <textarea v-model="answer" rows="4" placeholder="先给结论，再补两点依据"></textarea>
          </label>
          <div class="dash-toolbar">
            <button v-if="question" class="btn" :disabled="busy || !answer.trim()" @click="submitAnswer">
              提交回答
            </button>
            <button class="btn secondary" :disabled="busy || !turns.length" @click="finish">结束并看总结</button>
          </div>
          <p v-if="errorText" class="dash-error">{{ errorText }}</p>
        </section>

        <section v-if="turns.length" class="card">
          <div class="card-heading"><h2>回答记录</h2><span class="muted small">{{ turns.length }} 轮</span></div>
          <div class="dash-list">
            <div v-for="turn in turns" :key="turn.id" class="dash-row">
              <div class="dash-row-main">
                <div class="dash-row-title">{{ turn.transcript.slice(0, 40) }}</div>
                <div class="dash-row-meta">{{ turn.suggestions.join('；') }}</div>
              </div>
            </div>
          </div>
        </section>

        <section v-if="report" class="card">
          <div class="card-heading"><h2>面试总结</h2><span class="muted small">{{ report.rubricVersion }}</span></div>
          <p class="muted">{{ report.summary || '总结生成中…' }}</p>
          <div v-if="report.dimensions.length" class="dash-list">
            <div v-for="dim in report.dimensions" :key="dim.name" class="dash-row">
              <div class="dash-row-main">
                <div class="dash-row-title">{{ dim.name }}</div>
                <div class="dash-row-meta">{{ dim.feedback }}</div>
              </div>
              <span class="dash-row-col">{{ dim.score }}/{{ dim.maxScore }}</span>
            </div>
          </div>
        </section>
      </template>
    </div>

    <aside class="dash-rail">
      <section class="card rail-card">
        <div class="card-heading"><h2>复试礼仪</h2></div>
        <p v-if="!guidance" class="muted small">填好专业 ID 后，开始面试时会加载礼仪与流程提示。</p>
        <template v-else>
          <p class="dash-kpi-word">{{ guidance.title }}</p>
          <p class="muted small">{{ guidance.content.slice(0, 160) }}</p>
        </template>
      </section>

      <section class="card rail-card">
        <div class="card-heading"><h2>从容表达的小步骤</h2></div>
        <ol class="rail-steps">
          <li><b>听清问题</b><span>没听清就礼貌确认一次。</span></li>
          <li><b>先给结论</b><span>再补两点依据或例子。</span></li>
          <li><b>收住时间</b><span>每问控制在 60–90 秒。</span></li>
        </ol>
      </section>

      <section class="card rail-card">
        <div class="card-heading"><h2>下一步</h2></div>
        <RouterLink to="/news" class="btn secondary block">看院校复试通知</RouterLink>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.block {
  width: 100%;
  margin-top: 8px;
}
.field-narrow {
  flex: 0 0 100px;
}
.dash-error {
  margin: 8px 0 0;
  font-size: 11.5px;
  color: #b91c1c;
}
.interview-prompt {
  margin: 4px 0 12px;
  font-size: 13px;
  line-height: 1.7;
  color: #111827;
}
</style>