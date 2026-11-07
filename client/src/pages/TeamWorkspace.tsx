
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import api from "../services/api.js";

interface ProjectMember {
  _id: string;
  name: string;
  email?: string;
}

interface Project {
  _id: string;
  title: string;
  description?: string;
  createdBy: ProjectMember | string;
  members: ProjectMember[];
  createdAt: string;
  updatedAt: string;
}

const TeamWorkspace = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get("/projects");
      setProjects(response.data.projects || []);
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          "Unable to load projects. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreateProject = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (title.trim().length < 2) {
      setError("Project title must contain at least 2 characters.");
      return;
    }

    try {
      setCreating(true);
      setError("");

      const response = await api.post("/projects", {
        title: title.trim(),
        description: description.trim(),
      });

      const newProject: Project = response.data.project;

      setProjects((previous) => [
        newProject,
        ...previous.filter((project) => project._id !== newProject._id),
      ]);

      setTitle("");
      setDescription("");
      setShowCreateForm(false);

      navigate(`/workspace/${newProject._id}`);
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          "Unable to create the project. Please try again."
      );
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const getInitials = (name?: string) => {
    if (!name) return "U";

    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  };

  const formatDate = (date: string) => {
    if (!date) return "Date unavailable";

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) {
      return "Date unavailable";
    }

    return parsed.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="dashboard-layout">
      <aside className="dashboard-sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">I</div>
          <span>IntellMeet</span>
        </div>

        <div className="sidebar-section">
          <p className="sidebar-label">WORKSPACE</p>

          <nav className="sidebar-nav">
            <button
              className="sidebar-nav-item"
              onClick={() => navigate("/dashboard")}
            >
              <span className="nav-icon">▦</span>
              Dashboard
            </button>

            <button
              className="sidebar-nav-item"
              onClick={() => navigate("/meetings/new")}
            >
              <span className="nav-icon">＋</span>
              Create meeting
            </button>

            <button
              className="sidebar-nav-item active"
              onClick={() => navigate("/workspace")}
            >
              <span className="nav-icon">▤</span>
              Team Workspace
            </button>
          </nav>
        </div>

        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <div className="user-avatar">
              {getInitials(user?.name)}
            </div>

            <div className="sidebar-user-info">
              <strong>{user?.name}</strong>
              <span>Workspace member</span>
            </div>
          </div>

          <button className="sidebar-logout" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </aside>

      <main className="dashboard-main workspace-main">
        <header className="dashboard-topbar">
          <div>
            <p className="topbar-eyebrow">COLLABORATION</p>
            <h1>Team Workspace</h1>
          </div>

          <button
            className="dashboard-create-button"
            onClick={() => setShowCreateForm((previous) => !previous)}
          >
            <span>＋</span>
            Create project
          </button>
        </header>

        <section className="workspace-welcome">
          <div>
            <p className="welcome-eyebrow">YOUR TEAM, ONE PLACE</p>
            <h2>Turn ideas into progress.</h2>
            <p>
              Organize projects, collaborate with your team, and
              keep every task moving forward.
            </p>
          </div>

          <div className="workspace-welcome-icon">✦</div>
        </section>

        <section className="workspace-stats">
          <article className="workspace-stat-card">
            <span className="workspace-stat-icon">▤</span>
            <div>
              <p>Total projects</p>
              <h3>{projects.length}</h3>
            </div>
          </article>

          <article className="workspace-stat-card">
            <span className="workspace-stat-icon">♙</span>
            <div>
              <p>Projects you belong to</p>
              <h3>{projects.filter((project) =>
                project.members?.some(
                  (member) =>
                    typeof member === "string"
                      ? member === user?.id
                      : member._id === user?.id
                )
              ).length}</h3>
            </div>
          </article>
        </section>

        {showCreateForm && (
          <section className="workspace-create-card">
            <div className="workspace-section-heading">
              <div>
                <p className="section-eyebrow">GET STARTED</p>
                <h2>Create a project</h2>
              </div>

              <button
                className="workspace-close-button"
                type="button"
                onClick={() => setShowCreateForm(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateProject}>
              <label htmlFor="project-title">Project name</label>
              <input
                id="project-title"
                type="text"
                placeholder="e.g. Website Redesign"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                minLength={2}
                maxLength={100}
                required
              />

              <label htmlFor="project-description">
                Description
              </label>
              <textarea
                id="project-description"
                placeholder="What is this project about?"
                value={description}
                onChange={(event) =>
                  setDescription(event.target.value)
                }
                maxLength={1000}
                rows={3}
              />

              <div className="workspace-form-actions">
                <button
                  type="button"
                  className="workspace-cancel-button"
                  onClick={() => setShowCreateForm(false)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="dashboard-create-button"
                  disabled={creating}
                >
                  {creating ? "Creating..." : "Create project →"}
                </button>
              </div>
            </form>
          </section>
        )}

        {error && (
          <div className="dashboard-error">
            {error}
          </div>
        )}

        <section className="workspace-project-section">
          <div className="workspace-section-heading">
            <div>
              <p className="section-eyebrow">STAY ORGANIZED</p>
              <h2>Your projects</h2>
            </div>

            <button
              className="view-all-button"
              onClick={fetchProjects}
              disabled={loading}
            >
              ↻ Refresh
            </button>
          </div>

          {loading && (
            <div className="dashboard-message">
              <span className="loading-spinner" />
              Loading your projects...
            </div>
          )}

          {!loading && !error && projects.length === 0 && (
            <div className="workspace-empty-state">
              <div className="empty-state-icon">▤</div>
              <h3>No projects yet</h3>
              <p>
                Create your first project to start organizing tasks
                and collaborating with your team.
              </p>

              <button
                className="dashboard-create-button"
                onClick={() => setShowCreateForm(true)}
              >
                ＋ Create your first project
              </button>
            </div>
          )}

          {!loading && projects.length > 0 && (
            <div className="workspace-project-grid">
              {projects.map((project) => {
                const creator =
                  typeof project.createdBy === "object"
                    ? project.createdBy
                    : null;

                return (
                  <article
                    className="workspace-project-card"
                    key={project._id}
                  >
                    <div className="workspace-project-card-top">
                      <span className="workspace-project-icon">
                        ▤
                      </span>

                      <span className="workspace-project-date">
                        {formatDate(project.createdAt)}
                      </span>
                    </div>

                    <h3>{project.title}</h3>

                    <p className="workspace-project-description">
                      {project.description ||
                        "No project description provided."}
                    </p>

                    <div className="workspace-project-meta">
                      <span>
                        ♙ {project.members?.length || 0} members
                      </span>

                      <span>
                        Owner: {creator?.name || "Project creator"}
                      </span>
                    </div>

                    <div className="workspace-project-footer">
                      <div className="workspace-avatar-stack">
                        {project.members?.slice(0, 4).map((member) => (
                          <span
                            className="workspace-member-avatar"
                            title={member.name}
                            key={member._id}
                          >
                            {getInitials(member.name)}
                          </span>
                        ))}

                        {(project.members?.length || 0) > 4 && (
                          <span className="workspace-member-more">
                            +{project.members.length - 4}
                          </span>
                        )}
                      </div>

                      <button
                        className="meeting-open-button"
                        onClick={() =>
                          navigate(`/workspace/${project._id}`)
                        }
                      >
                        Open project →
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default TeamWorkspace;
