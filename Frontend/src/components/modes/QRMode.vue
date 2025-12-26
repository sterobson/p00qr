<template>
  <div class="qr-mode">
    <div ref="qrRef" id="qr"></div>
    <p class="qr-instructions">Please take the athlete's barcode to be scanned, then scan this position token.</p>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useAppStore } from '../../stores/app'
import { generateQRCode } from '../../utils/qrcode'

const store = useAppStore()
const qrRef = ref(null)

const updateQR = () => {
  if (qrRef.value && store.event.currentToken > 0) {
    const qrData = `P${String(store.event.currentToken).padStart(4, '0')}`
    generateQRCode(qrRef.value, qrData, 256)
  }
}

watch(() => store.event.currentToken, updateQR)

onMounted(() => {
  updateQR()
})
</script>
