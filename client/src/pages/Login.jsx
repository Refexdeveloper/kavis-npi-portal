import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { ArrowRight, Eye, EyeOff, Lock, User, Activity } from "lucide-react";
import confetti from "canvas-confetti";
import { useAuth } from "../api/AuthContext.jsx";
import "../components/login/login-suite.css";

function safeNext(raw) {
  if (!raw) return "/";
  try { raw = decodeURIComponent(raw); } catch { /* keep */ }
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/login")) return "/";
  return raw;
}

export default function Login() {
  const { login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [userError, setUserError] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [shake, setShake] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setUserError(false);
    setPasswordError(false);
    setErrorMsg("");

    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername) {
      setUserError(true);
      setErrorMsg("Enter your username.");
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }
    if (!password || password.length < 4) {
      setPasswordError(true);
      setErrorMsg("Enter your password.");
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }

    setIsSubmitting(true);
    try {
      await login(cleanUsername, password);
      if (!reduce) {
        confetti({
          particleCount: 70,
          spread: 62,
          origin: { y: 0.55, x: 0.5 },
          colors: ["#1e5f74", "#1f8a5f", "#c2701c", "#0D4574"],
        });
      }
      const next = safeNext(new URLSearchParams(location.search).get("next"));
      navigate(next, { replace: true });
    } catch (err) {
      setPasswordError(true);
      setErrorMsg(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
      setShake(true);
      setTimeout(() => setShake(false), 520);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="em-page">
      <div className="em-bg" aria-hidden>
        <span className="em-orb em-orb--a" />
        <span className="em-orb em-orb--b" />
        <span className="em-orb em-orb--c" />
        <span className="em-grid" />
      </div>

      <div className="em-shell">
        <section className="em-auth">
          <div className={`em-card${shake ? " is-shake" : ""}`}>
            <div className="em-card-head em-card-head--brand">
              <span className="em-card-logo em-card-logo--mark" aria-hidden>KV</span>
              <div>
                <h2>Welcome back</h2>
                <p>Sign in to the Kavis Pharma NPI stage-gate workflow.</p>
              </div>
            </div>

            <form onSubmit={onSubmit} noValidate>
              <div className={`em-field${userError ? " is-error" : ""}`}>
                <label htmlFor="login-username">Username</label>
                <div className="em-field-box">
                  <User size={17} strokeWidth={2} />
                  <input
                    id="login-username"
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      if (userError) setUserError(false);
                      if (errorMsg) setErrorMsg("");
                    }}
                    placeholder="e.g. bd.vinay"
                    autoComplete="username"
                    autoFocus
                  />
                </div>
              </div>

              <div className={`em-field${passwordError ? " is-error" : ""}`}>
                <label htmlFor="login-password">Password</label>
                <div className="em-field-box">
                  <Lock size={17} strokeWidth={2} />
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (passwordError) setPasswordError(false);
                      if (errorMsg) setErrorMsg("");
                    }}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="em-eye-btn"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              {errorMsg ? <div className="em-error" role="alert">{errorMsg}</div> : null}

              <button type="submit" className="em-submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <span className="em-spinner" aria-hidden />
                ) : (
                  <>
                    Sign in
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>

            <div className="em-footnote">
              Access is per person and role-scoped to Kavis Pharma's RFI &rarr; RFP &rarr; Agreement process — each function only actions the items assigned to it. Contact Senior Management for an account.
            </div>
          </div>
        </section>
      </div>

      <footer className="em-foot">
        <Activity size={12} />
        Extrovis &middot; Kavis Pharma &middot; NPI Portal
      </footer>
    </div>
  );
}
