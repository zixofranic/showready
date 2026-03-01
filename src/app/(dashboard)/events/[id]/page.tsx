"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { Visitor, Event } from "@/types/database";

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(time: string | null): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  return `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}:${m} ${ampm}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const SOURCE_LABELS: Record<string, string> = {
  kiosk: "Kiosk",
  qr: "QR Code",
  manual: "Manual",
  import: "Import",
};

const CRM_COLORS: Record<string, { success: string; retrying: string; failed: string; label: string }> = {
  cloze: { success: "bg-orange-500", retrying: "bg-orange-300", failed: "bg-red-400", label: "Cloze" },
  fub: { success: "bg-emerald-500", retrying: "bg-emerald-300", failed: "bg-red-400", label: "FUB" },
  zapier: { success: "bg-amber-500", retrying: "bg-amber-300", failed: "bg-red-400", label: "Zapier" },
};

function CrmSyncBadges({ status }: { status: Record<string, string> }) {
  const entries = Object.entries(status);
  if (entries.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {entries.map(([crm, state]) => {
        const colors = CRM_COLORS[crm] || { success: "bg-green-500", retrying: "bg-yellow-300", failed: "bg-red-400", label: crm };
        const dotColor = state === "success" ? colors.success : state === "retrying" ? colors.retrying : colors.failed;
        return (
          <span
            key={crm}
            title={`${colors.label}: ${state}`}
            className={`inline-block w-2 h-2 rounded-full ${dotColor}`}
          />
        );
      })}
    </div>
  );
}

export default function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [eventId, setEventId] = useState("");
  const [event, setEvent] = useState<Event | null>(null);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "contacted" | "not_contacted" | "priority">("all");
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesValue, setNotesValue] = useState("");

  useEffect(() => {
    params.then((p) => setEventId(p.id));
  }, [params]);

  const fetchData = useCallback(async () => {
    if (!eventId) return;
    try {
      const [eventRes, visitorsRes] = await Promise.all([
        fetch(`/api/events/${eventId}`),
        fetch(`/api/events/${eventId}/visitors`),
      ]);

      if (eventRes.ok) {
        const data = await eventRes.json();
        setEvent(data.event);
      }
      if (visitorsRes.ok) {
        const data = await visitorsRes.json();
        setVisitors(data.visitors);
      }
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateVisitor = async (id: string, updates: Record<string, unknown>) => {
    const res = await fetch(`/api/visitors/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const data = await res.json();
      setVisitors((prev) => prev.map((v) => (v.id === id ? data.visitor : v)));
    }
  };

  const toggleContacted = (v: Visitor) => updateVisitor(v.id, { contacted: !v.contacted });
  const togglePriority = (v: Visitor) => updateVisitor(v.id, { priority: !v.priority });

  const saveNotes = (id: string) => {
    updateVisitor(id, { notes: notesValue || null });
    setEditingNotes(null);
  };

  // Filter and search
  const filtered = visitors.filter((v) => {
    if (filter === "contacted" && !v.contacted) return false;
    if (filter === "not_contacted" && v.contacted) return false;
    if (filter === "priority" && !v.priority) return false;

    if (search) {
      const q = search.toLowerCase();
      return (
        v.first_name.toLowerCase().includes(q) ||
        (v.last_name?.toLowerCase().includes(q)) ||
        (v.email?.toLowerCase().includes(q)) ||
        (v.phone?.includes(q))
      );
    }
    return true;
  });

  const stats = {
    total: visitors.length,
    contacted: visitors.filter((v) => v.contacted).length,
    priority: visitors.filter((v) => v.priority).length,
    withEmail: visitors.filter((v) => v.email).length,
    withPhone: visitors.filter((v) => v.phone).length,
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-slate-400 text-sm">
        Loading event...
      </div>
    );
  }

  if (!event) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Event not found</p>
        <Link href="/events" className="text-sm text-blue-600 hover:underline mt-2 inline-block">
          Back to events
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link href="/events" className="text-sm text-slate-400 hover:text-slate-600 mb-2 inline-block">
          &larr; Events
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{event.name}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
              <span>{formatDate(event.event_date)}</span>
              {event.start_time && (
                <span>
                  {formatTime(event.start_time)}
                  {event.end_time && ` - ${formatTime(event.end_time)}`}
                </span>
              )}
            </div>
            {event.property && (
              <p className="text-sm text-slate-400 mt-0.5">{event.property.address}</p>
            )}
          </div>
          <span
            className={`text-xs px-3 py-1 rounded-full font-medium capitalize ${
              event.status === "live"
                ? "bg-green-100 text-green-700"
                : event.status === "upcoming"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-slate-100 text-slate-600"
            }`}
          >
            {event.status}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[
          { label: "Total Visitors", value: stats.total, color: "text-slate-900" },
          { label: "Contacted", value: stats.contacted, color: "text-green-700" },
          { label: "Priority", value: stats.priority, color: "text-amber-600" },
          { label: "With Email", value: stats.withEmail, color: "text-blue-700" },
          { label: "With Phone", value: stats.withPhone, color: "text-purple-700" },
        ].map((stat) => (
          <div key={stat.label} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search visitors..."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          />
        </div>
        <div className="flex gap-2">
          {(["all", "contacted", "not_contacted", "priority"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-lg text-xs font-medium capitalize ${
                filter === f
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Visitor List */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <p className="text-slate-500 text-sm">
            {visitors.length === 0
              ? "No visitors have signed in yet."
              : "No visitors match your search."}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left py-3 px-4 font-medium text-slate-600 w-8"></th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600">Name</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600">Contact</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600">Source</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600">Time</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600">CRM</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600">Status</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-600 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr key={v.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <button
                        onClick={() => togglePriority(v)}
                        className={`text-lg ${v.priority ? "text-amber-400" : "text-slate-200 hover:text-amber-300"}`}
                        title={v.priority ? "Remove priority" : "Mark as priority"}
                      >
                        &#9733;
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-900">
                        {v.first_name} {v.last_name || ""}
                      </p>
                      {v.notes && editingNotes !== v.id && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[200px]">
                          {v.notes}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {v.email && (
                        <p className="text-slate-600 text-xs">{v.email}</p>
                      )}
                      {v.phone && (
                        <p className="text-slate-400 text-xs">{v.phone}</p>
                      )}
                      {!v.email && !v.phone && (
                        <span className="text-slate-300 text-xs">No contact</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs text-slate-500">
                        {SOURCE_LABELS[v.source] || v.source}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs text-slate-400">{timeAgo(v.created_at)}</span>
                    </td>
                    <td className="py-3 px-4">
                      <CrmSyncBadges status={v.crm_sync_status || {}} />
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => toggleContacted(v)}
                        className={`text-xs px-2 py-1 rounded-full font-medium ${
                          v.contacted
                            ? "bg-green-100 text-green-700"
                            : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                        }`}
                      >
                        {v.contacted ? "Contacted" : "Not contacted"}
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => {
                          if (editingNotes === v.id) {
                            saveNotes(v.id);
                          } else {
                            setEditingNotes(v.id);
                            setNotesValue(v.notes || "");
                          }
                        }}
                        className="text-xs text-slate-400 hover:text-slate-600"
                        title="Edit notes"
                      >
                        {editingNotes === v.id ? "Save" : "Notes"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Inline notes editor */}
          {editingNotes && (
            <div className="border-t border-slate-200 p-4 bg-slate-50">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Notes for {visitors.find((v) => v.id === editingNotes)?.first_name}
              </label>
              <div className="flex gap-2">
                <textarea
                  value={notesValue}
                  onChange={(e) => setNotesValue(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  placeholder="Add notes about this visitor..."
                />
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => saveNotes(editingNotes)}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingNotes(null)}
                    className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
