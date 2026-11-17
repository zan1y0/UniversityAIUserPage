<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useAppStore } from '../stores/app';
import ChatPanel from '../components/ChatPanel.vue';
import AppIcon from '../components/AppIcon.vue';
const app = useAppStore();
const route = useRoute();
const subject = ref('数学');
const preview = ref('');
const filename = ref('');
const recognized = ref('');
const error = ref('');
const confirmed = ref(false);
const prompts = [
  '遇到极限题该怎样选择方法？',
  '如何拆解一道长难句？',
  '请帮我检查第一步解题思路',
  ...(typeof route.query.question === 'string' ? [route.query.question] : []),
];
function upload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  error.value = '';
  if (!file) return;
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  ) {
    error.value = '请选择不超过 10MB 的 JPG、PNG 或 WebP 图片。';
    input.value = '';
    return;
  }
  if (preview.value) URL.revokeObjectURL(preview.value);
  preview.value = URL.createObjectURL(file);
  filename.value = file.name;
  confirmed.value = false;
  recognized.value = '';
  input.value = '';
}
function remove() {
  if (preview.value) URL.revokeObjectURL(preview.value);
  preview.value = '';
  filename.value = '';
  recognized.value = '';
  confirmed.value = false;
}
onBeforeUnmount(remove);
</script>
<template>
  <section class="dash-strip">
    <div class="strip-left">
      <strong>{{ subject }} · 引导式答疑</strong>
      <span class="strip-dot">·</span>
      <span>先讲思路，再给方法</span>
    </div>
    <span class="strip-right">{{ confirmed ? '题干已确认' : preview ? '待确认题干' : '尚未附题' }}</span>
  </section>

  <div class="dash-kpi">
    <div class="dash-kpi-item">
      <p>答疑科目</p>
      <b class="dash-kpi-word">{{ subject }}</b>
      <span>可随时切换</span>
    </div>
    <div class="dash-kpi-item">
      <p>题目附件</p>
      <b class="dash-kpi-word">{{ preview ? filename || '已上传' : '无' }}</b>
      <span>{{ preview ? '仅在本机预览' : '可选 JPG / PNG / WebP' }}</span>
    </div>
    <div class="dash-kpi-item">
      <p>题干文字</p>
      <b class="dash-kpi-word">{{ confirmed ? '已确认' : recognized ? '待确认' : '未录入' }}</b>
      <span>{{ recognized.length }} / 4000 字</span>
    </div>
    <div class="dash-kpi-item">
      <p>回答方式</p>
      <b class="dash-kpi-word">引导式</b>
      <span>不直接给最终答案</span>
    </div>
  </div>

  <div class="dash-body">
    <div class="dash-main">
      <section class="card">
        <div class="card-heading">
          <h2>把问题说清楚</h2>
          <span class="tag">思路优先</span>
        </div>
        <div class="dash-toolbar qa-toolbar">
          <label class="field"
            >答疑科目<select v-model="subject">
              <option v-for="s in ['数学', '英语', '政治', '专业课']" :key="s">{{ s }}</option>
            </select></label
          >
          <label class="upload-label"
            ><AppIcon name="upload" :size="16" />上传题目图片<input
              class="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="上传题目图片"
              @change="upload"
            /></label
          >
          <span class="muted small">JPG / PNG / WebP · 最大 10MB</span>
        </div>
        <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
        <div v-if="preview" class="qa-attach">
          <div class="attachment">
            <img :src="preview" alt="待提问题目的本地预览" />
            <div>
              <p class="small">{{ filename }}</p>
              <p class="muted small">图片仅在本机预览，尚未上传。</p>
              <button class="text-btn" @click="remove">移除图片</button>
            </div>
          </div>
          <div class="dash-notice">
            演示模式只在本机预览图片，请自行录入并核对题干。真实模式使用图片上传、识别与人工确认流程；图片识别不等于直接获取答案。
          </div>
          <label class="field"
            >题目文字<textarea
              v-model="recognized"
              maxlength="4000"
              placeholder="请录入图片中的题目，核对公式、选项与已知条件"
              @input="confirmed = false"
            ></textarea>
          </label>
          <button
            class="btn secondary"
            :disabled="!recognized.trim()"
            @click="
              confirmed = true;
              app.notify('题目文字已确认，可在下方继续提问');
            "
          >
            {{ confirmed ? '题目文字已确认' : '确认题目文字' }}
          </button>
        </div>
      </section>
      <ChatPanel
        purpose="AI 引导式答疑"
        greeting="我们一起先分析题目条件和解题路径。把你的问题或已尝试的步骤告诉我吧。"
        :prompts="prompts"
        :context="`科目：${subject}。不要直接给最终答案，优先提供思路、步骤和方法。${confirmed ? `用户确认的题目文字：${recognized}` : ''}`"
      />
    </div>

    <aside class="dash-rail">
      <section class="card">
        <div class="card-heading">
          <h2>从思路到理解</h2>
          <AppIcon name="sparkles" :size="15" />
        </div>
        <ol class="rail-steps">
          <li>描述题目条件与目标</li>
          <li>说出你已经尝试的方法</li>
          <li>追问卡住的具体步骤</li>
          <li>用类似问题检验理解</li>
        </ol>
        <p class="muted small">
          真实 AI 内容可能出错，请核对公式与依据；真实模式按返回的来源核验，演示模式不会伪造资料出处。
        </p>
      </section>
      <section class="card">
        <div class="card-heading"><h2>答疑之后的下一步</h2></div>
        <p class="muted small">
          理解一个方法，再用练习巩固。把易错点沉淀下来，下一次就更有把握。
        </p>
        <RouterLink to="/practice" class="btn stretch"
          >前往专项训练<AppIcon name="arrow" :size="14"
        /></RouterLink>
        <RouterLink to="/planning" class="btn secondary stretch space-top">回到学习计划</RouterLink>
      </section>
    </aside>
  </div>
</template>