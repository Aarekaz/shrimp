export const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Shrimp Agent</title>
    <link rel="stylesheet" href="/ui/styles.css">
  </head>
  <body>
    <main class="shell">
      <section class="workspace" aria-label="Shrimp chat">
        <header class="topbar">
          <div>
            <p class="eyebrow">Shrimp Agent</p>
            <h1>Hosted workspace</h1>
          </div>
          <div class="status-pill" aria-label="Runtime status">
            <span class="status-dot"></span>
            <span>Live on Cloudflare</span>
          </div>
        </header>

        <div id="messages" class="messages" aria-live="polite">
          <div id="empty" class="empty-state">
            <p class="eyebrow">Ready</p>
            <h2>Ask Shrimp to remember, fetch, remind, or reason.</h2>
            <p>Messages stay in this hosted agent session and tool calls stay behind your access token.</p>
          </div>
        </div>

        <form id="form" class="composer">
          <input id="input" autocomplete="off" placeholder="Message Shrimp" aria-label="Message Shrimp">
          <button id="send" type="submit">Send</button>
        </form>
      </section>

      <aside class="panel">
        <div class="brand-mark">S</div>
        <div>
          <p class="eyebrow">Personal agent</p>
          <h2>Shrimp</h2>
          <p class="panel-copy">A small Cloudflare-native agent surface for the useful parts first.</p>
        </div>

        <section class="access-card" aria-labelledby="access-title">
          <div>
            <p class="eyebrow">Access</p>
            <h3 id="access-title">Token</h3>
          </div>
          <label class="token-field">
            <span>Bearer token</span>
            <input id="token" type="password" autocomplete="off" spellcheck="false" placeholder="Paste token">
          </label>
          <div class="actions">
            <button id="save-token" type="button">Save</button>
            <button id="clear-token" type="button" class="ghost">Clear</button>
          </div>
          <p id="token-status" class="token-status">Not saved</p>
        </section>

        <section class="command-list" aria-labelledby="commands-title">
          <p class="eyebrow">Commands</p>
          <h3 id="commands-title">Quick starts</h3>
          <button type="button" data-prompt="/remember fact I prefer focused, concise updates">/remember fact</button>
          <button type="button" data-prompt="/recall focused updates">/recall</button>
          <button type="button" data-prompt="/fetch https://example.com">/fetch</button>
          <button type="button" data-prompt="/remind 5 Stand up and stretch">/remind</button>
          <button type="button" data-prompt="/approvals">/approvals</button>
        </section>
      </aside>
    </main>
    <script type="module" src="/ui/app.js"></script>
  </body>
</html>`;

export const css = `:root {
  --bg: #090a0c;
  --surface: #101318;
  --surface-strong: #151a21;
  --surface-soft: #0d1015;
  --text: #f7f2ec;
  --muted: #a8b0ba;
  --faint: #6f7782;
  --accent: #ff7147;
  --accent-strong: #ff8a5f;
  --mint: #63d6a2;
  --shadow-border: 0 0 0 1px rgba(255, 255, 255, 0.08);
  --shadow-border-hover: 0 0 0 1px rgba(255, 255, 255, 0.13);
  --shadow-elevated: 0 16px 40px rgba(0, 0, 0, 0.32);
}
* { box-sizing: border-box; }
html {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background:
    linear-gradient(180deg, rgba(255, 113, 71, 0.08), transparent 280px),
    var(--bg);
  color: var(--text);
}
button,
input {
  font: inherit;
}
button {
  min-height: 40px;
  cursor: pointer;
  transition-property: scale, background-color, box-shadow, color, opacity;
  transition-duration: 150ms;
  transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
}
button:active {
  scale: 0.96;
}
button:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}
.shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
}
.workspace {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
.topbar {
  min-height: 96px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 24px clamp(20px, 4vw, 48px);
}
.eyebrow {
  margin: 0 0 6px;
  color: var(--accent-strong);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
h1,
h2,
h3,
p {
  margin-top: 0;
}
h1,
h2,
h3 {
  text-wrap: balance;
}
h1 {
  margin-bottom: 0;
  font-size: clamp(26px, 3vw, 38px);
  line-height: 1;
}
.status-pill {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border-radius: 999px;
  color: #dce5df;
  background: rgba(99, 214, 162, 0.08);
  box-shadow: 0 0 0 1px rgba(99, 214, 162, 0.18);
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--mint);
  box-shadow: 0 0 14px rgba(99, 214, 162, 0.7);
}
.messages {
  flex: 1;
  overflow: auto;
  padding: 0 clamp(20px, 4vw, 48px) 24px;
  scroll-behavior: smooth;
}
.empty-state {
  max-width: 720px;
  margin: min(10vh, 80px) auto 0;
  padding: 28px;
  border-radius: 18px;
  background: rgba(16, 19, 24, 0.72);
  box-shadow: var(--shadow-border), var(--shadow-elevated);
}
.empty-state h2 {
  margin-bottom: 12px;
  font-size: clamp(30px, 5vw, 58px);
  line-height: 0.98;
}
.empty-state p:last-child,
.panel-copy {
  margin-bottom: 0;
  color: var(--muted);
  line-height: 1.6;
  text-wrap: pretty;
}
.message {
  max-width: 760px;
  margin-bottom: 14px;
  padding: 13px 15px 14px;
  background: var(--surface);
  border-radius: 14px;
  box-shadow: var(--shadow-border);
  white-space: pre-wrap;
  animation: message-enter 220ms cubic-bezier(0.2, 0, 0, 1) both;
}
.message.user {
  margin-left: auto;
  background: #1b2530;
}
.message.pending {
  color: var(--muted);
}
.message.error {
  background: rgba(255, 113, 71, 0.11);
  box-shadow: 0 0 0 1px rgba(255, 113, 71, 0.22);
}
.message-meta {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
  color: var(--faint);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.message-time {
  font-variant-numeric: tabular-nums;
}
.message-body {
  color: var(--text);
  line-height: 1.55;
  text-wrap: pretty;
}
.composer {
  display: flex;
  gap: 10px;
  padding: 16px clamp(20px, 4vw, 48px) 24px;
  background: linear-gradient(180deg, transparent, rgba(9, 10, 12, 0.94) 28%);
}
.composer input {
  flex: 1;
  min-height: 48px;
  padding: 0 14px;
  border: 0;
  border-radius: 12px;
  background: var(--surface-soft);
  color: var(--text);
  box-shadow: var(--shadow-border);
  outline: none;
  transition-property: box-shadow, background-color;
  transition-duration: 150ms;
  transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
}
.composer input:focus,
.token-field input:focus {
  box-shadow: 0 0 0 1px rgba(255, 113, 71, 0.58), 0 0 0 4px rgba(255, 113, 71, 0.12);
}
.composer button {
  min-width: 82px;
  padding: 0 18px;
  border: 0;
  border-radius: 12px;
  background: var(--accent);
  color: white;
  font-weight: 800;
  box-shadow: 0 8px 20px rgba(255, 113, 71, 0.24);
}
.composer button:hover {
  background: var(--accent-strong);
}
.panel {
  min-height: 100vh;
  padding: 24px;
  background: rgba(13, 16, 21, 0.86);
  box-shadow: inset 1px 0 0 rgba(255, 255, 255, 0.08);
}
.brand-mark {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  margin-bottom: 22px;
  border-radius: 16px;
  background: var(--accent);
  color: white;
  font-size: 22px;
  font-weight: 900;
  box-shadow: 0 12px 28px rgba(255, 113, 71, 0.25);
}
.panel h2 {
  margin-bottom: 10px;
  font-size: 32px;
  line-height: 1;
}
.access-card,
.command-list {
  margin-top: 24px;
  padding: 18px;
  border-radius: 18px;
  background: var(--surface);
  box-shadow: var(--shadow-border);
}
.access-card h3,
.command-list h3 {
  margin-bottom: 14px;
}
.token-field {
  display: grid;
  gap: 8px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 800;
}
.token-field input {
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  background: var(--surface-soft);
  color: var(--text);
  box-shadow: var(--shadow-border);
  outline: none;
}
.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 12px;
}
.actions button,
.command-list button {
  border: 0;
  border-radius: 10px;
  color: var(--text);
  background: #202731;
  box-shadow: var(--shadow-border);
  font-weight: 800;
}
.actions button:hover,
.command-list button:hover {
  box-shadow: var(--shadow-border-hover);
}
.actions .ghost {
  color: var(--muted);
  background: transparent;
}
.token-status {
  min-height: 18px;
  margin: 12px 0 0;
  color: var(--faint);
  font-size: 12px;
  font-weight: 700;
}
.token-status.saved {
  color: var(--mint);
}
.command-list {
  display: grid;
  gap: 8px;
}
.command-list .eyebrow,
.command-list h3 {
  margin-bottom: 0;
}
.command-list button {
  justify-content: flex-start;
  padding: 0 12px;
  color: #dce2e9;
  text-align: left;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", monospace;
  font-size: 12px;
}
@keyframes message-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
    filter: blur(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
    filter: blur(0);
  }
}
@media (max-width: 800px) {
  .shell { grid-template-columns: 1fr; }
  .panel {
    min-height: auto;
    box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.08);
  }
  .topbar {
    align-items: flex-start;
    flex-direction: column;
  }
  .empty-state {
    margin-top: 24px;
  }
}
@media (max-width: 560px) {
  .composer {
    align-items: stretch;
    flex-direction: column;
  }
  .composer button {
    width: 100%;
  }
}`;

export const js = `const messages = document.getElementById("messages");
const empty = document.getElementById("empty");
const form = document.getElementById("form");
const input = document.getElementById("input");
const sendButton = document.getElementById("send");
const tokenInput = document.getElementById("token");
const saveTokenButton = document.getElementById("save-token");
const clearTokenButton = document.getElementById("clear-token");
const tokenStatus = document.getElementById("token-status");
const commandButtons = document.querySelectorAll("[data-prompt]");

function updateTokenStatus() {
  const token = window.localStorage.getItem("shrimp_access_token") || "";
  tokenInput.value = token;
  tokenStatus.textContent = token ? "Saved locally" : "Not saved";
  tokenStatus.className = "token-status" + (token ? " saved" : "");
}

function getAccessToken() {
  return window.localStorage.getItem("shrimp_access_token") || "";
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function setBusy(isBusy) {
  sendButton.disabled = isBusy;
  input.disabled = isBusy;
  sendButton.textContent = isBusy ? "Sending" : "Send";
}

function addMessage(role, content, variant = "") {
  empty.hidden = true;
  const el = document.createElement("div");
  el.className = ["message", role, variant].filter(Boolean).join(" ");
  const meta = document.createElement("div");
  meta.className = "message-meta";
  const label = document.createElement("span");
  label.textContent = role === "user" ? "You" : "Shrimp";
  const time = document.createElement("span");
  time.className = "message-time";
  time.textContent = formatTime(new Date());
  meta.append(label, time);
  const body = document.createElement("div");
  body.className = "message-body";
  body.textContent = content;
  el.append(meta, body);
  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
  return el;
}

function updateMessage(el, content, variant = "") {
  el.className = ["message", "assistant", variant].filter(Boolean).join(" ");
  el.querySelector(".message-body").textContent = content;
}

saveTokenButton.addEventListener("click", () => {
  const token = tokenInput.value.trim();
  if (token) {
    window.localStorage.setItem("shrimp_access_token", token);
  }
  updateTokenStatus();
});

clearTokenButton.addEventListener("click", () => {
  window.localStorage.removeItem("shrimp_access_token");
  updateTokenStatus();
  tokenInput.focus();
});

commandButtons.forEach((button) => {
  button.addEventListener("click", () => {
    input.value = button.dataset.prompt || "";
    input.focus();
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  const token = getAccessToken();
  if (!token) {
    addMessage("assistant", "Add your access token first, then send again.", "error");
    tokenInput.focus();
    return;
  }

  input.value = "";
  addMessage("user", text);
  const pending = addMessage("assistant", "Thinking...", "pending");
  setBusy(true);

  try {
    const response = await fetch("/api/agent/default/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": "Bearer " + token,
      },
      body: JSON.stringify({ message: text }),
    });
    const data = await response.json();
    const variant = response.ok ? "" : "error";
    updateMessage(pending, data.reply || data.error || "No response", variant);
  } catch (error) {
    updateMessage(pending, "Shrimp could not reach the Worker. Try again in a moment.", "error");
  } finally {
    setBusy(false);
    input.focus();
  }
});

updateTokenStatus();`;
