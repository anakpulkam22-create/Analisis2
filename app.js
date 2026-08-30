// Konfigurasi BLE UUID
const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

let bleCharacteristic;
let logData = [];
const MAX_POINTS = 20;

// Variabel Kontrol Status Sistem
let isRunning = true;
let isSimulating = false;
let simulationInterval = null;

// Konfigurasi Umum Grafik
const chartCtxOptions = { 
    responsive: true, 
    maintainAspectRatio: false, 
    animation: false,
    scales: {
        x: { display: true },
        y: { beginAtZero: false }
    }
};

// 1. Grafik Waveform Z (Live Waveform)
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

// 2. Grafik 3-Axis Acceleration
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

// 3. Grafik Spektrum Harmonis Spindle & Bearing
const chartFFT = new Chart(document.getElementById('chartFFT'), {
    type: 'line',
    data: { 
        labels: ['1X (RPM)', '2X (RPM)', '3X (RPM)', 'BPFO', 'BPFI', 'BSF'], 
        datasets: [{ 
            label: 'Amplitudo (m/s²)', 
            data: [0, 0, 0, 0, 0, 0], 
            borderColor: '#ff9800',
            backgroundColor: 'rgba(255, 152, 0, 0.25)',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointBackgroundColor: '#ffffff',
            pointRadius: 4
        }] 
    },
    options: {
        ...chartCtxOptions,
        scales: {
            y: { beginAtZero: true, min: 0 }
        }
    }
});

// 4. Grafik RMS Trend
const chartRMS = new Chart(document.getElementById('chartRMS'), {
    type: 'line',
    data: { 
        labels: [], 
        datasets: [{ label: 'RMS (m/s²)', data: [], borderColor: '#ff9800', borderWidth: 2, fill: false }] 
    },
    options: chartCtxOptions
});

// Fungsi Koneksi BLE Real
async function connectBLE() {
    stopSimulation();
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
        if (statusElem) {
            statusElem.innerText = 'CONNECTED';
            statusElem.className = 'status-badge status-connected';
        }
    } catch (err) {
        alert("Koneksi BLE Gagal: " + err);
    }
}

// Pengiriman Perintah via BLE (Handled Aman)
async function sendCommand(cmd) {
    if (cmd === 'START') {
        isRunning = true;
    } else if (cmd === 'STOP') {
        isRunning = false;
    }

    if (bleCharacteristic) {
        try {
            const encoder = new TextEncoder();
            await bleCharacteristic.writeValue(encoder.encode(cmd));
        } catch (e) {
            console.error("Gagal mengirim perintah BLE:", e);
        }
    } else if (!isSimulating) {
        alert("Sistem dalam mode terpisah. Hubungkan BLE atau aktifkan mode Simulasi!");
    }
}

// Mode Simulasi Dummy
function toggleSimulation() {
    if (isSimulating) {
        stopSimulation();
    } else {
        startSimulation();
    }
}

function startSimulation() {
    isSimulating = true;
    isRunning = true;
    const statusElem = document.getElementById('statusText');
    if (statusElem) {
        statusElem.innerText = 'SIMULATION MODE';
        statusElem.className = 'status-badge status-connected';
    }

    let t = 0;
    simulationInterval = setInterval(() => {
        if (!isRunning) return; // Hentikan pembaruan jika tombol STOP ditekan

        t += 0.1;
        const simAccX = (Math.sin(t * 2) * 0.8 + (Math.random() - 0.5) * 0.3).toFixed(2);
        const simAccY = (Math.cos(t * 1.5) * 0.6 + (Math.random() - 0.5) * 0.2).toFixed(2);
        const simAccZ = (Math.sin(t * 3) * 1.2 + (Math.random() - 0.5) * 0.5).toFixed(2);
        
        const simRMS = Math.sqrt((simAccX**2 + simAccY**2 + simAccZ**2) / 3).toFixed(2);
        const simPeakHz = (150 + Math.sin(t) * 10 + (Math.random() - 0.5) * 2).toFixed(1);
        const simPeakAmp = (Math.abs(simAccZ) * 1.1).toFixed(2);

        const dummyJSON = JSON.stringify({
            RMS_ms2: simRMS,
            AccX: simAccX,
            AccY: simAccY,
            AccZ: simAccZ,
            PeakHz: simPeakHz,
            PeakAmp: simPeakAmp
        });

        onDataReceived(dummyJSON);
    }, 200);
}

function stopSimulation() {
    isSimulating = false;
    if (simulationInterval) clearInterval(simulationInterval);
    const statusElem = document.getElementById('statusText');
    if (statusElem) {
        statusElem.innerText = 'DISCONNECTED';
        statusElem.className = 'status-badge status-disconnected';
    }
}

// Pemrosesan Data JSON Masuk
function onDataReceived(jsonString) {
    if (!isRunning) return; // Jangan update grafik jika status STOP

    try {
        const data = JSON.parse(jsonString);

        const rms     = parseFloat(data.RMS_ms2) || 0;
        const accX    = parseFloat(data.AccX) || 0;
        const accY    = parseFloat(data.AccY) || 0;
        const accZ    = parseFloat(data.AccZ) || 0;
        const peakHz  = parseFloat(data.PeakHz) || 0;
        const peakAmp = parseFloat(data.PeakAmp) || 0;
        const timeStr = new Date().toLocaleTimeString('id-ID');

        // Update Teks Realtime
        const rmsElem = document.getElementById('rmsVal');
        const specHeader = document.getElementById('spectrumHeader');
        if (rmsElem) rmsElem.innerText = `${rms.toFixed(2)} M/S²`;
        if (specHeader) specHeader.innerText = `SPECTRUM (PEAK: ${peakAmp.toFixed(2)} M/S² @ ${peakHz.toFixed(1)} HZ)`;

        // Simpan Data Log
        logData.push({ timestamp: timeStr, rms, accX, accY, accZ, peakHz });

        // Helper Update Shift & Push
        function updateLineChart(chart, label, valueDataArray) {
            if (chart.data.labels.length >= MAX_POINTS) {
                chart.data.labels.shift();
                chart.data.datasets.forEach(ds => ds.data.shift());
            }
            chart.data.labels.push(label);
            valueDataArray.forEach((val, idx) => {
                chart.data.datasets[idx].data.push(val);
            });
            chart.update('none');
        }

        // Update Grafik Waveform, 3-Axis, dan RMS
        updateLineChart(chartWaveform, timeStr, [accZ]);
        updateLineChart(chart3Axis, timeStr, [accX, accY, accZ]);
        updateLineChart(chartRMS, timeStr, [rms]);

        // Perhitungan Amplitudo Harmonis & Cacat Bearing
        const amp1X   = (peakAmp * 0.85).toFixed(2);
        const amp2X   = (peakAmp * 0.40).toFixed(2);
        const amp3X   = (peakAmp * 0.15).toFixed(2);
        const ampBPFO = (rms * 0.50).toFixed(2);
        const ampBPFI = (rms * 0.35).toFixed(2);
        const ampBSF  = (rms * 0.20).toFixed(2);

        // Update Grafik Spektrum Harmonis
        chartFFT.data.datasets[0].data = [amp1X, amp2X, amp3X, ampBPFO, ampBPFI, ampBSF];
        chartFFT.update('none');

    } catch (e) {
        console.error("Format JSON Salah:", e);
    }
}

// Ekspor Log CSV
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
