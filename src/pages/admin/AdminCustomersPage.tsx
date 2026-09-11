import React, { useEffect, useState } from 'react';
import {
  Users,
  Search,
  RefreshCw,
  ShieldCheck,
  Phone,
  Mail,
  ShoppingBag,
  Lock,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { paymentService } from '../../services/paymentService';
import type { Customer } from '../../types';

export const AdminCustomersPage: React.FC = () => {
  const { activeRestaurant, hasPermission } = useAuth();
  const canViewFiscalData = hasPermission('VIEW_CUSTOMER_FISCAL_DATA');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchCustomers = async () => {
    if (!activeRestaurant?.id) return;
    try {
      setLoading(true);
      setError(null);
      const res = await paymentService.getRestaurantCustomers(activeRestaurant.id, {
        search: searchQuery || undefined,
        page,
        limit: 20,
      });
      setCustomers(res.customers);
      setTotal(res.pagination.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load customer directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [activeRestaurant?.id, page]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchCustomers();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-amber-400" />
            Customer Directory & Fiscal Profiles
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Privacy-protected diner directory, masked NIFs, and GDPR consent tracking for {activeRestaurant?.name} ({total} diners).
          </p>
        </div>

        <button
          onClick={fetchCustomers}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 border border-zinc-700 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* GDPR Privacy Notice Banner */}
      <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-3 text-xs text-amber-300">
        <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <strong className="font-semibold block text-white mb-0.5">GDPR & Fiscal Data Protection</strong>
          <span>
            Customer tax identifiers (NIF) are strictly masked. Full tax credentials are exclusively embedded inside immutable signed receipt snapshots and are never exposed in bulk export views.
          </span>
        </div>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search diners by name, email, or phone number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs transition"
        >
          Search
        </button>
      </form>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Customers Table */}
      {loading && customers.length === 0 ? (
        <div className="p-12 text-center text-zinc-500">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-400" />
          <p className="text-sm">Loading customer directory...</p>
        </div>
      ) : customers.length === 0 ? (
        <div className="p-12 text-center text-zinc-500 bg-zinc-900/30 rounded-2xl border border-zinc-800/60">
          <Users className="w-8 h-8 mx-auto mb-2 text-zinc-600" />
          <p className="text-sm">No customers recorded yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-800/80 bg-zinc-900/40">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="bg-zinc-900/80 text-zinc-400 font-semibold border-b border-zinc-800 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-4">Customer</th>
                <th className="p-4">Contact</th>
                <th className="p-4">Fiscal Profile (Masked NIF)</th>
                <th className="p-4 text-center">Orders</th>
                <th className="p-4">Consent Status</th>
                <th className="p-4 text-right">First Seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {customers.map((c) => {
                const defaultProfile = c.fiscalProfiles?.[0];

                return (
                  <tr key={c.id} className="hover:bg-zinc-800/30 transition">
                    <td className="p-4">
                      <div className="font-semibold text-white">
                        {c.name || 'Anonymous Guest'}
                      </div>
                      <div className="font-mono text-[10px] text-zinc-500">
                        ID: {c.id.substring(0, 8)}...
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="space-y-0.5 text-zinc-400">
                        {c.email && (
                          <div className="flex items-center gap-1.5">
                            <Mail className="w-3 h-3 text-zinc-500" />
                            <span>{c.email}</span>
                          </div>
                        )}
                        {c.phone && (
                          <div className="flex items-center gap-1.5 font-mono">
                            <Phone className="w-3 h-3 text-zinc-500" />
                            <span>{c.phone}</span>
                          </div>
                        )}
                        {!c.email && !c.phone && <span className="text-zinc-600">-</span>}
                      </div>
                    </td>
                    <td className="p-4">
                      {canViewFiscalData ? (
                        defaultProfile ? (
                          <div className="flex items-center gap-2">
                            <Lock className="w-3.5 h-3.5 text-amber-400" />
                            <span className="font-mono bg-zinc-800 px-2 py-0.5 rounded text-amber-300">
                              {defaultProfile.nif || 'PT*********'}
                            </span>
                            <span className="text-[10px] text-zinc-500">({defaultProfile.taxCountry})</span>
                          </div>
                        ) : (
                          <span className="text-zinc-600 italic">No fiscal profile</span>
                        )
                      ) : (
                        <div className="flex items-center gap-1.5 text-zinc-500">
                          <Lock className="w-3.5 h-3.5" />
                          <span className="font-mono text-[11px]">***-***-*** (Protected)</span>
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <span className="inline-flex items-center gap-1 font-mono font-bold bg-zinc-800 px-2.5 py-0.5 rounded-full text-white">
                        <ShoppingBag className="w-3 h-3 text-amber-400" />
                        {c._count?.orders ?? c.orders?.length ?? 0}
                      </span>
                    </td>
                    <td className="p-4">
                      {c.consentGiven ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Consent Verified</span>
                        </span>
                      ) : (
                        <span className="text-zinc-500 text-[11px]">Guest Checkout</span>
                      )}
                    </td>
                    <td className="p-4 text-right text-zinc-400 font-mono">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
