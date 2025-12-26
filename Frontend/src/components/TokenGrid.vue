<template>
  <div class="token-grid-container">
    <div ref="gridRef" class="token-grid">
      <div
        v-for="token in visibleTokens"
        :key="token"
        class="token-item"
        :class="getTokenClass(token)"
        @click="$emit('token-click', token)"
      >
        <div class="token-number">P{{ String(token).padStart(4, '0') }}</div>
        <div v-if="getAssignment(token)" class="token-athlete">
          {{ getAssignment(token).athleteBarcode }}
        </div>
        <div v-if="!getAssignment(token)" class="token-placeholder">
          Pick a token
        </div>
        <div v-if="getAssignment(token)" :ref="el => setQRRef(token, el)" class="token-qr"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick, inject } from 'vue'
import { useAppStore } from '../stores/app'
import { generateQRCode } from '../utils/qrcode'

defineEmits(['token-click'])

const store = useAppStore()
const gridRef = ref(null)
const qrRefs = ref(new Map())
const maxTokenToRender = ref(100)

const visibleTokens = computed(() => {
  const tokens = []
  for (let i = 1; i <= Math.min(store.event.nextToken + 10, maxTokenToRender.value); i++) {
    tokens.push(i)
  }
  return tokens
})

const getAssignment = (token) => {
  return store.assignments.find(a => a.token === token)
}

const getTokenClass = (token) => {
  const assignment = getAssignment(token)
  return {
    'has-assignment': !!assignment,
    'is-current': token === store.event.currentToken,
    'is-next': token === store.event.nextToken
  }
}

const setQRRef = (token, el) => {
  if (el) {
    qrRefs.value.set(token, el)
  }
}

const generateQRCodes = () => {
  nextTick(() => {
    store.assignments.forEach(assignment => {
      const element = qrRefs.value.get(assignment.token)
      if (element && element.children.length === 0) {
        const qrData = `P${String(assignment.token).padStart(4, '0')}${assignment.athleteBarcode ? ',' + assignment.athleteBarcode : ''}`
        generateQRCode(element, qrData, 128)
      }
    })
  })
}

watch(() => store.assignments, generateQRCodes, { deep: true })
watch(() => store.event.nextToken, generateQRCodes)

onMounted(() => {
  generateQRCodes()
})
</script>
