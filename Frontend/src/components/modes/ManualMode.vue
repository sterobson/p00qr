<template>
  <div class="manual-mode">
    <form @submit.prevent="handleSubmit">
      <div class="input-group">
        <label for="athlete-barcode">Athlete barcode *</label>
        <input
          id="athlete-barcode"
          v-model="athleteBarcode"
          type="text"
          required
          placeholder="A1234567"
        />
      </div>

      <div class="input-group">
        <label for="athlete-name">Name (optional)</label>
        <input
          id="athlete-name"
          v-model="athleteName"
          type="text"
          placeholder="Jane Smith"
        />
      </div>

      <button type="submit" class="save-button">Save</button>
    </form>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  initialData: {
    type: Object,
    default: () => ({ athleteBarcode: '', athleteName: '' })
  }
})

const emit = defineEmits(['save', 'change'])

const athleteBarcode = ref(props.initialData.athleteBarcode)
const athleteName = ref(props.initialData.athleteName)

watch(() => props.initialData, (newData) => {
  athleteBarcode.value = newData.athleteBarcode
  athleteName.value = newData.athleteName
}, { deep: true })

watch([athleteBarcode, athleteName], () => {
  const hasChanges = athleteBarcode.value !== props.initialData.athleteBarcode ||
                     athleteName.value !== props.initialData.athleteName
  emit('change', hasChanges)
})

const handleSubmit = () => {
  emit('save', {
    athleteBarcode: athleteBarcode.value,
    athleteName: athleteName.value,
    entryMethod: 'manual'
  })
}
</script>
