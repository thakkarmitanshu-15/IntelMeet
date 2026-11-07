
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";

const Register = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await register(name, email, password);
      navigate("/dashboard");
    } catch {
      setError("Unable to create your account. Please try again.");
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
            COLLABORATION STARTS HERE
          </div>

          <h1>
            Bring your team
            <br />
            <span>closer together.</span>
          </h1>

          <p>
            Create your workspace and make every conversation more
            productive, focused, and connected.
          </p>

          <div className="auth-illustration">
            <div className="auth-illustration-orbit orbit-one" />
            <div className="auth-illustration-orbit orbit-two" />

            <div className="auth-illustration-card">
              <div className="illustration-card-header">
                <span className="illustration-live">
                  <span />
                  YOUR WORKSPACE
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
                  <strong>Your team, connected</strong>
                  <span>Everything starts with a conversation</span>
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
            <p className="auth-form-eyebrow">GET STARTED</p>
            <h2>Create your account</h2>
            <p>
              Set up your account and start collaborating with your team.
            </p>
          </div>

          {error && <div className="auth-form-error">{error}</div>}

          <form className="modern-auth-form" onSubmit={handleSubmit}>
            <div className="modern-form-group">
              <label htmlFor="name">Full name</label>
              <input
                id="name"
                type="text"
                placeholder="Enter your full name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>

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
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                placeholder="Create a password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
              />
              <span className="auth-field-hint">
                Use at least 6 characters.
              </span>
            </div>

            <button
              type="submit"
              className="modern-auth-button"
              disabled={loading}
            >
              {loading ? "Creating account..." : "Create account"}
              {!loading && <span>→</span>}
            </button>
          </form>

          <p className="auth-switch-text">
            Already have an account?{" "}
            <Link to="/login">Sign in</Link>
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

export default Register;
