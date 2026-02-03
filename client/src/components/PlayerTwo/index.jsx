import { useState, useEffect, useContext, useMemo } from "react";
import { useParams } from "react-router-dom";
import { LineraContext } from "../../context/LineraContext";
import styles from "./styles.module.css";

const PlayerTwo = ({ result }) => {
  const [option, setOption] = useState("stone");
  const [score, setScore] = useState(0);
  const [copied, setCopied] = useState(false);
  const { id } = useParams();
  const { isHost, chainId, game, opponentScore, opponentChainId, lastRoundRecord } =
    useContext(LineraContext);
  const isMatchmaking = id === "matchmaking";

  const opponentName = useMemo(() => {
    const players = game?.players;
    if (!Array.isArray(players) || !players.length) return "Opponent";
    const mine = String(chainId || "");
    const opp = players.find((p) => String(p?.chainId || "") !== mine);
    return String(opp?.name || "Opponent");
  }, [chainId, game?.players]);

  useEffect(() => {
    if (result.show) {
      if (lastRoundRecord) {
        let oppChoiceRaw = isHost ? lastRoundRecord.guestChoice : lastRoundRecord.hostChoice;
        let finalOption = String(oppChoiceRaw).toLowerCase();
        if (finalOption === "rock") finalOption = "stone";
        setOption(finalOption);
      }
      setScore(opponentScore);
    } else if (result.reset) {
      setOption("stone");
    }
  }, [isHost, lastRoundRecord, opponentScore, result]);

  const handleCopyRoomId = async () => {
    const text = String(chainId || "");
    if (!text) return;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const el = document.createElement("textarea");
        el.value = text;
        el.setAttribute("readonly", "");
        el.style.position = "fixed";
        el.style.left = "-9999px";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }

      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  const getIcon = () => {
    switch (option) {
      case "stone":
      case "rock":
        return "🪨";
      case "paper":
        return "📄";
      case "scissors":
        return "✂️";
      default:
        return "🪨";
    }
  };

  return (
    <div className={styles.container}>
      {!opponentChainId && (
        <div className={styles.opponent_container}>
          <div className={styles.opponent_card}>
            <div className={styles.opponent_icon}>👤</div>
          </div>
          <p className={styles.opponent_text}>
            {isMatchmaking ? "Searching opponent..." : "Waiting for opponent connection..."}
          </p>
          {isHost && !isMatchmaking && (
            <div className={styles.room_id}>
              <div className={styles.room_id_header}>
                <span className={styles.room_id_label}>ROOM ID</span>
                <button
                  type="button"
                  className={`${styles.copy_button} ${copied ? styles.copied : ""}`}
                  onClick={handleCopyRoomId}
                  disabled={!chainId}
                  aria-label={copied ? "copied" : "copy room id"}
                  title={copied ? "copied" : "copy"}
                >
                  {copied ? "✓" : "📋"}
                </button>
              </div>
              <span className={styles.room_id_value}>{chainId}</span>
            </div>
          )}
        </div>
      )}
      {opponentChainId && (
        <>
          <div className={styles.player_info}>
            <div className={styles.player_name}>{opponentName}</div>
            <div className={styles.score_display}>
              <span className={styles.score_label}>Score:</span>
              <span className={styles.score_value}>{score}</span>
            </div>
            <div className={styles.star_container}>
              {[...Array(3).keys()].map((index) =>
                index + 1 <= score ? (
                  <span key={index} className={`${styles.star} ${styles.active_star}`}>
                    ⭐
                  </span>
                ) : (
                  <span key={index} className={styles.star}>☆</span>
                )
              )}
            </div>
          </div>
          <div className={styles.choice_display} style={{ transform: `rotate(${result.rotate}deg)` }}>
            <div className={styles.choice_icon}>{getIcon()}</div>
            <div className={styles.choice_label}>{option.charAt(0).toUpperCase() + option.slice(1)}</div>
          </div>
        </>
      )}
    </div>
  );
};

export default PlayerTwo;
