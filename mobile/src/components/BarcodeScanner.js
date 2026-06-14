import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  TextInput, 
  Button 
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

export default function BarcodeScanner({ onScan, placeholderText = 'Or type SKU manually...' }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [manualInput, setManualInput] = useState('');

  // Handle case where permissions are loading
  if (!permission) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>INITIALIZING SYSTEM CAMERA...</Text>
      </View>
    );
  }

  // Handle case where camera permissions are denied
  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.warningText}>CAMERA ACCESS IS REQUIRED TO SCAN BARCODES.</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>GRANT CAMERA PERMISSION</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleBarcodeScanned = ({ type, data }) => {
    if (scanned) return;
    setScanned(true);
    console.log(`Barcode scanned: Type ${type}, Data ${data}`);
    onScan(data);
    
    // Automatically reset scanner after 2 seconds to allow consecutive scans
    setTimeout(() => {
      setScanned(false);
    }, 2000);
  };

  const handleManualSubmit = () => {
    if (manualInput.trim()) {
      onScan(manualInput.trim());
      setManualInput('');
    }
  };

  return (
    <View style={styles.container}>
      {/* 1. Camera Scanning Frame */}
      <View style={styles.scannerWrapper}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          barcodeScannerSettings={{
            barcodeTypes: ['qr', 'ean13', 'upc_a', 'code128', 'code39'],
          }}
          onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
          enableTorch={torchEnabled}
        >
          {/* Neon Border Swiss-Style Scanning Frame Reticle */}
          <View style={styles.overlay}>
            <View style={styles.unfocusedContainer}></View>
            <View style={styles.middleRow}>
              <View style={styles.unfocusedContainer}></View>
              <View style={styles.focusedContainer}>
                {/* 4 Corner brackets for scanner targeting */}
                <View style={[styles.corner, styles.topLeft]} />
                <View style={[styles.corner, styles.topRight]} />
                <View style={[styles.corner, styles.bottomLeft]} />
                <View style={[styles.corner, styles.bottomRight]} />
                <View style={styles.laserLine} />
              </View>
              <View style={styles.unfocusedContainer}></View>
            </View>
            <View style={styles.unfocusedContainer}>
              <Text style={styles.scanPromptText}>ALIGN BARCODE WITHIN FOCUS BOX</Text>
            </View>
          </View>
        </CameraView>
      </View>

      {/* 2. Controls and Manual Input Fallback */}
      <View style={styles.controlsWrapper}>
        {/* Flashlight Toggle */}
        <TouchableOpacity 
          style={[styles.controlButton, torchEnabled && styles.controlButtonActive]}
          onPress={() => setTorchEnabled(!torchEnabled)}
        >
          <Text style={styles.controlButtonText}>
            {torchEnabled ? '🔦 FLASH ON' : '🔦 FLASH OFF'}
          </Text>
        </TouchableOpacity>

        {/* Manual Keyboard Entry Field */}
        <View style={styles.manualEntryContainer}>
          <TextInput
            style={styles.manualEntryInput}
            value={manualInput}
            onChangeText={setManualInput}
            placeholder={placeholderText}
            placeholderTextColor="#888"
            autoCapitalize="characters"
            onSubmitEditing={handleManualSubmit}
          />
          <TouchableOpacity style={styles.manualEntryButton} onPress={handleManualSubmit}>
            <Text style={styles.manualEntryButtonText}>ENTER</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 380,
    backgroundColor: '#0A0A0A',
    borderBottomWidth: 2,
    borderBottomColor: '#002FA7',
  },
  loadingContainer: {
    height: 380,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
  },
  loadingText: {
    fontFamily: 'JetBrains Mono',
    color: '#FFFFFF',
    fontSize: 12,
  },
  permissionContainer: {
    height: 380,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
    padding: 24,
  },
  warningText: {
    fontFamily: 'IBM Plex Sans',
    color: '#FF3B30',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  permissionButton: {
    backgroundColor: '#002FA7',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  permissionButtonText: {
    fontFamily: 'IBM Plex Sans',
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  scannerWrapper: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  overlay: {
    flex: 1,
    flexDirection: 'column',
  },
  unfocusedContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  middleRow: {
    height: 180,
    flexDirection: 'row',
  },
  focusedContainer: {
    width: 250,
    height: 180,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#002FA7', // International Klein Blue
    borderWidth: 4,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderBottomWidth: 0,
    borderRightWidth: 0,
  },
  topRight: {
    top: 0,
    right: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderTopWidth: 0,
    borderRightWidth: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderTopWidth: 0,
    borderLeftWidth: 0,
  },
  laserLine: {
    width: '90%',
    height: 2,
    backgroundColor: '#FF3B30', // Alert Red Laser line
  },
  scanPromptText: {
    color: '#FFFFFF',
    fontFamily: 'JetBrains Mono',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
    marginTop: 10,
  },
  controlsWrapper: {
    backgroundColor: '#0A0A0A',
    padding: 12,
    flexDirection: 'column',
    gap: 8,
  },
  controlButton: {
    height: 48,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 0,
  },
  controlButtonActive: {
    backgroundColor: '#002FA7',
    borderColor: '#002FA7',
  },
  controlButtonText: {
    fontFamily: 'IBM Plex Sans',
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  manualEntryContainer: {
    flexDirection: 'row',
    height: 48,
    gap: 8,
  },
  manualEntryInput: {
    flex: 1,
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#333333',
    paddingHorizontal: 12,
    color: '#FFFFFF',
    fontFamily: 'JetBrains Mono',
    fontSize: 13,
  },
  manualEntryButton: {
    width: 80,
    backgroundColor: '#002FA7',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#002FA7',
  },
  manualEntryButtonText: {
    fontFamily: 'IBM Plex Sans',
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
});
