import { createContext } from "react";
import { useNavigate } from "react-router-dom";

import usePersistedState from "../hooks/usePersistedState";

import * as authService from '../services/authService';

import { toast } from 'react-toastify';

const AuthContext = createContext();

AuthContext.displayName = 'AuthContext';

export const AuthProvider = ({
    children
}) => {
    const navigate = useNavigate();

    const [auth, setAuth] = usePersistedState('auth', {});

    const loginSubmitHandler = async (values) => {
        const result = await authService.login(values.email, values.password);

        setAuth(result);
        localStorage.setItem('accessToken', result.accessToken);
        localStorage.setItem('userRole', result.role);

        toast.success('Вие се логнахте успешно.');
        toast.info(`Здравейте, ${result.username}.`);

        navigate('/');
    };

    const registerSubmitHandler = async (values) => {
        const result = await authService.register(values.username, values.email, values.password);

        setAuth(result);
        localStorage.setItem('accessToken', result.accessToken);
        localStorage.setItem('userRole', result.role);


        toast.success('Вие се регистрирахте успешно.');
        toast.info(`Здравейте, ${result.username}.`);

        navigate('/');
    }

    const logoutHandler = async () => {
        await authService.logout();

        setAuth({});
        localStorage.removeItem('accessToken');
        localStorage.removeItem('userRole');

        navigate('/');
    }

    const values = {
        loginSubmitHandler,
        registerSubmitHandler,
        logoutHandler,
        isAuthenticated: !!auth.accessToken,
        userRole: !!auth.accessToken ? auth.role : false,
        userId: !!auth.accessToken ? auth._id : false,
        username: !!auth.accessToken ? auth.username : false,
        userInfo: !!auth.accessToken ? auth : false,
    };

    return (
        <AuthContext.Provider value={values}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;