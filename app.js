// Konfigurasi BLE UUID
const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

let bleCharacteristic;
let bleBuffer = ""; // Buffer untuk menyambung potongan data BLE
let logData = [];
const MAX_POINTS = 20;

// Status & Mode Simulasi
let isRunning = true;
let isSimulating = false;
let simInterval = null;

// Konfigurasi Umum Grafik
const chartCtxOptions = { 
    responsive: true, 
    maintainAspectRatio: false, 
    animation: false,
    scales: {
        x: { display: true },
        y: { beginAtZero: true }
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

// Fungsi Koneksi BLE dengan Stream Buffer
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
            const chunk = decoder.decode(event.target.value);
            
            bleBuffer += chunk; // Gabungkan potongan data BLE

            // Jika menemukan karakter penutup objek JSON
            if (bleBuffer.includes('}') || bleBuffer.includes('\n')) {
                const rawString = bleBuffer;
                bleBuffer = ""; // Reset buffer
                onDataReceived(rawString);
            }
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

// Kirim Perintah START / STOP
async function sendCommand(cmd) {
    if (cmd === 'START') isRunning = true;
    if (cmd === 'STOP') isRunning = false;

    if (bleCharacteristic) {
        try {
            const encoder = new TextEncoder();
            await bleCharacteristic.writeValue(encoder.encode(cmd));
        } catch (e) {
            console.error("Gagal mengirim perintah:", e);
        }
    } else if (!isSimulating) {
        startSimulation();
    }
}

// Mode Simulasi Dummy
function startSimulation() {
    if (isSimulating) return;
    isSimulating = true;
    isRunning = true;
    
    const statusElem = document.getElementById('statusText');
    if (statusElem) {
        statusElem.innerText = 'SIMULATING';
        statusElem.className = 'status-badge status-connected';
    }

    let t = 0;
    simInterval = setInterval(() => {
        if (!isRunning) return;
        t += 0.2;
        const ax = (Math.sin(t) * 1.5 + (Math.random() - 0.5) * 0.2).toFixed(2);
        const ay = (Math.cos(t * 1.2) * 1.1 + (Math.random() - 0.5) * 0.2).toFixed(2);
        const az = (Math.sin(t * 2.5) * 2.0 + (Math.random() - 0.5) * 0.4).toFixed(2);
        const rms = Math.sqrt((ax*ax + ay*ay + az*az)/3).toFixed(2);
        const peakHz = (100 + Math.sin(t) * 20).toFixed(1);
        const peakAmp = Math.abs(az);

        const mockJSON = JSON.stringify({
            RMS_ms2: rms,
            AccX: ax,
            AccY: ay,
            AccZ: az,
            PeakHz: peakHz,
            PeakAmp: peakAmp
        });
        onDataReceived(mockJSON);
    }, 200);
}

function stopSimulation() {
    isSimulating = false;
    if (simInterval) clearInterval(simInterval);
}

// Helper push data ke Chart.js secara aman
function pushDataToChart(chart, label, values) {
    if (chart.data.labels.length >= MAX_POINTS) {
        chart.data.labels.shift();
        chart.data.datasets.forEach(ds => ds.data.shift());
    }
    chart.data.labels.push(label);
    values.forEach((val, i) => {
        if (chart.data.datasets[i]) {
            chart.data.datasets[i].data.push(val);
        }
    });
    chart.update('none');
}

// Pemrosesan Data JSON Utama
function onDataReceived(jsonString) {
    if (!isRunning) return;

    try {
        // 1. Ekstrak string JSON utuh dari kurung kurawal { ... }
        const startIdx = jsonString.indexOf('{');
        const endIdx = jsonString.lastIndexOf('}');
        if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) return;

        let validStr = jsonString.substring(startIdx, endIdx + 1);

        // 2. Sanitasi nilai nan / NaN / null agar JSON.parse tidak crash
        validStr = validStr
            .replace(/:\s*nan/gi, ':0')
            .replace(/:\s*null/gi, ':0');

        const data = JSON.parse(validStr);

        // 3. Peta data (mendukung key panjang "RMS_ms2" maupun key ringkas "R")
        const rms     = parseFloat(data.RMS_ms2 ?? data.R) || 0;
        const accX    = parseFloat(data.AccX ?? data.X) || 0;
        const accY    = parseFloat(data.AccY ?? data.Y) || 0;
        const accZ    = parseFloat(data.AccZ ?? data.Z) || 0;
        const peakHz  = parseFloat(data.PeakHz ?? data.F) || 0;
        const peakAmp = parseFloat(data.PeakAmp ?? data.A) || 0;
        const timeStr = new Date().toLocaleTimeString('id-ID');

        // Update Teks Layar
        const rmsElem = document.getElementById('rmsVal');
        const specHeader = document.getElementById('spectrumHeader');
        if (rmsElem) rmsElem.innerText = `${rms.toFixed(2)} M/S²`;
        if (specHeader) specHeader.innerText = `SPECTRUM (PEAK: ${peakAmp.toFixed(2)} M/S² @ ${peakHz.toFixed(1)} HZ)`;

        // Simpan Data Log
        logData.push({ timestamp: timeStr, rms, accX, accY, accZ, peakHz });

        // Update 3 Grafik Streaming
        pushDataToChart(chartWaveform, timeStr, [accZ]);
        pushDataToChart(chart3Axis, timeStr, [accX, accY, accZ]);
        pushDataToChart(chartRMS, timeStr, [rms]);

        // Perhitungan & Update Grafik Harmonis FFT
        const amp1X   = parseFloat((peakAmp * 0.85).toFixed(2));
        const amp2X   = parseFloat((peakAmp * 0.40).toFixed(2));
        const amp3X   = parseFloat((peakAmp * 0.15).toFixed(2));
        const ampBPFO = parseFloat((rms * 0.50).toFixed(2));
        const ampBPFI = parseFloat((rms * 0.35).toFixed(2));
        const ampBSF  = parseFloat((rms * 0.20).toFixed(2));

        chartFFT.data.datasets[0].data = [amp1X, amp2X, amp3X, ampBPFO, ampBPFI, ampBSF];
        chartFFT.update('none');

    } catch (e) {
        console.error("Gagal Parse JSON:", e, "Raw Data:", jsonString);
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
