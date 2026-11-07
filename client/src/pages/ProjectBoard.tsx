
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import api from "../services/api.js";

type TaskStatus = "todo" | "in-progress" | "review" | "completed";
type TaskPriority = "low" | "medium" | "high";

interface Member {
  _id: string;
  name: string;
  email?: string;
}

interface Project {
  _id: string;
  title: string;
  description?: string;
  createdBy: Member | string;
  members: Member[];
}

interface Task {
  _id: string;
  title: string;
  description?: string;
  assignedTo: Member | null;
  createdBy: Member | string;
  dueDate: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  createdAt: string;
}

interface AvailableUser {
  _id: string;
  name: string;
  email: string;
}

const columns: { status: TaskStatus; title: string }[] = [
  { status: "todo", title: "To Do" },
  { status: "in-progress", title: "In Progress" },
  { status: "review", title: "Review" },
  { status: "completed", title: "Completed" },
];

const ProjectBoard = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updatingTask, setUpdatingTask] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");

  // Project member management
const [showMembersModal, setShowMembersModal] = useState(false);
const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
const [loadingUsers, setLoadingUsers] = useState(false);
const [addingMember, setAddingMember] = useState(false);
const [removingMember, setRemovingMember] = useState<string | null>(null);
const [memberError, setMemberError] = useState("");
const [selectedMemberId, setSelectedMemberId] = useState("");

  const fetchBoard = useCallback(async () => {
    if (!projectId) return;

    try {
      setLoading(true);
      setError("");

      const [projectResponse, taskResponse] = await Promise.all([
        api.get(`/projects/${projectId}`),
        api.get(`/tasks/project/${projectId}`),
      ]);

      setProject(
        projectResponse.data.project || projectResponse.data
      );
      setTasks(taskResponse.data.tasks || []);
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          "Unable to load this project. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  const handleCreateTask = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (!projectId) return;

    if (title.trim().length < 2) {
      setError("Task title must contain at least 2 characters.");
      return;
    }

    try {
      setCreating(true);
      setError("");

      const response = await api.post(`/tasks/project/${projectId}`, {
        title: title.trim(),
        description: description.trim(),
        assignedTo: assignedTo || undefined,
        priority,
        dueDate: dueDate || undefined,
        status: "todo",
      });

      setTasks((previous) => [
        response.data.task,
        ...previous,
      ]);

      setTitle("");
      setDescription("");
      setAssignedTo("");
      setPriority("medium");
      setDueDate("");
      setShowForm(false);
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          "Unable to create task. Please try again."
      );
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (
    taskId: string,
    status: TaskStatus
  ) => {
    try {
      setUpdatingTask(taskId);
      setError("");

      const response = await api.put(`/tasks/${taskId}`, {
        status,
      });

      setTasks((previous) =>
        previous.map((task) =>
          task._id === taskId ? response.data.task : task
        )
      );
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          "Unable to update task status."
      );
    } finally {
      setUpdatingTask(null);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this task?"
    );

    if (!confirmed) return;

    try {
      setError("");
      await api.delete(`/tasks/${taskId}`);

      setTasks((previous) =>
        previous.filter((task) => task._id !== taskId)
      );
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          "Unable to delete this task."
      );
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

  const formatDate = (date: string | null) => {
    if (!date) return "No due date";

    const parsed = new Date(date);

    if (Number.isNaN(parsed.getTime())) return "No due date";

    return parsed.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const getCreatorId = () =>
    typeof project?.createdBy === "object"
      ? project.createdBy._id
      : project?.createdBy;

      const isProjectCreator = getCreatorId() === user?.id;

const handleOpenMembers = async () => {
  setShowMembersModal(true);
  setMemberError("");
  setSelectedMemberId("");
  setLoadingUsers(true);

  try {
    const response = await api.get("/auth/users");

    const users: AvailableUser[] = response.data.users || [];

    setAvailableUsers(users);
  } catch (error: any) {
    console.error("Unable to load users:", error);
    setMemberError(
      error.response?.data?.message || "Unable to load registered users."
    );
  } finally {
    setLoadingUsers(false);
  }
};

const handleAddMember = async () => {
  if (!projectId || !selectedMemberId) {
    setMemberError("Please select a user.");
    return;
  }

  setAddingMember(true);
  setMemberError("");

  try {
    const response = await api.post(
      `/projects/${projectId}/members`,
      { memberId: selectedMemberId }
    );

    setProject(response.data.project);
    setSelectedMemberId("");
  } catch (error: any) {
    setMemberError(
      error.response?.data?.message || "Unable to add project member."
    );
  } finally {
    setAddingMember(false);
  }
};

const handleRemoveMember = async (memberId: string) => {
  if (!projectId) return;

  const confirmed = window.confirm(
    "Are you sure you want to remove this member from the project?"
  );

  if (!confirmed) return;

  setRemovingMember(memberId);
  setMemberError("");

  try {
    const response = await api.delete(
      `/projects/${projectId}/members/${memberId}`
    );

    setProject(response.data.project);
  } catch (error: any) {
    setMemberError(
      error.response?.data?.message || "Unable to remove project member."
    );
  } finally {
    setRemovingMember(null);
  }
};
  if (loading) {
    return (
      <div className="project-board-loading">
        <span className="loading-spinner" />
        Loading project board...
      </div>
    );
  }

  if (!project) {
    return (
      <div className="project-board-loading">
        <p>{error || "Project not found."}</p>
        <button onClick={() => navigate("/workspace")}>
          Back to workspace
        </button>
      </div>
    );
  }

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

      <main className="dashboard-main project-board-main">
        <header className="dashboard-topbar">
          <div>
            <p className="topbar-eyebrow">
              <button
                className="project-breadcrumb"
                onClick={() => navigate("/workspace")}
              >
                Team Workspace
              </button>
              {" / PROJECT"}
            </p>
            <h1>{project.title}</h1>
          </div>

          <button
            className="dashboard-create-button"
            onClick={() => setShowForm((previous) => !previous)}
          >
            <span>＋</span>
            Add task
          </button>
        </header>

        <section className="project-board-intro">
          <div>
            <p>
              {project.description ||
                "Manage your team's tasks and project progress."}
            </p>
            <span>
              ♙ {project.members?.length || 0} project members
            </span>
          </div>

          <div className="project-board-actions">
              <button
                className="view-all-button"
                onClick={handleOpenMembers}
              >
                ♙ Manage Members
              </button>

              <button
                className="view-all-button"
                onClick={fetchBoard}
              >
                ↻ Refresh board
              </button>
            </div>
        </section>

        <section className="project-board-summary">
          <div>
            <span>Total tasks</span>
            <strong>{tasks.length}</strong>
          </div>

          <div>
            <span>In progress</span>
            <strong>
              {tasks.filter((task) => task.status === "in-progress").length}
            </strong>
          </div>

          <div>
            <span>In review</span>
            <strong>
              {tasks.filter((task) => task.status === "review").length}
            </strong>
          </div>

          <div>
            <span>Completed</span>
            <strong>
              {tasks.filter((task) => task.status === "completed").length}
            </strong>
          </div>
        </section>

        {error && (
          <div className="dashboard-error project-board-error">
            {error}
          </div>
        )}

        {showForm && (
          <section className="workspace-create-card project-task-form">
            <div className="workspace-section-heading">
              <div>
                <p className="section-eyebrow">PROJECT MANAGEMENT</p>
                <h2>Create a task</h2>
              </div>

              <button
                className="workspace-close-button"
                onClick={() => setShowForm(false)}
                type="button"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTask}>
              <label htmlFor="task-title">Task title</label>
              <input
                id="task-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="What needs to be done?"
                minLength={2}
                maxLength={150}
                required
              />

              <label htmlFor="task-description">Description</label>
              <textarea
                id="task-description"
                value={description}
                onChange={(event) =>
                  setDescription(event.target.value)
                }
                placeholder="Describe this task..."
                rows={3}
                maxLength={2000}
              />

              <div className="project-task-form-grid">
                <div>
                  <label htmlFor="task-assignee">Assign to</label>
                  <select
                    id="task-assignee"
                    value={assignedTo}
                    onChange={(event) =>
                      setAssignedTo(event.target.value)
                    }
                  >
                    <option value="">Unassigned</option>
                    {project.members?.map((member) => (
                      <option key={member._id} value={member._id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="task-priority">Priority</label>
                  <select
                    id="task-priority"
                    value={priority}
                    onChange={(event) =>
                      setPriority(event.target.value as TaskPriority)
                    }
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="task-due-date">Due date</label>
                  <input
                    id="task-due-date"
                    type="date"
                    value={dueDate}
                    onChange={(event) =>
                      setDueDate(event.target.value)
                    }
                  />
                </div>
              </div>

              <div className="workspace-form-actions">
                <button
                  type="button"
                  className="workspace-cancel-button"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="dashboard-create-button"
                  disabled={creating}
                >
                  {creating ? "Creating..." : "Create task →"}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="kanban-board">
          {columns.map((column) => {
            const columnTasks = tasks.filter(
              (task) => task.status === column.status
            );

            return (
              <div
                className={`kanban-column kanban-${column.status}`}
                key={column.status}
              >
                <div className="kanban-column-heading">
                  <div>
                    <span className="kanban-status-dot" />
                    <h3>{column.title}</h3>
                  </div>
                  <span className="kanban-count">
                    {columnTasks.length}
                  </span>
                </div>

                <div className="kanban-task-list">
                  {columnTasks.map((task) => {
                    const isCreator =
                      (typeof task.createdBy === "object"
                        ? task.createdBy._id
                        : task.createdBy) === user?.id;

                    const canDelete =
                      isCreator || getCreatorId() === user?.id;

                    return (
                      <article
                        className="kanban-task-card"
                        key={task._id}
                      >
                        <div className="kanban-task-top">
                          <span
                            className={`task-priority priority-${task.priority}`}
                          >
                            {task.priority}
                          </span>

                          {canDelete && (
                            <button
                              className="task-delete-button"
                              title="Delete task"
                              onClick={() =>
                                handleDeleteTask(task._id)
                              }
                            >
                              ×
                            </button>
                          )}
                        </div>

                        <h4>{task.title}</h4>

                        {task.description && (
                          <p className="kanban-task-description">
                            {task.description}
                          </p>
                        )}

                        <div className="kanban-task-assignee">
                          <span className="workspace-member-avatar">
                            {getInitials(task.assignedTo?.name)}
                          </span>
                          <span>
                            {task.assignedTo?.name || "Unassigned"}
                          </span>
                        </div>

                        <div className="kanban-task-due">
                          <span>◷</span>
                          {formatDate(task.dueDate)}
                        </div>

                        <div className="kanban-task-footer">
                          <label htmlFor={`status-${task._id}`}>
                            Move to
                          </label>

                          <select
                            id={`status-${task._id}`}
                            value={task.status}
                            disabled={updatingTask === task._id}
                            onChange={(event) =>
                              handleStatusChange(
                                task._id,
                                event.target.value as TaskStatus
                              )
                            }
                          >
                            {columns.map((option) => (
                              <option
                                key={option.status}
                                value={option.status}
                              >
                                {option.title}
                              </option>
                            ))}
                          </select>
                        </div>
                      </article>
                    );
                  })}

                  {columnTasks.length === 0 && (
                    <div className="kanban-empty">
                      No tasks here yet
                    </div>
                  )}
                </div>

                <button
                  className="kanban-add-task"
                  onClick={() => setShowForm(true)}
                >
                  ＋ Add task
                </button>
              </div>
            );
          })}
        </section>
      </main>
      {/* Project Member Management Modal */}
{showMembersModal && (
  <div
    className="members-modal-overlay"
    onClick={(event) => {
      if (event.target === event.currentTarget) {
        setShowMembersModal(false);
      }
    }}
  >
    <div
      className="members-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="members-modal-title"
    >
      <div className="members-modal-header">
        <div>
          <p className="section-eyebrow">PROJECT TEAM</p>
          <h2 id="members-modal-title">Manage Members</h2>
          <p>Manage who can collaborate on this project.</p>
        </div>

        <button
          type="button"
          className="workspace-close-button"
          onClick={() => setShowMembersModal(false)}
        >
          ×
        </button>
      </div>

      {memberError && (
        <div className="dashboard-error">{memberError}</div>
      )}

      <div className="members-list-heading">
        <h3>Current members</h3>
        <span>
          {project.members?.length || 0}{" "}
          {(project.members?.length || 0) === 1 ? "member" : "members"}
        </span>
      </div>

      <div className="members-list">
        {project.members?.map((member) => {
          const isCreator = member._id === getCreatorId();

          return (
            <div className="members-list-item" key={member._id}>
              <div className="members-list-user">
                <span className="workspace-member-avatar">
                  {getInitials(member.name)}
                </span>

                <div>
                  <strong>{member.name}</strong>
                  <span>{member.email || "Project member"}</span>
                </div>
              </div>

              <div className="members-list-actions">
                {isCreator ? (
                  <span className="project-owner-label">Owner</span>
                ) : isProjectCreator ? (
                  <button
                    type="button"
                    className="member-remove-button"
                    onClick={() => handleRemoveMember(member._id)}
                    disabled={removingMember === member._id}
                  >
                    {removingMember === member._id
                      ? "Removing..."
                      : "Remove"}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}

        {(!project.members || project.members.length === 0) && (
          <p>No project members found.</p>
        )}
      </div>

      {isProjectCreator && (
        <div className="members-add-section">
          <label htmlFor="add-project-member">
            Add registered user
          </label>

          <div className="members-add-row">
            <select
              id="add-project-member"
              value={selectedMemberId}
              onChange={(event) =>
                setSelectedMemberId(event.target.value)
              }
              disabled={loadingUsers || addingMember}
            >
              <option value="">
                {loadingUsers
                  ? "Loading users..."
                  : "Select a user"}
              </option>

              {availableUsers
                .filter(
                  (availableUser) =>
                    !project.members.some(
                      (member) => member._id === availableUser._id
                    )
                )
                .map((availableUser) => (
                  <option
                    key={availableUser._id}
                    value={availableUser._id}
                  >
                    {availableUser.name} ({availableUser.email})
                  </option>
                ))}
            </select>

            <button
              type="button"
              className="dashboard-create-button"
              onClick={handleAddMember}
              disabled={!selectedMemberId || addingMember}
            >
              {addingMember ? "Adding..." : "＋ Add"}
            </button>
          </div>
        </div>
      )}

      <div className="members-modal-footer">
        <button
          type="button"
          className="workspace-cancel-button"
          onClick={() => setShowMembersModal(false)}
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}
    </div>
  );
};

export default ProjectBoard;
