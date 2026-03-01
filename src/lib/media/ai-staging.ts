/**
 * Virtual Staging Client (Decor8 AI)
 *
 * Direct Decor8 API integration for ShowReady.
 * Calls Decor8 API directly (not through AiStaging — cross-project auth not feasible).
 * Room type + style mappings ported from AiStaging's decor8.ts.
 *
 * API docs: https://api-docs.decor8.ai/
 * Cost: $0.20 per image
 */

const DECOR8_API = "https://api.decor8.ai";

// =============================================================================
// Room types — Decor8's 30 official types
// =============================================================================

export const ROOM_TYPES = [
  "livingroom", "kitchen", "diningroom", "bedroom", "bathroom",
  "kidsroom", "familyroom", "readingnook", "sunroom", "walkincloset",
  "mudroom", "toyroom", "office", "foyer", "powderroom",
  "laundryroom", "gym", "basement", "garage", "balcony",
  "cafe", "homebar", "study_room", "front_porch", "back_porch",
  "back_patio", "openplan", "boardroom", "meetingroom", "openworkspace",
] as const;

export const ROOM_TYPE_LABELS: Record<string, string> = {
  livingroom: "Living Room",
  kitchen: "Kitchen",
  diningroom: "Dining Room",
  bedroom: "Bedroom",
  bathroom: "Bathroom",
  kidsroom: "Kids Room",
  familyroom: "Family Room",
  readingnook: "Reading Nook",
  sunroom: "Sunroom",
  walkincloset: "Walk-in Closet",
  mudroom: "Mudroom",
  toyroom: "Playroom",
  office: "Home Office",
  foyer: "Foyer/Entryway",
  powderroom: "Powder Room",
  laundryroom: "Laundry Room",
  gym: "Home Gym",
  basement: "Basement",
  garage: "Garage",
  balcony: "Balcony",
  cafe: "Cafe",
  homebar: "Home Bar",
  study_room: "Study",
  front_porch: "Front Porch",
  back_porch: "Back Porch",
  back_patio: "Patio",
  openplan: "Open Plan",
  boardroom: "Boardroom",
  meetingroom: "Meeting Room",
  openworkspace: "Open Workspace",
};

// Map our app room types (from MLS parser) to Decor8 room types
const APP_TO_DECOR8_ROOM: Record<string, string> = {
  living_room: "livingroom",
  kitchen: "kitchen",
  dining_room: "diningroom",
  bedroom: "bedroom",
  bathroom: "bathroom",
  office: "office",
  foyer: "foyer",
  hallway: "foyer",
  basement: "basement",
  garage: "garage",
  patio: "back_patio",
  sunroom: "sunroom",
  nursery: "kidsroom",
  laundry_room: "laundryroom",
  closet: "walkincloset",
  exterior: "front_porch",
};

/** Map our app room type to Decor8's format. */
export function toDecor8RoomType(appRoomType: string): string {
  return APP_TO_DECOR8_ROOM[appRoomType] || appRoomType.toLowerCase().replace(/[\s_]+/g, "");
}

// =============================================================================
// Design styles — Decor8's 50 official styles
// =============================================================================

export const DESIGN_STYLES = [
  "minimalist", "scandinavian", "industrial", "boho", "traditional",
  "artdeco", "midcenturymodern", "coastal", "tropical", "eclectic",
  "contemporary", "frenchcountry", "rustic", "shabbychic", "vintage",
  "country", "modern", "asian_zen", "hollywoodregency", "bauhaus",
  "mediterranean", "farmhouse", "victorian", "gothic", "moroccan",
  "southwestern", "transitional", "maximalist", "arabic", "japandi",
  "retrofuturism", "artnouveau", "urbanmodern", "wabi_sabi", "grandmillennial",
  "coastalgrandmother", "newtraditional", "cottagecore", "luxemodern", "high_tech",
  "organicmodern", "tuscan", "cabin", "desertmodern", "global",
  "industrialchic", "modernfarmhouse", "europeanclassic", "neotraditional", "warmminimalist",
] as const;

export const STYLE_LABELS: Record<string, string> = {
  minimalist: "Minimalist",
  scandinavian: "Scandinavian",
  industrial: "Industrial",
  boho: "Bohemian",
  traditional: "Traditional",
  artdeco: "Art Deco",
  midcenturymodern: "Mid-Century Modern",
  coastal: "Coastal",
  tropical: "Tropical",
  eclectic: "Eclectic",
  contemporary: "Contemporary",
  frenchcountry: "French Country",
  rustic: "Rustic",
  modern: "Modern",
  farmhouse: "Farmhouse",
  transitional: "Transitional",
  japandi: "Japandi",
  cottagecore: "Cottagecore",
  luxemodern: "Luxury Modern",
  warmminimalist: "Warm Minimalist",
  modernfarmhouse: "Modern Farmhouse",
  organicmodern: "Organic Modern",
  europeanclassic: "European Classic",
};

// Curated subset for the UI picker (most popular for real estate)
export const POPULAR_STYLES = [
  "modern", "contemporary", "minimalist", "scandinavian", "transitional",
  "farmhouse", "modernfarmhouse", "coastal", "midcenturymodern", "luxemodern",
  "warmminimalist", "traditional", "industrial",
] as const;

// =============================================================================
// API client
// =============================================================================

export interface StagingResult {
  url: string;
  uuid: string;
}

export interface StagingRequest {
  imageUrl: string;
  roomType: string;
  designStyle: string;
}

/** Call Decor8 API to generate a virtually staged room image. */
export async function generateStagedRoom(
  request: StagingRequest,
): Promise<StagingResult> {
  const apiKey = process.env.DECOR8_API_KEY;
  if (!apiKey) {
    throw new Error("DECOR8_API_KEY not configured");
  }

  const roomType = toDecor8RoomType(request.roomType);

  // Validate style is known — fail explicitly instead of silent fallback
  const validStyles = new Set<string>(DESIGN_STYLES);
  if (!validStyles.has(request.designStyle)) {
    throw new Error(`Invalid design style: "${request.designStyle}". Use one of the supported styles.`);
  }
  const designStyle = request.designStyle;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000); // 60s — AI generation can be slow

  let response: Response;
  try {
    response = await fetch(`${DECOR8_API}/generate_designs_for_room`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input_image_url: request.imageUrl,
        room_type: roomType,
        design_style: designStyle,
        num_images: 1,
        design_creativity: 0.15, // Low = preserve room architecture
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Decor8 API error: ${response.status} - ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`Decor8 error: ${data.error}`);
  }

  if (!data.info?.images?.length) {
    throw new Error("Decor8 returned no images");
  }

  return {
    url: data.info.images[0].url,
    uuid: data.info.images[0].uuid,
  };
}
