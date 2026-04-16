package zk

import (
	"os"
	"testing"
)

func loadTestdata(t *testing.T, name string) []byte {
	t.Helper()
	b, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatalf("read %s: %v", name, err)
	}
	return b
}

func TestVerifierParsesVKey(t *testing.T) {
	vkeyJSON := loadTestdata(t, "verification_key.json")
	v, err := NewVerifier(vkeyJSON)
	if err != nil {
		t.Fatalf("new verifier: %v", err)
	}
	if v == nil {
		t.Fatal("verifier is nil")
	}
}

func TestVerifierRejectsTamperedProof(t *testing.T) {
	proofJSON := loadTestdata(t, "sample_proof.json")
	publicJSON := loadTestdata(t, "sample_public.json")
	vkeyJSON := loadTestdata(t, "verification_key.json")

	// Bitflip a byte in the middle of the proof to corrupt it.
	tampered := make([]byte, len(proofJSON))
	copy(tampered, proofJSON)
	tampered[len(tampered)/2] ^= 0x01

	v, err := NewVerifier(vkeyJSON)
	if err != nil {
		t.Fatalf("new verifier: %v", err)
	}
	ok, _ := v.Verify(tampered, publicJSON)
	if ok {
		t.Errorf("tampered proof must not verify")
	}
}

func TestVerifierRejectsMismatchedPublicInputs(t *testing.T) {
	proofJSON := loadTestdata(t, "sample_proof.json")
	vkeyJSON := loadTestdata(t, "verification_key.json")

	wrongPublic := []byte(`["1","2","3","4","5","6","7","8","9"]`)

	v, err := NewVerifier(vkeyJSON)
	if err != nil {
		t.Fatalf("new verifier: %v", err)
	}
	ok, _ := v.Verify(proofJSON, wrongPublic)
	if ok {
		t.Errorf("wrong public inputs must not verify")
	}
}
