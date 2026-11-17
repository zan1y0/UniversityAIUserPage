<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { notices } from '../data/demo';
import type { Notice } from '../domain/types';
import { useAppStore } from '../stores/app';
import { useStudyStore } from '../stores/study';
import { backend } from '../api/backend';
import { useLoad } from '../composables/useLoad';
import AsyncState from '../components/AsyncState.vue';
import AppIcon from '../components/AppIcon.vue';
const app = useAppStore();
const study = useStudyStore();
const { status, error, run } = useLoad();
const category = ref('全部');
const query = ref('');
const list = ref<Notice[]>(app.mode === 'demo' ? notices : []);
const selected = ref<string | null>(null);
const followedOnly = ref(false);
const filtered = computed(() =>
  list.value.filter(
    (n) =>
      (category.value === '全部' || n.category === category.value) &&
      n.title.includes(query.value) &&
      (!followedOnly.value || study.state.followed.includes(n.id)),
  ),
);
const important = computed(() => filtered.value.filter((n) => n.important).length);
async function load() {
  if (app.mode === 'live') {
    list.value = [];
    const data = await run(() => backend.notices(category.value));
    if (data) list.value = data;
  }
}
function follow(id: string) {
  if (app.mode !== 'demo') {
    app.notify('关注与推送接口尚未实现');
    return;
  }
  if (study.state.followed.includes(id))
    study.state.followed = study.state.followed.filter((v) => v !== id);
  else study.state.followed.push(id);
}
onMounted(load);
</script>
<template>
  <section class="dash-strip">
    <div class="strip-left">
      <strong>资讯与政策</strong>
      <span class="strip-dot">·</span>
      <span>重要事项与政策资讯</span>
    </div>
    <span class="strip-right">{{ filtered.length }} 条 · 关注 {{ study.state.followed.length }} 项</span>
  </section>

  <div class="dash-kpi">
    <div class="dash-kpi-item">
      <p>当前分类</p>
      <b class="dash-kpi-word">{{ category }}</b>
      <span>可切换分类筛选</span>
    </div>
    <div class="dash-kpi-item">
      <p>匹配资讯</p>
      <b>{{ filtered.length }}<small>条</small></b>
      <span>含关键词「{{ query || '不限' }}」</span>
    </div>
    <div class="dash-kpi-item">
      <p>优先核对</p>
      <b>{{ important }}<small>条</small></b>
      <span>标注为重要事项</span>
    </div>
    <div class="dash-kpi-item">
      <p>本地关注</p>
      <b>{{ study.state.followed.length }}<small>项</small></b>
      <span>仅记在本机</span>
    </div>
  </div>

  <div class="dash-body">
    <div class="dash-main">
      <section class="card">
        <div class="card-heading">
          <h2>筛选</h2>
          <span class="tag">来源可核验</span>
        </div>
        <form class="dash-toolbar news-toolbar" @submit.prevent="load">
          <label class="field"
            >资讯分类<select v-model="category" @change="load">
              <option
                v-for="c in ['全部', '报名提醒', '网上确认', '准考证', '初试提醒', '院校政策']"
                :key="c"
              >
                {{ c }}
              </option>
            </select></label
          >
          <label class="field"
            >搜索标题<input v-model="query" placeholder="输入关键词筛选" maxlength="100"
          /></label>
          <label class="inline-label"
            ><input v-model="followedOnly" type="checkbox" :disabled="app.mode === 'live'" />只看本地关注</label
          >
          <button class="btn secondary" :disabled="status === 'loading'">
            <AppIcon name="reset" :size="14" />刷新资讯
          </button>
        </form>
        <AsyncState :status="status" :error="error" @retry="load" />
      </section>

      <section class="card">
        <div class="card-heading">
          <h2>资讯列表</h2>
          <span class="muted small">按发布时间展示</span>
        </div>
        <div v-if="!filtered.length && status !== 'loading'" class="dash-empty">
          <span class="dash-empty-icon"><AppIcon name="bell" :size="20" /></span>
          <h3>暂无匹配资讯</h3>
          <p>试试其他分类或关键词，或者取消「只看本地关注」。</p>
        </div>
        <div v-else class="dash-list">
          <div v-for="n in filtered" :key="n.id" class="news-row">
            <div class="news-date">{{ n.date }}</div>
            <div class="news-body">
              <div class="news-title">
                <span class="tag" :class="n.important ? 'orange' : ''">{{ n.category }}</span>
                <h3>{{ n.title }}</h3>
                <span v-if="n.important" class="tag orange">优先核对</span>
              </div>
              <p class="news-meta">来源：{{ n.source }}</p>
              <p v-if="selected === n.id" class="reading">{{ n.content }}</p>
              <p v-else class="news-summary">{{ n.content.slice(0, 65) }}…</p>
            </div>
            <div class="news-actions">
              <button class="text-btn" @click="selected = selected === n.id ? null : n.id">
                {{ selected === n.id ? '收起' : '详情' }}
              </button>
              <button class="text-btn" @click="follow(n.id)">
                <AppIcon name="bell" :size="14" />{{
                  study.state.followed.includes(n.id) ? '已关注' : '关注'
                }}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <aside class="dash-rail">
      <section class="card">
        <div class="card-heading">
          <h2>备考事项清单</h2>
          <AppIcon name="calendar" :size="15" />
        </div>
        <ol class="rail-steps">
          <li>报名信息核对<em>日期待官方公告</em></li>
          <li>报考点确认材料<em>日期待官方公告</em></li>
          <li>准考证与考场信息<em>日期待官方公告</em></li>
          <li>初试时间与考试用品<em>日期待官方公告</em></li>
        </ol>
        <p class="muted small">演示不设置虚构官方日期。真实通知应包含来源、发布时间与版本。</p>
      </section>
      <section class="card">
        <div class="card-heading"><h2>提醒与订阅</h2></div>
        <p class="muted small">
          本地关注 {{ study.state.followed.length }}
          项演示事项。真实院校更新、政策变化和实时推送需后端轮询或事件通知。
        </p>
        <a
          class="btn secondary stretch"
          href="https://yz.chsi.com.cn/"
          target="_blank"
          rel="noopener noreferrer"
          >研招网<AppIcon name="arrow" :size="14"
        /></a>
      </section>
    </aside>
  </div>
</template>