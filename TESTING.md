# How to Start and Test the On-Chain App

## Method 1: Using Docker (Recommended)

### Step 1: Start the Application

```bash
docker compose up --force-recreate
```

This will:
- Start Linera local network with faucet
- Build the Rust contract to WASM
- Deploy the application on-chain
- Start the frontend server

### Step 2: Access the Application

Open your browser and go to: **http://localhost:5173**

## Method 2: Manual Setup (Without Docker)

### Prerequisites
- Rust installed
- Node.js 20+ installed
- Linera CLI installed

### Step 1: Start Linera Network

```bash
eval "$(linera net helper)"
linera_spawn linera net up --with-faucet
```

### Step 2: Initialize Wallet

```bash
export LINERA_FAUCET_URL=http://localhost:8080
linera wallet init --faucet="$LINERA_FAUCET_URL"
linera wallet request-chain --faucet="$LINERA_FAUCET_URL"
```

### Step 3: Build Contract

```bash
cd stone-paper-scissors
rustup target add wasm32-unknown-unknown
cargo build --release --target wasm32-unknown-unknown
cd ..
```

### Step 4: Deploy Application

```bash
LINERA_APPLICATION_ID=$(linera --wait-for-outgoing-messages \
  publish-and-create stone-paper-scissors/target/wasm32-unknown-unknown/release/sps_contract.wasm \
  stone-paper-scissors/target/wasm32-unknown-unknown/release/sps_service.wasm)

echo "Application ID: $LINERA_APPLICATION_ID"
```

### Step 5: Configure Frontend

```bash
cat > client/.env <<EOF
REACT_APP_LINERA_APPLICATION_ID=$LINERA_APPLICATION_ID
REACT_APP_LINERA_FAUCET_URL=http://localhost:8080
REACT_APP_LINERA_MATCHMAKER_CHAIN_ID=45c6ea1ec5975879c206f4fe7e427a11f21cf75a9e281623bcb43ba1865c8b2c
EOF
```

### Step 6: Start Frontend

```bash
cd client
npm install
npm start
```

## How to Verify It's On-Chain

### 1. Check Application Deployment

After deployment, you should see:
```
Application ID: <some-hash>
```

This confirms the application is deployed on-chain.

### 2. Verify State is On-Chain

**Method A: Check Browser Console**

1. Open browser DevTools (F12)
2. Go to Console tab
3. Look for messages like:
   - "Initializing Linera..."
   - "Creating microchain..."
   - "Connecting to application..."
   - "Ready"

4. Check for chain ID display in the UI (top banner)

**Method B: Query On-Chain State via GraphQL**

You can query the on-chain state directly:

```bash
# Get your chain ID from the wallet
CHAIN_ID=$(linera wallet show | grep -i chain | head -1 | awk '{print $2}')

# Query game state (if you have a game)
linera query --target $CHAIN_ID --query '{ game { matchId status players { name } hostScore guestScore } }'
```

### 3. Test On-Chain Operations

**Test 1: Create Match (On-Chain)**
1. Enter your name
2. Click "Play with Friend"
3. Click "Create Room"
4. **Verify**: Room ID (chain ID) appears - this is your on-chain microchain
5. **Verify**: Game state is created on-chain

**Test 2: Join Match (Cross-Chain)**
1. Open a second browser/incognito window
2. Enter a different name
3. Click "Play with Friend" → "Join Room"
4. Paste the Room ID from Test 1
5. **Verify**: Guest joins via cross-chain message
6. **Verify**: Both players see the match is Active

**Test 3: Play Round (On-Chain State)**
1. Both players select Stone/Paper/Scissors
2. **Verify**: Choices are stored on-chain
3. **Verify**: Round outcome is computed on-chain
4. **Verify**: Scores update on-chain
5. **Verify**: Game history is stored on-chain

**Test 4: Verify Persistence**
1. Refresh the browser
2. **Verify**: Game state persists (still shows current game)
3. **Verify**: Scores are still there
4. This proves state is on-chain, not just in memory

### 4. Check Linera Network Status

```bash
# Check if network is running
linera net status

# View your chains
linera wallet show

# View application on your chain
linera query --target <YOUR_CHAIN_ID> --query '{ game { matchId status } }'
```

### 5. Monitor On-Chain Activity

**In Browser Console:**
- Look for GraphQL queries being made
- Check for "Refresh" messages showing state updates
- Verify notifications about new blocks

**In Terminal:**
```bash
# Watch Linera logs
docker compose logs -f app

# Or if running manually, check Linera output
```

## Expected On-Chain Behavior

✅ **State Persists**: Refresh browser, game state remains  
✅ **Cross-Chain Works**: Two players on different chains can play  
✅ **GraphQL Queries**: Frontend queries on-chain state via GraphQL  
✅ **Operations Execute**: All game operations (create, join, play) execute on-chain  
✅ **Microchains**: Each player has their own microchain (visible as chain ID)  

## Troubleshooting

### Issue: "Missing REACT_APP_LINERA_APPLICATION_ID"
**Solution**: Make sure `client/.env` exists with the application ID

### Issue: "Failed to load state"
**Solution**: Contract may not be deployed. Re-run deployment step.

### Issue: "Initialization failed"
**Solution**: 
- Check Linera network is running: `linera net status`
- Check faucet is accessible: `curl http://localhost:8080`

### Issue: Frontend doesn't connect
**Solution**:
- Verify application ID in `.env` matches deployed ID
- Check browser console for errors
- Ensure Linera network is running

## Quick Test Checklist

- [ ] Docker compose starts successfully
- [ ] Application ID is generated and saved
- [ ] Frontend loads at http://localhost:5173
- [ ] Can create a match (on-chain)
- [ ] Can join a match (cross-chain)
- [ ] Can play rounds (state updates on-chain)
- [ ] Game state persists after refresh
- [ ] Two players can play together
- [ ] Scores update correctly
- [ ] Game ends at 3 points

If all these work, your app is **fully on-chain**! 🎉
