import { state } from './state.js';

export class SignalRService {
    constructor(state) {
        this.state = state;
        this._connectedEventId = null;
        this._connectLock = null;
        this._lastMessageReceived = null;
        this._messageSourceId = Math.random().toString(36).slice(2, 8); // 6-char random string,
        this._sendEventDetailsDebounced = this._debounce((eventName, nextToken) => {
            this._performPost('SendEventDetails', {
                eventId: this.state.event.id,
                eventName: eventName,
                nextToken: nextToken
            });
        }, 500);
        this._startPeriodicLivelinessCheck();
        this._startPeriodicSync();
    }

    _debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    getIsConnected() {
        const timeSinceLastMessageReceived = Date.now() - (this._lastMessageReceived ?? 0);
        return timeSinceLastMessageReceived < 15000 
            && this.state.hubConnection 
            && this.state.hubConnection.state == signalR.HubConnectionState.Connected
            && this.state.event.id == this._connectedEventId;
    }

    // Every few seconds we should check that the connection is still alive.
    _startPeriodicLivelinessCheck() {
        const checkInterval = 2000;
        setInterval(() => {
            this.ensureConnectedToEvent().catch(err => console.error('Failed to ensure connection:', err));
        }, checkInterval);
    }

    async ensureConnectedToEvent() {
        // If a connection is already in progress, wait for it to finish
        if(this._connectLock) {
            await this._connectLock;
            return;
        }

        let resolveLock;
        this._connectLock = new Promise(resolve => (resolveLock = resolve));

        try {
            let previousConnectedEventId = this._connectedEventId;
            let reconnected = false;
            if (!this.getIsConnected()) {
                await this._startHub();
                reconnected = true;
            }

            if(reconnected) {
                console.log(`SignalR was reconnected, so adding to event ${this.state.event.id}`);

                // If the connection is already in a different group, remove it first, otherwise we might get
                // messages for multiple events, which isn't ideal.
                // if(previousConnectedEventId) {
                //     await this._removeFromGroup(previousConnectedEventId);
                // }

                await this._addToGroup(this.state.event.id);
                await this._joinEvent();
                this._connectedEventId = this.state.event.id;
                this.state.connectionId = this.state.hubConnection.connectionId;

                // Request full history from all other devices
                // Add a small delay to ensure we're ready to receive responses
                setTimeout(() => {
                    this.requestFullHistory();
                }, 1000);
            }
        } finally {
            resolveLock();
            this._connectLock = null;
        }
    }

    async _startHub() {
        if (typeof signalR === 'undefined') {
            console.warn('SignalR client not loaded.');
            return;
        }

        let timeoutOnFailureMs = 1000;
        let attemptNo = 1;
        while(!this.getIsConnected()){

            if(this.state.hubConnection) {
                console.log('Stopping existing connection');
                this.state.hubConnection.stop();
            }

            let info = await this._negotiate();
            if(info) {
                let accessToken = info.accessToken || info.AccessToken || '';
                let hubUrl = info.url || info.Url;

                this.state.hubConnection = new signalR.HubConnectionBuilder()
                    .withUrl(hubUrl, { accessTokenFactory: () => accessToken })
                    // These are the number of milliseconds to wait if the connection dies unexpectedly
                    // .withAutomaticReconnect([0, 2000, 2000, 2000, 5000, 10000])
                    .build();

                this.state.hubConnection.onclose(() => {
                    this.state.hubConnection = null;
                });

                // A token has been used by a device in this event. Update our next token,
                // but only if needed.
                this.state.hubConnection.on('tokenUsed', (messageSourceId, eventId, token) => {
                    // Conflict resolution - if the token used matches what we are currently displaying,
                    // then the winner is whoever has the latest messageSourceId. It's as good a method
                    // as anything else really. The loser(s) have their current token wiped out, so that
                    // we don't accidentally scan the same token twice.
                    if(token == this.state.event.currentToken && messageSourceId != this._messageSourceId) {
                        if(messageSourceId < this._messageSourceId){
                            console.warn(`Conflict detected! This device lost out to ${messageSourceId}`);
                            this.state.event.currentToken = 0;
                            return;
                        } else {
                            console.warn(`Conflict detected! This device won and beat out ${messageSourceId}`);
                        }
                    }

                    // If the current max value is less than the token just used, update it.
                    this.state.event.nextToken = Math.max(this.state.event.nextToken, token + 1);
                    this._lastMessageReceived = Date.now();
                    console.log('Received tokenUsed:', messageSourceId, eventId, token, this.state);
                }); 

                // The event has been reset to a certain token. Set that as the next token, and
                // set the current value to 0 so we don't get multiple devices with the same token.
                this.state.hubConnection.on('resetEvent', (messageSourceId, eventId) => {
                    this.state.event.nextToken = 1;
                    this.state.event.currentToken = 0;
                    this._lastMessageReceived = Date.now();
                    console.log('Received resetEvent:', messageSourceId, eventId, this.state);
                });

                // A new device has been added to an event. Only respond if we have useful state.
                // Use a small random delay to reduce message storm.
                this.state.hubConnection.on('deviceAddedToEvent', (messageSourceId, eventId) => {
                    if(messageSourceId == this._messageSourceId) return;

                    // Random delay between 100-500ms to stagger responses
                    const delay = Math.random() * 400 + 100;
                    setTimeout(() => {
                        if(this.state.event.nextToken > 1 || this.state.event.name !== 'New event') {
                            this.sendEventDetails(this.state.event.name, this.state.event.nextToken);
                        }
                    }, delay);

                    this._lastMessageReceived = Date.now();
                    console.log('Received deviceAddedToEvent:', messageSourceId, eventId, this.state);
                });

                // The event's details have been updated, possibly by another device.
                this.state.hubConnection.on('setEventDetails', (messageSourceId, eventId, eventName, nextToken) => {
                    this.state.event.name = eventName || 'Unnamed Event';

                    const num = Number(nextToken);
                    if(Number.isInteger(num) && num > 0) {
                        // Only update nextToken if the incoming value is different
                        // This handles admin setting the token or syncing with new devices
                        if(this.state.event.nextToken != num) {
                            this.state.event.nextToken = num;
                            this.state.event.currentToken = 0;
                        }
                    }
                    this._lastMessageReceived = Date.now();
                    console.log('Received setEventDetails:', messageSourceId, eventId, eventName, nextToken, this.state);
                });

                // Token assignments have been updated. Merge with local state using conflict resolution.
                this.state.hubConnection.on('tokenAssignments', (messageSourceId, eventId, assignments) => {
                    if(messageSourceId == this._messageSourceId) {
                        // Ignore our own messages
                        this._lastMessageReceived = Date.now();
                        return;
                    }

                    console.log('Received tokenAssignments:', messageSourceId, eventId, assignments);

                    this._mergeAssignments(assignments);

                    this._lastMessageReceived = Date.now();
                });

                // A new device is requesting full history from all devices
                this.state.hubConnection.on('requestFullHistory', (messageSourceId, eventId) => {
                    if(messageSourceId == this._messageSourceId) {
                        // Ignore our own request
                        this._lastMessageReceived = Date.now();
                        return;
                    }

                    console.log('Received requestFullHistory from:', messageSourceId);

                    // Send ALL assignments we know about (not just local ones)
                    // This ensures the new device gets the complete history from all sources
                    if (this.state.assignments.length > 0) {
                        // Add a small random delay to avoid message storm
                        const delay = Math.random() * 500 + 100;
                        setTimeout(() => {
                            // Mark all assignments as coming from their original source
                            const allAssignments = this.state.assignments.map(a => ({
                                ...a,
                                // Preserve the original isLocal flag in the data we send
                            }));
                            this.sendTokenAssignments(allAssignments);
                        }, delay);
                    }

                    this._lastMessageReceived = Date.now();
                });

                // Sync digest - lightweight sync check
                this.state.hubConnection.on('syncDigest', (messageSourceId, eventId, count, tokens) => {
                    if(messageSourceId == this._messageSourceId) {
                        this._lastMessageReceived = Date.now();
                        return;
                    }

                    console.log('Received syncDigest:', { count, tokens: tokens.length });

                    // Check if we need to request full history
                    const myTokens = this.state.assignments.map(a => a.token).sort((a, b) => a - b);
                    const theirTokens = [...tokens].sort((a, b) => a - b);

                    // Simple check: different count or missing tokens
                    const needsSync = count !== this.state.assignments.length ||
                        theirTokens.some(token => !myTokens.includes(token));

                    if (needsSync) {
                        console.log('Out of sync detected! My tokens:', myTokens.length, 'Their tokens:', theirTokens.length);
                        console.log('Requesting full history...');
                        // Request full history to get the missing data
                        setTimeout(() => {
                            this.requestFullHistory();
                        }, Math.random() * 1000 + 500);
                    }

                    this._lastMessageReceived = Date.now();
                });

                this._connectedEventId = this.state.event.id;
                await this.state.hubConnection.start();

                this._lastMessageReceived = Date.now();
            }

            // If we're still not connected, then sleep for a while and then try again.
            if(!this.getIsConnected()) {
                console.log(`SignalR start hub seemed to fail on attempt #${attemptNo}, attempting to fix that in ${timeoutOnFailureMs} ms...`);

                const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
                await sleep(timeoutOnFailureMs);
                timeoutOnFailureMs = Math.min(timeoutOnFailureMs + 1000, 10000);
                attemptNo++;
            }
        }

        console.info('SignalR connected.');
    }

    async _performAnonymousGet(endpointName, queryParams) {
        return await this._performRequest('GET', endpointName, queryParams, false)
    }

    async _performGet(endpointName, queryParams) {
        return await this._performRequest('GET', endpointName, queryParams, true)
    }

    async _performPost(endpointName, queryParams) {
        return await this._performRequest('POST', endpointName, queryParams, true)
    }

    async _performRequest(method, endpointName, queryParams, ensureFunctionKey) {
        const base = window.FUNCTIONS_URL || `https://${location.hostname}`;
        const url = new URL(`/api/${endpointName}`, base);

        await this._ensureLocalHostKey();
        if(ensureFunctionKey) {
            await this._ensureFunctionKey();
        }

        if (this.state.functionKey)
            url.searchParams.set('code', encodeURIComponent(this.state.functionKey));
        
        let body = method == 'GET' ? null : {
            ...queryParams,
            connectionId: this.state?.hubConnection?.connection?.connectionId ?? null,
            messageSourceId: this._messageSourceId
        };

        const headers = { 'Content-Type': 'application/json' };
        if (this.state.functionKey) headers['x-functions-key'] = this.state.functionKey;
        if (this.state.localHostKey) headers['x-local-host-key'] = this.state.localHostKey;

        try{
            const res = await fetch(url.toString(), { 
                method: method, 
                headers,
                body: body ? JSON.stringify(body) : null 
            });

            if (!res.ok) {
                console.log(`${endpointName} failed: ` + res.status);
            }
            
            return res;
        } catch (err) {
            console.log(`${endpointName} failed: ${err}`);
            return {};
        }
    }

    async _negotiate() {
        const result = await this._performPost('negotiate');
        if(result.status) {
            return result.json();
        } else {
            return "";
        }
    }
    
    async _addToGroup(groupName) {
        await this._performPost('AddToGroup', {eventId: groupName});
    }

    async _removeFromGroup(groupName) {
        await this._performPost('RemoveFromGroup', {eventId: groupName});
    }

    async sendTokenUsed(token) {
        await this.ensureConnectedToEvent(this.state.event.id);
        await this._performPost('SendTokenUsed', {eventId: this.state.event.id, token: token});
    }

    async _joinEvent() {
        await this._performPost('JoinEvent', {eventId: this.state.event.id});
    }

    async _ensureLocalHostKey() {
        if(this.state.localHostKey === null) {
            // Only try to load local host key when running on localhost
            const isLocal = this._isLocalHost(window.location.hostname);
            if (!isLocal) {
                // Not running locally, no need for local host key
                this.state.localHostKey = '';
                return;
            }

            try {
                const res = await fetch('../public/config.json');
                if(res.ok) {
                    const obj = await res.json();
                    this.state.localHostKey = obj.localHostKey;
                } else {
                    this.state.localHostKey = '';
                }
            } catch (err) {
                // Config file not found - this is fine for production
                this.state.localHostKey = '';
            }
        }
    }

    _isLocalHost(hostname) {
        if (!hostname) return false;

        hostname = hostname.toLowerCase();

        const localPatterns = [
            'localhost',
            '127.',
            '192.168.',
            '::1'
        ];

        return localPatterns.some(pattern => hostname.startsWith(pattern));
    }

    async _ensureFunctionKey() {
        if(this.state.functionKey === null) {
            const res = await this._performAnonymousGet('GetFunctionKey');
            if(res.ok) {
                const json = await res.json();
                this.state.functionKey = json.FunctionKey ?? json.functionKey;
            }
        }
    }

    async resetEvent() {
        await this.ensureConnectedToEvent(this.state.event.id);
        await this._performPost('ResetEvent', {eventId: this.state.event.id});
    }

    async sendEventDetails(eventName, nextToken) {
        await this.ensureConnectedToEvent(this.state.event.id);
        this._sendEventDetailsDebounced(eventName, nextToken);
    }

    _inferEntryMethod(athleteId) {
        // If no athlete ID, it was probably QR mode
        if (!athleteId) return 'qr';
        // Otherwise default to manual (includes scan results)
        return 'manual';
    }

    _mergeAssignments(assignments) {
        // Merge incoming assignments with local state
        assignments.forEach(incoming => {
            const position = parseInt(incoming.Position.replace('P', ''));
            const existing = this.state.assignments.find(a => a.token === position);

            if (!existing) {
                // New assignment, add it
                this.state.assignments.push({
                    token: position,
                    athleteBarcode: incoming.AthleteId || '',
                    athleteName: incoming.AthleteName || '',
                    timestamp: incoming.Timestamp,
                    entryMethod: this._inferEntryMethod(incoming.AthleteId),
                    connectionId: incoming.ConnectionId,
                    isLocal: false
                });
            } else {
                // Existing assignment - apply conflict resolution
                // Most recent timestamp wins, with connectionId as tiebreaker
                const shouldUpdate = incoming.Timestamp > existing.timestamp ||
                    (incoming.Timestamp === existing.timestamp && incoming.ConnectionId > existing.connectionId);

                if (shouldUpdate) {
                    existing.athleteBarcode = incoming.AthleteId || '';
                    existing.athleteName = incoming.AthleteName || '';
                    existing.timestamp = incoming.Timestamp;
                    existing.entryMethod = this._inferEntryMethod(incoming.AthleteId);
                    existing.connectionId = incoming.ConnectionId;
                    existing.isLocal = false;

                    console.log(`Updated token ${position} with newer data (timestamp: ${incoming.Timestamp}, connectionId: ${incoming.ConnectionId})`);
                }
            }
        });

        // Trigger a save to localStorage
        this.state.assignments = [...this.state.assignments];
    }

    async sendTokenAssignments(assignments) {
        await this.ensureConnectedToEvent(this.state.event.id);

        // Convert assignments to the backend format
        const payload = assignments.map(a => ({
            Position: `P${String(a.token).padStart(4, '0')}`,
            AthleteId: a.athleteBarcode || '',
            AthleteName: a.athleteName || '',
            ConnectionId: a.connectionId || this.state.connectionId,
            Timestamp: a.timestamp
        }));

        await this._performPost('SendTokenAssignments', {
            eventId: this.state.event.id,
            assignments: payload
        });
    }

    getRecentAssignments(count = 5) {
        // Get the most recent local assignments
        return this.state.assignments
            .filter(a => a.isLocal)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, count);
    }

    async requestFullHistory() {
        await this.ensureConnectedToEvent(this.state.event.id);
        await this._performPost('RequestFullHistory', {eventId: this.state.event.id});
        console.log('Requested full history from all devices');
    }

    async sendSyncDigest() {
        await this.ensureConnectedToEvent(this.state.event.id);

        const tokens = this.state.assignments.map(a => a.token);
        await this._performPost('SendSyncDigest', {
            eventId: this.state.event.id,
            count: this.state.assignments.length,
            tokens: tokens
        });
    }

    _startPeriodicSync() {
        // Send sync digest every 30 seconds to ensure devices stay in sync
        const syncInterval = 30000; // 30 seconds
        setInterval(() => {
            if (this.getIsConnected() && this.state.assignments.length > 0) {
                this.sendSyncDigest();
            }
        }, syncInterval);
    }
}