export class BarcodeService {

    constructor() {
        const hints = new Map();
        const formats = [ZXing.BarcodeFormat.CODE_128, ZXing.BarcodeFormat.QR_CODE];
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, formats);
        this._codeReader = new ZXing.BrowserMultiFormatReader(hints);
        this._selectedDeviceId = null;
        this._isScanning = false;
    }

    async startReadBarcode(onRead) {
        // Don't start if already scanning
        if (this._isScanning) {
            return;
        }

        this.stopReadBarcode();

        if(this._selectedDeviceId === null) {
            const videoInputDevices = await this._codeReader.listVideoInputDevices();
            // Get the first rear camera, or if none found then whatever the first camera is.
            if(videoInputDevices && videoInputDevices.length > 0) {
                const rearCamera = videoInputDevices.find(device =>
                    device.kind === 'videoinput' &&
                    /back|rear/i.test(device.label)
                );

                this._selectedDeviceId = rearCamera?.deviceId || videoInputDevices[0].deviceId;
            }
        }

        this._isScanning = true;
        let lastResult = null;
        this._codeReader.decodeFromVideoDevice(this._selectedDeviceId, 'video', (result, err) => {
            if(result && result !== lastResult && onRead) {
                lastResult = result;
                onRead(result);
            }
        });
    }

    stopReadBarcode() {
        if (this._isScanning) {
            this._codeReader.reset();
            this._isScanning = false;
        }
    }
}