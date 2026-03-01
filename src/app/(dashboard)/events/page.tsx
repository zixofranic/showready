"use client";

import { useState } from "react";
import { useEvents } from "@/hooks/useEvents";
import { useProperties } from "@/hooks/useProperties";
import type { Event } from "@/types/database";

type Tab = "upcoming" | "live" | "completed";

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(time: string | null): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  return `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}:${m} ${ampm}`;
}

const STATUS_COLORS: Record<string, string> = {
  upcoming: "bg-blue-100 text-blue-700",
  live: "bg-green-100 text-green-700",
  completed: "bg-slate-100 text-slate-600",
};

export default function EventsPage() {
  const { events, loading, createEvent, updateEvent, deleteEvent } = useEvents();
  const { properties } = useProperties();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [name, setName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [kioskPin, setKioskPin] = useState("");

  const filtered = events.filter((e) => e.status === tab);

  const resetForm = () => {
    setName("");
    setEventDate("");
    setStartTime("");
    setEndTime("");
    setPropertyId("");
    setKioskPin("");
    setError("");
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await createEvent({
        name,
        event_date: eventDate,
        start_time: startTime || null,
        end_time: endTime || null,
        property_id: propertyId || null,
        kiosk_pin: kioskPin || null,
      });
      setShowCreate(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (event: Event, newStatus: string) => {
    try {
      await updateEvent(event.id, { status: newStatus });
    } catch {
      // ignore
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this event? This cannot be undone.")) return;
    try {
      await deleteEvent(id);
    } catch {
      // ignore
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Events</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your open house events
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowCreate(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          + New Event
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(["upcoming", "live", "completed"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
              tab === t
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {t}
            <span className="ml-1.5 text-xs opacity-70">
              ({events.filter((e) => e.status === t).length})
            </span>
          </button>
        ))}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              New Event
            </h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Event Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Open House - 123 Main St"
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Date *
                  </label>
                  <input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Property
                  </label>
                  <select
                    value={propertyId}
                    onChange={(e) => setPropertyId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  >
                    <option value="">None</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.address}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Kiosk PIN (4 digits)
                </label>
                <input
                  type="text"
                  value={kioskPin}
                  onChange={(e) =>
                    setKioskPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                  placeholder="1234"
                  maxLength={4}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Required to exit kiosk mode
                </p>
              </div>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

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
                  {saving ? "Creating..." : "Create Event"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Event List */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">
          Loading events...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <p className="text-slate-500 text-sm">
            No {tab} events.{" "}
            {tab === "upcoming" && (
              <button
                onClick={() => setShowCreate(true)}
                className="text-blue-600 hover:underline"
              >
                Create one
              </button>
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((event) => (
            <div
              key={event.id}
              className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-slate-900">{event.name}</h3>
                  <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                    <span>{formatDate(event.event_date)}</span>
                    {event.start_time && (
                      <span>
                        {formatTime(event.start_time)}
                        {event.end_time && ` - ${formatTime(event.end_time)}`}
                      </span>
                    )}
                    <span>{event.visitor_count} visitors</span>
                  </div>
                  {event.property && (
                    <p className="text-xs text-slate-400 mt-1">
                      {event.property.address}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[event.status]}`}
                  >
                    {event.status}
                  </span>
                  <div className="flex gap-1">
                    {event.status === "upcoming" && (
                      <button
                        onClick={() => handleStatusChange(event, "live")}
                        className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100"
                      >
                        Go Live
                      </button>
                    )}
                    {event.status === "live" && (
                      <>
                        <a
                          href={`/kiosk/${event.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
                        >
                          Kiosk
                        </a>
                        <button
                          onClick={() => handleStatusChange(event, "completed")}
                          className="text-xs px-2 py-1 bg-slate-50 text-slate-700 rounded hover:bg-slate-100"
                        >
                          End
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleDelete(event.id)}
                      className="text-xs px-2 py-1 text-red-500 hover:bg-red-50 rounded"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
