<template>
  <aside v-if="show" id="about-menu">
    <h1>About</h1>
    <main>
      <div class="top-row">
        <button @click="$emit('update:show', false)" class="hamburger close-menu">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
            <path d="M320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320C64 461.4 178.6 576 320 576zM231 231C240.4 221.6 255.6 221.6 264.9 231L319.9 286L374.9 231C384.3 221.6 399.5 221.6 408.8 231C418.1 240.4 418.2 255.6 408.8 264.9L353.8 319.9L408.8 374.9C418.2 384.3 418.2 399.5 408.8 408.8C399.4 418.1 384.2 418.2 374.9 408.8L319.9 353.8L264.9 408.8C255.5 418.2 240.3 418.2 231 408.8C221.7 399.4 221.6 384.2 231 374.9L286 319.9L231 264.9C221.6 255.5 221.6 240.3 231 231z"/>
          </svg>
        </button>
      </div>

      <div class="about-content">
        <h2>P00Qr Generator</h2>
        <p class="about-description">A parkrun position token QR code generator</p>

        <div class="about-section">
          <h3>Version</h3>
          <p>{{ version }}</p>
          <p class="about-date">{{ buildDate }}</p>
        </div>

        <div class="about-section">
          <h3>Author</h3>
          <p>{{ author }}</p>
        </div>
      </div>
    </main>
  </aside>
</template>

<script setup>
import { ref, onMounted } from 'vue'

defineProps({
  show: Boolean
})

defineEmits(['update:show'])

const version = ref('Loading...')
const buildDate = ref('')
const author = ref('Ste Robson')

onMounted(async () => {
  try {
    const response = await fetch('./version.json')
    if (response.ok) {
      const data = await response.json()
      version.value = data.version || 'Unknown'
      buildDate.value = data.buildDate ? new Date(data.buildDate).toLocaleString() : ''
      author.value = data.author || 'Ste Robson'
    }
  } catch (error) {
    console.error('Failed to load version info:', error)
  }
})
</script>
