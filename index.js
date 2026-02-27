const path = require("path");
const fs = require("fs");
if (fs.existsSync("./config.env")) {
  require("dotenv").config({ path: "./config.env" });
}

const { suppressLibsignalLogs } = require("./core/helpers");

suppressLibsignalLogs();

const { initializeDatabase } = require("./core/database");
const { BotManager } = require("./core/manager");
const config = require("./config");
const { SESSION, logger } = config;
const http = require("http");
const {
  ensureTempDir,
  TEMP_DIR,
  initializeKickBot,
  cleanupKickBot,
} = require("./core/helpers");

async function main() {
  ensureTempDir();
  logger.info(`Created temporary directory at ${TEMP_DIR}`);
  console.log(`D.Kumail MD v${require("./package.json").version}`);
  console.log(`- Configured sessions: ${SESSION.join(", ")}`);
  logger.info(`Configured sessions: ${SESSION.join(", ")}`);
  if (SESSION.length === 0) {
    const warnMsg =
      "⚠️ No sessions configured. Please set SESSION environment variable.";
    console.warn(warnMsg);
    logger.warn(warnMsg);
    return;
  }

  try {
    const { preloadDKMLSessions } = require("./core/session-loader");
    await preloadDKMLSessions();
  } catch (err) {
    console.log("Session pre-loader:", err.message);
  }

  try {
    await initializeDatabase();
    console.log("- Database initialized");
    logger.info("Database initialized successfully.");
  } catch (dbError) {
    console.error(
      "🚫 Failed to initialize database or load configuration. Bot cannot start.",
      dbError
    );
    logger.fatal(
      "🚫 Failed to initialize database or load configuration. Bot cannot start.",
      dbError
    );
    process.exit(1);
  }

  const botManager = new BotManager();

  const shutdownHandler = async (signal) => {
    console.log(`\nReceived ${signal}, shutting down...`);
    logger.info(`Received ${signal}, shutting down...`);
    cleanupKickBot();
    await botManager.shutdown();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdownHandler("SIGINT"));
  process.on("SIGTERM", () => shutdownHandler("SIGTERM"));

  await botManager.initializeBots();
  console.log("- Bot initialization complete.");
  logger.info("Bot initialization complete");

  const sendDeployMessage = async () => {
    try {
      const sudoNumbers = (config.SUDO || "").split(",").map(n => n.trim()).filter(Boolean);
      if (sudoNumbers.length === 0) return;

      await new Promise(resolve => setTimeout(resolve, 10000));

      for (const [sessionId, bot] of botManager.bots.entries()) {
        if (bot.sock) {
          for (const num of sudoNumbers) {
            const jid = num.includes("@") ? num : `${num}@s.whatsapp.net`;
            try {
              await bot.sock.sendMessage(jid, {
                text: `✅ *D.Kumail MD Bot Successfully Deployed!*\n\n_Bot is now online and ready._\n\nType *.menu* to get started.`
              });
              logger.info(`Deploy success message sent to ${num}`);
            } catch (err) {
              logger.error(`Failed to send deploy message to ${num}: ${err.message}`);
            }
          }
        }
      }
    } catch (err) {
      logger.error("Deploy message error:", err.message);
    }
  };

  sendDeployMessage();

  initializeKickBot();

  const startServer = () => {
    const PORT = process.env.PORT || 3000;

    const server = http.createServer((req, res) => {
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("OK");
      } else {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("D.Kumail MD Bot is running!");
      }
    });

    server.listen(PORT, () => {
      logger.info(`Web server listening on port ${PORT}`);
    });
  };

  if (process.env.USE_SERVER !== "false") startServer();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Fatal error in main execution: ${error.message}`, error);
    logger.fatal({ err: error }, `Fatal error in main execution`);
    process.exit(1);
  });
}
