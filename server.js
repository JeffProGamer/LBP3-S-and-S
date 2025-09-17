// server.js
const express = require("express");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
const session = require("express-session");
const passport = require("passport");
const { Strategy: OAuth2Strategy } = require("passport-oauth2");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

// ---------- Session & Passport ----------
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new OAuth2Strategy({
    authorizationURL: "https://apis.roblox.com/oauth/v1/authorize",
    tokenURL: "https://apis.roblox.com/oauth/v1/token",
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: process.env.REDIRECT_URI,
    scope: ["openid", "profile"]
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Get authenticated user info from Roblox
      const res = await fetch("https://users.roblox.com/v1/users/authenticated", {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      const data = await res.json();
      return done(null, { accessToken, robloxId: data.id, username: data.name });
    } catch (err) {
      return done(err);
    }
  }
));

// ---------- Data persistence ----------
const DATA_FILE = path.join(__dirname, "data.json");

function loadData() {
  return fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE)) : { users: {} };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ---------- Middleware ----------
function requireLogin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Login required" });
  next();
}

// ---------- Routes ----------

// OAuth routes
app.get("/auth/login", passport.authenticate("oauth2"));
app.get("/auth/callback",
  passport.authenticate("oauth2", { failureRedirect: "/" }),
  (req, res) => res.redirect("/")
);

// Serve main page
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

// Get user data
app.get("/api/user", requireLogin, (req, res) => {
  const db = loadData();
  const userId = req.user.robloxId.toString();
  if (!db.users[userId]) {
    db.users[userId] = {
      hearted: [],
      queue: [],
      profile: {
        name: req.user.username,
        avatar: `https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=150&height=150&format=png`
      },
      robloxId: userId
    };
    saveData(db);
  }
  res.json(db.users[userId]);
});

// Get Roblox game levels
const UNIVERSE_ID = "6742973974"; // replace with your universe ID

app.get("/api/levels", async (req, res) => {
  try {
    const robloxRes = await fetch(`https://games.roblox.com/v1/games?universeIds=${UNIVERSE_ID}`);
    const data = await robloxRes.json();
    if (!data.data || data.data.length === 0) return res.json([]);
    const game = data.data[0];
    res.json([{
      id: game.placeId.toString(),
      name: game.name,
      visits: game.visits,
      playing: game.playing,
      hearts: game.favoriteCount
    }]);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch levels" });
  }
});

// Heart a level
app.post("/api/heart/:id", requireLogin, (req, res) => {
  const db = loadData();
  const userId = req.user.robloxId.toString();
  if (!db.users[userId]) db.users[userId] = { hearted: [], queue: [], profile: {}, robloxId: userId };
  if (!db.users[userId].hearted.includes(req.params.id)) {
    db.users[userId].hearted.push(req.params.id);
    saveData(db);
  }
  res.json({ success: true });
});

// Queue a level
app.post("/api/queue/:id", requireLogin, (req, res) => {
  const db = loadData();
  const userId = req.user.robloxId.toString();
  if (!db.users[userId]) db.users[userId] = { hearted: [], queue: [], profile: {}, robloxId: userId };
  if (!db.users[userId].queue.includes(req.params.id)) {
    db.users[userId].queue.push(req.params.id);
    saveData(db);
  }
  res.json({ success: true });
});

// Update profile
app.post("/api/profile", requireLogin, (req, res) => {
  const db = loadData();
  const userId = req.user.robloxId.toString();
  if (!db.users[userId]) db.users[userId] = { hearted: [], queue: [], profile: {}, robloxId: userId };
  db.users[userId].profile = req.body;
  saveData(db);
  res.json({ success: true });
});

// Logout
app.get("/auth/logout", (req, res) => {
  req.logout(() => {
    res.redirect("/");
  });
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
