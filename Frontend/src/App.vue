<template>
  <div id="app-container">
    <!-- Environment Selection Modal (localhost only) -->
    <div v-if="showEnvModal" class="modal-backdrop">
      <div class="modal">
        <div class="modal-text">
          <div class="modal-icon">🔧</div>
          <h2>Development Mode</h2>
        </div>
        <div class="modal-buttons env-buttons">
          <button @click="selectEnv('local')" class="env-button">💻 Local</button>
          <button @click="selectEnv('remote')" class="env-button">☁️ Remote</button>
        </div>
      </div>
    </div>

    <main v-if="initialized">
      <h1><sub>P</sub>00<sub>Qr</sub> Generator</h1>

      <TopBar
        @menu-toggle="showMenu = true"
        @history-open="showHistoryFromIcon"
        @history-close="closeTokenDetail"
      />

      <TokenGrid
        v-show="!showContentArea"
        @token-click="handleTokenClick"
      />

      <!-- Individual Token View -->
      <div v-if="showContentArea" class="token-detail-view">
        <!-- Done button -->
        <button @click="closeTokenDetail" class="done-button">Done</button>

        <!-- Mode selection (only for new tokens) -->
        <div v-if="!store.isEditingExisting" id="mode-selection" class="mode-selection">
          <button @click="switchMode('qr')" class="mode-button" data-mode="qr" title="Show QR code">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512">
              <path d="M64 64C28.7 64 0 92.7 0 128v64c0 8.8 7.4 15.7 15.7 18.6C34.5 217.1 48 235 48 256s-13.5 38.9-32.3 45.4C7.4 304.3 0 311.2 0 320v64c0 35.3 28.7 64 64 64H512c35.3 0 64-28.7 64-64V320c0-8.8-7.4-15.7-15.7-18.6C541.5 294.9 528 277 528 256s13.5-38.9 32.3-45.4c8.3-2.9 15.7-9.8 15.7-18.6V128c0-35.3-28.7-64-64-64H64zm64 112l0 160c0 8.8 7.2 16 16 16s16-7.2 16-16l0-160c0-8.8-7.2-16-16-16s-16 7.2-16 16zM256 160c-8.8 0-16 7.2-16 16l0 160c0 8.8 7.2 16 16 16s16-7.2 16-16l0-160c0-8.8-7.2-16-16-16zm80 16l0 160c0 8.8 7.2 16 16 16s16-7.2 16-16l0-160c0-8.8-7.2-16-16-16s-16 7.2-16 16z"/>
            </svg>
          </button>
          <button @click="switchMode('manual')" class="mode-button" data-mode="manual" title="Manual entry">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
              <path d="M362.7 19.3L314.3 67.7 444.3 197.7l48.4-48.4c25-25 25-65.5 0-90.5L453.3 19.3c-25-25-65.5-25-90.5 0zm-71 71L58.6 323.5c-10.4 10.4-18 23.3-22.2 37.4L1 481.2C-1.5 489.7 .8 498.8 7 505s15.3 8.5 23.7 6.1l120.3-35.4c14.1-4.2 27-11.8 37.4-22.2L421.7 220.3 291.7 90.3z"/>
            </svg>
          </button>
          <button @click="switchMode('scan')" class="mode-button" data-mode="scan" title="Scan barcode">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
              <path d="M24 32C10.7 32 0 42.7 0 56V456c0 13.3 10.7 24 24 24s24-10.7 24-24V56c0-13.3-10.7-24-24-24zm88 0c-13.3 0-24 10.7-24 24V456c0 13.3 10.7 24 24 24s24-10.7 24-24V56c0-13.3-10.7-24-24-24zM200 56V456c0 13.3 10.7 24 24 24s24-10.7 24-24V56c0-13.3-10.7-24-24-24s-24 10.7-24 24zm88-24c-13.3 0-24 10.7-24 24V456c0 13.3 10.7 24 24 24s24-10.7 24-24V56c0-13.3-10.7-24-24-24zm64 24V456c0 13.3 10.7 24 24 24s24-10.7 24-24V56c0-13.3-10.7-24-24-24s-24 10.7-24 24zM488 32c-13.3 0-24 10.7-24 24V456c0 13.3 10.7 24 24 24s24-10.7 24-24V56c0-13.3-10.7-24-24-24z"/>
            </svg>
          </button>
        </div>

        <!-- Content Area -->
        <ContentArea
          :current-mode="store.currentMode"
          :is-editing="store.isEditingExisting"
          @close="closeTokenDetail"
          @delete="handleDeleteAthleteData"
          @save="handleSaveToken"
        />
      </div>
    </main>

    <!-- Sidebars and Modals -->
    <MenuSidebar
      v-model:show="showMenu"
      @show-event-share="showEventShare = true"
      @show-event-settings="showEventSettings = true"
      @show-history="showHistory = true"
      @show-about="showAbout = true"
    />
    <EventShareSidebar v-model:show="showEventShare" />
    <EventSettingsSidebar v-model:show="showEventSettings" />
    <HistorySidebar v-model:show="showHistory" />
    <AboutSidebar v-model:show="showAbout" />

    <ConfirmModal ref="confirmModal" />
    <AlertModal ref="alertModal" />

    <div class="connection-state-disconnected" :class="{ hidden: signalR?.isConnected }" title="Disconnected"></div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, provide } from 'vue'
import { useAppStore } from './stores/app'
import { useSignalR } from './composables/useSignalR'
import TopBar from './components/TopBar.vue'
import TokenGrid from './components/TokenGrid.vue'
import ContentArea from './components/ContentArea.vue'
import MenuSidebar from './components/MenuSidebar.vue'
import EventShareSidebar from './components/EventShareSidebar.vue'
import EventSettingsSidebar from './components/EventSettingsSidebar.vue'
import HistorySidebar from './components/HistorySidebar.vue'
import AboutSidebar from './components/AboutSidebar.vue'
import ConfirmModal from './components/ConfirmModal.vue'
import AlertModal from './components/AlertModal.vue'

const store = useAppStore()
const signalR = ref(null)
const initialized = ref(false)
const showEnvModal = ref(false)

// Sidebar visibility
const showMenu = ref(false)
const showEventShare = ref(false)
const showEventSettings = ref(false)
const showHistory = ref(false)
const showAbout = ref(false)

// Content area
const showContentArea = computed(() => store.currentMode !== null)

// Modals
const confirmModal = ref(null)
const alertModal = ref(null)

// Provide signalR to child components
provide('signalR', signalR)
provide('confirmModal', confirmModal)
provide('alertModal', alertModal)

const selectEnv = (env) => {
  if (env === 'local') {
    window.FUNCTIONS_URL = 'http://localhost:7172'
    window.FUNCTION_KEY = 'Loyl89meoaRFWgIOfjTjJdJg3ZN9WfGguoghClu2Kp2HAzFuESIjXw=='
    console.log('Running in LOCAL mode - connecting to localhost:7172')
  } else {
    window.FUNCTIONS_URL = 'https://sterobson-personal.azurewebsites.net'
    window.FUNCTION_KEY = 'wK5Hom6IL-8jrjczudS6pdUIBX9expUMQKf5iui0af_6AzFukVzLeg=='
    console.log('Running in LOCAL mode - connecting to REMOTE Azure Functions')
  }

  showEnvModal.value = false
  initializeApp()
}

const initializeApp = async () => {
  console.log('Initializing app...')

  const urlParams = new URLSearchParams(window.location.search)
  let eventId = urlParams.get('eventId')

  if (!eventId) {
    eventId = Math.random().toString(36).slice(2, 8)
    const url = new URL(window.location)
    url.searchParams.set('eventId', eventId)
    window.history.replaceState({}, '', url)
  }

  store.event.id = eventId
  console.log('Event ID:', store.event.id)

  // Load state from storage
  store.loadFromCookie(eventId)
  store.loadFromLocalStorage()

  // Initialize SignalR
  signalR.value = useSignalR()
  await signalR.value.ensureConnectedToEvent()

  initialized.value = true
}

const switchMode = (mode) => {
  store.currentMode = mode
  store.preferredMode = mode
}

const closeTokenDetail = () => {
  store.currentMode = null
  store.isEditingExisting = false
}

const handleTokenClick = (token) => {
  const assignment = store.assignments.find(a => a.token === token)

  if (assignment) {
    // Edit existing assignment
    store.event.currentToken = token
    store.isEditingExisting = true
    store.currentMode = 'manual'
  } else {
    // Create new assignment for this token
    store.event.currentToken = token
    store.isEditingExisting = false
    // Start with no mode selected - user must choose
    store.currentMode = null
  }
}

const handleSaveToken = async (data) => {
  const { athleteBarcode, athleteName, entryMethod } = data

  const assignment = {
    token: store.event.currentToken,
    athleteBarcode: athleteBarcode || '',
    athleteName: athleteName || '',
    timestamp: Date.now(),
    entryMethod: entryMethod,
    connectionId: store.connectionId,
    isLocal: true
  }

  // Update or add assignment
  const existingIndex = store.assignments.findIndex(a => a.token === store.event.currentToken)
  if (existingIndex >= 0) {
    store.assignments[existingIndex] = assignment
  } else {
    store.assignments.push(assignment)
  }

  // Send to SignalR
  if (signalR.value) {
    await signalR.value.sendTokenUsed(store.event.currentToken)
    await signalR.value.sendTokenAssignments([assignment])
  }

  // Show confirmation and advance to next token
  if (!store.isEditingExisting) {
    store.event.currentToken = 0
  }
  closeTokenDetail()
}

const handleDeleteAthleteData = async () => {
  const confirmed = await confirmModal.value.show(
    'Delete athlete data?',
    'Are you sure you want to delete this athlete data?'
  )

  if (confirmed) {
    const index = store.assignments.findIndex(a => a.token === store.event.currentToken)
    if (index >= 0) {
      store.assignments.splice(index, 1)

      // Send empty assignment to SignalR
      if (signalR.value) {
        await signalR.value.sendTokenAssignments([{
          token: store.event.currentToken,
          athleteBarcode: '',
          athleteName: '',
          timestamp: Date.now(),
          entryMethod: 'manual',
          connectionId: store.connectionId,
          isLocal: true
        }])
      }
    }

    closeTokenDetail()
  }
}

const showHistoryFromIcon = () => {
  showHistory.value = true
}

onMounted(() => {
  if (window.IS_LOCAL_DEV) {
    showEnvModal.value = true
  } else {
    initializeApp()
  }
})
</script>
