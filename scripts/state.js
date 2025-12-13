export const state = {
    event: {
        id: '',
        name: 'New event',
        currentToken: 0,
        nextToken: 1
    },
    connectionId: '',
    hubConnection: null,
    functionKey: null,
    localHostKey: null,
    assignments: [], // {token, athleteBarcode, athleteName, timestamp, entryMethod, connectionId, isLocal}
    preferredMode: null, // 'scan' | 'manual' | 'qr'
    currentMode: null,
    isEditingExisting: false // true when editing from history, false when taking new token
};

export class StateService {
    constructor(state) {
        this.state = state;

        this.watch(() => this.state.event.name, _ => this.saveToCookie());
        this.watch(() => this.state.event.id, _ => this.saveToCookie());
        this.watch(() => this.state.event.currentToken, _ => this.saveToCookie());
        this.watch(() => this.state.event.nextToken, _ => this.saveToCookie());
        this.watch(() => this.state.assignments, _ => this.saveToLocalStorage());
        this.watch(() => this.state.preferredMode, _ => this.saveToLocalStorage());
    }

    saveToCookie() {
        const cookieValue = encodeURIComponent(JSON.stringify(this.state.event));
        document.cookie = `event=${cookieValue}; path=/; max-age=21600`; // 6 hours
    }

    loadFromCookie(eventId) {
        const match = document.cookie.match(new RegExp('(^| )event=([^;]+)'));
        if(match) {
            const loadedEvent = JSON.parse(decodeURIComponent(match[2]));
            if(loadedEvent && loadedEvent.id == eventId) {
                this.state.event = loadedEvent;
            }
        }
    }

    saveToLocalStorage() {
        try {
            const data = {
                eventId: this.state.event.id,
                assignments: this.state.assignments,
                preferredMode: this.state.preferredMode
            };
            localStorage.setItem('parkrunData', JSON.stringify(data));
        } catch(e) {
            console.warn('Failed to save to localStorage:', e);
        }
    }

    loadFromLocalStorage() {
        try {
            const json = localStorage.getItem('parkrunData');
            if(json) {
                const data = JSON.parse(json);
                if(data.eventId === this.state.event.id) {
                    this.state.assignments = data.assignments || [];
                    this.state.preferredMode = data.preferredMode || null;
                }
            }
        } catch(e) {
            console.warn('Failed to load from localStorage:', e);
        }
    }

    watch(getter, callback) {
        let lastValue = getter();

        function check() {
            let currentValue = getter();
            if (currentValue !== lastValue) {
                lastValue = currentValue;
                callback(currentValue);
            }
            requestAnimationFrame(check);
        }

        requestAnimationFrame(check);
    }        
}