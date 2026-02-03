import { useEffect, useContext, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { LineraContext } from "../../context/LineraContext";
import PlayerOne from "../../components/PlayerOne";
import PlayerTwo from "../../components/PlayerTwo";
import Controls from "../../components/Controls";
import styles from "./styles.module.css";

const PLAYER_NAME_STORAGE_KEY = "sps_player_name";

const normalizeEnumKey = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const Room = () => {
  const [result, setResult] = useState({
    rotate: 0,
    show: false,
    reset: false,
  });
  const [resultText, setResultText] = useState("");
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    ready,
    initError,
    chainId,
    syncUnlocked,
    game,
    isHost,
    opponentChainId,
    matchStatus,
    myScore,
    opponentScore,
    lastRoundRecord,
    lastNotification,
    joinMatch,
    snapshotFinalResult,
  } = useContext(LineraContext);
  const hasJoinedRef = useRef(false);
  const lastAnimatedRoundRef = useRef(null);
  const animationTokenRef = useRef(0);
  const resultNavTriggeredRef = useRef(false);

  useEffect(() => {
    if (!ready) return;
    if (!syncUnlocked) return;
    if (id !== "matchmaking") return;
    if (!lastNotification) return;
    const prefix = "Match found. Host: ";
    if (!lastNotification.startsWith(prefix)) return;
    const hostChainId = lastNotification.slice(prefix.length).trim();
    if (!hostChainId) return;
    let storedName = "";
    try {
      storedName = String(localStorage.getItem(PLAYER_NAME_STORAGE_KEY) || "").trim();
    } catch {
      storedName = "";
    }
    const q = storedName ? `?name=${encodeURIComponent(storedName)}` : "";
    navigate(`/room/${hostChainId}${q}`);
  }, [id, lastNotification, navigate, ready, syncUnlocked]);

  useEffect(() => {
    if (!ready) return;
    if (!syncUnlocked) return;
    if (!id) return;
    if (id === "matchmaking") return;
    if (!chainId) return;

    if (id === chainId) {
      return;
    }

    if (hasJoinedRef.current) return;
    hasJoinedRef.current = true;
    const params = new URLSearchParams(location.search || "");
    let playerName = String(params.get("name") || "").trim();
    if (!playerName) {
      try {
        playerName = String(localStorage.getItem(PLAYER_NAME_STORAGE_KEY) || "").trim();
      } catch {
        playerName = "";
      }
    }
    joinMatch(id, playerName || undefined).catch(() => {
      hasJoinedRef.current = false;
      navigate("/");
    });
  }, [chainId, id, joinMatch, location.search, navigate, ready, syncUnlocked]);

  useEffect(() => {
    if (!ready) return;
    if (id === "matchmaking") return;
    if (!syncUnlocked) return;
    if (resultNavTriggeredRef.current) return;

    const endedByScore = Number(myScore) >= 3 || Number(opponentScore) >= 3;
    const endedByStatus = normalizeEnumKey(game?.status || matchStatus) === "ended";
    const ended = endedByScore || endedByStatus;
    if (!ended) return;

    const round = lastRoundRecord?.round;
    if (round != null && lastAnimatedRoundRef.current !== round) {
      return;
    }

    resultNavTriggeredRef.current = true;
    navigate("/result");
  }, [
    game?.status,
    id,
    lastRoundRecord?.round,
    matchStatus,
    myScore,
    navigate,
    opponentScore,
    ready,
    syncUnlocked,
  ]);

  const performAnimation = async (text) => {
    const timer = (ms) => new Promise((res) => setTimeout(res, ms));
    const token = animationTokenRef.current;

    for (let i = 0; i <= 8; i++) {
      if (animationTokenRef.current !== token) return;
      if (i === 7) {
        setResult({ rotate: 0, show: true, reset: false });
        setResultText(text);
        await timer(2000);
      } else if (i % 2 === 0 && i < 7) {
        setResult({ rotate: 10, show: false, reset: false });
        await timer(200);
      } else if (i === 8) {
        setResult({ rotate: 0, show: false, reset: true });
        setResultText("");
      } else {
        setResult({ rotate: -10, show: false, reset: false });
        await timer(200);
      }
    }

    return Promise.resolve();
  };

  useEffect(() => {
    if (lastRoundRecord?.round == null) return;
    if (lastAnimatedRoundRef.current === lastRoundRecord.round) return;
    lastAnimatedRoundRef.current = lastRoundRecord.round;
    animationTokenRef.current += 1;

    const outcome = normalizeEnumKey(lastRoundRecord.outcome);
    let text = "tie";
    if (outcome === "draw") {
      text = "tie";
    } else if (outcome === "hostwins") {
      text = isHost ? "win" : "lose";
    } else if (outcome === "guestwins") {
      text = isHost ? "lose" : "win";
    }

    const isTerminalByScore = Number(myScore) >= 3 || Number(opponentScore) >= 3;

    (async () => {
      await performAnimation(text);
      if (!isTerminalByScore) return;
      snapshotFinalResult?.({
        matchId: game?.matchId ?? null,
        myScore,
        opponentScore,
      });
      if (resultNavTriggeredRef.current) return;
      resultNavTriggeredRef.current = true;
      navigate("/result");
    })();
  }, [game?.matchId, isHost, lastRoundRecord, myScore, navigate, opponentScore, snapshotFinalResult]);

  if (!ready) {
    return (
      <div className={styles.loading}>
        {initError ? `Linera init error: ${initError}` : "Initializing Linera..."}
      </div>
    );
  }

  if (!syncUnlocked) {
    return <div className={styles.loading}>Syncing chain...</div>;
  }

  return (
    <>
      <div className={styles.container}>
        <div className={styles.vs_container}>
          <PlayerOne result={result} />
          <div className={styles.vs}>VS</div>
          <PlayerTwo result={result} />
        </div>
        {opponentChainId && <Controls />}
        {resultText === "win" && (
          <div className={styles.result_banner} style={{ color: "#00AA00" }}>
            YOU WIN!
          </div>
        )}
        {resultText === "lose" && (
          <div className={styles.result_banner} style={{ color: "#FF4444" }}>
            YOU LOSE!
          </div>
        )}
        {resultText === "tie" && (
          <div className={styles.result_banner} style={{ color: "#FFAA00" }}>
            TIE!
          </div>
        )}
        {!opponentChainId && (
          <div className={styles.waiting}>
            <div className={styles.waiting_text}>Waiting for opponent to join...</div>
            <div className={styles.room_id}>Room ID: {chainId}</div>
          </div>
        )}
      </div>
    </>
  );
};

export default Room;
