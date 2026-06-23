import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  Alert
} from 'react-native';
import api from '../utils/api';

export default function StockLedgerScreen() {
  const [ledger, setLedger] = useState([]);
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [ledgerRes, productsRes, locationsRes] = await Promise.all([
        api.get('/stock/ledger?limit=100'),
        api.get('/products'),
        api.get('/locations')
      ]);

      if (ledgerRes.status === 200 && productsRes.status === 200 && locationsRes.status === 200) {
        setLedger(ledgerRes.data);
        setProducts(productsRes.data);
        setLocations(locationsRes.data);
      }
    } catch (e) {
      console.log('Failed to fetch ledger logs from API:', e);
      Alert.alert('OFFLINE WARNING', 'STOCK LEDGER HISTORY IS ONLY AVAILABLE ONLINE. PLEASE RECONNECT TO SERVER.');
    } finally {
      setLoading(false);
    }
  };

  const getProductDetails = (productId) => {
    const p = products.find(prod => prod.id === productId);
    return p ? { sku: p.sku, name: p.name } : { sku: 'UNKNOWN', name: 'Unknown Product' };
  };

  const getLocationDetails = (locationId) => {
    const l = locations.find(loc => loc.id === locationId);
    return l ? `${l.warehouse_id}-${l.zone}-${l.aisle}-${l.bin}` : 'Unknown Location';
  };

  const formatTimestamp = (isoString) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleString();
    } catch (_) {
      return isoString;
    }
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#002FA7" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          {ledger.length === 0 ? (
            <Text style={styles.emptyText}>NO TRANSACTION LOGS RECORDED YET</Text>
          ) : (
            ledger.map((tx) => {
              const prod = getProductDetails(tx.product_id);
              const locPath = getLocationDetails(tx.location_id);
              const isPositive = tx.quantity_change > 0;
              
              return (
                <View key={tx.id} style={styles.logCard}>
                  {/* Top Row: Type & Quantity */}
                  <View style={styles.cardHeader}>
                    <View style={styles.typeBadge}>
                      <Text style={styles.typeText}>{tx.transaction_type}</Text>
                    </View>
                    <Text style={[styles.quantityText, isPositive ? styles.qtyPos : styles.qtyNeg]}>
                      {isPositive ? '+' : ''}{tx.quantity_change}
                    </Text>
                  </View>

                  {/* Mid Section: Product Details */}
                  <View style={styles.productSection}>
                    <Text style={styles.skuText}>{prod.sku}</Text>
                    <Text style={styles.nameText}>{prod.name}</Text>
                  </View>

                  {/* Location & Time */}
                  <View style={styles.metaRow}>
                    <Text style={styles.metaLabel}>LOCATION:</Text>
                    <Text style={styles.metaValue}>{locPath}</Text>
                  </View>

                  {tx.reference_number ? (
                    <View style={styles.metaRow}>
                      <Text style={styles.metaLabel}>REF CODE:</Text>
                      <Text style={styles.metaValue}>{tx.reference_number}</Text>
                    </View>
                  ) : null}

                  {tx.notes ? (
                    <View style={styles.notesBox}>
                      <Text style={styles.notesText}>“{tx.notes}”</Text>
                    </View>
                  ) : null}

                  {/* Timestamp footer */}
                  <View style={styles.cardFooter}>
                    <Text style={styles.timestampText}>{formatTimestamp(tx.timestamp)}</Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F4F6',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContainer: {
    padding: 16,
    gap: 12,
  },
  emptyText: {
    fontFamily: 'JetBrains Mono',
    fontSize: 12,
    color: '#FF3B30',
    textAlign: 'center',
    marginTop: 40,
  },
  logCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E5',
    padding: 16,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F4F4F6',
    paddingBottom: 8,
  },
  typeBadge: {
    backgroundColor: '#0A0A0A',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  typeText: {
    fontFamily: 'JetBrains Mono',
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  quantityText: {
    fontFamily: 'JetBrains Mono',
    fontSize: 18,
    fontWeight: '950',
  },
  qtyPos: {
    color: '#002FA7', // Klein Blue for receipt
  },
  qtyNeg: {
    color: '#FF3B30', // Alert Red for pick
  },
  productSection: {
    gap: 2,
  },
  skuText: {
    fontFamily: 'JetBrains Mono',
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0A0A0A',
  },
  nameText: {
    fontFamily: 'Cabinet Grotesk',
    fontSize: 15,
    fontWeight: '900',
    color: '#555',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  metaLabel: {
    fontFamily: 'JetBrains Mono',
    fontSize: 9,
    color: '#737373',
    fontWeight: 'bold',
    width: 65,
  },
  metaValue: {
    fontFamily: 'JetBrains Mono',
    fontSize: 11,
    color: '#0A0A0A',
  },
  notesBox: {
    backgroundColor: '#F4F4F6',
    borderLeftWidth: 2,
    borderLeftColor: '#002FA7',
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 4,
  },
  notesText: {
    fontFamily: 'IBM Plex Sans',
    fontStyle: 'italic',
    fontSize: 11,
    color: '#555',
  },
  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: '#F4F4F6',
    paddingTop: 6,
    marginTop: 4,
  },
  timestampText: {
    fontFamily: 'JetBrains Mono',
    fontSize: 9,
    color: '#888',
    textAlign: 'right',
  },
});
