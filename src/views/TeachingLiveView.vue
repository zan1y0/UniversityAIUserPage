<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { execute } from '../api/contract';
import { ApiError } from '../api/client';
import { useAppStore } from '../stores/app';
import type { TeacherStudent, TeachingClass, TeachingTask } from '../api/generated';

const app = useAppStore();
const isTeacher = computed(() => app.user?.activeRole === 'TEACHER' || app.user?.activeRole === 'ADMIN');

const classes = ref<TeachingClass[]>([]);
const students = ref<TeacherStudent[]>([]);
const tasks = ref<TeachingTask[]>([]);
const busy = ref(false);
const errorText = ref('');
const notice = ref('');

const joinCode = ref('');
const submitText = ref('');
const submitTarget = ref('');

const form = ref({
  studentId: '',
  title: '',
  description: '',
  deadline: '',
  requiresSubmission: false,
});

const statusText: Record<string, string> = {
  pending: '待完成',
  submitted: '已提交',
  completed: '已完成',
  graded: '已评分',
  cancelled: '已取消',
};

const pendingCount = computed(() => tasks.value.filter((t) => t.status === 'pending').length);
const submittedCount = computed(
  () => tasks.value.filter((t) => t.status === 'submitted' || t.status === 'graded').length,
);

function msg(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}
function toIso(value: string): string {
  return value ? new Date(value).toISOString() : '';
}
function day(value: string): string {
  return value ? value.slice(0, 10) : '未设置';
}

async function load() {
  busy.value = true;
  errorText.value = '';
  try {
    if (isTeacher.value) {
      const [classList, studentList, taskList] = await Promise.all([
        execute('op101', {}),
        execute('op087', {}),
        execute('op089', {}),
      ]);
      classes.value = classList.items;
      students.value = studentList.items;
      tasks.value = taskList.items;
      if (!form.value.studentId && students.value.length) form.value.studentId = students.value[0].id;
    } else {
      const [classList, taskList] = await Promise.all([execute('op103', {}), execute('op095', {})]);
      classes.value = classList.items;
      tasks.value = taskList.items;
    }
  } catch (error) {
    errorText.value = msg(error, '教学数据读取失败，请稍后重试');
  } finally {
    busy.value = false;
  }
}

async function createTask() {
  if (!form.value.studentId || !form.value.title.trim() || !form.value.deadline) {
    errorText.value = '请填写学生、任务标题与截止时间';
    return;
  }
  busy.value = true;
  errorText.value = '';
  notice.value = '正在布置任务…';
  try {
    await execute('op090', {
      body: {
        studentId: form.value.studentId,
        title: form.value.title.trim(),
        description: form.value.description.trim() || '按课堂要求完成',
        deadline: toIso(form.value.deadline),
        requiresSubmission: form.value.requiresSubmission,
      },
    });
    form.value.title = '';
    form.value.description = '';
    form.value.deadline = '';
    notice.value = '任务已布置';
    await load();
  } catch (error) {
    errorText.value = msg(error, '布置任务失败，请稍后重试');
    notice.value = '';
  } finally {
    busy.value = false;
  }
}

async function cancelTask(task: TeachingTask) {
  busy.value = true;
  try {
    await execute('op091', { path: { id: task.id } });
    notice.value = '任务已取消';
    await load();
  } catch (error) {
    errorText.value = msg(error, '取消任务失败');
  } finally {
    busy.value = false;
  }
}

async function completeTask(task: TeachingTask) {
  busy.value = true;
  try {
    await execute('op096', { path: { id: task.id }, body: { version: task.version } });
    notice.value = '已标记完成';
    await load();
  } catch (error) {
    errorText.value = msg(error, '标记完成失败');
  } finally {
    busy.value = false;
  }
}

async function submitWork(taskId: string) {
  const content = submitText.value.trim();
  if (!content) {
    errorText.value = '请先填写作业内容';
    return;
  }
  const task = tasks.value.find((t) => t.id === taskId);
  if (!task) return;
  busy.value = true;
  try {
    await execute('op105', { path: { id: task.id }, body: { version: task.version, content } });
    notice.value = '作业已提交';
    submitText.value = '';
    submitTarget.value = '';
    await load();
  } catch (error) {
    errorText.value = msg(error, '提交作业失败');
  } finally {
    busy.value = false;
  }
}

async function joinClass() {
  const code = joinCode.value.trim();
  if (!code) return;
  busy.value = true;
  try {
    await execute('op104', { body: { code } });
    joinCode.value = '';
    notice.value = '已加入班级';
    await load();
  } catch (error) {
    errorText.value = msg(error, '加入班级失败，请确认班级编号');
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="dash-strip">
    <div class="strip-left">
      <span class="strip-dot"></span>老师与任务<span class="strip-sep">·</span>
      {{ isTeacher ? '教师端' : '学生端' }}
    </div>
    <div class="strip-right">{{ notice || `${classes.length} 个班级 · ${tasks.length} 个任务` }}</div>
  </div>

  <div class="dash-kpi three">
    <div class="dash-kpi-item">
      <span>{{ isTeacher ? '我的班级' : '已加入班级' }}</span>
      <b>{{ classes.length }}<small>个</small></b>
      <em>{{ isTeacher ? '可向班级布置任务' : '可用班级编号加入' }}</em>
    </div>
    <div class="dash-kpi-item">
      <span>任务总数</span>
      <b>{{ tasks.length }}<small>个</small></b>
      <em>待完成 {{ pendingCount }} 个</em>
    </div>
    <div class="dash-kpi-item">
      <span>{{ isTeacher ? '指导学生' : '已提交' }}</span>
      <b>{{ isTeacher ? students.length : submittedCount }}<small>{{ isTeacher ? '人' : '个' }}</small></b>
      <em>{{ isTeacher ? '授权后可见学习概况' : '等待批改或已评分' }}</em>
    </div>
  </div>

  <div class="dash-body">
    <div class="dash-main">
      <section v-if="isTeacher" class="card">
        <div class="card-heading"><h2>布置教学任务</h2><span class="muted small">{{ notice }}</span></div>
        <div class="dash-toolbar">
          <label class="field">
            <span>学生</span>
            <select v-model="form.studentId">
              <option value="">选择学生</option>
              <option v-for="s in students" :key="s.id" :value="s.id">{{ s.displayName }}</option>
            </select>
          </label>
          <label class="field">
            <span>任务标题</span>
            <input v-model="form.title" placeholder="例如：第三章课后题" />
          </label>
          <label class="field field-narrow">
            <span>截止时间</span>
            <input v-model="form.deadline" type="datetime-local" />
          </label>
          <button class="btn" :disabled="busy" @click="createTask">布置任务</button>
        </div>
        <label class="field">
          <span>任务说明</span>
          <textarea v-model="form.description" rows="2" placeholder="完成范围、提交要求"></textarea>
        </label>
        <label class="check-row">
          <input v-model="form.requiresSubmission" type="checkbox" />需要提交作业文本
        </label>
        <p v-if="errorText" class="dash-error">{{ errorText }}</p>
      </section>

      <section v-else class="card">
        <div class="card-heading"><h2>加入班级</h2><span class="muted small">{{ notice }}</span></div>
        <div class="dash-toolbar">
          <label class="field">
            <span>班级编号</span>
            <input v-model="joinCode" placeholder="向老师获取班级编号" />
          </label>
          <button class="btn" :disabled="busy || !joinCode.trim()" @click="joinClass">加入班级</button>
        </div>
        <p v-if="errorText" class="dash-error">{{ errorText }}</p>
      </section>

      <section class="card">
        <div class="card-heading">
          <h2>{{ isTeacher ? '我布置的任务' : '我的任务' }}</h2>
          <span class="muted small">{{ tasks.length }} 个</span>
        </div>
        <div v-if="!tasks.length" class="dash-empty">
          <h3>还没有任务</h3>
          <p>{{ isTeacher ? '选好学生与截止时间，布置第一个任务。' : '老师布置后会出现在这里。' }}</p>
        </div>
        <div v-else class="dash-list">
          <div v-for="task in tasks" :key="task.id" class="dash-row">
            <div class="dash-row-main">
              <div class="dash-row-title">{{ task.title }}</div>
              <div class="dash-row-meta">{{ task.description.slice(0, 50) }} · 截止 {{ day(task.deadline) }}</div>
            </div>
            <span class="dash-state" :class="task.status">{{ statusText[task.status] || task.status }}</span>
            <button
              v-if="isTeacher && task.status === 'pending'"
              class="btn secondary dash-row-btn"
              :disabled="busy"
              @click="cancelTask(task)"
            >
              取消
            </button>
            <button
              v-else-if="!isTeacher && task.status === 'pending' && !task.requiresSubmission"
              class="btn secondary dash-row-btn"
              :disabled="busy"
              @click="completeTask(task)"
            >
              标记完成
            </button>
            <button
              v-else-if="!isTeacher && task.status === 'pending'"
              class="btn secondary dash-row-btn"
              @click="submitTarget = submitTarget === task.id ? '' : task.id"
            >
              交作业
            </button>
          </div>
        </div>
        <div v-if="!isTeacher && submitTarget" class="submit-panel">
          <label class="field">
            <span>作业内容</span>
            <textarea v-model="submitText" rows="3" placeholder="粘贴或写入作业正文"></textarea>
          </label>
          <button class="btn" :disabled="busy" @click="submitWork(submitTarget)">提交作业</button>
        </div>
      </section>
    </div>

    <aside class="dash-rail">
      <section class="card rail-card">
        <div class="card-heading"><h2>{{ isTeacher ? '我的班级' : '已加入班级' }}</h2></div>
        <p v-if="!classes.length" class="muted small">{{ isTeacher ? '还没有创建班级。' : '还没有加入班级。' }}</p>
        <ul v-else class="rail-notes">
          <li v-for="c in classes" :key="c.id">
            <b>{{ c.name }}</b>
            <span class="muted">{{ c.memberCount }} 人 · 编号 {{ c.code }}</span>
          </li>
        </ul>
      </section>

      <section v-if="isTeacher" class="card rail-card">
        <div class="card-heading"><h2>我的学生</h2></div>
        <p v-if="!students.length" class="muted small">学生授权后出现在这里。</p>
        <ul v-else class="rail-notes">
          <li v-for="s in students" :key="s.id">
            <b>{{ s.displayName }}</b><span class="muted">{{ s.loginName }}</span>
          </li>
        </ul>
      </section>

      <section class="card rail-card">
        <div class="card-heading"><h2>下一步</h2></div>
        <RouterLink to="/dashboard" class="btn secondary block">看学习数据</RouterLink>
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
  flex: 0 0 180px;
}
.dash-error {
  margin: 8px 0 0;
  font-size: 11.5px;
  color: #b91c1c;
}
.check-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 11.5px;
  color: #4b5563;
}
.submit-panel {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed #e5e7eb;
}
</style>