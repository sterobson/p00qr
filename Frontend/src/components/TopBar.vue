<template>
  <div class="top-row">
    <button @click="$emit('menu-toggle')" class="hamburger">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
        <path d="M96 160C96 142.3 110.3 128 128 128L512 128C529.7 128 544 142.3 544 160C544 177.7 529.7 192 512 192L128 192C110.3 192 96 177.7 96 160zM96 320C96 302.3 110.3 288 128 288L512 288C529.7 288 544 302.3 544 320C544 337.7 529.7 352 512 352L128 352C110.3 352 96 337.7 96 320zM544 480C544 497.7 529.7 512 512 512L128 512C110.3 512 96 497.7 96 480C96 462.3 110.3 448 128 448L512 448C529.7 448 544 462.3 544 480z"/>
      </svg>
    </button>
    <span id="code-label">{{ codeLabel }}</span>
    <span v-if="!codeLabel" id="nocode-label">Pick a token</span>
    <button
      v-if="!isEditingExisting"
      @click="$emit('history-open')"
      class="history-icon"
      :class="{ hidden: historyCount === 0 }"
      title="View history"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="6"/>
        <line x1="50" y1="50" x2="50" y2="25" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
        <line x1="50" y1="50" x2="70" y2="50" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
      </svg>
      <span class="history-badge">{{ historyCount }}</span>
    </button>
    <button
      v-if="isEditingExisting"
      @click="$emit('history-close')"
      class="history-icon"
      title="Close history"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
        <path d="M320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320C64 461.4 178.6 576 320 576zM231 231C240.4 221.6 255.6 221.6 264.9 231L319.9 286L374.9 231C384.3 221.6 399.5 221.6 408.8 231C418.1 240.4 418.2 255.6 408.8 264.9L353.8 319.9L408.8 374.9C418.2 384.3 418.2 399.5 408.8 408.8C399.4 418.1 384.2 418.2 374.9 408.8L319.9 353.8L264.9 408.8C255.5 418.2 240.3 418.2 231 408.8C221.7 399.4 221.6 384.2 231 374.9L286 319.9L231 264.9C221.6 255.5 221.6 240.3 231 231z"/>
      </svg>
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAppStore } from '../stores/app'

defineEmits(['menu-toggle', 'history-open', 'history-close'])

const store = useAppStore()

const codeLabel = computed(() => {
  if (store.event.currentToken > 0) {
    return `P${String(store.event.currentToken).padStart(4, '0')}`
  }
  return ''
})

const historyCount = computed(() => {
  return store.assignments.length
})

const isEditingExisting = computed(() => store.isEditingExisting)
</script>
