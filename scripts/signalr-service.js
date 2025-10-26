import { state } from './state.js';

export class SignalRService {
    constructor(state) {
        this.state = state;
        this.connectedEventId = null;
        this._connectLock = null;
    }

    getIsConnected() {
        return this.state.hubConnection && this.state.hubConnection.state == signalR.HubConnectionState.Connected; 
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
            if (!this.getIsConnected()) {
                await this._startHub();
                this.connectedEventId = null;
            }

            if(this.connectedEventId !== this.state.event.id) {
                // If the connection is already in a different group, remove it first, otherwise we might get
                // messages for multiple events, which isn't ideal.
                if(this.connectedEventId) {
                    await this._removeFromGroup(this.connectedEventId);
                }

                await this._addToGroup(this.state.event.id);
                await this._joinEvent();
                this.connectedEventId = this.state.event.id;
            }
        } finally {
            resolveLock();
            this._connectLock = null;
        }
    }

    async _negotiate() {
        const base = window.FUNCTIONS_URL || `https://${location.hostname}`;
        let url = new URL('/api/negotiate', base);
        if (window.FUNCTION_KEY) url += '?code=' + encodeURIComponent(window.FUNCTION_KEY);

        const res = await fetch(url, { method: 'POST' });
        if (!res.ok) throw new Error('negotiate failed: ' + res.status);
        return await res.json();
    }

    async _startHub() {
        if (typeof signalR === 'undefined') {
            console.warn('SignalR client not loaded.');
            return;
        }

        const info = await this._negotiate();
        const accessToken = info.accessToken || info.AccessToken || '';
        const hubUrl = info.url || info.Url;

        this.state.hubConnection = new signalR.HubConnectionBuilder()
            .withUrl(hubUrl, { accessTokenFactory: () => accessToken })
            // These are the number of milliseconds to wait 
            .withAutomaticReconnect([0, 2000, 2000, 2000, 5000, 10000])
            .build();

        this.state.hubConnection.onclose(() => {
            this.isConnected = false;
        });

        // A position has been used by a device in this event. Update our next position,
        // but only if needed.
        this.state.hubConnection.on('positionUsed', (eventId, position) => {
            // If the current max value is less than the position just used, update it.
            this.state.event.nextToken = Math.max(this.state.event.nextToken, position + 1);
            console.log('positionUsed:', eventId, position, this.state);
        }); 

        // The event has been reset to a certain position. Set that as the next position, and
        // set the current value to 0 so we don't get multiple devices with the same token.
        this.state.hubConnection.on('resetEvent', (eventId) => {
            this.state.event.nextToken = 1;
            this.state.event.currentToken = 0;
            console.log('resetevent:', eventId, this.state);
        });

        // A new device has been added to an event. Everyone sends their current state so it
        // definitely syncs up.
        this.state.hubConnection.on('deviceAddedToEvent', (eventId) => {
            if(this.state.event.nextToken || this.state.event.name) {
                this.sendEventDetails(this.state.event.name, this.state.event.nextToken);
            }
            console.log('deviceAddedToEvent:', eventId, this.state);
        });

        // The event's details have been updated, possibly by another device.
        this.state.hubConnection.on('setEventDetails', (eventId, eventName, nextPosition) => {
            
            this.state.event.name = eventName || 'Unnamed Event';
            
            const num = Number(nextPosition);
            if(Number.isInteger(num) && num > 0 && this.state.event.nextToken != num) {
                this.state.event.nextToken = num;
                this.state.event.currentToken = 0;
            }
            console.log('setEventDetails:', eventId, this.state);
        });

        await this.state.hubConnection.start();

        console.info('SignalR connected.');
    }

    async _addToGroup(groupName) {
        const base = window.FUNCTIONS_URL || `https://${location.hostname}`;
        const url = new URL('/api/AddToGroup', base);
        url.searchParams.set('eventId', groupName);
        url.searchParams.set('connectionId', this.state.hubConnection.connection.connectionId);

        const headers = { 'Content-Type': 'application/json' };
        if (window.FUNCTION_KEY) headers['x-functions-key'] = window.FUNCTION_KEY;

        const res = await fetch(url.toString(), { method: 'POST', headers });
        if (!res.ok) throw new Error('AddToGroup failed: ' + res.status);
    }

    async _removeFromGroup(groupName) {
        const base = window.FUNCTIONS_URL || `https://${location.hostname}`;
        const url = new URL('/api/RemoveFromGroup', base);
        url.searchParams.set('eventId', groupName);
        url.searchParams.set('connectionId', this.state.hubConnection.connection.connectionId);

        const headers = { 'Content-Type': 'application/json' };
        if (window.FUNCTION_KEY) headers['x-functions-key'] = window.FUNCTION_KEY;

        const res = await fetch(url.toString(), { method: 'POST', headers });
        if (!res.ok) throw new Error('RemoveFromGroup failed: ' + res.status);
    }

    async sendPositionUsed(position) {
        await this.ensureConnectedToEvent(this.state.event.id);

        const base = window.FUNCTIONS_URL || `https://${location.hostname}`;
        const url = new URL('/api/SendPositionUsed', base);
        url.searchParams.set('eventId', this.state.event.id);
        url.searchParams.set('position', position);

        const headers = { 'Content-Type': 'application/json' };
        if (window.FUNCTION_KEY) headers['x-functions-key'] = window.FUNCTION_KEY;

        const res = await fetch(url.toString(), { method: 'POST', headers });
        if (!res.ok) throw new Error('SendPositionUsed failed: ' + res.status);
    }

    async _joinEvent() {
        const base = window.FUNCTIONS_URL || `https://${location.hostname}`;
        const url = new URL('/api/JoinEvent', base);
        url.searchParams.set('eventId', this.state.event.id);

        const headers = { 'Content-Type': 'application/json' };
        if (window.FUNCTION_KEY) headers['x-functions-key'] = window.FUNCTION_KEY;

        const res = await fetch(url.toString(), { method: 'POST', headers });
        if (!res.ok) throw new Error('JoinEvent failed: ' + res.status);

        // If we're joining an event then we want to zero out the current position.
        this.state.event.currentToken = 0;
    }

    async resetEvent() {
        await this.ensureConnectedToEvent(this.state.event.id);

        const base = window.FUNCTIONS_URL || `https://${location.hostname}`;
        const url = new URL('/api/ResetEvent', base);
        url.searchParams.set('eventId', this.state.event.id);

        const headers = { 'Content-Type': 'application/json' };
        if (window.FUNCTION_KEY) headers['x-functions-key'] = window.FUNCTION_KEY;

        const res = await fetch(url.toString(), { method: 'POST', headers });
        if (!res.ok) throw new Error('ResetEvent failed: ' + res.status);
    }

    async sendEventDetails(eventName, nextPosition) {
        await this.ensureConnectedToEvent(this.state.event.id);

        const base = window.FUNCTIONS_URL || `https://${location.hostname}`;
        const url = new URL('/api/SendEventDetails', base);
        url.searchParams.set('eventId', this.state.event.id);
        url.searchParams.set('eventName', eventName);
        if(nextPosition) {
            url.searchParams.set('nextPosition', nextPosition);
        }

        const headers = { 'Content-Type': 'application/json' };
        if (window.FUNCTION_KEY) headers['x-functions-key'] = window.FUNCTION_KEY;

        const res = await fetch(url.toString(), { method: 'POST', headers });
        if (!res.ok) throw new Error('SendEventDetils failed: ' + res.status);
    }
}