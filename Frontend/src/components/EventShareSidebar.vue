<template>
  <aside v-if="show" id="event-share-menu">
    <h1>Share</h1>
    <main>
      <div class="top-row">
        <button @click="$emit('update:show', false)" class="hamburger close-menu">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
            <path d="M320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320C64 461.4 178.6 576 320 576zM231 231C240.4 221.6 255.6 221.6 264.9 231L319.9 286L374.9 231C384.3 221.6 399.5 221.6 408.8 231C418.1 240.4 418.2 255.6 408.8 264.9L353.8 319.9L408.8 374.9C418.2 384.3 418.2 399.5 408.8 408.8C399.4 418.1 384.2 418.2 374.9 408.8L319.9 353.8L264.9 408.8C255.5 418.2 240.3 418.2 231 408.8C221.7 399.4 221.6 384.2 231 374.9L286 319.9L231 264.9C221.6 255.5 221.6 240.3 231 231z"/>
          </svg>
        </button>
      </div>

      <div ref="eventQrRef" id="eventQr"></div>
      <p class="qr-instructions">Scan this QR code to share the current event</p>
    </main>
  </aside>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { generateQRCode } from '../utils/qrcode'

defineProps({
  show: Boolean
})

defineEmits(['update:show'])

const eventQrRef = ref(null)

watch(() => eventQrRef.value, () => {
  nextTick(() => {
    if (eventQrRef.value) {
      generateQRCode(eventQrRef.value, window.location.href, 256)
    }
  })
})
</script>
