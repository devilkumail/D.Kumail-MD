const { Module } = require("../main");

Module(
  {
    pattern: "reload",
    fromMe: true,
    excludeFromCommands: true,
  },
  async (m) => {
    await m.sendReply("_Bot reload ho raha hai..._");
    process.exit(0);
  }
);

Module(
  {
    pattern: "reboot",
    fromMe: true,
    excludeFromCommands: true,
  },
  async (m) => {
    await m.sendReply("_Bot reload ho raha hai..._");
    process.exit(0);
  }
);

Module(
  {
    pattern: "restart",
    fromMe: true,
    desc: "Bot restart karta hai",
    use: "system",
  },
  async (m) => {
    await m.sendReply("_Bot restart ho raha hai..._");
    process.exit(0);
  }
);
