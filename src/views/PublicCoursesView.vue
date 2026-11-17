<script setup lang="ts">
import { computed, ref } from 'vue';
import { publicCourses } from '../data/demo';
import type { Subject } from '../domain/types';
import CourseLibrary from '../components/CourseLibrary.vue';
import AppIcon from '../components/AppIcon.vue';
import { useStudyStore } from '../stores/study';
const subject = ref<Subject>('数学');
const study = useStudyStore();
const units = computed(() => publicCourses[subject.value] || []);
const completed = computed(
  () => units.value.filter((u) => study.state.completedUnits.includes(u.id)).length,
);
const totalMinutes = computed(() => units.value.reduce((n, u) => n + u.duration, 0));
const progress = computed(() =>
  units.value.length ? Math.round((completed.value / units.value.length) * 100) : 0,
);
const next = computed(() => units.value.find((u) => !study.state.completedUnits.includes(u.id)));
</script>
<template>
  <section class="dash-strip">
    <div class="strip-left">
      <strong>{{ subject }} · 公共课</strong>
      <span class="strip-dot">·</span>
      <span>{{ units.length }} 个单元 · 预计 {{ totalMinutes }} 分钟</span>
    </div>
    <span class="strip-right">已完成 {{ completed }} / {{ units.length }} 个单元</span>
  </section>

  <div class="dash-kpi">
    <div class="dash-kpi-item">
      <p>单元总数</p>
      <b>{{ units.length }}<small>个</small></b>
      <span>{{ subject }} 公共课</span>
    </div>
    <div class="dash-kpi-item">
      <p>已完成</p>
      <b>{{ completed }}<small>个</small></b>
      <span>进度 {{ progress }}%</span>
    </div>
    <div class="dash-kpi-item">
      <p>预计总时长</p>
      <b>{{ totalMinutes }}<small>分钟</small></b>
      <span>按单元预计时长累加</span>
    </div>
    <div class="dash-kpi-item">
      <p>下一个单元</p>
      <b class="dash-kpi-word">{{ next ? next.title.slice(0, 8) : '已全部学完' }}</b>
      <span>{{ next ? `${next.duration} 分钟` : '可以复习已学内容' }}</span>
    </div>
  </div>

  <div class="dash-body">
    <div class="dash-main">
      <section class="card">
        <div class="card-heading">
          <h2>课程单元</h2>
          <div class="seg" role="group" aria-label="公共课科目">
            <button
              v-for="s in ['数学', '英语', '政治']"
              :key="s"
              class="seg-item"
              :class="{ active: subject === s }"
              @click="subject = s as Subject"
            >
              {{ s }}
            </button>
          </div>
        </div>
        <CourseLibrary :units="units" :subject="subject" />
      </section>
    </div>

    <aside class="dash-rail">
      <section class="card">
        <div class="card-heading">
          <h2>学习进度</h2>
          <span class="muted small">{{ progress }}%</span>
        </div>
        <div class="rail-progress">
          <div class="rail-bar"><i :style="{ width: `${progress}%` }" /></div>
          <p>已完成 {{ completed }} 个，还剩 {{ units.length - completed }} 个单元。</p>
        </div>
        <RouterLink
          v-if="next"
          class="btn stretch"
          :to="{ path: '/qa', query: { question: `请引导我理解${next.title}` } }"
          ><AppIcon name="chat" :size="15" />问懂下一个单元</RouterLink
        >
        <RouterLink v-else to="/practice" class="btn stretch"
          ><AppIcon name="pen" :size="15" />去做一组题</RouterLink
        >
      </section>

      <section class="card">
        <div class="card-heading"><h2>学习提示</h2></div>
        <ul class="rail-notes">
          <li>先看导图式要点，再回到教材原文核对。</li>
          <li>每个单元结束后用 3 道题检验理解。</li>
          <li>跟读与提问都可以随时暂停，进度只记在本机。</li>
        </ul>
        <RouterLink to="/planning" class="btn secondary stretch">调整我的学习计划</RouterLink>
      </section>
    </aside>
  </div>
</template>