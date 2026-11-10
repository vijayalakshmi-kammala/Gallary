// Cloudflare Pages Functions - True Edge Server-Side Authentication
// Compatible with all mobile devices including Samsung Internet & legacy WebViews.

const AUTH_USER = "9701994529";
const AUTH_PASS = "k,9701994529";
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
<title>Private Photo Gallery</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    height: 100%;
    background: #0d0d0d;
    color: #e0e0e0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  body {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
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
    padding: 14px;
    background: #242424;
    border: 1px solid #383838;
    border-radius: 10px;
    color: #fff;
    font-size: 16px;
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
    // Check if token already exists in localStorage (e.g. if cookies were dropped by browser)
    try {
      var savedToken = localStorage.getItem('gallery_auth_token');
      if (savedToken && !window.location.search.includes('logout')) {
        document.cookie = 'gallery_auth_token=' + savedToken + '; Path=/; Secure; SameSite=None; Max-Age=2592000';
      }
    } catch(e) {}

    var form = document.getElementById('loginForm');
    var btn = document.getElementById('submitBtn');
    var errBox = document.getElementById('errBox');

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      btn.disabled = true;
      btn.textContent = 'Verifying...';
      errBox.style.display = 'none';

      // Robust trimming: handles Samsung keyboard zero-width spaces or stray spaces
      var user = document.getElementById('username').value.replace(/\\s+/g, '').trim();
      var pass = document.getElementById('password').value.trim();

      var body = new URLSearchParams();
      body.append('username', user);
      body.append('password', pass);

      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/__login', true);
      xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
      xhr.withCredentials = true;

      xhr.onload = function() {
        try {
          var data = JSON.parse(xhr.responseText);
          if (xhr.status === 200 && data && data.success) {
            btn.textContent = 'Unlocked! Loading...';
            // Save token to localStorage as backup for Samsung Internet
            if (data.token) {
              try { localStorage.setItem('gallery_auth_token', data.token); } catch(err) {}
              // Also explicitly write cookie in document
              document.cookie = 'gallery_auth_token=' + data.token + '; Path=/; Secure; SameSite=None; Max-Age=2592000';
            }
            // Navigate with token param backup
            setTimeout(function() {
              window.location.replace('/?auth=' + encodeURIComponent(data.token || '') + '&t=' + Date.now());
            }, 100);
          } else {
            errBox.textContent = (data && data.error) ? data.error : 'Invalid username or password.';
            errBox.style.display = 'block';
            btn.disabled = false;
            btn.textContent = 'Unlock Gallery';
          }
        } catch(ex) {
          errBox.textContent = 'Response error: ' + xhr.responseText;
          errBox.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Unlock Gallery';
        }
      };

      xhr.onerror = function() {
        // Fallback to native form POST if XMLHttpRequest fails
        form.submit();
      };

      xhr.send(body.toString());
    });
  </script>
</body>
</html>`;
}

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);

  // 1. Handle Logout
  if (url.pathname === "/__logout") {
    return new Response(null, {
      status: 303,
      headers: {
        Location: "/",
        "Set-Cookie": `${COOKIE_NAME}=; Path=/; Secure; SameSite=None; Max-Age=0`
      }
    });
  }

  // 2. Handle Login Submission
  if (url.pathname === "/__login" && request.method === "POST") {
    try {
      const formData = await request.formData();
      // Strip any accidental spaces from phone input
      const username = (formData.get("username") || "").replace(/\s+/g, "").trim();
      const password = (formData.get("password") || "").trim();

      if (username === AUTH_USER && password === AUTH_PASS) {
        const timestamp = Date.now().toString();
        const payload = `${username}:${timestamp}`;
        const signature = await hmacSha256(payload, SECRET_KEY);
        const token = `${payload}:${signature}`;

        // Return token both in cookie and in JSON payload for Samsung browsers
        return new Response(JSON.stringify({ success: true, token }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": `${COOKIE_NAME}=${token}; Path=/; Secure; SameSite=None; Max-Age=2592000`
          }
        });
      } else {
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

  // 3. Verify Server Session: Check Cookie OR Query Parameter ?auth= (for Samsung devices that block cookies)
  let token = getCookie(request, COOKIE_NAME);
  if (!token) {
    token = url.searchParams.get("auth");
  }

  if (token) {
    const parts = token.split(":");
    if (parts.length === 3) {
      const [u, ts, clientSig] = parts;
      const expectedSig = await hmacSha256(`${u}:${ts}`, SECRET_KEY);
      if (u === AUTH_USER && clientSig === expectedSig) {
        // Authenticated! If auth came via URL param, re-stamp the cookie
        const response = await next();
        const newHeaders = new Headers(response.headers);
        newHeaders.append("Set-Cookie", `${COOKIE_NAME}=${token}; Path=/; Secure; SameSite=None; Max-Age=2592000`);
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders
        });
      }
    }
  }

  // 4. Block asset downloads if unauthenticated
  if (url.pathname.startsWith("/photos/") || url.pathname.startsWith("/videos/") || url.pathname.endsWith(".json")) {
    return new Response(JSON.stringify({ error: "Unauthorized access" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  // 5. Unauthenticated page view -> Show Login Page
  return new Response(loginPageHtml(), {
    status: 401,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"
    }
  });
}
