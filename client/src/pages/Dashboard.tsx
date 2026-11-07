
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import api from "../services/api.js";
import { socket } from "../socket/socket.js";

interface Meeting {
  _id: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  status: "scheduled" | "in-progress" | "completed" | "cancelled";
}

interface SummaryActionItem {
  task: string;
  assignee: string | null;
  dueDate: string | null;
  priority: "high" | "medium" | "low";
}

interface MeetingSummaryData {
  _id?: string;
  summary: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: SummaryActionItem[];
  modelName?: string;
  createdAt?: string;
}

interface SummaryState {
  summary?: MeetingSummaryData;
  loading: boolean;
  error: string;
  loaded: boolean;
}

interface ProjectMember {
  _id: string;
  name: string;
  email: string;
}

interface TaskProject {
  _id: string;
  title: string;
  members: ProjectMember[];
}

interface NotificationUser {
  _id: string;
  name: string;
  email?: string;
}

interface NotificationReference {
  _id: string;
  title: string;
}

interface AppNotification {
  _id: string;
  recipient: string;
  sender?: NotificationUser | null;
  type: "task-assigned" | "meeting-action-item" | "mention";
  title: string;
  message: string;
  relatedMeeting?: NotificationReference | null;
  relatedProject?: NotificationReference | null;
  relatedTask?: NotificationReference | null;
  isRead: boolean;
  createdAt: string;
}

const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [expandedSummary, setExpandedSummary] = useState<string | null>(
    null
  );

  const [summaries, setSummaries] = useState<
    Record<string, SummaryState>
  >({});

  // AI action item task creation
  const [taskProjects, setTaskProjects] = useState<TaskProject[]>([]);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskProjectsLoading, setTaskProjectsLoading] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskError, setTaskError] = useState("");

  const [selectedActionItem, setSelectedActionItem] =
    useState<SummaryActionItem | null>(null);

  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedAssignee, setSelectedAssignee] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskPriority, setTaskPriority] = useState<
    "high" | "medium" | "low"
  >("medium");
  const [taskDueDate, setTaskDueDate] = useState("");
  // Notifications
const [notifications, setNotifications] = useState<AppNotification[]>([]);
const [unreadCount, setUnreadCount] = useState(0);
const [notificationOpen, setNotificationOpen] = useState(false);
const [notificationLoading, setNotificationLoading] = useState(true);
const [notificationError, setNotificationError] = useState("");
const [notificationActionLoading, setNotificationActionLoading] =
  useState(false);

  useEffect(() => {
    const fetchMeetings = async () => {
      try {
        const response = await api.get("/meetings");
        setMeetings(response.data.meetings || []);
      } catch {
        setError("Unable to load meetings. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchMeetings();
  }, []);

  // Load notifications and listen for real-time updates
useEffect(() => {
  let mounted = true;

  const handleNewNotification = (notification: AppNotification) => {
    if (!notification?._id) return;

    setNotifications((previous) => {
      if (previous.some((item) => item._id === notification._id)) {
        return previous;
      }

      return [notification, ...previous].slice(0, 50);
    });

    if (!notification.isRead) {
      setUnreadCount((previous) => previous + 1);
    }
  };

  socket.on("new-notification", handleNewNotification);

  if (!socket.connected) {
    socket.connect();
  }

  const fetchNotifications = async () => {
    try {
      const response = await api.get("/notifications");

      if (!mounted) return;

      const fetchedNotifications: AppNotification[] =
        response.data.notifications || [];

      setNotifications((previous) => {
        const merged = [...fetchedNotifications, ...previous];
        const unique = Array.from(
          new Map(merged.map((item) => [item._id, item])).values()
        );

        return unique
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() -
              new Date(a.createdAt).getTime()
          )
          .slice(0, 50);
      });

      setUnreadCount(
        typeof response.data.unreadCount === "number"
          ? response.data.unreadCount
          : fetchedNotifications.filter((item) => !item.isRead).length
      );
    } catch (error) {
      console.error("Failed to load notifications:", error);

      if (mounted) {
        setNotificationError("Unable to load notifications.");
      }
    } finally {
      if (mounted) {
        setNotificationLoading(false);
      }
    }
  };

  fetchNotifications();

  return () => {
    mounted = false;
    socket.off("new-notification", handleNewNotification);
  };
}, []);

const handleMarkNotificationRead = async (notificationId: string) => {
  const notification = notifications.find(
    (item) => item._id === notificationId
  );

  if (!notification || notification.isRead) return;

  try {
    await api.put(`/notifications/${notificationId}/read`);

    setNotifications((previous) =>
      previous.map((item) =>
        item._id === notificationId ? { ...item, isRead: true } : item
      )
    );

    setUnreadCount((previous) => Math.max(0, previous - 1));
  } catch (error) {
    console.error("Failed to mark notification as read:", error);
  }
};

const handleMarkAllNotificationsRead = async () => {
  setNotificationActionLoading(true);

  try {
    await api.put("/notifications/read-all");

    setNotifications((previous) =>
      previous.map((item) => ({ ...item, isRead: true }))
    );

    setUnreadCount(0);
  } catch (error) {
    console.error("Failed to mark all notifications as read:", error);
  } finally {
    setNotificationActionLoading(false);
  }
};

const handleDeleteNotification = async (notificationId: string) => {
  const notification = notifications.find(
    (item) => item._id === notificationId
  );

  try {
    await api.delete(`/notifications/${notificationId}`);

    setNotifications((previous) =>
      previous.filter((item) => item._id !== notificationId)
    );

    if (notification && !notification.isRead) {
      setUnreadCount((previous) => Math.max(0, previous - 1));
    }
  } catch (error) {
    console.error("Failed to delete notification:", error);
  }
};

const handleOpenNotification = async (notification: AppNotification) => {
  await handleMarkNotificationRead(notification._id);

  setNotificationOpen(false);

  if (notification.relatedProject?._id) {
    navigate(`/workspace/${notification.relatedProject._id}`);
  } else if (notification.relatedMeeting?._id) {
    navigate(`/meetings/${notification.relatedMeeting._id}`);
  }
};

const formatNotificationTime = (date: string) => {
  const timestamp = new Date(date).getTime();

  if (Number.isNaN(timestamp)) return "";

  const difference = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(difference / 60000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);

  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);

  if (days < 7) return `${days}d ago`;

  return new Date(date).toLocaleDateString();
};

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const upcomingMeetings = meetings.filter(
    (meeting) =>
      meeting.status === "scheduled" &&
      new Date(meeting.startTime) >= new Date()
  );

  const completedMeetings = meetings.filter(
    (meeting) => meeting.status === "completed"
  );

  const handleJoinMeeting = (meetingId: string) => {
    navigate(`/meetings/${meetingId}`);
  };

  const handleSummaryToggle = async (meetingId: string) => {
    if (expandedSummary === meetingId) {
      setExpandedSummary(null);
      return;
    }

    setExpandedSummary(meetingId);

    if (summaries[meetingId]?.loaded || summaries[meetingId]?.loading) {
      return;
    }

    setSummaries((previous) => ({
      ...previous,
      [meetingId]: {
        loading: true,
        error: "",
        loaded: false,
      },
    }));

    try {
      const response = await api.get(`/summaries/${meetingId}`);

      setSummaries((previous) => ({
        ...previous,
        [meetingId]: {
          summary: response.data.summary,
          loading: false,
          error: "",
          loaded: true,
        },
      }));
    } catch (error: any) {
      const message =
        error.response?.status === 404
          ? "No AI summary has been generated for this meeting yet."
          : "Unable to load the AI summary. Please try again.";

      setSummaries((previous) => ({
        ...previous,
        [meetingId]: {
          loading: false,
          error: message,
          loaded: true,
        },
      }));
    }
  };

  const formatDate = (date: string) => {
    if (!date) return "Not specified";

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return "Not specified";
    }

    return parsedDate.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatPriority = (priority: string) => {
    return priority.charAt(0).toUpperCase() + priority.slice(1);
  };

  // Open task creation modal
  const handleOpenTaskModal = async (item: SummaryActionItem) => {
    setSelectedActionItem(item);
    setTaskTitle(item.task);
    setTaskPriority(item.priority || "medium");
    setTaskDueDate(item.dueDate ? item.dueDate.substring(0, 10) : "");
    setSelectedProjectId("");
    setSelectedAssignee("");
    setTaskError("");
    setTaskProjects([]);
    setTaskModalOpen(true);
    setTaskProjectsLoading(true);

    try {
      const response = await api.get("/projects");

      const projects: TaskProject[] = response.data.projects || [];

      setTaskProjects(projects);

      if (projects.length === 0) {
        setTaskError(
          "No projects found. Create a project in Team Workspace first."
        );
      }
    } catch (error) {
      console.error("Failed to load projects:", error);
      setTaskError("Unable to load projects. Please try again.");
    } finally {
      setTaskProjectsLoading(false);
    }
  };

  // Create task from AI action item
  const handleCreateActionTask = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (!selectedProjectId || !taskTitle.trim()) {
      setTaskError("Please select a project and enter a task title.");
      return;
    }

    setTaskSaving(true);
    setTaskError("");

    try {
      await api.post(`/tasks/project/${selectedProjectId}`, {
        title: taskTitle.trim(),
        description:
          "Created from an AI-generated meeting action item.",
        assignedTo: selectedAssignee || null,
        priority: taskPriority,
        dueDate: taskDueDate
          ? new Date(`${taskDueDate}T12:00:00`).toISOString()
          : null,
        status: "todo",
      });

      setTaskModalOpen(false);
      setSelectedActionItem(null);
      setTaskTitle("");
      setSelectedProjectId("");
      setSelectedAssignee("");
      setTaskDueDate("");
    } catch (error: any) {
      console.error("Failed to create action item task:", error);

      setTaskError(
        error.response?.data?.message ||
          "Unable to create task. Please try again."
      );
    } finally {
      setTaskSaving(false);
    }
  };

  return (
    <div className="dashboard-layout">
      {/* Sidebar */}
      <aside className="dashboard-sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">I</div>
          <span>IntellMeet</span>
        </div>

        <div className="sidebar-section">
          <p className="sidebar-label">WORKSPACE</p>

          <nav className="sidebar-nav">
            <button
              className="sidebar-nav-item active"
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
              className="sidebar-nav-item"
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
              {user?.name?.charAt(0).toUpperCase() || "U"}
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

      {/* Main Content */}
      <main className="dashboard-main">
       <header className="dashboard-topbar">
  <div>
    <p className="topbar-eyebrow">WORKSPACE</p>
    <h1>Dashboard</h1>
  </div>

  <div className="dashboard-topbar-actions">
    <div className="notification-wrapper">
      <button
        type="button"
        className={`notification-bell ${
          notificationOpen ? "notification-bell-active" : ""
        }`}
        onClick={() => setNotificationOpen((previous) => !previous)}
        aria-label={`Notifications, ${unreadCount} unread`}
        aria-expanded={notificationOpen}
      >
        <span className="notification-bell-icon">♧</span>

        {unreadCount > 0 && (
          <span className="notification-count">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {notificationOpen && (
        <div className="notification-panel">
          <div className="notification-panel-header">
            <div>
              <h3>Notifications</h3>
              <p>
                {unreadCount > 0
                  ? `${unreadCount} unread notifications`
                  : "You're all caught up"}
              </p>
            </div>

            <button
              type="button"
              className="notification-close"
              onClick={() => setNotificationOpen(false)}
              aria-label="Close notifications"
            >
              ×
            </button>
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              className="notification-mark-all"
              onClick={handleMarkAllNotificationsRead}
              disabled={notificationActionLoading}
            >
              {notificationActionLoading
                ? "Updating..."
                : "Mark all as read"}
            </button>
          )}

          <div className="notification-list">
            {notificationLoading && (
              <div className="notification-empty">
                Loading notifications...
              </div>
            )}

            {!notificationLoading && notificationError && (
              <div className="notification-empty notification-error">
                {notificationError}
              </div>
            )}

            {!notificationLoading &&
              !notificationError &&
              notifications.length === 0 && (
                <div className="notification-empty">
                  <span className="notification-empty-icon">♧</span>
                  <strong>No notifications yet</strong>
                  <p>New task assignments and updates will appear here.</p>
                </div>
              )}

            {!notificationLoading &&
              notifications.map((notification) => (
                <div
                  key={notification._id}
                  className={`notification-item ${
                    notification.isRead ? "" : "notification-unread"
                  }`}
                >
                  <button
                    type="button"
                    className="notification-item-content"
                    onClick={() =>
                      handleOpenNotification(notification)
                    }
                  >
                    <span className="notification-item-icon">
                      {notification.type === "task-assigned"
                        ? "✓"
                        : notification.type === "mention"
                          ? "@"
                          : "✦"}
                    </span>

                    <span className="notification-item-details">
                      <strong>{notification.title}</strong>
                      <span>{notification.message}</span>
                      <small>
                        {notification.sender?.name
                          ? `From ${notification.sender.name} · `
                          : ""}
                        {formatNotificationTime(notification.createdAt)}
                      </small>
                    </span>

                    {!notification.isRead && (
                      <span className="notification-unread-dot" />
                    )}
                  </button>

                  <button
                    type="button"
                    className="notification-delete"
                    aria-label="Delete notification"
                    onClick={() =>
                      handleDeleteNotification(notification._id)
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>

    <button
      className="dashboard-create-button"
      onClick={() => navigate("/meetings/new")}
    >
      <span>＋</span>
      Create meeting
    </button>
  </div>
</header>

        {/* Welcome */}
        <section className="dashboard-welcome">
          <div className="welcome-content">
            <p className="welcome-eyebrow">YOUR MEETING SPACE</p>

            <h2>
              Welcome back, {user?.name?.split(" ")[0] || "there"}!
            </h2>

            <p>
              Bring your team together and make every conversation count.
            </p>

            <button
              className="welcome-button"
              onClick={() => navigate("/meetings/new")}
            >
              Schedule a meeting
              <span>→</span>
            </button>
          </div>

          <div className="welcome-visual">
            <div className="visual-circle circle-one" />
            <div className="visual-circle circle-two" />

            <div className="visual-meeting-card">
              <div className="visual-card-top">
                <span className="visual-dot" />
                <span>TEAM MEETING</span>
              </div>

              <div className="visual-avatars">
                <span>A</span>
                <span>M</span>
                <span>J</span>
                <span>+</span>
              </div>

              <div className="visual-card-bottom">
                <span>Connecting your team</span>
                <span>•••</span>
              </div>
            </div>
          </div>
        </section>

        {/* Meeting Statistics */}
        <section className="dashboard-stats">
          <article className="stat-card">
            <div className="stat-card-top">
              <span className="stat-icon purple">▦</span>
              <span className="stat-label">All meetings</span>
            </div>

            <h3>{meetings.length}</h3>
            <p>Total meetings in your workspace</p>
          </article>

          <article className="stat-card">
            <div className="stat-card-top">
              <span className="stat-icon blue">◷</span>
              <span className="stat-label">Upcoming</span>
            </div>

            <h3>{upcomingMeetings.length}</h3>
            <p>Meetings scheduled ahead</p>
          </article>

          <article className="stat-card">
            <div className="stat-card-top">
              <span className="stat-icon green">✓</span>
              <span className="stat-label">Completed</span>
            </div>

            <h3>{completedMeetings.length}</h3>
            <p>Meetings successfully completed</p>
          </article>
        </section>

        {/* Meeting History */}
        <section className="dashboard-meetings">
          <div className="meetings-heading">
            <div>
              <p className="section-eyebrow">STAY ORGANIZED</p>
              <h2>Your meetings</h2>
            </div>

            <button
              className="view-all-button"
              onClick={() => navigate("/meetings/new")}
            >
              + New meeting
            </button>
          </div>

          {loading && (
            <div className="dashboard-message">
              <span className="loading-spinner" />
              Loading your meetings...
            </div>
          )}

          {error && <div className="dashboard-error">{error}</div>}

          {!loading && !error && meetings.length === 0 && (
            <div className="meetings-empty-state">
              <div className="empty-state-icon">▦</div>
              <h3>No meetings yet</h3>

              <p>
                Your meetings will appear here. Create your first meeting
                to get started.
              </p>

              <button
                className="dashboard-create-button"
                onClick={() => navigate("/meetings/new")}
              >
                ＋ Create your first meeting
              </button>
            </div>
          )}

          {!loading && !error && meetings.length > 0 && (
            <div className="dashboard-meetings-grid">
              {meetings.map((meeting) => {
                const summaryState = summaries[meeting._id];
                const isExpanded =
                  expandedSummary === meeting._id;

                return (
                  <article
                    className="dashboard-meeting-card"
                    key={meeting._id}
                  >
                    <div className="meeting-card-header">
                      <span
                        className={`meeting-status status-${meeting.status}`}
                      >
                        <span className="status-dot" />
                        {meeting.status.replace("-", " ")}
                      </span>

                      <span className="meeting-card-menu">•••</span>
                    </div>

                    <h3>{meeting.title}</h3>

                    <p className="meeting-card-description">
                      {meeting.description ||
                        "No description provided."}
                    </p>

                    <div className="meeting-card-divider" />

                    <div className="meeting-card-footer">
                      <div className="meeting-date">
                        <span className="meeting-date-icon">▣</span>

                        <div>
                          <strong>
                            {new Date(
                              meeting.startTime
                            ).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </strong>

                          <span>
                            {new Date(
                              meeting.startTime
                            ).toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>

                      <button
                        className="meeting-open-button"
                        onClick={() =>
                          handleJoinMeeting(meeting._id)
                        }
                      >
                        Open meeting →
                      </button>
                    </div>

                    {/* AI Summary Access */}
                    <div className="dashboard-summary-access">
                      <button
                        type="button"
                        className="dashboard-summary-button"
                        onClick={() =>
                          handleSummaryToggle(meeting._id)
                        }
                      >
                        <span>✦</span>
                        {isExpanded
                          ? "Hide AI Summary"
                          : "View AI Summary"}
                        <span className="summary-toggle-arrow">
                          {isExpanded ? "⌃" : "⌄"}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="dashboard-summary-panel">
                          {summaryState?.loading && (
                            <div className="dashboard-message">
                              <span className="loading-spinner" />
                              Loading AI summary...
                            </div>
                          )}

                          {summaryState?.error && (
                            <div className="dashboard-summary-empty">
                              <span>✦</span>
                              <p>{summaryState.error}</p>
                            </div>
                          )}

                          {summaryState?.summary && (
                            <>
                              <div className="summary-panel-heading">
                                <div>
                                  <span>✦</span>
                                  <h4>AI Meeting Summary</h4>
                                </div>

                                <span className="summary-readonly-label">
                                  Read only
                                </span>
                              </div>

                              <div className="summary-panel-section">
                                <h5>Overview</h5>
                                <p>
                                  {summaryState.summary.summary}
                                </p>
                              </div>

                              <div className="summary-panel-section">
                                <h5>Key discussion points</h5>

                                {summaryState.summary.keyPoints.length >
                                0 ? (
                                  <ul>
                                    {summaryState.summary.keyPoints.map(
                                      (point, index) => (
                                        <li key={index}>{point}</li>
                                      )
                                    )}
                                  </ul>
                                ) : (
                                  <p>No key points available.</p>
                                )}
                              </div>

                              <div className="summary-panel-section">
                                <h5>Decisions</h5>

                                {summaryState.summary.decisions.length >
                                0 ? (
                                  <ul>
                                    {summaryState.summary.decisions.map(
                                      (decision, index) => (
                                        <li key={index}>{decision}</li>
                                      )
                                    )}
                                  </ul>
                                ) : (
                                  <p>No decisions recorded.</p>
                                )}
                              </div>

                              <div className="summary-panel-section">
                                <h5>
                                  Action items (
                                  {
                                    summaryState.summary.actionItems
                                      .length
                                  }
                                  )
                                </h5>

                                {summaryState.summary.actionItems.length >
                                0 ? (
                                  <div className="summary-action-list">
                                    {summaryState.summary.actionItems.map(
                                      (item, index) => (
                                        <div
                                          className="summary-action-item"
                                          key={index}
                                        >
                                          <p>{item.task}</p>

                                          <div className="summary-action-meta">
                                            <span>
                                              Assignee:{" "}
                                              {item.assignee ||
                                                "Unassigned"}
                                            </span>

                                            <span>
                                              Due:{" "}
                                              {formatDate(
                                                item.dueDate || ""
                                              )}
                                            </span>

                                            <span
                                              className={`summary-priority priority-${item.priority}`}
                                            >
                                              {formatPriority(
                                                item.priority
                                              )}
                                            </span>
                                          </div>

                                          <button
                                            type="button"
                                            className="summary-create-task-button"
                                            onClick={() =>
                                              handleOpenTaskModal(item)
                                            }
                                          >
                                            ＋ Create Task
                                          </button>
                                        </div>
                                      )
                                    )}
                                  </div>
                                ) : (
                                  <p>No action items identified.</p>
                                )}
                              </div>

                              {summaryState.summary.modelName && (
                                <div className="summary-panel-footer">
                                  Generated using{" "}
                                  {summaryState.summary.modelName}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* AI Action Item Task Modal */}
      {taskModalOpen && (
        <div
          className="task-modal-overlay"
          onClick={(event) => {
            if (
              event.target === event.currentTarget &&
              !taskSaving
            ) {
              setTaskModalOpen(false);
            }
          }}
        >
          <div
            className="task-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-modal-title"
          >
            <div className="task-modal-header">
              <div>
                <span className="section-eyebrow">
                  AI ACTION ITEM
                </span>
                <h2 id="task-modal-title">Create Project Task</h2>
                <p>
                  Convert this meeting action item into a project task.
                </p>
              </div>

              <button
                type="button"
                className="task-modal-close"
                onClick={() => setTaskModalOpen(false)}
                disabled={taskSaving}
                aria-label="Close task modal"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateActionTask}>
              <div className="task-modal-group">
                <label htmlFor="action-task-title">
                  Task title
                </label>

                <input
                  id="action-task-title"
                  value={taskTitle}
                  onChange={(event) =>
                    setTaskTitle(event.target.value)
                  }
                  required
                  maxLength={150}
                />
              </div>

              <div className="task-modal-group">
                <label htmlFor="action-task-project">
                  Select project *
                </label>

                <select
                  id="action-task-project"
                  value={selectedProjectId}
                  onChange={(event) => {
                    setSelectedProjectId(event.target.value);
                    setSelectedAssignee("");
                  }}
                  required
                  disabled={
                    taskProjectsLoading || taskProjects.length === 0
                  }
                >
                  <option value="">
                    {taskProjectsLoading
                      ? "Loading projects..."
                      : "Choose a project"}
                  </option>

                  {taskProjects.map((project) => (
                    <option key={project._id} value={project._id}>
                      {project.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="task-modal-group">
                <label htmlFor="action-task-assignee">
                  Assign to
                </label>

                <select
                  id="action-task-assignee"
                  value={selectedAssignee}
                  onChange={(event) =>
                    setSelectedAssignee(event.target.value)
                  }
                  disabled={!selectedProjectId}
                >
                  <option value="">Unassigned</option>

                  {(
                    taskProjects.find(
                      (project) =>
                        project._id === selectedProjectId
                    )?.members || []
                  ).map((member) => (
                    <option key={member._id} value={member._id}>
                      {member.name} ({member.email})
                    </option>
                  ))}
                </select>

                {selectedActionItem?.assignee && (
                  <span className="task-modal-hint">
                    AI suggested assignee:{" "}
                    {selectedActionItem.assignee}. Select the matching
                    project member if available.
                  </span>
                )}
              </div>

              <div className="task-modal-row">
                <div className="task-modal-group">
                  <label htmlFor="action-task-priority">
                    Priority
                  </label>

                  <select
                    id="action-task-priority"
                    value={taskPriority}
                    onChange={(event) =>
                      setTaskPriority(
                        event.target.value as
                          | "high"
                          | "medium"
                          | "low"
                      )
                    }
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>

                <div className="task-modal-group">
                  <label htmlFor="action-task-due-date">
                    Due date
                  </label>

                  <input
                    id="action-task-due-date"
                    type="date"
                    value={taskDueDate}
                    onChange={(event) =>
                      setTaskDueDate(event.target.value)
                    }
                  />
                </div>
              </div>

              {taskError && (
                <div className="task-modal-error">
                  {taskError}
                </div>
              )}

              <div className="task-modal-actions">
                <button
                  type="button"
                  className="task-modal-cancel"
                  onClick={() => setTaskModalOpen(false)}
                  disabled={taskSaving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="task-modal-submit"
                  disabled={
                    taskSaving ||
                    taskProjectsLoading ||
                    taskProjects.length === 0
                  }
                >
                  {taskSaving ? "Creating..." : "Create Task →"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
