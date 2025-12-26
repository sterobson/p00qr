<template>
  <div class="content-area">
    <!-- Edit cancel button -->
    <button
      v-if="isEditing"
      @click="$emit('close')"
      class="edit-cancel-btn"
      title="Cancel editing"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
        <path d="M320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320C64 461.4 178.6 576 320 576zM231 231C240.4 221.6 255.6 221.6 264.9 231L319.9 286L374.9 231C384.3 221.6 399.5 221.6 408.8 231C418.1 240.4 418.2 255.6 408.8 264.9L353.8 319.9L408.8 374.9C418.2 384.3 418.2 399.5 408.8 408.8C399.4 418.1 384.2 418.2 374.9 408.8L319.9 353.8L264.9 408.8C255.5 418.2 240.3 418.2 231 408.8C221.7 399.4 221.6 384.2 231 374.9L286 319.9L231 264.9C221.6 255.5 221.6 240.3 231 231z"/>
      </svg>
    </button>

    <!-- Delete button -->
    <button
      v-if="isEditing && hasAssignment"
      @click="$emit('delete')"
      class="edit-delete-btn"
      title="Delete athlete data"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512">
        <path d="M135.2 17.7L128 32H32C14.3 32 0 46.3 0 64S14.3 96 32 96H416c17.7 0 32-14.3 32-32s-14.3-32-32-32H320l-7.2-14.3C307.4 6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 6.8-28.6 17.7zM416 128H32L53.2 467c1.6 25.3 22.6 45 47.9 45H346.9c25.3 0 46.3-19.7 47.9-45L416 128z"/>
      </svg>
    </button>

    <!-- Scan Mode -->
    <div v-if="currentMode === 'scan'" class="mode-content">
      <ScanMode @save="handleSave" />
    </div>

    <!-- Manual Mode -->
    <div v-if="currentMode === 'manual'" class="mode-content">
      <ManualMode :initial-data="initialData" @save="handleSave" />
    </div>

    <!-- QR Mode -->
    <div v-if="currentMode === 'qr'" class="mode-content">
      <QRMode />
    </div>

    <!-- Save Confirmation -->
    <div v-if="currentMode === 'save-confirmation'" class="mode-content">
      <div class="save-confirmation-message">
        <div class="save-confirmation-icon">✓</div>
        <h2>Saved successfully</h2>
        <p>{{ saveConfirmationToken }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAppStore } from '../stores/app'
import ScanMode from './modes/ScanMode.vue'
import ManualMode from './modes/ManualMode.vue'
import QRMode from './modes/QRMode.vue'

const props = defineProps({
  currentMode: String,
  isEditing: Boolean
})

const emit = defineEmits(['close', 'delete', 'save'])

const store = useAppStore()

const hasAssignment = computed(() => {
  return store.assignments.some(a => a.token === store.event.currentToken)
})

const initialData = computed(() => {
  const assignment = store.assignments.find(a => a.token === store.event.currentToken)
  if (assignment) {
    return {
      athleteBarcode: assignment.athleteBarcode,
      athleteName: assignment.athleteName
    }
  }
  return {
    athleteBarcode: '',
    athleteName: ''
  }
})

const saveConfirmationToken = computed(() => {
  return `P${String(store.event.currentToken).padStart(4, '0')}`
})

const handleSave = (data) => {
  emit('save', data)
}
</script>
