"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";

interface IntegrationStatus {
  connected: boolean;
  auth_type?: "oauth" | "api_key";
  email?: string;
}

interface ZapierStatus {
  connected: boolean;
  webhook_url_preview?: string | null;
}

interface IntegrationSettings {
  push_visitors: boolean;
  create_todos: boolean;
  log_timeline: boolean;
}

type AllSettings = Record<string, IntegrationSettings>;

const DEFAULT_SETTINGS: IntegrationSettings = {
  push_visitors: true,
  create_todos: true,
  log_timeline: true,
};

export default function IntegrationsPage() {
  const searchParams = useSearchParams();
  const [cloze, setCloze] = useState<IntegrationStatus>({ connected: false });
  const [fub, setFub] = useState<IntegrationStatus>({ connected: false });
  const [zapier, setZapier] = useState<ZapierStatus>({ connected: false });
  const [settings, setSettings] = useState<AllSettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Cloze API key form
  const [showClozeForm, setShowClozeForm] = useState(false);
  const [apiEmail, setApiEmail] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [testing, setTesting] = useState(false);

  // FUB API key form
  const [showFubForm, setShowFubForm] = useState(false);
  const [fubApiKey, setFubApiKey] = useState("");
  const [fubTesting, setFubTesting] = useState(false);

  // Zapier webhook form
  const [showZapierForm, setShowZapierForm] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [zapierTesting, setZapierTesting] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const [clozeRes, fubRes, zapierRes, settingsRes] = await Promise.all([
        fetch("/api/integrations/cloze"),
        fetch("/api/integrations/fub"),
        fetch("/api/integrations/zapier"),
        fetch("/api/integrations/settings"),
      ]);
      if (clozeRes.ok) setCloze(await clozeRes.json());
      if (fubRes.ok) setFub(await fubRes.json());
      if (zapierRes.ok) setZapier(await zapierRes.json());
      if (settingsRes.ok) setSettings(await settingsRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Handle OAuth callback params
  useEffect(() => {
    const clozeParam = searchParams.get("cloze");
    if (clozeParam === "connected") {
      setToast("Cloze connected successfully!");
      fetchStatus();
    } else if (clozeParam === "error") {
      const msg = searchParams.get("message") || "Unknown error";
      setToast(`Cloze connection failed: ${msg}`);
    }
  }, [searchParams, fetchStatus]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Cloze handlers ──

  async function handleTestAndSaveCloze() {
    if (!apiEmail || !apiKey) return;
    setTesting(true);

    try {
      const testRes = await fetch("/api/integrations/cloze/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: apiEmail, api_key: apiKey }),
      });
      const testResult = await testRes.json();

      if (!testResult.ok) {
        setToast(`Cloze test failed: ${testResult.error}`);
        return;
      }

      setSaving(true);
      const saveRes = await fetch("/api/integrations/cloze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: apiEmail, api_key: apiKey }),
      });

      if (saveRes.ok) {
        const data = await saveRes.json();
        setCloze(data);
        setShowClozeForm(false);
        setApiEmail("");
        setApiKey("");
        setToast("Cloze connected via API key!");
      } else {
        const err = await saveRes.json();
        setToast(err.error || "Failed to save credentials");
      }
    } finally {
      setTesting(false);
      setSaving(false);
    }
  }

  async function handleDisconnectCloze() {
    if (!confirm("Disconnect Cloze? Visitor sync will stop.")) return;
    const res = await fetch("/api/integrations/cloze", { method: "DELETE" });
    if (res.ok) {
      setCloze({ connected: false });
      setToast("Cloze disconnected");
    }
  }

  // ── FUB handlers ──

  async function handleTestAndSaveFub() {
    if (!fubApiKey) return;
    setFubTesting(true);

    try {
      const testRes = await fetch("/api/integrations/fub/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: fubApiKey }),
      });
      const testResult = await testRes.json();

      if (!testResult.ok) {
        setToast(`FUB test failed: ${testResult.error}`);
        return;
      }

      setSaving(true);
      const saveRes = await fetch("/api/integrations/fub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: fubApiKey }),
      });

      if (saveRes.ok) {
        setFub({ connected: true });
        setShowFubForm(false);
        setFubApiKey("");
        setToast("Follow Up Boss connected!");
      } else {
        const err = await saveRes.json();
        setToast(err.error || "Failed to save FUB credentials");
      }
    } finally {
      setFubTesting(false);
      setSaving(false);
    }
  }

  async function handleDisconnectFub() {
    if (!confirm("Disconnect Follow Up Boss? Visitor sync will stop.")) return;
    const res = await fetch("/api/integrations/fub", { method: "DELETE" });
    if (res.ok) {
      setFub({ connected: false });
      setToast("Follow Up Boss disconnected");
    }
  }

  // ── Zapier handlers ──

  async function handleTestAndSaveZapier() {
    if (!webhookUrl) return;
    setZapierTesting(true);

    try {
      const testRes = await fetch("/api/integrations/zapier/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhook_url: webhookUrl }),
      });
      const testResult = await testRes.json();

      if (!testResult.ok) {
        setToast(`Zapier test failed: ${testResult.error}`);
        return;
      }

      setSaving(true);
      const saveRes = await fetch("/api/integrations/zapier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhook_url: webhookUrl }),
      });

      if (saveRes.ok) {
        const data = await saveRes.json();
        setZapier(data);
        setShowZapierForm(false);
        setWebhookUrl("");
        setToast("Zapier webhook connected!");
      } else {
        const err = await saveRes.json();
        setToast(err.error || "Failed to save webhook URL");
      }
    } finally {
      setZapierTesting(false);
      setSaving(false);
    }
  }

  async function handleDisconnectZapier() {
    if (!confirm("Disconnect Zapier? Visitor webhook will stop.")) return;
    const res = await fetch("/api/integrations/zapier", { method: "DELETE" });
    if (res.ok) {
      setZapier({ connected: false });
      setToast("Zapier disconnected");
    }
  }

  // ── Settings toggle handler ──

  async function handleToggle(integration: string, key: keyof IntegrationSettings, value: boolean) {
    // Optimistic update
    setSettings((prev) => ({
      ...prev,
      [integration]: { ...(prev[integration] || DEFAULT_SETTINGS), [key]: value },
    }));

    const res = await fetch("/api/integrations/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ integration, settings: { [key]: value } }),
    });

    if (!res.ok) {
      // Revert on failure
      setSettings((prev) => ({
        ...prev,
        [integration]: { ...(prev[integration] || DEFAULT_SETTINGS), [key]: !value },
      }));
      setToast("Failed to update setting");
    }
  }

  function SettingsToggles({ integration }: { integration: string }) {
    const s = settings[integration] || DEFAULT_SETTINGS;
    const toggles: Array<{ key: keyof IntegrationSettings; label: string; desc: string }> = [
      { key: "push_visitors", label: "Push visitors", desc: "Send visitor data to this CRM" },
      { key: "create_todos", label: "Create follow-ups", desc: "Auto-create follow-up tasks" },
      { key: "log_timeline", label: "Log timeline", desc: "Add visit notes to contact timeline" },
    ];

    return (
      <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
        {toggles.map((t) => (
          <div key={t.key} className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-700">{t.label}</p>
              <p className="text-xs text-slate-400">{t.desc}</p>
            </div>
            <button
              onClick={() => handleToggle(integration, t.key, !s[t.key])}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                s[t.key] ? "bg-blue-600" : "bg-slate-200"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                  s[t.key] ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        ))}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Integrations</h1>
        <p className="text-sm text-slate-500 mt-1">
          Connect your CRM to automatically push open house visitors
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`px-4 py-3 rounded-lg text-sm font-medium ${
            toast.includes("fail") || toast.includes("error")
              ? "bg-red-50 text-red-800 border border-red-200"
              : "bg-green-50 text-green-800 border border-green-200"
          }`}
        >
          {toast}
        </div>
      )}

      {/* ── Cloze Card ── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center text-orange-600 font-bold text-sm">
                C
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Cloze CRM</h3>
                <p className="text-xs text-slate-500">
                  AI-powered relationship management
                </p>
              </div>
            </div>

            {cloze.connected ? (
              <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                Connected
              </span>
            ) : (
              <span className="text-xs text-slate-400">Not connected</span>
            )}
          </div>

          {cloze.connected && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-600">
                  <span className="text-slate-400">Auth:</span>{" "}
                  {cloze.auth_type === "oauth" ? "OAuth" : "API Key"}
                  {cloze.email && (
                    <>
                      {" "}
                      &middot;{" "}
                      <span className="text-slate-400">{cloze.email}</span>
                    </>
                  )}
                </div>
                <button
                  onClick={handleDisconnectCloze}
                  className="text-xs text-red-500 hover:text-red-700 transition-colors"
                >
                  Disconnect
                </button>
              </div>
              <SettingsToggles integration="cloze" />
            </div>
          )}

          {!cloze.connected && (
            <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
              <a
                href="/api/auth/cloze/authorize"
                className="block w-full text-center px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Connect with Cloze (OAuth)
              </a>
              <button
                onClick={() => setShowClozeForm(!showClozeForm)}
                className="block w-full text-center px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
              >
                {showClozeForm ? "Hide API key form" : "Or connect with API key"}
              </button>

              {showClozeForm && (
                <div className="space-y-3 bg-slate-50 rounded-lg p-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Cloze Email
                    </label>
                    <input
                      type="email"
                      value={apiEmail}
                      onChange={(e) => setApiEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      API Key
                    </label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Paste your Cloze API key"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      Find in Cloze &rarr; Settings &rarr; API &rarr; API Key
                    </p>
                  </div>
                  <button
                    onClick={handleTestAndSaveCloze}
                    disabled={!apiEmail || !apiKey || testing || saving}
                    className="w-full px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {testing
                      ? "Testing connection..."
                      : saving
                        ? "Saving..."
                        : "Test & Connect"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── FUB Card ── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-600 font-bold text-sm">
                F
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Follow Up Boss</h3>
                <p className="text-xs text-slate-500">
                  Real estate CRM &middot; Events API
                </p>
              </div>
            </div>

            {fub.connected ? (
              <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                Connected
              </span>
            ) : (
              <span className="text-xs text-slate-400">Not connected</span>
            )}
          </div>

          {fub.connected && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-600">
                  <span className="text-slate-400">Auth:</span> API Key
                </div>
                <button
                  onClick={handleDisconnectFub}
                  className="text-xs text-red-500 hover:text-red-700 transition-colors"
                >
                  Disconnect
                </button>
              </div>
              <SettingsToggles integration="fub" />
            </div>
          )}

          {!fub.connected && (
            <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
              <button
                onClick={() => setShowFubForm(!showFubForm)}
                className="block w-full text-center px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
              >
                {showFubForm ? "Cancel" : "Connect Follow Up Boss"}
              </button>

              {showFubForm && (
                <div className="space-y-3 bg-slate-50 rounded-lg p-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      FUB API Key
                    </label>
                    <input
                      type="password"
                      value={fubApiKey}
                      onChange={(e) => setFubApiKey(e.target.value)}
                      placeholder="Paste your Follow Up Boss API key"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      Find in FUB &rarr; Admin &rarr; API &rarr; Create API Key
                    </p>
                  </div>
                  <button
                    onClick={handleTestAndSaveFub}
                    disabled={!fubApiKey || fubTesting || saving}
                    className="w-full px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {fubTesting
                      ? "Testing connection..."
                      : saving
                        ? "Saving..."
                        : "Test & Connect"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Zapier Card ── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center text-amber-600 font-bold text-sm">
                Z
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">
                  Zapier Webhook
                </h3>
                <p className="text-xs text-slate-500">
                  Push visitors to any app via webhook
                </p>
              </div>
            </div>

            {zapier.connected ? (
              <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                Connected
              </span>
            ) : (
              <span className="text-xs text-slate-400">Not connected</span>
            )}
          </div>

          {zapier.connected && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-600">
                  <span className="text-slate-400">URL:</span>{" "}
                  <span className="font-mono text-xs">
                    {zapier.webhook_url_preview || "Configured"}
                  </span>
                </div>
                <button
                  onClick={handleDisconnectZapier}
                  className="text-xs text-red-500 hover:text-red-700 transition-colors"
                >
                  Disconnect
                </button>
              </div>
              <SettingsToggles integration="zapier" />
            </div>
          )}

          {!zapier.connected && (
            <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
              <button
                onClick={() => setShowZapierForm(!showZapierForm)}
                className="block w-full text-center px-4 py-2.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors"
              >
                {showZapierForm ? "Cancel" : "Connect Zapier Webhook"}
              </button>

              {showZapierForm && (
                <div className="space-y-3 bg-slate-50 rounded-lg p-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Webhook URL
                    </label>
                    <input
                      type="url"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://hooks.zapier.com/hooks/catch/..."
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      Create a Zap with &quot;Webhooks by Zapier&quot; trigger,
                      then paste the webhook URL here
                    </p>
                  </div>
                  <button
                    onClick={handleTestAndSaveZapier}
                    disabled={!webhookUrl || zapierTesting || saving}
                    className="w-full px-4 py-2 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {zapierTesting
                      ? "Sending test payload..."
                      : saving
                        ? "Saving..."
                        : "Test & Connect"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
