import { useContext, useEffect } from "react";
import { Link } from "react-router-dom";

import AuthContext from "../../contexts/authContext";

import styles from "./Footer.module.css";

const Footer = () => {
    const { isAuthenticated } = useContext(AuthContext);

    const thisDate = new Date();
    const thisYear = thisDate.getFullYear();

    return (
        <footer>
            <div className="container">
                <div className="row footerLinks">
                    <div className="col-12">
                        <div className="socialIcons">
                            <div>
                                <a
                                    href="https://www.facebook.com/portalsilistra"
                                    title="Портал Силистра във Facebook"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <i className="fab fa-facebook-f" />
                                </a>
                            </div>
                            <div>
                                <a
                                    href="https://www.instagram.com/portal_silistra/"
                                    title="Портал Силистра в Instagram"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <i className="fab fa-instagram" />
                                </a>
                            </div>
                            <div>
                                <a
                                    href="https://www.youtube.com/channel/UC_Kg0BhnfzWmVDzo_wwS0jw"
                                    title="Портал Силистра в YouTube"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <i className="fab fa-youtube" />
                                </a>
                            </div>
                        </div>

                        <br />

                        <div className={`d-none d-sm-none d-md-block d-lg-block d-xl-block ${styles.footerLinks}`}>
                            <Link to="/" title="Портал Силистра">
                                Начало
                            </Link>
                            <Link to="/silistra" title="За Силистра">
                                За Силистра
                            </Link>
                            <Link to="/news" title="Новини">
                                Новини
                            </Link>

                            {!isAuthenticated && (
                                <>
                                    <Link to="/register" title="Регистрация">
                                        Регистрация
                                    </Link>
                                    <Link to="/login" title="Вход">
                                        Вход
                                    </Link>
                                </>
                            )}

                            <Link to="/contacts" title="Контакти">
                                Контакти
                            </Link>
                        </div>

                        <div className="row">
                            <div
                                className="col-6 col-sm-6 d-block d-sm-block d-md-none d-lg-none d-xl-none"
                                style={{ borderRight: "1px solid #4f4f4f" }}
                            >
                                <ul className="navbar-nav ml-auto flex-nowrap">
                                    <li className="nav-item">
                                        <Link to="/" title="Портал Силистра" className="nav-link">
                                            Начало
                                        </Link>
                                    </li>
                                    <li className="nav-item">
                                        <Link to="/silistra" title="За Силистра" className="nav-link">
                                            За Силистра
                                        </Link>
                                    </li>
                                    <li className="nav-item">
                                        <Link to="/news" title="Новини" className="nav-link">
                                            Новини
                                        </Link>
                                    </li>
                                </ul>
                            </div>
                            <div
                                className="col-6 col-sm-6 d-block d-sm-block d-md-none d-lg-none d-xl-none"
                                style={{ borderLeft: "1px solid #4f4f4f" }}
                            >
                                <ul className="navbar-nav ml-auto flex-nowrap">
                                    <li className="nav-item">
                                        <Link to="/register" title="Регистрация" className="nav-link">
                                            Регистрация
                                        </Link>
                                    </li>
                                    <li className="nav-item">
                                        <Link to="/login" title="Вход" className="nav-link">
                                            Вход
                                        </Link>
                                    </li>
                                    <li className="nav-item">
                                        <Link to="/contacts" title="Контакти" className="nav-link">
                                            Контакти
                                        </Link>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="col-12">
                    <br />
                    <span>
                        Портал Силистра © 2010-{thisYear} Всички права запазени!
                        <br />
                        Произведено в Силистра, България.
                    </span>
                </div>
            </div>
        </footer>
    );
}

export default Footer;