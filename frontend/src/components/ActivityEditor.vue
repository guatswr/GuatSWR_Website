<script setup>
import { ref, watch } from 'vue';
import { MdEditor } from 'md-editor-v3';
import 'md-editor-v3/lib/style.css';
import axios from 'axios';
import { compressImage } from '../utils/image';

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  activityId: {
    type: [String, Number],
    default: null
  },
  getActivityId: {
    type: Function,
    default: null
  }
});

const emits = defineEmits(['update:modelValue', 'onSave']);

const content = ref(props.modelValue);

// 监听父组件传值的变化 (例如回显编辑时)
watch(() => props.modelValue, (newVal) => {
  if (newVal !== content.value) {
    content.value = newVal;
  }
});

// 内容变化时通知父组件
const onChange = (v) => {
  content.value = v;
  emits('update:modelValue', v);
};

// 保存事件
const onSave = (v) => {
  emits('onSave', v);
};

// 图片上传处理
const onUploadImg = async (files, callback) => {
  let currentId = props.activityId;
  if (!currentId && props.getActivityId) {
    currentId = await props.getActivityId();
  }
  const res = await Promise.all(
    files.map(async (file) => {
      const compressed = await compressImage(file);
      const form = new FormData();
      form.append('file', compressed);
      const url = currentId ? `/api/upload?activityId=${currentId}` : '/api/upload';
      const resp = await axios.post(url, form);
      return resp.data.thumbUrl || resp.data.url;
    })
  );
  // 回调将图片 URL 插入文档
  callback(res);
};

// 导入 Markdown 文件功能
const fileInput = ref(null);
const triggerImport = () => {
  fileInput.value.click();
}
const handleFileImport = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    content.value = e.target.result;
    emits('update:modelValue', content.value);
  };
  reader.readAsText(file);
  // 清空 value 允许重复选择同一文件
  e.target.value = '';
}

// 工具栏配置
const toolbars = [
  'bold', 'underline', 'italic', '-', 
  'strikeThrough', 'title', 'sub', 'sup', 'quote', 'unorderedList', 'orderedList', 'task', '-', 
  'codeRow', 'code', 'link', 'image', 'table', 'mermaid', 'katex', '-', 
  'revoke', 'next', 'save', '=', 
  'pageFullscreen', 'fullscreen', 'preview', 'htmlPreview', 'catalog'
];
</script>

<template>
  <div class="flex flex-col gap-2">
    <!-- 顶部辅助栏 -->
    <div class="flex justify-between items-center bg-gray-50 p-2 rounded-t-md border border-b-0 border-gray-200">
      <span class="text-xs text-gray-500 font-bold ml-2">Markdown 编辑模式</span>
      <div>
        <input type="file" ref="fileInput" class="hidden" accept=".md,.txt" @change="handleFileImport">
        <button 
          @click="triggerImport" 
          type="button" 
          class="text-xs bg-white hover:bg-blue-50 text-blue-600 px-3 py-1.5 rounded border border-blue-200 transition flex items-center gap-1 shadow-sm"
        >
          📂 导入 Markdown 文件
        </button>
      </div>
    </div>

    <!-- 编辑器主体 -->
    <div class="border rounded-b-md overflow-hidden shadow-sm">
      <MdEditor 
        v-model="content" 
        @onChange="onChange" 
        @onUploadImg="onUploadImg" 
        @onSave="onSave"
        :toolbars="toolbars"
        language="zh-CN"
        :preview="true"
        :showCodeRowNumber="true"
        style="height: 600px;"
      />
    </div>
  </div>
</template>

<style scoped>
/* 可以在这里微调编辑器样式 */
</style>
