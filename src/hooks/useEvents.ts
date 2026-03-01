"use client";

import { useState, useEffect, useCallback } from "react";
import type { Event } from "@/types/database";

export function useEvents() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/events");
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const createEvent = useCallback(
    async (input: Record<string, unknown>) => {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create event");
      }
      const data = await res.json();
      setEvents((prev) => [data.event, ...prev]);
      return data.event as Event;
    },
    [],
  );

  const updateEvent = useCallback(
    async (id: string, input: Record<string, unknown>) => {
      const res = await fetch(`/api/events/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update event");
      }
      const data = await res.json();
      setEvents((prev) => prev.map((e) => (e.id === id ? data.event : e)));
      return data.event as Event;
    },
    [],
  );

  const deleteEvent = useCallback(async (id: string) => {
    const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to delete event");
    }
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }, []);

  return { events, loading, fetchEvents, createEvent, updateEvent, deleteEvent };
}
