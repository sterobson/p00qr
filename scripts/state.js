export const state = {
    event: {
        id: '',
        name: 'New event',
        currentToken: 0,
        nextToken: 1
    },
    hubConnection: null,
};

export class StateService {
    constructor(state) {
        this.state = state;

        this.watch(() => this.state.event.name, _ => this.saveToCookie());
        this.watch(() => this.state.event.id, _ => this.saveToCookie());
        this.watch(() => this.state.event.currentToken, _ => this.saveToCookie());
        this.watch(() => this.state.event.nextToken, _ => this.saveToCookie());
    }

    saveToCookie() {
        console.log(this.state);
        const cookieValue = encodeURIComponent(JSON.stringify(this.state.event));
        document.cookie = `event=${cookieValue}; path=/; max-age=3600`;
    }

    loadFromCookie() {
        const match = document.cookie.match(new RegExp('(^| )event=([^;]+)'));
        if(match) {
            this.state.event = JSON.parse(decodeURIComponent(match[2]));
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