"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { Property, PropertyMedia } from "@/types/database";

// ─── Helpers ─────────────────────────────────────────────────

function formatPrice(price: number | null): string {
  if (price == null) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(price);
}

const SERVICE_LABELS: Record<string, string> = {
  staging: "Virtual Staging",
  twilight: "Twilight",
  sky: "Sky Replace",
  sky_lighting: "Sky + Lighting",
  declutter: "Declutter",
  upscale: "Upscale",
  video: "Tour Video",
};

const SERVICE_PRICES: Record<string, number> = {
  staging: 500,
  twilight: 500,
  sky: 300,
  sky_lighting: 300,
  declutter: 300,
  upscale: 150,
};

const ROOM_TYPES = [
  "living_room",
  "kitchen",
  "bedroom",
  "bathroom",
  "dining_room",
  "office",
  "basement",
  "garage",
  "patio",
  "other",
];

const DESIGN_STYLES = [
  "modern",
  "contemporary",
  "farmhouse",
  "traditional",
  "minimalist",
  "scandinavian",
  "industrial",
  "coastal",
  "luxury",
];

type AIService = "staging" | "twilight" | "sky" | "sky_lighting" | "declutter" | "upscale";

// ─── Component ───────────────────────────────────────────────

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

  // Modal state
  const [selectedImage, setSelectedImage] = useState<PropertyMedia | null>(null);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [selectedService, setSelectedService] = useState<AIService>("staging");
  const [roomType, setRoomType] = useState("living_room");
  const [designStyle, setDesignStyle] = useState("modern");
  const [processing, setProcessing] = useState(false);
  const [processingJobs, setProcessingJobs] = useState<Set<string>>(new Set());

  // Before/after viewer
  const [compareImage, setCompareImage] = useState<PropertyMedia | null>(null);

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

  // Poll for processing jobs
  useEffect(() => {
    if (processingJobs.size === 0) return;

    const interval = setInterval(async () => {
      const res = await fetch(`/api/media/${propertyId}`);
      if (res.ok) {
        const data = await res.json();
        setMedia(data.media);

        // Check if any processing jobs completed
        const stillProcessing = new Set<string>();
        for (const m of data.media as PropertyMedia[]) {
          if (m.aistaging_job_id && processingJobs.has(m.aistaging_job_id) && m.status !== "completed" && m.status !== "failed") {
            stillProcessing.add(m.aistaging_job_id);
          }
        }
        setProcessingJobs(stillProcessing);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [processingJobs, propertyId]);

  const originals = media.filter((m) => m.type === "original");
  const processed = media.filter((m) => m.type !== "original");

  const handleProcess = async () => {
    if (!selectedImage) return;
    setProcessing(true);
    setError("");

    try {
      const endpoint = selectedService === "staging" ? "/api/media/stage" : "/api/media/enhance";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_id: propertyId,
          image_id: selectedImage.id,
          ...(selectedService === "staging"
            ? { room_type: roomType, design_style: designStyle }
            : { service: selectedService, options: {} }),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Processing failed");
        return;
      }

      // Track the job for polling
      if (data.job_id) {
        setProcessingJobs((prev) => new Set(prev).add(data.job_id));
      }

      setShowServiceModal(false);
      setSelectedImage(null);

      // Refresh media list
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setProcessing(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────

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

      {/* Original Photos */}
      <section className="mb-8">
        <h2 className="text-lg font-medium text-slate-800 mb-3">
          Photos ({originals.length})
        </h2>
        {originals.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
            <p className="text-slate-500 text-sm">
              No photos yet. Import from MLS to get started.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {originals.map((img) => (
              <div
                key={img.id}
                className="group relative bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-blue-300 transition-colors cursor-pointer"
                onClick={() => {
                  setSelectedImage(img);
                  setRoomType(img.room_type || "living_room");
                  setShowServiceModal(true);
                }}
              >
                <div className="aspect-[4/3] relative">
                  <img
                    src={img.url}
                    alt={img.room_type || "Property photo"}
                    className="w-full h-full object-cover"
                  />
                  {/* Processing badge */}
                  {media.some(
                    (m) =>
                      m.source_image_id === img.id &&
                      (m.status === "processing" || m.status === "pending"),
                  ) && (
                    <div className="absolute top-2 right-2 bg-amber-500 text-white text-[10px] px-2 py-0.5 rounded-full font-medium animate-pulse">
                      Processing...
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <p className="text-xs text-slate-500 capitalize">
                    {img.room_type?.replace(/_/g, " ") || "Photo"}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    {/* Count of AI results from this image */}
                    {(() => {
                      const results = processed.filter(
                        (m) => m.source_image_id === img.id && m.status === "completed",
                      );
                      if (results.length === 0) return null;
                      return (
                        <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                          {results.length} AI version{results.length > 1 ? "s" : ""}
                        </span>
                      );
                    })()}
                  </div>
                </div>
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/10 transition-colors flex items-center justify-center">
                  <span className="text-white text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity bg-blue-600 px-3 py-1.5 rounded-lg shadow-lg">
                    AI Services
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* AI-Processed Results */}
      {processed.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-medium text-slate-800 mb-3">
            AI Results ({processed.filter((m) => m.status === "completed").length})
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {processed.map((img) => (
              <div
                key={img.id}
                className="relative bg-white border border-slate-200 rounded-xl overflow-hidden"
              >
                <div className="aspect-[4/3] relative">
                  {img.status === "completed" ? (
                    <img
                      src={img.url}
                      alt={`${img.type} - ${img.room_type || ""}`}
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={() => {
                        // Find the source image for before/after
                        const source = originals.find((o) => o.id === img.source_image_id);
                        if (source) setCompareImage(img);
                      }}
                    />
                  ) : img.status === "processing" || img.status === "pending" ? (
                    <div className="w-full h-full flex items-center justify-center bg-slate-100">
                      <div className="text-center">
                        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-2" />
                        <p className="text-xs text-slate-500">Processing...</p>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-red-50">
                      <p className="text-xs text-red-500">Failed</p>
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-medium text-white bg-blue-600 px-1.5 py-0.5 rounded capitalize">
                      {SERVICE_LABELS[img.ai_service || img.type] || img.type}
                    </span>
                    {img.style && (
                      <span className="text-[10px] text-slate-500 capitalize">
                        {img.style}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1 capitalize">
                    {img.room_type?.replace(/_/g, " ") || ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Service Selection Modal */}
      {showServiceModal && selectedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
            {/* Preview */}
            <div className="aspect-[16/9] relative bg-slate-100">
              <img
                src={selectedImage.url}
                alt="Selected photo"
                className="w-full h-full object-cover"
              />
            </div>

            <div className="p-5">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">
                AI Services
              </h3>

              {/* Service buttons */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                {(Object.entries(SERVICE_PRICES) as [AIService, number][]).map(
                  ([svc, price]) => (
                    <button
                      key={svc}
                      onClick={() => setSelectedService(svc)}
                      className={`p-3 rounded-xl border text-left transition-colors ${
                        selectedService === svc
                          ? "border-blue-500 bg-blue-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <p className="text-sm font-medium text-slate-900 capitalize">
                        {SERVICE_LABELS[svc]}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        ${(price / 100).toFixed(2)}
                      </p>
                    </button>
                  ),
                )}
              </div>

              {/* Staging options */}
              {selectedService === "staging" && (
                <div className="space-y-3 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Room Type
                    </label>
                    <select
                      value={roomType}
                      onChange={(e) => setRoomType(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    >
                      {ROOM_TYPES.map((rt) => (
                        <option key={rt} value={rt}>
                          {rt.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Design Style
                    </label>
                    <select
                      value={designStyle}
                      onChange={(e) => setDesignStyle(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    >
                      {DESIGN_STYLES.map((ds) => (
                        <option key={ds} value={ds}>
                          {ds.replace(/\b\w/g, (c) => c.toUpperCase())}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowServiceModal(false);
                    setSelectedImage(null);
                  }}
                  className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleProcess}
                  disabled={processing}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {processing
                    ? "Processing..."
                    : `Apply ${SERVICE_LABELS[selectedService]} — $${(SERVICE_PRICES[selectedService] / 100).toFixed(2)}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Before/After Compare Modal */}
      {compareImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setCompareImage(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-4xl w-full mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-2">
              {/* Before */}
              <div className="relative">
                <div className="absolute top-3 left-3 bg-black/60 text-white text-xs px-2 py-1 rounded">
                  Before
                </div>
                <img
                  src={
                    originals.find((o) => o.id === compareImage.source_image_id)?.url ||
                    ""
                  }
                  alt="Before"
                  className="w-full aspect-[4/3] object-cover"
                />
              </div>
              {/* After */}
              <div className="relative">
                <div className="absolute top-3 left-3 bg-blue-600 text-white text-xs px-2 py-1 rounded">
                  After — {SERVICE_LABELS[compareImage.ai_service || compareImage.type]}
                </div>
                <img
                  src={compareImage.url}
                  alt="After"
                  className="w-full aspect-[4/3] object-cover"
                />
              </div>
            </div>
            <div className="p-4 flex justify-between items-center">
              <div className="text-sm text-slate-500">
                {compareImage.style && (
                  <span className="capitalize">{compareImage.style} style</span>
                )}
                {compareImage.room_type && (
                  <span className="ml-2 capitalize">
                    {compareImage.room_type.replace(/_/g, " ")}
                  </span>
                )}
              </div>
              <button
                onClick={() => setCompareImage(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
