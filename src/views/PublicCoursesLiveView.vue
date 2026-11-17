<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { execute } from '../api/contract';
import { ApiError } from '../api/client';
import type { KnowledgeNode } from '../api/generated';

type Subject = 'politics' | 'english' | 'math';
const subjects: { value: Subject; label: string }[] = [
  { value: 'politics', label: '政治' },
  { value: 'english', label: '英语' },
  { value: 'math', label: '数学' },
];
const pointTypes = [
  { value: 'highFrequency', label: '高频考点' },
  { value: 'errorProne', label: '易错点' },
  { value: 'memorize', label: '背诵点' },
] as const;

interface ExamPointItem {
  knowledgeId: string;
  title: string;
  type: string;
  content: string;
  sources: { title: string }[];
}
interface Explanation {
  kind: string;
  title: string;
  summary: string;
  steps: string[];
  hints: string[];
  method: string;
  modelVersion: string;
}

const subject = ref<Subject>('politics');
const examType = ref('考研大纲');
const year = ref(2026);
const nodes = ref<KnowledgeNode[]>([]);
const points = ref<ExamPointItem[]>([]);
const pointType = ref<(typeof pointTypes)[number]['value']>('highFrequency');
const level = ref<'basic' | 'standard' | 'advanced'>('standard');
const explanation = ref<Explanation | null>(null);
const activeId = ref('');
const busy = ref(false);
const errorText = ref('');
const notice = ref('');

const subjectLabel = computed(() => subjects.find((s) => s.value === subject.value)?.label ?? subject.value);
const roots = computed(() => nodes.value.filter((n) => n.depth === 0));
const activeNode = computed(() => nodes.value.find((n) => n.id === activeId.value) ?? null);
const childrenOf = (id: string) => nodes.value.filter((n) => n.parentId === id);

function uid(): string {
  return crypto.randomUUID();
}
function msg(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

async function load() {
  busy.value = true;
  errorText.value = '';
  explanation.value = null;
  try {
    const tree = await execute('op025', {
      query: { subject: subject.value, examType: examType.value.trim() || '考研大纲', year: Number(year.value) },
    });
    nodes.value = tree.nodes;
    activeId.value = tree.nodes[0]?.id ?? '';
    const examPoints = await execute('op027', { query: { subject: subject.value, type: pointType.value } });
    points.value = examPoints.items;
  } catch (error) {
    errorText.value = msg(error, '知识体系读取失败，请稍后重试');
  } finally {
    busy.value = false;
  }
}

async function loadPoints() {
  try {
    const examPoints = await execute('op027', { query: { subject: subject.value, type: pointType.value } });
    points.value = examPoints.items;
  } catch (error) {
    errorText.value = msg(error, '考点读取失败，请稍后重试');
  }
}

async function explain() {
  const node = activeNode.value;
  if (!node) return;
  busy.value = true;
  errorText.value = '';
  notice.value = '正在生成分层讲解…';
  try {
    const accepted = await execute(
      'op026',
      { body: { knowledgeId: node.id, level: level.value, version: 1 } },
      { key: uid() },
    );
    for (let i = 0; i < 20; i += 1) {
      const job = await execute('op009', { path: { id: accepted.jobId } });
      if (job.status === 'completed') {
        const result = job.result as unknown as Explanation | null;
        if (result && result.kind === 'explanation') {
          explanation.value = result;
          notice.value = '';
        } else {
          notice.value = '讲解已生成，但返回内容为空';
        }
        return;
      }
      if (job.status === 'failed' || job.status === 'cancelled') throw new Error('讲解生成失败');
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    notice.value = '讲解仍在生成，稍后重试';
  } catch (error) {
    errorText.value = msg(error, '讲解生成失败，请稍后重试');
    notice.value = '';
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="dash-strip">
    <div class="strip-left">
      <span class="strip-dot"></span>公共课学习<span class="strip-sep">·</span>{{ subjectLabel }}
      <span class="strip-sep">·</span>{{ examType }} {{ year }}
    </div>
    <div class="strip-right">{{ nodes.length }} 个知识点 · {{ points.length }} 个考点</div>
  </div>

  <div class="dash-kpi three">
    <div class="dash-kpi-item">
      <span>知识体系</span>
      <b>{{ nodes.length }}<small>个</small></b>
      <em>{{ roots.length }} 个章节</em>
    </div>
    <div class="dash-kpi-item">
      <span>当前考点</span>
      <b class="dash-kpi-word">{{ pointTypes.find((t) => t.value === pointType)?.label }}</b>
      <em>{{ points.length }} 条内容</em>
    </div>
    <div class="dash-kpi-item">
      <span>讲解层级</span>
      <b class="dash-kpi-word">{{ level === 'basic' ? '入门' : level === 'standard' ? '标准' : '进阶' }}</b>
      <em>按知识点分层生成</em>
    </div>
  </div>

  <div class="dash-body">
    <div class="dash-main">
      <section class="card">
        <div class="card-heading"><h2>选择科目</h2><span class="muted small">{{ notice }}</span></div>
        <div class="dash-toolbar">
          <label class="field">
            <span>科目</span>
            <select v-model="subject">
              <option v-for="s in subjects" :key="s.value" :value="s.value">{{ s.label }}</option>
            </select>
          </label>
          <label class="field">
            <span>大纲版本</span>
            <input v-model="examType" placeholder="考研大纲" />
          </label>
          <label class="field field-narrow">
            <span>年份</span>
            <input v-model.number="year" type="number" min="2000" max="2100" />
          </label>
          <button class="btn" :disabled="busy" @click="load">加载知识体系</button>
        </div>
        <p v-if="errorText" class="dash-error">{{ errorText }}</p>
      </section>

      <section class="card">
        <div class="card-heading">
          <h2>知识体系</h2>
          <span class="muted small">{{ activeNode ? activeNode.name : '未选择章节' }}</span>
        </div>
        <div v-if="!nodes.length" class="dash-empty">
          <h3>还没有知识体系</h3>
          <p>换一个科目或年份再试；内容由服务端按大纲版本发布。</p>
        </div>
        <div v-else class="dash-list">
          <template v-for="node in roots" :key="node.id">
            <button class="dash-row node-row" :class="{ active: node.id === activeId }" @click="activeId = node.id">
              <div class="dash-row-main">
                <div class="dash-row-title">{{ node.name }}</div>
                <div class="dash-row-meta">{{ childrenOf(node.id).length }} 个子知识点</div>
              </div>
            </button>
            <button
              v-for="child in childrenOf(node.id)"
              :key="child.id"
              class="dash-row node-row child"
              :class="{ active: child.id === activeId }"
              @click="activeId = child.id"
            >
              <div class="dash-row-main">
                <div class="dash-row-title">{{ child.name }}</div>
                <div class="dash-row-meta">第 {{ child.depth }} 层</div>
              </div>
            </button>
          </template>
        </div>
        <div class="dash-toolbar">
          <label class="field field-narrow">
            <span>讲解层级</span>
            <select v-model="level">
              <option value="basic">入门</option>
              <option value="standard">标准</option>
              <option value="advanced">进阶</option>
            </select>
          </label>
          <button class="btn" :disabled="busy || !activeNode" @click="explain">生成分层讲解</button>
        </div>
      </section>

      <section v-if="explanation" class="card">
        <div class="card-heading">
          <h2>{{ explanation.title }}</h2>
          <span class="muted small">{{ explanation.method }} · {{ explanation.modelVersion }}</span>
        </div>
        <p class="muted">{{ explanation.summary }}</p>
        <ol class="explain-steps">
          <li v-for="(step, index) in explanation.steps" :key="index">{{ step }}</li>
        </ol>
        <p v-if="explanation.hints.length" class="dash-notice">提示：{{ explanation.hints.join('；') }}</p>
      </section>
    </div>

    <aside class="dash-rail">
      <section class="card rail-card">
        <div class="card-heading"><h2>高频考点</h2></div>
        <select class="rail-select" v-model="pointType" @change="loadPoints">
          <option v-for="t in pointTypes" :key="t.value" :value="t.value">{{ t.label }}</option>
        </select>
        <p v-if="!points.length" class="muted small">暂无内容。</p>
        <ul v-else class="rail-notes">
          <li v-for="p in points.slice(0, 6)" :key="p.knowledgeId + p.title">
            <b>{{ p.title }}</b><br /><span class="muted">{{ p.content.slice(0, 60) }}</span>
          </li>
        </ul>
      </section>

      <section class="card rail-card">
        <div class="card-heading"><h2>学习建议</h2></div>
        <ul class="rail-notes">
          <li>先按章节把知识体系过一遍，再挑一层讲解。</li>
          <li>背诵点放在早上，易错点放在做题之后。</li>
          <li>讲解可以换层级重复生成，理解后再做同类题。</li>
        </ul>
        <RouterLink to="/practice" class="btn secondary block">去练几道题</RouterLink>
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
  flex: 0 0 110px;
}
.dash-error {
  margin: 8px 0 0;
  font-size: 11.5px;
  color: #b91c1c;
}
.node-row {
  width: 100%;
  text-align: left;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
}
.node-row.child {
  margin-left: 16px;
  background: #fbfbfe;
}
.node-row.active {
  border-color: #c7d2fe;
  background: #eef2ff;
}
.explain-steps {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.8;
  color: #374151;
}
.rail-select {
  width: 100%;
  height: 30px;
  margin-bottom: 8px;
  font-size: 11.5px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}
</style>