import { state } from './state.js';

export class UIService {
    constructor(state, signalRService) {
        this.state = state;
        this.signalR = signalRService;

        this.positionInput = document.getElementById('position');
        this.increaseBtn = document.getElementById('increase');
        this.decreaseBtn = document.getElementById('decrease');
        this.takeNextBtn = document.getElementById('takeNextToken');
        this.qrDiv = document.getElementById('qr');
        this.eventQrDiv = document.getElementById('eventQr');
        this.codeLabel = document.getElementById('code-label');
        this.nocodeLabel = document.getElementById('nocode-label');
        this.resetEventBtn = document.getElementById('resetEvent');

        this.setupListeners();
        this.updateTokenQR();
        this.updateEventQR();

        this.watchCurrentValue(state, (newValue) => {
            if(newValue == 0) {
                this.qrDiv.classList.add('blur');
                this.nocodeLabel.classList.remove('hide');
                this.codeLabel.classList.add('hide');
            } else {
                this.qrDiv.classList.remove('blur');
                this.nocodeLabel.classList.add('hide');
                this.codeLabel.classList.remove('hide');
            }
        });
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

    updateTokenQR() {
        const raw = this.positionInput.value;
        if (raw === "") {
            this.codeLabel.textContent = "";
            this.qrDiv.innerHTML = "";
            return;
        }

        const num = this.clamp(raw);
        this.signalR.sendPositionUsed(num);
        this.positionInput.value = num;
        const qrText = `P${this.pad(num)}`;
        this.state.currentValue = num;
        this.codeLabel.textContent = qrText;
        this.renderQR(this.qrDiv, qrText);
    }

    updateEventQR() {
        const raw = `http://127.0.0.1:5500?eventId=${encodeURIComponent(this.state.eventId)}`;
        this.renderQR(this.eventQrDiv, raw);
    }

    setupListeners() {
        this.takeNextBtn.addEventListener('click', () => {
            let val = this.state.nextSyncPosition > 0
                ? this.state.nextSyncPosition
                : this.clamp(this.positionInput.value) || 1;
            val = Math.min(val, 9999);
            this.positionInput.value = val;
            this.updateTokenQR();
        });

        this.resetEventBtn.addEventListener('click', () => {
            this.signalR.resetEvent();
        });

        this.increaseBtn.addEventListener('click', () => {
            let val = this.state.nextSyncPosition > 0
                ? this.state.nextSyncPosition
                : this.clamp(this.positionInput.value) || 1;
            val = Math.min(val, 9999);
            this.positionInput.value = val;
            this.updateTokenQR();
        });

        this.decreaseBtn.addEventListener('click', () => {
            let val = this.clamp(this.positionInput.value) || 1;
            val = Math.max(val - 1, 1);
            this.positionInput.value = val;
            this.updateTokenQR();
        });

        this.positionInput.addEventListener('input', () => {
            this.positionInput.value = this.positionInput.value.replace(/\D/g, '').slice(0, 4);
            this.updateTokenQR();
        });

        document.getElementById('menuToggle').addEventListener('click', () => {
            document.querySelector('aside').classList.toggle('open');
        });

        document.getElementById('menuClose').addEventListener('click', () => {
            document.querySelector('aside').classList.remove('open');
        });

        document.body.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
        window.addEventListener('resize', () => this.updateTokenQR());
    }

    watchCurrentValue(state, callback) {
        let lastValue = state.currentValue;

        function check() {
            if (state.currentValue !== lastValue) {
                lastValue = state.currentValue;
                callback(lastValue);
            }
            requestAnimationFrame(check);
        }

        requestAnimationFrame(check);
    }        
}