<template>
  <div class="token-grid-container">
    <div ref="gridRef" class="token-grid">
      <div
        v-for="token in visibleTokens"
        :key="token"
        class="token-grid-item"
        :class="getTokenClass(token)"
        @click="$emit('token-click', token)"
      >
        <div class="token-number">P{{ String(token).padStart(4, '0') }}</div>
        <div v-if="!getAssignment(token)" class="token-placeholder">
          Pick a token
        </div>
        <div v-if="getAssignment(token)" :ref="el => setQRRef(token, el)" class="token-qr"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick, inject } from 'vue'
import { useAppStore } from '../stores/app'
import { generateQRCode } from '../utils/qrcode'

defineEmits(['token-click'])

const store = useAppStore()
const gridRef = ref(null)
const qrRefs = ref(new Map())
const maxTokenToRender = ref(50)

const visibleTokens = computed(() => {
  const tokens = []
  const limit = Math.max(maxTokenToRender.value, store.event.nextToken + 10)
  for (let i = 1; i <= limit; i++) {
    tokens.push(i)
  }
  return tokens
})

const getAssignment = (token) => {
  return store.assignments.find(a => a.token === token)
}

const getTokenClass = (token) => {
  const assignment = getAssignment(token)
  const maxAssignedToken = store.assignments.length > 0
    ? Math.max(...store.assignments.map(a => a.token))
    : 0
  const isPast = token < maxAssignedToken

  return {
    'has-assignment': !!assignment,
    'is-current': token === store.event.currentToken,
    'is-next': token === store.event.nextToken,
    'is-past': isPast
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
      if (element) {
        const qrData = `P${String(assignment.token).padStart(4, '0')}${assignment.athleteBarcode ? ',' + assignment.athleteBarcode : ''}`
        // Clear and regenerate to ensure QR code is always displayed
        element.innerHTML = ''
        generateQRCode(element, qrData, 128)
      }
    })
  })
}

watch(() => store.assignments, generateQRCodes, { deep: true })
watch(() => store.event.nextToken, generateQRCodes)

const handleScroll = () => {
  if (!gridRef.value) return

  const container = gridRef.value.parentElement
  if (!container) return

  const scrollPosition = container.scrollTop + container.clientHeight
  const scrollHeight = container.scrollHeight

  // Load more when within 500px of bottom
  if (scrollHeight - scrollPosition < 500) {
    maxTokenToRender.value += 50
  }
}

let scrollContainer = null

onMounted(() => {
  generateQRCodes()

  // Add scroll listener to container
  scrollContainer = gridRef.value?.parentElement
  if (scrollContainer) {
    scrollContainer.addEventListener('scroll', handleScroll)
  }
})

onUnmounted(() => {
  if (scrollContainer) {
    scrollContainer.removeEventListener('scroll', handleScroll)
  }
})
</script>
