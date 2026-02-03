import { useState, useContext, useEffect } from "react";
import { LineraContext } from "../../context/LineraContext";
import styles from "./styles.module.css";

function Controls() {
  const [option, setOption] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { myReady, myChoice, pickAndReady } = useContext(LineraContext);

  useEffect(() => {
    if (myReady && myChoice) {
      setOption(String(myChoice).toLowerCase());
      return;
    }
    if (!myReady) {
      setOption("");
      setSubmitting(false);
    }
  }, [myChoice, myReady]);

  const handleChange = async (value) => {
    if (submitting || myReady) return;
    setSubmitting(true);
    setOption(value);
    try {
      await pickAndReady(value);
    } catch (e) {
      setSubmitting(false);
      setOption("");
    }
  };

  return (
    <div className={styles.container}>
      <button
        disabled={myReady || submitting}
        className={
          option === "stone" || option === "rock"
            ? `${styles.option_btn} ${styles.option_btn_active}`
            : styles.option_btn
        }
        onClick={() => handleChange("stone")}
      >
        <div className={styles.option_icon}>🪨</div>
        <div className={styles.option_label}>Stone</div>
      </button>
      <button
        disabled={myReady || submitting}
        className={
          option === "paper"
            ? `${styles.option_btn} ${styles.option_btn_active}`
            : styles.option_btn
        }
        onClick={() => handleChange("paper")}
      >
        <div className={styles.option_icon}>📄</div>
        <div className={styles.option_label}>Paper</div>
      </button>
      <button
        disabled={myReady || submitting}
        className={
          option === "scissors"
            ? `${styles.option_btn} ${styles.option_btn_active}`
            : styles.option_btn
        }
        onClick={() => handleChange("scissors")}
      >
        <div className={styles.option_icon}>✂️</div>
        <div className={styles.option_label}>Scissors</div>
      </button>
    </div>
  );
}

export default Controls;
