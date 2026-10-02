const express = require("express");
const path = require("path");
const cors = require("cors");
const dotenv = require("dotenv");
const crypto = require("crypto");
const session = require("express-session");
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

let serverQueue = [];
let nextRotationAt = Date.now() + 20 * 60 * 1000;

app.use(express.json());

setInterval(() => {
  if (serverQueue.length > 1) {
    serverQueue.push(serverQueue.shift());

    nextRotationAt = Date.now() + 20 * 60 * 1000;

    console.log("🔄 Rotation de la file :", serverQueue[0]?.name);
  }
}, 20 * 60 * 1000);


app.use(
  cors({
    origin: "http://localhost:5173",
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

app.get("/", (req, res) => {
  res.send("🚀 Serveur StreamLaeti OK !");
});

// Début de la connexion Twitch
app.get("/auth/twitch", (req, res) => {
  const state = crypto.randomBytes(32).toString("hex");

  twitchStates.add(state);

  const params = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID,
    redirect_uri: process.env.TWITCH_REDIRECT_URI,
    response_type: "code",
    scope: "user:read:email",
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

    res.redirect("http://localhost:5173");
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
  const remaining = Math.max(
    0,
    Math.ceil((nextRotationAt - Date.now()) / 1000)
  );

  res.json({
    queue: serverQueue,
    remaining,
  });
});
app.use(express.static(path.join(__dirname, "..", "dist")));

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur StreamLaeti lancé sur http://localhost:${PORT}`);
});