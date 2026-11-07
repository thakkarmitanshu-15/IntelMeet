import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api.js";

interface User {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
}

const CreateMeeting = () => {
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [participants, setParticipants] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  

const [participantSearch, setParticipantSearch] = useState("");

const filteredUsers = users.filter((user) => {
  const search = participantSearch.toLowerCase().trim();

  return (
    user.name.toLowerCase().includes(search) ||
    user.email.toLowerCase().includes(search)
  );
});

const selectedUsers = users.filter((user) =>
  participants.includes(user._id)
);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await api.get("/auth/users");
        setUsers(response.data.users ?? []);
      } catch (error) {
        console.error("Failed to fetch users:", error);
        setError("Unable to load users. Please try again.");
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchUsers();
  }, []);

  const handleParticipantChange = (userId: string) => {
    setParticipants((currentParticipants) =>
      currentParticipants.includes(userId)
        ? currentParticipants.filter((id) => id !== userId)
        : [...currentParticipants, userId]
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (new Date(endTime) <= new Date(startTime)) {
      setError("End time must be after the start time.");
      return;
    }

    setSubmitting(true);

    const filteredUsers = users.filter((user) => {
      const search = participantSearch.toLowerCase();

      return (
        user.name.toLowerCase().includes(search) ||
        user.email.toLowerCase().includes(search)
      );
    });

    const selectedUsers = users.filter((user) =>
      participants.includes(user._id)
    );

    try {
      await api.post("/meetings", {
        title,
        description,
        participants,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
      });

      navigate("/dashboard");
    } catch (error) {
      console.error("Create meeting error:", error);
      setError("Unable to create meeting. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="create-meeting-page">
      <aside className="create-meeting-sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">I</div>
          <span>IntellMeet</span>
        </div>

        <div className="create-sidebar-content">
          <p className="sidebar-label">WORKSPACE</p>

          <button
            className="sidebar-nav-item"
            onClick={() => navigate("/dashboard")}
          >
            <span className="nav-icon">▦</span>
            Dashboard
          </button>

          <button className="sidebar-nav-item active">
            <span className="nav-icon">＋</span>
            Create meeting
          </button>

          <button
            className="sidebar-nav-item"
            onClick={() => navigate("/workspace")}
          >
            <span className="nav-icon">▤</span>
            Team Workspace
          </button>
        </div>

        <div className="create-sidebar-bottom">
          <div className="create-sidebar-note">
            <div className="note-icon">✦</div>
            <strong>Make every meeting count</strong>
            <p>
              Bring your team together and turn conversations into progress.
            </p>
          </div>
        </div>
      </aside>

      <main className="create-meeting-main">
        <header className="create-meeting-topbar">
          <button
            className="back-button"
            onClick={() => navigate("/dashboard")}
          >
            ← Back to dashboard
          </button>

          <span className="create-topbar-label">MEETING SCHEDULER</span>
        </header>

        <div className="create-meeting-content">
          <div className="create-meeting-heading">
            <div className="create-heading-icon">＋</div>
            <p className="section-eyebrow">PLAN YOUR NEXT CONVERSATION</p>
            <h1>Create a meeting</h1>
            <p>
              Set up your meeting details and get your team ready to connect.
            </p>
          </div>

          <form className="create-meeting-form" onSubmit={handleSubmit}>
            <div className="form-section-heading">
              <div>
                <h2>Meeting details</h2>
                <p>Give your meeting a name and a little context.</p>
              </div>

              <span className="form-section-number">01</span>
            </div>

            {error && <div className="create-form-error">{error}</div>}

            <div className="create-form-group">
              <label htmlFor="title">Meeting title *</label>
              <input
                id="title"
                type="text"
                placeholder="e.g. Weekly team sync"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </div>

            <div className="create-form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                placeholder="What would you like to discuss?"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
              />
              <span className="field-hint">
                Add an agenda or any important meeting information.
              </span>
            </div>

           <div className="form-section-heading schedule-heading">
  <div>
    <h2>Participants</h2>
    <p>Select the team members you want to invite.</p>
  </div>

  <span className="form-section-number">02</span>
</div>

<div className="participant-selector">
  <div className="participant-selector-header">
    <div>
      <strong>Invite team members</strong>
      <p>Search and select people for this meeting.</p>
    </div>

    <span className="participant-count">
      {participants.length} selected
    </span>
  </div>

  <div className="participant-search">
    <span>⌕</span>
    <input
      type="text"
      placeholder="Search by name or email..."
      value={participantSearch}
      onChange={(event) => setParticipantSearch(event.target.value)}
    />
  </div>

  {selectedUsers.length > 0 && (
    <div className="selected-participants">
      <p>Selected participants</p>

      <div className="selected-participant-chips">
        {selectedUsers.map((user) => (
          <div className="selected-participant-chip" key={user._id}>
            <span className="selected-avatar">
              {user.name.charAt(0).toUpperCase()}
            </span>

            <span>{user.name}</span>

            <button
              type="button"
              aria-label={`Remove ${user.name}`}
              onClick={() => handleParticipantChange(user._id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )}

  <div className="participant-results">
    {loadingUsers ? (
      <p className="participant-empty">Loading team members...</p>
    ) : filteredUsers.length === 0 ? (
      <p className="participant-empty">
        No matching team members found.
      </p>
    ) : (
      filteredUsers.map((user) => {
        const isSelected = participants.includes(user._id);

        return (
          <label
            key={user._id}
            className={`participant-option ${
              isSelected ? "selected" : ""
            }`}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => handleParticipantChange(user._id)}
            />

            <span className="participant-avatar">
              {user.name.charAt(0).toUpperCase()}
            </span>

            <span className="participant-info">
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </span>

            <span className="participant-selection-indicator">
              {isSelected ? "Selected" : "Select"}
            </span>
          </label>
        );
      })
    )}
  </div>
</div>

            

            <div className="form-section-heading schedule-heading">
              <div>
                <h2>Schedule</h2>
                <p>Choose when your meeting will take place.</p>
              </div>

              <span className="form-section-number">03</span>
            </div>

            <div className="create-form-date-grid">
              <div className="create-form-group">
                <label htmlFor="startTime">Start date and time *</label>
                <input
                  id="startTime"
                  type="datetime-local"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  required
                />
              </div>

              <div className="create-form-group">
                <label htmlFor="endTime">End date and time *</label>
                <input
                  id="endTime"
                  type="datetime-local"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="create-form-footer">
              <button
                type="button"
                className="create-cancel-button"
                onClick={() => navigate("/dashboard")}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="create-submit-button"
                disabled={submitting || loadingUsers}
              >
                {submitting ? "Creating meeting..." : "Create meeting"}
                {!submitting && <span>→</span>}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
};

export default CreateMeeting;