"use client";

import { useState, useEffect, useCallback } from "react";
import { getBestPhoto, type PropertyPhoto } from "@/lib/property-media";

interface EventInfo {
  id: string;
  name: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  status: string;
  custom_questions: CustomQuestion[];
  welcome_message: string | null;
  thank_you_message: string | null;
  branding: {
    logo_url?: string;
    primary_color?: string;
    agent_photo?: string;
  };
  property: {
    address: string;
    city: string | null;
    state: string | null;
    photos: PropertyPhoto[];
    tour_video_url: string | null;
  } | null;
}

interface CustomQuestion {
  id: string;
  question: string;
  type: "text" | "select" | "multi_select" | "yes_no";
  options?: string[];
  required: boolean;
}

type Screen = "loading" | "error" | "form" | "success" | "closed";

export default function RegisterPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const [eventId, setEventId] = useState("");
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [screen, setScreen] = useState<Screen>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  // Form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [website, setWebsite] = useState(""); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    params.then((p) => setEventId(p.eventId));
  }, [params]);

  const fetchEvent = useCallback(async () => {
    if (!eventId) return;
    try {
      const res = await fetch(`/api/register/${eventId}`);
      const data = await res.json();

      if (!res.ok) {
        if (data.status === "upcoming") {
          setErrorMessage("This event hasn't started yet. Please check back later.");
          setScreen("closed");
        } else if (data.status === "completed") {
          setErrorMessage("This event has ended. Thank you for your interest.");
          setScreen("closed");
        } else {
          setErrorMessage(data.error || "Event not found");
          setScreen("error");
        }
        return;
      }
      setEvent(data.event);
      setScreen("form");
    } catch {
      setErrorMessage("Unable to connect. Please check your connection.");
      setScreen("error");
    }
  }, [eventId]);

  useEffect(() => {
    fetchEvent();
  }, [fetchEvent]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError("");

    try {
      const res = await fetch(`/api/register/${eventId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          answers: Object.keys(answers).length > 0 ? answers : undefined,
          source: "qr",
          website, // honeypot
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setFormError(data.error || "Something went wrong. Please try again.");
        return;
      }

      setScreen("success");
    } catch {
      setFormError("Unable to connect. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const primaryColor = event?.branding?.primary_color || "#2563eb";
  const bestPhoto = getBestPhoto(event?.property?.photos);

  if (screen === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-6 h-6 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-sm text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (screen === "error" || screen === "closed") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-6">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-slate-700 font-medium">{errorMessage}</p>
          {screen === "error" && (
            <button
              onClick={() => { setScreen("loading"); fetchEvent(); }}
              className="mt-4 text-sm text-blue-600 hover:underline"
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    );
  }

  if (screen === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden">
        {/* Background: photo or gradient */}
        {bestPhoto ? (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${bestPhoto})` }}
            />
            <div className="absolute inset-0 bg-black/50" />
          </>
        ) : (
          <div className="absolute inset-0" style={{ backgroundColor: primaryColor }} />
        )}

        <div className="relative text-center text-white max-w-sm z-10">
          {event?.branding?.agent_photo && (
            <img
              src={event.branding.agent_photo}
              alt=""
              className="w-20 h-20 rounded-full object-cover mx-auto mb-5 border-3 border-white/30"
            />
          )}
          <svg className="w-14 h-14 mx-auto mb-4 opacity-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h1 className="text-2xl font-bold mb-2">
            {event?.thank_you_message || "You're all set!"}
          </h1>
          <p className="opacity-80 text-sm">
            Thank you for registering. We look forward to seeing you!
          </p>
        </div>
      </div>
    );
  }

  // Form screen
  return (
    <div className="min-h-screen bg-white">
      {/* Photo hero header */}
      <div className="relative h-[200px] overflow-hidden">
        {bestPhoto ? (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${bestPhoto})` }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-black/60" />
          </>
        ) : (
          <div className="absolute inset-0" style={{ backgroundColor: primaryColor }} />
        )}

        <div className="relative h-full flex flex-col items-center justify-center px-5 z-10">
          {event?.branding?.agent_photo && (
            <img
              src={event.branding.agent_photo}
              alt=""
              className="w-16 h-16 rounded-full object-cover mb-3 border-3 border-white/30"
            />
          )}
          <h1 className="text-xl font-bold text-white">
            {event?.welcome_message || "Welcome!"}
          </h1>
          {event?.property && (
            <p className="text-white/80 text-sm mt-1">{event.property.address}</p>
          )}
          {event?.property?.city && (
            <p className="text-white/60 text-xs mt-0.5">
              {[event.property.city, event.property.state].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="px-5 py-6 space-y-4 max-w-md mx-auto">
        <p className="text-sm text-slate-500 mb-2">
          Please sign in so we can keep in touch
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              First Name *
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              autoComplete="given-name"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              placeholder="First name"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Last Name
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              placeholder="Last name"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            placeholder="email@example.com"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            inputMode="tel"
            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            placeholder="(555) 123-4567"
          />
        </div>

        {/* Custom Questions */}
        {event?.custom_questions?.map((q) => (
          <div key={q.id}>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              {q.question} {q.required && "*"}
            </label>
            {q.type === "text" && (
              <input
                type="text"
                value={answers[q.id] || ""}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                required={q.required}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
            )}
            {q.type === "select" && (
              <select
                value={answers[q.id] || ""}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                required={q.required}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 bg-white"
              >
                <option value="">Select...</option>
                {q.options?.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            )}
            {q.type === "yes_no" && (
              <div className="flex gap-2">
                {["Yes", "No"].map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-colors ${
                      answers[q.id] === opt
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-slate-200 text-slate-600"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
            {q.type === "multi_select" && (
              <div className="flex flex-wrap gap-2">
                {q.options?.map((opt) => {
                  const selected = (answers[q.id] || "").split(",").filter(Boolean).includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        const current = (answers[q.id] || "").split(",").filter(Boolean);
                        const next = selected ? current.filter((v) => v !== opt) : [...current, opt];
                        setAnswers((prev) => ({ ...prev, [q.id]: next.join(",") }));
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-medium border-2 transition-colors ${
                        selected
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 text-slate-600"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {/* Honeypot field — hidden from real users */}
        <div className="absolute -left-[9999px]" aria-hidden="true">
          <input
            type="text"
            name="website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        {formError && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2.5 rounded-xl">{formError}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 text-white text-base font-semibold rounded-2xl shadow disabled:opacity-50 transition-all"
          style={{ backgroundColor: primaryColor }}
        >
          {submitting ? "Signing in..." : "Sign In"}
        </button>
      </form>

      {/* Footer */}
      <div className="text-center pb-6 pt-2">
        <p className="text-xs text-slate-300">Powered by ShowReady</p>
      </div>
    </div>
  );
}
