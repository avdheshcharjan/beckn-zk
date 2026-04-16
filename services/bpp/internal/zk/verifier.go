// Package zk verifies Groth16 proofs produced by snarkjs/Circom circuits
// (anon-aadhaar v2). Parsing snarkjs JSON into gnark's native BN254 types
// is delegated to github.com/vocdoni/circom2gnark, which handles the
// coordinate-ordering details correctly.
package zk

import (
	"errors"
	"fmt"

	"github.com/vocdoni/circom2gnark/parser"
)

// Verifier holds a parsed snarkjs verification key. It is safe for concurrent
// use: Verify does not mutate state.
type Verifier struct {
	vkey *parser.CircomVerificationKey
}

func NewVerifier(vkeyJSON []byte) (*Verifier, error) {
	vk, err := parser.UnmarshalCircomVerificationKeyJSON(vkeyJSON)
	if err != nil {
		return nil, fmt.Errorf("parse snarkjs vkey: %w", err)
	}
	return &Verifier{vkey: vk}, nil
}

// Verify accepts snarkjs-format proof JSON and public-signals JSON, and
// returns (true, nil) iff the proof is valid against the loaded vkey.
// Any parse failure is returned as (false, err).
func (v *Verifier) Verify(proofJSON, publicJSON []byte) (bool, error) {
	if v == nil || v.vkey == nil {
		return false, errors.New("verifier not initialized")
	}
	proof, err := parser.UnmarshalCircomProofJSON(proofJSON)
	if err != nil {
		return false, fmt.Errorf("parse snarkjs proof: %w", err)
	}
	pub, err := parser.UnmarshalCircomPublicSignalsJSON(publicJSON)
	if err != nil {
		return false, fmt.Errorf("parse public signals: %w", err)
	}
	gnarkProof, err := parser.ConvertCircomToGnark(proof, v.vkey, pub)
	if err != nil {
		return false, fmt.Errorf("convert to gnark: %w", err)
	}
	return parser.VerifyProof(gnarkProof)
}
