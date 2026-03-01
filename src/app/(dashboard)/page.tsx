"use client";

import { useAuth } from "@/lib/auth-context";

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">
          Welcome back{user?.email ? `, ${user.email}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-3xl font-bold text-blue-600">0</div>
          <div className="text-xs text-slate-500 mt-1">Upcoming Events</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-3xl font-bold text-blue-600">0</div>
          <div className="text-xs text-slate-500 mt-1">Total Visitors</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-3xl font-bold text-blue-600">0</div>
          <div className="text-xs text-slate-500 mt-1">Properties</div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">
          Ready to host your first open house?
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          Create an event, add a property, and launch kiosk mode for visitor
          sign-in.
        </p>
        <a
          href="/events"
          className="inline-flex px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Create Event
        </a>
      </div>
    </div>
  );
}
