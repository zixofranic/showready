import { z } from "zod";

// ── Property ──

export const propertySchema = z.object({
  address: z.string().min(1, "Address is required").max(500),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(50).optional().nullable(),
  zip: z.string().max(20).optional().nullable(),
  beds: z.coerce.number().int().min(0).max(99).optional().nullable(),
  baths: z.coerce.number().min(0).max(99).optional().nullable(),
  sqft: z.coerce.number().int().min(0).max(999999).optional().nullable(),
  price: z.coerce.number().min(0).max(999999999).optional().nullable(),
  mls_number: z.string().max(50).optional().nullable(),
  listing_url: z.string().url().max(2000).optional().nullable().or(z.literal("")),
  team_id: z.string().uuid().optional().nullable(),
});

export type PropertyInput = z.infer<typeof propertySchema>;

// ── Event ──

const customQuestionSchema = z.object({
  id: z.string(),
  question: z.string().min(1).max(500),
  type: z.enum(["text", "select", "multi_select", "yes_no"]),
  options: z.array(z.string().max(200)).max(10).optional(),
  required: z.boolean(),
});

export const eventSchema = z.object({
  name: z.string().min(1, "Event name is required").max(200),
  event_date: z.string().min(1, "Date is required"),
  start_time: z.string().optional().nullable(),
  end_time: z.string().optional().nullable(),
  property_id: z.string().uuid().optional().nullable(),
  kiosk_pin: z.string().length(4).regex(/^\d{4}$/, "PIN must be 4 digits").optional().nullable(),
  custom_questions: z.array(customQuestionSchema).max(5).optional(),
  welcome_message: z.string().max(500).optional().nullable(),
  thank_you_message: z.string().max(500).optional().nullable(),
  branding: z.object({
    logo_url: z.string().url().optional(),
    primary_color: z.string().max(20).optional(),
    agent_photo: z.string().url().optional(),
    media_display: z.enum(["auto", "video", "slideshow", "photo"]).optional(),
  }).optional(),
  team_id: z.string().uuid().optional().nullable(),
});

export type EventInput = z.infer<typeof eventSchema>;

// ── Visitor ──

export const visitorSchema = z.object({
  first_name: z.string().min(1, "First name is required").max(100),
  last_name: z.string().max(100).optional().nullable(),
  email: z.string().email().max(254).optional().nullable().or(z.literal("")),
  phone: z.string().max(20).optional().nullable(),
  answers: z.record(z.string().max(100), z.string().max(1000)).optional()
    .refine((val) => !val || Object.keys(val).length <= 10, "Too many answers"),
  source: z.enum(["kiosk", "qr", "manual", "import"]).optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export type VisitorInput = z.infer<typeof visitorSchema>;
