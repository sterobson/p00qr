<template>
  <div class="scan-mode">
    <video ref="videoRef" id="video" width="300" height="200"></video>
    <p class="scan-instructions">Scan the athlete's barcode, this works best if they have a QR code.</p>

    <div v-if="scannedBarcode" class="confirmation">
      <p>Athlete: <strong>{{ scannedBarcode }}</strong></p>
      <button @click="handleSave" class="save-button">Save</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useBarcodeScanner } from '../../composables/useBarcodeScanner'

const emit = defineEmits(['save', 'change'])

const videoRef = ref(null)
const scannedBarcode = ref('')
const { startScanning, stopScanning } = useBarcodeScanner()

const handleScan = (result) => {
  scannedBarcode.value = result.text
  emit('change', true)
  stopScanning()
}

const handleSave = () => {
  emit('save', {
    athleteBarcode: scannedBarcode.value,
    athleteName: '',
    entryMethod: 'scan'
  })
  scannedBarcode.value = ''
}

onMounted(() => {
  startScanning('video', handleScan)
})

onUnmounted(() => {
  stopScanning()
})
</script>
