package beckn

type Descriptor struct {
	Name      string     `json:"name,omitempty"`
	Code      string     `json:"code,omitempty"`
	ShortDesc string     `json:"short_desc,omitempty"`
	LongDesc  string     `json:"long_desc,omitempty"`
	Images    []ImageRef `json:"images,omitempty"`
}

type ImageRef struct {
	URL string `json:"url"`
}

type Tag struct {
	Descriptor Descriptor `json:"descriptor"`
	Value      string     `json:"value"`
	Display    *bool      `json:"display,omitempty"`
}

type TagGroup struct {
	Descriptor Descriptor `json:"descriptor"`
	List       []Tag      `json:"list"`
	Display    *bool      `json:"display,omitempty"`
}

type Country struct {
	Code string `json:"code"`
}

type City struct {
	Code string `json:"code"`
}

type Circle struct {
	GPS    string `json:"gps"`
	Radius Radius `json:"radius"`
}

type Radius struct {
	Type  string `json:"type"`
	Value string `json:"value"`
	Unit  string `json:"unit"`
}

type Location struct {
	ID       string   `json:"id,omitempty"`
	GPS      string   `json:"gps,omitempty"`
	AreaCode string   `json:"area_code,omitempty"`
	Country  *Country `json:"country,omitempty"`
	City     *City    `json:"city,omitempty"`
	Circle   *Circle  `json:"circle,omitempty"`
}

type Price struct {
	Value    string `json:"value"`
	Currency string `json:"currency"`
}

type Item struct {
	ID             string     `json:"id"`
	Descriptor     Descriptor `json:"descriptor"`
	Price          Price      `json:"price"`
	CategoryIDs    []string   `json:"category_ids,omitempty"`
	FulfillmentIDs []string   `json:"fulfillment_ids,omitempty"`
	Tags           []TagGroup `json:"tags,omitempty"`
}

type Category struct {
	ID         string     `json:"id"`
	Descriptor Descriptor `json:"descriptor"`
}

type Fulfillment struct {
	ID   string `json:"id"`
	Type string `json:"type"`
}

type Provider struct {
	ID           string        `json:"id"`
	Descriptor   Descriptor    `json:"descriptor"`
	Locations    []Location    `json:"locations,omitempty"`
	Categories   []Category    `json:"categories,omitempty"`
	Fulfillments []Fulfillment `json:"fulfillments,omitempty"`
	Items        []Item        `json:"items"`
	Tags         []TagGroup    `json:"tags,omitempty"`
}

type Catalog struct {
	Descriptor Descriptor `json:"descriptor"`
	Providers  []Provider `json:"providers"`
}

type IntentCategory struct {
	Descriptor Descriptor `json:"descriptor"`
}

type IntentItem struct {
	Descriptor Descriptor `json:"descriptor"`
}

type IntentProvider struct {
	ID string `json:"id"`
}

type Intent struct {
	Category *IntentCategory `json:"category,omitempty"`
	Item     *IntentItem     `json:"item,omitempty"`
	Provider *IntentProvider `json:"provider,omitempty"`
	Location *Location       `json:"location,omitempty"`
	Tags     []TagGroup      `json:"tags,omitempty"`
}

type Context struct {
	Domain        string `json:"domain"`
	Action        string `json:"action"`
	Location      LocCC  `json:"location"`
	Version       string `json:"version"`
	BapID         string `json:"bap_id"`
	BapURI        string `json:"bap_uri"`
	BppID         string `json:"bpp_id,omitempty"`
	BppURI        string `json:"bpp_uri,omitempty"`
	TransactionID string `json:"transaction_id"`
	MessageID     string `json:"message_id"`
	Timestamp     string `json:"timestamp"`
	TTL           string `json:"ttl,omitempty"`
}

type LocCC struct {
	Country Country `json:"country"`
	City    City    `json:"city"`
}

type BecknError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type SearchMessage struct {
	Intent Intent `json:"intent"`
}

type SearchRequest struct {
	Context Context       `json:"context"`
	Message SearchMessage `json:"message"`
}

type OnSearchMessage struct {
	Catalog Catalog `json:"catalog"`
}

type OnSearchResponse struct {
	Context Context         `json:"context"`
	Message OnSearchMessage `json:"message"`
	Error   *BecknError     `json:"error,omitempty"`
}
