"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { Property, PropertyMedia } from "@/types/database";

function formatPrice(price: number | null): string {
  if (price == null) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(price);
}

export default function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [propertyId, setPropertyId] = useState("");
  const [property, setProperty] = useState<Property | null>(null);
  const [media, setMedia] = useState<PropertyMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setPropertyId(p.id));
  }, [params]);

  const fetchData = useCallback(async () => {
    if (!propertyId) return;
    try {
      const [propRes, mediaRes] = await Promise.all([
        fetch(`/api/properties/${propertyId}`),
        fetch(`/api/media/${propertyId}`),
      ]);

      if (propRes.ok) {
        const data = await propRes.json();
        setProperty(data.property);
      } else {
        setError("Property not found");
      }

      if (mediaRes.ok) {
        const data = await mediaRes.json();
        setMedia(data.media);
      }
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const photos = media.filter((m) => m.type === "original");

  if (loading) {
    return (
      <div className="text-center py-12 text-slate-400 text-sm">
        Loading property...
      </div>
    );
  }

  if (!property) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Property not found</p>
        <Link
          href="/properties"
          className="text-sm text-blue-600 hover:underline mt-2 inline-block"
        >
          Back to properties
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/properties"
          className="text-sm text-slate-400 hover:text-slate-600 mb-2 inline-block"
        >
          &larr; Properties
        </Link>
        <h1 className="text-xl font-semibold text-slate-900">
          {property.address}
        </h1>
        <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
          {property.city && <span>{property.city}, {property.state}</span>}
          {property.beds != null && <span>{property.beds} bed</span>}
          {property.baths != null && <span>{property.baths} bath</span>}
          {property.sqft != null && (
            <span>{property.sqft.toLocaleString()} sqft</span>
          )}
          {property.price != null && (
            <span className="font-medium text-slate-700">
              {formatPrice(property.price)}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
          <button
            onClick={() => setError("")}
            className="ml-2 text-red-500 hover:text-red-700"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Photos */}
      <section>
        <h2 className="text-lg font-medium text-slate-800 mb-3">
          Photos ({photos.length})
        </h2>
        {photos.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
            <p className="text-slate-500 text-sm">
              No photos yet. Import from MLS to get started.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {photos.map((img) => (
              <div
                key={img.id}
                className="relative bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-slate-300 transition-colors cursor-pointer"
                onClick={() => setLightbox(img.url)}
              >
                <div className="aspect-[4/3]">
                  <img
                    src={img.url}
                    alt={img.room_type || "Property photo"}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-2">
                  <p className="text-xs text-slate-500 capitalize">
                    {img.room_type?.replace(/_/g, " ") || "Photo"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt="Property photo"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
