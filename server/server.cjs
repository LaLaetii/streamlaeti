const express = require("express");
const path = require("path");
const cors = require("cors");
const dotenv = require("dotenv");
const crypto = require("crypto");
const session = require("express-session");
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

let serverQueue = [
  { id: "juliegaming", name: "JulieGaming", game: "Valorant", viewers: 2 },
  { id: "darkneko", name: "DarkNeko", game: "Apex Legends", viewers: 6 },
  { id: "mikaplay", name: "MikaPlay", game: "Call of Duty", viewers: 3 },
  { id: "lunagame", name: "LunaGame", game: "Fortnite", viewers: 5 }
];
let nextRotationAt = null;
let rotationTimer = null;

let referrals = {};

app.use(express.json());

app.post("/api/referral", (req, res) => {
  const { referrer } = req.body;

  if (!referrer) {
    return res.status(400).json({ error: "Parrain invalide" });
  }

  referrals[referrer] = (referrals[referrer] || 0) + 1;

  res.json({
    success: true,
    referrals: referrals[referrer],
  });
});

app.get("/api/referral/:referrer", (req, res) => {
  const { referrer } = req.params;

  res.json({
    referrals: referrals[referrer] || 0,
  });
});

function startRotationTimer() {
    if (rotationTimer) {
        clearTimeout(rotationTimer);
    }

    nextRotationAt = Date.now() + 20 * 60 * 1000;

    rotationTimer = setTimeout(() => {
        if (serverQueue.length > 1) {
            serverQueue.push(serverQueue.shift());

            console.log(
                "🔄 Rotation immédiate de la file :",
                serverQueue[0]?.name
            );

            startRotationTimer();
        } else {
            rotationTimer = null;
            nextRotationAt = null;
        }
    }, 20 * 60 * 1000);
}

startRotationTimer();

app.use(
  cors({
    origin: [
  "https://streamlaeti.onrender.com",
  "http://localhost:5173",
  "http://localhost:5174"
],
    credentials: true,
  })
);

app.use(
  session({
    secret: process.env.TWITCH_CLIENT_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax"
    }
  })
);
const twitchStates = new Set();

// Page de test du serveur
app.get("/api/queue", (req, res) => {
  res.json(serverQueue);
});

app.post("/api/queue", (req, res) => {
  const streamer = req.body;

  if (!streamer?.id) {
    return res.status(400).json({ error: "Streamer invalide" });
  }

  if (serverQueue.some((item) => item.id === streamer.id)) {
    return res.status(409).json({ error: "Déjà dans la file" });
  }

  serverQueue.push(streamer);

  if (serverQueue.length === 1) {
    startRotationTimer();
}

  res.json({
    success: true,
    queue: serverQueue,
  });
});

app.delete("/api/queue/:id", (req, res) => {
  const { id } = req.params;

  serverQueue = serverQueue.filter((streamer) => streamer.id !== id);

  res.json({
    success: true,
    queue: serverQueue,
  });
});



// Début de la connexion Twitch
app.get("/auth/twitch", (req, res) => {
  const state = crypto.randomBytes(32).toString("hex");

  twitchStates.add(state);

  const params = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID,
    redirect_uri: process.env.TWITCH_REDIRECT_URI,
    response_type: "code",
    scope: "user:read:email user:write:chat",
    state,
  });

  res.redirect(
    `https://id.twitch.tv/oauth2/authorize?${params.toString()}`
  );
});

// Retour de Twitch après connexion
app.get("/auth/twitch/callback", async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state || !twitchStates.has(state)) {
    return res.status(400).send("❌ Connexion Twitch invalide.");
  }

  twitchStates.delete(state);

  try {
    // Récupération du token Twitch
    const tokenResponse = await fetch(
      "https://id.twitch.tv/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: process.env.TWITCH_CLIENT_ID,
          client_secret: process.env.TWITCH_CLIENT_SECRET,
          code,
          grant_type: "authorization_code",
          redirect_uri: process.env.TWITCH_REDIRECT_URI,
        }),
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error(tokenData);
      return res.status(500).send("❌ Impossible de récupérer le token Twitch.");
    }

    // Récupération du compte Twitch connecté
    const userResponse = await fetch(
      "https://api.twitch.tv/helix/users",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "Client-Id": process.env.TWITCH_CLIENT_ID,
        },
      }
    );

    const userData = await userResponse.json();

    if (!userResponse.ok || !userData.data?.length) {
      console.error(userData);
      return res.status(500).send("❌ Impossible de récupérer ton compte Twitch.");
    }

    const user = userData.data[0];

    req.session.user = user;
    req.session.accessToken = tokenData.access_token;

    req.session.save((err) => {
    if (err) {
        console.error("Erreur sauvegarde session :", err);
        return res.status(500).send("Erreur de session.");
    }

    res.redirect("https://streamlaeti.onrender.com");
});
  } catch (error) {
    console.error(error);
    res.status(500).send("❌ Une erreur est survenue.");
  }
});

app.get("/auth/me", (req, res) => {
  if (!req.session.user) {
    return res.json({ connected: false });
  }

  res.json({
    connected: true,
    user: req.session.user
  });
});
app.get("/api/live", async (req, res) => {
  if (!req.session.user || !req.session.accessToken) {
    return res.status(401).json({
      connected: false,
      live: false,
    });
  }

  try {
    const response = await fetch(
      `https://api.twitch.tv/helix/streams?user_id=${req.session.user.id}`,
      {
        headers: {
          Authorization: `Bearer ${req.session.accessToken}`,
          "Client-Id": process.env.TWITCH_CLIENT_ID,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(data);
      return res.status(500).json({
        connected: true,
        live: false,
      });
    }

    if (data.data.length === 0) {
      return res.json({
        connected: true,
        live: false,
      });
    }

    const stream = data.data[0];

    res.json({
      connected: true,
      live: true,
      stream: {
        game: stream.game_name,
        title: stream.title,
        viewers: stream.viewer_count,
        startedAt: stream.started_at,
      },
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      connected: true,
      live: false,
    });
  }
});
app.get("/api/streams", async (req, res) => {
  if (!req.session.accessToken) {
    return res.status(401).json({
      connected: false,
      streams: [],
    });
  }

  const userIds = req.query.user_ids;

  if (!userIds) {
    return res.json({
      connected: true,
      streams: [],
    });
  }

  try {
    const ids = userIds.split(",");

    const params = new URLSearchParams();

    ids.forEach((id) => {
      params.append("user_id", id);
    });

    const response = await fetch(
      `https://api.twitch.tv/helix/streams?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${req.session.accessToken}`,
          "Client-Id": process.env.TWITCH_CLIENT_ID,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(data);
      return res.status(500).json({
        connected: true,
        streams: [],
      });
    }

    res.json({
      connected: true,
      streams: data.data,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      connected: true,
      streams: [],
    });
  }
});
app.get("/api/queue-status", (req, res) => {
  const remaining = nextRotationAt
    ? Math.max(0, Math.ceil((nextRotationAt - Date.now()) / 1000))
    : 0;

  res.json({
    queue: serverQueue,
    remaining,
  });
});
let likeMessages = [];

app.post("/api/likes", (req, res) => {
  const { streamer, count } = req.body;

  if (!streamer) {
    return res.status(400).json({ error: "Streamer manquant" });
  }

  const username = req.session.user?.display_name || "Un visiteur";
  const heartCount = Number(count) || 1;

  likeMessages.unshift({
    id: Date.now() + Math.random(),
    username,
    streamer,
    count: heartCount,
  });

  likeMessages = likeMessages.slice(0, 30);

  res.json({ success: true });
});

app.get("/api/likes", (req, res) => {
  const streamer = req.query.streamer;

  const messages = streamer
    ? likeMessages.filter((message) => message.streamer === streamer)
    : likeMessages;

  res.json({ messages });
});
// ==================== CHAT STREAMLAETI ====================

let chatMessages = [];

app.post("/api/chat", (req, res) => {
  const { message } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: "Message vide" });
  }

  const username = req.session.user?.display_name || "Visiteur";

  chatMessages.push({
    id: Date.now() + Math.random(),
    username,
    message: message.trim(),
  });

  // On garde seulement les 100 derniers messages
  chatMessages = chatMessages.slice(-100);

  res.json({ success: true });
});

app.get("/api/chat", (req, res) => {
  res.json({ messages: chatMessages });
});
app.use(express.static(path.join(__dirname, "..", "dist")));

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur StreamLaeti lancé sur http://localhost:${PORT}`);
});