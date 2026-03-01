// Core database types matching Supabase schema

export interface Property {
  id: string;
  user_id: string;
  team_id: string | null;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  price: number | null;
  mls_number: string | null;
  photos: PropertyPhoto[];
  tour_video_url: string | null;
  listing_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface PropertyPhoto {
  url: string;
  caption?: string;
  room_type?: string;
  is_staged?: boolean;
  staged_url?: string;
}

export interface PropertyMedia {
  id: string;
  property_id: string;
  type: "original" | "staged" | "twilight" | "sky" | "declutter" | "upscale" | "video";
  url: string;
  room_type: string | null;
  ai_service: string | null;
  cost_cents: number;
  created_at: string;
}

export interface Event {
  id: string;
  user_id: string;
  team_id: string | null;
  property_id: string | null;
  name: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  status: "upcoming" | "live" | "completed";
  kiosk_pin_hash: string | null;
  qr_code_url: string | null;
  custom_questions: CustomQuestion[];
  welcome_message: string | null;
  thank_you_message: string | null;
  branding: EventBranding;
  visitor_count: number;
  created_at: string;
  updated_at: string;
  // Joined
  property?: Property;
}

export interface CustomQuestion {
  id: string;
  question: string;
  type: "text" | "select" | "multi_select" | "yes_no";
  options?: string[];
  required: boolean;
}

export interface EventBranding {
  logo_url?: string;
  primary_color?: string;
  agent_photo?: string;
}

export interface Visitor {
  id: string;
  event_id: string;
  user_id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  answers: Record<string, string>;
  source: "kiosk" | "qr" | "manual" | "import";
  contacted: boolean;
  priority: boolean;
  notes: string | null;
  crm_sync_status: Record<string, string>;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  logo_url: string | null;
  branding: Record<string, string>;
  owner_id: string;
  created_at: string;
}
