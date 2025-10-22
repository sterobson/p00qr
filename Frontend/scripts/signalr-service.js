import { state } from './state.js';

export class SignalRService {
    constructor(state) {
        this.state = state;
    }

    async negotiate() {
        const base = window.FUNCTIONS_URL || `https://${location.hostname}`;
        let url = new URL('/api/negotiate', base);
        if (window.FUNCTION_KEY) url += '?code=' + encodeURIComponent(window.FUNCTION_KEY);

        const res = await fetch(url, { method: 'POST' });
        if (!res.ok) throw new Error('negotiate failed: ' + res.status);
        return await res.json();
    }

    async startHub() {
        if (typeof signalR === 'undefined') {
            console.warn('SignalR client not loaded.');
            return;
        }

        const info = await this.negotiate();
        const accessToken = info.accessToken || info.AccessToken || '';
        const hubUrl = info.url || info.Url;

        this.state.hubConnection = new signalR.HubConnectionBuilder()
            .withUrl(hubUrl, { accessTokenFactory: () => accessToken })
            .withAutomaticReconnect()
            .build();

        // A position has been used by a device in this event. Update our next position,
        // but only if needed.
        this.state.hubConnection.on('positionUsed', (eventId, position) => {
            console.log('positionUsed:', eventId, position);
            
            // If the current max value is less than the position just used, update it.
            this.state.nextSyncPosition = Math.max(this.state.nextSyncPosition, position + 1);
        });

        // The event has been reset to a certain position. Set that as the next position, and
        // set the current value to 0 so we don't get multiple devices with the same token.
        this.state.hubConnection.on('resetEvent', (eventId) => {
            console.log('resetevent:', eventId);
            
            this.state.nextSyncPosition = 1;
            this.state.currentValue = 0;
        });

        // A new device has been added to an event. Everyone sends their current state so it
        // definitely syncs up.
        this.state.hubConnection.on('deviceAddedToEvent', (eventId) => {
            console.log('deviceAddedToEvent:', eventId);
            
            this.sendPositionUsed(this.state.nextSyncPosition);
            this.state.nextSyncPosition = position;
        });

        await this.state.hubConnection.start();
        console.info('SignalR connected.');
    }

    async addToGroup(groupName) {
        const base = window.FUNCTIONS_URL || `https://${location.hostname}`;
        const url = new URL('/api/AddToGroup', base);
        url.searchParams.set('eventId', groupName);
        url.searchParams.set('connectionId', this.state.hubConnection.connection.connectionId);

        const headers = { 'Content-Type': 'application/json' };
        if (window.FUNCTION_KEY) headers['x-functions-key'] = window.FUNCTION_KEY;

        const res = await fetch(url.toString(), { method: 'POST', headers });
        if (!res.ok) throw new Error('AddToGroup failed: ' + res.status);
    }

    async sendPositionUsed(position) {
        const base = window.FUNCTIONS_URL || `https://${location.hostname}`;
        const url = new URL('/api/SendPositionUsed', base);
        url.searchParams.set('eventId', this.state.eventId);
        url.searchParams.set('position', position);

        const headers = { 'Content-Type': 'application/json' };
        if (window.FUNCTION_KEY) headers['x-functions-key'] = window.FUNCTION_KEY;

        const res = await fetch(url.toString(), { method: 'POST', headers });
        if (!res.ok) throw new Error('SendPositionUsed failed: ' + res.status);
    }

    async joinEvent() {
        const base = window.FUNCTIONS_URL || `https://${location.hostname}`;
        const url = new URL('/api/JoinEvent', base);
        url.searchParams.set('eventId', this.state.eventId);

        const headers = { 'Content-Type': 'application/json' };
        if (window.FUNCTION_KEY) headers['x-functions-key'] = window.FUNCTION_KEY;

        const res = await fetch(url.toString(), { method: 'POST', headers });
        if (!res.ok) throw new Error('JoinEvent failed: ' + res.status);

        // If we're joining an event then we want to zero out the current position.
        this.state.currentValue = 0;
    }

    async resetEvent() {
        const base = window.FUNCTIONS_URL || `https://${location.hostname}`;
        const url = new URL('/api/ResetEvent', base);
        url.searchParams.set('eventId', this.state.eventId);

        const headers = { 'Content-Type': 'application/json' };
        if (window.FUNCTION_KEY) headers['x-functions-key'] = window.FUNCTION_KEY;

        const res = await fetch(url.toString(), { method: 'POST', headers });
        if (!res.ok) throw new Error('ResetEvent failed: ' + res.status);
    }    
}