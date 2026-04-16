package zk

import (
	"testing"

	"github.com/avdhesh/beckn-zk/services/bpp/internal/beckn"
)

func sampleZkIntent() beckn.Intent {
	return beckn.Intent{
		Category: &beckn.IntentCategory{Descriptor: beckn.Descriptor{Name: "cardiology"}},
		Tags: []beckn.TagGroup{
			{
				Descriptor: beckn.Descriptor{Code: "zk_proof"},
				List: []beckn.Tag{
					{Descriptor: beckn.Descriptor{Code: "scheme"}, Value: "groth16"},
					{Descriptor: beckn.Descriptor{Code: "circuit_id"}, Value: "anon-aadhaar-v2"},
					{Descriptor: beckn.Descriptor{Code: "proof"}, Value: "aGVsbG8="},
					{Descriptor: beckn.Descriptor{Code: "public_inputs"}, Value: `["1","2"]`},
					{Descriptor: beckn.Descriptor{Code: "nullifier"}, Value: "0xdead"},
					{Descriptor: beckn.Descriptor{Code: "binding"}, Value: "0xbeef"},
				},
			},
		},
	}
}

func TestExtractZkTagHappy(t *testing.T) {
	tag, err := ExtractZkTag(sampleZkIntent())
	if err != nil {
		t.Fatal(err)
	}
	if tag.Scheme != "groth16" || tag.CircuitID != "anon-aadhaar-v2" {
		t.Errorf("bad header: %+v", tag)
	}
	if tag.ProofB64 != "aGVsbG8=" || tag.PublicInputsJSON != `["1","2"]` {
		t.Errorf("bad body: %+v", tag)
	}
	if tag.Nullifier != "0xdead" || tag.Binding != "0xbeef" {
		t.Errorf("bad crypto fields: %+v", tag)
	}
}

func TestExtractZkTagMissing(t *testing.T) {
	intent := beckn.Intent{} // no tags
	_, err := ExtractZkTag(intent)
	if err != ErrNoZkTag {
		t.Errorf("expected ErrNoZkTag, got %v", err)
	}
}

func TestExtractZkTagIncomplete(t *testing.T) {
	intent := beckn.Intent{
		Tags: []beckn.TagGroup{
			{
				Descriptor: beckn.Descriptor{Code: "zk_proof"},
				List: []beckn.Tag{
					{Descriptor: beckn.Descriptor{Code: "scheme"}, Value: "groth16"},
				},
			},
		},
	}
	_, err := ExtractZkTag(intent)
	if err == nil {
		t.Errorf("expected error for incomplete zk_proof tag")
	}
}
