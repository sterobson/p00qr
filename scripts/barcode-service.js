export class BarcodeService {
    
    constructor() {   
        this._codeReader = new ZXing.BrowserMultiFormatReader()
        this._selectedDeviceId = null;
    }

    async startReadBarcode(onRead) {
        this.stopReadBarcode();
        console.log('dfdf');
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

        let lastResult = null;
        this._codeReader.decodeFromVideoDevice(this._selectedDeviceId, 'video', (result, err) => {
            if(result && result !== lastResult && onRead) {
                lastResult = result;
                onRead(result);
            }
        });
    }

    stopReadBarcode() {
        this._codeReader.reset();
    }
}