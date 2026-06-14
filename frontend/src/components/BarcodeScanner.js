import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, StopCircle, Check, HelpCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { toast } from 'sonner';

export const BarcodeScanner = ({ onScan, label = "Scan Barcode / QR Code" }) => {
  const [scanning, setScanning] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [simulatedInput, setSimulatedInput] = useState('');
  const html5QrCodeRef = useRef(null);

  useEffect(() => {
    // Attempt to list cameras on component mount
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (devices && devices.length > 0) {
          setCameras(devices);
          setSelectedCameraId(devices[0].id);
        }
      })
      .catch((err) => {
        console.log("No camera devices detected or permission denied:", err);
      });

    return () => {
      // Ensure scanner stops when component unmounts
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().catch((err) => console.error("Unmount cleanup error:", err));
      }
    };
  }, []);

  const startScanning = async () => {
    if (!selectedCameraId) {
      toast.error("No camera selected or detected. Please use the simulated input below.");
      return;
    }
    
    try {
      const html5QrCode = new Html5Qrcode("webcam-scanner-view");
      html5QrCodeRef.current = html5QrCode;
      setScanning(true);
      
      await html5QrCode.start(
        selectedCameraId,
        {
          fps: 15,
          qrbox: { width: 220, height: 220 },
        },
        (decodedText) => {
          onScan(decodedText);
          toast.success("Code scanned successfully!");
          stopScanning();
        },
        (errorMessage) => {
          // Silent capture during continuous video frame scan
        }
      );
    } catch (err) {
      console.error("Failed to start webcam scanner:", err);
      toast.error("Could not access camera. Check permissions or try simulated scan.");
      setScanning(false);
    }
  };

  const stopScanning = async () => {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        setScanning(false);
      } catch (err) {
        console.error("Failed to stop webcam scanner:", err);
      }
    }
  };

  const handleSimulate = (e) => {
    e.preventDefault();
    if (!simulatedInput.trim()) return;
    onScan(simulatedInput.trim());
    toast.success("Simulated scan committed!");
    setSimulatedInput('');
  };

  return (
    <div className="border border-[#E5E5E5] bg-white p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs uppercase tracking-wider font-bold text-[#0A0A0A] flex items-center gap-1.5">
          <Camera size={14} className="text-[#002FA7]" />
          {label}
        </h4>
        {cameras.length > 0 && !scanning && (
          <select
            value={selectedCameraId}
            onChange={(e) => setSelectedCameraId(e.target.value)}
            className="text-xs border border-[#E5E5E5] px-2 py-1 bg-[#F4F4F6] font-mono outline-none"
          >
            {cameras.map((cam) => (
              <option key={cam.id} value={cam.id}>
                {cam.label || `Camera ${cam.id.slice(0, 5)}`}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Webcam View Finder */}
      <div className="relative mb-3 bg-[#0A0A0A] border border-[#0A0A0A] overflow-hidden flex flex-col items-center justify-center" style={{ minHeight: scanning ? '250px' : '60px' }}>
        {scanning ? (
          <>
            <div id="webcam-scanner-view" className="w-full h-[250px]" />
            {/* Swiss-Style Animated Laser Scan Line */}
            <div className="absolute left-0 right-0 top-0 bottom-0 pointer-events-none z-10 flex flex-col items-center justify-center">
              <div className="w-[220px] h-[220px] border-2 border-dashed border-white opacity-40 relative">
                <div className="absolute w-full h-[2px] bg-[#002FA7] animate-pulse" style={{
                  animation: 'scan-laser 2s infinite linear',
                  boxShadow: '0 0 8px #002FA7'
                }} />
              </div>
            </div>
          </>
        ) : (
          <Button
            type="button"
            onClick={startScanning}
            className="bg-[#002FA7] hover:bg-[#001F70] text-white text-xs py-1.5 px-3 h-auto rounded-none font-bold tracking-tight uppercase"
          >
            Open Webcam Reader
          </Button>
        )}

        {scanning && (
          <Button
            type="button"
            onClick={stopScanning}
            className="absolute top-2 right-2 bg-[#FF3B30] hover:bg-[#D32F2F] text-white p-1 h-auto rounded-none z-20"
            title="Stop Camera"
          >
            <StopCircle size={16} />
          </Button>
        )}
      </div>

      {/* Simulator Interface */}
      <form onSubmit={handleSimulate} className="flex gap-2">
        <Input
          type="text"
          value={simulatedInput}
          onChange={(e) => setSimulatedInput(e.target.value)}
          placeholder="Simulate barcode/QR payload..."
          className="border-[#E5E5E5] rounded-none h-8 text-xs font-mono"
        />
        <Button
          type="submit"
          className="bg-white hover:bg-[#F4F4F6] text-[#0A0A0A] border border-[#0A0A0A] rounded-none h-8 px-3 text-xs font-semibold"
        >
          Simulate Scan
        </Button>
      </form>
      
      <p className="text-[10px] text-[#737373] mt-2 flex items-center gap-1 font-mono">
        <HelpCircle size={10} />
        Scans auto-fill fields. QR payload can be a plain SKU or JSON representation.
      </p>

      {/* Custom Styles for Laser Scan */}
      <style>{`
        @keyframes scan-laser {
          0% { top: 0%; }
          50% { top: 100%; }
          100% { top: 0%; }
        }
      `}</style>
    </div>
  );
};
