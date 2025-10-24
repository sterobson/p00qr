import { state } from './state.js';

export class UIService {
    constructor(state, signalRService) {
        this.state = state;
        this.signalR = signalRService;

        this.positionInput = document.getElementById('position');
        this.takeNextBtn = document.getElementById('takeNextToken');
        this.qrDiv = document.getElementById('qr');
        this.eventQrDiv = document.getElementById('eventQr');
        this.codeLabel = document.getElementById('code-label');
        this.nocodeLabel = document.getElementById('nocode-label');
        this.resetEventBtn = document.getElementById('resetEvent');
        this.eventSettingsOpenBtn = document.getElementById('event-settings-open');
        this.eventSettingsCloseBtn = document.getElementById('event-settings-close');
        this.eventSettingsMenu = document.getElementById('event-settings-menu');

        this.setupListeners();
        this.displayCurrentToken();
        this.displayNextToken();
        this.updateEventQR();

        document.getElementById('event-name-input').value = state.event.name;

        this.watch(() => state.event.name, (newValue) => {
            document.getElementById('event-name-input').value = newValue;
        });

        this.watch(() => state.event.currentToken, (newValue) => {
            this.displayCurrentToken();
        });

        this.watch(() => state.event.nextToken, (newValue) => {
            this.displayNextToken();
        });

        document.getElementById('save-event-settings').addEventListener('click', () => this.saveEventDetails(false));
        document.getElementById('save-new-event-settings').addEventListener('click', () => this.saveEventDetails(true));
    }

    saveEventDetails(saveAsNew = false) {
        const newName = document.getElementById('event-name-input').value.trim();
        const nextPosition = document.getElementById('position').value.trim();

        if(nextPosition !== "") {
            if(!this.isIntegerLike(nextPosition) || nextPosition < 1 || nextPosition > 9999) {
                this.alert('The next token must be a whole number between 1 and 9999, or left blank', '❌');
                return;
            }
        }

        if(saveAsNew) {

            function saveAsNewEventAndCloseMenus(state, signalRService) {
                const oldId = state.event.id;
                state.event = {
                    id: Math.random().toString(36).slice(2, 8), // 6-char random string,
                    name: newName || 'New event',
                    currentToken: 0,
                    nextToken: nextPosition || 1
                }

                // Update the URL
                const url = new URL(window.location);
                url.searchParams.set('eventId', btoa(state.event.id));
                window.history.replaceState({}, '', url);

                signalRService.removeFromGroup(oldId).then(() => {
                    signalRService.addToGroup(state.event.id).then(() => {
                        document.getElementById('event-settings-menu').classList.remove('open');
                        document.getElementById('menu').classList.remove('open');
                    });
                });
            }

            if(this.state.event.nextToken > 1 || this.state.event.currentToken > 0) {
                this.confirm('You are about to leave the existing event and create a new one. Are you sure you want to proceed?', '❔', () => saveAsNewEventAndCloseMenus(this.state, this.signalR));
            } else {
                saveAsNewEventAndCloseMenus(this.state, this.signalR);
            }

            return;
        }

        if(nextPosition !== "") {
            // We should warn the user that we're changing the next token for everyone.
            this.confirm('Changing the next token will affect all devices connected to this event. Are you sure you want to proceed?', '⚠️', () => {
                this.state.event.nextPosition = this.clamp(nextPosition);
                this.signalR.sendEventDetails(newName, this.clamp(nextPosition));
                document.getElementById('event-settings-menu').classList.remove('open');
            });
        } else {
            // Just changing the name, which is fine.
            if(newName.trim().length == 0 || newName.trim().length > 20) {
                this.alert('The event name must be between 1 and 20 characters.', '❌');
                return;
            }

            this.state.event.name = newName;
            this.signalR.sendEventDetails(newName);
            document.getElementById('event-settings-menu').classList.remove('open');
        }
    }

    isIntegerLike(value) {
        if (typeof value === 'number') {
            return Number.isInteger(value);
        }
        if (typeof value === 'string') {
            return /^-?\d+$/.test(value);
        }
        return false;
    }

    clamp(val) {
        if (val === "") return "";
        val = parseInt(val, 10);
        return isNaN(val) ? "" : Math.max(0, Math.min(9999, val));
    }

    pad(num) {
        return num.toString().padStart(4, '0');
    }

    getQRSize() {
        const rect = this.qrDiv.getBoundingClientRect();
        return Math.floor(Math.min(rect.width, rect.height) * 0.8);
    }

    renderQR(el, qrText) {
        el.innerHTML = "";
        if (!window.QRCode) return;
        const size = this.getQRSize();
        new QRCode(el, {
            text: qrText,
            width: size,
            height: size,
            correctLevel: QRCode.CorrectLevel.H
        });
    }

    displayCurrentToken() {
        if(this.state.event.currentToken <= 0) {
            this.qrDiv.classList.add('blur');
            this.nocodeLabel.classList.remove('hide');
            this.codeLabel.classList.add('hide');
            this.renderQR(this.qrDiv, 'Ste Rules!');                
        } else {
            this.qrDiv.classList.remove('blur');
            this.nocodeLabel.classList.add('hide');
            this.codeLabel.classList.remove('hide');

            const qrText = `P${this.pad(this.state.event.currentToken)}`;
            this.codeLabel.textContent = qrText;
            this.renderQR(this.qrDiv, qrText);                
        }
    }

    displayNextToken() {
        if(this.state.event.nextToken == 0) {
            this.takeNextBtn.textContent = 'Give next token';
            this.positionInput.placeholder = '';
        } else {
            this.takeNextBtn.textContent = 'Give token P' + this.pad(this.state.event.nextToken);
            this.positionInput.placeholder = this.state.event.nextToken;
        }
    }

    updateEventQR() {
        const domainPlusPath = `${window.location.origin}${window.location.pathname.replace(/\/$/, '')}`;
        const raw = `${domainPlusPath}?eventId=${encodeURIComponent(this.state.event.id)}`;
        this.renderQR(this.eventQrDiv, raw);
    }

    setupListeners() {
        this.takeNextBtn.addEventListener('click', () => {
            console.log(this.state);
            let val = this.state.event.nextToken > 0
                ? this.state.event.nextToken
                : 1;
            val = Math.min(val, 9999);
            this.state.event.currentToken = val;
            console.log(`Taking next token: P${this.pad(val)}`);
            this.signalR.sendPositionUsed(val);
        });

        // this.resetEventBtn.addEventListener('click', () => {
        //     this.confirm('Are you sure you want to reset the event? This will clear all positions for everyone sharing this event.', '⚠️', () => {
        //         this.signalR.resetEvent();
        //         document.querySelector('aside').classList.remove('open');
        //     });
        // });

        document.body.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
        window.addEventListener('resize', () => this.displayCurrentToken());

        // Wire up all of the open/close buttons based on 'opens' 'closes' attributes
        document.querySelectorAll('[opens]').forEach(button => {
            button.addEventListener('click', () => {
                const targetId = button.getAttribute('opens');
                const targetAside = document.getElementById(targetId);
                if (targetAside) {
                    targetAside.classList.add('open');
                }
            });
        });

        document.querySelectorAll('[closes]').forEach(button => {
            button.addEventListener('click', () => {
                const targetId = button.getAttribute('closes');
                const targetAside = document.getElementById(targetId);
                if (targetAside) {
                    targetAside.classList.remove('open');
                }
            });
        });
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

    confirm(text, icon = '⚠️', onConfirm = null, onCancel = null) {

        const modalElements = {
            modal: document.getElementById('modal'),
            text: document.getElementById('confirm-text'),
            icon: document.getElementById('confirm-icon'),
            confirmBtn: document.getElementById('confirm-button-1'),
            cancelBtn: document.getElementById('confirm-button-2'),
        }

        this.confirmOrAlert(modalElements, text, icon, onConfirm, onCancel);
    };

    alert(text, icon = '⚠️', onConfirm = null) {

        const modalElements = {
            modal: document.getElementById('alert'),
            text: document.getElementById('alert-text'),
            icon: document.getElementById('alert-icon'),
            confirmBtn: document.getElementById('alert-button'),
            cancelBtn: null,
        }

        this.confirmOrAlert(modalElements, text, icon, onConfirm, null);
    };

    confirmOrAlert(modalElements, text, icon = '⚠️', onConfirm = null, onCancel = null) {
        modalElements.text.textContent = text;
        modalElements.icon.textContent = icon;
        modalElements.modal.classList.remove('hidden');

        const button1Click = () => {
            if(modalElements.confirmBtn) modalElements.confirmBtn.removeEventListener('click', button1Click);
            if(modalElements.cancelBtn) modalElements.cancelBtn.removeEventListener('click', button2Click);
            
            if(onConfirm) onConfirm();
            modalElements.modal.classList.add('hidden');
        }

        const button2Click = () => {
            if(modalElements.confirmBtn) modalElements.confirmBtn.removeEventListener('click', button1Click);
            if(modalElements.cancelBtn) modalElements.cancelBtn.removeEventListener('click', button2Click);

            if(onCancel) onCancel();
            modalElements.modal.classList.add('hidden');
        }

        if(modalElements.confirmBtn) modalElements.confirmBtn.addEventListener('click', button1Click);
        if(modalElements.cancelBtn) modalElements.cancelBtn.addEventListener('click', button2Click);
    };    
}