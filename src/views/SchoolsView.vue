<script setup lang="ts">
import { computed, ref } from 'vue';
import { schools } from '../data/demo';
import type { School } from '../domain/types';
import { useAppStore } from '../stores/app';
import { useLoad } from '../composables/useLoad';
import { backend } from '../api/backend';
import AsyncState from '../components/AsyncState.vue';
import AppIcon from '../components/AppIcon.vue';
const app = useAppStore();
const { status, error, run } = useLoad();
const major = ref('计算机技术');
const score = ref(340);
const region = ref('全部地区');
const difficulty = ref('全部梯度');
const list = ref<School[]>(app.mode === 'demo' ? schools : []);
const selected = ref<string[]>([]);
const estimate = ref(false);
const filtered = computed(() =>
  list.value.filter(
    (s) =>
      (major.value === '全部专业' || s.major === major.value) &&
      (region.value === '全部地区' || s.region === region.value) &&
      (difficulty.value === '全部梯度' || s.difficulty === difficulty.value),
  ),
);
const comparison = computed(() => list.value.filter((s) => selected.value.includes(s.id)));
const scoreGap = computed(() => (s: School) => score.value - s.line);
async function search() {
  estimate.value = false;
  if (app.mode === 'live') {
    list.value = [];
    selected.value = [];
    const result = await run(() => backend.schools(major.value, score.value));
    if (result) list.value = result;
  } else app.notify(`已按专业、地区与梯度筛选 ${filtered.value.length} 所示例院校`);
}
function compare(id: string) {
  if (selected.value.includes(id)) selected.value = selected.value.filter((v) => v !== id);
  else if (selected.value.length < 4) selected.value.push(id);
  else app.notify('最多同时对比 4 所院校');
}
</script>
<template>
  <section class="dash-strip">
    <div class="strip-left">
      <strong>择校分析</strong>
      <span class="strip-dot">·</span>
      <span>参考分数 {{ score }} 分</span>
    </div>
    <span class="strip-right">已选 {{ selected.length }} / 4 所对比</span>
  </section>

  <div class="dash-kpi">
    <div class="dash-kpi-item">
      <p>候选院校</p>
      <b>{{ filtered.length }}<small>所</small></b>
      <span>当前筛选条件下</span>
    </div>
    <div class="dash-kpi-item">
      <p>参考分数</p>
      <b>{{ score }}<small>分</small></b>
      <span>可随时调整后重筛</span>
    </div>
    <div class="dash-kpi-item">
      <p>已加入对比</p>
      <b>{{ selected.length }}<small>所</small></b>
      <span>最多同时对比 4 所</span>
    </div>
    <div class="dash-kpi-item">
      <p>数据来源</p>
      <b class="dash-kpi-word">{{ app.mode === 'demo' ? '示例数据' : '真实接口' }}</b>
      <span>{{ app.mode === 'demo' ? '仅用于演示筛选流程' : '按专业与分数检索' }}</span>
    </div>
  </div>

  <div class="dash-body">
    <div class="dash-main">
      <section class="card">
        <div class="card-heading">
          <h2>筛选条件</h2>
          <span class="muted small">真实接口当前仅接收专业与分数；地区与梯度在返回结果中筛选</span>
        </div>
        <form class="dash-toolbar" @submit.prevent="search">
          <label class="field"
            >本科 / 目标专业<select v-model="major">
              <option
                v-for="m in ['计算机技术', '软件工程', '教育学', '工商管理', '临床医学', '全部专业']"
                :key="m"
              >
                {{ m }}
              </option>
            </select></label
          >
          <label class="field"
            >参考分数<input v-model.number="score" type="number" min="0" max="500" required
          /></label>
          <label class="field"
            >意向地区<select v-model="region">
              <option v-for="r in ['全部地区', '华东', '华北', '华南', '华中', '西部']" :key="r">
                {{ r }}
              </option>
            </select></label
          >
          <label class="field"
            >目标梯度<select v-model="difficulty">
              <option v-for="d in ['全部梯度', '冲刺', '稳妥', '保底']" :key="d">{{ d }}</option>
            </select></label
          >
          <button class="btn" :disabled="status === 'loading'">
            <AppIcon name="search" :size="15" />查看推荐
          </button>
        </form>
      </section>

      <AsyncState :status="status" :error="error" @retry="search" />

      <section class="card">
        <div class="card-heading">
          <h2>院校推荐</h2>
          <span class="muted small">{{ filtered.length }} 所 · 按参考线排序展示</span>
        </div>
        <div v-if="!filtered.length && status !== 'loading'" class="dash-empty">
          <span class="dash-empty-icon"><AppIcon name="school" :size="20" /></span>
          <h3>没有匹配的院校</h3>
          <p>试试放宽地区或梯度，或者换一个目标专业。</p>
        </div>
        <div v-else class="dash-list">
          <div v-for="s in filtered" :key="s.id" class="dash-row">
            <div class="dash-row-main">
              <div class="dash-row-title">
                {{ s.name }}
                <span
                  class="tag"
                  :class="s.difficulty === '冲刺' ? 'orange' : s.difficulty === '保底' ? 'green' : ''"
                  >{{ s.difficulty }}</span
                >
              </div>
              <p class="dash-row-meta">
                {{ s.region }} · {{ s.major }} · 报录比 {{ s.ratio }} · {{ s.scoreRange }}
              </p>
            </div>
            <div class="dash-row-col">
              <span>参考线</span>
              <b>{{ s.line }}</b>
            </div>
            <div class="dash-row-col">
              <span>招生</span>
              <b>{{ s.enrollment }}</b>
            </div>
            <div class="dash-row-col">
              <span>分数差</span>
              <b :class="scoreGap(s) >= 0 ? 'ok' : 'warn'"
                >{{ scoreGap(s) > 0 ? '+' : '' }}{{ scoreGap(s) }}</b
              >
            </div>
            <button
              class="btn secondary dash-row-btn"
              :class="{ light: selected.includes(s.id) }"
              @click="compare(s.id)"
            >
              {{ selected.includes(s.id) ? '已加入' : '加入对比' }}
            </button>
          </div>
        </div>
      </section>

      <section v-if="comparison.length" class="card">
        <div class="card-heading">
          <h2>院校对比</h2>
          <button class="text-btn" @click="selected = []">清空对比</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>指标</th>
                <th v-for="s in comparison" :key="s.id">{{ s.name }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in [
                  { key: 'major', title: '专业' },
                  { key: 'line', title: '分数线' },
                  { key: 'enrollment', title: '招生人数' },
                  { key: 'ratio', title: '报录比' },
                  { key: 'risk', title: '风险提示' },
                ]"
                :key="item.key"
              >
                <td>{{ item.title }}</td>
                <td v-for="s in comparison" :key="s.id">{{ s[item.key as keyof School] }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="dash-notice">
          <strong>录取概率暂不可计算</strong>
          <p>
            需要同口径的真实招生数据、考生信息与已验证模型。当前不提供虚构的录取百分比。{{
              app.mode === 'demo' ? '以下仅展示示例分数差及风险提示。' : ''
            }}
          </p>
          <p v-for="s in comparison" :key="s.id">
            {{ s.name }}：参考分数差 {{ score - s.line }} 分。{{ s.risk }}
          </p>
        </div>
      </section>
    </div>

    <aside class="dash-rail">
      <section class="card">
        <div class="card-heading">
          <h2>对比清单</h2>
          <button v-if="selected.length" class="text-btn" @click="selected = []">清空</button>
        </div>
        <div v-if="!comparison.length" class="rail-hint">
          还没有加入院校。<br />在左侧列表点「加入对比」，最多 4 所。
        </div>
        <ul v-else class="rail-list">
          <li v-for="s in comparison" :key="s.id">
            <div>
              <strong>{{ s.name }}</strong>
              <span>{{ s.line }} 分 · {{ s.enrollment }} 人</span>
            </div>
            <button class="icon-btn" :aria-label="`移除${s.name}`" @click="compare(s.id)">
              <AppIcon name="close" :size="14" />
            </button>
          </li>
        </ul>
        <button
          class="btn light stretch"
          :disabled="!comparison.length"
          @click="estimate = !estimate"
        >
          {{ estimate ? '收起录取评估' : '查看录取评估' }}
        </button>
      </section>

      <section class="card">
        <div class="card-heading"><h2>择校提醒</h2></div>
        <ul class="rail-notes">
          <li>分数线为公开信息整理，以院校当年公告为准。</li>
          <li>报录比反映竞争强度，不代表个人录取概率。</li>
          <li>冲刺 / 稳妥 / 保底建议各选 1–2 所，形成梯度。</li>
        </ul>
        <RouterLink to="/planning" class="btn secondary stretch">去定制学习计划</RouterLink>
      </section>
    </aside>
  </div>
</template>