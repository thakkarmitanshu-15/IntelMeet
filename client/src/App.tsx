
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login.js";
import Register from "./pages/Register.js";
import Dashboard from "./pages/Dashboard.js";
import CreateMeeting from "./pages/CreateMeeting.js";
import ProtectedRoute from "./components/ProtectedRoute.js";
import { AuthProvider } from "./context/AuthContext.js";
import MeetingDetails from "./pages/MeetingDetails.js";
import MeetingRoom from "./pages/MeetingRoom.js";
import TeamWorkspace from "./pages/TeamWorkspace.js";
import ProjectBoard from "./pages/ProjectBoard.js";
import "./App.css";

const App = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          <Route path="/login" element={<Login />} />

          <Route path="/register" element={<Register />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/meetings/new" element={<CreateMeeting />} />
            <Route path="/meetings/:id" element={<MeetingDetails />} />
            <Route path="/meetings/:id/room" element={<MeetingRoom />}/>
            <Route path="/workspace" element={<TeamWorkspace />} />
            <Route path="/workspace/:projectId" element={<ProjectBoard />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
