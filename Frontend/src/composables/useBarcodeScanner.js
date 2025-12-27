import { ref, onUnmounted } from 'vue'
import { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } from '@zxing/library'

export function useBarcodeScanner() {
  const scanner = ref(null)
  const isScanning = ref(false)
  const selectedDeviceId = ref(null)

  const initScanner = () => {
    const hints = new Map()
    const formats = [BarcodeFormat.CODE_128, BarcodeFormat.QR_CODE]
    hints.set(DecodeHintType.POSSIBLE_FORMATS, formats)
    scanner.value = new BrowserMultiFormatReader(hints)
  }

  const startScanning = async (videoElementId, onDetected) => {
    if (isScanning.value) return

    stopScanning()

    if (!scanner.value) {
      initScanner()
    }

    try {
      if (selectedDeviceId.value === null) {
        const videoInputDevices = await scanner.value.listVideoInputDevices()
        console.log('Video input devices:', videoInputDevices)
        if (videoInputDevices && videoInputDevices.length > 0) {
          const rearCamera = videoInputDevices.find(device =>
            device.kind === 'videoinput' &&
            /back|rear/i.test(device.label)
          )

          selectedDeviceId.value = rearCamera?.deviceId || videoInputDevices[0].deviceId
          console.log('Selected camera:', selectedDeviceId.value)
        }
      }

      isScanning.value = true
      let lastResult = null
      await scanner.value.decodeFromVideoDevice(selectedDeviceId.value, videoElementId, (result, err) => {
        if (result && result !== lastResult && onDetected) {
          lastResult = result
          onDetected(result)
        }
        if (err && err.name !== 'NotFoundException') {
          console.error('Barcode scanning error:', err)
        }
      })
    } catch (error) {
      console.error('Failed to start camera:', error)
      isScanning.value = false
    }
  }

  const stopScanning = () => {
    if (isScanning.value && scanner.value) {
      scanner.value.reset()
      isScanning.value = false
    }
  }

  onUnmounted(() => {
    stopScanning()
  })

  return {
    isScanning,
    startScanning,
    stopScanning
  }
}
