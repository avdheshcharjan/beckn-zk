package callback

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/avdhesh/beckn-zk/services/bpp/internal/beckn"
)

// Client posts async on_search callbacks to a beckn-onix BPP caller endpoint.
type Client struct {
	baseURL    string
	httpClient *http.Client
}

// NewClient creates a callback client. baseURL is the onix BPP caller
// endpoint, e.g. "http://onix-bpp-alpha:8082/bpp/caller".
func NewClient(baseURL string) *Client {
	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// PostOnSearch sends an on_search response back through beckn-onix.
func (c *Client) PostOnSearch(resp beckn.OnSearchResponse) error {
	body, err := json.Marshal(resp)
	if err != nil {
		return fmt.Errorf("callback marshal: %w", err)
	}

	url := c.baseURL + "/on_search"
	httpResp, err := c.httpClient.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("callback POST %s: %w", url, err)
	}
	defer httpResp.Body.Close()

	if httpResp.StatusCode >= 300 {
		return fmt.Errorf("callback POST %s returned %d", url, httpResp.StatusCode)
	}

	log.Printf("callback on_search → %s: %d", url, httpResp.StatusCode)
	return nil
}
