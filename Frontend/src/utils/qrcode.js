// QR Code generation utility
// This uses the existing qrcode.js library logic

export function generateQRCode(element, text, size = 256) {
  if (!element) {
    console.warn('generateQRCode: element is null')
    return
  }

  // Clear existing content
  element.innerHTML = ''

  // Use the global QRCode library (loaded via script tag)
  if (typeof window.QRCode !== 'undefined') {
    new window.QRCode(element, {
      text: text,
      width: size,
      height: size,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: window.QRCode.CorrectLevel.H
    })
    console.log(`Generated QR code for: ${text}`)
  } else {
    console.error('QRCode library not loaded - check /scripts/qrcode.js')
    element.innerHTML = '<div style="color: red;">QR Error</div>'
  }
}
