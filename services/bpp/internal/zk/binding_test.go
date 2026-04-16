package zk

import "testing"

func TestComputeBindingMatchesSpec(t *testing.T) {
	const expected = "75accfd6ed728897e0f69b08c0bf39ce1656186c463d8d8237826f2e59524efc"
	got := ComputeBinding("tx-1", "2026-04-15T00:00:00Z")
	if got != expected {
		t.Errorf("binding = %s, want %s", got, expected)
	}
}

func TestVerifyBindingOK(t *testing.T) {
	b := ComputeBinding("tx-1", "2026-04-15T00:00:00Z")
	if err := VerifyBinding(b, "tx-1", "2026-04-15T00:00:00Z"); err != nil {
		t.Errorf("VerifyBinding: %v", err)
	}
}

func TestVerifyBindingMismatch(t *testing.T) {
	b := ComputeBinding("tx-1", "2026-04-15T00:00:00Z")
	if err := VerifyBinding(b, "tx-2", "2026-04-15T00:00:00Z"); err == nil {
		t.Errorf("expected mismatch error")
	}
}
