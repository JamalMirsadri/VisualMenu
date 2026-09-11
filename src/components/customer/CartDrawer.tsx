import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingBag,
  X,
  Plus,
  Minus,
  Trash2,
  Utensils,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  MapPin,
  FileText,
  CreditCard,
  Banknote,
  Smartphone,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { LuxuryFoodFallback } from './LuxuryFoodFallback';

export const CartDrawer: React.FC<{ contained?: boolean }> = ({ contained = false }) => {
  const {
    items,
    tableNumber,
    currencySymbol,
    customerNote,
    isDrawerOpen,
    isSubmitting,
    activeOrder,
    error,
    totalItemsCount,
    subtotal,
    taxEstimate,
    serviceChargeEstimate,
    totalEstimate,
    settings,
    removeItem,
    updateQuantity,
    setCustomerNote,
    setTableNumber,
    closeCart,
    submitOrder,
    dismissActiveOrder,
  } = useCart();

  const [editingTable, setEditingTable] = useState(false);
  const [tempTable, setTempTable] = useState(tableNumber || '');

  // Phase 8: Payment & Fiscal State
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'MBWAY'>('CASH');
  const [mbwayPhone, setMbwayPhone] = useState('');
  const [wantsNif, setWantsNif] = useState(false);
  const [nif, setNif] = useState('');
  const [fiscalName, setFiscalName] = useState('');
  const [taxCountry, setTaxCountry] = useState('PT');
  const [saveProfile, setSaveProfile] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Auto-fill table from context
  React.useEffect(() => {
    if (tableNumber) {
      setTempTable(tableNumber);
    }
  }, [tableNumber]);

  const validateCheckout = (): boolean => {
    setValidationError(null);

    if (paymentMethod === 'MBWAY') {
      const cleanPhone = mbwayPhone.replace(/\s+/g, '');
      if (!/^9\d{8}$/.test(cleanPhone)) {
        setValidationError('MB WAY requires a valid Portuguese mobile phone (9 digits starting with 9).');
        return false;
      }
    }

    if (wantsNif && nif.trim()) {
      const cleanNif = nif.trim().toUpperCase();
      if (taxCountry === 'PT' && !/^\d{9}$/.test(cleanNif)) {
        setValidationError('Portuguese NIF must have 9 numeric digits.');
        return false;
      }
    }

    return true;
  };

  const handleCheckout = async () => {
    if (!validateCheckout()) return;

    if (!tableNumber && !tempTable.trim()) {
      setEditingTable(true);
      return;
    }

    if (tempTable.trim() && tempTable !== tableNumber) {
      setTableNumber(tempTable.trim());
    }

    try {
      await submitOrder({
        paymentMethod,
        customerPhone: paymentMethod === 'MBWAY' ? mbwayPhone.replace(/\s+/g, '') : undefined,
        nif: wantsNif && nif.trim() ? nif.trim() : undefined,
        customerFiscalName: wantsNif && fiscalName.trim() ? fiscalName.trim() : undefined,
        customerTaxCountry: wantsNif ? taxCountry : undefined,
        saveFiscalProfile: wantsNif && saveProfile,
      });
    } catch {
      // Handled by cart context error state
    }
  };

  if (!isDrawerOpen && !activeOrder) return null;

  return (
    <AnimatePresence>
      <div className={`${contained ? 'absolute' : 'fixed'} inset-0 z-50 overflow-hidden flex justify-end`}>
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            if (activeOrder) dismissActiveOrder();
            closeCart();
          }}
          className={`${contained ? 'absolute' : 'fixed'} inset-0 bg-black/70 backdrop-blur-md transition-opacity`}
        />

        {/* Slide-over panel */}
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          className="relative w-full max-w-md bg-[#0d121c] border-l border-amber-500/20 text-white shadow-2xl flex flex-col h-full z-10"
        >
          {/* Header */}
          <div className="p-5 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-amber-500/10 via-transparent to-transparent">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-wide text-white">Your Tray</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-amber-400/80 font-medium">
                    {totalItemsCount} {totalItemsCount === 1 ? 'dish' : 'dishes'} selected
                  </span>
                  {tableNumber && (
                    <span className="text-xs bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30 flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> Table {tableNumber}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                if (activeOrder) dismissActiveOrder();
                closeCart();
              }}
              className="p-2 rounded-xl text-neutral-400 hover:text-white hover:bg-white/10 transition"
              aria-label="Close Tray"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* ACTIVE ORDER CONFIRMATION VIEW */}
          {activeOrder ? (
            <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center text-center">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center text-emerald-400 mb-6 shadow-lg shadow-emerald-500/10"
              >
                <CheckCircle2 className="w-10 h-10" />
              </motion.div>

              <span className="text-xs tracking-widest text-emerald-400 uppercase font-semibold">
                Order Received
              </span>
              <h3 className="text-2xl font-black mt-1 text-white">Sent to Kitchen</h3>
              <p className="text-sm text-neutral-400 mt-2 max-w-xs">
                Our culinary team has received your order and preparation is underway.
              </p>

              {/* Order Card Ticket */}
              <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 my-6 text-left">
                <div className="flex justify-between items-start border-b border-white/10 pb-4 mb-4">
                  <div>
                    <span className="text-xs text-neutral-400 uppercase">Order Reference</span>
                    <div className="text-2xl font-black text-amber-400 tracking-wider">
                      #{activeOrder.orderNumber}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-neutral-400 uppercase">Location</span>
                    <div className="text-sm font-semibold text-white">
                      {activeOrder.table ? `Table ${activeOrder.table.number}` : 'Direct Order'}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  {activeOrder.items.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="text-neutral-300">
                        {item.quantity}x {item.foodNameSnapshot}
                      </span>
                      <span className="font-medium text-white">
                        {currencySymbol}
                        {Number(item.lineTotal).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-white/10 pt-3 flex justify-between items-center text-sm font-bold">
                  <span className="text-neutral-300">Total Billed</span>
                  <span className="text-amber-400 text-base">
                    {currencySymbol}
                    {Number(activeOrder.total).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-neutral-400 mb-6 bg-white/5 px-4 py-2 rounded-xl">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>Estimated preparation: 15–20 mins</span>
              </div>

              <div className="flex flex-col gap-2.5 w-full">
                {activeOrder.publicToken && (
                  <a
                    href={`/order/${activeOrder.publicToken}`}
                    className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-400 text-neutral-950 font-bold tracking-wide shadow-lg shadow-amber-500/20 text-center transition flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Track Order Live</span>
                  </a>
                )}

                <button
                  onClick={() => {
                    dismissActiveOrder();
                    closeCart();
                  }}
                  className="w-full py-3 px-6 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-sm transition"
                >
                  Back to Visual Menu
                </button>
              </div>
            </div>

          ) : items.length === 0 ? (
            /* EMPTY STATE */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-neutral-500 mb-4">
                <Utensils className="w-8 h-8 text-neutral-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">Your tray is empty</h3>
              <p className="text-sm text-neutral-400 max-w-xs mb-6">
                Explore our dishes, swipe through video presentations, and tap "Add to Order".
              </p>
              <button
                onClick={closeCart}
                className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-semibold text-white transition border border-white/10"
              >
                Browse Menu
              </button>
            </div>
          ) : (
            /* ITEMS LIST & CHECKOUT */
            <>
              {/* Table assignment header banner */}
              <div className="px-5 py-3 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-amber-300">
                  <MapPin className="w-4 h-4 text-amber-400" />
                  {tableNumber ? (
                    <span>
                      Ordering for <strong className="text-white">Table {tableNumber}</strong>
                    </span>
                  ) : (
                    <span className="text-neutral-300">No table assigned</span>
                  )}
                </div>

                {editingTable ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      placeholder="Table #"
                      value={tempTable}
                      onChange={(e) => setTempTable(e.target.value)}
                      className="w-16 px-2 py-0.5 rounded bg-black/40 border border-amber-500/40 text-xs text-white text-center"
                    />
                    <button
                      onClick={() => {
                        setTableNumber(tempTable.trim() || null);
                        setEditingTable(false);
                      }}
                      className="px-2 py-0.5 rounded bg-amber-500 text-neutral-950 font-bold text-[11px]"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setTempTable(tableNumber || '');
                      setEditingTable(true);
                    }}
                    className="text-amber-400 hover:text-amber-300 underline font-medium"
                  >
                    {tableNumber ? 'Change' : 'Set Table'}
                  </button>
                )}
              </div>

              {/* Items scroll area */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {items.map(({ food, quantity, customerNote }) => (
                  <div
                    key={food.id}
                    className="p-3 rounded-2xl bg-white/5 border border-white/10 hover:border-white/20 transition flex gap-3 group"
                  >
                    {/* Food Thumbnail */}
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-black/40 flex-shrink-0 relative border border-white/10">
                      {food.image ? (
                        <img
                          src={food.image}
                          alt={food.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : null}
                      <div className={food.image ? 'hidden' : 'w-full h-full'}>
                        <LuxuryFoodFallback name={food.name} compact={true} />
                      </div>
                    </div>

                    {/* Info & Quantity controls */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <h4 className="text-sm font-bold text-white truncate">{food.name}</h4>
                          <span className="text-xs text-amber-400 font-medium">
                            {currencySymbol}
                            {Number(food.price).toFixed(2)} each
                          </span>
                        </div>
                        <button
                          onClick={() => removeItem(food.id)}
                          className="text-neutral-500 hover:text-red-400 p-1 transition"
                          title="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {customerNote && (
                        <p className="text-[11px] text-neutral-400 italic line-clamp-1 mt-0.5">
                          Note: "{customerNote}"
                        </p>
                      )}

                      <div className="flex justify-between items-center mt-2">
                        {/* Stepper */}
                        <div className="flex items-center gap-2 bg-black/40 rounded-lg p-1 border border-white/10">
                          <button
                            onClick={() => updateQuantity(food.id, quantity - 1)}
                            className="w-6 h-6 rounded flex items-center justify-center bg-white/5 hover:bg-white/15 text-white transition"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center text-xs font-bold text-white">
                            {quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(food.id, quantity + 1)}
                            className="w-6 h-6 rounded flex items-center justify-center bg-white/5 hover:bg-white/15 text-white transition"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Line total */}
                        <span className="text-sm font-black text-white">
                          {currencySymbol}
                          {(Number(food.price) * quantity).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Special Instructions for Kitchen */}
                <div className="pt-2">
                  <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5 mb-1.5">
                    <FileText className="w-3.5 h-3.5 text-amber-400" />
                    Special Kitchen Notes or Allergies
                  </label>
                  <textarea
                    rows={2}
                    value={customerNote}
                    onChange={(e) => setCustomerNote(e.target.value)}
                    placeholder="e.g. Please no coriander, dressing on the side..."
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 resize-none"
                  />
                </div>

                {/* Phase 8: Payment Method Selection */}
                <div className="pt-3 border-t border-white/10 space-y-2.5">
                  <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-amber-400" />
                    Payment Method
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('CASH')}
                      className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition text-center ${
                        paymentMethod === 'CASH'
                          ? 'bg-amber-500/15 border-amber-400 text-amber-300 shadow-sm'
                          : 'bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10'
                      }`}
                    >
                      <Banknote className="w-4 h-4" />
                      <span className="text-xs font-bold">Cash</span>
                      <span className="text-[10px] opacity-75">Pay at table</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('CARD')}
                      className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition text-center ${
                        paymentMethod === 'CARD'
                          ? 'bg-amber-500/15 border-amber-400 text-amber-300 shadow-sm'
                          : 'bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10'
                      }`}
                    >
                      <CreditCard className="w-4 h-4" />
                      <span className="text-xs font-bold">Card</span>
                      <span className="text-[10px] opacity-75">Debit/Credit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('MBWAY')}
                      className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition text-center ${
                        paymentMethod === 'MBWAY'
                          ? 'bg-amber-500/15 border-amber-400 text-amber-300 shadow-sm'
                          : 'bg-white/5 border-white/10 text-neutral-400 hover:bg-white/10'
                      }`}
                    >
                      <Smartphone className="w-4 h-4" />
                      <span className="text-xs font-bold">MB WAY</span>
                      <span className="text-[10px] opacity-75">Portugal</span>
                    </button>
                  </div>

                  {paymentMethod === 'MBWAY' && (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-1.5">
                      <label className="text-[11px] font-semibold text-amber-300 flex items-center gap-1">
                        <Smartphone className="w-3.5 h-3.5" />
                        MB WAY Portuguese Phone Number
                      </label>
                      <div className="flex gap-2">
                        <span className="px-2.5 py-1.5 rounded-lg bg-black/50 border border-amber-500/30 text-xs text-amber-300 font-mono flex items-center">
                          +351
                        </span>
                        <input
                          type="tel"
                          maxLength={9}
                          value={mbwayPhone}
                          onChange={(e) => setMbwayPhone(e.target.value.replace(/\D/g, ''))}
                          placeholder="912 345 678"
                          className="flex-1 px-3 py-1.5 rounded-lg bg-black/50 border border-amber-500/30 text-xs text-white placeholder-neutral-500 font-mono focus:outline-none focus:border-amber-400"
                        />
                      </div>
                      <p className="text-[10px] text-neutral-400">
                        You will receive an instant payment prompt in your MB WAY app.
                      </p>
                    </div>
                  )}
                </div>

                {/* Phase 8: NIF / Invoice Details Accordion */}
                <div className="pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setWantsNif(!wantsNif)}
                    className="w-full py-2 flex items-center justify-between text-xs text-neutral-300 hover:text-white transition"
                  >
                    <span className="flex items-center gap-1.5 font-semibold">
                      <ShieldCheck className="w-4 h-4 text-amber-400" />
                      Add NIF / Invoice Details (Optional)
                    </span>
                    {wantsNif ? (
                      <ChevronUp className="w-4 h-4 text-neutral-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-neutral-400" />
                    )}
                  </button>

                  {wantsNif && (
                    <div className="mt-2 p-3 rounded-xl bg-white/5 border border-white/10 space-y-2.5 text-xs">
                      <div>
                        <label className="text-[11px] font-medium text-neutral-400 block mb-1">
                          Tax ID / NIF
                        </label>
                        <input
                          type="text"
                          value={nif}
                          onChange={(e) => setNif(e.target.value.trim())}
                          placeholder="e.g. 123456789 (or foreign Tax ID)"
                          className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-medium text-neutral-400 block mb-1">
                          Legal / Company Name (Optional)
                        </label>
                        <input
                          type="text"
                          value={fiscalName}
                          onChange={(e) => setFiscalName(e.target.value)}
                          placeholder="e.g. Maria Silva or Acme Lda"
                          className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-medium text-neutral-400 block mb-1">
                          Tax Country
                        </label>
                        <select
                          value={taxCountry}
                          onChange={(e) => setTaxCountry(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-amber-500/50"
                        >
                          <option value="PT">Portugal (PT)</option>
                          <option value="ES">Spain (ES)</option>
                          <option value="FR">France (FR)</option>
                          <option value="DE">Germany (DE)</option>
                          <option value="GB">United Kingdom (GB)</option>
                          <option value="US">United States (US)</option>
                          <option value="OTHER">Other Country</option>
                        </select>
                      </div>

                      <label className="flex items-center gap-2 pt-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={saveProfile}
                          onChange={(e) => setSaveProfile(e.target.checked)}
                          className="rounded border-white/20 text-amber-500 focus:ring-0 bg-black/40"
                        />
                        <span className="text-[11px] text-neutral-400">
                          Save fiscal profile for future orders (GDPR consent)
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* Order Breakdown & Confirm Button */}
              <div className="p-5 border-t border-white/10 bg-[#0a0e17]/80 backdrop-blur space-y-3">
                {(error || validationError) && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{validationError || error}</span>
                  </div>
                )}

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-neutral-400">
                    <span>Subtotal</span>
                    <span className="text-white font-medium">
                      {currencySymbol}
                      {subtotal.toFixed(2)}
                    </span>
                  </div>

                  {settings?.taxEnabled && (
                    <div className="flex justify-between text-neutral-400">
                      <span>Estimated Tax ({settings.taxRate}%)</span>
                      <span className="text-white font-medium">
                        {currencySymbol}
                        {taxEstimate.toFixed(2)}
                      </span>
                    </div>
                  )}

                  {settings?.serviceChargeEnabled && (
                    <div className="flex justify-between text-neutral-400">
                      <span>Service Charge ({settings.serviceChargeRate}%)</span>
                      <span className="text-white font-medium">
                        {currencySymbol}
                        {serviceChargeEstimate.toFixed(2)}
                      </span>
                    </div>
                  )}

                  <div className="border-t border-white/10 pt-2 flex justify-between items-center text-base font-black">
                    <span className="text-white">Estimated Total</span>
                    <span className="text-amber-400 text-lg">
                      {currencySymbol}
                      {totalEstimate.toFixed(2)}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleCheckout}
                  disabled={isSubmitting || items.length === 0}
                  className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 disabled:opacity-50 text-neutral-950 font-bold tracking-wide shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
                      <span>Sending to Kitchen...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Confirm & Place Order • {currencySymbol}{totalEstimate.toFixed(2)}</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
