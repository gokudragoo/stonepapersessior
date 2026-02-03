import { useContext, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../../components/Button";
import { LineraContext } from "../../context/LineraContext";
import styles from "./styles.module.css";

const PLAYER_NAME_STORAGE_KEY = "sps_player_name";

const Home = () => {
  const navigate = useNavigate();
  const { ready, initError, chainId, createMatch, searchPlayer } = useContext(LineraContext);
  const [friendMenuOpen, setFriendMenuOpen] = useState(false);
  const [hostChainIdInput, setHostChainIdInput] = useState("");
  const [playerName, setPlayerName] = useState(() => {
    try {
      return localStorage.getItem(PLAYER_NAME_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });

  const normalizedPlayerName = useMemo(
    () => String(playerName || "").trim(),
    [playerName]
  );

  const normalizedHostChainId = useMemo(
    () => String(hostChainIdInput || "").trim(),
    [hostChainIdInput]
  );

  const canJoin = useMemo(() => {
    if (!ready) return false;
    if (!normalizedHostChainId) return false;
    if (normalizedHostChainId === "matchmaking") return false;
    return true;
  }, [normalizedHostChainId, ready]);

  const canOpenMenus = normalizedPlayerName.length > 0;

  return (
    <>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Stone Paper Scissors</h1>
          <p className={styles.subtitle}>On-Chain Game on Linera</p>
        </div>

        <div className={styles.content}>
          <div className={styles.name_block}>
            <input
              className={styles.input}
              value={playerName}
              onChange={(e) => {
                const next = e.target.value;
                setPlayerName(next);
                try {
                  localStorage.setItem(PLAYER_NAME_STORAGE_KEY, next);
                } catch { }
              }}
              placeholder="Enter your name"
            />
          </div>

          <div className={styles.btn_container}>
            <Button
              name="Play with Friend"
              type="friend"
              disabled={!canOpenMenus}
              onClick={() => setFriendMenuOpen(true)}
            />
            <Button
              name="Play with Stranger"
              type="stranger"
              disabled={!canOpenMenus || !ready}
              onClick={async () => {
                await searchPlayer(normalizedPlayerName || undefined);
                navigate(`/room/matchmaking`);
              }}
            />
          </div>
        </div>
      </div>

      {friendMenuOpen && (
        <div
          className={styles.modal_backdrop}
          onClick={() => setFriendMenuOpen(false)}
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modal_header}>
              <div className={styles.modal_title}>PLAY WITH FRIEND</div>
              <button
                className={styles.modal_close}
                type="button"
                onClick={() => setFriendMenuOpen(false)}
              >
                ✕
              </button>
            </div>

            {!ready && (
              <div className={styles.modal_hint}>
                {initError ? `Linera init error: ${initError}` : "Initializing Linera..."}
              </div>
            )}

            {ready && (
              <>
                <div className={styles.section}>
                  <div className={styles.section_title}>CREATE ROOM</div>
                  <div className={styles.section_hint}>
                    Your room id: <span className={styles.mono}>{chainId}</span>
                  </div>
                  <Button
                    name="Create Room"
                    onClick={async () => {
                      await createMatch(normalizedPlayerName);
                      setFriendMenuOpen(false);
                      navigate(`/room/${chainId}`);
                    }}
                  />
                </div>

                <div className={styles.divider} />

                <div className={styles.section}>
                  <div className={styles.section_title}>JOIN ROOM</div>
                  <div className={styles.section_hint}>
                    Enter host room id and join.
                  </div>
                  <input
                    className={styles.input}
                    value={hostChainIdInput}
                    onChange={(e) => setHostChainIdInput(e.target.value)}
                    placeholder="Host chain id"
                  />
                  <Button
                    name="Join Room"
                    disabled={!canJoin}
                    onClick={() => {
                      if (!canJoin) return;
                      setFriendMenuOpen(false);
                      const name = normalizedPlayerName;
                      const q = name ? `?name=${encodeURIComponent(name)}` : "";
                      navigate(`/room/${normalizedHostChainId}${q}`);
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default Home;
