// Cloudflare Pages Functions - True Edge Server-Side Authentication
// Intercepts EVERY request (HTML, JSON, Images, Videos) before serving bytes.

const AUTH_USER = "9701994529";
const AUTH_PASS = "k,9701994529";
// Secret key used to sign the session cookie (HMAC SHA-256)
const SECRET_KEY = "kammala_photo_gallery_secure_edge_secret_token_2026";
const COOKIE_NAME = "gallery_auth_token";

async function hmacSha256(message, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies = cookieHeader.split(";");
  for (const c of cookies) {
    const trimmed = c.trim();
    if (trimmed.startsWith(name + "=")) {
      return trimmed.substring(name.length + 1);
    }
  }
  return null;
}

function loginPageHtml(errorMsg = "") {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Protected Photo Gallery - Login</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    background: #0d0d0d;
    color: #e0e0e0;
    min-height: 100vh;
    min-height: -webkit-fill-available;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    -webkit-font-smoothing: antialiased;
  }
  .login-card {
    background: #1a1a1a;
    border: 1px solid #2d2d2d;
    border-radius: 16px;
    padding: 32px 24px;
    width: 100%;
    max-width: 360px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.6);
  }
  .icon-wrap {
    text-align: center;
    font-size: 2.4rem;
    margin-bottom: 12px;
  }
  h1 {
    font-size: 1.35rem;
    font-weight: 600;
    text-align: center;
    margin-bottom: 6px;
    color: #f3f3f3;
  }
  .subtitle {
    font-size: 0.82rem;
    color: #888;
    text-align: center;
    margin-bottom: 24px;
  }
  .form-group {
    margin-bottom: 18px;
  }
  label {
    display: block;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #aaa;
    margin-bottom: 6px;
    font-weight: 500;
  }
  input[type="text"], input[type="password"] {
    width: 100%;
    padding: 14px 14px;
    background: #242424;
    border: 1px solid #383838;
    border-radius: 10px;
    color: #fff;
    font-size: 16px; /* Prevents auto-zoom on iOS */
    outline: none;
    transition: border-color 0.2s, background 0.2s;
    -webkit-appearance: none;
  }
  input[type="text"]:focus, input[type="password"]:focus {
    border-color: #c9a84c;
    background: #2a2a2a;
  }
  .btn {
    width: 100%;
    padding: 14px;
    background: #c9a84c;
    color: #111;
    font-weight: 600;
    font-size: 1rem;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    margin-top: 8px;
    transition: background 0.2s, transform 0.1s;
    -webkit-appearance: none;
  }
  .btn:hover { background: #dfbc55; }
  .btn:active { transform: scale(0.98); }
  .btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .error-box {
    background: rgba(220, 53, 69, 0.18);
    border: 1px solid rgba(220, 53, 69, 0.5);
    color: #ff6b6b;
    padding: 12px 14px;
    border-radius: 8px;
    font-size: 0.85rem;
    margin-bottom: 18px;
    text-align: center;
    display: ${errorMsg ? "block" : "none"};
  }
  .footer-note {
    font-size: 0.72rem;
    color: #555;
    text-align: center;
    margin-top: 24px;
  }
</style>
</head>
<body>
  <div class="login-card">
    <div class="icon-wrap">🔒</div>
    <h1>Private Gallery</h1>
    <p class="subtitle">Enter credentials to unlock</p>

    <div class="error-box" id="errBox">${errorMsg}</div>

    <form id="loginForm" method="POST" action="/__login">
      <div class="form-group">
        <label for="username">Username</label>
        <input type="text" id="username" name="username" required autocomplete="username" inputmode="numeric" autocapitalize="none" autocorrect="off" spellcheck="false" autofocus>
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required autocomplete="current-password" autocapitalize="none" autocorrect="off" spellcheck="false">
      </div>
      <button type="submit" class="btn" id="submitBtn">Unlock Gallery</button>
    </form>
    <div class="footer-note">Protected by Cloudflare Edge Security</div>
  </div>

  <script>
    const form = document.getElementById('loginForm');
    const btn = document.getElementById('submitBtn');
    const errBox = document.getElementById('errBox');

    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      btn.disabled = true;
      btn.textContent = 'Verifying...';
      errBox.style.display = 'none';

      const user = document.getElementById('username').value.trim();
      const pass = document.getElementById('password').value.trim();

      const body = new URLSearchParams();
      body.append('username', user);
      body.append('password', pass);

      try {
        const res = await fetch('/__login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
          credentials: 'include'
        });

        const data = await res.json().catch(() => null);

        if (res.ok && data && data.success) {
          btn.textContent = 'Unlocked! Loading...';
          // Force mobile browser to reload bypassing cache
          window.location.href = '/?t=' + Date.now();
        } else {
          errBox.textContent = (data && data.error) ? data.error : 'Invalid username or password.';
          errBox.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Unlock Gallery';
        }
      } catch (err) {
        // Fallback to standard form submission if fetch is blocked
        form.submit();
      }
    });
  </script>
</body>
</html>`;
}

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);

  // 1. Handle Logout request
  if (url.pathname === "/__logout") {
    return new Response(null, {
      status: 303,
      headers: {
        Location: "/",
        "Set-Cookie": `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
      }
    });
  }

  // 2. Handle Login Submission POST /__login
  if (url.pathname === "/__login" && request.method === "POST") {
    try {
      const contentType = request.headers.get("content-type") || "";
      let username = "";
      let password = "";

      if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
        const formData = await request.formData();
        username = (formData.get("username") || "").trim();
        password = (formData.get("password") || "").trim();
      }

      if (username === AUTH_USER && password === AUTH_PASS) {
        // Valid credentials -> Generate server-signed HMAC token
        const timestamp = Date.now().toString();
        const payload = `${username}:${timestamp}`;
        const signature = await hmacSha256(payload, SECRET_KEY);
        const token = `${payload}:${signature}`;

        // Return JSON success with cookie for modern mobile/desktop browsers
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000` // 30 days
          }
        });
      } else {
        // Invalid credentials
        return new Response(JSON.stringify({ success: false, error: "Invalid username or password." }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: "Authentication error." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  // 3. Verify Server Session Cookie on EVERY request (including images/videos/JSON)
  const token = getCookie(request, COOKIE_NAME);
  if (token) {
    const parts = token.split(":");
    if (parts.length === 3) {
      const [u, ts, clientSig] = parts;
      const expectedSig = await hmacSha256(`${u}:${ts}`, SECRET_KEY);
      if (u === AUTH_USER && clientSig === expectedSig) {
        // Valid server session verified! Forward request to serve file/page.
        return next();
      }
    }
  }

  // 4. If not authenticated:
  // For API/Asset requests (e.g. photos/videos/gallery.json direct downloads), block with 401
  if (url.pathname.startsWith("/photos/") || url.pathname.startsWith("/videos/") || url.pathname.endsWith(".json")) {
    return new Response(JSON.stringify({ error: "Unauthorized access" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  // For browser page requests, show the Login Page
  return new Response(loginPageHtml(), {
    status: 401,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"
    }
  });
}
