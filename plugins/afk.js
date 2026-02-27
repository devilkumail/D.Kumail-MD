const { Module } = require("../main");
const { isAdmin } = require("./utils");
const { ADMIN_ACCESS } = require("../config");
const config = require("../config");
const { setVar, getVar, delVar } = require("./manage");

const afkCache = new Map();

async function initAFKCache() {
  try {
    const afkData = config.AFK_DATA || "{}";
    const afkUsers = JSON.parse(afkData);

    for (const [userJid, userData] of Object.entries(afkUsers)) {
      afkCache.set(userJid, {
        reason: userData.reason,
        setAt: new Date(userData.setAt),
        lastSeen: new Date(userData.lastSeen),
        messageCount: userData.messageCount || 0,
      });
    }
  } catch (error) {
    console.error("Error initializing AFK cache:", error);

    if (!config.AFK_DATA) {
      await setVar("AFK_DATA", "{}");
    }
  }
}

initAFKCache();

function timeSince(date) {
  if (!date) return "Kabhi nahi";
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) {
    return (
      Math.floor(interval) +
      " saal" +
      "" +
      " pehle"
    );
  }
  interval = seconds / 2592000;
  if (interval > 1) {
    return (
      Math.floor(interval) +
      " maheene" +
      "" +
      " pehle"
    );
  }
  interval = seconds / 86400;
  if (interval > 1) {
    return (
      Math.floor(interval) +
      " din" +
      "" +
      " pehle"
    );
  }
  interval = seconds / 3600;
  if (interval > 1) {
    return (
      Math.floor(interval) +
      " ghante" +
      "" +
      " pehle"
    );
  }
  interval = seconds / 60;
  if (interval > 1) {
    return (
      Math.floor(interval) +
      " minute" +
      "" +
      " pehle"
    );
  }
  return (
    Math.floor(seconds) +
    " second" +
    "" +
    " pehle"
  );
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

async function saveAFKData() {
  try {
    const afkData = {};
    for (const [userJid, userData] of afkCache.entries()) {
      afkData[userJid] = {
        reason: userData.reason,
        setAt: userData.setAt.toISOString(),
        lastSeen: userData.lastSeen.toISOString(),
        messageCount: userData.messageCount,
      };
    }
    await setVar("AFK_DATA", JSON.stringify(afkData));
  } catch (error) {
    console.error("Error saving AFK data:", error);
  }
}

async function setAFK(userJid, reason = "Main abhi keyboard se door hoon") {
  const now = new Date();
  const afkData = {
    reason: reason,
    setAt: now,
    lastSeen: now,
    messageCount: 0,
  };

  afkCache.set(userJid, afkData);

  await saveAFKData();
}

async function removeAFK(userJid) {
  const afkData = afkCache.get(userJid);
  afkCache.delete(userJid);

  await saveAFKData();

  return afkData;
}

async function updateLastSeen(userJid) {
  const afkData = afkCache.get(userJid);
  if (afkData) {
    afkData.lastSeen = new Date();

    await saveAFKData();
  }
}

async function incrementMessageCount(userJid) {
  const afkData = afkCache.get(userJid);
  if (afkData) {
    afkData.messageCount++;

    await saveAFKData();
  }
}

function isAFK(userJid) {
  return afkCache.has(userJid);
}

function getAFKData(userJid) {
  return afkCache.get(userJid);
}

Module(
  {
    pattern: "afk ?(.*)",
    fromMe: true,
    desc: "Apko AFK karta hai - Keyboard se door",
    usage:
      ".afk [wajah] - _AFK set karo_\n.afk - _Current status dekho_\n.afk list - _Sab AFK users dekho_",
  },
  async (message, match) => {
    const userJid = message.sender;
    const input = match[1]?.trim();

    if (input?.toLowerCase() === "list") {
      if (afkCache.size === 0) {
        return await message.sendReply("_Koi user abhi AFK nahi hai._");
      }

      let afkList = `*_🌙 AFK Users ki List (${afkCache.size})_*\n\n`;
      let count = 1;

      for (const [jid, data] of afkCache.entries()) {
        const timeAFK = formatDuration(
          Date.now() - new Date(data.setAt).getTime()
        );
        const lastSeen = timeSince(data.lastSeen);
        afkList += `${count}. @${jid.split("@")[0]}\n`;
        afkList += `   📝 _Wajah:_ \`${data.reason}\`\n`;
        afkList += `   ⏰ _AFK kitni der se:_ \`${timeAFK}\`\n`;
        afkList += `   👁️ _Aakhri baar dekha:_ \`${lastSeen}\`\n`;
        afkList += `   💬 _Messages aaye:_ \`${data.messageCount}\`\n\n`;
        count++;
      }

      return await message.sendMessage(afkList, "text", {
        mentions: Array.from(afkCache.keys()),
      });
    }

    if (isAFK(userJid)) {
      if (!input) {
        const afkData = getAFKData(userJid);
        const timeAFK = formatDuration(
          Date.now() - new Date(afkData.setAt).getTime()
        );
        const lastSeen = timeSince(afkData.lastSeen);

        return await message.sendReply(
          `*_🌙 Aap abhi AFK ho_*\n\n` +
            `📝 _Wajah:_ \`${afkData.reason}\`\n` +
            `⏰ _AFK kitni der se:_ \`${timeAFK}\`\n` +
            `👁️ _Aakhri baar dekha:_ \`${lastSeen}\`\n` +
            `💬 _Messages aaye:_ \`${afkData.messageCount}\`\n\n` +
            `_Koi bhi message likh ke wapas online ho jao._`
        );
      } else {
        await setAFK(userJid, input);
        return await message.sendReply(
          `*_🌙 AFK wajah update ho gayi_*\n\n` +
            `📝 _Nayi wajah:_ \`${input}\`\n\n` +
            `_Jab koi message ya mention karega toh auto-reply jayega._`
        );
      }
    } else {
      const reason = input || "Main abhi keyboard se door hoon";
      await setAFK(userJid, reason);

      return await message.sendReply(
        `*_🌙 Aap ab AFK ho_*\n\n` +
          `📝 _Wajah:_ \`${reason}\`\n` +
          `⏰ _Kab se:_ \`${new Date().toLocaleTimeString()}\`\n\n` +
          `_Jab koi message ya mention karega toh auto-reply jayega._\n` +
          `_Koi bhi message likh ke wapas online ho jao._`
      );
    }
  }
);

Module(
  {
    on: "message",
    fromMe: false,
  },
  async (message) => {
    try {
      const senderJid = message.sender;
      const chatJid = message.jid;
      const isGroup = message.isGroup;
      const isDM = !isGroup;

      if (isAFK(senderJid)) {
        const afkData = await removeAFK(senderJid);
        if (afkData) {
          const timeAFK = formatDuration(
            Date.now() - new Date(afkData.setAt).getTime()
          );
          const welcomeBack =
            `*_🌅 Wapas aaye ho!_*\n\n` +
            `⏰ _AFK the:_ \`${timeAFK}\`\n` +
            `💬 _Messages aaye:_ \`${afkData.messageCount}\`\n` +
            `📝 _Wajah thi:_ ${afkData.reason}`;

          await message.sendReply(welcomeBack);
        }
        return;
      }

      if (message.reply_message && message.reply_message.text) {
        const repliedText = message.reply_message.text.toLowerCase();
        if (
          repliedText.includes("is currently afk") ||
          repliedText.includes("🌙")
        ) {
          return;
        }
      }

      if (isGroup && message.mention && message.mention.length > 0) {
        for (const mentionedJid of message.mention) {
          if (isAFK(mentionedJid)) {
            const afkData = getAFKData(mentionedJid);
            const timeAFK = formatDuration(
              Date.now() - new Date(afkData.setAt).getTime()
            );
            const lastSeen = timeSince(afkData.lastSeen);

            await incrementMessageCount(mentionedJid);

            const afkReply =
              `*_🌙 @${mentionedJid.split("@")[0]} abhi AFK hai_*\n\n` +
              `📝 _Wajah:_ \`${afkData.reason}\`\n` +
              `⏰ _AFK kitni der se:_ \`${timeAFK}\`\n` +
              `👁️ _Aakhri baar dekha:_ \`${lastSeen}\`\n` +
              `💬 _Messages aaye:_ \`${afkData.messageCount + 1}\``;

            await message.sendMessage(afkReply, "text", {
              quoted: message.data,
              mentions: [mentionedJid],
            });
          }
        }
      }

      if (isDM) {
        const botOwnerJid = message.client.user?.lid?.split(":")[0] + "@lid";
        if (botOwnerJid && isAFK(botOwnerJid)) {
          const afkData = getAFKData(botOwnerJid);
          const timeAFK = formatDuration(
            Date.now() - new Date(afkData.setAt).getTime()
          );
          const lastSeen = timeSince(afkData.lastSeen);

          await incrementMessageCount(botOwnerJid);

          const afkReply =
            `*_🌙 Bot ka malik abhi AFK hai_*\n\n` +
            `📝 _Wajah:_ \`${afkData.reason}\`\n` +
            `⏰ _AFK kitni der se:_ \`${timeAFK}\`\n` +
            `👁️ _Aakhri baar dekha:_ \`${lastSeen}\`\n` +
            `💬 _Messages aaye:_ \`${afkData.messageCount + 1}\`\n\n` +
            `_Apka message note ho gaya hai. Jab available honge toh jawab denge._`;

          await message.sendReply(afkReply);
        }
      }

      if (isGroup && message.reply_message && message.reply_message.jid) {
        const repliedToJid = message.reply_message.jid;
        if (isAFK(repliedToJid)) {
          const afkData = getAFKData(repliedToJid);
          const timeAFK = formatDuration(
            Date.now() - new Date(afkData.setAt).getTime()
          );
          const lastSeen = timeSince(afkData.lastSeen);

          await incrementMessageCount(repliedToJid);

          const afkReply =
            `*_🌙 @${repliedToJid.split("@")[0]} abhi AFK hai_*\n\n` +
            `📝 _Wajah:_ \`${afkData.reason}\`\n` +
            `⏰ _AFK kitni der se:_ \`${timeAFK}\`\n` +
            `👁️ _Aakhri baar dekha:_ \`${lastSeen}\`\n` +
            `💬 _Messages aaye:_ \`${afkData.messageCount + 1}\``;

          await message.sendMessage(afkReply, "text", {
            quoted: message.data,
            mentions: [repliedToJid],
          });
        }
      }
    } catch (error) {
      console.error("Error in AFK auto-reply handler:", error);
    }
  }
);

Module(
  {
    on: "message",
    fromMe: false,
  },
  async (message) => {
    try {
      const senderJid = message.sender;

      if (isAFK(senderJid)) {
        await updateLastSeen(senderJid);
      }
    } catch (error) {
      console.error("Error updating AFK last seen:", error);
    }
  }
);

module.exports = {
  setAFK,
  removeAFK,
  isAFK,
  getAFKData,
  updateLastSeen,
  incrementMessageCount,
  saveAFKData,
};
