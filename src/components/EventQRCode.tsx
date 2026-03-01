"use client";

import { useState, useRef, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";

interface EventQRCodeProps {
  eventId: string;
  eventName: string;
  propertyAddress?: string;
}

export function EventQRCode({ eventId, eventName, propertyAddress }: EventQRCodeProps) {
  const [showModal, setShowModal] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  const registrationUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/register/${eventId}`
      : `/register/${eventId}`;

  const handleDownload = useCallback(() => {
    if (!qrRef.current) return;
    const svg = qrRef.current.querySelector("svg");
    if (!svg) return;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = 800;
    canvas.height = 1000;

    // White background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw QR code
    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 100, 80, 600, 600);

      // Event name
      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 28px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(eventName, 400, 760);

      // Property address
      if (propertyAddress) {
        ctx.fillStyle = "#64748b";
        ctx.font = "20px system-ui, sans-serif";
        ctx.fillText(propertyAddress, 400, 800);
      }

      // Instructions
      ctx.fillStyle = "#94a3b8";
      ctx.font = "18px system-ui, sans-serif";
      ctx.fillText("Scan to sign in", 400, 860);

      // URL
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "14px system-ui, sans-serif";
      ctx.fillText(registrationUrl, 400, 920);

      const link = document.createElement("a");
      link.download = `qr-${eventName.replace(/\s+/g, "-").toLowerCase()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
    img.src = `data:image/svg+xml;base64,${btoa(svgData)}`;
  }, [eventName, propertyAddress, registrationUrl]);

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="text-xs px-2 py-1 bg-purple-50 text-purple-700 rounded hover:bg-purple-100"
      >
        QR Code
      </button>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 text-center">
            <h3 className="text-lg font-semibold text-slate-900 mb-1">
              QR Code
            </h3>
            <p className="text-sm text-slate-500 mb-5">
              Visitors scan this to sign in from their phone
            </p>

            <div ref={qrRef} className="flex justify-center mb-4">
              <QRCodeSVG
                value={registrationUrl}
                size={220}
                level="M"
                includeMargin
              />
            </div>

            <p className="text-xs text-slate-400 mb-1">{eventName}</p>
            {propertyAddress && (
              <p className="text-xs text-slate-300 mb-4">{propertyAddress}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleDownload}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700"
              >
                Download PNG
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(registrationUrl);
                }}
                className="flex-1 px-4 py-2.5 border border-slate-300 text-sm font-medium text-slate-700 rounded-xl hover:bg-slate-50"
              >
                Copy Link
              </button>
            </div>

            <button
              onClick={() => setShowModal(false)}
              className="mt-3 text-sm text-slate-400 hover:text-slate-600"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
