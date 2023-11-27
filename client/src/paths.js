import { APP_URL, API_URL } from "./config";

const Path = {
    AuthLogin: `${API_URL}/users/login`,
    AuthRegister: `${API_URL}/users/register`,
    AuthLogout: `${API_URL}/users/logout`,
    GetCategories: `${API_URL}/data/categories`,
    GetRegions: `${API_URL}/data/regions`,
    News: `${API_URL}/data/news`,
};

export default Path;