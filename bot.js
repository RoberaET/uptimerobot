const POLLING_INTERVAL = parseInt(process.env.POLLING_INTERVAL || "60", 10) * 1000;
const UPTIMEROBOT_API_KEY = process.env.UPTIMEROBOT_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const STATUS_MAP = {
    0: "⏸ Paused",
    1: "⏳ Not Checked",
    2: "✅ UP",
    8: "⚠️ Seems Down",
    9: "❌ DOWN"
};

const monitorStates = new Map();

async function getMonitors() {
    const url = "https://api.uptimerobot.com/v2/getMonitors";
    const payload = new URLSearchParams();
    payload.append("api_key", UPTIMEROBOT_API_KEY);
    payload.append("format", "json");
    payload.append("logs", "1");
    payload.append("response_times", "1");
    payload.append("response_times_limit", "1");

    try {
        const response = await fetch(url, {
            method: "POST",
            body: payload,
            headers: {
                "content-type": "application/x-www-form-urlencoded",
                "cache-control": "no-cache"
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (data.stat === "ok") {
            return data.monitors || [];
        } else {
            console.error("Error fetching monitors:", data);
            return [];
        }
    } catch (e) {
        console.error("Exception fetching monitors:", e);
        return [];
    }
}

async function sendTelegramMessage(message, chatId = TELEGRAM_CHAT_ID) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: "HTML"
            })
        });
        const data = await response.json();
        if (!response.ok || !data.ok) {
             console.error("Error sending Telegram message:", data);
        }
    } catch (e) {
        console.error("Exception sending Telegram message:", e);
    }
}

async function setBotDescription() {
    const descUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setMyDescription`;
    const shortDescUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setMyShortDescription`;
    const commandsUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setMyCommands`;
    const descText = "I am a real-time UptimeRobot monitor bot. Add me to a group or send /start to see the current status of all your websites!";
    
    try {
        await fetch(descUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description: descText })
        });
        await fetch(shortDescUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ short_description: "Real-time UptimeRobot Alert Bot" })
        });
        await fetch(commandsUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                commands: [
                    { command: "start", description: "Show welcome and quick status" },
                    { command: "history", description: "Show detailed uptime, response time, and incidents" }
                ] 
            })
        });
        console.log("Bot description and commands updated via API.");
    } catch (e) {
        console.error("Failed to set bot description/commands:", e);
    }
}

let lastUpdateId = 0;

function formatDuration(seconds) {
    if (!seconds) return "Unknown";
    const d = Math.floor(seconds / (3600*24));
    const h = Math.floor(seconds % (3600*24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (parts.length === 0) return "< 1m";
    return parts.join(" ");
}

function formatTimestamp(unixTs) {
    if (!unixTs) return "Unknown";
    return new Date(unixTs * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' });
}

async function pollTelegramUpdates() {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.ok && data.result.length > 0) {
            for (const update of data.result) {
                lastUpdateId = update.update_id;
                
                if (update.message && update.message.text) {
                    const text = update.message.text.trim();
                    const chatId = update.message.chat.id;
                    
                    if (text.startsWith("/start")) {
                        console.log(`Received /start from chat ID: ${chatId}`);
                        let reply = "👋 <b>Welcome to your UptimeRobot Monitor Bot!</b>\n\n";
                        reply += "I am configured to notify this chat whenever your websites go down or come back up.\n\n";
                        reply += "📊 <b>Current Monitor Status:</b>\n\n";
                        
                        const monitors = await getMonitors();
                        if (monitors.length === 0) {
                            reply += "<i>No monitors found or failed to fetch data.</i>";
                        } else {
                            for (const m of monitors) {
                                const statusIcon = STATUS_MAP[m.status] || "❓";
                                const name = m.friendly_name.replace(/\/$/, '');
                                reply += `${statusIcon} <b>${name}</b>\n`;
                            }
                            reply += "\n<i>Use /history for detailed statistics and incidents.</i>";
                        }
                        
                        await sendTelegramMessage(reply, chatId);
                    } else if (text.startsWith("/history")) {
                        console.log(`Received /history from chat ID: ${chatId}`);
                        const monitors = await getMonitors();
                        if (monitors.length === 0) {
                            await sendTelegramMessage("<i>No monitors found or failed to fetch data.</i>", chatId);
                            continue;
                        }

                        for (const m of monitors) {
                            const name = m.friendly_name.replace(/\/$/, '');
                            let reply = `📡 <b>${name}</b>\n`;
                            
                            let currentStatus = STATUS_MAP[m.status] || "❓";
                            if (m.logs && m.logs.length > 0) {
                                const currentDuration = Math.floor(Date.now() / 1000) - m.logs[0].datetime;
                                reply += `${currentStatus} for ${formatDuration(currentDuration)}\n`;
                            } else {
                                reply += `${currentStatus}\n`;
                            }

                            let lastCheckTime = "Unknown";
                            if (m.response_times && m.response_times.length > 0) {
                                lastCheckTime = formatTimestamp(m.response_times[0].datetime);
                            }
                            if (m.average_response_time) {
                                reply += `⏱ Last Check: ${lastCheckTime} (${parseFloat(m.average_response_time).toFixed(0)} ms)\n\n`;
                            } else {
                                reply += `⏱ Last Check: ${lastCheckTime}\n\n`;
                            }

                            if (m.logs && m.logs.length > 1) {
                                reply += `📜 <b>History:</b>\n`;
                                let logCount = 0;
                                for (let i = 1; i < m.logs.length && logCount < 3; i++) {
                                    const log = m.logs[i];
                                    if (log.type === 1 || log.type === 2) {
                                        const icon = log.type === 1 ? "❌ DOWN" : "✅ UP";
                                        const reason = log.reason && log.reason.detail ? ` - ${log.reason.detail}` : "";
                                        const dateStr = new Date(log.datetime * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric' });
                                        reply += `• ${icon} for ${formatDuration(log.duration)} (${dateStr})${reason}\n`;
                                        logCount++;
                                    }
                                }
                            }

                            await sendTelegramMessage(reply, chatId);
                        }
                    }
                }
            }
        }
    } catch (e) {
        // Suppress network timeout errors from long polling
    }
}

async function main() {
    console.log("Starting UptimeRobot Telegram Bot...");
    if (!UPTIMEROBOT_API_KEY || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.error("Error: Missing required environment variables. Please check your .env file.");
        process.exit(1);
    }

    // Set descriptions on startup
    await setBotDescription();

    // Loop for UptimeRobot Polling
    setInterval(async () => {
        try {
            const monitors = await getMonitors();
            for (const monitor of monitors) {
                const monitorId = monitor.id;
                const currentStatus = monitor.status;
                const monitorName = monitor.friendly_name;
                const monitorUrl = monitor.url;

                if (!monitorStates.has(monitorId)) {
                    monitorStates.set(monitorId, currentStatus);
                } else {
                    const previousStatus = monitorStates.get(monitorId);
                    if (currentStatus !== previousStatus) {
                        const name = monitorName.replace(/\/$/, '');
                        let message;
                        if (currentStatus === 9 || currentStatus === 8) {
                            message = `🚨 <b>Alert:</b> The website <b>${name}</b> is currently DOWN!`;
                        } else if (currentStatus === 2) {
                            message = `✅ <b>Good news!</b> The website <b>${name}</b> is back UP and running normally.`;
                        } else {
                            const statusText = STATUS_MAP[currentStatus] || `Unknown (${currentStatus})`;
                            message = `ℹ️ The status of <b>${name}</b> has changed to: ${statusText}`;
                        }
                        console.log(`Alert: ${monitorName} changed from ${previousStatus} to ${currentStatus}`);
                        await sendTelegramMessage(message);
                        monitorStates.set(monitorId, currentStatus);
                    }
                }
            }
        } catch (e) {
            console.error("Error in UptimeRobot polling loop:", e);
        }
    }, POLLING_INTERVAL);

    // Loop for Telegram Updates (Long Polling)
    console.log("Listening for /start commands...");
    while (true) {
        await pollTelegramUpdates();
        // small delay between polls
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

main();
