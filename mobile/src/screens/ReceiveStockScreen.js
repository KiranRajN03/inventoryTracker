import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  KeyboardAvoidingView, 
  Platform,
  Alert 
} from 'react-native';
import BarcodeScanner from '../components/BarcodeScanner';
import { 
  getCachedProductBySKU, 
  getCachedLocations, 
  addPendingTransaction 
} from '../utils/database';

export default function ReceiveStockScreen({ navigation }) {
  const [scannedSKU, setScannedSKU] = useState('');
  const [product, setProduct] = useState(null);
  
  const [locations, setLocations] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  // Load locations from SQLite on startup
  useEffect(() => {
    const loadLocations = async () => {
      try {
        const cached = await getCachedLocations();
        setLocations(cached);
        if (cached.length > 0) {
          setSelectedLocationId(cached[0].id);
        }
      } catch (e) {
        console.error('Failed to load locations from SQLite', e);
      }
    };
    loadLocations();
  }, []);

  const handleBarcodeScanned = async (sku) => {
    try {
      setScannedSKU(sku);
      const matched = await getCachedProductBySKU(sku);
      if (matched) {
        setProduct(matched);
      } else {
        setProduct(null);
        Alert.alert(
          'SKU NOT FOUND',
          `The SKU "${sku}" was not found in the local database cache. Run a sync on the dashboard to pull fresh data.`,
          [{ text: 'OK' }]
        );
      }
    } catch (e) {
      console.error('Error looking up scanned SKU in cache', e);
    }
  };

  const handleConfirmReceipt = async () => {
    if (!product) {
      Alert.alert('ERROR', 'PLEASE SCAN OR ENTER A VALID PRODUCT SKU FIRST');
      return;
    }
    if (!selectedLocationId) {
      Alert.alert('ERROR', 'PLEASE ASSIGN A DESTINATION BIN LOCATION');
      return;
    }
    
    const parsedQty = parseInt(quantity, 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      Alert.alert('ERROR', 'QUANTITY TO RECEIVE MUST BE A POSITIVE INTEGER');
      return;
    }

    try {
      const transaction = {
        product_id: product.id,
        location_id: selectedLocationId,
        transaction_type: 'RECEIVE',
        quantity_change: parsedQty,
        reference_number: reference,
        notes: notes,
      };

      await addPendingTransaction(transaction);
      
      Alert.alert(
        'STOCK LOGGED',
        `Logged receipt of ${parsedQty} ${product.unit} for ${product.name}. Added to offline sync queue.`,
        [
          { 
            text: 'OK', 
            onPress: () => {
              // Reset state for next receipt
              setScannedSKU('');
              setProduct(null);
              setQuantity('1');
              setReference('');
              setNotes('');
            } 
          }
        ]
      );
    } catch (e) {
      console.error('Failed to queue offline transaction', e);
      Alert.alert('ERROR', 'Failed to store transaction locally.');
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Camera Scanner Integrated View */}
        <BarcodeScanner onScan={handleBarcodeScanned} placeholderText="Or type SKU manually..." />

        {/* Scan Details & Receipt Input Form */}
        <View style={styles.formContainer}>
          <Text style={styles.sectionHeading}>RECEIPT DETAILS</Text>

          {/* Product Scanned State */}
          <View style={styles.productBadge}>
            <Text style={styles.badgeLabel}>SCANNED PRODUCT</Text>
            {product ? (
              <View style={styles.productMeta}>
                <Text style={styles.productName}>{product.name}</Text>
                <Text style={styles.productSku}>SKU: {product.sku} | Unit: {product.unit}</Text>
                <Text style={styles.productStock}>Current Stock Representation: {product.current_stock} units</Text>
              </View>
            ) : (
              <Text style={styles.noScanText}>NO PRODUCT ACTIVE. SCAN BARCODE OR TYPE INPUT ABOVE.</Text>
            )}
          </View>

          {/* Location Selection Dropdown */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>DESTINATION BIN LOCATION</Text>
            <View style={styles.selectWrapper}>
              {locations.length > 0 ? (
                <View style={styles.pickerWrapper}>
                  {locations.map((loc) => (
                    <TouchableOpacity
                      key={loc.id}
                      style={[
                        styles.pickerItem,
                        selectedLocationId === loc.id && styles.pickerItemActive
                      ]}
                      onPress={() => setSelectedLocationId(loc.id)}
                    >
                      <Text style={[
                        styles.pickerItemText,
                        selectedLocationId === loc.id && styles.pickerItemTextActive
                      ]}>
                        {loc.warehouse_id}-{loc.zone}-{loc.aisle}-{loc.bin}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <Text style={styles.noLocationsText}>No locations cached. Please sync offline databases.</Text>
              )}
            </View>
          </View>

          {/* Quantity Field */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>QUANTITY TO RECEIVE (+)</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="number-pad"
              value={quantity}
              onChangeText={setQuantity}
              placeholder="e.g. 50"
              placeholderTextColor="#888"
            />
          </View>

          {/* Reference # */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>REFERENCE (e.g. PO# / PACKING SLIP)</Text>
            <TextInput
              style={styles.textInput}
              value={reference}
              onChangeText={setReference}
              placeholder="e.g. PO-89730"
              placeholderTextColor="#888"
              autoCapitalize="characters"
            />
          </View>

          {/* Notes */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>RECEPTION NOTES</Text>
            <TextInput
              style={styles.textInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. Damage check completed"
              placeholderTextColor="#888"
            />
          </View>

          {/* Action Trigger */}
          <TouchableOpacity style={styles.submitButton} onPress={handleConfirmReceipt}>
            <Text style={styles.submitButtonText}>CONFIRM RECEIPT (COMMIT)</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContainer: {
    paddingBottom: 40,
  },
  formContainer: {
    padding: 20,
    gap: 16,
  },
  sectionHeading: {
    fontFamily: 'Cabinet Grotesk',
    fontSize: 16,
    fontWeight: '900',
    color: '#0A0A0A',
    borderBottomWidth: 1,
    borderBottomColor: '#0A0A0A',
    paddingBottom: 6,
    letterSpacing: -0.2,
  },
  productBadge: {
    borderWidth: 1,
    borderColor: '#0A0A0A',
    padding: 16,
    backgroundColor: '#F4F4F6',
  },
  badgeLabel: {
    fontFamily: 'JetBrains Mono',
    fontSize: 9,
    fontWeight: 'bold',
    color: '#002FA7',
    marginBottom: 8,
  },
  productMeta: {
    gap: 4,
  },
  productName: {
    fontFamily: 'Cabinet Grotesk',
    fontSize: 16,
    fontWeight: '900',
    color: '#0A0A0A',
  },
  productSku: {
    fontFamily: 'JetBrains Mono',
    fontSize: 11,
    color: '#555',
  },
  productStock: {
    fontFamily: 'JetBrains Mono',
    fontSize: 11,
    color: '#002FA7',
    fontWeight: 'bold',
    marginTop: 4,
  },
  noScanText: {
    fontFamily: 'IBM Plex Sans',
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    paddingVertical: 10,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontFamily: 'JetBrains Mono',
    fontSize: 11,
    color: '#0A0A0A',
    fontWeight: 'bold',
  },
  textInput: {
    height: 56,
    borderWidth: 1,
    borderColor: '#0A0A0A',
    paddingHorizontal: 16,
    fontFamily: 'IBM Plex Sans',
    fontSize: 14,
    color: '#0A0A0A',
    backgroundColor: '#FFFFFF',
  },
  selectWrapper: {
    borderWidth: 1,
    borderColor: '#0A0A0A',
    maxHeight: 120,
    overflow: 'scroll',
  },
  pickerWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 6,
    gap: 6,
  },
  pickerItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#D0D0D2',
    backgroundColor: '#FFFFFF',
  },
  pickerItemActive: {
    backgroundColor: '#002FA7',
    borderColor: '#002FA7',
  },
  pickerItemText: {
    fontFamily: 'JetBrains Mono',
    fontSize: 11,
    color: '#0A0A0A',
  },
  pickerItemTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  noLocationsText: {
    fontFamily: 'IBM Plex Sans',
    fontSize: 12,
    color: '#FF3B30',
    padding: 12,
  },
  submitButton: {
    height: 64,
    backgroundColor: '#002FA7',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#002FA7',
  },
  submitButtonText: {
    fontFamily: 'IBM Plex Sans',
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
    letterSpacing: 0.5,
  },
});
