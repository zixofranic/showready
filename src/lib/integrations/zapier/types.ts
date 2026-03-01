// Zapier webhook types

export interface ZapierWebhookPayload {
  event_name: string;
  event_date: string;
  visitor_first_name: string;
  visitor_last_name: string | null;
  visitor_email: string | null;
  visitor_phone: string | null;
  visitor_source: string;
  visitor_answers: Record<string, string>;
  property_address: string | null;
  property_city: string | null;
  property_state: string | null;
  property_price: number | null;
  property_beds: number | null;
  property_baths: number | null;
  agent_email: string;
  timestamp: string;
}

export interface ZapierStoredCredentials {
  auth_type: "api_key";
  webhook_url: string;
}
