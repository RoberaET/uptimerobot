const UPTIMEROBOT_API_KEY = process.env.UPTIMEROBOT_API_KEY;

async function test() {
    const url = "https://api.uptimerobot.com/v2/getMonitors";
    const payload = new URLSearchParams();
    payload.append("api_key", UPTIMEROBOT_API_KEY);
    payload.append("format", "json");
    payload.append("logs", "1");
    payload.append("response_times", "1");
    payload.append("response_times_limit", "3");

    const response = await fetch(url, {
        method: "POST",
        body: payload,
        headers: {
            "content-type": "application/x-www-form-urlencoded"
        }
    });
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
}

test();
