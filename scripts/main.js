import { state, StateService } from './state.js';
import { SignalRService } from './signalr-service.js';
import { UIService } from './ui-service.js';

(async () => {

    const urlParams = new URLSearchParams(window.location.search);
    let eventId = urlParams.get('eventId');
    if(eventId){
        eventId = eventId;
    }

    if(!eventId) {
        let expiryDate = new Date();
        expiryDate.setHours(expiryDate.getHours() + 12);
        eventId = getNewEventId();

        const url = new URL(window.location);
        url.searchParams.set('eventId', eventId);
        window.history.replaceState({}, '', url);
    }

    state.event.id = eventId;
    console.log(state.event.id);

    const signalR = new SignalRService(state);
    await signalR.ensureConnectedToEvent();

    new UIService(state, signalR);
    const stateService = new StateService(state);

    stateService.loadFromCookie(eventId);

    function getNewEventId() {
        return Math.random().toString(36).slice(2, 8); // 6-char random string
    }
})();