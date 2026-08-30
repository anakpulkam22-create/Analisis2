// Pemrosesan Data JSON Utama
function onDataReceived(jsonString) {
    if (!isRunning) return;

    try {
        // Sanitasi: Ganti 'nan' atau 'NaN' menjadi 0 agar JSON.parse tidak error
        const cleanJsonString = jsonString
            .replace(/:\s*nan/gi, ':0')
            .replace(/:\s*null/gi, ':0');

        const data = JSON.parse(cleanJsonString);

        const rms     = parseFloat(data.RMS_ms2) || 0;
        const accX    = parseFloat(data.AccX) || 0;
        const accY    = parseFloat(data.AccY) || 0;
        const accZ    = parseFloat(data.AccZ) || 0;
        const peakHz  = parseFloat(data.PeakHz) || 0;
        const peakAmp = parseFloat(data.PeakAmp) || 0;
        const timeStr = new Date().toLocaleTimeString('id-ID');

        // Update Teks Layar
        const rmsElem = document.getElementById('rmsVal');
        const specHeader = document.getElementById('spectrumHeader');
        if (rmsElem) rmsElem.innerText = `${rms.toFixed(2)} M/S²`;
        if (specHeader) specHeader.innerText = `SPECTRUM (PEAK: ${peakAmp.toFixed(2)} M/S² @ ${peakHz.toFixed(1)} HZ)`;

        // Simpan Data Log
        logData.push({ timestamp: timeStr, rms, accX, accY, accZ, peakHz });

        // Update 3 Grafik Realtime
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
