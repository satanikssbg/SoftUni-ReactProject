import { Routes, Route, useLocation } from 'react-router-dom';

import { AuthProvider } from './contexts/authContext';
import { NewsProvider } from './contexts/newsContext';
import { CommentsProvider } from './contexts/commentsContext';

import AuthGuard from './guards/AuthGuard';

import 'react-toastify/dist/ReactToastify.css';
import { ToastContainer } from 'react-toastify';

import MainNavbar from './components/navbars/MainNavbar';
import MainMobileNavbar from './components/navbars/MainMobileNavbar';
import SilistraNavbar from './components/navbars/SilistraNavbar';

import HomePage from "./components/pages/HomePage"
import SilistraPage from "./components/pages/SilistraPage"
import News from './components/pages/News/News';

import LoginPage from './components/pages/Auth/LoginPage';
import RegisterPage from './components/pages/Auth/RegisterPage';
import LogoutPage from './components/pages/Auth/LogoutPage';

import AddNews from './components/pages/News/AddNews';
import Read from './components/pages/News/Read';
import EditNews from './components/pages/News/EditNews';
import MyComments from './components/profile/MyComments';
import MyNews from './components/profile/MyNews';

import Footer from "./components/layouts/Footer"

import ErrorPage from './components/pages/ErrorPage';

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
                        <Route path="/news/search/:search" element={<News />} />
                        <Route path="/news/category/:slug" element={<News />} />
                        <Route path="/news/region/:region" element={<News />} />
                        <Route path="/news/:id" element={<CommentsProvider><Read /></CommentsProvider>} />

                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/register" element={<RegisterPage />} />

                        <Route element={<AuthGuard />}>
                            <Route path="/news/add" element={<AddNews />} />
                            <Route path="/news/edit/:id" element={<EditNews />} />

                            <Route path="/profile/comments" element={<MyComments />} />
                            <Route path="/profile/news" element={<MyNews />} />

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