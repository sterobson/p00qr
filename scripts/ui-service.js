import { state } from './state.js';

export class UIService {
    constructor(state, signalRService, barcodeService) {
        this.state = state;
        this.signalR = signalRService;
        this.barcodeService = barcodeService;

        // Get DOM elements
        this.positionInput = document.getElementById('position');
        this.takeNextBtn = document.getElementById('takeNextToken');
        this.qrDiv = document.getElementById('qr');
        this.eventQrDiv = document.getElementById('eventQr');
        this.codeLabel = document.getElementById('code-label');
        this.nocodeLabel = document.getElementById('nocode-label');
        this.eventSettingsMenu = document.getElementById('event-settings-menu');
        this.historyList = document.getElementById('history-list');
        this.historyEmpty = document.getElementById('history-empty');
        this.historyIcon = document.getElementById('history-icon');
        this.historyBadge = document.getElementById('history-badge');
        this.confirmationMessage = document.getElementById('confirmation-message');

        // Mode elements
        this.modeSelection = document.getElementById('mode-selection');
        this.contentArea = document.getElementById('content-area');
        this.scanModeDiv = document.getElementById('scan-mode');
        this.manualModeDiv = document.getElementById('manual-mode');
        this.qrModeDiv = document.getElementById('qr-mode');

        // Mode buttons
        this.modeScanBtn = document.getElementById('mode-scan');
        this.modeManualBtn = document.getElementById('mode-manual');
        this.modeQrBtn = document.getElementById('mode-qr');

        // Scan mode elements
        this.videoElement = document.getElementById('video');
        this.scanConfirmation = document.getElementById('scan-confirmation');
        this.scannedBarcodeSpan = document.getElementById('scanned-barcode');
        this.saveScanBtn = document.getElementById('save-scan');

        // Manual mode elements
        this.manualForm = document.getElementById('manual-form');
        this.athleteBarcodeInput = document.getElementById('athlete-barcode');
        this.athleteNameInput = document.getElementById('athlete-name');
        this.saveManualBtn = document.getElementById('save-manual');

        this.scannedData = null;

        this.setupListeners();
        this.setupWatchers();
        this.updateEventQR();
        this.updateUI();

        document.getElementById('event-name-input').value = state.event.name;
    }

    setupListeners() {
        // Take next token button
        this.takeNextBtn.addEventListener('click', () => this.handleTakeNextToken());

        // Mode selection buttons
        this.modeScanBtn.addEventListener('click', () => this.switchMode('scan'));
        this.modeManualBtn.addEventListener('click', () => this.switchMode('manual'));
        this.modeQrBtn.addEventListener('click', () => this.switchMode('qr'));

        // Scan mode save button
        this.saveScanBtn.addEventListener('click', () => this.handleSaveScan());

        // Manual mode form
        this.manualForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSaveManual();
        });

        // Event settings
        document.getElementById('save-event-settings').addEventListener('click', () => this.saveEventDetails(false));
        document.getElementById('save-new-event-settings').addEventListener('click', () => this.saveEventDetails(true));

        // Wire up open/close buttons based on 'opens' 'closes' attributes
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

        // Swipe gesture support
        this.setupSwipeGestures();

        // Prevent body scroll on mobile
        document.body.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
        window.addEventListener('resize', () => this.updateUI());
    }

    setupWatchers() {
        this.watch(() => this.state.event.id, () => this.updateEventQR());
        this.watch(() => this.state.event.name, (newValue) => {
            document.getElementById('event-name-input').value = newValue;
        });
        this.watch(() => this.state.event.currentToken, () => this.updateUI());
        this.watch(() => this.state.event.nextToken, () => this.updateUI());
        this.watch(() => this.eventSettingsMenu.classList.contains('open'), (isOpen) => {
            if(!isOpen) {
                this.positionInput.value = '';
            }
        });
        this.watch(() => this.state.assignments.length, () => {
            this.renderHistory();
            this.renderHistorySummary();
        });
        this.watch(() => this.state.connectionId, () => {
            this.updateEventQR();
            this.updateUI();
        });
        this.watch(() => this.signalR.getIsConnected(), (isConnected) => {
            const elements = document.getElementsByClassName('connection-state-disconnected');
            for (const el of elements) {
                if(isConnected) {
                    el.classList.add('hidden');
                } else {
                    el.classList.remove('hidden');
                }
            }
            if(!isConnected) {
                this.signalR.ensureConnectedToEvent();
            }
        });
    }

    setupSwipeGestures() {
        let touchStartX = 0;
        let touchEndX = 0;

        this.contentArea.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        this.contentArea.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            this.handleSwipe(touchStartX, touchEndX);
        }, { passive: true });
    }

    handleSwipe(startX, endX) {
        const threshold = 50;
        const diff = startX - endX;

        if (Math.abs(diff) < threshold || !this.state.currentMode) return;

        const modes = ['scan', 'manual', 'qr'];
        const currentIndex = modes.indexOf(this.state.currentMode);

        if (diff > 0 && currentIndex < modes.length - 1) {
            // Swipe left - next mode
            this.switchMode(modes[currentIndex + 1]);
        } else if (diff < 0 && currentIndex > 0) {
            // Swipe right - previous mode
            this.switchMode(modes[currentIndex - 1]);
        }
    }

    handleTakeNextToken() {
        // If editing an existing token, cancel just returns to give token state
        if (this.state.isEditingExisting) {
            this.returnToGiveTokenState();
            return;
        }

        // If we already have a current token and NOT in QR mode, this is a "Cancel" action
        if (this.state.event.currentToken > 0 && this.state.currentMode !== 'qr') {
            this.returnToGiveTokenState();
            return;
        }

        // If in QR mode with a current token, save empty assignment and advance to next token
        if (this.state.event.currentToken > 0 && this.state.currentMode === 'qr') {
            // Save assignment with no athlete data (can be filled in later from history)
            this.saveAssignment('', '');
            this.returnToGiveTokenState();
        }

        const val = this.state.event.nextToken > 0 ? this.state.event.nextToken : 1;
        const clampedVal = Math.min(val, 9999);

        this.state.event.currentToken = clampedVal;
        this.state.isEditingExisting = false;
        console.log(`Taking next token: P${this.pad(clampedVal)}`);
        this.signalR.sendTokenUsed(clampedVal);

        // Set mode to preferred or default to scan
        const mode = this.state.preferredMode || 'scan';
        this.state.currentMode = mode;
        this.switchMode(mode);
    }

    switchMode(mode, prefillData = null) {
        this.state.currentMode = mode;
        this.state.preferredMode = mode;

        // Stop any active scanning
        this.barcodeService.stopReadBarcode();
        this.scannedData = null;

        // Hide all mode content
        this.scanModeDiv.classList.add('hidden');
        this.manualModeDiv.classList.add('hidden');
        this.qrModeDiv.classList.add('hidden');

        // Update mode button states
        this.modeScanBtn.classList.remove('active');
        this.modeManualBtn.classList.remove('active');
        this.modeQrBtn.classList.remove('active');

        // Show selected mode
        if (mode === 'scan') {
            this.modeScanBtn.classList.add('active');
            this.scanModeDiv.classList.remove('hidden');
            this.scanConfirmation.classList.add('hidden');
            this.startScanning();
        } else if (mode === 'manual') {
            this.modeManualBtn.classList.add('active');
            this.manualModeDiv.classList.remove('hidden');

            // Pre-fill if data provided, otherwise clear
            if (prefillData) {
                this.athleteBarcodeInput.value = prefillData.athleteBarcode || '';
                this.athleteNameInput.value = prefillData.athleteName || '';
            } else {
                this.athleteBarcodeInput.value = '';
                this.athleteNameInput.value = '';
            }
            this.athleteBarcodeInput.focus();
        } else if (mode === 'qr') {
            this.modeQrBtn.classList.add('active');
            this.qrModeDiv.classList.remove('hidden');
            // Defer QR rendering until after the element is visible
            requestAnimationFrame(() => {
                this.renderPositionQR();
            });
        }

        // Update the UI to reflect mode change (especially for QR mode button text)
        this.updateUI();
    }

    startScanning() {
        this.barcodeService.startReadBarcode((result) => {
            if (result && result.text) {
                this.scannedData = result.text;
                this.scannedBarcodeSpan.textContent = result.text;
                this.scanConfirmation.classList.remove('hidden');
                this.barcodeService.stopReadBarcode();
            }
        });
    }

    handleSaveScan() {
        if (!this.scannedData) return;

        const normalizedBarcode = this.normalizeAthleteBarcode(this.scannedData);
        this.checkAndSaveAssignment(normalizedBarcode, '');
    }

    handleSaveManual() {
        const barcode = this.athleteBarcodeInput.value.trim();
        const name = this.athleteNameInput.value.trim();

        if (!barcode) {
            this.alert('Athlete barcode is required', '❌');
            return;
        }

        const normalizedBarcode = this.normalizeAthleteBarcode(barcode);
        this.checkAndSaveAssignment(normalizedBarcode, name);
    }

    checkAndSaveAssignment(athleteBarcode, athleteName) {
        // Skip duplicate check if barcode is empty (QR mode)
        if (!athleteBarcode) {
            this.saveAssignment(athleteBarcode, athleteName);
            this.returnToGiveTokenState();
            return;
        }

        // Check for duplicate athlete ID (excluding current token being edited)
        const duplicate = this.state.assignments.find(a =>
            a.athleteBarcode === athleteBarcode &&
            a.token !== this.state.event.currentToken
        );

        if (duplicate) {
            const duplicateTokenLabel = `P${this.pad(duplicate.token)}`;
            this.confirm(
                `This athlete (${athleteBarcode}) is already assigned to ${duplicateTokenLabel}. Do you want to assign them to this token as well?`,
                '⚠️',
                () => {
                    // User confirmed - save anyway
                    this.saveAssignment(athleteBarcode, athleteName);
                    this.returnToGiveTokenState();
                },
                () => {
                    // User cancelled - do nothing, stay on current screen
                }
            );
        } else {
            // No duplicate - save immediately
            this.saveAssignment(athleteBarcode, athleteName);
            this.returnToGiveTokenState();
        }
    }

    normalizeAthleteBarcode(barcode) {
        if (!barcode) return '';

        // Remove whitespace
        barcode = barcode.trim();

        // Check if it starts with 'A' or 'a'
        let numericPart = barcode;
        if (barcode.match(/^[Aa]/)) {
            numericPart = barcode.substring(1);
        }

        // Extract only digits
        numericPart = numericPart.replace(/\D/g, '');

        // Convert to number and back to string to remove leading zeros
        const number = parseInt(numericPart, 10);
        if (isNaN(number) || number < 1) {
            // Invalid barcode
            return barcode; // Return original if can't normalize
        }

        // Format as A + number (no leading zeros)
        return 'A' + number;
    }

    saveAssignment(athleteBarcode, athleteName) {
        const assignment = {
            token: this.state.event.currentToken,
            athleteBarcode: athleteBarcode,
            athleteName: athleteName || '',
            timestamp: Date.now(),
            entryMethod: this.state.currentMode // Remember which mode was used
        };

        // Remove any existing assignment for this token
        this.state.assignments = this.state.assignments.filter(a => a.token !== assignment.token);

        // Add new assignment
        this.state.assignments = [...this.state.assignments, assignment];

        console.log('Saved assignment:', assignment);

        // Show confirmation message
        this.showConfirmation(assignment);
    }

    showConfirmation(assignment) {
        const tokenLabel = `P${this.pad(assignment.token)}`;
        let message;

        if (assignment.athleteBarcode) {
            message = `${tokenLabel} assigned to ${assignment.athleteBarcode}`;
            if (assignment.athleteName) {
                message += ` (${assignment.athleteName})`;
            }
        } else {
            message = `${tokenLabel} recorded`;
        }

        this.confirmationMessage.textContent = message;
        this.confirmationMessage.classList.remove('hidden');

        // Hide after 3 seconds
        setTimeout(() => {
            this.confirmationMessage.classList.add('hidden');
        }, 3000);
    }

    returnToGiveTokenState() {
        this.state.event.currentToken = 0;
        this.state.currentMode = null;
        this.state.isEditingExisting = false;
        this.barcodeService.stopReadBarcode();
        this.updateUI();
    }

    renderHistory() {
        // Sort assignments by token number (descending)
        const sorted = [...this.state.assignments].sort((a, b) => b.token - a.token);

        if (sorted.length === 0) {
            this.historyEmpty.classList.remove('hidden');
            this.historyList.innerHTML = '';
            return;
        }

        this.historyEmpty.classList.add('hidden');
        this.historyList.innerHTML = sorted.map(assignment => {
            const tokenLabel = `P${this.pad(assignment.token)}`;
            const athleteInfo = assignment.athleteName
                ? `${assignment.athleteBarcode} (${assignment.athleteName})`
                : assignment.athleteBarcode || '[Empty - tap to add]';

            return `
                <div class="history-item" data-token="${assignment.token}">
                    <div class="history-token">${tokenLabel}</div>
                    <div class="history-athlete">${athleteInfo}</div>
                </div>
            `;
        }).join('');

        // Add click handlers to history items
        this.historyList.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => {
                const token = parseInt(item.getAttribute('data-token'));
                this.editHistoryToken(token);
            });
        });
    }

    renderHistorySummary() {
        const count = this.state.assignments.length;

        if (count === 0) {
            this.historyIcon.classList.add('hidden');
            return;
        }

        this.historyIcon.classList.remove('hidden');
        this.historyBadge.textContent = count;
    }

    editHistoryToken(token) {
        // Close the history menu
        document.getElementById('history-menu').classList.remove('open');
        document.getElementById('menu').classList.remove('open');

        // Set the current token to the selected one (editing existing, not creating new)
        this.state.event.currentToken = token;
        this.state.isEditingExisting = true;

        // Get the existing assignment
        const existingAssignment = this.state.assignments.find(a => a.token === token);

        // Determine which mode to use
        let mode;
        if (existingAssignment?.entryMethod) {
            // Use stored entry method if available
            mode = existingAssignment.entryMethod;
        } else if (existingAssignment && !existingAssignment.athleteBarcode) {
            // No athlete barcode means it was QR mode
            mode = 'qr';
        } else {
            // Has athlete barcode but no stored method - default to manual for editing
            mode = 'manual';
        }

        this.state.currentMode = mode;

        // Pass the existing data to switchMode for pre-filling
        this.switchMode(mode, existingAssignment);
    }

    updateUI() {
        const hasCurrentToken = this.state.event.currentToken > 0;

        if (hasCurrentToken) {
            // Show mode selection and content area
            this.modeSelection.classList.remove('hidden');
            this.contentArea.classList.remove('hidden');
            this.codeLabel.textContent = `P${this.pad(this.state.event.currentToken)}`;
            this.codeLabel.classList.remove('hide');
            this.nocodeLabel.classList.add('hide');

            // If editing existing, always show "Cancel"
            if (this.state.isEditingExisting) {
                this.takeNextBtn.textContent = 'Cancel';
            }
            // In QR mode (new token), show "Give token P####" for next token
            else if (this.state.currentMode === 'qr') {
                const nextToken = this.state.event.nextToken;
                if (nextToken === 0) {
                    this.takeNextBtn.textContent = 'Give next token';
                } else {
                    this.takeNextBtn.textContent = `Give token P${this.pad(nextToken)}`;
                }
            }
            // In other modes (new token), show "Cancel"
            else {
                this.takeNextBtn.textContent = 'Cancel';
            }
        } else {
            // Show "Give token" button
            this.modeSelection.classList.add('hidden');
            this.contentArea.classList.add('hidden');
            this.scanModeDiv.classList.add('hidden');
            this.manualModeDiv.classList.add('hidden');
            this.qrModeDiv.classList.add('hidden');
            this.codeLabel.classList.add('hide');
            this.nocodeLabel.classList.remove('hide');

            const nextToken = this.state.event.nextToken;
            if (nextToken === 0) {
                this.takeNextBtn.textContent = 'Give next token';
                this.positionInput.placeholder = '';
            } else {
                this.takeNextBtn.textContent = `Give token P${this.pad(nextToken)}`;
                this.positionInput.placeholder = nextToken;
            }
        }
    }

    renderPositionQR() {
        const qrText = `P${this.pad(this.state.event.currentToken)}`;
        this.renderQR(this.qrDiv, qrText);
    }

    updateEventQR() {
        const domainPlusPath = `${window.location.origin}${window.location.pathname.replace(/\/$/, '')}`;
        const raw = `${domainPlusPath}?eventId=${encodeURIComponent(this.state.event.id)}`;
        this.renderQR(this.eventQrDiv, raw);
    }

    getQRSize(el) {
        const rect = el.getBoundingClientRect();
        // Use viewport width as fallback if element not sized yet
        const size = rect.width > 0 ? rect.width : window.innerWidth * 0.8;
        return Math.floor(Math.min(size, 400) * 0.9); // Max 400px, use 90% of available
    }

    renderQR(el, qrText) {
        el.innerHTML = "";
        if (!window.QRCode) return;
        const size = this.getQRSize(el);
        new QRCode(el, {
            text: qrText,
            width: size,
            height: size,
            correctLevel: QRCode.CorrectLevel.H
        });
    }

    pad(num) {
        return num.toString().padStart(4, '0');
    }

    // Event settings methods
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
            const saveAsNewEventAndCloseMenus = (state, signalRService) => {
                state.event = {
                    id: Math.random().toString(36).slice(2, 8),
                    name: newName || 'New event',
                    currentToken: 0,
                    nextToken: nextPosition || 1
                };

                // Update the URL
                const url = new URL(window.location);
                url.searchParams.set('eventId', state.event.id);
                window.history.replaceState({}, '', url);

                signalRService.ensureConnectedToEvent().then(() => {
                    document.getElementById('event-settings-menu').classList.remove('open');
                    document.getElementById('menu').classList.remove('open');
                });
            };

            if(this.state.event.nextToken > 1 || this.state.event.currentToken > 0) {
                this.confirm('You are about to leave the existing event and create a new one. Are you sure you want to proceed?', '❔', () => saveAsNewEventAndCloseMenus(this.state, this.signalR));
            } else {
                saveAsNewEventAndCloseMenus(this.state, this.signalR);
            }

            return;
        }

        if(nextPosition !== "") {
            this.confirm('Changing the next token will affect all devices connected to this event. Are you sure you want to proceed?', '⚠️', () => {
                this.state.event.nextPosition = this.clamp(nextPosition);
                this.signalR.sendEventDetails(newName, this.clamp(nextPosition));
                document.getElementById('event-settings-menu').classList.remove('open');
            });
        } else {
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

    // Utility methods
    watch(getter, callback) {
        let hasChecked = false;
        let lastValue = getter();

        function check() {
            let currentValue = getter();
            if (currentValue !== lastValue || !hasChecked) {
                lastValue = currentValue;
                callback(currentValue);
            }

            hasChecked = true;
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
        };

        this.confirmOrAlert(modalElements, text, icon, onConfirm, onCancel);
    }

    alert(text, icon = '⚠️', onConfirm = null) {
        const modalElements = {
            modal: document.getElementById('alert'),
            text: document.getElementById('alert-text'),
            icon: document.getElementById('alert-icon'),
            confirmBtn: document.getElementById('alert-button'),
            cancelBtn: null,
        };

        this.confirmOrAlert(modalElements, text, icon, onConfirm, null);
    }

    confirmOrAlert(modalElements, text, icon = '⚠️', onConfirm = null, onCancel = null) {
        modalElements.text.textContent = text;
        modalElements.icon.textContent = icon;
        modalElements.modal.classList.remove('hidden');

        const button1Click = () => {
            if(modalElements.confirmBtn) modalElements.confirmBtn.removeEventListener('click', button1Click);
            if(modalElements.cancelBtn) modalElements.cancelBtn.removeEventListener('click', button2Click);

            if(onConfirm) onConfirm();
            modalElements.modal.classList.add('hidden');
        };

        const button2Click = () => {
            if(modalElements.confirmBtn) modalElements.confirmBtn.removeEventListener('click', button1Click);
            if(modalElements.cancelBtn) modalElements.cancelBtn.removeEventListener('click', button2Click);

            if(onCancel) onCancel();
            modalElements.modal.classList.add('hidden');
        };

        if(modalElements.confirmBtn) modalElements.confirmBtn.addEventListener('click', button1Click);
        if(modalElements.cancelBtn) modalElements.cancelBtn.addEventListener('click', button2Click);
    }
}
