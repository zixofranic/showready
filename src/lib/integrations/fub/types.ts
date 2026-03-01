// Follow Up Boss API types

export interface FUBEvent {
  source: string;
  type: string;
  person: FUBPerson;
  property?: FUBProperty;
  description?: string;
  message?: string;
}

export interface FUBPerson {
  firstName: string;
  lastName?: string;
  emails?: Array<{ value: string }>;
  phones?: Array<{ value: string }>;
  tags?: string[];
}

export interface FUBProperty {
  street?: string;
  city?: string;
  state?: string;
  price?: number;
  mlsNumber?: string;
  bedrooms?: number;
  bathrooms?: number;
  url?: string;
}

export interface FUBStoredCredentials {
  auth_type: "api_key";
  api_key: string;
}

export const FUB_CONFIG = {
  apiBaseUrl: "https://api.followupboss.com/v1",
} as const;
