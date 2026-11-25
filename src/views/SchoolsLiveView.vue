<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { execute } from '../api/contract';
import { ApiError } from '../api/client';
import type { Program, ProgramComparison } from '../api/generated';

const year = ref(new Date().getFullYear() + 1);
const form = reactive({
  major: '计算机技术',
  region: '全部地区',
  score: 340,
  difficulty: 'all',
});
const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle');
const errorText = ref('');
const items = ref<Program[]>([]);
const total = ref(0);
const selected = ref<Program[]>([]);
const comparison = ref<ProgramComparison | null>(null);
const compareError = ref('');

const difficultyText: Record<string, string> = { easy: '稳妥', medium: '匹配', hard: '冲刺' };
const regions = ['全部地区', '华东', '华北', '华南', '华中', '西南', '西北', '东北'];

const candidateCount = computed(() => (status.value === 'ready' ? total.value : items.value.length));
const canCompare = computed(() => selected.value.length >= 2);

function metaOf(p: Program): string[] {
  return [
    p.region || '地区待补充',
    p.major || p.programName,
    p.admissionRatio ? `报录比 ${p.admissionRatio}:1` : '报录比待补充',
    p.scoreLine ? `分数线 ${p.scoreLine}` : '分数线待补充',
  ];
}

async function search() {
  status.value = 'loading';
  errorText.value = '';
  try {
    const query: {
      year: number;
      major?: string;
      region?: string;
      score?: number;
      difficulty?: 'easy' | 'medium' | 'hard';
      page?: number;
      pageSize?: number;
    } = { year: year.value, page: 1, pageSize: 20 };
    if (form.major.trim()) query.major = form.major.trim();
    if (form.region !== '全部地区') query.region = form.region;
    if (form.score) query.score = Number(form.score);
    if (form.difficulty !== 'all') query.difficulty = form.difficulty as 'easy' | 'medium' | 'hard';
    const data = await execute('op019', { query });
    items.value = data.items;
    total.value = data.total;
    comparison.value = null;
    status.value = 'ready';
  } catch (error) {
    errorText.value = error instanceof ApiError ? error.message : '查询失败，请稍后重试';
    status.value = 'error';
  }
}

function toggle(p: Program) {
  const index = selected.value.findIndex((p2) => p2.id === p.id);
  if (index >= 0) selected.value.splice(index, 1);
  else if (selected.value.length < 4) selected.value.push(p);
}

function isSelected(p: Program) {
  return selected.value.some((p2) => p2.id === p.id);
}

async function compare() {
  if (!canCompare.value) return;
  compareError.value = '';
  try {
    comparison.value = await execute('op022', {
      body: { programIds: selected.value.map((p) => p.id), year: year.value },
    });
  } catch (error) {
    compareError.value = error instanceof ApiError ? error.message : '对比失败，请稍后重试';
  }
}

onMounted(search);
</script>

<template>
  <div class="dash-strip">
    <div class="strip-left">
      <span class="strip-dot"></span>择校分析<span class="strip-sep">·</span>
      {{ form.major || '未填专业' }}<span class="strip-sep">·</span>参考分 {{ form.score || '未填' }}
    </div>
    <div class="strip-right">已选 {{ selected.length }} / 4 所对比</div>
  </div>

  <div class="dash-kpi three">
    <div class="dash-kpi-item">
      <span>候选院校</span>
      <b>{{ candidateCount }}<small>所</small></b>
      <em>当前筛选条件下</em>
    </div>
    <div class="dash-kpi-item">
      <span>参考分数</span>
      <b>{{ form.score || '—' }}<small>分</small></b>
      <em>可随时调整后重筛</em>
    </div>
    <div class="dash-kpi-item">
      <span>已加入对比</span>
      <b>{{ selected.length }}<small>所</small></b>
      <em>最多同时对比 4 所</em>
    </div>
  </div>

  <div class="dash-body">
    <div class="dash-main">
      <section class="card">
        <div class="card-heading">
          <h2>筛选条件</h2>
          <button class="btn" :disabled="status === 'loading'" @click="search">
            {{ status === 'loading' ? '查询中…' : '查询推荐' }}
          </button>
        </div>
        <div class="dash-toolbar">
          <label class="field">
            <span>本科 / 目标专业</span>
            <input v-model="form.major" placeholder="例如：计算机技术" />
          </label>
          <label class="field">
            <span>参考分数</span>
            <input v-model.number="form.score" type="number" min="0" max="500" />
          </label>
          <label class="field">
            <span>意向地区</span>
            <select v-model="form.region">
              <option v-for="r in regions" :key="r" :value="r">{{ r }}</option>
            </select>
          </label>
          <label class="field">
            <span>目标梯度</span>
            <select v-model="form.difficulty">
              <option value="all">全部梯度</option>
              <option value="easy">稳妥</option>
              <option value="medium">匹配</option>
              <option value="hard">冲刺</option>
            </select>
          </label>
          <label class="field field-narrow">
            <span>招生年份</span>
            <input v-model.number="year" type="number" min="2000" max="2100" />
          </label>
        </div>
        <p class="dash-notice">
          分数与报录比来自接口返回的院校库；缺失字段会标记为「待补充」，不参与推断。
        </p>
      </section>

      <section class="card">
        <div class="card-heading">
          <h2>院校推荐</h2>
          <span class="muted small">{{ items.length }} 条 · 按接口返回顺序</span>
        </div>
        <div v-if="status === 'error'" class="dash-empty">
          <h3>这一次没有取到院校数据</h3>
          <p>{{ errorText }}</p>
          <button class="btn secondary" @click="search">重试</button>
        </div>
        <div v-else-if="status === 'loading'" class="dash-empty">
          <h3>正在按你的条件筛选</h3>
          <p>接口返回后会按分数线、招生人数与地区列出候选。</p>
        </div>
        <div v-else-if="!items.length" class="dash-empty">
          <h3>还没有查询结果</h3>
          <p>填写专业与参考分后点「查询推荐」，这里会按梯度列出院校。</p>
          <button class="btn" @click="search">查询推荐</button>
        </div>
        <div v-else class="dash-list">
          <div v-for="p in items" :key="p.id" class="dash-row">
            <div class="dash-row-main">
              <div class="dash-row-title">
                {{ p.schoolName }}
                <span class="tag">{{ difficultyText[p.difficulty] || p.difficulty }}</span>
              </div>
              <div class="dash-row-meta">{{ metaOf(p).join(' · ') }}</div>
            </div>
            <div class="dash-row-col">
              <span>参考线</span>
              <b>{{ p.scoreLine ?? '—' }}</b>
            </div>
            <div class="dash-row-col">
              <span>招生</span>
              <b>{{ p.enrollment ?? '—' }}</b>
            </div>
            <button
              class="btn secondary dash-row-btn"
              :class="{ 'is-on': isSelected(p) }"
              @click="toggle(p)"
            >
              {{ isSelected(p) ? '已加入' : '加入对比' }}
            </button>
          </div>
        </div>
      </section>

      <section v-if="comparison" class="card">
        <div class="card-heading">
          <h2>{{ comparison.year }} 年对比</h2>
          <button class="text-btn" @click="comparison = null">收起</button>
        </div>
        <div class="dash-list">
          <div v-for="fact in comparison.programs" :key="fact.program.id" class="dash-row">
            <div class="dash-row-main">
              <div class="dash-row-title">{{ fact.program.schoolName }}</div>
              <div class="dash-row-meta">
                {{
                  fact.metrics
                    .map(
                      (m) =>
                        `${m.type === 'scoreLine' ? '分数线' : m.type === 'enrollment' ? '招生' : '报录比'} ${m.value ?? '待补充'}（${m.year}）`,
                    )
                    .join(' · ') || '接口未返回历史指标'
                }}
              </div>
            </div>
            <div v-if="fact.missingFields.length" class="dash-row-meta">
              缺 {{ fact.missingFields.join('、') }}
            </div>
          </div>
        </div>
      </section>
    </div>

    <aside class="dash-rail">
      <section class="card rail-card">
        <div class="card-heading">
          <h2>对比清单</h2>
          <span class="muted small">{{ selected.length }} / 4</span>
        </div>
        <p v-if="!selected.length" class="muted small">
          还没有加入院校。在左侧列表点「加入对比」，最多 4 所。
        </p>
        <div v-else class="rail-list">
          <div v-for="p in selected" :key="p.id" class="rail-item">
            <div>
              <b>{{ p.schoolName }}</b>
              <span>{{ p.programName }}</span>
            </div>
            <button class="text-btn" @click="toggle(p)">移除</button>
          </div>
        </div>
        <button class="btn secondary block" :disabled="!canCompare" @click="compare">
          查看对比
        </button>
        <p v-if="compareError" class="dash-error">{{ compareError }}</p>
        <p v-else-if="selected.length === 1" class="muted small">至少选 2 所才能对比。</p>
      </section>

      <section class="card rail-card">
        <div class="card-heading"><h2>择校提醒</h2></div>
        <ul class="rail-notes">
          <li>分数线为院校公开信息，以当年公告为准。</li>
          <li>报录比反映竞争强度，不代表个人录取概率。</li>
          <li>冲刺 / 稳妥 / 保底建议各选 1–2 所，形成梯度。</li>
        </ul>
        <RouterLink to="/planning" class="btn secondary block">去定制学习计划</RouterLink>
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
  flex: 0 0 120px;
}
.is-on {
  border-color: var(--c-accent) !important;
  color: var(--c-accent-dark) !important;
  background: var(--c-accent-soft) !important;
}
</style>