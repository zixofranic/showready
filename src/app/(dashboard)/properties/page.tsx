"use client";

import { useState } from "react";
import { useProperties } from "@/hooks/useProperties";

function formatPrice(price: number | null): string {
  if (price == null) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(price);
}

export default function PropertiesPage() {
  const { properties, loading, createProperty, deleteProperty } =
    useProperties();
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [beds, setBeds] = useState("");
  const [baths, setBaths] = useState("");
  const [sqft, setSqft] = useState("");
  const [price, setPrice] = useState("");
  const [mlsNumber, setMlsNumber] = useState("");

  const resetForm = () => {
    setAddress("");
    setCity("");
    setState("");
    setZip("");
    setBeds("");
    setBaths("");
    setSqft("");
    setPrice("");
    setMlsNumber("");
    setError("");
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await createProperty({
        address,
        city: city || null,
        state: state || null,
        zip: zip || null,
        beds: beds ? parseInt(beds) : null,
        baths: baths ? parseFloat(baths) : null,
        sqft: sqft ? parseInt(sqft) : null,
        price: price ? parseFloat(price) : null,
        mls_number: mlsNumber || null,
      });
      setShowCreate(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this property? This cannot be undone.")) return;
    try {
      await deleteProperty(id);
    } catch {
      // ignore
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Properties</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your listed properties
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowCreate(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Add Property
        </button>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Add Property
            </h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Address *
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 Main Street"
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    State
                  </label>
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    maxLength={2}
                    placeholder="KY"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    ZIP
                  </label>
                  <input
                    type="text"
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    maxLength={10}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Beds
                  </label>
                  <input
                    type="number"
                    value={beds}
                    onChange={(e) => setBeds(e.target.value)}
                    min="0"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Baths
                  </label>
                  <input
                    type="number"
                    value={baths}
                    onChange={(e) => setBaths(e.target.value)}
                    min="0"
                    step="0.5"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Sqft
                  </label>
                  <input
                    type="number"
                    value={sqft}
                    onChange={(e) => setSqft(e.target.value)}
                    min="0"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Price
                  </label>
                  <input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    min="0"
                    placeholder="450000"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    MLS #
                  </label>
                  <input
                    type="text"
                    value={mlsNumber}
                    onChange={(e) => setMlsNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "Adding..." : "Add Property"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Property List */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">
          Loading properties...
        </div>
      ) : properties.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <p className="text-slate-500 text-sm">
            No properties yet.{" "}
            <button
              onClick={() => setShowCreate(true)}
              className="text-blue-600 hover:underline"
            >
              Add one
            </button>
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {properties.map((prop) => (
            <div
              key={prop.id}
              className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-slate-900">{prop.address}</h3>
                  {(prop.city || prop.state || prop.zip) && (
                    <p className="text-sm text-slate-500 mt-0.5">
                      {[prop.city, prop.state, prop.zip]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(prop.id)}
                  className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded"
                >
                  Delete
                </button>
              </div>
              <div className="flex gap-4 mt-3 text-xs text-slate-500">
                {prop.beds != null && <span>{prop.beds} bed</span>}
                {prop.baths != null && <span>{prop.baths} bath</span>}
                {prop.sqft != null && (
                  <span>{prop.sqft.toLocaleString()} sqft</span>
                )}
                {prop.price != null && (
                  <span className="font-medium text-slate-700">
                    {formatPrice(prop.price)}
                  </span>
                )}
                {prop.mls_number && (
                  <span className="text-slate-400">MLS: {prop.mls_number}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
