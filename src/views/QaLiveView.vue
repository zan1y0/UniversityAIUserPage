<script setup lang="ts">
import { ref } from 'vue';
import { execute } from '../api/contract';
import { ApiError } from '../api/client';
import type { Conversation, QaMessage } from '../api/generated';

const subjectId = ref('');
const conversation = ref<Conversation | null>(null);
const messages = ref<QaMessage[]>([]);
const text = ref('');
const busy = ref(false);
const errorText = ref('');
const notice = ref('');

const statusText: Record<string, string> = {
  queued: '排队中',
  running: '生成中',
  completed: '已完成',
  failed: '失败',
  failed_retryable: '可重试',
  cancelled: '已取消',
};

function msg(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

async function loadMessages() {
  if (!conversation.value) return;
  const page = await execute('op040', {
    path: { id: conversation.value.id },
    query: { page: 1, pageSize: 50 },
  });
  messages.value = page.items;
}

async function send() {
  const question = text.value.trim();
  if (!question) return;
  if (!subjectId.value.trim()) {
    errorText.value = '请先填写学科 ID（来自练习或课程页的学科 UUID）';
    return;
  }
  busy.value = true;
  errorText.value = '';
  notice.value = '正在提交问题…';
  try {
    if (!conversation.value) {
      conversation.value = await execute(
        'op037',
        { body: { subjectId: subjectId.value.trim() } },
        { key: crypto.randomUUID() },
      );
    }
    const accepted = await execute(
      'op039',
      {
        path: { id: conversation.value.id },
        body: {
          subjectId: subjectId.value.trim(),
          text: question,
          requestId: crypto.randomUUID(),
          contextVersion: conversation.value.contextVersion,
        },
      },
      { key: crypto.randomUUID() },
    );
    notice.value = 'AI 正在整理思路…';
    text.value = '';
    for (let i = 0; i < 20; i += 1) {
      const result = await execute('op041', { path: { id: accepted.messageId } });
      const message =
        (result as unknown as { message?: QaMessage }).message ?? (result as unknown as QaMessage);
      if (message.status === 'completed') {
        notice.value = '';
        await loadMessages();
        return;
      }
      if (message.status === 'failed' || message.status === 'cancelled') throw new Error('答疑生成失败');
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    notice.value = '回答仍在生成，稍后刷新';
    await loadMessages();
  } catch (error) {
    errorText.value = msg(error, '答疑失败，请稍后重试');
    notice.value = '';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="dash-strip">
    <div class="strip-left">
      <span class="strip-dot"></span>AI 答疑<span class="strip-sep">·</span>引导式讲解
      <span class="strip-sep">·</span>{{ conversation ? '会话已建立' : '新会话' }}
    </div>
    <div class="strip-right">{{ notice || `${messages.length} 条消息` }}</div>
  </div>

  <div class="dash-kpi three">
    <div class="dash-kpi-item">
      <span>会话状态</span>
      <b class="dash-kpi-word">{{ conversation ? '进行中' : '未开始' }}</b>
      <em>{{ conversation ? `上下文版本 v${conversation.contextVersion}` : '提第一个问题即创建' }}</em>
    </div>
    <div class="dash-kpi-item">
      <span>消息数</span>
      <b>{{ messages.length }}<small>条</small></b>
      <em>含提问与回答</em>
    </div>
    <div class="dash-kpi-item">
      <span>回答方式</span>
      <b class="dash-kpi-word">先思路后答案</b>
      <em>可连续追问</em>
    </div>
  </div>

  <div class="dash-body">
    <div class="dash-main">
      <section class="card">
        <div class="card-heading"><h2>把问题说清楚</h2><span class="muted small">{{ notice }}</span></div>
        <label class="field">
          <span>学科 ID</span>
          <input v-model="subjectId" placeholder="学科 UUID（来自练习/课程页）" />
        </label>
        <label class="field">
          <span>题目或疑问</span>
          <textarea v-model="text" rows="4" placeholder="例如：求极限时什么时候可以用等价无穷小替换？"></textarea>
        </label>
        <button class="btn" :disabled="busy || !text.trim()" @click="send">
          {{ busy ? '生成中…' : '提交问题' }}
        </button>
        <p v-if="errorText" class="dash-error">{{ errorText }}</p>
      </section>

      <section class="card">
        <div class="card-heading"><h2>对话记录</h2><span class="muted small">{{ messages.length }} 条</span></div>
        <div v-if="!messages.length" class="dash-empty">
          <h3>还没有对话</h3>
          <p>提交第一个问题后，这里会按时间列出提问与回答。</p>
        </div>
        <div v-else class="qa-thread">
          <div v-for="m in messages" :key="m.id" class="qa-msg" :class="m.role">
            <div class="qa-role">
              {{ m.role === 'user' ? '我' : '研途 AI' }}
              <span class="tag">{{ statusText[m.status] || m.status }}</span>
            </div>
            <p class="qa-text">{{ m.inputText }}</p>
          </div>
        </div>
      </section>
    </div>

    <aside class="dash-rail">
      <section class="card rail-card">
        <div class="card-heading"><h2>从思路到理解</h2></div>
        <ol class="rail-steps">
          <li><b>先判断题型</b><span>题目在考哪个知识点。</span></li>
          <li><b>再给思路</b><span>先提示方法，不直接给答案。</span></li>
          <li><b>最后对照</b><span>自己写一遍再看完整解析。</span></li>
        </ol>
        <p class="muted small">同一个会话里可以连续追问，上下文会跟着累积。</p>
      </section>

      <section class="card rail-card">
        <div class="card-heading"><h2>下一步</h2></div>
        <RouterLink to="/practice" class="btn secondary block">去做同类题</RouterLink>
        <RouterLink to="/professional-courses" class="btn secondary block">回专业课看考点</RouterLink>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.block {
  width: 100%;
  margin: 8px 0 0;
}
.dash-error {
  margin: 8px 0 0;
  font-size: 11.5px;
  color: #b91c1c;
}
.qa-thread {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 420px;
  overflow: auto;
}
.qa-msg {
  padding: 10px 12px;
  font-size: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
}
.qa-msg.assistant {
  background: #f8fafc;
}
.qa-role {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #4f46e5;
}
.qa-text {
  margin: 0;
  line-height: 1.6;
  color: #374151;
  white-space: pre-wrap;
}
</style>