import { useEffect, useState, useContext, useMemo } from "react";
import { LineraContext } from "../../context/LineraContext";
import styles from "./styles.module.css";

const PlayerOne = ({ result }) => {
  const [option, setOption] = useState("stone");
  const [score, setScore] = useState(0);
  const { isHost, chainId, game, myScore, lastRoundRecord } = useContext(LineraContext);

  const myName = useMemo(() => {
    const players = game?.players;
    if (!Array.isArray(players) || !players.length) return "You";
    const mine = String(chainId || "");
    const me = players.find((p) => String(p?.chainId || "") === mine);
    return String(me?.name || "You");
  }, [chainId, game?.players]);

  useEffect(() => {
    if (result.show) {
      if (lastRoundRecord) {
        let myChoiceRaw = isHost ? lastRoundRecord.hostChoice : lastRoundRecord.guestChoice;
        let finalOption = String(myChoiceRaw).toLowerCase();
        if (finalOption === "rock") finalOption = "stone";
        setOption(finalOption);
      }
      setScore(myScore);
    } else if (result.reset) {
      setOption("stone");
    }
  }, [isHost, lastRoundRecord, myScore, result]);

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
      <div className={styles.player_info}>
        <div className={styles.player_name}>{myName}</div>
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
    </div>
  );
};

export default PlayerOne;
