import os
import time
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

UPTIMEROBOT_API_KEY = os.getenv("UPTIMEROBOT_API_KEY")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")
POLLING_INTERVAL = int(os.getenv("POLLING_INTERVAL", 60))

# UptimeRobot status codes mapping
STATUS_MAP = {
    0: "⏸ Paused",
    1: "⏳ Not Checked Yet",
    2: "✅ UP",
    8: "⚠️ Seems Down",
    9: "❌ DOWN"
}

def get_monitors():
    url = "https://api.uptimerobot.com/v2/getMonitors"
    payload = f"api_key={UPTIMEROBOT_API_KEY}&format=json"
    headers = {
        'content-type': "application/x-www-form-urlencoded",
        'cache-control': "no-cache"
    }
    try:
        response = requests.request("POST", url, data=payload, headers=headers)
        response.raise_for_status()
        data = response.json()
        if data.get("stat") == "ok":
            return data.get("monitors", [])
        else:
            print(f"Error fetching monitors: {data}")
            return []
    except Exception as e:
        print(f"Exception fetching monitors: {e}")
        return []

def send_telegram_message(message):
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "HTML"
    }
    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()
    except Exception as e:
        print(f"Error sending Telegram message: {e}")

def main():
    print("Starting UptimeRobot Telegram Bot...")
    if not all([UPTIMEROBOT_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID]):
        print("Error: Missing required environment variables. Please check your .env file.")
        return

    # Dictionary to keep track of the last known status of each monitor
    monitor_states = {}

    while True:
        try:
            monitors = get_monitors()
            for monitor in monitors:
                monitor_id = monitor["id"]
                current_status = monitor["status"]
                monitor_name = monitor["friendly_name"]
                monitor_url = monitor["url"]

                # If we haven't seen this monitor before, just record its state
                if monitor_id not in monitor_states:
                    monitor_states[monitor_id] = current_status
                    print(f"Initialized state for {monitor_name}: {STATUS_MAP.get(current_status, current_status)}")
                else:
                    previous_status = monitor_states[monitor_id]
                    # If status changed, send an alert
                    if current_status != previous_status:
                        status_text = STATUS_MAP.get(current_status, f"Unknown ({current_status})")
                        message = (
                            f"<b>Monitor Status Change</b>\n\n"
                            f"<b>Name:</b> {monitor_name}\n"
                            f"<b>URL:</b> {monitor_url}\n"
                            f"<b>Status:</b> {status_text}"
                        )
                        print(f"Alert: {monitor_name} changed from {previous_status} to {current_status}")
                        send_telegram_message(message)
                        monitor_states[monitor_id] = current_status
            
            time.sleep(POLLING_INTERVAL)
            
        except KeyboardInterrupt:
            print("\nBot stopped by user.")
            break
        except Exception as e:
            print(f"Unexpected error in main loop: {e}")
            time.sleep(POLLING_INTERVAL)

if __name__ == "__main__":
    main()
