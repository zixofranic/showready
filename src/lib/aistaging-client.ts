/**
 * AiStaging Service API Client
 *
 * Thin HTTP client for AiStaging's v1 Service API.
 * Used by ShowReady to trigger AI media processing on properties.
 *
 * Auth: x-api-key header (CROSS_APP_API_KEY)
 * Env: AI_STAGING_API_URL, CROSS_APP_API_KEY
 */

const LOG_PREFIX = "[AiStaging]";
const REQUEST_TIMEOUT = 30_000; // 30s for most calls
const RENDER_TIMEOUT = 10_000; // 10s for render (returns 202 immediately)

function getConfig() {
  const baseUrl = process.env.AI_STAGING_API_URL;
  const apiKey = process.env.CROSS_APP_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error(
      "AiStaging not configured: AI_STAGING_API_URL and CROSS_APP_API_KEY required",
    );
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

async function callApi<T>(
  path: string,
  body: object,
  timeout = REQUEST_TIMEOUT,
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  const { baseUrl, apiKey } = getConfig();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const data = await res.json();

    if (!res.ok || !data.success) {
      const errMsg = data.error?.message || data.error || `HTTP ${res.status}`;
      console.error(`${LOG_PREFIX} ${path} failed (${res.status}):`, errMsg);
      return { ok: false, error: errMsg, status: res.status };
    }

    return { ok: true, data: data.data || data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`${LOG_PREFIX} ${path} error:`, msg);
    return { ok: false, error: msg, status: 0 };
  }
}

async function callApiGet<T>(
  path: string,
  timeout = REQUEST_TIMEOUT,
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  const { baseUrl, apiKey } = getConfig();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        method: "GET",
        headers: { "x-api-key": apiKey },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const data = await res.json();

    if (!res.ok || !data.success) {
      return { ok: false, error: data.error?.message || `HTTP ${res.status}`, status: res.status };
    }

    return { ok: true, data: data.data || data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: msg, status: 0 };
  }
}

// ─── Types ───────────────────────────────────────────────────────

export interface EnsureProjectResult {
  aistaging_project_id: string;
  created: boolean;
  photos_imported: number;
  photos_failed: number;
}

export interface ProcessResult {
  job_id: string;
  status: "completed" | "processing";
  result_url?: string;
  asset_id?: string;
  processing_time_ms?: number;
  restages_remaining?: number;
}

export interface RenderResult {
  job_id: string;
  status: "rendering";
  estimated_seconds: number;
}

export interface JobStatus {
  job_id: string;
  status: "processing" | "completed" | "failed";
  service: string;
  result_url?: string;
  result_asset_id?: string;
  error_message?: string;
  webhook_delivered?: boolean;
  created_at: string;
}

export type AIServiceType = "staging" | "twilight" | "sky" | "declutter" | "upscale" | "sky_lighting";

export interface ProcessOptions {
  room_type?: string;
  design_style?: string;
  sky_type?: "day" | "dusk" | "night";
  scale?: 2 | 4;
}

export interface SlideInput {
  image_url: string;
  caption?: string;
  duration?: number;
}

// ─── API Functions ───────────────────────────────────────────────

/**
 * Ensure a linked project exists in AiStaging for this property.
 * Creates one if it doesn't exist, returns existing if it does.
 */
export async function ensureProject(
  address: string,
  showreadyPropertyId: string,
  callbackUrl: string,
  agentEmail: string,
  photos?: Array<{ url: string; caption?: string; room_type?: string }>,
) {
  return callApi<EnsureProjectResult>("/api/v1/projects", {
    address,
    showready_property_id: showreadyPropertyId,
    callback_url: callbackUrl,
    agent_email: agentEmail,
    photos: photos || [],
  });
}

/**
 * Trigger AI processing on an image.
 * Billing is handled by ShowReady via SimplerPay — AiStaging skips credit charge.
 */
export async function processImage(
  projectId: string,
  imageId: string,
  service: AIServiceType,
  options?: ProcessOptions,
) {
  return callApi<ProcessResult>("/api/v1/process", {
    project_id: projectId,
    image_id: imageId,
    service,
    options,
  });
}

/**
 * Trigger video rendering via Remotion Lambda.
 * Returns 202 immediately with job_id — result comes via webhook.
 */
export async function renderVideo(
  projectId: string,
  config: {
    agent_name?: string;
    agent_logo_url?: string;
    brokerage_name?: string;
    property_address?: string;
    slides: SlideInput[];
    text_style?: "modern" | "elegant" | "minimal" | "bold" | "luxury";
  },
) {
  return callApi<RenderResult>(
    "/api/v1/render",
    {
      project_id: projectId,
      template: "property-tour",
      config,
    },
    RENDER_TIMEOUT,
  );
}

/**
 * Poll job status (fallback when webhook doesn't arrive).
 */
export async function checkStatus(jobId: string) {
  return callApiGet<JobStatus>(`/api/v1/status/${jobId}`);
}

/**
 * Check AiStaging service health.
 */
export async function checkHealth() {
  return callApiGet<{ status: string; services: Record<string, string> }>(
    "/api/v1/health",
    5_000,
  );
}
