import { createContext } from "react";
import { useNavigate } from "react-router-dom";

import * as authService from '../services/authService';

import usePersistedState from "../hooks/usePersistedState";

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

        toast.success('Вие се логнахте успешно.');
        toast.info(`Здравейте, ${result.username}.`);

        navigate('/');
    };

    const registerSubmitHandler = async (values) => {
        const result = await authService.register(values.username, values.email, values.password);

        setAuth(result);
        localStorage.setItem('accessToken', result.accessToken);

        toast.success('Вие се регистрирахте успешно.');
        toast.info(`Здравейте, ${result.username}.`);

        navigate('/');
    }

    const logoutHandler = async () => {
        await authService.logout();

        setAuth({});
        localStorage.removeItem('accessToken');

        navigate('/');
    }

    const values = {
        loginSubmitHandler,
        registerSubmitHandler,
        logoutHandler,
        isAuthenticated: !!auth.accessToken,
    };

    return (
        <AuthContext.Provider value={values}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;