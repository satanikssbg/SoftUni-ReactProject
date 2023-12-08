import { useContext } from "react";
import { Navigate } from "react-router-dom";

import AuthContext from "../../contexts/authContext";

import News from "../pages/News/News";

const MyNews = () => {
    const { userId, userRole } = useContext(AuthContext);

    if (userRole !== "admin" && userRole !== "reporter") {
        return <Navigate to='/' />;
    }

    return <News userId={userId} />;
};

export default MyNews;