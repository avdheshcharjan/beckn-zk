// Beckn 1.1.1 — DHP diagnostics subset
// Spec: https://github.com/beckn/protocol-specifications

export interface Descriptor {
  name?: string;
  code?: string;
  short_desc?: string;
  long_desc?: string;
  images?: { url: string }[];
}

export interface Tag {
  descriptor: Descriptor;
  value: string;
  display?: boolean;
}

export interface TagGroup {
  descriptor: Descriptor;
  list: Tag[];
  display?: boolean;
}

export interface Country {
  code: string;
}

export interface City {
  code: string;
}

export interface Location {
  id?: string;
  gps?: string;
  area_code?: string;
  country?: Country;
  city?: City;
  circle?: {
    gps: string;
    radius: { type: string; value: string; unit: string };
  };
}

export interface Price {
  value: string;
  currency: string;
}

export interface Item {
  id: string;
  descriptor: Descriptor;
  price: Price;
  category_ids?: string[];
  fulfillment_ids?: string[];
  tags?: TagGroup[];
}

export interface Category {
  id: string;
  descriptor: Descriptor;
}

export interface Fulfillment {
  id: string;
  type: string;
}

export interface Provider {
  id: string;
  descriptor: Descriptor;
  locations?: Location[];
  categories?: Category[];
  fulfillments?: Fulfillment[];
  items: Item[];
  tags?: TagGroup[];
}

export interface Catalog {
  descriptor: Descriptor;
  providers: Provider[];
}

export interface Intent {
  category?: { descriptor: Descriptor };
  item?: { descriptor: Descriptor };
  provider?: { id: string };
  location?: Location;
  tags?: TagGroup[];
}

export interface Context {
  domain: string;
  action: "search" | "on_search" | "select" | "on_select" | "init" | "on_init" | "confirm" | "on_confirm";
  location: { country: Country; city: City };
  version: string;
  bap_id: string;
  bap_uri: string;
  bpp_id?: string;
  bpp_uri?: string;
  transaction_id: string;
  message_id: string;
  timestamp: string;
  ttl?: string;
}

export interface BecknError {
  code: string;
  message: string;
}

export interface SearchRequest {
  context: Context;
  message: { intent: Intent };
}

export interface OnSearchResponse {
  context: Context;
  message: { catalog: Catalog };
  error?: BecknError;
}
