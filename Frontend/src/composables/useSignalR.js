import { ref, computed } from 'vue'
import * as signalR from '@microsoft/signalr'
import { useAppStore } from '../stores/app'

export function useSignalR() {
  const store = useAppStore()

  const connectedEventId = ref(null)
  const connectLock = ref(null)
  const lastMessageReceived = ref(null)
  const messageSourceId = Math.random().toString(36).slice(2, 8)

  const debounce = (func, wait) => {
    let timeout
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout)
        func(...args)
      }
      clearTimeout(timeout)
      timeout = setTimeout(later, wait)
    }
  }

  const sendEventDetailsDebounced = debounce((eventName, nextToken) => {
    performPost('SendEventDetails', {
      eventId: store.event.id,
      eventName: eventName,
      nextToken: nextToken
    })
  }, 500)

  const isConnected = computed(() => {
    const timeSinceLastMessage = Date.now() - (lastMessageReceived.value ?? 0)
    return timeSinceLastMessage < 15000 &&
      store.hubConnection &&
      store.hubConnection.state === signalR.HubConnectionState.Connected &&
      store.event.id === connectedEventId.value
  })

  const startPeriodicLivelinessCheck = () => {
    const checkInterval = 2000
    const maxQuietMs = 10000
    setInterval(() => {
      ensureConnectedToEvent().then(() => {
        let timeSinceLastMessage = Date.now() - (lastMessageReceived.value ?? 0)
        if (timeSinceLastMessage > maxQuietMs) {
          console.log(`It's been more than ${maxQuietMs}ms since the last received message`)
          pingEvent()
        }
      })
    }, checkInterval)
  }

  const ensureConnectedToEvent = async () => {
    if (connectLock.value) {
      await connectLock.value
      return
    }

    let resolveLock
    connectLock.value = new Promise(resolve => (resolveLock = resolve))

    try {
      let reconnected = false
      if (!isConnected.value) {
        await startHub()
        reconnected = true
      }

      if (reconnected) {
        console.log(`SignalR was reconnected, so adding to event ${store.event.id}`)
        await addToGroup(store.event.id)
        await joinEvent()
        connectedEventId.value = store.event.id
        store.connectionId = store.hubConnection.connectionId

        // Load history from server
        setTimeout(() => {
          getFullHistory()
        }, 1000)
      }
    } finally {
      resolveLock()
      connectLock.value = null
    }
  }

  const startHub = async () => {
    if (typeof signalR === 'undefined') {
      console.warn('SignalR client not loaded.')
      return
    }

    let timeoutOnFailureMs = 1000
    let attemptNo = 1

    while (!isConnected.value) {
      if (store.hubConnection) {
        console.log('Stopping existing connection')
        store.hubConnection.stop()
      }

      let info = await negotiate()
      if (info) {
        let accessToken = info.accessToken || info.AccessToken || ''
        let hubUrl = info.url || info.Url

        store.hubConnection = new signalR.HubConnectionBuilder()
          .withUrl(hubUrl, { accessTokenFactory: () => accessToken })
          .build()

        store.hubConnection.onclose(() => {
          store.hubConnection = null
        })

        setupHubHandlers()

        connectedEventId.value = store.event.id
        await store.hubConnection.start()
        lastMessageReceived.value = Date.now()
      }

      if (!isConnected.value) {
        console.log(`SignalR start hub seemed to fail on attempt #${attemptNo}, attempting to fix that in ${timeoutOnFailureMs} ms...`)
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
        await sleep(timeoutOnFailureMs)
        timeoutOnFailureMs = Math.min(timeoutOnFailureMs + 1000, 10000)
        attemptNo++
      }
    }

    console.info('SignalR connected.')
  }

  const setupHubHandlers = () => {
    store.hubConnection.on('tokenUsed', (msgSourceId, eventId, token) => {
      if (token == store.event.currentToken && msgSourceId != messageSourceId) {
        if (msgSourceId < messageSourceId) {
          console.warn(`Conflict detected! This device lost out to ${msgSourceId}`)
          store.event.currentToken = 0
          return
        } else {
          console.warn(`Conflict detected! This device won and beat out ${msgSourceId}`)
        }
      }

      store.event.nextToken = Math.max(store.event.nextToken, token + 1)
      lastMessageReceived.value = Date.now()
      console.log('Received tokenUsed:', msgSourceId, eventId, token)
    })

    store.hubConnection.on('resetEvent', (msgSourceId, eventId) => {
      store.event.nextToken = 1
      store.event.currentToken = 0
      lastMessageReceived.value = Date.now()
      console.log('Received resetEvent:', msgSourceId, eventId)
    })

    store.hubConnection.on('deviceAddedToEvent', (msgSourceId, eventId) => {
      if (msgSourceId == messageSourceId) return

      const delay = Math.random() * 400 + 100
      setTimeout(() => {
        if (store.event.nextToken > 1 || store.event.name !== 'New event') {
          sendEventDetails(store.event.name, store.event.nextToken)
        }
      }, delay)

      lastMessageReceived.value = Date.now()
      console.log('Received deviceAddedToEvent:', msgSourceId, eventId)
    })

    store.hubConnection.on('setEventDetails', (msgSourceId, eventId, eventName, nextToken) => {
      store.event.name = eventName || 'Unnamed Event'

      const num = Number(nextToken)
      if (Number.isInteger(num) && num > 0) {
        if (store.event.nextToken != num) {
          store.event.nextToken = num
          store.event.currentToken = 0
        }
      }
      lastMessageReceived.value = Date.now()
      console.log('Received setEventDetails:', msgSourceId, eventId, eventName, nextToken)
    })

    store.hubConnection.on('pingEvent', (msgSourceId, eventId) => {
      lastMessageReceived.value = Date.now()
      console.log('Received pingEvent:', msgSourceId, eventId)
    })

    store.hubConnection.on('tokenAssignments', (msgSourceId, eventId, assignments) => {
      if (msgSourceId == messageSourceId) {
        lastMessageReceived.value = Date.now()
        return
      }

      console.log('Received tokenAssignments:', msgSourceId, eventId, assignments)
      mergeAssignments(assignments)
      lastMessageReceived.value = Date.now()
    })

    store.hubConnection.on('syncDigest', (msgSourceId, eventId, count, tokens) => {
      if (msgSourceId == messageSourceId) {
        lastMessageReceived.value = Date.now()
        return
      }

      console.log('Received syncDigest:', { count, tokens: tokens.length })

      const myTokens = store.assignments.map(a => a.token).sort((a, b) => a - b)
      const theirTokens = [...tokens].sort((a, b) => a - b)

      const needsSync = count !== store.assignments.length ||
        theirTokens.some(token => !myTokens.includes(token))

      if (needsSync) {
        console.log('Out of sync detected! My tokens:', myTokens.length, 'Their tokens:', theirTokens.length)
        console.log('Requesting full history from server...')
        setTimeout(() => {
          getFullHistory()
        }, Math.random() * 1000 + 500)
      }

      lastMessageReceived.value = Date.now()
    })
  }

  const performAnonymousGet = async (endpointName, queryParams) => {
    return await performRequest('GET', endpointName, queryParams, false)
  }

  const performGet = async (endpointName, queryParams) => {
    return await performRequest('GET', endpointName, queryParams, true)
  }

  const performPost = async (endpointName, queryParams) => {
    return await performRequest('POST', endpointName, queryParams, true)
  }

  const performRequest = async (method, endpointName, queryParams, ensureFunctionKey) => {
    const base = window.FUNCTIONS_URL || `https://${location.hostname}`
    const url = new URL(`/api/${endpointName}`, base)

    await ensureLocalHostKey()
    if (ensureFunctionKey) {
      await ensureFunctionKeyValue()
    }

    if (store.functionKey)
      url.searchParams.set('code', encodeURIComponent(store.functionKey))

    // For GET requests with query params, add them to URL
    if (method === 'GET' && queryParams) {
      Object.keys(queryParams).forEach(key => {
        url.searchParams.set(key, queryParams[key])
      })
    }

    let body = method == 'GET' ? null : {
      ...queryParams,
      connectionId: store.hubConnection?.connection?.connectionId ?? null,
      messageSourceId: messageSourceId,
      deviceId: store.deviceId
    }

    const headers = { 'Content-Type': 'application/json' }
    if (store.functionKey) headers['x-functions-key'] = store.functionKey
    if (store.localHostKey) headers['x-local-host-key'] = store.localHostKey

    try {
      const res = await fetch(url.toString(), {
        method: method,
        headers,
        body: body ? JSON.stringify(body) : null
      })

      if (!res.ok) {
        console.log(`${endpointName} failed: ` + res.status)
      }

      return res
    } catch (err) {
      console.log(`${endpointName} failed: ${err}`)
      return {}
    }
  }

  const negotiate = async () => {
    const result = await performPost('negotiate')
    if (result.status) {
      return result.json()
    } else {
      return ""
    }
  }

  const addToGroup = async (groupName) => {
    await performPost('AddToGroup', {
      eventId: groupName
    })
  }

  const removeFromGroup = async (groupName) => {
    await performPost('RemoveFromGroup', {
      eventId: groupName
    })
  }

  const sendTokenUsed = async (token) => {
    await ensureConnectedToEvent(store.event.id)
    await performPost('SendTokenUsed', {
      eventId: store.event.id,
      token: token
    })
  }

  const joinEvent = async () => {
    await performPost('JoinEvent', {
      eventId: store.event.id
    })
  }

  const ensureLocalHostKey = async () => {
    if (store.localHostKey === null) {
      const isLocal = isLocalHost(window.location.hostname)
      if (!isLocal) {
        store.localHostKey = ''
        return
      }

      try {
        const res = await fetch('../public/config.json')
        if (res.ok) {
          const obj = await res.json()
          store.localHostKey = obj.localHostKey
        } else {
          store.localHostKey = ''
        }
      } catch (err) {
        store.localHostKey = ''
      }
    }
  }

  const isLocalHost = (hostname) => {
    if (!hostname) return false

    hostname = hostname.toLowerCase()

    const localPatterns = [
      'localhost',
      '127.',
      '192.168.',
      '::1'
    ]

    return localPatterns.some(pattern => hostname.startsWith(pattern))
  }

  const ensureFunctionKeyValue = async () => {
    if (store.functionKey === null) {
      const res = await performAnonymousGet('GetFunctionKey')
      if (res.ok) {
        const json = await res.json()
        store.functionKey = json.FunctionKey ?? json.functionKey
      }
    }
  }

  const resetEvent = async () => {
    await ensureConnectedToEvent(store.event.id)
    await performPost('ResetEvent', {
      eventId: store.event.id
    })
  }

  const sendEventDetails = async (eventName, nextToken) => {
    await ensureConnectedToEvent(store.event.id)
    sendEventDetailsDebounced(eventName, nextToken)
  }

  const pingEvent = async () => {
    await ensureConnectedToEvent(store.event.id)
    await performPost('PingEvent', {
      eventId: store.event.id
    })
  }

  const inferEntryMethod = (athleteId) => {
    if (!athleteId) return 'qr'
    return 'manual'
  }

  const mergeAssignments = (assignments) => {
    assignments.forEach(incoming => {
      // Handle both old format (Position) and new format (position)
      const positionStr = incoming.Position || incoming.position
      const position = parseInt(positionStr.replace('P', ''))

      // Handle both old format (uppercase) and new format (camelCase)
      const athleteId = incoming.AthleteId || incoming.athleteId || ''
      const athleteName = incoming.AthleteName || incoming.athleteName || ''
      const timestamp = incoming.Timestamp || incoming.timestamp || incoming.assignmentTimestamp || Date.now()
      const connectionId = incoming.ConnectionId || incoming.connectionId || ''

      const existing = store.assignments.find(a => a.token === position)

      if (!existing) {
        store.assignments.push({
          token: position,
          athleteBarcode: athleteId,
          athleteName: athleteName,
          timestamp: timestamp,
          entryMethod: inferEntryMethod(athleteId),
          connectionId: connectionId,
          isLocal: false
        })
      } else {
        const shouldUpdate = timestamp > existing.timestamp ||
          (timestamp === existing.timestamp && connectionId > existing.connectionId)

        if (shouldUpdate) {
          existing.athleteBarcode = athleteId
          existing.athleteName = athleteName
          existing.timestamp = timestamp
          existing.entryMethod = inferEntryMethod(athleteId)
          existing.connectionId = connectionId
          existing.isLocal = false

          console.log(`Updated token ${position} with newer data (timestamp: ${timestamp}, connectionId: ${connectionId})`)
        }
      }
    })

    store.assignments = [...store.assignments]
  }

  const sendTokenAssignments = async (assignments) => {
    await ensureConnectedToEvent(store.event.id)

    const payload = assignments.map(a => ({
      Position: `P${String(a.token).padStart(4, '0')}`,
      AthleteId: a.athleteBarcode || '',
      AthleteName: a.athleteName || '',
      ConnectionId: a.connectionId || store.connectionId,
      DeviceId: store.deviceId,
      Timestamp: a.timestamp
    }))

    await performPost('SendTokenAssignments', {
      eventId: store.event.id,
      assignments: payload
    })
  }

  const getRecentAssignments = (count = 5) => {
    return store.assignments
      .filter(a => a.isLocal)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, count)
  }

  const getFullHistory = async () => {
    await ensureConnectedToEvent(store.event.id)
    const response = await performGet('GetFullHistory', { eventId: store.event.id })

    if (response.ok) {
      const assignments = await response.json()
      console.log('Retrieved full history from server:', assignments.length, 'assignments')

      // Merge assignments into local state
      if (assignments && assignments.length > 0) {
        mergeAssignments(assignments)
      }

      return assignments
    } else {
      console.error('Failed to get full history:', response.status)
      return []
    }
  }

  const sendSyncDigest = async () => {
    await ensureConnectedToEvent(store.event.id)

    const tokens = store.assignments.map(a => a.token)
    await performPost('SendSyncDigest', {
      eventId: store.event.id,
      count: store.assignments.length,
      tokens: tokens
    })
  }

  const startPeriodicSync = () => {
    const syncInterval = 30000
    setInterval(() => {
      if (isConnected.value && store.assignments.length > 0) {
        sendSyncDigest()
      }
    }, syncInterval)
  }

  // Initialize
  startPeriodicLivelinessCheck()
  startPeriodicSync()

  return {
    isConnected,
    ensureConnectedToEvent,
    sendTokenUsed,
    resetEvent,
    sendEventDetails,
    pingEvent,
    sendTokenAssignments,
    getRecentAssignments,
    getFullHistory,
    sendSyncDigest
  }
}
