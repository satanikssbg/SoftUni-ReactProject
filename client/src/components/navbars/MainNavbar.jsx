import { useContext } from 'react';
import { Link, NavLink } from 'react-router-dom';

import AuthContext from '../../contexts/authContext';

import Navbar from 'react-bootstrap/Navbar';
import Nav from 'react-bootstrap/Nav';

import styles from './MainNavbar.module.css';

const MainNavbar = () => {
    const { isAuthenticated } = useContext(AuthContext);

    return (
        <>
            <Navbar id="mainMenu" className="navbar bg-portal" variant="dark" expand="md" sticky="top">
                <div className="container menuContainer">
                    <Navbar.Brand as={Link} to="/" title="Портал Силистра">
                        <img
                            src="/images/logo.svg"
                            alt="Портал Силистра"
                            style={{ width: 347, height: 50 }}
                        />
                    </Navbar.Brand>

                    <span className="d-inline d-sm-inline d-md-none d-lg-none d-xl-none">
                        <button
                            className="menuToggler mainMenuDropdown d-none d-sm-none d-md-block d-lg-block d-xl-block"
                            style={{ float: "right" }}
                            type="button"
                            data-toggle="collapse"
                            data-target="#collapsibleNavbar"
                        >
                            <span className="mainMenuDropdownIcon">
                                <i className=" fas fa-bars" />
                            </span>
                        </button>

                        <button
                            className="menuToggler mainMenuDropdown d-block d-sm-block d-md-none d-lg-none d-xl-none"
                            style={{ float: "right" }}
                            type="button"
                            data-toggle="collapse"
                            data-target="#dropdownMenu"
                        >
                            <span className="mainMenuDropdownIcon">
                                <i className=" fas fa-bars" />
                            </span>
                        </button>

                        <button
                            data-toggle="collapse"
                            data-target="#searchBox"
                            className="menuToggler"
                            style={{ float: "right" }}
                        >
                            <i className="fas fa-search" />
                        </button>
                    </span>

                    <Nav id="collapsibleNavbar" className="collapse navbar-collapse row flex-grow-1 text-right">
                        <ul className={`navbar-nav ml-auto flex-nowrap ${styles.navLinks}`}>
                            <li className="nav-item">
                                <NavLink to="/" className={({ isActive }) => `nav-link ${isActive && (styles.navItemLinkActive)}`}>
                                    Начало
                                </NavLink>
                            </li>
                            <li className="nav-item">
                                <NavLink to="/silistra" className={({ isActive }) => `nav-link ${isActive && (styles.navItemLinkActive)}`}>
                                    За Силистра
                                </NavLink>
                            </li>
                            <li className="nav-item">
                                <NavLink to="/news" end className={({ isActive }) => `nav-link ${isActive && (styles.navItemLinkActive)}`}>
                                    Новини
                                </NavLink>
                            </li>

                            {!isAuthenticated ? (
                                <>
                                    <li className="nav-item">
                                        <NavLink to="/register" className={({ isActive }) => `nav-link ${isActive && (styles.navItemLinkActive)}`}>
                                            Регистрация
                                        </NavLink>
                                    </li>
                                    <li className="nav-item">
                                        <NavLink to="/login" className={({ isActive }) => `nav-link ${isActive && (styles.navItemLinkActive)}`}>
                                            Вход
                                        </NavLink>
                                    </li>
                                </>
                            ) : (
                                <>
                                    <li className="nav-item">
                                        <NavLink to="/news/add" className={({ isActive }) => `nav-link ${isActive && (styles.navItemLinkActive)}`}>
                                            + Новина
                                        </NavLink>
                                    </li>
                                    <li className="nav-item">
                                        <NavLink to="/logout" className={({ isActive }) => `nav-link ${isActive && (styles.navItemLinkActive)}`}>
                                            Изход
                                        </NavLink>
                                    </li>
                                </>
                            )}

                            <li className="d-none d-sm-none d-md-block d-lg-block d-xl-block">
                                <Link
                                    to="#"
                                    data-toggle="collapse"
                                    data-target="#searchBox"
                                    className="nav-link"
                                    rel="nofollow"
                                    aria-label="Търсене"
                                >
                                    <i className="fas fa-search" />
                                </Link>
                            </li>
                        </ul>
                        <ul style={{ padding: '0px', margin: '0px', cursor: 'pointer' }}>
                            <li data-toggle="collapse" data-target="#dropdownMenu" className="mainMenuDropdown d-none d-sm-none d-md-block d-lg-block d-xl-block">
                                <span className="mainMenuDropdownIcon"><i className="fas fa-bars"></i></span>
                                <span className="mainMenuDropdownIcon d-none"><i className="fas fa-times"></i></span>
                            </li>
                        </ul>
                    </Nav>
                </div>
            </Navbar>
        </>
    );
}

export default MainNavbar;