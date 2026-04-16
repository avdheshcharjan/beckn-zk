package zk

import (
	"errors"
	"fmt"

	"github.com/avdhesh/beckn-zk/services/bpp/internal/beckn"
)

var ErrNoZkTag = errors.New("no zk_proof tag present")

type ExtractedTag struct {
	Scheme           string
	CircuitID        string
	ProofB64         string
	PublicInputsJSON string
	Nullifier        string
	Binding          string
}

func ExtractZkTag(intent beckn.Intent) (ExtractedTag, error) {
	var group *beckn.TagGroup
	for i := range intent.Tags {
		if intent.Tags[i].Descriptor.Code == "zk_proof" {
			group = &intent.Tags[i]
			break
		}
	}
	if group == nil {
		return ExtractedTag{}, ErrNoZkTag
	}

	byCode := make(map[string]string, len(group.List))
	for _, t := range group.List {
		byCode[t.Descriptor.Code] = t.Value
	}

	required := []string{"scheme", "circuit_id", "proof", "public_inputs", "nullifier", "binding"}
	for _, code := range required {
		if byCode[code] == "" {
			return ExtractedTag{}, fmt.Errorf("zk_proof tag missing %q", code)
		}
	}

	return ExtractedTag{
		Scheme:           byCode["scheme"],
		CircuitID:        byCode["circuit_id"],
		ProofB64:         byCode["proof"],
		PublicInputsJSON: byCode["public_inputs"],
		Nullifier:        byCode["nullifier"],
		Binding:          byCode["binding"],
	}, nil
}
