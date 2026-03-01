"use client";

import { useAuth } from "@/lib/auth-context";
import { useEvents } from "@/hooks/useEvents";
import { useProperties } from "@/hooks/useProperties";
import Link from "next/link";

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { events, loading: eventsLoading } = useEvents();
  const { properties, loading: propsLoading } = useProperties();

  const upcomingEvents = events.filter((e) => e.status === "upcoming");
  const liveEvents = events.filter((e) => e.status === "live");
  const totalVisitors = events.reduce((sum, e) => sum + e.visitor_count, 0);
  const loading = eventsLoading || propsLoading;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">
          Welcome back{user?.email ? `, ${user.email}` : ""}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-3xl font-bold text-green-600">
            {loading ? "-" : liveEvents.length}
          </div>
          <div className="text-xs text-slate-500 mt-1">Live Now</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-3xl font-bold text-blue-600">
            {loading ? "-" : upcomingEvents.length}
          </div>
          <div className="text-xs text-slate-500 mt-1">Upcoming</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-3xl font-bold text-purple-600">
            {loading ? "-" : totalVisitors}
          </div>
          <div className="text-xs text-slate-500 mt-1">Total Visitors</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-3xl font-bold text-slate-700">
            {loading ? "-" : properties.length}
          </div>
          <div className="text-xs text-slate-500 mt-1">Properties</div>
        </div>
      </div>

      {/* Live Events */}
      {liveEvents.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Live Events</h2>
          <div className="space-y-2">
            {liveEvents.map((event) => (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                className="block bg-green-50 border border-green-200 rounded-xl p-4 hover:border-green-300 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-slate-900">{event.name}</span>
                    {event.property && (
                      <span className="text-sm text-slate-500 ml-2">{event.property.address}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-green-700">
                      {event.visitor_count} visitors
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                      Live
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Events */}
      {upcomingEvents.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Upcoming Events</h2>
          <div className="space-y-2">
            {upcomingEvents.slice(0, 5).map((event) => (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                className="block bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-slate-900">{event.name}</span>
                    {event.property && (
                      <span className="text-sm text-slate-500 ml-2">{event.property.address}</span>
                    )}
                  </div>
                  <span className="text-sm text-slate-500">{formatDate(event.event_date)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && events.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">
            Ready to host your first open house?
          </h2>
          <p className="text-sm text-slate-500 mb-4">
            Create an event, add a property, and launch kiosk mode for visitor sign-in.
          </p>
          <Link
            href="/events"
            className="inline-flex px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Create Event
          </Link>
        </div>
      )}
    </div>
  );
}
