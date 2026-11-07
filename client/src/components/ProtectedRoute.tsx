
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";

const ProtectedRoute = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading-screen">Loading IntellMeet...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
