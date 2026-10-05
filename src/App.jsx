import { useEffect, useState } from "react";

const API_URL = "https://streamlaeti.onrender.com";

const streamers = [
  
  { name: "JulieGaming", game: "Valorant", viewers: 2 },
  { name: "DarkNeko", game: "Apex Legends", viewers: 6 },
  { name: "MikaPlay", game: "Call of Duty", viewers: 3 },
  { name: "LunaGame", game: "Fortnite", viewers: 5 },
];

function App() {
  const [timeLeft, setTimeLeft] = useState(20 * 60);
  const [queue, setQueue] = useState(streamers);

  const [twitchUser, setTwitchUser] = useState(null);
  const [liveStatus, setLiveStatus] = useState(null);
const [likes, setLikes] = useState({});
const [likeMessages, setLikeMessages] = useState([]);

const [chatMessages, setChatMessages] = useState([]);
const [chatText, setChatText] = useState("");

useEffect(() => {
  const ref = new URLSearchParams(window.location.search).get("ref");

  if (!ref) return;

  const alreadyCounted = localStorage.getItem(`streamlaeti_ref_counted_${ref}`);

  if (alreadyCounted) return;

  fetch(`${API_URL}/api/referral`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      referrer: ref,
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        localStorage.setItem(`streamlaeti_ref_counted_${ref}`, "true");
      }
    })
    .catch((error) => {
      console.error("Erreur parrainage :", error);
    });
}, []);

const sendChatMessage = async () => {
  if (!chatText.trim()) return;

  try {
    await fetch(`${API_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        message: chatText,
      }),
    });

    setChatText("");
  } catch (error) {
    console.error("Erreur envoi chat :", error);
  }
};

const sendLike = async () => {
  const streamer = queue[0]?.name;
  if (!streamer) return;

  const newCount = (likes[streamer] || 0) + 1;

  setLikes((currentLikes) => ({
    ...currentLikes,
    [streamer]: newCount,
  }));

  try {
    await fetch(`${API_URL}/api/likes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        streamer,
        count: newCount,
      }),
    });
  } catch (error) {
    console.error("Erreur envoi du cœur :", error);
  }
};

useEffect(() => {
  const loadChatMessages = async () => {
    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        credentials: "include",
        cache: "no-store",
      });

      const data = await response.json();

      if (response.ok) {
        setChatMessages(data.messages || []);
      }
    } catch (error) {
      console.error("Erreur récupération chat :", error);
    }
  };

  loadChatMessages();

  const chatInterval = setInterval(loadChatMessages, 2000);

  return () => clearInterval(chatInterval);
}, []);

useEffect(() => {
    const checkTwitchConnection = async () => {
        try {
            const response = await fetch(`${API_URL}/auth/me`, {
                credentials: "include",
                cache: "no-store",
            });

            const data = await response.json();

            if (data.connected) {
                setTwitchUser(data.user);
            }
        } catch (error) {
            console.error("Erreur connexion Twitch :", error);
        }
    };

    checkTwitchConnection();

    const retry = setTimeout(() => {
        checkTwitchConnection();
    }, 1000);

    return () => clearTimeout(retry);
}, []);
useEffect(() => {
  fetch(`${API_URL}/api/queue`, {
    credentials: "include",
  })
    .then((response) => response.json())
    .then((data) => {
      setQueue(data);
    })
    .catch((error) => {
      console.error("Erreur récupération de la file :", error);
    });
}, []);
useEffect(() => {
  const checkQueueLives = async () => {
    const ids = queue
      .map((streamer) => streamer.id)
      .filter(Boolean);

    if (ids.length === 0) return;

    try {
      const response = await fetch(
        `${API_URL}/api/streams?user_ids=${ids.join(",")}`,
        {
          credentials: "include",
        }
      );

      const data = await response.json();

      if (!response.ok) return;

      const liveIds = new Set(
        data.streams.map((stream) => stream.user_id)
      );

      
    } catch (error) {
      console.error(
        "Erreur vérification des streamers :",
        error
      );
    }
  };

  checkQueueLives();

  const interval = setInterval(checkQueueLives, 15000);

  return () => clearInterval(interval);
}, [queue]);
useEffect(() => {
  if (!twitchUser) return;
  if (!liveStatus) return;
  if (liveStatus.live) return;

  setQueue((currentQueue) =>
    currentQueue.filter(
      (streamer) => streamer.id !== twitchUser.id
    )
  );
}, [liveStatus, twitchUser]);
  useEffect(() => {
  const syncQueueStatus = async () => {
    try {
      const response = await fetch(`${API_URL}/api/queue-status`, {
    credentials: "include",
    cache: "no-store",
});

      const data = await response.json();

      if (!response.ok) return;

      setQueue(data.queue);
      setTimeLeft(data.remaining);
    } catch (error) {
      console.error("Erreur synchronisation de la file :", error);
    }
  };

const loadLikeMessages = async () => {
  try {
    const streamer = queue[0]?.name;
    if (!streamer) return;

    const response = await fetch(
      `${API_URL}/api/likes?streamer=${encodeURIComponent(streamer)}`,
      {
        credentials: "include",
        cache: "no-store",
      }
    );

    const data = await response.json();

    if (response.ok) {
      setLikeMessages(data.messages || []);
    }
  } catch (error) {
    console.error("Erreur récupération des cœurs :", error);
  }
};

  syncQueueStatus();

  const interval = setInterval(syncQueueStatus, 1000);
loadLikeMessages();
const likeInterval = setInterval(loadLikeMessages, 1000);

  return () => {
  clearInterval(interval);
  clearInterval(likeInterval);
};
}, []);

  const minutes = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const seconds = String(timeLeft % 60).padStart(2, "0");

  const discoverStreamer = () => {
  const liveStreamers = queue.filter((streamer) => streamer.id);

  if (liveStreamers.length === 0) {
    alert("Aucun streamer en direct à découvrir pour le moment.");
    return;
  }

  const randomStreamer =
    liveStreamers[Math.floor(Math.random() * liveStreamers.length)];

  window.open(
    `https://www.twitch.tv/${randomStreamer.name}`,
    "_blank"
  );
};
  const takePlace = async () => {
    console.log("BOUTON CLIQUÉ");

   if (!twitchUser) {
  alert("Connecte-toi d'abord avec Twitch.");
  return;
}

if (queue.some((streamer) => streamer.name === twitchUser.display_name)) {
  alert("Tu es déjà dans la file !");
  return;
}
const response = await fetch(`${API_URL}/api/live`, {
  credentials: "include",
});

const data = await response.json();

console.log("LIVE VÉRIFIÉ AU CLIC :", data);

if (!response.ok || !data.live) {
  alert("Tu dois être en direct sur Twitch pour prendre une place.");
  return;
}
const newStreamer = {
  id: twitchUser.id,
  name: twitchUser.display_name,
  game: liveStatus?.stream?.game || "En direct",
  viewers: liveStatus?.stream?.viewers || 0,
  title: liveStatus?.stream?.title || "",
};

const queueResponse = await fetch(`${API_URL}/api/queue`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  credentials: "include",
  body: JSON.stringify(newStreamer),
});

const queueData = await queueResponse.json();

if (!queueResponse.ok) {
  alert(queueData.error || "Impossible de rejoindre la file.");
  return;
}

setQueue(queueData.queue);
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.logo}>
            Stream<span>Laeti</span>
          </div>
          <div style={styles.slogan}>
            Chaque streamer mérite sa place. 💜
          </div>
        </div>

        <button
  style={styles.loginButton}
  onClick={() => {
    window.location.href = "https://streamlaeti.onrender.com/auth/twitch";
  }}
>
          {twitchUser
  ? `💜 Connecté : ${twitchUser.display_name}`
  : "🎮 Connexion Twitch"}
        </button>
      </header>

      <main style={styles.main}>
        <section style={styles.hero}>
          <div style={styles.badge}>🚀 DÉCOUVERTE DES PETITS STREAMERS</div>

          <h1 style={styles.title}>
            Fais découvrir ton stream
            <br />
            <span>20 minutes à la fois.</span>
          </h1>

          <p style={styles.description}>
            Une file d'attente simple pour permettre aux streamers
            de se faire découvrir naturellement.
          </p>

          <button onClick={takePlace} style={styles.mainButton}>
            💜 Prendre une place — 20 min
          </button>
        </section>

        <div style={styles.columns}>
          <section style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h2 style={styles.cardTitle}>🌱 File des streamers</h2>
                <p style={styles.cardSubtitle}>
                  Les streamers actuellement en attente
                </p>
              </div>

              <div style={styles.online}>
                ● {queue.length} en file
              </div>
            </div>

            <div style={styles.current}>
              <div style={styles.currentTop}>
                <div>
                  <div style={styles.position}>#1 — EN DIRECT</div>
                  <h3 style={styles.streamerName}>
                    {queue[0]?.name}
                  </h3>
                  <p style={styles.game}>
                    🎮 {queue[0]?.game} · 👀 {queue[0]?.viewers}
                  </p>
                </div>

                <div style={styles.timer}>
                  <small>Temps restant</small>
                  <strong>
                    {minutes}:{seconds}
                  </strong>
                </div>
              </div>

                      {queue[0]?.name && (
            <div style={{
                marginTop: "20px",
                background: "#0b0715",
                borderRadius: "16px",
                overflow: "hidden",
                border: "1px solid rgba(145,70,255,0.35)",
                boxShadow: "0 10px 30px rgba(0,0,0,0.35)"
            }}>
                <div style={{
                    padding: "12px 16px",
                    fontWeight: "700",
                    color: "#ffffff"
                }}>
                    🔴 LIVE DE {queue[0].name}
                </div>

                <iframe
                    src={`https://player.twitch.tv/?channel=${encodeURIComponent(
                        queue[0].name
                    )}&parent=${window.location.hostname}&autoplay=false`}
                    height="480"
                    width="100%"
                    allowFullScreen
                    style={{
                        display: "block",
                        border: "none"
                    }}
                    title={`Live Twitch de ${queue[0].name}`}
                />
            </div>
        )}

              <button
  style={styles.watchButton}
  onClick={() => window.open(`https://www.twitch.tv/${queue[0]?.name}`, "_blank")}
>
  💜 Regarder sur Twitch
</button>

<button
  onClick={sendLike}
>
  ❤️ {likes[queue[0].name] || 0}
</button>

<div
  style={{
    marginTop: "15px",
    padding: "10px",
    border: "1px solid #444",
    borderRadius: "10px",
    maxHeight: "180px",
    overflowY: "auto",
  }}
>
  <strong>💬 Activité</strong>

  {likeMessages.length === 0 ? (
    <div>Aucun cœur pour le moment ❤️</div>
  ) : (
    likeMessages.map((message) => (
      <div key={message.id}>
        ❤️ {message.username} a mis {message.count} cœur
        {message.count > 1 ? "s" : ""}
      </div>
    ))
  )}
</div>

<div
  style={{
    marginTop: "15px",
    padding: "10px",
    border: "1px solid #444",
    borderRadius: "10px",
  }}
>
  <strong>💬 Chat StreamLaeti</strong>

  <div
    style={{
      marginTop: "10px",
      height: "180px",
      overflowY: "auto",
      padding: "8px",
      background: "#111",
      borderRadius: "8px",
    }}
  >
    {chatMessages.length === 0 ? (
      <div style={{ opacity: 0.6 }}>
        Aucun message pour le moment 💬
      </div>
    ) : (
      chatMessages.map((chat) => (
        <div key={chat.id} style={{ marginBottom: "6px" }}>
          <strong>{chat.username} :</strong>{" "}
          {chat.message}
        </div>
      ))
    )}
  </div>

  <div
    style={{
      display: "flex",
      gap: "8px",
      marginTop: "10px",
    }}
  >
    <input
      type="text"
      value={chatText}
      onChange={(e) => setChatText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          sendChatMessage();
        }
      }}
      placeholder="Écris un message..."
      style={{
        flex: 1,
        padding: "8px",
        borderRadius: "8px",
        border: "1px solid #555",
      }}
    />

    <button
      onClick={sendChatMessage}
      style={{
        padding: "8px 12px",
        borderRadius: "8px",
        cursor: "pointer",
      }}
    >
      Envoyer
    </button>
  </div>
</div>

            </div>

            <div style={styles.queueList}>
              {queue.slice(1).map((streamer, index) => (
                <div style={styles.queueItem} key={index}>
                  <div style={styles.number}>
                    #{index + 2}
                  </div>

                  <div style={styles.avatar}>
                    {streamer.name.charAt(0)}
                  </div>

                  <div style={styles.streamerInfo}>
                    <strong>{streamer.name}</strong>
                    <span>
                      🎮 {streamer.game} · 👀 {streamer.viewers}
                    </span>
                  </div>

                  <div style={styles.waiting}>
                    En attente
                  </div>
                </div>
              ))}
            </div>
          </section>

          <aside style={styles.side}>
            <div style={styles.sideCard}>
              <h2>💜 Aider un petit streamer</h2>
              <p>
                Découvre un streamer au hasard dans la file
                et regarde son live si son contenu te plaît.
              </p>

              <button
  style={styles.discoverButton}
  onClick={() => {
    if (queue.length === 0) {
      alert("Aucun streamer n'est disponible.");
      return;
    }

    const streamer = queue[Math.floor(Math.random() * queue.length)];

    window.open(`https://www.twitch.tv/${streamer.name}`, "_blank");
  }}
>
                🎲 Découvrir un streamer
              </button>
            </div>

            <div style={styles.sideCard}>
              <h2>📜 Comment ça marche ?</h2>

              <div style={styles.rule}>
                <b>1</b>
                <span>Connecte ton compte Twitch</span>
              </div>

              <div style={styles.rule}>
                <b>2</b>
                <span>Prends une place dans la file</span>
              </div>

              <div style={styles.rule}>
                <b>3</b>
                <span>Profite de 20 minutes de visibilité</span>
              </div>

              <div style={styles.rule}>
                <b>4</b>
                <span>Les visiteurs choisissent librement les lives</span>
              </div>
            </div>

            <div style={styles.sideCard}>
  <h2>📊 StreamLaeti aujourd'hui</h2>

  <div style={styles.rule}>
    <b>🔴</b>
    <span>Streamers en direct : {queue.filter((streamer) => streamer.id).length}</span>
  </div>

  <div style={styles.rule}>
    <b>👀</b>
    <span>Streamers dans la file : {queue.length}</span>
  </div>

  <div style={styles.rule}>
    <b>❤️</b>
    <span>
      Cœurs envoyés : {Object.values(likes).reduce((total, count) => total + count, 0)}
    </span>
  </div>

  <div style={styles.rule}>
    <b>🎮</b>
    <span>
      Jeux représentés : {new Set(queue.map((streamer) => streamer.game).filter(Boolean)).size}
    </span>
  </div>
</div>

<div
  style={{
    marginTop: "15px",
    padding: "15px",
    borderRadius: "12px",
    background: "rgba(255,255,255,0.08)",
    textAlign: "center",
  }}
>
  <h3>🎁 Parrainage StreamLaeti</h3>

  <p>
    Invite tes amis à découvrir StreamLaeti ❤️
  </p>

  {twitchUser ? (
    <>
      <p>
        Ton lien de parrainage :
      </p>

      <input
        readOnly
        value={`https://streamlaeti.onrender.com/?ref=${encodeURIComponent(
          twitchUser.display_name
        )}`}
        onClick={(e) => e.target.select()}
        style={{
          width: "100%",
          padding: "8px",
          borderRadius: "8px",
          border: "none",
          marginBottom: "8px",
        }}
      />

      <button
        onClick={() => {
          const link = `https://streamlaeti.onrender.com/?ref=${encodeURIComponent(
            twitchUser.display_name
          )}`;

          navigator.clipboard.writeText(link);
          alert("Lien de parrainage copié ❤️");
        }}
        style={{
          padding: "10px 15px",
          borderRadius: "8px",
          border: "none",
          cursor: "pointer",
        }}
      >
        📋 Copier mon lien
      </button>
    </>
  ) : (
    <p>Connecte-toi avec Twitch pour obtenir ton lien de parrainage.</p>
  )}
</div>

            <div style={styles.founder}>
              👑 <strong>Fondatrice — LaLaetii</strong>
              <p>
                StreamLaeti est créé pour aider les petits
                streamers à être découverts.
              </p>
            </div>
          </aside>
        </div>
      </main>

      <footer>
        StreamLaeti 💜 · Chaque streamer mérite sa place.
      </footer>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top, #241044 0%, #0b0715 45%, #07050d 100%)",
    color: "#ffffff",
    fontFamily: "Arial, sans-serif",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "24px 6%",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },

  logo: {
    fontSize: "30px",
    fontWeight: "800",
  },

  slogan: {
    color: "#aaa1bb",
    marginTop: "4px",
    fontSize: "14px",
  },

  loginButton: {
    background: "#9146ff",
    color: "white",
    border: "none",
    padding: "12px 20px",
    borderRadius: "10px",
    fontWeight: "700",
    cursor: "pointer",
  },

  main: {
    width: "88%",
    maxWidth: "1250px",
    margin: "0 auto",
  },

  hero: {
    textAlign: "center",
    padding: "70px 20px 55px",
  },

  badge: {
    display: "inline-block",
    padding: "8px 14px",
    borderRadius: "30px",
    background: "rgba(145,70,255,0.15)",
    color: "#c59aff",
    fontSize: "12px",
    fontWeight: "700",
  },

  title: {
    fontSize: "48px",
    lineHeight: "1.1",
    margin: "22px 0 15px",
  },

  description: {
    color: "#aaa1bb",
    fontSize: "17px",
    maxWidth: "650px",
    margin: "0 auto 28px",
  },

  mainButton: {
    background: "linear-gradient(135deg, #9146ff, #d946ef)",
    color: "white",
    border: "none",
    padding: "16px 28px",
    borderRadius: "12px",
    fontSize: "16px",
    fontWeight: "800",
    cursor: "pointer",
    boxShadow: "0 10px 30px rgba(145,70,255,0.3)",
  },

  columns: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr",
    gap: "22px",
  },

  card: {
    background: "rgba(255,255,255,0.055)",
    border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: "18px",
    padding: "22px",
  },

  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },

  cardTitle: {
    margin: 0,
    fontSize: "22px",
  },

  cardSubtitle: {
    color: "#8e879b",
    marginTop: "6px",
  },

  online: {
    color: "#68e890",
    fontSize: "13px",
  },

  current: {
    marginTop: "20px",
    padding: "22px",
    borderRadius: "15px",
    background: "linear-gradient(135deg, #30145c, #171024)",
    border: "1px solid rgba(145,70,255,0.35)",
  },

  currentTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },

  position: {
    color: "#c59aff",
    fontSize: "12px",
    fontWeight: "800",
  },

  streamerName: {
    fontSize: "25px",
    margin: "8px 0",
  },

  game: {
    color: "#aaa1bb",
  },

  timer: {
    textAlign: "center",
  },

  timerSmall: {
    color: "#aaa1bb",
  },

  timer: {
    textAlign: "center",
  },

  watchButton: {
    width: "100%",
    marginTop: "18px",
    padding: "13px",
    border: "none",
    borderRadius: "9px",
    background: "#ffffff",
    color: "#171020",
    fontWeight: "800",
    cursor: "pointer",
  },

  queueList: {
    marginTop: "15px",
  },

  queueItem: {
    display: "flex",
    alignItems: "center",
    gap: "13px",
    padding: "13px 8px",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
  },

  number: {
    width: "30px",
    color: "#81788e",
    fontWeight: "700",
  },

  avatar: {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#9146ff",
    fontWeight: "800",
  },

  streamerInfo: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
  },

  waiting: {
    color: "#81788e",
    fontSize: "12px",
  },

  side: {
    display: "flex",
    flexDirection: "column",
    gap: "18px",
  },

  sideCard: {
    background: "rgba(255,255,255,0.055)",
    border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: "18px",
    padding: "22px",
  },

  discoverButton: {
    width: "100%",
    padding: "13px",
    marginTop: "10px",
    borderRadius: "9px",
    border: "1px solid #9146ff",
    background: "transparent",
    color: "#c59aff",
    fontWeight: "700",
    cursor: "pointer",
  },

  rule: {
    display: "flex",
    gap: "12px",
    alignItems: "center",
    marginTop: "15px",
    color: "#c5becd",
  },

  founder: {
    padding: "20px",
    borderRadius: "18px",
    background: "linear-gradient(135deg, #25103f, #160c25)",
    border: "1px solid rgba(217,70,239,0.25)",
  },

  footer: {
    textAlign: "center",
    padding: "50px 20px",
    color: "#746b80",
  },
};

export default App;

