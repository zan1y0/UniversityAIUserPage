<script setup lang="ts">
import { computed, ref } from 'vue';
import { professionalCourses } from '../data/demo';
import CourseLibrary from '../components/CourseLibrary.vue';
import AppIcon from '../components/AppIcon.vue';
import LiveUnavailable from '../components/LiveUnavailable.vue';
import { useAppStore } from '../stores/app';
import { useStudyStore } from '../stores/study';
const app = useAppStore();
const study = useStudyStore();
const discipline = ref('计算机');
const course = computed(() => professionalCourses[discipline.value]!);
const completed = computed(
  () => course.value.units.filter((u) => study.state.completedUnits.includes(u.id)).length,
);
const totalMinutes = computed(() => course.value.units.reduce((n, u) => n + u.duration, 0));
</script>
<template>
  <section class="dash-strip">
    <div class="strip-left">
      <strong>{{ discipline }} · 专业课</strong>
      <span class="strip-dot">·</span>
      <span>{{ course.units.length }} 个知识单元 · 预计 {{ totalMinutes }} 分钟</span>
    </div>
    <span class="strip-right">已完成 {{ completed }} / {{ course.units.length }} 个单元</span>
  </section>

  <div class="dash-kpi">
    <div class="dash-kpi-item">
      <p>学科方向</p>
      <b class="dash-kpi-word">{{ discipline }}</b>
      <span>{{ Object.keys(professionalCourses).length }} 个方向可选</span>
    </div>
    <div class="dash-kpi-item">
      <p>知识单元</p>
      <b>{{ course.units.length }}<small>个</small></b>
      <span>重难点与真题思路</span>
    </div>
    <div class="dash-kpi-item">
      <p>参考书目</p>
      <b>{{ course.books.length }}<small>本</small></b>
      <span>方向参考，以院校目录为准</span>
    </div>
    <div class="dash-kpi-item">
      <p>已完成</p>
      <b>{{ completed }}<small>个</small></b>
      <span>进度只记在本机</span>
    </div>
  </div>

  <LiveUnavailable v-if="app.mode === 'live'" capability="专业知识体系与参考书资料" />

  <div v-else class="dash-body">
    <div class="dash-main">
      <section class="card">
        <div class="card-heading">
          <h2>知识体系</h2>
          <div class="seg" role="group" aria-label="专业学科">
            <button
              v-for="d in Object.keys(professionalCourses)"
              :key="d"
              class="seg-item"
              :class="{ active: discipline === d }"
              @click="discipline = d"
            >
              {{ d }}
            </button>
          </div>
        </div>
        <div class="dash-list">
          <div v-for="(unit, i) in course.units" :key="unit.id" class="dash-row prof-row">
            <span class="course-idx">{{ String(i + 1).padStart(2, '0') }}</span>
            <div class="dash-row-main">
              <div class="dash-row-title">{{ unit.title }}</div>
              <p class="dash-row-meta">{{ unit.points.join(' / ') }}</p>
            </div>
            <div class="dash-row-col">
              <span>时长</span>
              <b>{{ unit.duration }} 分</b>
            </div>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-heading">
          <h2>单元精讲</h2>
          <span class="muted small">点开单元可阅读讲解并标记学完</span>
        </div>
        <CourseLibrary :units="course.units" subject="专业课" />
      </section>
    </div>

    <aside class="dash-rail">
      <section class="card">
        <div class="card-heading">
          <h2>参考书与考点</h2>
          <AppIcon name="layers" :size="15" />
        </div>
        <ul class="rail-notes rail-books">
          <li v-for="book in course.books" :key="book">{{ book }}</li>
        </ul>
        <p class="muted small">
          此处列出学习方向，不代表目标院校指定书目。选择学校后，应核实正式专业目录、参考书版本及考试范围。
        </p>
        <RouterLink to="/schools" class="btn secondary stretch"
          >先确认目标院校<AppIcon name="arrow" :size="14"
        /></RouterLink>
      </section>

      <section class="card">
        <div class="card-heading"><h2>备考提醒</h2></div>
        <ul class="rail-notes">
          <li>考点预测入口使用有来源的历史考点分析，不生成虚构押题结果。</li>
          <li>专业课差异大，务必以目标院校当年大纲为准。</li>
        </ul>
        <RouterLink to="/practice" class="btn stretch"
          ><AppIcon name="pen" :size="15" />针对本章刷题</RouterLink
        >
      </section>
    </aside>
  </div>
</template>