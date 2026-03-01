"use client";

import { useState, useEffect, useCallback } from "react";
import type { Property } from "@/types/database";

export function useProperties() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProperties = useCallback(async () => {
    try {
      const res = await fetch("/api/properties");
      if (res.ok) {
        const data = await res.json();
        setProperties(data.properties);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  const createProperty = useCallback(
    async (input: Record<string, unknown>) => {
      const res = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create property");
      }
      const data = await res.json();
      setProperties((prev) => [data.property, ...prev]);
      return data.property as Property;
    },
    [],
  );

  const updateProperty = useCallback(
    async (id: string, input: Record<string, unknown>) => {
      const res = await fetch(`/api/properties/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update property");
      }
      const data = await res.json();
      setProperties((prev) =>
        prev.map((p) => (p.id === id ? data.property : p)),
      );
      return data.property as Property;
    },
    [],
  );

  const deleteProperty = useCallback(async (id: string) => {
    const res = await fetch(`/api/properties/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to delete property");
    }
    setProperties((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return {
    properties,
    loading,
    fetchProperties,
    createProperty,
    updateProperty,
    deleteProperty,
  };
}
