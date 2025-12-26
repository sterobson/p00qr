<template>
  <div v-if="isVisible" class="modal-backdrop">
    <div class="modal">
      <div class="modal-text">
        <div class="modal-icon">{{ icon }}</div>
        <p>{{ message }}</p>
      </div>
      <div class="modal-buttons">
        <button @click="handleOk">OK</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const isVisible = ref(false)
const message = ref('')
const icon = ref('⚠️')
const resolvePromise = ref(null)

const show = (msg, ico = '⚠️') => {
  message.value = msg
  icon.value = ico
  isVisible.value = true

  return new Promise((resolve) => {
    resolvePromise.value = resolve
  })
}

const handleOk = () => {
  isVisible.value = false
  if (resolvePromise.value) {
    resolvePromise.value()
    resolvePromise.value = null
  }
}

defineExpose({ show })
</script>
