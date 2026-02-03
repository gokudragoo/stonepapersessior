# On-Chain Verification Guide

This document verifies that the Stone Paper Scissors application is fully on-chain.

## ✅ On-Chain State Verification

### State Structure (state.rs)

All state variables use `RegisterView` which means they are stored on-chain:

```rust
#[derive(RootView)]
pub struct SpsState {
    pub game: RegisterView<Option<Game>>,              // ✅ On-chain
    pub my_ready: RegisterView<bool>,                   // ✅ On-chain
    pub opponent_ready: RegisterView<bool>,             // ✅ On-chain
    pub my_choice: RegisterView<Option<Choice>>,        // ✅ On-chain
    pub opponent_choice: RegisterView<Option<Choice>>,   // ✅ On-chain
    pub last_notification: RegisterView<Option<String>>, // ✅ On-chain
    pub matchmaking_queue: RegisterView<Vec<MatchmakingPlayer>>, // ✅ On-chain
}
```

### Contract Operations (contract.rs)

All state modifications use `.set()` method (on-chain writes):
- Found **45 instances** of `.get()` and `.set()` calls
- All state reads use `.get()` (on-chain reads)
- All state writes use `.set()` (on-chain writes)

Examples:
```rust
self.state.game.set(Some(game));           // ✅ On-chain write
self.state.my_ready.set(true);             // ✅ On-chain write
let game = self.state.game.get().clone();  // ✅ On-chain read
```

### Service Queries (service.rs)

All GraphQL queries read from on-chain state:
```rust
let game = self.state.game.get().clone();              // ✅ On-chain
let my_ready = self.state.my_ready.get().clone();       // ✅ On-chain
let opponent_ready = self.state.opponent_ready.get().clone(); // ✅ On-chain
```

## ✅ No Backend Server

- **No Express/Node.js server**: All queries go directly to Linera service
- **GraphQL runs in WASM**: Service executes on your microchain
- **No database**: All state is stored on-chain using Linera Views
- **No REST API**: Only GraphQL queries to on-chain service

## ✅ Cross-Chain Communication

All player interactions use cross-chain messages:
- `JoinRequest`: Guest → Host (cross-chain)
- `InitialStateSync`: Host → Guest (cross-chain)
- `ReadyNotice`: Player → Opponent (cross-chain)
- `ChoiceReveal`: Player → Opponent (cross-chain)
- `GameSync`: Host → Guest (cross-chain)

## ✅ Verification Steps

### Step 1: Check Application ID
After `docker compose up`, you should see:
```
Application ID: <64-character-hex-string>
```
This confirms the contract is deployed on-chain.

### Step 2: Check Browser Console
1. Open http://localhost:5173
2. Open DevTools (F12) → Network tab
3. Create a match
4. Look for GraphQL queries
5. All queries should go to Linera service (on-chain), not a backend server

### Step 3: Test Persistence
1. Create a match
2. Make a move
3. Refresh the page (F5)
4. State should persist (stored on-chain, not in memory)

### Step 4: Test Cross-Chain
1. Open two browser windows
2. Window 1: Create match (note Room ID)
3. Window 2: Join with Room ID
4. Make moves in both windows
5. State should sync (cross-chain messages working)

## ✅ Comparison with RPSv2

Our implementation matches RPSv2's on-chain architecture:
- ✅ Same state structure (RegisterView for all fields)
- ✅ Same contract pattern (execute_operation, execute_message)
- ✅ Same service pattern (GraphQL queries from on-chain state)
- ✅ Same cross-chain message flow
- ✅ No backend server (fully on-chain)

## Conclusion

✅ **Everything is on-chain!**
- State: Stored using Linera Views
- Logic: Executes in WASM on microchain
- Communication: Cross-chain messages
- No backend: Direct GraphQL to on-chain service
