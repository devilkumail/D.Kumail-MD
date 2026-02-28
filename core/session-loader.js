const fs = require("fs");
const path = require("path");

async function preloadDKMLSessions() {
  const sessionEnv = process.env.SESSION || process.env.SESSION_ID || "";
  const sessionUrl = process.env.SESSION_URL || "";
  const sessions = sessionEnv.split(",").map((s) => s.trim()).filter(Boolean);

  const dkmlSessions = sessions.filter((s) => s.startsWith("DKML~"));
  if (dkmlSessions.length === 0) return;

  if (!sessionUrl) {
    console.log("⚠️ SESSION_URL required for DKML~ sessions. Set it to your session generator website URL.");
    return;
  }

  const axios = require("axios");
  const { sequelize } = require("../config");
  const { DataTypes } = require("sequelize");

  const WhatsappSession = sequelize.define("WhatsappSession", {
    sessionId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
    sessionData: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const raw = this.getDataValue("sessionData");
        try { return raw ? JSON.parse(raw) : null; } catch { return null; }
      },
      set(value) {
        try { this.setDataValue("sessionData", value ? JSON.stringify(value) : null); } catch { this.setDataValue("sessionData", null); }
      },
    },
  }, { timestamps: false });

  try {
    await sequelize.authenticate();
    await WhatsappSession.sync();
  } catch (err) {
    console.error("Session loader: DB error:", err.message);
    return;
  }

  for (const fullId of dkmlSessions) {
    const shortId = fullId.replace("DKML~", "");

    const existing = await WhatsappSession.findOne({ where: { sessionId: `creds-${shortId}` } });
    const existing2 = await WhatsappSession.findOne({ where: { sessionId: `${shortId}-creds` } });
    if ((existing && existing.sessionData) || (existing2 && existing2.sessionData)) {
      if (!global.__dkmlSessionCreds) global.__dkmlSessionCreds = {};
      global.__dkmlSessionCreds[shortId] = (existing && existing.sessionData) || existing2.sessionData;
      global.__dkmlSessionCreds["creds"] = global.__dkmlSessionCreds[shortId];
      console.log(`  ✓ Session ${shortId.substring(0, 8)}... already loaded`);
      continue;
    }

    console.log(`  ↓ Downloading session ${shortId.substring(0, 8)}...`);
    try {
      const url = `${sessionUrl.replace(/\/$/, "")}/api/session/${shortId}`;
      const response = await axios.get(url, { timeout: 15000 });

      if (response.data && response.data.data) {
        let rawData;
        if (typeof response.data.data === "string") {
          rawData = JSON.parse(response.data.data);
        } else {
          rawData = response.data.data;
        }

        if (rawData.creds) {
          const credsData = rawData.creds;

          await WhatsappSession.upsert({ sessionId: `creds-${shortId}`, sessionData: credsData });
          await WhatsappSession.upsert({ sessionId: `${shortId}-creds`, sessionData: credsData });
          await WhatsappSession.upsert({ sessionId: `creds`, sessionData: credsData });

          let extraCount = 0;
          for (const [key, value] of Object.entries(rawData)) {
            if (key === "creds") continue;
            await WhatsappSession.upsert({ sessionId: key, sessionData: value });
            await WhatsappSession.upsert({ sessionId: `${key}-${shortId}`, sessionData: value });
            await WhatsappSession.upsert({ sessionId: `${shortId}-${key}`, sessionData: value });
            extraCount++;
          }

          if (!global.__dkmlSessionCreds) global.__dkmlSessionCreds = {};
          global.__dkmlSessionCreds[shortId] = credsData;
          global.__dkmlSessionCreds["creds"] = credsData;

          console.log(`  ✓ Session ${shortId.substring(0, 8)}... downloaded & saved (creds + ${extraCount} auth files)`);
        } else {
          await WhatsappSession.upsert({ sessionId: `creds-${shortId}`, sessionData: rawData });
          await WhatsappSession.upsert({ sessionId: `${shortId}-creds`, sessionData: rawData });
          await WhatsappSession.upsert({ sessionId: `creds`, sessionData: rawData });

          if (!global.__dkmlSessionCreds) global.__dkmlSessionCreds = {};
          global.__dkmlSessionCreds[shortId] = rawData;
          global.__dkmlSessionCreds["creds"] = rawData;

          console.log(`  ✓ Session ${shortId.substring(0, 8)}... downloaded & saved (legacy creds-only format)`);
        }
      } else {
        console.error(`  ✗ Session ${shortId.substring(0, 8)}... not found on server`);
      }
    } catch (err) {
      if (err.response?.status === 404) {
        console.error(`  ✗ Session ${shortId.substring(0, 8)}... not found or expired. Generate a new one.`);
      } else {
        console.error(`  ✗ Session ${shortId.substring(0, 8)}... download failed: ${err.message}`);
      }
    }
  }
}

module.exports = { preloadDKMLSessions };
