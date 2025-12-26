import { state } from './state.js';

export class UIService {
    constructor(state, signalRService, barcodeService) {
        this.state = state;
        this.signalR = signalRService;
        this.barcodeService = barcodeService;
        this.isTokenTransitioning = false; // Track if we're animating a token change
        this.lastRenderedToken = null; // Track last rendered token to avoid unnecessary animations
        this.showingSaveConfirmation = false; // Track if we're showing save confirmation
        this.scannedDataBeforeEdit = null; // Track scanned data before user edits
        this.userEditedAfterScan = false; // Track if user edited data after scan

        // Get DOM elements
        this.positionInput = document.getElementById('position');
        this.takeNextBtn = document.getElementById('takeNextToken');
        this.controls = document.querySelector('.controls');
        this.qrDiv = document.getElementById('qr');
        this.eventQrDiv = document.getElementById('eventQr');
        this.codeLabel = document.getElementById('code-label');
        this.nocodeLabel = document.getElementById('nocode-label');
        this.eventSettingsMenu = document.getElementById('event-settings-menu');
        this.historyList = document.getElementById('history-list');
        this.historyEmpty = document.getElementById('history-empty');
        this.historyIcon = document.getElementById('history-icon');
        this.historyBadge = document.getElementById('history-badge');
        this.historyCloseBtn = document.getElementById('history-close-btn');
        this.editCancelBtn = document.getElementById('edit-cancel-btn');
        this.editDeleteBtn = document.getElementById('edit-delete-btn');

        // Grid view elements
        this.tokenGridContainer = document.getElementById('token-grid-container');
        this.tokenGrid = document.getElementById('token-grid');

        // Virtual scrolling state
        this.renderedTokens = new Set();
        this.maxTokenToRender = 100; // Start with rendering up to 100
        this.qrObserver = null; // IntersectionObserver for lazy QR generation
        this.scrollSentinel = null; // Sentinel element for infinite scroll
        this.scrollObserver = null; // IntersectionObserver for infinite scroll

        // Mode elements
        this.modeSelection = document.getElementById('mode-selection');
        this.contentArea = document.getElementById('content-area');
        this.scanModeDiv = document.getElementById('scan-mode');
        this.manualModeDiv = document.getElementById('manual-mode');
        this.qrModeDiv = document.getElementById('qr-mode');
        this.saveConfirmationView = document.getElementById('save-confirmation-view');
        this.saveConfirmationToken = document.getElementById('save-confirmation-token');

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

        // Render the token grid
        this.renderTokenGrid();

        // Hide controls initially (grid mode)
        this.controls.classList.add('hidden');

        document.getElementById('event-name-input').value = state.event.name;
    }

    setupListeners() {
        // Take next token button
        this.takeNextBtn.addEventListener('click', () => this.handleTakeNextToken());

        // Edit cancel button
        this.editCancelBtn.addEventListener('click', () => this.closeTokenDetail());

        // Edit delete button
        this.editDeleteBtn.addEventListener('click', () => this.handleDeleteAthleteData());

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

        // Handle ENTER key in barcode field - submit instead of tab to next field
        this.athleteBarcodeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.handleSaveManual();
            }
        });

        // Track if user edits data after scan
        this.athleteBarcodeInput.addEventListener('input', () => {
            if (this.scannedDataBeforeEdit) {
                this.userEditedAfterScan = true;
            }
        });
        this.athleteNameInput.addEventListener('input', () => {
            if (this.scannedDataBeforeEdit) {
                this.userEditedAfterScan = true;
            }
        });

        // Event settings
        document.getElementById('save-event-settings').addEventListener('click', () => this.saveEventDetails(false));
        document.getElementById('save-new-event-settings').addEventListener('click', () => this.saveEventDetails(true));

        // Share data
        document.getElementById('share-data').addEventListener('click', () => this.shareData());

        // History icon click - open history menu
        this.historyIcon.addEventListener('click', () => {
            document.getElementById('history-menu').classList.add('open');
            document.getElementById('menu').classList.add('open');
        });

        // History close button click - show options
        this.historyCloseBtn.addEventListener('click', () => {
            this.handleCloseHistory();
        });

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

        // Prevent body scroll on mobile only when modals/menus are open
        document.body.addEventListener('touchmove', (e) => {
            // Allow scrolling in the grid container
            if (e.target.closest('.token-grid-container')) {
                return;
            }
            // Allow scrolling in content area (for mode content)
            if (e.target.closest('.content-area')) {
                return;
            }
            // Allow scrolling in aside menus
            if (e.target.closest('aside')) {
                return;
            }
            // Prevent scrolling on main body (prevents bounce effects)
            e.preventDefault();
        }, { passive: false });
        window.addEventListener('resize', () => this.updateUI());
    }

    setupWatchers() {
        this.watch(() => this.state.event.id, () => this.updateEventQR());
        this.watch(() => this.state.event.name, (newValue) => {
            document.getElementById('event-name-input').value = newValue;
        });
        this.watch(() => this.state.event.currentToken, () => this.updateUI());
        this.watch(() => this.state.event.nextToken, () => {
            this.updateUI();
            this.updateGridItemUsedStatus();
            // Scroll to the new next token if we're in grid view
            if (this.state.event.currentToken === 0 && !this.tokenGridContainer.classList.contains('hidden')) {
                requestAnimationFrame(() => {
                    this.scrollToHighestToken();
                });
            }
        });
        this.watch(() => this.eventSettingsMenu.classList.contains('open'), (isOpen) => {
            if(!isOpen) {
                this.positionInput.value = '';
            }
        });
        // Watch for any changes to assignments (additions, deletions, or edits)
        this.watch(() => JSON.stringify(this.state.assignments), () => {
            this.renderHistory();
            this.renderHistorySummary();
            this.renderInlineHistory();
            this.updateGridItemUsedStatus();
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

        const modes = ['qr', 'manual', 'scan'];
        const currentIndex = modes.indexOf(this.state.currentMode);

        if (diff > 0 && currentIndex < modes.length - 1) {
            // Swipe left - next mode
            this.switchMode(modes[currentIndex + 1]);
        } else if (diff < 0 && currentIndex > 0) {
            // Swipe right - previous mode
            this.switchMode(modes[currentIndex - 1]);
        }
    }

    disableAndFadeButton() {
        // Disable button and start fade to gray
        this.takeNextBtn.disabled = true;
        this.takeNextBtn.classList.add('fading-out');

        // After 0.5 seconds, start fading back
        setTimeout(() => {
            this.takeNextBtn.classList.remove('fading-out');
            this.takeNextBtn.classList.add('fading-in');

            // After another 0.5 seconds, re-enable button
            setTimeout(() => {
                this.takeNextBtn.classList.remove('fading-in');
                this.takeNextBtn.disabled = false;
            }, 500);
        }, 500);
    }

    handleTakeNextToken() {
        // If in detail modal mode (button says "Done"), close the modal
        if (this.takeNextBtn.textContent === 'Done') {
            this.closeTokenDetail();
            return;
        }

        // If showing save confirmation, advance to next token
        if (this.showingSaveConfirmation) {
            this.advanceToNextTokenFromConfirmation();
            return;
        }

        // If we have a current token, check for unsaved data before advancing
        if (this.state.event.currentToken > 0) {
            // Check if the current token has already been saved
            const currentTokenAssignment = this.state.assignments.find(
                a => a.token === this.state.event.currentToken && a.isLocal
            );

            // Check if in manual or scan mode
            if (this.state.currentMode === 'manual' || this.state.currentMode === 'scan') {
                const barcode = this.athleteBarcodeInput.value.trim();
                const name = this.athleteNameInput.value.trim();
                const hasScannedData = this.scannedData ? true : false;

                // Check if assignment has actual athlete data
                const hasAthleteInAssignment = currentTokenAssignment && currentTokenAssignment.athleteBarcode;

                // Check if there's entered/scanned data and it hasn't been saved yet
                if ((barcode || name || hasScannedData) && !hasAthleteInAssignment) {
                    this.confirm(
                        `You have unsaved athlete data for P${this.pad(this.state.event.currentToken)}. Discard and move to next token?`,
                        '⚠️',
                        () => {
                            // Clear editing mode
                            this.state.isEditingExisting = false;
                            // Disable and fade button
                            this.disableAndFadeButton();
                            // User confirmed - trigger animation directly
                            this.animateTokenChange(() => {
                                const nextTokenNum = this.state.event.nextToken > 0 ? this.state.event.nextToken : this.state.event.currentToken + 1;
                                this.state.event.currentToken = Math.min(nextTokenNum, 9999);
                                this.state.event.nextToken = Math.min(nextTokenNum + 1, 9999);
                                this.signalR.sendTokenUsed(this.state.event.currentToken);
                                this.athleteBarcodeInput.value = '';
                                this.athleteNameInput.value = '';
                                this.scannedData = null;
                                this.updateModeContent();
                            });
                        },
                        () => {
                            // User cancelled - stay on current screen
                        }
                    );
                    return; // Stop here, animation triggered in callback
                }

                // Check if there's NO athlete entered at all and no saved athlete data
                if (!barcode && !name && !hasScannedData && !hasAthleteInAssignment) {
                    this.confirm(
                        `No athlete has been assigned to P${this.pad(this.state.event.currentToken)}. Move to next token anyway?`,
                        '⚠️',
                        () => {
                            // Clear editing mode
                            this.state.isEditingExisting = false;
                            // Disable and fade button
                            this.disableAndFadeButton();
                            // User confirmed - save empty assignment then animate
                            this.saveAssignment('', '');
                            this.animateTokenChange(() => {
                                const nextTokenNum = this.state.event.nextToken > 0 ? this.state.event.nextToken : this.state.event.currentToken + 1;
                                this.state.event.currentToken = Math.min(nextTokenNum, 9999);
                                this.state.event.nextToken = Math.min(nextTokenNum + 1, 9999);
                                this.signalR.sendTokenUsed(this.state.event.currentToken);
                                this.athleteBarcodeInput.value = '';
                                this.athleteNameInput.value = '';
                                this.scannedData = null;
                                this.updateModeContent();
                            });
                        },
                        () => {
                            // User cancelled - stay on current screen
                        }
                    );
                    return; // Stop here, animation triggered in callback
                }
            }

            // Clear editing mode when advancing to next token
            this.state.isEditingExisting = false;

            // Disable and fade button
            this.disableAndFadeButton();

            // No unsaved data - animate token change for all modes
            this.animateTokenChange(() => {
                const nextTokenNum = this.state.event.nextToken > 0 ? this.state.event.nextToken : this.state.event.currentToken + 1;
                this.state.event.currentToken = Math.min(nextTokenNum, 9999);
                this.state.event.nextToken = Math.min(nextTokenNum + 1, 9999);
                console.log(`Advanced to token: P${this.pad(this.state.event.currentToken)}`);
                this.signalR.sendTokenUsed(this.state.event.currentToken);
                this.athleteBarcodeInput.value = '';
                this.athleteNameInput.value = '';
                this.scannedData = null;
                this.updateModeContent();
            });
            return;
        }

        // In grid mode, this shouldn't be called without a current token
        // Just do nothing
        console.log('handleTakeNextToken called without current token in grid mode');
    }

    switchMode(mode, prefillData = null) {
        const previousMode = this.state.currentMode;
        this.state.currentMode = mode;
        this.state.preferredMode = mode;

        // Stop any active scanning
        this.barcodeService.stopReadBarcode();
        this.scannedData = null;

        // Batch DOM updates to reduce flickering
        requestAnimationFrame(() => {
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

                // Pre-fill if data provided, otherwise preserve existing values
                if (prefillData) {
                    this.athleteBarcodeInput.value = prefillData.athleteBarcode || '';
                    this.athleteNameInput.value = prefillData.athleteName || '';
                }
                // If no prefillData, keep existing values (don't clear)
                this.athleteBarcodeInput.focus();
            } else if (mode === 'qr') {
                this.modeQrBtn.classList.add('active');
                this.qrModeDiv.classList.remove('hidden');
                // Render QR code (no animation in switchMode - animations handled by animateTokenChange)
                requestAnimationFrame(() => {
                    this.renderPositionQR();
                });
            }

            // Update the UI to reflect mode change (especially for QR mode button text)
            this.updateUI();
        });
    }

    animateTokenChange(callback) {
        // Get current mode div
        const currentMode = this.state.currentMode;
        let currentModeDiv;
        if (currentMode === 'qr') currentModeDiv = this.qrModeDiv;
        else if (currentMode === 'manual') currentModeDiv = this.manualModeDiv;
        else if (currentMode === 'scan') currentModeDiv = this.scanModeDiv;

        // Set transitioning flag and show loading spinner in header
        this.isTokenTransitioning = true;
        this.codeLabel.innerHTML = '<span class="spinner">⏳</span>';

        // Slide out to the right (0.5s)
        currentModeDiv.classList.add('sliding-out');

        // After sliding out, content is off screen - update it
        setTimeout(() => {
            currentModeDiv.classList.remove('sliding-out');

            // Execute the callback to update token and content
            if (callback) callback();

            // Get the new mode div (might have changed modes)
            const newMode = this.state.currentMode;
            let newModeDiv;
            if (newMode === 'qr') newModeDiv = this.qrModeDiv;
            else if (newMode === 'manual') newModeDiv = this.manualModeDiv;
            else if (newMode === 'scan') newModeDiv = this.scanModeDiv;

            // Position new content off screen to the left
            newModeDiv.classList.add('sliding-in');

            // Slide in from the left (0.5s)
            setTimeout(() => {
                newModeDiv.classList.remove('sliding-in');
                this.isTokenTransitioning = false;

                // Update header with new token number
                this.codeLabel.textContent = `P${this.pad(this.state.event.currentToken)}`;
            }, 500);
        }, 500);
    }

    animateFromHistory(callback) {
        // No longer needed with grid view - tokens are opened directly from grid
        // Just execute the callback if provided
        if (callback) callback();
    }

    updateModeContent() {
        // Update content based on current mode
        const mode = this.state.currentMode;
        if (mode === 'qr') {
            // Regenerate QR code with new token
            this.renderQR(this.qrDiv, `P${this.pad(this.state.event.currentToken)}`);
            // Save empty assignment for QR mode
            this.saveAssignment('', '');
        } else if (mode === 'manual') {
            // Form is already cleared by caller
        } else if (mode === 'scan') {
            // Reset scanning
            this.barcodeService.stopReadBarcode();
            this.scanConfirmation.classList.add('hidden');
            this.startScanning();
        }
    }

    animateToSaveConfirmation() {
        // Get current mode div
        const currentMode = this.state.currentMode;
        let currentModeDiv;
        if (currentMode === 'qr') currentModeDiv = this.qrModeDiv;
        else if (currentMode === 'manual') currentModeDiv = this.manualModeDiv;
        else if (currentMode === 'scan') currentModeDiv = this.scanModeDiv;

        // Slide out to the left (0.5s)
        currentModeDiv.classList.add('sliding-out');

        // After sliding out, show confirmation
        setTimeout(() => {
            currentModeDiv.classList.remove('sliding-out');
            currentModeDiv.classList.add('hidden');

            // Show save confirmation
            this.showingSaveConfirmation = true;
            this.saveConfirmationToken.textContent = `Token ${this.pad(this.state.event.currentToken)} saved`;
            this.saveConfirmationView.classList.remove('hidden');

            // Update UI to hide buttons
            this.updateUI();

            // Slide in confirmation from the right
            this.saveConfirmationView.classList.add('sliding-in');

            setTimeout(() => {
                this.saveConfirmationView.classList.remove('sliding-in');
            }, 500);
        }, 500);
    }

    advanceToNextTokenFromConfirmation() {
        // Disable and fade button
        this.disableAndFadeButton();

        // Slide out confirmation to the left
        this.saveConfirmationView.classList.add('sliding-out');

        setTimeout(() => {
            this.saveConfirmationView.classList.remove('sliding-out');
            this.saveConfirmationView.classList.add('hidden');
            this.showingSaveConfirmation = false;

            // Determine which mode to use for next token
            let nextMode;
            if (this.scannedDataBeforeEdit && !this.userEditedAfterScan) {
                // User scanned and didn't edit - go back to scan mode
                nextMode = 'scan';
            } else {
                // Stay in current mode
                nextMode = this.state.currentMode;
            }

            // Clear scan tracking
            this.scannedDataBeforeEdit = null;
            this.userEditedAfterScan = false;

            // Clear editing mode
            this.state.isEditingExisting = false;

            // Advance to next token
            const nextTokenNum = this.state.event.nextToken > 0 ? this.state.event.nextToken : this.state.event.currentToken + 1;
            this.state.event.currentToken = Math.min(nextTokenNum, 9999);
            this.state.event.nextToken = Math.min(nextTokenNum + 1, 9999);
            this.signalR.sendTokenUsed(this.state.event.currentToken);

            // Clear athlete inputs
            this.athleteBarcodeInput.value = '';
            this.athleteNameInput.value = '';
            this.scannedData = null;

            // Set mode
            this.state.currentMode = nextMode;
            this.switchMode(nextMode);

            // Update mode content
            this.updateModeContent();

            // Get the mode div for new token
            let modeDiv;
            if (nextMode === 'qr') modeDiv = this.qrModeDiv;
            else if (nextMode === 'manual') modeDiv = this.manualModeDiv;
            else if (nextMode === 'scan') modeDiv = this.scanModeDiv;

            // Position new content off screen to the left and slide in
            modeDiv.classList.add('sliding-in');

            setTimeout(() => {
                modeDiv.classList.remove('sliding-in');
            }, 500);
        }, 500);
    }

    animateToHistory() {
        // No longer needed with grid view - just close the modal
        this.closeTokenDetail();
    }

    startScanning() {
        this.barcodeService.startReadBarcode((result) => {
            if (result && result.text) {
                this.barcodeService.stopReadBarcode();
                // Track that we scanned data and switched to manual for confirmation
                this.scannedDataBeforeEdit = result.text;
                this.userEditedAfterScan = false;
                // Switch to manual entry mode with the scanned barcode pre-filled
                this.switchMode('manual', { athleteBarcode: result.text, athleteName: '' });
            }
        });
    }

    handleSaveScan() {
        if (!this.scannedData) return;

        const normalizedBarcode = this.normalizeAthleteBarcode(this.scannedData);

        // Clear editing mode before saving
        this.state.isEditingExisting = false;

        this.checkAndSaveAssignment(normalizedBarcode, '');
    }

    handleSaveManual() {
        const barcode = this.athleteBarcodeInput.value.trim();
        const name = this.athleteNameInput.value.trim();

        // Validate barcode format
        const validation = this.validateAthleteBarcode(barcode);
        if (!validation.valid) {
            this.alert(validation.error, '❌');
            return;
        }

        const normalizedBarcode = this.normalizeAthleteBarcode(barcode);

        // Clear editing mode before saving
        this.state.isEditingExisting = false;

        this.checkAndSaveAssignment(normalizedBarcode, name);
    }

    checkAndSaveAssignment(athleteBarcode, athleteName) {
        // Skip duplicate check if barcode is empty (QR mode)
        if (!athleteBarcode) {
            this.saveAssignment(athleteBarcode, athleteName);
            this.closeTokenDetail();
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
                    this.closeTokenDetail();
                },
                () => {
                    // User cancelled - do nothing, stay on current screen
                }
            );
        } else {
            // No duplicate - save immediately
            this.saveAssignment(athleteBarcode, athleteName);
            this.closeTokenDetail();
        }
    }

    validateAthleteBarcode(barcode) {
        if (!barcode) return { valid: false, error: 'Barcode is required' };

        // Remove whitespace
        barcode = barcode.trim();

        // Check format: optional A/a followed by 1-9 digits
        const regex = /^[Aa]?\d{1,9}$/;
        if (!regex.test(barcode)) {
            return {
                valid: false,
                error: 'Invalid barcode format. Must be A# (e.g., A1234567) where A is optional and # is 1-9 digits'
            };
        }

        return { valid: true };
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
            // Invalid barcode - return empty string
            return '';
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
            entryMethod: this.state.currentMode, // Remember which mode was used
            connectionId: this.state.connectionId,
            isLocal: true
        };

        // Remove any existing assignment for this token
        this.state.assignments = this.state.assignments.filter(a => a.token !== assignment.token);

        // Add new assignment
        this.state.assignments = [...this.state.assignments, assignment];

        console.log('Saved assignment:', assignment);

        // Send the 5 most recent local assignments to all other devices
        // Use setTimeout to ensure state update has completed
        setTimeout(() => {
            const recentAssignments = this.signalR.getRecentAssignments(5);
            console.log('Sending recent assignments:', recentAssignments);
            if (recentAssignments.length > 0) {
                this.signalR.sendTokenAssignments(recentAssignments);
            }
        }, 100);
    }

    handleCloseHistory() {
        // In grid view, just close the history menu
        document.getElementById('history-menu').classList.remove('open');
        document.getElementById('menu').classList.remove('open');
    }

    handleDeleteAthleteData() {
        this.confirm(
            `Delete athlete data from P${this.pad(this.state.event.currentToken)}?`,
            '🗑️',
            () => {
                // User confirmed - clear athlete data from the assignment
                this.saveAssignment('', '');
                // Close modal and return to grid
                this.closeTokenDetail();
            },
            () => {
                // User cancelled - do nothing
            }
        );
    }

    returnToGiveTokenState() {
        this.state.event.currentToken = 0;
        this.state.currentMode = null;
        this.state.isEditingExisting = false;
        this.lastRenderedToken = null; // Reset for next token animation
        this.barcodeService.stopReadBarcode();
        this.updateUI();
    }

    renderHistory() {
        // Always sort assignments by token number (descending - highest first)
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
                : assignment.athleteBarcode || '[Empty]';

            const remoteClass = assignment.isLocal ? '' : 'remote';
            const createdByLabel = assignment.isLocal ? '<div class="history-created-by">Created by you</div>' : '';

            return `
                <div class="history-item ${remoteClass}" data-token="${assignment.token}">
                    <div class="history-info">
                        <div class="history-token">${tokenLabel}</div>
                        <div class="history-athlete">${athleteInfo}</div>
                        ${createdByLabel}
                    </div>
                    <svg class="history-edit-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
                        <path d="M421.7 220.3L188.5 453.4L154.6 419.5L158.1 416H112C103.2 416 96 408.8 96 400V353.9L92.51 357.4C87.78 362.2 84.31 368 82.42 374.4L59.44 452.6C56.46 463.1 61.86 474.5 72.33 477.5C73.94 477.1 75.58 478.2 77.2 478.2C84.66 478.2 91.76 474.3 95.62 467.4L137.2 390.5L84.84 338.2C70.28 323.6 70.28 299.9 84.84 285.3L314.1 56.08C328.7 41.51 352.4 41.51 366.1 56.08L456.9 146.9C471.5 161.5 471.5 185.2 456.9 199.7L421.7 220.3zM492.7 58.75C519.8 85.88 519.8 129.1 492.7 156.1L411.7 237.1L274.9 100.3L355.9 19.27C382.1-7.85 426.1-7.85 453.3 19.27L492.7 58.75z"/>
                    </svg>
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
            this.historyBadge.classList.add('hidden');
            return;
        }

        this.historyIcon.classList.remove('hidden');
        this.historyBadge.classList.remove('hidden');
        this.historyBadge.textContent = count;
    }

    renderInlineHistory() {
        // No longer needed with grid view - history is shown in the grid itself
        // Keep method to avoid breaking watchers that call it
    }

    editHistoryToken(token) {
        // Close the history menu
        document.getElementById('history-menu').classList.remove('open');
        document.getElementById('menu').classList.remove('open');

        // Open the token detail using the grid's method
        this.openTokenDetail(token);
    }

    updateUI() {
        const hasCurrentToken = this.state.event.currentToken > 0;

        // If showing save confirmation, hide all buttons and disable mode selection
        if (this.showingSaveConfirmation) {
            this.editCancelBtn.classList.add('hidden');
            this.editDeleteBtn.classList.add('hidden');
            this.historyIcon.classList.add('hidden');
            this.historyBadge.classList.add('hidden');
            this.historyCloseBtn.classList.add('hidden');
            this.takeNextBtn.style.display = 'flex';
            this.takeNextBtn.textContent = 'Done';

            // Disable mode selection buttons
            this.modeScanBtn.disabled = true;
            this.modeManualBtn.disabled = true;
            this.modeQrBtn.disabled = true;
            return;
        }

        // Re-enable mode selection buttons if not in save confirmation
        this.modeScanBtn.disabled = false;
        this.modeManualBtn.disabled = false;
        this.modeQrBtn.disabled = false;

        if (hasCurrentToken) {
            // In modal mode - update UI for token detail view
            this.historyCloseBtn.classList.add('hidden');
            if (this.state.assignments.length > 0) {
                this.historyIcon.classList.remove('hidden');
                this.historyBadge.classList.remove('hidden');
            }

            // Only update label if not transitioning
            if (!this.isTokenTransitioning) {
                this.codeLabel.textContent = `P${this.pad(this.state.event.currentToken)}`;
            }
            this.codeLabel.classList.remove('hide');
            this.nocodeLabel.classList.add('hide');

            // If editing existing, show edit cancel button and style the label
            if (this.state.isEditingExisting) {
                this.editCancelBtn.classList.remove('hidden');
                this.codeLabel.classList.add('editing');

                // Show delete button only if assignment has athlete data
                const currentTokenAssignment = this.state.assignments.find(
                    a => a.token === this.state.event.currentToken
                );
                if (currentTokenAssignment && currentTokenAssignment.athleteBarcode) {
                    this.editDeleteBtn.classList.remove('hidden');
                } else {
                    this.editDeleteBtn.classList.add('hidden');
                }

                this.takeNextBtn.style.display = 'flex';
                this.takeNextBtn.textContent = 'Done';
            }
            // Not editing - show "Done" button
            else {
                this.editCancelBtn.classList.add('hidden');
                this.editDeleteBtn.classList.add('hidden');
                this.codeLabel.classList.remove('editing');
                this.takeNextBtn.style.display = 'flex';
                this.takeNextBtn.textContent = 'Done';
            }
        } else {
            // No current token - grid view mode
            this.editCancelBtn.classList.add('hidden');
            this.editDeleteBtn.classList.add('hidden');
            this.codeLabel.classList.remove('editing');

            // Show history badge if we have assignments
            if (this.state.assignments.length > 0) {
                this.historyIcon.classList.remove('hidden');
                this.historyBadge.classList.remove('hidden');
            } else {
                this.historyIcon.classList.add('hidden');
                this.historyBadge.classList.add('hidden');
            }
            this.historyCloseBtn.classList.add('hidden');

            const nextToken = this.state.event.nextToken;
            if (nextToken === 0) {
                this.positionInput.placeholder = '';
            } else {
                this.positionInput.placeholder = nextToken;
            }
        }
    }

    renderPositionQR() {
        const currentToken = this.state.event.currentToken;
        const qrText = `P${this.pad(currentToken)}`;

        // Simply render the QR code (animations handled by animateTokenChange)
        if (this.qrDiv.children.length > 0) {
            // QR exists - just update it
            this.renderQR(this.qrDiv, qrText);
        } else {
            // First render - fade in smoothly
            this.qrDiv.style.opacity = '0';
            this.renderQR(this.qrDiv, qrText);
            requestAnimationFrame(() => {
                this.qrDiv.style.transition = 'opacity 0.3s ease-in';
                this.qrDiv.style.opacity = '1';
            });
        }

        // Update last rendered token
        this.lastRenderedToken = currentToken;
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
        return Math.floor(Math.min(size, 400) * 0.675); // Max 400px, use 67.5% of available (75% of original size)
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

                // Clear all assignments for the new event
                state.assignments = [];

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

    // Share data as CSV
    async shareData() {
        // Filter assignments that have both token and athlete barcode
        const validAssignments = this.state.assignments.filter(a =>
            a.token && a.athleteBarcode && a.athleteBarcode.trim() !== ''
        );

        if (validAssignments.length === 0) {
            this.alert('No data to share. Please assign at least one athlete to a token.', '📋');
            return;
        }

        // Sort by token number
        const sorted = [...validAssignments].sort((a, b) => a.token - a.token);

        // Get current timestamp for header
        const now = new Date();
        const headerTimestamp = this.formatTimestamp(now);

        // Build CSV content
        let csv = `Start of File,${headerTimestamp},${this.state.event.name || 'token_generator'}\n`;

        sorted.forEach(assignment => {
            const token = `P${this.pad(assignment.token)}`;
            const timestamp = this.formatTimestamp(new Date(assignment.timestamp));
            csv += `${assignment.athleteBarcode},${token},${timestamp}\n`;
        });

        csv += '\n'; // Empty line at end

        // Create filename with event name and date
        const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
        const eventNameSafe = (this.state.event.name || 'event').replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `${eventNameSafe}_${dateStr}.csv`;

        // Check if Web Share API is available
        if (navigator.share && navigator.canShare) {
            try {
                const file = new File([csv], filename, { type: 'text/csv' });

                if (navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: 'Token Assignments',
                        text: `Token assignments for ${this.state.event.name || 'event'}`
                    });
                    console.log('Data shared successfully');
                } else {
                    // Fallback: download the file
                    this.downloadCsv(csv, filename);
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('Error sharing:', error);
                    // Fallback: download the file
                    this.downloadCsv(csv, filename);
                }
            }
        } else {
            // Fallback: download the file
            this.downloadCsv(csv, filename);
        }
    }

    downloadCsv(csvContent, filename) {
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    formatTimestamp(date) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
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

    // Grid view methods
    renderTokenGrid() {
        const highestToken = this.getHighestUsedToken();
        const nextToken = this.state.event.nextToken || 1;
        const maxToken = Math.max(highestToken + 20, nextToken + 20, this.maxTokenToRender);

        // Clear existing grid
        this.tokenGrid.innerHTML = '';
        this.renderedTokens.clear();

        // Set up intersection observer for lazy QR generation
        if (this.qrObserver) {
            this.qrObserver.disconnect();
        }

        this.qrObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const tokenDiv = entry.target;
                    this.generateQRForToken(tokenDiv);
                    this.qrObserver.unobserve(tokenDiv);
                }
            });
        }, {
            root: this.tokenGridContainer,
            rootMargin: '200px'
        });

        // Set up infinite scroll observer
        if (this.scrollObserver) {
            this.scrollObserver.disconnect();
        }

        this.scrollObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    // Load more tokens when sentinel is visible
                    this.loadMoreTokens();
                }
            });
        }, {
            root: this.tokenGridContainer,
            rootMargin: '500px'
        });

        // Render tokens from 1 to maxToken
        for (let i = 1; i <= maxToken; i++) {
            this.renderGridToken(i);
        }

        // Add scroll sentinel for infinite loading
        this.addScrollSentinel();

        // Scroll to show row containing highest token
        requestAnimationFrame(() => {
            this.scrollToHighestToken();
        });
    }

    loadMoreTokens() {
        // Add 50 more tokens (up to 9999)
        const currentMax = this.maxTokenToRender;
        this.maxTokenToRender = Math.min(currentMax + 50, 9999);

        for (let i = currentMax + 1; i <= this.maxTokenToRender; i++) {
            this.renderGridToken(i);
        }

        // Move sentinel to end (unless we hit max)
        if (this.scrollSentinel && this.scrollSentinel.parentNode) {
            if (this.maxTokenToRender < 9999) {
                // Unobserve before moving
                this.scrollObserver.unobserve(this.scrollSentinel);
                // Move to end
                this.tokenGrid.appendChild(this.scrollSentinel);
                // Re-observe after moving
                this.scrollObserver.observe(this.scrollSentinel);
            } else {
                // We've reached the max, remove sentinel
                this.scrollObserver.unobserve(this.scrollSentinel);
                this.scrollSentinel.remove();
            }
        }
    }

    addScrollSentinel() {
        // Remove existing sentinel
        if (this.scrollSentinel && this.scrollSentinel.parentNode) {
            this.scrollSentinel.remove();
        }

        // Create new sentinel
        this.scrollSentinel = document.createElement('div');
        this.scrollSentinel.className = 'scroll-sentinel';
        this.scrollSentinel.style.height = '1px';
        this.scrollSentinel.style.width = '100%';
        this.tokenGrid.appendChild(this.scrollSentinel);

        // Observe sentinel
        this.scrollObserver.observe(this.scrollSentinel);
    }

    renderGridToken(tokenNum) {
        if (this.renderedTokens.has(tokenNum)) return;

        const tokenDiv = document.createElement('div');
        tokenDiv.className = 'token-grid-item';
        tokenDiv.dataset.token = tokenNum;

        // Check if token is used and by whom
        const assignment = this.state.assignments.find(a => a.token === tokenNum);
        const nextToken = this.state.event.nextToken || 1;
        const isPrevious = tokenNum < nextToken;

        if (assignment) {
            tokenDiv.classList.add('used');
            if (assignment.isLocal) {
                tokenDiv.classList.add('used-local');
            } else {
                tokenDiv.classList.add('used-remote');
            }
        } else if (isPrevious) {
            // Previous token without assignment - gray border
            tokenDiv.classList.add('used');
            tokenDiv.classList.add('used-previous');
        }

        // Create QR code container (empty for now, will be filled by observer)
        const qrContainer = document.createElement('div');
        qrContainer.className = 'token-qr';

        // Create position number overlay
        const numberDiv = document.createElement('div');
        numberDiv.className = 'token-number';
        numberDiv.textContent = `P${this.pad(tokenNum)}`;

        tokenDiv.appendChild(qrContainer);
        tokenDiv.appendChild(numberDiv);

        // Add click handler
        tokenDiv.addEventListener('click', () => this.openTokenDetail(tokenNum));

        this.tokenGrid.appendChild(tokenDiv);
        this.renderedTokens.add(tokenNum);

        // Observe for lazy QR generation
        this.qrObserver.observe(tokenDiv);
    }

    generateQRForToken(tokenDiv) {
        const tokenNum = parseInt(tokenDiv.dataset.token);
        const qrContainer = tokenDiv.querySelector('.token-qr');

        // Generate QR code
        const qrText = `P${this.pad(tokenNum)}`;
        const size = 150; // Fixed size for grid items
        if (window.QRCode && qrContainer.children.length === 0) {
            new QRCode(qrContainer, {
                text: qrText,
                width: size,
                height: size,
                correctLevel: QRCode.CorrectLevel.H
            });
        }
    }

    getHighestUsedToken() {
        if (this.state.assignments.length === 0) return 0;
        return Math.max(...this.state.assignments.map(a => a.token));
    }

    scrollToHighestToken() {
        // Scroll to show the next token that should be used
        const nextToken = this.state.event.nextToken || 1;

        const tokenElement = this.tokenGrid.querySelector(`[data-token="${nextToken}"]`);
        if (tokenElement) {
            tokenElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    openTokenDetail(tokenNum) {
        // Set current token
        this.state.event.currentToken = tokenNum;

        // Check if token already has an assignment
        const existingAssignment = this.state.assignments.find(a => a.token === tokenNum);

        if (existingAssignment) {
            this.state.isEditingExisting = true;

            // Determine which mode to use
            let mode;
            if (existingAssignment?.entryMethod) {
                mode = existingAssignment.entryMethod;
            } else if (!existingAssignment.athleteBarcode) {
                mode = 'qr';
            } else {
                mode = 'manual';
            }

            this.state.currentMode = mode;
            this.switchMode(mode, existingAssignment);
        } else {
            // New token - use preferred mode
            this.state.isEditingExisting = false;
            const mode = this.state.preferredMode || 'qr';
            this.state.currentMode = mode;
            this.switchMode(mode);

            // Clear athlete inputs
            this.athleteBarcodeInput.value = '';
            this.athleteNameInput.value = '';
            this.scannedData = null;
        }

        // Update code label
        this.codeLabel.textContent = `P${this.pad(tokenNum)}`;
        this.codeLabel.classList.remove('hide');
        this.nocodeLabel.classList.add('hide');

        // Update button text
        this.takeNextBtn.textContent = 'Done';

        // Hide grid, show mode selection and content area
        this.tokenGridContainer.classList.add('hidden');
        this.modeSelection.classList.remove('hidden');
        this.contentArea.classList.remove('hidden');

        // Show controls
        this.controls.classList.remove('hidden');

        // Update UI
        this.updateUI();
    }

    closeTokenDetail() {
        // Save current token if needed
        const currentToken = this.state.event.currentToken;
        if (currentToken > 0) {
            const existingAssignment = this.state.assignments.find(
                a => a.token === currentToken && a.isLocal
            );

            // If in QR mode and no assignment exists, create empty assignment
            if (this.state.currentMode === 'qr' && !existingAssignment) {
                this.saveAssignment('', '');
            }

            // If in manual/scan mode with unsaved data, warn user
            if (this.state.currentMode === 'manual' || this.state.currentMode === 'scan') {
                const barcode = this.athleteBarcodeInput.value.trim();
                const name = this.athleteNameInput.value.trim();
                const hasScannedData = this.scannedData ? true : false;
                const hasAthleteInAssignment = existingAssignment && existingAssignment.athleteBarcode;

                if ((barcode || name || hasScannedData) && !hasAthleteInAssignment) {
                    this.confirm(
                        `You have unsaved athlete data for P${this.pad(currentToken)}. Discard changes?`,
                        '⚠️',
                        () => {
                            this.completeCloseTokenDetail();
                        },
                        () => {
                            // User cancelled - stay in modal
                        }
                    );
                    return;
                }
            }
        }

        this.completeCloseTokenDetail();
    }

    completeCloseTokenDetail() {
        // Save the token number before resetting
        const savedTokenNum = this.state.event.currentToken;

        // Reset state
        this.state.event.currentToken = 0;
        this.state.currentMode = null;
        this.state.isEditingExisting = false;
        this.showingSaveConfirmation = false;
        this.scannedDataBeforeEdit = null;
        this.userEditedAfterScan = false;

        // Stop any active scanning
        this.barcodeService.stopReadBarcode();

        // Clear athlete inputs
        this.athleteBarcodeInput.value = '';
        this.athleteNameInput.value = '';
        this.scannedData = null;

        // Update button text
        this.takeNextBtn.textContent = 'Next token';

        // Show grid, hide mode selection and content area
        this.tokenGridContainer.classList.remove('hidden');
        this.modeSelection.classList.add('hidden');
        this.contentArea.classList.add('hidden');

        // Hide controls
        this.controls.classList.add('hidden');

        // Hide all mode content divs
        this.scanModeDiv.classList.add('hidden');
        this.manualModeDiv.classList.add('hidden');
        this.qrModeDiv.classList.add('hidden');

        // Update code label to show app name or clear it
        this.codeLabel.textContent = '';
        this.nocodeLabel.classList.remove('hide');

        // Re-render grid to update used status
        this.updateGridItemUsedStatus();

        // Update UI
        this.updateUI();

        // Animate and scroll to the token that was just saved
        if (savedTokenNum > 0) {
            // Small delay to ensure grid is visible first
            requestAnimationFrame(() => {
                this.animateAndScrollToToken(savedTokenNum);
            });
        }
    }

    updateGridItemUsedStatus() {
        // Update all grid items to reflect used/unused state
        const nextToken = this.state.event.nextToken || 1;

        this.tokenGrid.querySelectorAll('.token-grid-item').forEach(item => {
            const tokenNum = parseInt(item.dataset.token);
            const assignment = this.state.assignments.find(a => a.token === tokenNum);
            const isPrevious = tokenNum < nextToken;

            // Remove all used classes first
            item.classList.remove('used', 'used-local', 'used-remote', 'used-previous');

            if (assignment) {
                item.classList.add('used');
                if (assignment.isLocal) {
                    item.classList.add('used-local');
                } else {
                    item.classList.add('used-remote');
                }
            } else if (isPrevious) {
                // Previous token without assignment - gray border
                item.classList.add('used');
                item.classList.add('used-previous');
            }
        });
    }

    animateAndScrollToToken(tokenNum) {
        // Find the token element
        const tokenElement = this.tokenGrid.querySelector(`[data-token="${tokenNum}"]`);
        if (!tokenElement) return;

        // Check if token is already fully in view
        const rect = tokenElement.getBoundingClientRect();
        const containerRect = this.tokenGridContainer.getBoundingClientRect();
        const isFullyVisible = (
            rect.top >= containerRect.top &&
            rect.bottom <= containerRect.bottom &&
            rect.left >= containerRect.left &&
            rect.right <= containerRect.right
        );

        // Only scroll if not fully visible
        if (!isFullyVisible) {
            tokenElement.scrollIntoView({
                behavior: 'instant',
                block: 'center'
            });
        }

        // Wait a tiny bit for scroll to complete (if it happened), then start animation
        requestAnimationFrame(() => {
            // Get the final position of the token after scrolling
            const finalRect = tokenElement.getBoundingClientRect();

            // Clone the token element for animation
            const clone = tokenElement.cloneNode(true);

            // Store the final state classes
            const finalUsedClasses = {
                used: clone.classList.contains('used'),
                usedLocal: clone.classList.contains('used-local'),
                usedRemote: clone.classList.contains('used-remote'),
                usedPrevious: clone.classList.contains('used-previous')
            };

            // Start with unused state (green border, full opacity QR)
            clone.classList.remove('used', 'used-local', 'used-remote', 'used-previous');

            // Style the clone for starting position (large, centered)
            clone.style.position = 'fixed';
            clone.style.top = '50%';
            clone.style.left = '50%';
            clone.style.width = '80vmin';
            clone.style.height = '80vmin';
            clone.style.transform = 'translate(-50%, -50%)';
            clone.style.zIndex = '2000';
            clone.style.transition = 'all 1s cubic-bezier(0.34, 1.56, 0.64, 1)';

            // Add clone to body
            document.body.appendChild(clone);

            // Force a reflow to ensure the starting styles are applied
            clone.offsetHeight;

            // Animate to final position AND final color state
            requestAnimationFrame(() => {
                // Position/size animation
                clone.style.top = `${finalRect.top}px`;
                clone.style.left = `${finalRect.left}px`;
                clone.style.width = `${finalRect.width}px`;
                clone.style.height = `${finalRect.height}px`;
                clone.style.transform = 'none';

                // Color animation - add back the used classes
                if (finalUsedClasses.used) clone.classList.add('used');
                if (finalUsedClasses.usedLocal) clone.classList.add('used-local');
                if (finalUsedClasses.usedRemote) clone.classList.add('used-remote');
                if (finalUsedClasses.usedPrevious) clone.classList.add('used-previous');
            });

            // After animation completes, remove clone
            setTimeout(() => {
                clone.remove();

                // Update the real element's classes
                this.updateGridItemUsedStatus();
            }, 1000);
        });
    }
}
