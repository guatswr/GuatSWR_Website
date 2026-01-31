<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const loading = ref(false)
const list = ref([])
const total = ref(0)
const query = ref({
  page: 1,
  limit: 20
})

// 加载待审核列表
const fetchList = async () => {
  loading.value = true
  try {
    // 调用我们在 admin.js 中新增的接口
    const res = await axios.get('/api/admin/events/pending', { params: query.value })
    list.value = res.data.items
    total.value = res.data.total
  } catch (error) {
    ElMessage.error('加载失败: ' + (error.response?.data?.message || error.message))
  } finally {
    loading.value = false
  }
}

// 审核操作
const handleReview = (item, action) => {
  const actionText = action === 'approve' ? '通过' : '驳回'
  const confirmType = action === 'approve' ? 'success' : 'warning'
  
  ElMessageBox.confirm(
    `确定要${actionText}这个提交吗？`,
    '审核确认',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: confirmType
    }
  ).then(async () => {
    try {
      await axios.post(`/api/admin/events/${item.id}/review`, { action })
      ElMessage.success('操作成功')
      fetchList() // 刷新列表
    } catch (error) {
      ElMessage.error('操作失败: ' + (error.response?.data?.message || error.message))
    }
  }).catch(() => {})
}

// 物理删除
const handleDelete = (item) => {
  ElMessageBox.confirm(
    '此操作将永久删除该提交及其文件，不可恢复！是否继续？',
    '警告',
    {
      confirmButtonText: '永久删除',
      cancelButtonText: '取消',
      type: 'error'
    }
  ).then(async () => {
    try {
      await axios.delete(`/api/admin/events/${item.id}`)
      ElMessage.success('删除成功')
      fetchList()
    } catch (error) {
      ElMessage.error('删除失败: ' + (error.response?.data?.message || error.message))
    }
  }).catch(() => {})
}

// 分页
const handlePageChange = (val) => {
  query.value.page = val
  fetchList()
}

onMounted(() => {
  fetchList()
})
</script>

<template>
  <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-xl font-bold text-gray-800 dark:text-white">待审核事件</h2>
      <el-button @click="fetchList" :loading="loading" icon="Refresh" circle />
    </div>

    <el-table :data="list" v-loading="loading" style="width: 100%">
      <el-table-column prop="id" label="EID" width="80" />
      <el-table-column prop="type" label="类型" width="100">
        <template #default="{ row }">
          <el-tag>{{ row.type }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="title" label="标题" min-width="200" />
      <el-table-column label="详情预览" min-width="300">
        <template #default="{ row }">
          <div class="text-xs text-gray-500">
            <div v-if="row.content?.imageUrl">
              <a :href="row.content.imageUrl" target="_blank" class="text-blue-500 underline">查看图片</a>
            </div>
            <div v-if="row.content?.desc" class="truncate">
              {{ row.content.desc }}
            </div>
            <div v-else>无详细内容</div>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="提交时间" width="180">
        <template #default="{ row }">
          {{ new Date(row.created_at).toLocaleString() }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="success" @click="handleReview(row, 'approve')">通过</el-button>
          <el-button size="small" type="warning" @click="handleReview(row, 'reject')">驳回</el-button>
          <el-button size="small" type="danger" icon="Delete" circle @click="handleDelete(row)" />
        </template>
      </el-table-column>
    </el-table>

    <div class="flex justify-end mt-4">
      <el-pagination
        background
        layout="prev, pager, next"
        :total="total"
        :page-size="query.limit"
        @current-change="handlePageChange"
      />
    </div>
  </div>
</template>