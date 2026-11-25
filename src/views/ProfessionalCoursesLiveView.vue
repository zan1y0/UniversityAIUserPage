<script setup lang="ts">
import { computed, ref } from 'vue';
import { execute } from '../api/contract';
import { ApiError } from '../api/client';
import type { KnowledgeNode, Question, Subject } from '../api/generated';

const disciplines = [
  { value: 'computer', label: '计算机' },
  { value: 'education', label: '教育学' },
  { value: 'economicsManagement', label: '经济管理' },
  { value: 'medicine', label: '医学' },
] as const;
type Discipline = (typeof disciplines)[number]['value'];

const discipline = ref<Discipline>('computer');
const programId = ref('');
const year = ref(2026);
const subjects = ref<Subject[]>([]);
const subjectId = ref('');
const bookEdition = ref('');
const nodes = ref<KnowledgeNode[]>([]);
const questions = ref<Question[]>([]);
const busy = ref(false);
const errorText = ref('');
const notice = ref('');

const activeSubject = computed(() => subjects.value.find((s) => s.id === subjectId.value) ?? null);
const roots = computed(() => nodes.value.filter((n) => n.depth === 0));
const childrenOf = (id: string) => nodes.value.filter((n) => n.parentId === id);

function msg(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

async function loadSubjects() {
  busy.value = true;
  errorText.value = '';
  try {
    const list = await execute('op031', {
      query: {
        discipline: discipline.value,
        programId: programId.value.trim(),
        year: Number(year.value),
      },
    });
    subjects.value = list.items;
    if (!subjectId.value && list.items.length) {
      subjectId.value = list.items[0].id;
      await loadDetail();
    }
  } catch (error) {
    errorText.value = msg(error, '学科配置读取失败：请确认已选择院校专业（需要合法的专业 UUID）');
  } finally {
    busy.value = false;
  }
}

async function loadDetail() {
  if (!subjectId.value) return;
  busy.value = true;
  errorText.value = '';
  try {
    const tree = (await execute('op032', {
      query: {
        subjectId: subjectId.value,
        ...(bookEdition.value.trim() ? { bookEdition: bookEdition.value.trim() } : {}),
      },
    })) as unknown as { nodes: KnowledgeNode[] };
    nodes.value = tree.nodes;
    const page = await execute('op034', {
      query: { subjectId: subjectId.value, page: 1, pageSize: 8 },
    });
    questions.value = page.items;
  } catch (error) {
    errorText.value = msg(error, '知识体系或真题读取失败，请稍后重试');
  } finally {
    busy.value = false;
  }
}

async function explainQuestion(question: Question) {
  busy.value = true;
  errorText.value = '';
  notice.value = '正在生成真题讲解…';
  try {
    const accepted = await execute(
      'op035',
      { body: { questionVersionId: question.versionId, level: 'standard' } },
      { key: crypto.randomUUID() },
    );
    for (let i = 0; i < 20; i += 1) {
      const job = await execute('op009', { path: { id: accepted.jobId } });
      if (job.status === 'completed') {
        notice.value = '讲解已生成，可在消息中心查看完整步骤';
        return;
      }
      if (job.status === 'failed' || job.status === 'cancelled') throw new Error('讲解生成失败');
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    notice.value = '讲解仍在生成，稍后重试';
  } catch (error) {
    errorText.value = msg(error, '真题讲解生成失败，请稍后重试');
    notice.value = '';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="dash-strip">
    <div class="strip-left">
      <span class="strip-dot"></span>专业课学习<span class="strip-sep">·</span>
      {{ disciplines.find((d) => d.value === discipline)?.label }}<span class="strip-sep">·</span>{{ year }}
    </div>
    <div class="strip-right">{{ subjects.length }} 个学科 · {{ questions.length }} 道真题</div>
  </div>

  <div class="dash-kpi three">
    <div class="dash-kpi-item">
      <span>学科方向</span>
      <b class="dash-kpi-word">{{ activeSubject ? activeSubject.name : '未选择' }}</b>
      <em>{{ activeSubject ? `${activeSubject.bookIds.length} 本参考书` : '先加载学科配置' }}</em>
    </div>
    <div class="dash-kpi-item">
      <span>知识单元</span>
      <b>{{ nodes.length }}<small>个</small></b>
      <em>{{ roots.length }} 个一级章节</em>
    </div>
    <div class="dash-kpi-item">
      <span>真题数量</span>
      <b>{{ questions.length }}<small>道</small></b>
      <em>{{ notice || '按学科与年份筛选' }}</em>
    </div>
  </div>

  <div class="dash-body">
    <div class="dash-main">
      <section class="card">
        <div class="card-heading"><h2>学科与大纲</h2><span class="muted small">{{ notice }}</span></div>
        <div class="dash-toolbar">
          <label class="field">
            <span>学科门类</span>
            <select v-model="discipline">
              <option v-for="d in disciplines" :key="d.value" :value="d.value">{{ d.label }}</option>
            </select>
          </label>
          <label class="field">
            <span>院校专业 ID</span>
            <input v-model="programId" placeholder="专业 UUID（来自择校）" />
          </label>
          <label class="field field-narrow">
            <span>年份</span>
            <input v-model.number="year" type="number" min="2000" max="2100" />
          </label>
          <button class="btn" :disabled="busy" @click="loadSubjects">加载学科</button>
        </div>
        <p v-if="errorText" class="dash-error">{{ errorText }}</p>
        <p v-if="!programId.trim()" class="dash-notice">
          学科配置按「院校专业」发布，需要先在智能择校里选中一所院校，再把专业 ID 带过来；这里不会伪造 ID。
        </p>
      </section>

      <section v-if="subjects.length" class="card">
        <div class="card-heading"><h2>选择学科</h2><span class="muted small">{{ subjects.length }} 个可选</span></div>
        <div class="dash-list">
          <button
            v-for="s in subjects"
            :key="s.id"
            class="dash-row subject-row"
            :class="{ active: s.id === subjectId }"
            @click="subjectId = s.id; loadDetail()"
          >
            <div class="dash-row-main">
              <div class="dash-row-title">{{ s.name }}</div>
              <div class="dash-row-meta">{{ s.discipline }} · {{ s.year }} · {{ s.bookIds.length }} 本参考书</div>
            </div>
          </button>
        </div>
      </section>

      <section v-if="nodes.length" class="card">
        <div class="card-heading"><h2>知识体系</h2><span class="muted small">{{ activeSubject?.name }}</span></div>
        <div class="dash-list">
          <template v-for="node in roots" :key="node.id">
            <div class="dash-row">
              <div class="dash-row-main">
                <div class="dash-row-title">{{ node.name }}</div>
                <div class="dash-row-meta">{{ childrenOf(node.id).length }} 个子知识点</div>
              </div>
            </div>
            <div v-for="child in childrenOf(node.id)" :key="child.id" class="dash-row child-row">
              <div class="dash-row-main">
                <div class="dash-row-title">{{ child.name }}</div>
                <div class="dash-row-meta">第 {{ child.depth }} 层</div>
              </div>
            </div>
          </template>
        </div>
      </section>

      <section v-if="questions.length" class="card">
        <div class="card-heading"><h2>历年真题</h2><span class="muted small">{{ questions.length }} 道</span></div>
        <div class="dash-list">
          <div v-for="q in questions" :key="q.id" class="dash-row">
            <div class="dash-row-main">
              <div class="dash-row-title">{{ q.stem.slice(0, 40) }}</div>
              <div class="dash-row-meta">{{ q.kind }} · {{ q.maxScore }} 分 · {{ q.difficulty }}</div>
            </div>
            <button class="btn secondary dash-row-btn" :disabled="busy" @click="explainQuestion(q)">看讲解</button>
          </div>
        </div>
      </section>

      <section v-if="!subjects.length && !nodes.length" class="card">
        <div class="dash-empty">
          <h3>还没有专业课数据</h3>
          <p>填好院校专业 ID 与年份后加载学科，再进入知识体系与真题。</p>
        </div>
      </section>
    </div>

    <aside class="dash-rail">
      <section class="card rail-card">
        <div class="card-heading"><h2>参考书与考点</h2></div>
        <p class="muted small">{{ activeSubject ? `共 ${activeSubject.bookIds.length} 本参考书` : '选择学科后显示' }}</p>
        <label class="field">
          <span>参考书版本</span>
          <input v-model="bookEdition" placeholder="例如：第 3 版（可选）" />
        </label>
        <button class="btn secondary block" :disabled="!subjectId || busy" @click="loadDetail">按版本重载</button>
      </section>

      <section class="card rail-card">
        <div class="card-heading"><h2>备考提醒</h2></div>
        <ul class="rail-notes">
          <li>专业课以院校指定参考书为准，版本不同章节会有差异。</li>
          <li>真题先做近三年，再往前倒推考点。</li>
          <li>看讲解前先自己写一遍思路，对照更有效。</li>
        </ul>
        <RouterLink to="/schools" class="btn secondary block">去选择院校</RouterLink>
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
.subject-row {
  width: 100%;
  text-align: left;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  cursor: pointer;
}
.subject-row.active {
  border-color: var(--c-accent-ring);
  background: var(--c-accent-soft);
}
.child-row {
  margin-left: 16px;
  background: #fbfbfe;
}
</style>