import { Routes, Route, useLocation } from 'react-router-dom';

import { AuthProvider } from './contexts/authContext';

import MainNavbar from './components/navbars/MainNavbar';
import MainMobileNavbar from './components/navbars/MainMobileNavbar';
import SilistraNavbar from './components/navbars/SilistraNavbar';

import Footer from "./components/layouts/Footer"

import HomePage from "./components/pages/HomePage"
import SilistraPage from "./components/pages/SilistraPage"
import News from './components/pages/News/News';

import LoginPage from './components/pages/Auth/LoginPage';
import RegisterPage from './components/pages/Auth/RegisterPage';
import LogoutPage from './components/pages/Auth/LogoutPage';

import ErrorPage from './components/pages/ErrorPage';

import { ToastContainer } from 'react-toastify';

import 'react-toastify/dist/ReactToastify.css';
import AddNews from './components/pages/News/AddNews';

import AuthGuard from './guards/AuthGuard';
import { NewsProvider } from './contexts/newsContext';
import Read from './components/pages/News/Read';
import EditNews from './components/pages/News/EditNews';
import { CommentsProvider } from './contexts/commentsContext';

function App() {
    const location = useLocation();
    const { pathname } = location;

    return (
        <AuthProvider>
            <NewsProvider>
                <MainNavbar />
                {pathname.startsWith('/silistra') && (<SilistraNavbar />)}
                <MainMobileNavbar />

                <div id="content" className="container" style={{ marginTop: '20px' }}>
                    <Routes>
                        <Route path="/" element={<HomePage />} />
                        <Route path="/silistra/*" element={<SilistraPage />} />

                        <Route path="/news" element={<News />} />
                        <Route path="/news/category/:slug" element={<News />} />
                        <Route path="/news/region/:region" element={<News />} />
                        
                        <Route path="/news/:id" element={<CommentsProvider><Read /></CommentsProvider>} />

                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/register" element={<RegisterPage />} />

                        <Route element={<AuthGuard />}>
                            <Route path="/news/add" element={<AddNews />} />
                            <Route path="/news/edit/:id" element={<EditNews />} />
                            <Route path="/logout" element={<LogoutPage />} />
                        </Route>

                        <Route path="*" element={<ErrorPage />} />
                    </Routes>
                </div>

                <div id="backgroundGlobal" className="d-none d-md-block">
                    <div id="backgroundGlobalLeft"></div>
                    <div id="backgroundGlobalRight"></div>
                </div>

                <Footer />

                <ToastContainer
                    position="bottom-right"
                    autoClose={2000}
                    hideProgressBar={true}
                    newestOnTop={false}
                    closeOnClick
                    rtl={false}
                    pauseOnFocusLoss
                    pauseOnHover
                    draggable={false}
                    theme="colored"
                />
            </NewsProvider>
        </AuthProvider>
    );
};

export default App;