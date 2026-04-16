package zk

import (
	_ "embed"
	"log"
)

//go:embed testdata/verification_key.json
var embeddedVKey []byte

func LoadDefaultVerifier() *Verifier {
	v, err := NewVerifier(embeddedVKey)
	if err != nil {
		log.Fatalf("load embedded vkey: %v", err)
	}
	return v
}
