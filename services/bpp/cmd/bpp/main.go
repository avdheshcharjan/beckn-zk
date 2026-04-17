package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/avdhesh/beckn-zk/services/bpp/internal/callback"
	"github.com/avdhesh/beckn-zk/services/bpp/internal/handlers"
)

type Health struct {
	OK          bool   `json:"ok"`
	Personality string `json:"personality"`
	Version     string `json:"version"`
	Time        string `json:"time"`
}

func main() {
	personality := os.Getenv("BPP_PERSONALITY")
	if personality == "" {
		personality = "lab-alpha"
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	var cb *callback.Client
	if u := os.Getenv("ONIX_CALLBACK_URL"); u != "" {
		cb = callback.NewClient(u)
		log.Printf("async mode: callbacks → %s", u)
	}
	bppURI := os.Getenv("BPP_URI")

	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.Use(middleware.Logger)

	r.Get("/healthz", func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(Health{
			OK:          true,
			Personality: personality,
			Version:     "0.3.0-onix",
			Time:        time.Now().UTC().Format(time.RFC3339),
		}); err != nil {
			panic(err)
		}
	})

	r.Method(http.MethodPost, "/search", handlers.NewSearchHandler(personality, cb, bppURI))

	addr := fmt.Sprintf(":%s", port)
	log.Printf("bpp %s listening on %s", personality, addr)
	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatal(err)
	}
}
