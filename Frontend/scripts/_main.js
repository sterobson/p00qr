import { state } from './state.js';
import { SignalRService } from './signalr-service.js';
import { UIService } from './ui-service.js';

(async () => {

    const urlParams = new URLSearchParams(window.location.search);
    let eventId = atob(urlParams.get('eventId'));
    if(!eventId) {
        let expiryDate = new Date();
        expiryDate.setHours(expiryDate.getHours() + 12);
        eventId = generateExpiringEventId(expiryDate);

        const url = new URL(window.location);
        url.searchParams.set('eventId', btoa(eventId));
        window.history.replaceState({}, '', url);
    }

    state.eventId = eventId;
    console.log(state.eventId);

    const signalR = new SignalRService(state);
    await signalR.startHub();
    await signalR.addToGroup(state.eventId);

    new UIService(state, signalR);

    function generateExpiringEventId(expireDate = new Date()) {
        // Round to the nearest hour
        expireDate.setMinutes(0, 0, 0);

        const timestamp = expireDate.toISOString().replace(/[-:T]/g, '').slice(0, 10); // YYYYMMDDHH
        const random = Math.random().toString(36).slice(2, 8); // 6-char random string
        return `${random}-${timestamp}`;
    }
})();