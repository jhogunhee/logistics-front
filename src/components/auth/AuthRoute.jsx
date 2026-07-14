import { Navigate } from "react-router-dom";

export default function AuthRoute({ children }) {
    const loggedIn = sessionStorage.getItem("loginUser");

    if (!loggedIn) {
        return <Navigate to="/login" replace />;
    }

    return children;
}