package store

import (
	"errors"
	"fmt"
	"sync"
)

var (
	ErrUnknownAccount = errors.New("unknown account")
	ErrInsufficient   = errors.New("insufficient funds")
)

type Memory struct {
	mu       sync.Mutex
	balances map[string]int64
}

func NewMemory() *Memory {
	return &Memory{balances: make(map[string]int64)}
}

func (m *Memory) SetBalance(account string, v int64) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.balances[account] = v
}

func (m *Memory) Balance(account string) int64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.balances[account]
}

func (m *Memory) Debit(account string, amount int64) error {
	if amount <= 0 {
		return fmt.Errorf("debit: non-positive amount %d", amount)
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	bal, ok := m.balances[account]
	if !ok {
		return ErrUnknownAccount
	}
	if bal < amount {
		return ErrInsufficient
	}
	m.balances[account] = bal - amount
	return nil
}

func (m *Memory) Snapshot() map[string]int64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make(map[string]int64, len(m.balances))
	for k, v := range m.balances {
		out[k] = v
	}
	return out
}
