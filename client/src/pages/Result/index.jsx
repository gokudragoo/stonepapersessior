import { useMemo, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { LineraContext } from "../../context/LineraContext";
import Button from "../../components/Button";
import styles from "./styles.module.css";

const Result = () => {
  const navigate = useNavigate();
  const { ready, finalResult, myScore, opponentScore, leaveMatch } = useContext(LineraContext);

  const derivedScores = useMemo(() => {
    if (finalResult && (Number(finalResult.myScore) >= 3 || Number(finalResult.opponentScore) >= 3)) {
      return { mine: Number(finalResult.myScore ?? 0), opp: Number(finalResult.opponentScore ?? 0) };
    }
    return { mine: Number(myScore ?? 0), opp: Number(opponentScore ?? 0) };
  }, [finalResult, myScore, opponentScore]);

  const didWin = useMemo(() => {
    return derivedScores.mine >= 3;
  }, [derivedScores.mine]);

  if (!ready) {
    return (
      <div className={styles.loading}>
        Loading...
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.result_card}>
        <div className={styles.title}>
          {didWin ? "🎉 YOU WIN! 🎉" : "😔 YOU LOSE 😔"}
        </div>
        <div className={styles.scores}>
          <div className={styles.score_item}>
            <div className={styles.score_label}>Your Score</div>
            <div className={styles.score_value}>{derivedScores.mine}</div>
          </div>
          <div className={styles.score_separator}>-</div>
          <div className={styles.score_item}>
            <div className={styles.score_label}>Opponent Score</div>
            <div className={styles.score_value}>{derivedScores.opp}</div>
          </div>
        </div>
        <div className={styles.btn_container}>
          <Button
            name="Back to Lobby"
            onClick={async () => {
              try {
                await leaveMatch();
              } finally {
                navigate("/");
              }
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default Result;
