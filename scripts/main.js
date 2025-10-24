import { state, StateService } from './state.js';
import { SignalRService } from './signalr-service.js';
import { UIService } from './ui-service.js';

(async () => {

    const urlParams = new URLSearchParams(window.location.search);
    let eventId = urlParams.get('eventId');
    if(eventId){
        eventId = atob(eventId);
    }

    if(!eventId) {
        let expiryDate = new Date();
        expiryDate.setHours(expiryDate.getHours() + 12);
        eventId = getNewEventId();

        const url = new URL(window.location);
        url.searchParams.set('eventId', btoa(eventId));
        window.history.replaceState({}, '', url);
    }

    state.event.id = eventId;
    console.log(state.event.id);

    const signalR = new SignalRService(state);
    await signalR.startHub();
    await signalR.addToGroup(state.event.id);

    new UIService(state, signalR);
    const stateService = new StateService(state);

    stateService.loadFromCookie();

    signalR.joinEvent();

    function getNewEventId() {
        return Math.random().toString(36).slice(2, 8); // 6-char random string
    }
})();