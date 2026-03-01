/**
 * MLS Data Parser
 *
 * Ported from AiStaging's flexmls-scraper.ts — data mapping functions only.
 * No Puppeteer/Chromium. ShowReady calls the Railway API for scraping,
 * then uses these functions to map raw fields to our property schema.
 */

// =============================================================================
// Types
// =============================================================================

export interface MLSPhoto {
  url: string;
  caption: string;
  width: number;
  height: number;
  room_type: string | null;
}

export interface ParsedPropertyInfo {
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  mls_number: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  price: number | null;
  year_built: number | null;
  property_type: string | null;
  description: string | null;
}

export interface MLSParseResult {
  property: ParsedPropertyInfo;
  photos: MLSPhoto[];
  source: "railway" | "slug_only";
}

// =============================================================================
// Room type mapping — MLS captions to app room types
// =============================================================================

const CAPTION_TO_ROOM_TYPE: Record<string, string> = {
  kitchen: "kitchen",
  "living room": "living_room",
  "living area": "living_room",
  "family room": "living_room",
  "great room": "living_room",
  den: "living_room",
  bedroom: "bedroom",
  "master bedroom": "bedroom",
  "primary bedroom": "bedroom",
  master: "bedroom",
  bathroom: "bathroom",
  "master bathroom": "bathroom",
  "primary bathroom": "bathroom",
  bath: "bathroom",
  "dining room": "dining_room",
  "dining area": "dining_room",
  dining: "dining_room",
  office: "office",
  study: "office",
  "home office": "office",
  laundry: "laundry_room",
  "laundry room": "laundry_room",
  garage: "garage",
  basement: "basement",
  "recreation room": "basement",
  "rec room": "basement",
  patio: "patio",
  deck: "patio",
  porch: "patio",
  sunroom: "sunroom",
  "sun room": "sunroom",
  nursery: "nursery",
  "kid's room": "nursery",
  "kids room": "nursery",
  "front of structure": "exterior",
  front: "exterior",
  exterior: "exterior",
  rear: "exterior",
  "back of structure": "exterior",
  pool: "exterior",
  yard: "exterior",
  entrance: "foyer",
  entry: "foyer",
  foyer: "foyer",
  hallway: "hallway",
  hall: "hallway",
  closet: "closet",
  "walk-in closet": "closet",
};

/** Map an MLS photo caption to an app room type. Returns null if no match. */
export function mapCaptionToRoomType(caption: string): string | null {
  if (!caption) return null;
  const lower = caption.toLowerCase().trim();

  // Exact match
  if (CAPTION_TO_ROOM_TYPE[lower]) return CAPTION_TO_ROOM_TYPE[lower];

  // Partial match — check if caption contains any key
  for (const [key, roomType] of Object.entries(CAPTION_TO_ROOM_TYPE)) {
    if (lower.includes(key)) return roomType;
  }

  return null;
}

// =============================================================================
// URL helpers
// =============================================================================

/** Rewrite a sparkplatform CDN URL to a specific resolution. */
export function resizeSparkUrl(
  url: string,
  width: number,
  height: number,
): string {
  const resized = url.replace(/\/\d+x\d+\//, `/${width}x${height}/`);
  if (resized !== url) return resized;
  if (url.includes("?")) return `${url}&w=${width}&h=${height}`;
  return url;
}

/**
 * Parse address components from a FlexMLS URL slug.
 * Example: "5204-Moccasin-Trail-Louisville-KY-40207"
 */
export function parseAddressFromSlug(slug: string): {
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
} {
  const parts = slug.split("-");
  if (parts.length < 4)
    return { address: null, city: null, state: null, zip: null };

  const stateIdx = parts.findIndex((p) => /^[A-Z]{2}$/.test(p));
  if (stateIdx < 2)
    return { address: null, city: null, state: null, zip: null };

  const streetParts = parts.slice(0, stateIdx - 1);
  const cityParts = [parts[stateIdx - 1]];
  const state = parts[stateIdx];
  const zip = parts[stateIdx + 1] || null;

  return {
    address: streetParts.join(" "),
    city: cityParts.join(" "),
    state,
    zip,
  };
}

// =============================================================================
// Known MLS domains — for URL validation (SSRF prevention)
// =============================================================================

const ALLOWED_MLS_HOSTS = [
  "flexmls.com",
  "www.flexmls.com",
  "link.flexmls.com",
  "sparkplatform.com",
  "www.sparkplatform.com",
  "matrix.ntreis.net",
  "matrix.irmls.com",
  "paragon.firstmls.com",
];

/** Validate that a URL is a known MLS share link. */
export function isValidMLSUrl(url: string): {
  valid: boolean;
  error?: string;
} {
  try {
    const parsed = new URL(url);

    if (parsed.protocol !== "https:") {
      return { valid: false, error: "Only HTTPS URLs are allowed" };
    }

    const host = parsed.hostname.toLowerCase();
    const isAllowed = ALLOWED_MLS_HOSTS.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`),
    );

    if (!isAllowed) {
      return {
        valid: false,
        error: `Host "${host}" is not a recognized MLS domain`,
      };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}

// =============================================================================
// Field mapping — raw MLS fields to our property schema
// =============================================================================

/** Strip HTML tags and cap length for scraped text fields. */
function sanitizeText(text: string | null, maxLength = 2000): string | null {
  if (!text) return null;
  return text.replace(/<[^>]*>/g, "").trim().slice(0, maxLength);
}

/** Map raw MLS fields (from Railway API) to our ParsedPropertyInfo. */
export function mapRawFieldsToPropertyInfo(
  raw: Record<string, string>,
): ParsedPropertyInfo {
  const get = (...keys: string[]): string | null => {
    for (const k of keys) {
      const val = raw[k];
      if (val && val.trim()) return sanitizeText(val.trim(), 500);
    }
    return null;
  };

  const getNum = (...keys: string[]): number | null => {
    const val = get(...keys);
    if (!val) return null;
    const n = parseFloat(val.replace(/[,$%]/g, ""));
    return isNaN(n) ? null : n;
  };

  // Address
  const streetNumber =
    get("StreetNumber", "_urlAddress")?.match(/^(\d+)/)?.[1] ||
    get("StreetNumber");
  const streetName = get("StreetName");
  const streetSuffix = get("StreetSuffix");
  const streetDir = get("StreetDirPrefix");
  const city = get("City", "_urlCity");
  const state = get("StateOrProvince", "_urlState");
  const zip = get("PostalCode", "_urlZip");

  let fullStreet = "";
  if (streetDir) fullStreet += streetDir + " ";
  if (streetName) fullStreet += streetName;
  if (streetSuffix) fullStreet += " " + streetSuffix;
  fullStreet = fullStreet.trim();

  let address: string | null = null;
  if (streetNumber && fullStreet) {
    address = `${streetNumber} ${fullStreet}`;
  }

  // Baths — convert full+half to decimal
  const bathsTotal = getNum("BathsTotal");
  let baths = bathsTotal;
  if (!baths) {
    const full = getNum("BathroomsFull") || 0;
    const half = getNum("BathroomsHalf") || 0;
    if (full > 0 || half > 0) {
      baths = full + half * 0.5;
    }
  }

  return {
    address,
    city,
    state,
    zip,
    mls_number: get("ListingId", "MlsNumber", "MLS #"),
    beds: getNum("BedsTotal", "BedroomsTotal"),
    baths,
    sqft: getNum("LivingArea", "BuildingAreaTotal", "AboveGradeFinished"),
    price: getNum("ListPrice", "CurrentPrice"),
    year_built: getNum("YearBuilt"),
    property_type: get("PropertySubType", "PropertyType"),
    description: sanitizeText(raw["_description"], 2000),
  };
}

/**
 * Process Railway API response into our format.
 * Resizes photo URLs and maps captions to room types.
 */
export function processRailwayResponse(
  rawFields: Record<string, string>,
  photos: Array<{ url: string; caption: string }>,
  slugParsed: {
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  },
): MLSParseResult {
  // Merge URL-parsed address into raw fields
  const merged = { ...rawFields };
  if (slugParsed.address) merged["_urlAddress"] = slugParsed.address;
  if (slugParsed.city) merged["_urlCity"] = slugParsed.city;
  if (slugParsed.state) merged["_urlState"] = slugParsed.state;
  if (slugParsed.zip) merged["_urlZip"] = slugParsed.zip;

  const property = mapRawFieldsToPropertyInfo(merged);

  const width = 1920;
  const height = 1280;

  const mlsPhotos: MLSPhoto[] = photos.slice(0, 50).map((p) => ({
    url: resizeSparkUrl(p.url, width, height),
    caption: p.caption,
    width,
    height,
    room_type: mapCaptionToRoomType(p.caption),
  }));

  return { property, photos: mlsPhotos, source: "railway" };
}
