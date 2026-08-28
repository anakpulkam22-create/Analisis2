// Konfigurasi BLE UUID
const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

let bleCharacteristic;
let logData = [];
const MAX_POINTS = 20;

// Konfigurasi Opsi Grafik Real-time
const chartCtxOptions = { 
    responsive: true, 
    maintainAspectRatio: false, 
    animation: false,
    scales: {
        x: { display: true },
        y: { beginAtZero: false }
    }
};

// Inisialisasi Grafik Waveform Z-Axis
const chartWaveform = new Chart(document.getElementById('chartWaveform'), {
    type: 'line',
    data: { 
        labels: [], 
        datasets: [{ 
            label: 'Waveform Z (m/s²)', 
            data: [], 
            borderColor: '#00bcd4', 
            borderWidth: 2,
            pointRadius: 0,
            fill: false 
        }] 
    },
    options: chartCtxOptions
});

// Inisialisasi Grafik 3-Axis Acceleration
const chart3Axis = new Chart(document.getElementById('chart3Axis'), {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            { label: 'X', data: [], borderColor: '#ff4d4d', borderWidth: 1.5, pointRadius: 0, fill: false },
            { label: 'Y', data: [], borderColor: '#00e676', borderWidth: 1.5, pointRadius: 0, fill: false },
            { label: 'Z', data: [], borderColor: '#ffb300', borderWidth: 1.5, pointRadius: 0, fill: false }
        ]
    },
    options: chartCtxOptions
});

// Inisialisasi Grafik Spectrum (FFT)
const chartFFT = new Chart(document.getElementById('chartFFT'), {
    type: 'bar',
    data: { 
        labels: ['Peak Hz'], 
        datasets: [{ label: 'Amplitude (m/s²)', data: [0], backgroundColor: '#ff9800' }] 
    },
    options: chartCtxOptions
});

// Inisialisasi Grafik RMS Trend
const chartRMS = new Chart(document.getElementById('chartRMS'), {
    type: 'line',
    data: { 
        labels: [], 
        datasets: [{ label: 'RMS (m/s²)', data: [], borderColor: '#ff9800', borderWidth: 2, fill: false }] 
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

// Pemrosesan Data JSON Masuk
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

        // Update Teks Nilai
        document.getElementById('rmsVal').innerText = `${rms.toFixed(2)} M/S²`;
        document.getElementById('spectrumHeader').innerText = `SPECTRUM (PEAK: ${peakAmp.toFixed(2)} M/S² @ ${peakHz.toFixed(1)} HZ)`;

        // Simpan Log
        logData.push({ timestamp: timeStr, rms, accX, accY, accZ, peakHz });

        // Helper Function untuk Menggeser Data (Shift & Push)
        function updateLineChart(chart, label, valueDataArray) {
            if (chart.data.labels.length >= MAX_POINTS) {
                chart.data.labels.shift();
                chart.data.datasets.forEach(ds => ds.data.shift());
            }
            chart.data.labels.push(label);
            valueDataArray.forEach((val, idx) => {
                chart.data.datasets[idx].data.push(val);
            });
            chart.update('none'); // Update cepat tanpa animasi
        }

        // 1. Update Live Waveform Z
        updateLineChart(chartWaveform, timeStr, [accZ]);

        // 2. Update 3-Axis Acceleration (X, Y, Z)
        updateLineChart(chart3Axis, timeStr, [accX, accY, accZ]);

        // 3. Update RMS Trend
        updateLineChart(chartRMS, timeStr, [rms]);

        // 4. Update FFT Spectrum Bar
        chartFFT.data.labels = [`${peakHz.toFixed(1)} Hz`];
        chartFFT.data.datasets[0].data = [peakAmp];
        chartFFT.update('none');

    } catch (e) {
        console.error("Format JSON Salah atau Rusak:", e);
    }
}

// Ekspor Log ke CSV
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