import { Routes, Route, useLocation } from 'react-router-dom';

import MainNavbar from './components/navbars/MainNavbar';
import MainMobileNavbar from './components/navbars/MainMobileNavbar';
import SilistraNavbar from './components/navbars/SilistraNavbar';

import Footer from "./components/layouts/Footer"

import HomePage from "./components/pages/HomePage"
import SilistraPage from "./components/pages/SilistraPage"
import NewsPage from './components/pages/NewsPage';

import LoginPage from './components/pages/Auth/LoginPage';
import RegisterPage from './components/pages/Auth/RegisterPage';
import LogoutPage from './components/pages/Auth/LogoutPage';

import ErrorPage from './components/pages/ErrorPage';

function App() {
    const location = useLocation();
    const { pathname } = location;

    return (
        <>
            <MainNavbar />
            {pathname.startsWith('/silistra') && (<SilistraNavbar />)}
            <MainMobileNavbar />

            <div id="content" className="container" style={{ marginTop: '20px' }}>
                <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/silistra/*" element={<SilistraPage />} />
                    <Route path="/news/*" element={<NewsPage />} />

                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="/logout" element={<LogoutPage />} />

                    <Route path="*" element={<ErrorPage />} />
                </Routes>
            </div>

            <div id="backgroundGlobal" className="d-none d-md-block">
                <div id="backgroundGlobalLeft"></div>
                <div id="backgroundGlobalRight"></div>
            </div>

            <Footer />
        </>
    )
}

export default App