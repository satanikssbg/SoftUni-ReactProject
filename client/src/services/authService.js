import * as request from '../lib/request';

import Path from '../paths';

export const login = async (email, password) => {
    const result = await request.post(Path.AuthLogin, {
        email,
        password
    });

    return result;
}

export const register = async (username, email, password) => {
    const result = await request.post(Path.AuthRegister, {
        username,
        email,
        password
    });

    return result;
}

export const logout = () => request.get(Path.AuthLogout);