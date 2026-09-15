import React, { useEffect, useState } from "react";
import {
  loadSettings,
  saveSettings,
  applyThemeToDocument,
  LASSO_THEMES,
} from "./settings.js";
import { loadSession } from "../auth/session.js";
import {
  signInWithGoogle,
  signOut,
  trySilentGoogleSignIn,
} from "../auth/googleSignIn.js";
import { isCloudSignInAvailable } from "../auth/googleSignIn.js";

export default function PopupApp() {
  const [theme, setTheme] = useState("system");
  const [lassoTheme, setLassoTheme] = useState("emerald");
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState("");
  const [ready, setReady] = useState(false);
  const [accountEmail, setAccountEmail] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [signInAvailable, setSignInAvailable] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    Promise.all([
      loadSettings(),
      loadSession(),
      trySilentGoogleSignIn(),
      isCloudSignInAvailable(),
    ])
      .then(([s, session, silent, cloudAuth]) => {
        const active = session?.token ? session : silent;
        setSignInAvailable(cloudAuth);
        setTheme(s.theme);
        setLassoTheme(s.lassoTheme);
        setEnabled(s.enabled);
        setAccountEmail(active?.user?.email ?? null);
        applyThemeToDocument(s.theme);
        setReady(true);
      })
      .catch((err) => {
        console.error("[syncle popup]", err);
        setLoadError(err?.message || "Failed to load settings");
        setReady(true);
      });
  }, []);

  useEffect(() => {
    if (!ready) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (theme === "system") applyThemeToDocument("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme, ready]);

  const persist = async (partial, message) => {
    await saveSettings(partial);
    setStatus(message || "Saved");
    setTimeout(() => setStatus(""), 1500);
  };

  const onThemeChange = async (e) => {
    const value = e.target.value;
    setTheme(value);
    applyThemeToDocument(value);
    await persist({ theme: value }, "Panel theme updated");
  };

  const onLassoThemeSelect = async (id) => {
    setLassoTheme(id);
    const name = LASSO_THEMES.find((t) => t.id === id)?.name ?? id;
    await persist({ lassoTheme: id }, `${name} lasso colors applied`);
  };

  const onEnabledChange = async (e) => {
    const value = e.target.checked;
    setEnabled(value);
    await persist(
      { enabled: value },
      value ? "Extension enabled" : "Extension disabled"
    );
  };

  const onSignIn = async () => {
    setAuthBusy(true);
    try {
      const data = await signInWithGoogle();
      setAccountEmail(data.user?.email ?? "Signed in");
      setStatus("Signed in with Google");
    } catch (err) {
      setStatus(err.message || "Sign-in failed");
    } finally {
      setAuthBusy(false);
      setTimeout(() => setStatus(""), 3000);
    }
  };

  const onSignOut = async () => {
    setAuthBusy(true);
    try {
      await signOut();
      setAccountEmail(null);
      setStatus("Signed out");
    } finally {
      setAuthBusy(false);
      setTimeout(() => setStatus(""), 1500);
    }
  };

  if (!ready) {
    return (
      <div className="popup-app">
        <p className="hint">Loading…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="popup-app">
        <h1>Syncle</h1>
        <p className="hint" style={{ color: "#b91c1c" }}>
          {loadError}
        </p>
        <p className="hint">Reload the extension from chrome://extensions</p>
      </div>
    );
  }

  return (
    <div className="popup-app">
      <h1>Syncle</h1>
      <p className="subtitle">Configure how the extension behaves on pages.</p>

      <section className="popup-section">
        <h2>Account</h2>
        <p className="hint section-hint">
          Uses your Chrome Google account. Sign in to sync selections with
          Syncle cloud.
        </p>
        {accountEmail ? (
          <p className="account-email">{accountEmail}</p>
        ) : (
          <p className="hint">Not signed in — lasso still works on the page.</p>
        )}
        <div className="account-actions">
          {accountEmail ? (
            <button
              type="button"
              className="btn-secondary"
              disabled={authBusy}
              onClick={onSignOut}
            >
              Sign out
            </button>
          ) : signInAvailable ? (
            <button
              type="button"
              className="btn-primary"
              disabled={authBusy}
              onClick={onSignIn}
            >
              {authBusy ? "Signing in…" : "Sign in with Google"}
            </button>
          ) : (
            <p className="hint">
              Cannot reach Syncle server or Google OAuth is not set up in
              syncle-services/.env (see syncle-services/docs/AUTH.md).
            </p>
          )}
        </div>
      </section>

      <section className="popup-section">
        <h2>Lasso colors</h2>
        <p className="hint section-hint">
          Border and fill for selections on the page.
        </p>
        <div className="lasso-theme-grid" role="listbox" aria-label="Lasso color theme">
          {LASSO_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="option"
              aria-selected={lassoTheme === t.id}
              className={`lasso-theme-swatch${lassoTheme === t.id ? " is-selected" : ""}`}
              title={t.name}
              onClick={() => onLassoThemeSelect(t.id)}
            >
              <span
                className="lasso-theme-swatch__ring"
                style={{ borderColor: t.border, background: t.fill }}
              />
              <span className="lasso-theme-swatch__label">{t.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="popup-section">
        <h2>Popup appearance</h2>
        <div className="field">
          <label htmlFor="theme">Panel theme</label>
          <select id="theme" value={theme} onChange={onThemeChange}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </section>

      <section className="popup-section">
        <h2>General</h2>
        <div className="field">
          <label htmlFor="enabled">Drawing enabled</label>
          <label className="toggle">
            <input
              id="enabled"
              type="checkbox"
              checked={enabled}
              onChange={onEnabledChange}
            />
            <span />
          </label>
        </div>
        <p className="hint">Hold ⌘ or Ctrl and drag on any page to draw.</p>
      </section>

      <p className="status" aria-live="polite">
        {status}
      </p>

      <p className="popup-footer">Syncle · v1.0.0</p>
    </div>
  );
}
