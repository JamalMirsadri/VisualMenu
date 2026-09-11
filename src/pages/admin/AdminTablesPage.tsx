import React, { useEffect, useState } from 'react';
import {
  Armchair,
  Plus,
  QrCode,
  Users,
  MapPin,
  Edit2,
  Trash2,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Search,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { tableService, type CreateTablePayload } from '../../services/tableService';
import type { Table } from '../../types';

export const AdminTablesPage: React.FC = () => {
  const { activeRestaurant, role } = useAuth();
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<Table | null>(null);
  const [formData, setFormData] = useState<CreateTablePayload>({
    number: '',
    name: '',
    capacity: 4,
    location: '',
    active: true,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canManage = role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER';

  const fetchTables = async () => {
    if (!activeRestaurant?.id) return;
    try {
      setLoading(true);
      setError(null);
      const data = await tableService.getTables(activeRestaurant.id);
      setTables(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load restaurant tables.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTables();
  }, [activeRestaurant?.id]);

  const handleOpenCreate = () => {
    setEditingTable(null);
    setFormData({
      number: '',
      name: '',
      capacity: 4,
      location: '',
      active: true,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (table: Table) => {
    setEditingTable(table);
    setFormData({
      number: table.number,
      name: table.name,
      capacity: table.capacity,
      location: table.location || '',
      active: table.active,
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRestaurant?.id) return;

    if (!formData.number.trim()) {
      setFormError('Table number is required.');
      return;
    }
    if (!formData.name.trim()) {
      setFormError('Table name is required.');
      return;
    }

    try {
      setSubmitting(true);
      setFormError(null);

      if (editingTable) {
        await tableService.updateTable(activeRestaurant.id, editingTable.id, formData);
      } else {
        await tableService.createTable(activeRestaurant.id, formData);
      }

      setIsModalOpen(false);
      await fetchTables();
    } catch (err: any) {
      setFormError(err.message || 'Error saving dining table.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (tableId: string, tableNumber: string) => {
    if (!activeRestaurant?.id) return;
    if (!window.confirm(`Are you sure you want to remove or deactivate Table ${tableNumber}?`)) {
      return;
    }

    try {
      await tableService.deleteTable(activeRestaurant.id, tableId);
      await fetchTables();
    } catch (err: any) {
      alert(err.message || 'Failed to delete table.');
    }
  };

  const copyTableLink = (tableNum: string) => {
    const url = `${window.location.origin}/menu/${activeRestaurant?.slug}/table/${tableNum}`;
    navigator.clipboard.writeText(url);
    setCopiedSlug(tableNum);
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  const filteredTables = tables.filter((t) => {
    const q = searchQuery.toLowerCase();
    return (
      t.number.toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q) ||
      (t.location && t.location.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Armchair className="w-6 h-6 text-amber-400" />
            Dining Table Management
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Configure floor tables, seat capacities, and digital ordering QR links for {activeRestaurant?.name}.
          </p>
        </div>

        {canManage && (
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-neutral-950 font-bold text-sm tracking-wide shadow-lg shadow-amber-500/20 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Add Table</span>
          </button>
        )}
      </div>

      {/* Error alert */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Search & Stats Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by table number, name, or area..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-400"
          />
        </div>

        <div className="flex items-center gap-4 text-xs text-zinc-400">
          <span>
            Total Tables: <strong className="text-white font-semibold">{tables.length}</strong>
          </span>
          <span>
            Active: <strong className="text-emerald-400 font-semibold">{tables.filter((t) => t.active).length}</strong>
          </span>
          <span>
            Total Capacity: <strong className="text-amber-400 font-semibold">{tables.reduce((acc, t) => acc + t.capacity, 0)} Seats</strong>
          </span>
        </div>
      </div>

      {/* Tables Grid */}
      {loading ? (
        <div className="py-16 text-center text-zinc-400">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm">Loading floor tables...</p>
        </div>
      ) : filteredTables.length === 0 ? (
        <div className="py-16 text-center bg-zinc-900/20 rounded-2xl border border-zinc-800 p-8">
          <Armchair className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white mb-1">No tables found</h3>
          <p className="text-sm text-zinc-400 max-w-sm mx-auto mb-4">
            {searchQuery ? 'No tables match your search query.' : 'Create dining tables to enable table-specific QR ordering.'}
          </p>
          {canManage && !searchQuery && (
            <button
              onClick={handleOpenCreate}
              className="px-4 py-2 rounded-xl bg-amber-500 text-neutral-950 font-bold text-xs"
            >
              Add First Table
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTables.map((table) => {
            const tableMenuUrl = `${window.location.origin}/menu/${activeRestaurant?.slug}/table/${table.number}`;

            return (
              <div
                key={table.id}
                className="bg-zinc-900/70 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-5 transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-black text-lg">
                        {table.number}
                      </div>
                      <div>
                        <h3 className="font-bold text-white text-base leading-snug">{table.name}</h3>
                        <div className="flex items-center gap-3 text-xs text-zinc-400 mt-0.5">
                          <span className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5 text-zinc-500" />
                            {table.capacity} Seats
                          </span>
                          {table.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-zinc-500" />
                              {table.location}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                        table.active
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                      }`}
                    >
                      {table.active ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Active</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3 h-3" />
                          <span>Inactive</span>
                        </>
                      )}
                    </span>
                  </div>

                  {/* QR Link Box */}
                  <div className="p-2.5 rounded-xl bg-black/40 border border-zinc-800 text-xs text-zinc-400 flex items-center justify-between gap-2 mb-4">
                    <div className="flex items-center gap-2 truncate">
                      <QrCode className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="truncate text-[11px] font-mono text-zinc-300">
                        /table/{table.number}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => copyTableLink(table.number)}
                        className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition"
                        title="Copy table menu link"
                      >
                        {copiedSlug === table.number ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <a
                        href={tableMenuUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 rounded hover:bg-white/10 text-amber-400 hover:text-amber-300 transition"
                        title="Open table menu in new tab"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                </div>

                {/* Table Actions */}
                {canManage && (
                  <div className="border-t border-zinc-800/80 pt-3 flex items-center justify-between text-xs">
                    <button
                      onClick={() => handleOpenEdit(table)}
                      className="text-zinc-400 hover:text-white flex items-center gap-1.5 transition"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => handleDelete(table.id, table.number)}
                      className="text-zinc-500 hover:text-red-400 flex items-center gap-1.5 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE / EDIT TABLE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl text-white">
            <h2 className="text-lg font-bold mb-1 flex items-center gap-2">
              <Armchair className="w-5 h-5 text-amber-400" />
              <span>{editingTable ? 'Edit Dining Table' : 'Add Dining Table'}</span>
            </h2>
            <p className="text-xs text-zinc-400 mb-5">
              Unique table numbers allow customers to order directly to their seat.
            </p>

            {formError && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Table Number *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 12 or B-4"
                    value={formData.number}
                    onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1">
                    Capacity (Seats)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={formData.capacity}
                    onChange={(e) =>
                      setFormData({ ...formData, capacity: parseInt(e.target.value, 10) || 1 })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Table Display Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Garden Pavilion 12"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Floor Area / Location
                </label>
                <input
                  type="text"
                  placeholder="e.g. Terrace, Main Dining Room, Mezzanine"
                  value={formData.location || ''}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="tableActive"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 bg-zinc-900 border-zinc-700"
                />
                <label htmlFor="tableActive" className="text-xs text-zinc-300 font-medium">
                  Table is active and available for customer ordering
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-neutral-950 font-bold text-xs shadow-lg shadow-amber-500/20 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingTable ? 'Save Changes' : 'Create Table'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
