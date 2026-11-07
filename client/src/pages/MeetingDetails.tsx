import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import api from "../services/api.js";

interface Meeting {
  _id: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  status: "scheduled" | "completed" | "cancelled";
}

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";

  return date.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const MeetingDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;

    const fetchMeeting = async () => {
      setLoading(true);
      setError("");

      try {
        const response = await api.get(`/meetings/${id}`);
        if (active) setMeeting(response.data.meeting ?? response.data);
      } catch (err: any) {
        if (active) {
          setError(
            err.response?.data?.message || "Failed to load meeting details."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    if (id) {
      fetchMeeting();
    } else {
      setError("A meeting ID was not provided.");
      setLoading(false);
    }

    return () => {
      active = false;
    };
  }, [id]);

  const handleDelete = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this meeting? This action cannot be undone."
    );

    if (!confirmed || !id || deleting) return;

    setDeleting(true);
    setError("");

    try {
      await api.delete(`/meetings/${id}`);
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to delete meeting.");
      setDeleting(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const initials = user?.name
    ? user.name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part: string) => part.charAt(0).toUpperCase())
        .join("")
    : "U";

  if (loading) {
    return (
      <div className="meeting-details-page">
        <div className="meeting-details-loading">
          <div className="meeting-details-spinner" />
          <h2>Preparing your meeting</h2>
          <p>Loading meeting information...</p>
        </div>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="meeting-details-page">
        <aside className="meeting-details-sidebar">
          <button
            className="meeting-details-brand"
            onClick={() => navigate("/dashboard")}
            type="button"
          >
            <span className="meeting-details-brand-mark">I</span>
            <span>IntellMeet</span>
          </button>
          <div className="meeting-details-sidebar-bottom">
            <div className="meeting-details-user">
              <div className="meeting-details-avatar">{initials}</div>
              <div className="meeting-details-user-copy">
                <strong>{user?.name || "User"}</strong>
                <span>{user?.email || "Workspace member"}</span>
              </div>
              <button
                type="button"
                className="meeting-details-logout"
                onClick={handleLogout}
                title="Logout"
                aria-label="Logout"
              >
                ↗
              </button>
            </div>
          </div>
        </aside>
        <main className="meeting-details-main">
          <div className="meeting-details-topbar">
            <button
              type="button"
              className="meeting-details-back"
              onClick={() => navigate("/dashboard")}
            >
              <span>←</span> Dashboard
            </button>
            <span className="meeting-details-topbar-tag">MEETING OVERVIEW</span>
          </div>
          <section className="meeting-details-empty">
            <div className="meeting-details-empty-icon">!</div>
            <p className="meeting-details-eyebrow">UNAVAILABLE</p>
            <h1>Meeting not found</h1>
            <p>{error || "This meeting could not be found."}</p>
            <button
              type="button"
              className="meeting-details-primary"
              onClick={() => navigate("/dashboard")}
            >
              Return to dashboard <span>→</span>
            </button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="meeting-details-page">
      <aside className="meeting-details-sidebar">
        <button
          className="meeting-details-brand"
          onClick={() => navigate("/dashboard")}
          type="button"
        >
          <span className="meeting-details-brand-mark">I</span>
          <span>IntellMeet</span>
        </button>

        <div className="meeting-details-nav">
          <p className="meeting-details-nav-label">WORKSPACE</p>
          <button
            type="button"
            className="meeting-details-nav-item"
            onClick={() => navigate("/dashboard")}
          >
            <span className="meeting-details-nav-icon">▦</span>
            Dashboard
          </button>
          <button
            type="button"
            className="meeting-details-nav-item"
            onClick={() => navigate("/meetings/new")}
          >
            <span className="meeting-details-nav-icon">＋</span>
            Create meeting
          </button>
        </div>

        <div className="meeting-details-sidebar-bottom">
          <div className="meeting-details-sidebar-promo">
            <span className="meeting-details-promo-sparkle">✦</span>
            <strong>Make every meeting count</strong>
            <p>Bring your team together and turn conversations into progress.</p>
          </div>

          <div className="meeting-details-user">
            <div className="meeting-details-avatar">{initials}</div>
            <div className="meeting-details-user-copy">
              <strong>{user?.name || "User"}</strong>
              <span>{user?.email || "Workspace member"}</span>
            </div>
            <button
              type="button"
              className="meeting-details-logout"
              onClick={handleLogout}
              title="Logout"
              aria-label="Logout"
            >
              ↗
            </button>
          </div>
        </div>
      </aside>

      <main className="meeting-details-main">
        <header className="meeting-details-topbar">
          <button
            type="button"
            className="meeting-details-back"
            onClick={() => navigate("/dashboard")}
          >
            <span>←</span> Back to dashboard
          </button>
          <span className="meeting-details-topbar-tag">MEETING OVERVIEW</span>
        </header>

        <div className="meeting-details-content">
          <section className="meeting-details-hero">
            <div className="meeting-details-hero-copy">
              <p className="meeting-details-eyebrow">YOUR MEETING</p>
              <h1>{meeting.title}</h1>
              <p>Everything you need to know before joining your session.</p>
            </div>
            <div className="meeting-details-hero-art" aria-hidden="true">
              <div className="meeting-details-art-orbit orbit-one" />
              <div className="meeting-details-art-orbit orbit-two" />
              <div className="meeting-details-art-core">✦</div>
              <span className="meeting-details-art-dot dot-one" />
              <span className="meeting-details-art-dot dot-two" />
            </div>
          </section>

          {error && (
            <div className="meeting-details-error" role="alert">
              <span>!</span> {error}
            </div>
          )}

          <section className="meeting-details-card">
            <div className="meeting-details-card-heading">
              <div>
                <span className="meeting-details-section-kicker">OVERVIEW</span>
                <h2>Meeting details</h2>
                <p>Review the information for this meeting.</p>
              </div>
              <span className="meeting-details-section-number">01</span>
            </div>

            <div className="meeting-details-info-grid">
              <div className="meeting-details-info-block meeting-details-info-wide">
                <span className="meeting-details-field-label">MEETING TITLE</span>
                <div className="meeting-details-field-value meeting-details-title-value">
                  <span className="meeting-details-field-icon">▦</span>
                  {meeting.title}
                </div>
              </div>

              <div className="meeting-details-info-block meeting-details-info-wide">
                <span className="meeting-details-field-label">DESCRIPTION</span>
                <div className="meeting-details-field-value meeting-details-description-value">
                  {meeting.description?.trim() || "No description provided."}
                </div>
              </div>
            </div>

            <div className="meeting-details-card-divider" />

            <div className="meeting-details-card-heading meeting-details-schedule-heading">
              <div>
                <span className="meeting-details-section-kicker">TIMING</span>
                <h2>Schedule</h2>
                <p>Know when your meeting is taking place.</p>
              </div>
              <span className="meeting-details-section-number">02</span>
            </div>

            <div className="meeting-details-schedule-grid">
              <div className="meeting-details-schedule-item">
                <div className="meeting-details-schedule-icon start-icon">↗</div>
                <div>
                  <span className="meeting-details-field-label">START DATE & TIME</span>
                  <strong>{formatDateTime(meeting.startTime)}</strong>
                </div>
              </div>
              <div className="meeting-details-schedule-item">
                <div className="meeting-details-schedule-icon end-icon">↙</div>
                <div>
                  <span className="meeting-details-field-label">END DATE & TIME</span>
                  <strong>{formatDateTime(meeting.endTime)}</strong>
                </div>
              </div>
            </div>

            <div className="meeting-details-status-row">
              <div>
                <span className="meeting-details-field-label">MEETING STATUS</span>
                <p>Current status of this session</p>
              </div>
              <span className={`meeting-details-status ${meeting.status}`}>
                <span className="meeting-details-status-dot" />
                {meeting.status}
              </span>
            </div>

            <footer className="meeting-details-actions">
              <button
                type="button"
                className="meeting-details-delete"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Delete meeting"}
              </button>
              <div className="meeting-details-action-right">
                <button
                  type="button"
                  className="meeting-details-secondary"
                  onClick={() => navigate("/dashboard")}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="meeting-details-primary"
                  onClick={() => navigate(`/meetings/${meeting._id}/room`)}
                >
                  Join meeting <span>→</span>
                </button>
              </div>
            </footer>
          </section>

          <p className="meeting-details-footer-note">
            <span>✦</span> Great meetings lead to great outcomes.
          </p>
        </div>
      </main>
    </div>
  );
};

export default MeetingDetails;
