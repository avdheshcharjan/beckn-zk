package zk

import (
	"errors"
	"sync"
	"time"
)

var ErrNullifierSeen = errors.New("nullifier already seen (replay)")

type NullifierCache struct {
	ttl  time.Duration
	mu   sync.Mutex
	seen map[string]time.Time
}

func NewNullifierCache(ttl time.Duration) *NullifierCache {
	return &NullifierCache{ttl: ttl, seen: make(map[string]time.Time)}
}

func (c *NullifierCache) CheckAndStore(nullifier string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := time.Now()
	for k, t := range c.seen {
		if now.Sub(t) > c.ttl {
			delete(c.seen, k)
		}
	}

	if t, ok := c.seen[nullifier]; ok && now.Sub(t) <= c.ttl {
		return ErrNullifierSeen
	}
	c.seen[nullifier] = now
	return nil
}
