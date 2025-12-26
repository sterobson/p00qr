// QR Code generation utility
// This uses the existing qrcode.js library logic

export function generateQRCode(element, text, size = 256) {
  if (!element) return

  // Clear existing content
  element.innerHTML = ''

  // Use the global QRCode library (loaded via CDN)
  if (typeof QRCode !== 'undefined') {
    new QRCode(element, {
      text: text,
      width: size,
      height: size,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    })
  } else {
    console.error('QRCode library not loaded')
  }
}
