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
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useAppStore } from '../stores/app'

const emit = defineEmits(['token-click'])

const store = useAppStore()
const gridRef = ref(null)
const qrRefs = ref(new Map())
const maxTokenToRender = ref(50)

const visibleTokens = computed(() => {
  const tokens = []
  // Show a reasonable window of tokens, expanding as needed
  const maxToken = Math.max(
    maxTokenToRender.value,
    store.event.nextToken + 10,
    store.event.currentToken || 0
  )

  for (let i = 1; i <= maxToken; i++) {
    tokens.push(i)
  }
  return tokens
})

const getAssignment = (token) => {
  return store.assignments.find(a => a.token === token)
}

const getTokenClass = (token) => {
  const assignment = getAssignment(token)
  // All tokens before nextToken are taken (gray)
  const isPast = token < store.event.nextToken

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
  } else {
    qrRefs.value.delete(token)
  }
}

const generateQRCodes = () => {
  nextTick(() => {
    // Use a simple placeholder pattern instead of generating real QR codes
    visibleTokens.value.forEach(token => {
      const element = qrRefs.value.get(token)
      if (element && !element.querySelector('.qr-placeholder')) {
        // Create a simple grid pattern as QR code placeholder
        element.innerHTML = '<div class="qr-placeholder"></div>'
      }
    })
  })
}

watch(() => store.assignments, generateQRCodes, { deep: true })
watch(() => store.event.nextToken, generateQRCodes)
watch(visibleTokens, generateQRCodes)

// Watch for when we return to the grid view and ensure nextToken is visible
watch(() => store.event.currentToken, (newCurrent, oldCurrent) => {
  // When returning to grid (currentToken goes from non-zero to zero)
  if (oldCurrent > 0 && newCurrent === 0) {
    // CRITICAL: Must wait for all transitions to complete before checking visibility.
    // If we check too early, the grid isn't fully rendered yet and getBoundingClientRect()
    // will return incorrect values, causing unnecessary scrolling.
    // The token-detail-leave-active transition is 300ms (see main.css line 656),
    // so we wait 350ms to ensure everything is settled.
    setTimeout(() => {
      checkAndScrollToNextToken()
    }, 350)
  }
})

// Watch for nextToken changes and scroll if needed (consistent behavior)
watch(() => store.event.nextToken, () => {
  // Only check if we're currently viewing the grid (not in detail view)
  if (store.event.currentToken === 0) {
    // CRITICAL: Must wait for DOM to update before checking visibility.
    // Vue's reactive updates are async, so checking immediately after nextToken changes
    // will measure the OLD token position, not the new one. 100ms is enough for
    // the reactive updates to settle and getBoundingClientRect() to be accurate.
    setTimeout(() => {
      checkAndScrollToNextToken()
    }, 100)
  }
})

const checkAndScrollToNextToken = () => {
  const nextToken = store.event.nextToken
  const container = gridRef.value?.parentElement
  if (!container || !gridRef.value) return

  const tokenElements = gridRef.value.querySelectorAll('.token-grid-item')
  const tokenIndex = visibleTokens.value.indexOf(nextToken)

  if (tokenIndex >= 0 && tokenIndex < tokenElements.length) {
    const element = tokenElements[tokenIndex]
    const rect = element.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()

    // Calculate how much of the token is visible within the viewport
    // visibilityRatio ranges from 0 (completely hidden) to 1 (fully visible)
    const visibleTop = Math.max(rect.top, containerRect.top)
    const visibleBottom = Math.min(rect.bottom, containerRect.bottom)
    const visibleHeight = Math.max(0, visibleBottom - visibleTop)
    const tokenHeight = rect.height
    const visibilityRatio = visibleHeight / tokenHeight

    // Only scroll if less than 80% of the token is visible
    // This prevents unnecessary scrolling when the token is adequately visible
    if (visibilityRatio < 0.8) {
      scrollToToken(nextToken)
    }
  } else {
    // Token not in visible range, scroll to it
    scrollToToken(nextToken)
  }
}

const scrollToToken = (token) => {
  nextTick(() => {
    // Make sure the token is in the visible range
    if (!visibleTokens.value.includes(token)) {
      // Expand the visible range to include this token
      const currentMax = Math.max(...visibleTokens.value)
      if (token > currentMax) {
        maxTokenToRender.value = Math.max(maxTokenToRender.value, token + 10)
      }
      // Wait for the next tick after updating the range
      nextTick(() => {
        performScroll(token)
      })
    } else {
      performScroll(token)
    }
  })
}

const performScroll = (token) => {
  // Find the token element
  const tokenElements = gridRef.value?.querySelectorAll('.token-grid-item')
  if (tokenElements) {
    // Calculate which index this token is at
    const tokenIndex = visibleTokens.value.indexOf(token)
    if (tokenIndex >= 0 && tokenIndex < tokenElements.length) {
      const element = tokenElements[tokenIndex]
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }
}

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

defineExpose({ scrollToToken })
</script>
