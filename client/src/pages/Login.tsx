
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(email, password);
      navigate("/dashboard");
    } catch {
      setError("Invalid email or password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-layout">
      <section className="auth-visual-panel">
        <div className="auth-visual-brand">
          <div className="brand-icon">I</div>
          <span>IntellMeet</span>
        </div>

        <div className="auth-visual-content">
          <div className="auth-visual-badge">
            <span className="auth-badge-dot" />
            YOUR TEAM'S MEETING SPACE
          </div>

          <h1>
            Better meetings.
            <br />
            <span>Better outcomes.</span>
          </h1>

          <p>
            A smarter space to connect, collaborate, and turn conversations
            into meaningful progress.
          </p>

          <div className="auth-illustration">
            <div className="auth-illustration-orbit orbit-one" />
            <div className="auth-illustration-orbit orbit-two" />

            <div className="auth-illustration-card">
              <div className="illustration-card-header">
                <span className="illustration-live">
                  <span />
                  LIVE MEETING
                </span>
                <span className="illustration-menu">•••</span>
              </div>

              <div className="illustration-participants">
                <div className="illustration-person person-one">A</div>
                <div className="illustration-person person-two">M</div>
                <div className="illustration-person person-three">J</div>
                <div className="illustration-person person-four">S</div>
              </div>

              <div className="illustration-card-footer">
                <div>
                  <strong>Team collaboration</strong>
                  <span>4 participants connected</span>
                </div>

                <div className="illustration-call-icon">↗</div>
              </div>
            </div>
          </div>
        </div>

        <div className="auth-visual-footer">
          <span>Connect with purpose.</span>
          <span>Collaborate with clarity.</span>
        </div>
      </section>

      <section className="auth-form-panel">
        <div className="auth-form-container">
          <div className="auth-mobile-brand">
            <div className="brand-icon">I</div>
            <span>IntellMeet</span>
          </div>

          <div className="auth-form-heading">
            <p className="auth-form-eyebrow">WELCOME BACK</p>
            <h2>Sign in to your account</h2>
            <p>
              Enter your details to continue to your workspace.
            </p>
          </div>

          {error && <div className="auth-form-error">{error}</div>}

          <form className="modern-auth-form" onSubmit={handleSubmit}>
            <div className="modern-form-group">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <div className="modern-form-group">
              <div className="password-label-row">
                <label htmlFor="password">Password</label>
              </div>

              <input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="modern-auth-button"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign in"}
              {!loading && <span>→</span>}
            </button>
          </form>

          <p className="auth-switch-text">
            Don't have an account?{" "}
            <Link to="/register">Create an account</Link>
          </p>

          <div className="auth-form-bottom">
            <span>© 2026 IntellMeet</span>
            <span>Built for better collaboration</span>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Login;
