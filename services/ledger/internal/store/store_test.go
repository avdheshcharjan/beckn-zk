package store

import "testing"

func TestDebitHappyPath(t *testing.T) {
	s := NewMemory()
	s.SetBalance("patient-a", 10000)
	if err := s.Debit("patient-a", 3000); err != nil {
		t.Fatal(err)
	}
	if s.Balance("patient-a") != 7000 {
		t.Errorf("expected 7000, got %d", s.Balance("patient-a"))
	}
}

func TestDebitInsufficient(t *testing.T) {
	s := NewMemory()
	s.SetBalance("patient-a", 1000)
	if err := s.Debit("patient-a", 3000); err == nil {
		t.Errorf("expected insufficient funds error")
	}
}

func TestDebitUnknownAccount(t *testing.T) {
	s := NewMemory()
	if err := s.Debit("ghost", 100); err == nil {
		t.Errorf("expected unknown account error")
	}
}
