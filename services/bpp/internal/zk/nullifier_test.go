package zk

import (
	"testing"
	"time"
)

func TestNullifierCacheFirstSeenSucceeds(t *testing.T) {
	c := NewNullifierCache(time.Minute)
	if err := c.CheckAndStore("0xabc"); err != nil {
		t.Errorf("first insert should succeed, got %v", err)
	}
}

func TestNullifierCacheReplayRejected(t *testing.T) {
	c := NewNullifierCache(time.Minute)
	_ = c.CheckAndStore("0xabc")
	if err := c.CheckAndStore("0xabc"); err == nil {
		t.Errorf("replay should be rejected")
	}
}

func TestNullifierCacheTTLExpires(t *testing.T) {
	c := NewNullifierCache(10 * time.Millisecond)
	_ = c.CheckAndStore("0xabc")
	time.Sleep(20 * time.Millisecond)
	if err := c.CheckAndStore("0xabc"); err != nil {
		t.Errorf("post-TTL insert should succeed, got %v", err)
	}
}
