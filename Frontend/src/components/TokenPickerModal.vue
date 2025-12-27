<template>
  <div v-if="isVisible" class="modal-backdrop">
    <div class="modal">
      <div class="modal-text">
        <h2>Pick a Token</h2>
        <p>Enter a token number to jump to:</p>
      </div>
      <div class="token-input-container">
        <input
          ref="tokenInput"
          v-model="tokenNumber"
          type="number"
          min="1"
          max="9999"
          placeholder="Enter token number (1-9999)"
          @keyup.enter="handleOk"
        />
      </div>
      <div class="modal-buttons">
        <button @click="handleOk">Ok</button>
        <button @click="handleCancel">Cancel</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'

const isVisible = ref(false)
const tokenNumber = ref('')
const resolvePromise = ref(null)
const tokenInput = ref(null)

const show = () => {
  tokenNumber.value = ''
  isVisible.value = true

  // Focus the input after the modal is shown
  nextTick(() => {
    if (tokenInput.value) {
      tokenInput.value.focus()
    }
  })

  return new Promise((resolve) => {
    resolvePromise.value = resolve
  })
}

const handleOk = () => {
  const token = parseInt(tokenNumber.value)
  if (token && token >= 1 && token <= 9999) {
    isVisible.value = false
    if (resolvePromise.value) {
      resolvePromise.value(token)
      resolvePromise.value = null
    }
  }
}

const handleCancel = () => {
  isVisible.value = false
  if (resolvePromise.value) {
    resolvePromise.value(null)
    resolvePromise.value = null
  }
}

defineExpose({ show })
</script>

<style scoped>
.token-input-container {
  margin: 1rem 0;
  width: 100%;
}

.token-input-container input {
  width: 100%;
  margin: 0;
  box-sizing: border-box;
}
</style>
