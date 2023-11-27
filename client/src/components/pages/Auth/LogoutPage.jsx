
import { useContext, useEffect } from "react";

import AuthContext from "../../../contexts/authContext";

const LogoutPage = () => {
    const { logoutHandler } = useContext(AuthContext);

    useEffect(() => {
        logoutHandler();
    });

    return null;
}

export default LogoutPage;