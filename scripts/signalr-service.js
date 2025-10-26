import { state } from './state.js';

export class SignalRService {
    constructor(state) {
        this.state = state;
        this._connectedEventId = null;
        this._connectLock = null;
        this._lastMessageReceived = null;
        this._messageSouceId = Math.random().toString(36).slice(2, 8); // 6-char random string,
        this._startPeriodicLivelinessCheck();
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
        const maxQuietMs = 10000;
        setInterval(() => {
            this.ensureConnectedToEvent().then(() => {
                // If we haven't received a message in a little while, send out a PING to ensure we're still alive.
                let timeSinceLastMessageReceived = Date.now() - (this._lastMessageReceived ?? 0);
                if(timeSinceLastMessageReceived > maxQuietMs) {
                    console.log(`It's been more than ${maxQuietMs}ms since the last received message`);
                    this.pingEvent();
                }
            })}, checkInterval
        );
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

                // A new device has been added to an event. Everyone sends their current state so it
                // definitely syncs up.
                this.state.hubConnection.on('deviceAddedToEvent', (messageSourceId, eventId) => {
                    if(messageSourceId == this._messageSouceId) return;

                    if(this.state.event.nextToken || this.state.event.name) {
                        this.sendEventDetails(this.state.event.name, this.state.event.nextToken);
                    }
                    this._lastMessageReceived = Date.now();
                    console.log('Received deviceAddedToEvent:', messageSourceId, eventId, this.state);
                });

                // The event's details have been updated, possibly by another device.
                this.state.hubConnection.on('setEventDetails', (messageSourceId, eventId, eventName, nextToken) => {
                    this.state.event.name = eventName || 'Unnamed Event';
                    
                    const num = Number(nextToken);
                    if(Number.isInteger(num) && num > 0 && this.state.event.nextToken != num) {
                        this.state.event.nextToken = num;
                        this.state.event.currentToken = 0;
                    }
                    this._lastMessageReceived = Date.now();
                    console.log('Received setEventDetails:', messageSourceId, eventId, eventName, nextToken, this.state);
                });

                // A device somewhere, possibly this one, has pinged the event. Whatever the reason, we now know that we're active.
                this.state.hubConnection.on('pingEvent', (messageSourceId, eventId) => {
                    this._lastMessageReceived = Date.now();
                    console.log('Received pingEvent:', messageSourceId, eventId, this.state);
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

    async _performPost(endpointName, queryParams) {
        const base = window.FUNCTIONS_URL || `https://${location.hostname}`;
        const url = new URL(`/api/${endpointName}`, base);

        if (window.FUNCTION_KEY) 
            url.searchParams.set('code', encodeURIComponent(window.FUNCTION_KEY));
        
        const body = {
            ...queryParams,
            connectionId: this.state?.hubConnection?.connection?.connectionId ?? null,
            messageSourceId: this._messageSouceId
        };

        console.log(`Calling ${url.toString()} with body:`, body);

        const headers = { 'Content-Type': 'application/json' };
        if (window.FUNCTION_KEY) headers['x-functions-key'] = window.FUNCTION_KEY;

        try{
            const res = await fetch(url.toString(), { 
                method: 'POST', 
                headers,
                body: JSON.stringify(body) 
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

    async resetEvent() {
        await this.ensureConnectedToEvent(this.state.event.id);
        await this._performPost('ResetEvent', {eventId: this.state.event.id});
    }

    async sendEventDetails(eventName, nextToken) {
        await this.ensureConnectedToEvent(this.state.event.id);
        await this._performPost('SendEventDetails', {
            eventId: this.state.event.id,
            eventName: eventName,
            nextToken: nextToken
        });
    }

    async pingEvent() {
        await this.ensureConnectedToEvent(this.state.event.id);
        await this._performPost('PingEvent', {eventId: this.state.event.id});
    }    
}