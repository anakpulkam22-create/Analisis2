// Konfigurasi BLE UUID
const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

let bleCharacteristic;
let logData = [];

// Inisialisasi Grafik Chart.js
const chartCtxOptions = { 
    responsive: true, 
    maintainAspectRatio: false, 
    animation: false 
};

const chartRMS = new Chart(document.getElementById('chartRMS'), {
    type: 'line',
    data: { 
        labels: [], 
        datasets: [{ label: 'RMS (m/s²)', data: [], borderColor: '#ff9800', fill: false }] 
    },
    options: chartCtxOptions
});

const chart3Axis = new Chart(document.getElementById('chart3Axis'), {
    type: 'line',
    data: {
        labels: Array.from({ length: 20 }, (_, i) => i),
        datasets: [
            { label: 'X', data: [], borderColor: '#ff4d4d', fill: false },
            { label: 'Y', data: [], borderColor: '#00e676', fill: false },
            { label: 'Z', data: [], borderColor: '#ffb300', fill: false }
        ]
    },
    options: chartCtxOptions
});

const chartFFT = new Chart(document.getElementById('chartFFT'), {
    type: 'bar',
    data: { 
        labels: ['Peak Hz'], 
        datasets: [{ label: 'Amplitude (m/s²)', data: [0], backgroundColor: '#ff9800' }] 
    },
    options: chartCtxOptions
});

const chartWaveform = new Chart(document.getElementById('chartWaveform'), {
    type: 'line',
    data: { 
        labels: Array.from({ length: 20 }, (_, i) => i), 
        datasets: [{ label: 'Waveform Z', data: [], borderColor: '#00bcd4', fill: false }] 
    },
    options: chartCtxOptions
});

// Fungsi Koneksi BLE
async function connectBLE() {
    try {
        const device = await navigator.bluetooth.requestDevice({
            filters: [{ name: 'ESP32-BEARING' }],
            optionalServices: [SERVICE_UUID]
        });

        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(SERVICE_UUID);
        bleCharacteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);

        await bleCharacteristic.startNotifications();
        bleCharacteristic.addEventListener('characteristicvaluechanged', (event) => {
            const decoder = new TextDecoder('utf-8');
            const jsonString = decoder.decode(event.target.value);
            onDataReceived(jsonString);
        });

        const statusElem = document.getElementById('statusText');
        statusElem.innerText = 'CONNECTED';
        statusElem.className = 'status-badge status-connected';
    } catch (err) {
        alert("Koneksi BLE Gagal: " + err);
    }
}

// Pengiriman Perintah via BLE
async function sendCommand(cmd) {
    if (bleCharacteristic) {
        const encoder = new TextEncoder();
        await bleCharacteristic.writeValue(encoder.encode(cmd));
    } else {
        alert("Hubungkan BLE terlebih dahulu!");
    }
}

// Pemrosesan Data Masuk JSON
function onDataReceived(jsonString) {
    try {
        const data = JSON.parse(jsonString);

        const rms     = parseFloat(data.RMS_ms2) || 0;
        const accX    = parseFloat(data.AccX) || 0;
        const accY    = parseFloat(data.AccY) || 0;
        const accZ    = parseFloat(data.AccZ) || 0;
        const peakHz  = parseFloat(data.PeakHz) || 0;
        const peakAmp = parseFloat(data.PeakAmp) || 0;
        const timeStr = new Date().toLocaleTimeString('id-ID');

        document.getElementById('rmsVal').innerText = `${rms.toFixed(2)} M/S²`;
        document.getElementById('spectrumHeader').innerText = `SPECTRUM (PEAK: ${peakAmp.toFixed(2)} M/S² @ ${peakHz.toFixed(1)} HZ)`;

        // Simpan Data Log
        logData.push({ timestamp: timeStr, rms, accX, accY, accZ, peakHz });

        // Update Grafik RMS
        if (chartRMS.data.labels.length > 15) { 
            chartRMS.data.labels.shift(); 
            chartRMS.data.datasets[0].data.shift(); 
        }
        chartRMS.data.labels.push(timeStr);
        chartRMS.data.datasets[0].data.push(rms);
        chartRMS.update();

        // Update Grafik 3-Axis
        if (chart3Axis.data.datasets[0].data.length > 20) {
            chart3Axis.data.datasets[0].data.shift();
            chart3Axis.data.datasets[1].data.shift();
            chart3Axis.data.datasets[2].data.shift();
        }
        chart3Axis.data.datasets[0].data.push(accX);
        chart3Axis.data.datasets[1].data.push(accY);
        chart3Axis.data.datasets[2].data.push(accZ);
        chart3Axis.update();

        // Update Waveform & FFT Spectrum
        chartFFT.data.datasets[0].data = [peakAmp];
        chartFFT.data.labels = [`${peakHz.toFixed(1)} Hz`];
        chartFFT.update();

    } catch (e) {
        console.error("JSON Error:", e);
    }
}

// Ekspor Data Log CSV (Pemisah Titik Koma untuk Excel Indonesia)
function downloadCSV() {
    if (logData.length === 0) return alert("Belum ada data terekam!");
    
    let csv = "data:text/csv;charset=utf-8,Timestamp;RMS_ms2;AccX;AccY;AccZ;PeakHz\n";
    logData.forEach(r => {
        csv += `${r.timestamp};${r.rms.toString().replace('.',',')};${r.accX.toString().replace('.',',')};${r.accY.toString().replace('.',',')};${r.accZ.toString().replace('.',',')};${r.peakHz.toString().replace('.',',')}\n`;
    });
    
    const link = document.createElement("a");
    link.href = encodeURI(csv);
    link.download = `Vibration_Log_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
}