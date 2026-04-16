package zk

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

func ComputeBinding(transactionID, timestamp string) string {
	sum := sha256.Sum256([]byte(transactionID + "|" + timestamp))
	return hex.EncodeToString(sum[:])
}

func VerifyBinding(binding, transactionID, timestamp string) error {
	want := ComputeBinding(transactionID, timestamp)
	if binding != want {
		return fmt.Errorf("binding mismatch: proof committed to %q, context is %q", binding, want)
	}
	return nil
}
