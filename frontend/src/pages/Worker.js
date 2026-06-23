import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '@/lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { LogOut, ArrowLeft } from 'lucide-react';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { toast } from 'sonner';

export const Worker = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Local state for active operation mode
  const [activeTab, setActiveTab] = useState('receive'); // 'receive' | 'pick' | 'count'
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);

  // Active form state
  const [activeProduct, setActiveProduct] = useState(null);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [actualCount, setActualCount] = useState('');
  const [priceInput, setPriceInput] = useState('');

  useEffect(() => {
    fetchMasterData();
  }, []);

  const fetchMasterData = async () => {
    try {
      setLoading(true);
      const [productsRes, locationsRes] = await Promise.all([
        axios.get(`${API_URL}/api/products`, { withCredentials: true }),
        axios.get(`${API_URL}/api/locations`, { withCredentials: true }),
      ]);
      setProducts(productsRes.data);
      setLocations(locationsRes.data);
    } catch (err) {
      console.error('Failed to load master catalogs:', err);
      toast.error('Failed to initialize warehouse catalogs');
    } finally {
      setLoading(false);
    }
  };

  const handleBarcodeScanned = (scannedText) => {
    let sku = scannedText;
    try {
      const parsed = JSON.parse(scannedText);
      if (parsed.sku) {
        sku = parsed.sku;
      }
    } catch (e) {
      // scannedText is plain SKU
    }

    const matched = products.find(p => p.sku.toLowerCase() === sku.toLowerCase());
    if (matched) {
      setActiveProduct(matched);
      setPriceInput(matched.price !== undefined ? matched.price.toString() : '0.00');
      toast.success(`Matched Product: ${matched.name}`);
      if (locations.length > 0) {
        setSelectedLocationId(locations[0].id);
      }
    } else {
      setActiveProduct(null);
      setPriceInput('');
      toast.error(`SKU "${sku}" not found in catalog.`);
    }
  };

  const resetForm = () => {
    setActiveProduct(null);
    setSelectedLocationId('');
    setQuantity('1');
    setReference('');
    setNotes('');
    setActualCount('');
    setPriceInput('');
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!activeProduct) {
      toast.error('Please scan or select a product first');
      return;
    }
    if (!selectedLocationId) {
      toast.error('Please select a bin location');
      return;
    }

    try {
      const newPriceVal = parseFloat(priceInput) || 0.0;
      await axios.put(`${API_URL}/api/products/${activeProduct.id}`, {
        sku: activeProduct.sku,
        name: activeProduct.name,
        description: activeProduct.description,
        low_stock_threshold: activeProduct.low_stock_threshold,
        unit: activeProduct.unit,
        price: newPriceVal
      }, { withCredentials: true });

      if (activeTab === 'receive') {
        const parsedQty = parseInt(quantity, 10);
        if (isNaN(parsedQty) || parsedQty <= 0) {
          toast.error('Quantity must be a positive integer');
          return;
        }

        const payload = {
          product_id: activeProduct.id,
          location_id: selectedLocationId,
          transaction_type: 'RECEIVE',
          quantity_change: parsedQty,
          reference_number: reference || null,
          notes: notes || null,
        };

        await axios.post(`${API_URL}/api/stock/transaction`, payload, { withCredentials: true });
        toast.success(`Logged receipt of ${parsedQty} units for ${activeProduct.name}`);
        resetForm();
        fetchMasterData();
      } else if (activeTab === 'pick') {
        const parsedQty = parseInt(quantity, 10);
        if (isNaN(parsedQty) || parsedQty <= 0) {
          toast.error('Quantity must be a positive integer');
          return;
        }

        if (parsedQty > (activeProduct.current_stock || 0)) {
          const force = window.confirm(
            `Warning: Picking ${parsedQty} units but only ${activeProduct.current_stock || 0} units are currently in stock. Force pick?`
          );
          if (!force) return;
        }

        const payload = {
          product_id: activeProduct.id,
          location_id: selectedLocationId,
          transaction_type: 'PICK',
          quantity_change: -parsedQty,
          reference_number: reference || null,
          notes: notes || null,
        };

        await axios.post(`${API_URL}/api/stock/transaction`, payload, { withCredentials: true });
        toast.success(`Logged pick of ${parsedQty} units for ${activeProduct.name}`);
        resetForm();
        fetchMasterData();
      } else if (activeTab === 'count') {
        const parsedCount = parseInt(actualCount, 10);
        if (isNaN(parsedCount) || parsedCount < 0) {
          toast.error('Actual count must be a non-negative integer');
          return;
        }

        const currentStock = activeProduct.current_stock || 0;
        const adjustment = parsedCount - currentStock;

        if (adjustment === 0) {
          toast.info('Physical count matches system representation. No adjustment transaction registered.');
          resetForm();
          return;
        }

        const payload = {
          product_id: activeProduct.id,
          location_id: selectedLocationId,
          transaction_type: 'AUDIT',
          quantity_change: adjustment,
          reference_number: `AUDIT-${new Date().toISOString().slice(0, 10)}`,
          notes: notes || `Cycle count audit. System was ${currentStock}, counted ${parsedCount}.`,
        };

        await axios.post(`${API_URL}/api/stock/transaction`, payload, { withCredentials: true });
        const direction = adjustment > 0 ? 'surplus (+)' : 'deficit (-)';
        toast.success(`Logged AUDIT transaction of ${adjustment > 0 ? '+' : ''}${adjustment} units to resolve physical ${direction}`);
        resetForm();
        fetchMasterData();
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to submit transaction');
    }
  };

  if (loading && products.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F4F6]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#002FA7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-[#737373] uppercase tracking-wide font-semibold">Loading Floor Client...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F4F6]">
      {/* Header */}
      <header className="bg-white border-b border-[#E5E5E5] sticky top-0 z-10">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {user?.role === 'admin' && (
              <Button
                onClick={() => navigate('/dashboard')}
                variant="outline"
                size="sm"
                className="border-[#E5E5E5] rounded-none hover:bg-[#F4F4F6]"
              >
                <ArrowLeft size={16} className="mr-1.5" />
                Admin Panel
              </Button>
            )}
            <h1 className="text-2xl font-black tracking-tighter" style={{ fontFamily: 'Cabinet Grotesk, sans-serif' }}>
              Warehouse Floor
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-[#737373] font-mono">{user?.name?.toUpperCase()} ({user?.role?.toUpperCase()})</span>
            <Button onClick={handleLogout} variant="outline" size="sm" className="border-[#E5E5E5] rounded-none" data-testid="logout-button">
              <LogOut size={16} className="mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="p-6 max-w-2xl mx-auto">
        {/* Operation Mode Selector */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          <button
            onClick={() => { setActiveTab('receive'); resetForm(); }}
            className={`py-3 text-center border font-bold text-xs uppercase tracking-wider transition-colors ${
              activeTab === 'receive'
                ? 'bg-[#002FA7] border-[#002FA7] text-white'
                : 'bg-white border-[#E5E5E5] text-[#0A0A0A] hover:bg-[#F4F4F6]'
            }`}
          >
            Receive Stock
          </button>
          <button
            onClick={() => { setActiveTab('pick'); resetForm(); }}
            className={`py-3 text-center border font-bold text-xs uppercase tracking-wider transition-colors ${
              activeTab === 'pick'
                ? 'bg-[#FF3B30] border-[#FF3B30] text-white'
                : 'bg-white border-[#E5E5E5] text-[#0A0A0A] hover:bg-[#F4F4F6]'
            }`}
          >
            Pick Stock
          </button>
          <button
            onClick={() => { setActiveTab('count'); resetForm(); }}
            className={`py-3 text-center border font-bold text-xs uppercase tracking-wider transition-colors ${
              activeTab === 'count'
                ? 'bg-[#0A0A0A] border-[#0A0A0A] text-white'
                : 'bg-white border-[#E5E5E5] text-[#0A0A0A] hover:bg-[#F4F4F6]'
            }`}
          >
            Cycle Count
          </button>
        </div>

        {/* Integrated Scanner */}
        <BarcodeScanner
          onScan={handleBarcodeScanned}
          label={`Scan Barcode for ${activeTab.toUpperCase()}`}
        />

        {/* Transaction Form Container */}
        <div className="bg-white border border-[#E5E5E5] p-6 mt-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[#0A0A0A] mb-4 border-b border-[#E5E5E5] pb-2 font-mono">
            {activeTab} Transaction Details
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Active Product Details Badge */}
            <div className="border border-[#E5E5E5] p-4 bg-[#F4F4F6]">
              <span className="text-[10px] font-bold tracking-widest text-[#737373] block mb-2 font-mono">
                TARGET PRODUCT
              </span>
              {activeProduct ? (
                <div className="space-y-1">
                  <h4 className="font-bold text-[#0A0A0A]" style={{ fontFamily: 'Cabinet Grotesk, sans-serif' }}>
                    {activeProduct.name}
                  </h4>
                  <div className="text-xs text-[#737373] font-mono">
                    SKU: {activeProduct.sku} | Unit: {activeProduct.unit}
                  </div>
                  <div className="text-xs text-[#002FA7] font-bold font-mono">
                    System Stock representation: {activeProduct.current_stock ?? 0} {activeProduct.unit}
                  </div>
                  <div className="text-xs text-[#0A0A0A] font-bold font-mono mt-1 pt-1 border-t border-[#E5E5E5]">
                    Current Unit Price: ${(activeProduct.price ?? 0).toFixed(2)} | Current Total Cost: ${((activeProduct.current_stock ?? 0) * (activeProduct.price ?? 0)).toFixed(2)}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[#737373] italic">
                  No product active. Scan a product barcode or enter simulated SKU above.
                </p>
              )}
            </div>

            {/* Price Management Section */}
            {activeProduct && (
              <div className="border border-[#E5E5E5] p-4 bg-[#F4F4F6] space-y-4">
                <span className="text-[10px] font-bold tracking-widest text-[#737373] block font-mono">
                  PRICE MANAGEMENT
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs uppercase tracking-wider font-bold text-[#737373] mb-2 block font-mono">
                      Unit Price ($)
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={priceInput}
                      onChange={(e) => setPriceInput(e.target.value)}
                      required
                      className="border-[#E5E5E5] rounded-none h-11 bg-white"
                    />
                  </div>
                  <div className="flex flex-col justify-center gap-1 p-3 bg-white border border-[#E5E5E5] font-mono text-[11px] text-[#0A0A0A]">
                    <div>
                      Live Value of Stock: ${( (activeProduct.current_stock ?? 0) * (parseFloat(priceInput) || 0) ).toFixed(2)}
                    </div>
                    {activeTab !== 'count' && (
                      <div>
                        Live Value of Transaction: ${( (parseInt(quantity, 10) || 0) * (parseFloat(priceInput) || 0) ).toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Location selector grid */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider font-bold text-[#737373] block font-mono">
                {activeTab === 'receive' ? 'Destination Bin Location' : activeTab === 'pick' ? 'Source Bin Location' : 'Bin Location Audited'}
              </Label>
              {locations.length > 0 ? (
                <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-2 border border-[#E5E5E5] bg-[#F4F4F6]">
                  {locations.map((loc) => {
                    const isSelected = selectedLocationId === loc.id;
                    return (
                      <button
                        key={loc.id}
                        type="button"
                        onClick={() => setSelectedLocationId(loc.id)}
                        className={`px-3 py-2 text-xs font-mono border transition-colors ${
                          isSelected
                            ? activeTab === 'pick'
                              ? 'bg-[#FF3B30] border-[#FF3B30] text-white font-bold'
                              : activeTab === 'count'
                              ? 'bg-[#0A0A0A] border-[#0A0A0A] text-white font-bold'
                              : 'bg-[#002FA7] border-[#002FA7] text-white font-bold'
                            : 'bg-white border-[#D0D0D2] text-[#0A0A0A] hover:bg-[#F4F4F6]'
                        }`}
                      >
                        {loc.warehouse_id}-{loc.zone}-{loc.aisle}-{loc.bin}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-[#FF3B30] font-mono">
                  No warehouse locations configured.
                </p>
              )}
            </div>

            {/* Dynamic fields */}
            {activeTab !== 'count' ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs uppercase tracking-wider font-bold text-[#737373] mb-2 block font-mono">
                      Quantity to {activeTab === 'receive' ? 'Receive (+)' : 'Pick (-)'}
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      required
                      className="border-[#E5E5E5] rounded-none h-11"
                    />
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider font-bold text-[#737373] mb-2 block font-mono">
                      Reference (e.g. PO# / Order#)
                    </Label>
                    <Input
                      type="text"
                      placeholder="Optional reference ID"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      className="border-[#E5E5E5] rounded-none h-11"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider font-bold text-[#737373] mb-2 block font-mono">
                    Notes
                  </Label>
                  <Input
                    type="text"
                    placeholder="Optional notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="border-[#E5E5E5] rounded-none h-11"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label className="text-xs uppercase tracking-wider font-bold text-[#737373] mb-2 block font-mono">
                    Actual Physical Count on shelf
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="Enter physical shelve count..."
                    value={actualCount}
                    onChange={(e) => setActualCount(e.target.value)}
                    required
                    className="border-[#E5E5E5] rounded-none h-11"
                  />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider font-bold text-[#737373] mb-2 block font-mono">
                    Audit Observations / Notes
                  </Label>
                  <Input
                    type="text"
                    placeholder="e.g. Recount verified, packaging damaged"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="border-[#E5E5E5] rounded-none h-11"
                  />
                </div>
              </>
            )}

            <Button
              type="submit"
              disabled={!activeProduct}
              className={`w-full mt-4 font-bold text-white rounded-none h-12 uppercase tracking-wide transition-colors ${
                !activeProduct
                  ? 'bg-gray-300 cursor-not-allowed text-gray-500'
                  : activeTab === 'receive'
                  ? 'bg-[#002FA7] hover:bg-[#001F70]'
                  : activeTab === 'pick'
                  ? 'bg-[#FF3B30] hover:bg-[#B31D1D]'
                  : 'bg-[#0A0A0A] hover:bg-[#2A2A2A]'
              }`}
            >
              {activeTab === 'receive'
                ? 'Confirm Receipt (Commit)'
                : activeTab === 'pick'
                ? 'Confirm Pick (Commit)'
                : 'Confirm Physical Audit (Commit)'}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
};
