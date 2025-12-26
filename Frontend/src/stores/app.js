import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

// Generate or retrieve persistent device ID
function getDeviceId() {
  let deviceId = localStorage.getItem('p00qr-deviceId')
  if (!deviceId) {
    // Generate UUID v4
    deviceId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
    localStorage.setItem('p00qr-deviceId', deviceId)
  }
  return deviceId
}

export const useAppStore = defineStore('app', () => {
  // Device state
  const deviceId = ref(getDeviceId())

  // Event state
  const event = ref({
    id: '',
    name: 'New event',
    currentToken: 0,
    nextToken: 1
  })

  // Connection state
  const connectionId = ref('')
  const hubConnection = ref(null)
  const functionKey = ref(window.FUNCTION_KEY || null)
  const localHostKey = ref(null)

  // Assignments state
  const assignments = ref([]) // {token, athleteBarcode, athleteName, timestamp, entryMethod, connectionId, isLocal}

  // UI state
  const preferredMode = ref(null) // 'scan' | 'manual' | 'qr'
  const currentMode = ref(null)
  const isEditingExisting = ref(false) // true when editing from history, false when taking new token

  // Save event state to cookie
  function saveToCookie() {
    const cookieValue = encodeURIComponent(JSON.stringify(event.value))
    document.cookie = `event=${cookieValue}; path=/; max-age=21600` // 6 hours
  }

  // Load event state from cookie
  function loadFromCookie(eventId) {
    const match = document.cookie.match(new RegExp('(^| )event=([^;]+)'))
    if (match) {
      const loadedEvent = JSON.parse(decodeURIComponent(match[2]))
      if (loadedEvent && loadedEvent.id == eventId) {
        event.value = loadedEvent
      }
    }
  }

  // Save assignments and preferences to localStorage
  function saveToLocalStorage() {
    try {
      const data = {
        eventId: event.value.id,
        assignments: assignments.value,
        preferredMode: preferredMode.value
      }
      localStorage.setItem('parkrunData', JSON.stringify(data))
    } catch (e) {
      console.warn('Failed to save to localStorage:', e)
    }
  }

  // Load assignments and preferences from localStorage
  function loadFromLocalStorage() {
    try {
      const json = localStorage.getItem('parkrunData')
      if (json) {
        const data = JSON.parse(json)
        if (data.eventId === event.value.id) {
          assignments.value = data.assignments || []
          preferredMode.value = data.preferredMode || null
        }
      }
    } catch (e) {
      console.warn('Failed to load from localStorage:', e)
    }
  }

  // Watch for changes and persist
  watch(event, saveToCookie, { deep: true })
  watch([assignments, preferredMode], saveToLocalStorage, { deep: true })

  return {
    // State
    deviceId,
    event,
    connectionId,
    hubConnection,
    functionKey,
    localHostKey,
    assignments,
    preferredMode,
    currentMode,
    isEditingExisting,
    // Actions
    saveToCookie,
    loadFromCookie,
    saveToLocalStorage,
    loadFromLocalStorage
  }
})
