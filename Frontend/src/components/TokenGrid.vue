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
        <div :ref="el => setQRRef(token, el)" class="token-qr"></div>
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
  const isPast = token <= maxAssignedToken

  return {
    'has-assignment': !!assignment,
    'is-current': token === store.event.currentToken,
    'is-next': token === store.event.nextToken,
    'is-past': isPast
  }
}

const setQRRef = (token, el) => {
  if (el) {
    console.log(`setQRRef: Token ${token} element attached`)
    qrRefs.value.set(token, el)
  } else {
    console.log(`setQRRef: Token ${token} element removed`)
    qrRefs.value.delete(token)
  }
}

const generateQRCodes = () => {
  nextTick(() => {
    console.log(`generateQRCodes: Processing ALL visible tokens`)
    console.log(`QR refs available for tokens:`, Array.from(qrRefs.value.keys()))

    // Generate QR codes for ALL visible tokens
    visibleTokens.value.forEach(token => {
      const element = qrRefs.value.get(token)
      if (element) {
        const assignment = getAssignment(token)
        // For assigned tokens: P0001,A123456
        // For unassigned tokens: P0001
        const qrData = `P${String(token).padStart(4, '0')}${assignment?.athleteBarcode ? ',' + assignment.athleteBarcode : ''}`
        console.log(`Generating QR for token ${token}: ${qrData}`)
        // Clear and regenerate to ensure QR code is always displayed
        element.innerHTML = ''
        generateQRCode(element, qrData, 128)
      } else {
        console.warn(`No QR element found for token ${token}`)
      }
    })
  })
}

watch(() => store.assignments, generateQRCodes, { deep: true })
watch(() => store.event.nextToken, generateQRCodes)
watch(visibleTokens, generateQRCodes)

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
