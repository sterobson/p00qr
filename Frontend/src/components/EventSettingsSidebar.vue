<template>
  <aside v-if="show" id="event-settings-menu" class="open">
    <h1>Event settings</h1>
    <main>
      <div class="top-row">
        <button @click="$emit('update:show', false)" class="hamburger close-menu">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
            <path d="M320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320C64 461.4 178.6 576 320 576zM231 231C240.4 221.6 255.6 221.6 264.9 231L319.9 286L374.9 231C384.3 221.6 399.5 221.6 408.8 231C418.1 240.4 418.2 255.6 408.8 264.9L353.8 319.9L408.8 374.9C418.2 384.3 418.2 399.5 408.8 408.8C399.4 418.1 384.2 418.2 374.9 408.8L319.9 353.8L264.9 408.8C255.5 418.2 240.3 418.2 231 408.8C221.7 399.4 221.6 384.2 231 374.9L286 319.9L231 264.9C221.6 255.5 221.6 240.3 231 231z"/>
          </svg>
        </button>
      </div>

      <label for="event-name">Event name</label>
      <input id="event-name-input" v-model="eventName" type="text" maxlength="20" />

      <label for="position">Set next token</label>
      <input
        id="position"
        v-model="nextToken"
        type="text"
        inputmode="numeric"
        pattern="[0-9]*"
        maxlength="4"
      />

      <button @click="handleSave">Save</button>
      <button @click="handleSaveNewEvent">Save new event</button>
    </main>
  </aside>
</template>

<script setup>
import { ref, watch, inject } from 'vue'
import { useAppStore } from '../stores/app'

defineProps({
  show: Boolean
})

const emit = defineEmits(['update:show'])

const store = useAppStore()
const signalR = inject('signalR')

const eventName = ref(store.event.name)
const nextToken = ref(store.event.nextToken.toString())

watch(() => store.event.name, (val) => {
  eventName.value = val
})

watch(() => store.event.nextToken, (val) => {
  nextToken.value = val.toString()
})

const handleSave = async () => {
  store.event.name = eventName.value
  const num = parseInt(nextToken.value)
  if (Number.isInteger(num) && num > 0) {
    store.event.nextToken = num
    store.event.currentToken = 0
  }

  if (signalR?.value) {
    await signalR.value.sendEventDetails(store.event.name, store.event.nextToken)
  }

  emit('update:show', false)
}

const handleSaveNewEvent = () => {
  const newEventId = Math.random().toString(36).slice(2, 8)
  const url = new URL(window.location)
  url.searchParams.set('eventId', newEventId)
  window.location.href = url.toString()
}
</script>
