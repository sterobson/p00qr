// Minimal QR code generator using a CDN
const positionInput = document.getElementById('position');
const increaseBtn = document.getElementById('increase');
const decreaseBtn = document.getElementById('decrease');
const qrDiv = document.getElementById('qr');
const codeLabel = document.getElementById('code-label');

function clamp(val) {
    if (val === "") return "";
    val = parseInt(val, 10);
    if (isNaN(val)) return "";
    return Math.max(1, Math.min(9999, val));
}

function pad(num) {
    return num.toString().padStart(4, '0');
}

function getQRSize() {
    const qrContainer = document.getElementById('qr');
    const rect = qrContainer.getBoundingClientRect();
    // 80% of the smaller dimension for 10% margin each side
    return Math.floor(Math.min(rect.width, rect.height) * 0.8);
}

function updateQR() {
    const raw = positionInput.value;
    qrDiv.innerHTML = ""; // Clear previous QR
    if (raw === "") {
        codeLabel.textContent = "";
        return;
    }
    const num = clamp(raw);
    positionInput.value = num;
    const qrText = `P${pad(num)}`;
    codeLabel.textContent = qrText;
    const size = getQRSize();
    // Generate QR code using QRCode.js
    new QRCode(qrDiv, {
        text: qrText,
        width: size,
        height: size,
        correctLevel: QRCode.CorrectLevel.H
    });
}

increaseBtn.addEventListener('click', () => {
    let val = clamp(positionInput.value);
    if (val === "") val = 1;
    else val = Math.min(val + 1, 9999);
    positionInput.value = val;
    updateQR();
});

decreaseBtn.addEventListener('click', () => {
    let val = clamp(positionInput.value);
    if (val === "") val = 1;
    else val = Math.max(val - 1, 1);
    positionInput.value = val;
    updateQR();
});

positionInput.addEventListener('input', () => {
    positionInput.value = positionInput.value.replace(/\D/g, '').slice(0, 4);
    updateQR();
});

// Prevent scrolling
document.body.addEventListener('touchmove', function(e) {
    e.preventDefault();
}, { passive: false });

// Re-render QR code on window resize
window.addEventListener('resize', updateQR);

updateQR();