"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getBestPhoto, type PropertyPhoto } from "@/lib/property-media";
import { PhotoSlideshow } from "@/components/PhotoSlideshow";

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
    media_display?: "auto" | "video" | "slideshow" | "photo";
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

type KioskScreen = "loading" | "error" | "welcome" | "signin" | "thankyou" | "pin-exit";

export default function KioskPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const [eventId, setEventId] = useState<string>("");
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [screen, setScreen] = useState<KioskScreen>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  // Sign-in form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // PIN exit
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinVerifying, setPinVerifying] = useState(false);

  // Thank you timer
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [countdown, setCountdown] = useState(30);

  // Resolve params
  useEffect(() => {
    params.then((p) => setEventId(p.eventId));
  }, [params]);

  // Fetch event info
  const fetchEvent = useCallback(async () => {
    if (!eventId) return;
    try {
      const res = await fetch(`/api/kiosk/${eventId}`);
      if (!res.ok) {
        const data = await res.json();
        setErrorMessage(data.error || "Event not found");
        setScreen("error");
        return;
      }
      const data = await res.json();
      setEvent(data.event);
      setScreen("welcome");
    } catch {
      setErrorMessage("Unable to connect. Please check your internet.");
      setScreen("error");
    }
  }, [eventId]);

  useEffect(() => {
    fetchEvent();
  }, [fetchEvent]);

  // Prevent navigation away from kiosk
  useEffect(() => {
    const handlePopState = () => {
      window.history.pushState(null, "", window.location.href);
    };
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const resetForm = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setAnswers({});
    setFormError("");
  };

  const startThankYouTimer = useCallback(() => {
    setCountdown(30);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          resetForm();
          setScreen("welcome");
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    timerRef.current = interval;
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError("");

    try {
      const res = await fetch(`/api/kiosk/${eventId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          answers: Object.keys(answers).length > 0 ? answers : undefined,
          source: "kiosk",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setFormError(data.error || "Something went wrong. Please try again.");
        return;
      }

      setScreen("thankyou");
      startThankYouTimer();
    } catch {
      setFormError("Unable to connect. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePinSubmit = async (pinOverride?: string) => {
    const pinToCheck = pinOverride || pin;
    if (pinToCheck.length !== 4) return;
    setPinVerifying(true);
    setPinError("");

    try {
      const res = await fetch(`/api/kiosk/${eventId}/verify-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinToCheck }),
      });
      const data = await res.json();

      if (data.valid) {
        window.location.href = "/";
      } else {
        setPinError("Incorrect PIN");
        setPin("");
      }
    } catch {
      setPinError("Unable to verify PIN");
    } finally {
      setPinVerifying(false);
    }
  };

  const primaryColor = event?.branding?.primary_color || "#2563eb";
  const bestPhoto = getBestPhoto(event?.property?.photos);
  const videoUrl = event?.property?.tour_video_url || null;
  const photos = event?.property?.photos || [];
  const photoUrls = photos.map((p) => p.staged_url || p.url).slice(0, 5);

  // Resolve media display mode
  const mediaDisplayPref = event?.branding?.media_display || "auto";
  const resolvedMedia = (() => {
    if (mediaDisplayPref === "video" && videoUrl) return "video" as const;
    if (mediaDisplayPref === "slideshow" && photoUrls.length >= 2) return "slideshow" as const;
    if (mediaDisplayPref === "photo" && bestPhoto) return "photo" as const;
    // Auto: video > slideshow > photo > gradient
    if (mediaDisplayPref === "auto") {
      if (videoUrl) return "video" as const;
      if (photoUrls.length >= 2) return "slideshow" as const;
      if (bestPhoto) return "photo" as const;
    }
    return "gradient" as const;
  })();

  // --- Screens ---

  if (screen === "loading") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-slate-500">Loading event...</p>
        </div>
      </div>
    );
  }

  if (screen === "error") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-50">
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-slate-900">{errorMessage}</h1>
          <button
            onClick={() => { setScreen("loading"); fetchEvent(); }}
            className="mt-6 px-6 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (screen === "pin-exit") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-8 text-center">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Exit Kiosk</h2>
          <p className="text-sm text-slate-500 mb-6">Enter the 4-digit PIN to exit</p>

          <div className="flex justify-center gap-3 mb-6">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`w-14 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-bold ${
                  pin.length > i
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-200 text-slate-300"
                }`}
              >
                {pin.length > i ? "\u2022" : ""}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3 max-w-[240px] mx-auto mb-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, "del"].map((key, idx) => {
              if (key === null) return <div key={idx} />;
              if (key === "del") {
                return (
                  <button
                    key={idx}
                    onClick={() => setPin((prev) => prev.slice(0, -1))}
                    className="h-14 rounded-xl bg-slate-100 text-slate-600 font-medium hover:bg-slate-200 flex items-center justify-center"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414-6.414A2 2 0 0110.828 5H21a1 1 0 011 1v12a1 1 0 01-1 1H10.828a2 2 0 01-1.414-.586L3 12z" />
                    </svg>
                  </button>
                );
              }
              return (
                <button
                  key={idx}
                  onClick={() => {
                    if (pin.length < 4) {
                      const newPin = pin + key.toString();
                      setPin(newPin);
                      if (newPin.length === 4) {
                        handlePinSubmit(newPin);
                      }
                    }
                  }}
                  className="h-14 rounded-xl bg-slate-50 text-slate-900 text-xl font-medium hover:bg-slate-100 active:bg-slate-200"
                >
                  {key}
                </button>
              );
            })}
          </div>

          {pinError && <p className="text-sm text-red-600 mb-4">{pinError}</p>}

          <div className="flex gap-3">
            <button
              onClick={() => { setPin(""); setPinError(""); setScreen("welcome"); }}
              className="flex-1 px-4 py-3 border border-slate-300 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={() => handlePinSubmit()}
              disabled={pin.length !== 4 || pinVerifying}
              className="flex-1 px-4 py-3 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50"
            >
              {pinVerifying ? "Verifying..." : "Exit"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "thankyou") {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center overflow-hidden">
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

        <div className="relative text-center text-white px-8 max-w-lg z-10">
          {event?.branding?.agent_photo && (
            <img
              src={event.branding.agent_photo}
              alt=""
              className="w-24 h-24 rounded-full object-cover mx-auto mb-6 border-4 border-white/30"
            />
          )}
          <svg className="w-16 h-16 mx-auto mb-6 opacity-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h1 className="text-3xl font-bold mb-3">
            {event?.thank_you_message || "Thank you for signing in!"}
          </h1>
          <p className="text-lg opacity-80">
            We appreciate you visiting today.
          </p>
          <p className="mt-8 text-sm opacity-60">
            Returning to welcome screen in {countdown}s
          </p>
          <button
            onClick={() => {
              if (timerRef.current) clearInterval(timerRef.current);
              resetForm();
              setScreen("welcome");
            }}
            className="mt-4 px-6 py-3 bg-white/20 hover:bg-white/30 text-white rounded-xl text-sm font-medium backdrop-blur"
          >
            Sign In Another Visitor
          </button>
        </div>
      </div>
    );
  }

  // Welcome + Sign-in screens
  return (
    <div className="fixed inset-0 flex flex-col bg-slate-50">
      {screen === "welcome" ? (
        // --- Welcome Screen: Split-screen layout ---
        <div className="flex-1 flex flex-col md:flex-row">
          {/* LEFT: Property media */}
          <div className="relative h-[40vh] md:h-auto md:w-1/2 overflow-hidden">
            {resolvedMedia === "video" ? (
              <video
                src={videoUrl!}
                autoPlay
                loop
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : resolvedMedia === "slideshow" ? (
              <PhotoSlideshow
                photos={photoUrls}
                className="absolute inset-0 w-full h-full"
              />
            ) : resolvedMedia === "photo" ? (
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${bestPhoto})` }}
              />
            ) : (
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)`,
                }}
              />
            )}
            {/* Subtle gradient overlay for edge blending */}
            <div className="absolute inset-0 bg-gradient-to-b md:bg-gradient-to-r from-transparent to-black/10" />
          </div>

          {/* RIGHT: Branded content */}
          <div
            className="flex-1 flex flex-col items-center justify-center px-8 relative"
            style={{ backgroundColor: primaryColor }}
          >
            <div className="text-center text-white max-w-lg">
              {event?.branding?.logo_url && (
                <img
                  src={event.branding.logo_url}
                  alt=""
                  className="h-16 mx-auto mb-8 object-contain"
                />
              )}
              {event?.branding?.agent_photo && (
                <img
                  src={event.branding.agent_photo}
                  alt=""
                  className="w-28 h-28 rounded-full object-cover mx-auto mb-6 border-4 border-white/30"
                />
              )}
              <h1 className="text-4xl font-bold mb-3">
                {event?.welcome_message || "Welcome!"}
              </h1>
              {event?.property && (
                <p className="text-xl opacity-80 mb-2">{event.property.address}</p>
              )}
              {event?.property?.city && (
                <p className="text-lg opacity-60">
                  {[event.property.city, event.property.state]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
              <p className="text-base opacity-70 mt-4 mb-8">
                Please sign in so we can keep you updated
              </p>
              <button
                onClick={() => setScreen("signin")}
                className="px-12 py-4 bg-white text-slate-900 rounded-2xl text-lg font-semibold shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all"
              >
                Sign In
              </button>
            </div>

            {/* PIN exit button */}
            <button
              onClick={() => { setPin(""); setPinError(""); setScreen("pin-exit"); }}
              className="absolute bottom-6 right-6 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
              aria-label="Exit kiosk"
            >
              <svg className="w-5 h-5 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        // --- Sign-in Form: Photo background with floating card ---
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* Background: blurred photo or gradient */}
          {bestPhoto ? (
            <>
              <div
                className="absolute inset-0 bg-cover bg-center scale-110"
                style={{
                  backgroundImage: `url(${bestPhoto})`,
                  filter: "blur(8px)",
                }}
              />
              <div className="absolute inset-0 bg-black/40" />
            </>
          ) : (
            <div className="absolute inset-0" style={{ backgroundColor: primaryColor }} />
          )}

          {/* Header bar */}
          <div className="relative px-6 py-4 flex items-center justify-between z-10">
            <button
              onClick={() => { resetForm(); setScreen("welcome"); }}
              className="text-white/80 hover:text-white flex items-center gap-2 text-sm font-medium"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <h2 className="text-white font-semibold">
              {event?.name || "Sign In"}
            </h2>
            <div className="w-16" />
          </div>

          {/* Floating form card */}
          <div className="relative flex-1 overflow-y-auto z-10 flex items-start justify-center py-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 backdrop-blur-sm">
              <form onSubmit={handleSubmit} className="px-6 py-8 space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      First Name *
                    </label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                      autoComplete="given-name"
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                      placeholder="First name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      autoComplete="family-name"
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                      placeholder="Last name"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    inputMode="email"
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    placeholder="email@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoComplete="tel"
                    inputMode="tel"
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                    placeholder="(555) 123-4567"
                  />
                </div>

                {/* Custom Questions */}
                {event?.custom_questions?.map((q) => (
                  <div key={q.id}>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      {q.question} {q.required && "*"}
                    </label>
                    {q.type === "text" && (
                      <input
                        type="text"
                        value={answers[q.id] || ""}
                        onChange={(e) =>
                          setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                        }
                        required={q.required}
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                      />
                    )}
                    {q.type === "select" && (
                      <select
                        value={answers[q.id] || ""}
                        onChange={(e) =>
                          setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                        }
                        required={q.required}
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 bg-white"
                      >
                        <option value="">Select...</option>
                        {q.options?.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    )}
                    {q.type === "yes_no" && (
                      <div className="flex gap-3">
                        {["Yes", "No"].map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() =>
                              setAnswers((prev) => ({ ...prev, [q.id]: opt }))
                            }
                            className={`flex-1 py-3 rounded-xl text-base font-medium border-2 transition-colors ${
                              answers[q.id] === opt
                                ? "border-blue-500 bg-blue-50 text-blue-700"
                                : "border-slate-200 text-slate-600 hover:border-slate-300"
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
                          const selected = (answers[q.id] || "")
                            .split(",")
                            .filter(Boolean)
                            .includes(opt);
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => {
                                const current = (answers[q.id] || "")
                                  .split(",")
                                  .filter(Boolean);
                                const next = selected
                                  ? current.filter((v) => v !== opt)
                                  : [...current, opt];
                                setAnswers((prev) => ({
                                  ...prev,
                                  [q.id]: next.join(","),
                                }));
                              }}
                              className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition-colors ${
                                selected
                                  ? "border-blue-500 bg-blue-50 text-blue-700"
                                  : "border-slate-200 text-slate-600 hover:border-slate-300"
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

                {formError && (
                  <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">
                    {formError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-4 text-white text-lg font-semibold rounded-2xl shadow-lg hover:shadow-xl disabled:opacity-50 transition-all"
                  style={{ backgroundColor: primaryColor }}
                >
                  {submitting ? "Signing in..." : "Sign In"}
                </button>
              </form>
            </div>
          </div>

          {/* PIN exit button */}
          <button
            onClick={() => { setPin(""); setPinError(""); setScreen("pin-exit"); }}
            className="absolute bottom-6 right-6 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center z-10"
            aria-label="Exit kiosk"
          >
            <svg className="w-5 h-5 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
