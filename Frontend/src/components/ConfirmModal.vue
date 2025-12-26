<template>
  <div v-if="isVisible" class="modal-backdrop">
    <div class="modal">
      <div class="modal-text">
        <div class="modal-icon">{{ icon }}</div>
        <p>{{ message }}</p>
      </div>
      <div class="modal-buttons">
        <button @click="handleConfirm">{{ confirmText }}</button>
        <button @click="handleCancel">{{ cancelText }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const isVisible = ref(false)
const message = ref('')
const icon = ref('⚠️')
const confirmText = ref('Yes')
const cancelText = ref('Cancel')
const resolvePromise = ref(null)

const show = (msg, ico = '⚠️', confirm = 'Yes', cancel = 'Cancel') => {
  message.value = msg
  icon.value = ico
  confirmText.value = confirm
  cancelText.value = cancel
  isVisible.value = true

  return new Promise((resolve) => {
    resolvePromise.value = resolve
  })
}

const handleConfirm = () => {
  isVisible.value = false
  if (resolvePromise.value) {
    resolvePromise.value(true)
    resolvePromise.value = null
  }
}

const handleCancel = () => {
  isVisible.value = false
  if (resolvePromise.value) {
    resolvePromise.value(false)
    resolvePromise.value = null
  }
}

defineExpose({ show })
</script>
