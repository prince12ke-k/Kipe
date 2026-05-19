module.exports = {
  config: {
    name: "transfer",
    aliases: ["moveall", "copyall"],
    version: "3.0.0",
    author: "Hassan (final)",
    countDown: 15,
    role: 1,
    description: {
      en: "Transfer all members from a source group to a target group.\nUsage: transfer <SOURCE_ID> <TARGET_ID>"
    },
    guide: {
      en: "{pn} <SOURCE_THREAD_ID> <TARGET_THREAD_ID>\nExample: {pn} 123456789 987654321"
    },
    category: "group"
  },

  onStart: async function ({ api, event, args, message }) {
    try {
      // Get source and target IDs from arguments
      let sourceThreadID = args[0];
      let targetThreadID = args[1];

      if (!sourceThreadID || !targetThreadID) {
        return message.reply(
          "❌ | Please provide both source and target group IDs.\n\n" +
          "Usage: transfer <SOURCE_ID> <TARGET_ID>\n" +
          "Example: transfer 123456789 987654321\n\n" +
          "You can run this command from any chat (even private message with bot).\n" +
          "Make sure the bot is a member of the source group and an admin in the target group."
        );
      }

      const botID = api.getCurrentUserID();

      // ----- FETCH SOURCE GROUP INFO -----
      let sourceInfo;
      try {
        sourceInfo = await api.getThreadInfo(sourceThreadID);
        if (!sourceInfo || !sourceInfo.participantIDs) {
          throw new Error("No participant data");
        }
      } catch (err) {
        return message.reply(
          `❌ | Cannot fetch source group.\n` +
          `Make sure the bot is a MEMBER of the source group.\n` +
          `Error: ${err.message || err}`
        );
      }

      // Check if bot is actually in source group
      if (!sourceInfo.participantIDs.includes(botID)) {
        return message.reply(
          `⚠️ | The bot is NOT a member of the source group "${sourceInfo.threadName || sourceThreadID}".\n` +
          `Please add the bot to that group first, then retry.`
        );
      }

      const sourceMemberCount = sourceInfo.participantIDs.length;
      if (sourceMemberCount <= 1) {
        return message.reply(`❌ | Source group has only ${sourceMemberCount} member(s) (maybe just the bot). Nothing to transfer.`);
      }

      // ----- FETCH TARGET GROUP INFO -----
      let targetInfo;
      try {
        targetInfo = await api.getThreadInfo(targetThreadID);
      } catch (err) {
        return message.reply(
          `❌ | Cannot fetch target group.\n` +
          `Make sure the bot is a member of the target group and the ID is correct.\n` +
          `Error: ${err.message || err}`
        );
      }

      // Check bot admin in target group
      const isBotAdmin = targetInfo.adminIDs?.some(admin => admin.id == botID) || false;
      if (!isBotAdmin) {
        return message.reply(
          `❌ | The bot is NOT an admin in the target group "${targetInfo.threadName || targetThreadID}".\n` +
          `Please promote the bot to admin in the target group and try again.`
        );
      }

      // Optional: check if target group is near limit
      const TARGET_LIMIT = 5000;
      if (targetInfo.participantIDs.length >= TARGET_LIMIT) {
        return message.reply(`❌ | Target group has reached the member limit (${TARGET_LIMIT}). Cannot add more.`);
      }

      // ----- DETERMINE USERS TO ADD -----
      const sourceMembers = sourceInfo.participantIDs.filter(uid => uid !== botID);
      const targetMemberSet = new Set(targetInfo.participantIDs);

      const alreadyInTarget = [];
      const needToAdd = [];
      for (const uid of sourceMembers) {
        if (targetMemberSet.has(uid)) {
          alreadyInTarget.push(uid);
        } else {
          needToAdd.push(uid);
        }
      }

      if (needToAdd.length === 0) {
        return message.reply(
          `✅ All ${sourceMembers.length} member(s) from source are already in target group.\n` +
          `ℹ️ Already in target: ${alreadyInTarget.length}`
        );
      }

      // Send progress report
      const startMsg = await message.reply(
        `📊 Source Group: ${sourceInfo.threadName || sourceThreadID}\n` +
        `👥 Total members in source: ${sourceMembers.length}\n` +
        `✅ Already in target: ${alreadyInTarget.length}\n` +
        `➕ Need to add: ${needToAdd.length}\n\n` +
        `⏳ Starting transfer... (Estimated time: ${Math.ceil(needToAdd.length * 5 / 60)} minutes)\n` +
        `⚠️ The bot will add members one by one with a 5-second delay. Do not spam.`
      );

      let successCount = alreadyInTarget.length;
      let failedCount = 0;
      const failedUsers = [];

      // ----- ADD USERS WITH RETRY AND PROPER ERROR HANDLING -----
      for (let i = 0; i < needToAdd.length; i++) {
        const uid = needToAdd[i];
        let added = false;

        // Retry up to 2 times
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            await new Promise((resolve, reject) => {
              api.addUserToGroup(uid, targetThreadID, (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
            added = true;
            successCount++;
            console.log(`✅ Added ${uid}`);
            break;
          } catch (err) {
            let errorMsg = "Unknown error";
            if (typeof err === "string") errorMsg = err;
            else if (err?.error) errorMsg = String(err.error);
            else if (err?.message) errorMsg = String(err.message);
            else if (err?.toString) errorMsg = err.toString();
            else errorMsg = JSON.stringify(err);

            if (attempt === 2) {
              failedCount++;
              failedUsers.push(`${uid} → ${errorMsg.slice(0, 150)}`);
              console.log(`❌ Failed ${uid}: ${errorMsg}`);
            } else {
              console.log(`🔄 Retry ${attempt} for ${uid} (${errorMsg})`);
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
          }
        }

        // Delay between users (5 seconds)
        if (i < needToAdd.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }

        // Optional: update progress every 10 users
        if ((i + 1) % 10 === 0) {
          await message.reply(`⏳ Progress: ${successCount - alreadyInTarget.length}/${needToAdd.length} added, ${failedCount} failed so far...`);
        }
      }

      // ----- FINAL RESULT -----
      let result = `✅ Transfer completed.\n\n✔ Successfully added/moved: ${successCount}\n❌ Failed: ${failedCount}`;
      if (failedUsers.length > 0) {
        result += `\n\n⚠️ Failed User IDs with reason:\n${failedUsers.join("\n")}`;
      }
      if (alreadyInTarget.length > 0) {
        result += `\n\nℹ️ ${alreadyInTarget.length} user(s) were already in target group.`;
      }
      if (successCount > alreadyInTarget.length) {
        result += `\n\n🎉 Added ${successCount - alreadyInTarget.length} new members to the target group.`;
      }

      return message.reply(result);
    } catch (err) {
      console.error("Transfer error:", err);
      return message.reply(`❌ Fatal error:\n${err.message || err}`);
    }
  }
};
