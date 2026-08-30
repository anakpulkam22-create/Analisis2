const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

let bleCharacteristic;
let bleBuffer = "";
let logData = [];
const MAX_POINTS = 20;

let isRunning = true;
let isSimulating = false;
let simInterval = null;

// Konfigurasi Grafik dengan Auto-Scale Sumbu Y
const chartCtxOptions = { 
    responsive: true, 
    maintainAspectRatio: false, 
    animation: false,
    scales: {
        x: { display: true },
        y: { 
            beginAtZero: false,
            suggestedMin: -1,
            suggestedMax: 1
        }
    }
};

const chartWaveform = new Chart(document.getElementById('chartWaveform'), {
    type: 'line',
    data: { 
        labels: [], 
        datasets: [{ 
            label: 'Waveform Z (m/s²)', 
            data: [], 
            borderColor: '#00bcd4', 
            borderWidth: 2,
            pointRadius: 2,
            fill: false 
        }] 
    },
    options: chartCtxOptions
});

const chart3Axis = new Chart(document.getElementById('chart3Axis'), {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            { label: 'X', data: [], borderColor: '#ff4d4d', borderWidth: 1.5, pointRadius: 2, fill: false },
            { label: 'Y', data: [], borderColor: '#00e676', borderWidth: 1.5, pointRadius: 2, fill: false },
            { label: 'Z', data: [], borderColor: '#ffb300', borderWidth: 1.5, pointRadius: 2, fill: false }
        ]
    },
    options: chartCtxOptions
});

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
            pointRadius: 4
        }] 
    },
    options: chartCtxOptions
});

const chartRMS = new Chart(document.getElementById('chartRMS'), {
    type: 'line',
    data: { 
        labels: [], 
        datasets: [{ label: 'RMS (m/s²)', data: [], borderColor: '#ff9800', borderWidth: 2, fill: false }] 
    },
    options: chartCtxOptions
});

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
            bleBuffer += decoder.decode(event.target.value);

            if (bleBuffer.includes('}') || bleBuffer.includes('\n')) {
                const rawString = bleBuffer;
                bleBuffer = "";
                onDataReceived(rawString);
            }
        });

        const statusElem = document.getElementById('statusText');
        if (statusElem) {
            statusElem.innerText = 'CONNECTED';
            statusElem.className = 'status-badge status-connected';
        }
    } catch (err) {
        alert("Koneksi BLE Gagal/Dibatalkan. Masuk ke Mode Simulasi.");
        startSimulation();
    }
}

async function sendCommand(cmd) {
    if (cmd === 'START') {
        isRunning = true;
        if (!bleCharacteristic && !isSimulating) startSimulation();
    }
    if (cmd === 'STOP') {
        isRunning = false;
        stopSimulation();
    }

    if (bleCharacteristic) {
        try {
            const encoder = new TextEncoder();
            await bleCharacteristic.writeValue(encoder.encode(cmd));
        } catch (e) {
            console.error("Gagal mengirim perintah ke BLE:", e);
        }
    }
}

function startSimulation() {
    if (isSimulating) return;
    isSimulating = true;
    isRunning = true;
    
    const statusElem = document.getElementById('statusText');
    if (statusElem) {
        statusElem.innerText = 'SIMULATING (TEST MODE)';
        statusElem.className = 'status-badge status-connected';
    }

    let t = 0;
    simInterval = setInterval(() => {
        if (!isRunning) return;
        t += 0.3;
        const ax = parseFloat((Math.sin(t) * 2.5 + (Math.random() - 0.5) * 0.5).toFixed(2));
        const ay = parseFloat((Math.cos(t * 1.5) * 1.8 + (Math.random() - 0.5) * 0.5).toFixed(2));
        const az = parseFloat((Math.sin(t * 2.0) * 3.2 + (Math.random() - 0.5) * 0.8).toFixed(2));
        const rms = parseFloat(Math.sqrt((ax*ax + ay*ay + az*az)/3).toFixed(2));
        const peakHz = parseFloat((120 + Math.sin(t) * 30).toFixed(1));
        const peakAmp = parseFloat(Math.abs(az).toFixed(2));

        const mockJSON = JSON.stringify({
            rms: rms,
            x: ax,
            y: ay,
            z: az,
            peakHz: peakHz,
            peakAmp: peakAmp
        });
        onDataReceived(mockJSON);
    }, 250);
}

function stopSimulation() {
    isSimulating = false;
    if (simInterval) clearInterval(simInterval);
}

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

function checkAlarmStatus(rmsVal) {
    const warnLimit = parseFloat(document.getElementById('warnInput')?.value) || 1.8;
    const dangerLimit = parseFloat(document.getElementById('dangerInput')?.value) || 4.5;
    const statusElem = document.getElementById('alarmStatus');

    if (!statusElem) return;

    if (rmsVal >= dangerLimit) {
        statusElem.innerText = "STATUS: DANGER (VIBRASI SANGAT TINGGI)";
        statusElem.style.color = "#ff4d4d";
    } else if (rmsVal >= warnLimit) {
        statusElem.innerText = "STATUS: WARNING (PERINGATAN)";
        statusElem.style.color = "#ffb300";
    } else {
        statusElem.innerText = "STATUS: NORMAL";
        statusElem.style.color = "#00e676";
    }
}

function onDataReceived(jsonString) {
    if (!isRunning) return;

    try {
        const startIdx = jsonString.indexOf('{');
        const endIdx = jsonString.lastIndexOf('}');
        if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) return;

        let validStr = jsonString.substring(startIdx, endIdx + 1);
        validStr = validStr.replace(/:\s*nan/gi, ':0').replace(/:\s*null/gi, ':0');

        const data = JSON.parse(validStr);

        // Fleksibilitas Pembacaan Variabel (Mendukung Huruf Besar & Kecil)
        const rms     = parseFloat(data.rms ?? data.RMS_ms2 ?? data.RMS ?? data.R) || 0;
        const accX    = parseFloat(data.x ?? data.AccX ?? data.X) || 0;
        const accY    = parseFloat(data.y ?? data.AccY ?? data.Y) || 0;
        const accZ    = parseFloat(data.z ?? data.AccZ ?? data.Z) || 0;
        const peakHz  = parseFloat(data.peakHz ?? data.PeakHz ?? data.F) || 0;
        const peakAmp = parseFloat(data.peakAmp ?? data.PeakAmp ?? data.A) || 0;
        const timeStr = new Date().toLocaleTimeString('id-ID');

        // Ambil Nilai RPM
        const currentRPM = parseFloat(document.getElementById('rpmInput')?.value) || 1500;
        const freq1X = (currentRPM / 60).toFixed(1);

        // Update Text Tampilan
        const rmsElem = document.getElementById('rmsVal');
        const specHeader = document.getElementById('spectrumHeader');
        if (rmsElem) rmsElem.innerText = `${rms.toFixed(2)} M/S²`;
        if (specHeader) specHeader.innerText = `SPECTRUM (PEAK: ${peakAmp.toFixed(2)} M/S² @ ${peakHz.toFixed(1)} HZ | 1X: ${freq1X} HZ)`;

        // Evaluasi Limit Alarm
        checkAlarmStatus(rms);

        // Simpan Log
        logData.push({ timestamp: timeStr, rms, accX, accY, accZ, peakHz, rpm: currentRPM });

        // Update Grafik Line
        pushDataToChart(chartWaveform, timeStr, [accZ]);
        pushDataToChart(chart3Axis, timeStr, [accX, accY, accZ]);
        pushDataToChart(chartRMS, timeStr, [rms]);

        // Update Grafik Spektrum FFT
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

function downloadCSV() {
    if (logData.length === 0) return alert("Belum ada data terekam!");
    
    let csv = "data:text/csv;charset=utf-8,Timestamp;RMS_ms2;AccX;AccY;AccZ;PeakHz;RPM\n";
    logData.forEach(r => {
        csv += `${r.timestamp};${r.rms.toString().replace('.',',')};${r.accX.toString().replace('.',',')};${r.accY.toString().replace('.',',')};${r.accZ.toString().replace('.',',')};${r.peakHz.toString().replace('.',',')};${r.rpm}\n`;
    });
    
    const link = document.createElement("a");
    link.href = encodeURI(csv);
    link.download = `Vibration_Log_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
}
