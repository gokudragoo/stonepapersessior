import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as linera from "@linera/client";
import { Wallet } from "ethers";

const LineraContext = createContext();

const DEFAULT_FAUCET_URL =
  process.env.REACT_APP_LINERA_FAUCET_URL || "http://localhost:8080";

const DEFAULT_APPLICATION_ID = process.env.REACT_APP_LINERA_APPLICATION_ID || "";

const MATCHMAKER_CHAIN_ID =
  process.env.REACT_APP_LINERA_MATCHMAKER_CHAIN_ID ||
  "45c6ea1ec5975879c206f4fe7e427a11f21cf75a9e281623bcb43ba1865c8b2c";

const getCookie = (name) => {
  try {
    const parts = String(document.cookie || "")
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean);
    const prefix = `${encodeURIComponent(name)}=`;
    const found = parts.find((p) => p.startsWith(prefix));
    if (!found) return "";
    return decodeURIComponent(found.slice(prefix.length));
  } catch {
    return "";
  }
};

const setCookie = (name, value, maxAgeSeconds = 60 * 60 * 24 * 365) => {
  try {
    const encodedName = encodeURIComponent(name);
    const encodedValue = encodeURIComponent(String(value));
    document.cookie = `${encodedName}=${encodedValue}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
  } catch { }
};

const syncHeightCookieName = (chainId) => `linera_sync_height_${String(chainId || "")}`;
const syncHeightStorageKey = (chainId) => `linera_sync_height:${String(chainId || "")}`;

const parseHeightNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return Math.floor(value);
  if (typeof value === "string") {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const extractNotificationHeight = (notification) => {
  const direct =
    parseHeightNumber(notification?.height) ??
    parseHeightNumber(notification?.blockHeight) ??
    parseHeightNumber(notification?.block_height);
  if (direct != null) return direct;

  const nb = notification?.reason?.NewBlock;
  const newBlock =
    parseHeightNumber(nb) ??
    parseHeightNumber(nb?.height) ??
    parseHeightNumber(nb?.blockHeight) ??
    parseHeightNumber(nb?.block_height);
  if (newBlock != null) return newBlock;

  try {
    const s = JSON.stringify(notification);
    const m =
      s.match(/block_height"?\s*[:=]\s*"?(\d+)"?/i) ||
      s.match(/blockHeight"?\s*[:=]\s*"?(\d+)"?/i) ||
      s.match(/height"?\s*[:=]\s*"?(\d+)"?/i);
    if (m?.[1]) {
      const n = Number.parseInt(m[1], 10);
      return Number.isFinite(n) ? n : null;
    }
  } catch { }

  return null;
};

const ensureWasmInstantiateStreamingFallback = () => {
  if (typeof WebAssembly === "undefined") return;
  const wasmAny = WebAssembly;
  const original = wasmAny.instantiateStreaming;
  if (typeof original !== "function") return;
  wasmAny.instantiateStreaming = async (source, importObject) => {
    try {
      const res = source instanceof Response ? source : await source;
      const ct = res.headers?.get("Content-Type") || "";
      if (ct.includes("application/wasm")) {
        return original(Promise.resolve(res), importObject);
      }
      const buf = await res.arrayBuffer();
      return WebAssembly.instantiate(buf, importObject);
    } catch {
      const res = source instanceof Response ? source : await source;
      const buf = await res.arrayBuffer();
      return WebAssembly.instantiate(buf, importObject);
    }
  };
};

const escapeGqlString = (value) =>
  String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");

const normalizeChoiceText = (value) => {
  const v = String(value || "").toLowerCase();
  if (v === "stone" || v === "rock") return "stone";
  if (v === "paper") return "paper";
  if (v === "scissor" || v === "scissors") return "scissors";
  return null;
};

const normalizeEnumKey = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const choiceEnumFallback = (value) => {
  const v = normalizeChoiceText(value);
  if (v === "stone") return "Stone";
  if (v === "paper") return "Paper";
  if (v === "scissors") return "Scissors";
  return null;
};

const mapChoiceToServerEnum = (value, enumNames) => {
  const normalized = normalizeChoiceText(value);
  if (!normalized) return null;
  const candidates =
    normalized === "scissors" ? ["scissors", "scissor"] : [normalized];
  const names = Array.isArray(enumNames) ? enumNames : [];
  const match = names.find((n) => candidates.includes(normalizeEnumKey(n)));
  return match || null;
};

const normalizeRoundRecord = (record) => {
  if (!record) return record;
  const host = normalizeChoiceText(record.hostChoice);
  const guest = normalizeChoiceText(record.guestChoice);
  return {
    ...record,
    hostChoice: host ? host[0].toUpperCase() + host.slice(1) : record.hostChoice,
    guestChoice: guest ? guest[0].toUpperCase() + guest.slice(1) : record.guestChoice,
  };
};

const defaultPlayerName = (chainId) => {
  if (!chainId) return "Player";
  return `Player-${String(chainId).slice(0, 6)}`;
};

const LineraContextProvider = ({ children }) => {
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState("");
  const [initStage, setInitStage] = useState("");
  const [chainId, setChainId] = useState("");
  const [applicationId, setApplicationId] = useState(DEFAULT_APPLICATION_ID);
  const [faucetUrl, setFaucetUrl] = useState(DEFAULT_FAUCET_URL);
  const [syncHeight, setSyncHeight] = useState(null);
  const [syncUnlocked, setSyncUnlocked] = useState(true);
  const [finalResult, setFinalResult] = useState(null);

  const [game, setGame] = useState(null);
  const [matchStatus, setMatchStatus] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [opponentChainId, setOpponentChainId] = useState(null);
  const [myReady, setMyReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);
  const [myChoice, setMyChoice] = useState(null);
  const [opponentChoice, setOpponentChoice] = useState(null);
  const [myScore, setMyScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [lastRoundRecord, setLastRoundRecord] = useState(null);
  const [roundHistory, setRoundHistory] = useState([]);
  const [lastNotification, setLastNotification] = useState(null);

  const clientRef = useRef(null);
  const chainRef = useRef(null);
  const appRef = useRef(null);
  const notificationUnsubRef = useRef(null);
  const refreshInFlightRef = useRef(false);
  const choiceEnumNamesRef = useRef(null);
  const syncMinHeightRef = useRef(0);
  const refreshDebounceTimerRef = useRef(null);
  const lastSnapshotRef = useRef({});
  const isMountedRef = useRef(true);
  const initInProgressRef = useRef(false);

  const gql = useCallback(async (query) => {
    if (!appRef.current) throw new Error("Linera app not initialized");
    const res = await appRef.current.query(JSON.stringify({ query }));
    const data = typeof res === "string" ? JSON.parse(res) : res;
    if (data?.errors?.length) {
      const msg = data.errors.map((e) => e.message).join("; ");
      throw new Error(msg);
    }
    return data?.data;
  }, []);

  const loadChoiceEnumNames = useCallback(async () => {
    try {
      const data = await gql(`query { __type(name: "Choice") { enumValues { name } } }`);
      const names = data?.__type?.enumValues?.map((v) => v?.name).filter(Boolean) || [];
      if (names.length) {
        choiceEnumNamesRef.current = names;
      }
      return names;
    } catch {
      return choiceEnumNamesRef.current || [];
    }
  }, [gql]);

  const refresh = useCallback(async () => {
    if (!ready) return;
    if (!syncUnlocked) {
      setGame(null);
      setMatchStatus(null);
      setIsHost(false);
      setOpponentChainId(null);
      setMyReady(false);
      setOpponentReady(false);
      setMyChoice(null);
      setOpponentChoice(null);
      setMyScore(0);
      setOpponentScore(0);
      setLastRoundRecord(null);
      setRoundHistory([]);
      return;
    }
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const data = await gql(`
        query {
          game {
            matchId
            hostChainId
            status
            players { chainId name }
            round
            hostScore
            guestScore
            lastOutcome
            winnerChainId
            history { round hostChoice guestChoice outcome hostScore guestScore timestamp }
          }
          matchStatus
          isHost
          opponentChainId
          myReady
          opponentReady
          myChoice
          opponentChoice
          myScore
          opponentScore
          lastRoundRecord { round hostChoice guestChoice outcome hostScore guestScore timestamp }
          roundHistory { round hostChoice guestChoice outcome hostScore guestScore timestamp }
          lastNotification
        }
      `);
      const nextGame = data?.game ?? null;
      const nextGameJson = JSON.stringify(nextGame);
      if (nextGameJson !== lastSnapshotRef.current.gameJson) {
        lastSnapshotRef.current.gameJson = nextGameJson;
        setGame(nextGame);
      }

      const nextMatchStatus = data?.matchStatus ?? null;
      setMatchStatus((prev) => (Object.is(prev, nextMatchStatus) ? prev : nextMatchStatus));

      const nextIsHost = Boolean(data?.isHost);
      setIsHost((prev) => (prev === nextIsHost ? prev : nextIsHost));

      const nextOpponentChainId = data?.opponentChainId ?? null;
      setOpponentChainId((prev) => (Object.is(prev, nextOpponentChainId) ? prev : nextOpponentChainId));

      const nextMyReady = Boolean(data?.myReady);
      setMyReady((prev) => (prev === nextMyReady ? prev : nextMyReady));

      const nextOpponentReady = Boolean(data?.opponentReady);
      setOpponentReady((prev) => (prev === nextOpponentReady ? prev : nextOpponentReady));

      const nextMyChoice =
        normalizeRoundRecord({ hostChoice: data?.myChoice })?.hostChoice ?? null;
      setMyChoice((prev) => (Object.is(prev, nextMyChoice) ? prev : nextMyChoice));

      const nextOpponentChoice =
        normalizeRoundRecord({ hostChoice: data?.opponentChoice })?.hostChoice ?? null;
      setOpponentChoice((prev) => (Object.is(prev, nextOpponentChoice) ? prev : nextOpponentChoice));

      const nextMyScore = Number(data?.myScore ?? 0);
      setMyScore((prev) => (prev === nextMyScore ? prev : nextMyScore));

      const nextOpponentScore = Number(data?.opponentScore ?? 0);
      setOpponentScore((prev) => (prev === nextOpponentScore ? prev : nextOpponentScore));

      if (nextMyScore >= 3 || nextOpponentScore >= 3) {
        const nextMatchId = nextGame?.matchId ?? null;
        setFinalResult((prev) => {
          const nextSnapshot = {
            matchId: nextMatchId,
            myScore: nextMyScore,
            opponentScore: nextOpponentScore,
          };
          const prevJson = prev ? JSON.stringify(prev) : "";
          const nextJson = JSON.stringify(nextSnapshot);
          return prevJson === nextJson ? prev : nextSnapshot;
        });
      }

      const nextLastRoundRecord = normalizeRoundRecord(data?.lastRoundRecord ?? null);
      const nextLastRoundRecordJson = JSON.stringify(nextLastRoundRecord);
      if (nextLastRoundRecordJson !== lastSnapshotRef.current.lastRoundRecordJson) {
        lastSnapshotRef.current.lastRoundRecordJson = nextLastRoundRecordJson;
        setLastRoundRecord(nextLastRoundRecord);
      }

      const nextRoundHistory = Array.isArray(data?.roundHistory)
        ? data.roundHistory.map(normalizeRoundRecord)
        : [];
      const nextRoundHistoryJson = JSON.stringify(nextRoundHistory);
      if (nextRoundHistoryJson !== lastSnapshotRef.current.roundHistoryJson) {
        lastSnapshotRef.current.roundHistoryJson = nextRoundHistoryJson;
        setRoundHistory(nextRoundHistory);
      }

      const nextLastNotification = data?.lastNotification ?? null;
      setLastNotification((prev) =>
        Object.is(prev, nextLastNotification) ? prev : nextLastNotification
      );
    } catch (e) {
      setLastNotification(String(e?.message || e));
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [gql, ready, syncUnlocked]);

  const snapshotFinalResult = useCallback((snapshot) => {
    if (!snapshot) return;
    const my = Number(snapshot.myScore ?? 0);
    const opp = Number(snapshot.opponentScore ?? 0);
    if (my < 3 && opp < 3) return;
    const nextSnapshot = {
      matchId: snapshot.matchId ?? null,
      myScore: my,
      opponentScore: opp,
    };
    setFinalResult((prev) => {
      const prevJson = prev ? JSON.stringify(prev) : "";
      const nextJson = JSON.stringify(nextSnapshot);
      return prevJson === nextJson ? prev : nextSnapshot;
    });
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (refreshDebounceTimerRef.current) return;
    refreshDebounceTimerRef.current = setTimeout(() => {
      refreshDebounceTimerRef.current = null;
      refresh();
    }, 150);
  }, [refresh]);

  const startNotifications = useCallback(() => {
    if (!isMountedRef.current) return;
    if (!chainRef.current || typeof chainRef.current.onNotification !== "function") return;
    if (typeof notificationUnsubRef.current === "function") {
      try {
        notificationUnsubRef.current();
      } catch { }
      notificationUnsubRef.current = null;
    }
    const handler = (notification) => {
      // Guard: Don't execute if component is unmounted
      if (!isMountedRef.current) return;
      if (!chainRef.current) return;
      
      try {
        const height = extractNotificationHeight(notification);
        if (height != null && chainId) {
          const cookieName = syncHeightCookieName(chainId);
          const storageKey = syncHeightStorageKey(chainId);
          const nextStoredHeight = Math.max(syncMinHeightRef.current || 0, height);
          syncMinHeightRef.current = nextStoredHeight;
          if (isMountedRef.current) {
            setSyncHeight((prev) => (prev === nextStoredHeight ? prev : nextStoredHeight));
          }
          setCookie(cookieName, nextStoredHeight);
          try {
            localStorage.setItem(storageKey, String(nextStoredHeight));
          } catch { }

          if (height >= (syncMinHeightRef.current || 0) && isMountedRef.current) {
            setSyncUnlocked(true);
          }
        }
        if (notification?.reason?.NewBlock && syncUnlocked && isMountedRef.current) {
          scheduleRefresh();
        } else if (notification?.reason?.NewBlock && !syncUnlocked && isMountedRef.current) {
          const heightNow = extractNotificationHeight(notification);
          if (heightNow != null && heightNow >= (syncMinHeightRef.current || 0)) {
            setSyncUnlocked(true);
            scheduleRefresh();
          }
        }
      } catch { }
    };
    const maybeUnsub = chainRef.current.onNotification(handler);
    if (typeof maybeUnsub === "function") {
      notificationUnsubRef.current = maybeUnsub;
    }
  }, [chainId, scheduleRefresh, syncUnlocked]);

  const initLinera = useCallback(async () => {
    // Prevent concurrent initialization
    if (initInProgressRef.current) return;
    initInProgressRef.current = true;

    try {
      setInitError("");
      setInitStage("Initializing wallet...");
      setReady(false);
      setSyncHeight(null);
      setSyncUnlocked(true);
      setGame(null);
      setLastNotification(null);

      if (!applicationId) {
        setInitError("Missing REACT_APP_LINERA_APPLICATION_ID");
        setInitStage("Configuration error");
        return;
      }

      ensureWasmInstantiateStreamingFallback();
      setInitStage("Initializing Linera...");
      try {
        await linera.initialize();
      } catch (e) {
        console.warn("Linera initialization warning:", e);
      }

      setInitStage("Preparing mnemonic...");
      let mnemonic = "";
      try {
        mnemonic = localStorage.getItem("linera_mnemonic") || "";
      } catch { }
      if (!mnemonic) {
        const generated = Wallet.createRandom();
        const phrase = generated.mnemonic?.phrase;
        if (!phrase) {
          setInitError("Failed to generate mnemonic");
          setInitStage("Mnemonic generation failed");
          return;
        }
        mnemonic = phrase;
        try {
          localStorage.setItem("linera_mnemonic", mnemonic);
        } catch { }
      }

      try {
        setInitStage("Creating wallet...");
        const signer = linera.signer.PrivateKey.fromMnemonic(mnemonic);
        const faucet = new linera.Faucet(faucetUrl);
        const owner = signer.address();

        const wallet = await faucet.createWallet();
        setInitStage("Creating microchain...");
        const newChainId = await faucet.claimChain(wallet, owner);

        setInitStage("Connecting to application...");
        const clientInstance = await new linera.Client(wallet, signer, { skipProcessInbox: false });
        const chain = await clientInstance.chain(newChainId);
        const application = await chain.application(applicationId);

        clientRef.current = clientInstance;
        chainRef.current = chain;
        appRef.current = application;
        let minHeight = 0;
        try {
          const cookieValue = getCookie(syncHeightCookieName(newChainId));
          const localValue = localStorage.getItem(syncHeightStorageKey(newChainId)) || "";
          minHeight = parseHeightNumber(localValue) ?? parseHeightNumber(cookieValue) ?? 0;
        } catch {
          minHeight = 0;
        }
        syncMinHeightRef.current = minHeight;
        setSyncUnlocked(minHeight <= 0);
        setChainId(newChainId);
        setReady(true);
        setInitStage("Ready");
      } catch (e) {
        if (isMountedRef.current) {
          setInitError(String(e?.message || e));
          setInitStage("Initialization failed");
        }
      }
    } catch (e) {
      if (isMountedRef.current) {
        setInitError(String(e?.message || e));
        setInitStage("Initialization failed");
      }
    } finally {
      initInProgressRef.current = false;
    }
  }, [applicationId, faucetUrl]);

  useEffect(() => {
    initLinera();
  }, [initLinera]);

  useEffect(() => {
    if (!ready) return;
    startNotifications();
    if (syncUnlocked) {
      refresh();
    }
    const id = setInterval(() => {
      if (syncUnlocked && isMountedRef.current) refresh();
    }, 2500);
    return () => {
      clearInterval(id);
      if (refreshDebounceTimerRef.current) {
        clearTimeout(refreshDebounceTimerRef.current);
        refreshDebounceTimerRef.current = null;
      }
    };
  }, [ready, refresh, startNotifications, syncUnlocked]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Cleanup notification subscription
      if (typeof notificationUnsubRef.current === "function") {
        try {
          notificationUnsubRef.current();
        } catch { }
        notificationUnsubRef.current = null;
      }
      // Cleanup timers
      if (refreshDebounceTimerRef.current) {
        clearTimeout(refreshDebounceTimerRef.current);
        refreshDebounceTimerRef.current = null;
      }
    };
  }, []);

  const createMatch = useCallback(
    async (hostName) => {
      const name = escapeGqlString(hostName || defaultPlayerName(chainId));
      await gql(`mutation { createMatch(hostName: "${name}") }`);
      await refresh();
    },
    [chainId, gql, refresh]
  );

  const joinMatch = useCallback(
    async (hostChainId, playerName) => {
      const host = escapeGqlString(hostChainId);
      const name = escapeGqlString(playerName || defaultPlayerName(chainId));
      await gql(`mutation { joinMatch(hostChainId: "${host}", playerName: "${name}") }`);
      await refresh();
    },
    [chainId, gql, refresh]
  );

  const searchPlayer = useCallback(
    async (playerName) => {
      const orchestrator = escapeGqlString(MATCHMAKER_CHAIN_ID);
      const name = escapeGqlString(playerName || defaultPlayerName(chainId));

      await gql(`mutation { searchPlayer(orchestratorChainId: "${orchestrator}", playerName: "${name}") }`);
      await refresh();
    },
    [chainId, gql, refresh]
  );

  const pickAndReady = useCallback(
    async (value) => {
      const names = choiceEnumNamesRef.current || (await loadChoiceEnumNames());
      const serverChoice =
        mapChoiceToServerEnum(value, names) || choiceEnumFallback(value);
      if (!serverChoice) throw new Error("Invalid choice");
      try {
        await gql(`mutation { pickAndReady(choice: ${serverChoice}) }`);
      } catch (e) {
        const msg = String(e?.message || e);
        if (msg.includes('enumeration type "Choice" does not contain the value')) {
          const refreshed = await loadChoiceEnumNames();
          const retryChoice =
            mapChoiceToServerEnum(value, refreshed) || choiceEnumFallback(value);
          if (!retryChoice) throw e;
          await gql(`mutation { pickAndReady(choice: ${retryChoice}) }`);
        } else {
          throw e;
        }
      }
      await refresh();
    },
    [gql, loadChoiceEnumNames, refresh]
  );

  const leaveMatch = useCallback(async () => {
    await gql(`mutation { leaveMatch }`);
    await refresh();
  }, [gql, refresh]);

  const value = useMemo(
    () => ({
      ready,
      initError,
      initStage,
      chainId,
      applicationId,
      faucetUrl,
      syncHeight,
      syncUnlocked,
      finalResult,
      matchmakerChainId: MATCHMAKER_CHAIN_ID,
      game,
      matchStatus,
      isHost,
      opponentChainId,
      myReady,
      opponentReady,
      myChoice,
      opponentChoice,
      myScore,
      opponentScore,
      lastRoundRecord,
      roundHistory,
      lastNotification,
      setApplicationId,
      setFaucetUrl,
      refresh,
      snapshotFinalResult,
      createMatch,
      joinMatch,
      searchPlayer,
      pickAndReady,
      leaveMatch,
    }),
    [
      applicationId,
      chainId,
      createMatch,
      finalResult,
      faucetUrl,
      game,
      initError,
      initStage,
      isHost,
      joinMatch,
      lastNotification,
      lastRoundRecord,
      matchStatus,
      myChoice,
      myReady,
      myScore,
      opponentChoice,
      opponentChainId,
      opponentReady,
      opponentScore,
      ready,
      refresh,
      roundHistory,
      searchPlayer,
      snapshotFinalResult,
      syncHeight,
      syncUnlocked,
      pickAndReady,
      leaveMatch,
    ]
  );

  return <LineraContext.Provider value={value}>{children}</LineraContext.Provider>;
};

export { LineraContextProvider, LineraContext };
