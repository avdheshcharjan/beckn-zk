package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/avdhesh/beckn-zk/services/ledger/internal/handlers"
	"github.com/avdhesh/beckn-zk/services/ledger/internal/store"
)

// acceptAllVerifier is the stub we use for the demo — real verification would
// import the same zk package as the BPP, but cross-module ZK is a day-2 job.
type acceptAllVerifier struct{}

func (acceptAllVerifier) Verify(proofB64 string, publicInputs string) (bool, error) {
	if proofB64 == "" {
		return false, nil
	}
	return true, nil
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8090"
	}

	mem := store.NewMemory()
	mem.SetBalance("patient-a", 10000)
	mem.SetBalance("patient-b", 500)

	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.Use(middleware.Logger)

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "service": "ledger"})
	})
	r.Get("/snapshot", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(mem.Snapshot())
	})
	r.Method(http.MethodPost, "/settle", handlers.NewSettleHandler(mem, acceptAllVerifier{}))

	log.Printf("ledger listening on :%s", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatal(err)
	}
}
