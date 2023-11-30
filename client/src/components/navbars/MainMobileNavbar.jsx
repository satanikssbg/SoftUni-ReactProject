import { useContext } from 'react';
import { Link } from 'react-router-dom';
import Search from '../Search';
import { useEffect, useState, useRef } from 'react';

import Navbar from 'react-bootstrap/Navbar';
import Nav from 'react-bootstrap/Nav';
import { getRegions } from '../../services/newsService';
import { objectChunk } from '../../utils/functionsUtils';
import AuthContext from '../../contexts/authContext';
import NewsContext from '../../contexts/newsContext';

const MainMobileNavbar = () => {
    const { isAuthenticated } = useContext(AuthContext);
    let { categories, regions } = useContext(NewsContext);


    const dropdownMenuRef = useRef(null);

    useEffect(() => {
        const handleDropdownMenuClick = (event) => {
            if (event.target.tagName === 'A') {
                closeDropdownMenu();
            }
        };

        document.addEventListener('click', handleDropdownMenuClick);

        return () => {
            document.removeEventListener('click', handleDropdownMenuClick);
        };
    });

    const closeDropdownMenu = () => {
        $(dropdownMenuRef.current).collapse('hide');
    };

    let indexRegions = 0;
    let indexCategories = 0;

    categories = objectChunk(categories, 4);
    regions = objectChunk(regions, 4);

    return (
        <>
            <nav className="sticky-top" style={{ top: 76 }}>
                <Search />

                <Navbar.Collapse id="dropdownMenu" ref={dropdownMenuRef} className="collapse container">
                    <div className="row">
                        <div className="menulineSm col-6 col-sm-6 d-block d-sm-bloc k d-md-none d-lg-none d-xl-none">
                            <ul className="navbar-nav ml-auto flex-nowrap">
                                <li className="nav-item">
                                    <Nav.Link href='/' to='/' as={Link} className="nav-link">
                                        Начало
                                    </Nav.Link>
                                </li>
                                <li className="nav-item">
                                    <Nav.Link href='/silistra' to='/silistra' as={Link} className="nav-link">
                                        За Силистра
                                    </Nav.Link>
                                </li>
                                <li className="nav-item">
                                    <Nav.Link href='/news' to='/news' as={Link} className="nav-link">
                                        Новини
                                    </Nav.Link>
                                </li>
                            </ul>
                        </div>

                        <div className=" col-6 col-sm-6 d-block d-sm-block d-md-none d-lg-none d-xl- none">
                            <ul className="navbar-nav ml-auto flex-nowrap">
                                <li className="nav-item">
                                    <Nav.Link href='/register' to='/register' as={Link} className="nav-link">
                                        Регистрация
                                    </Nav.Link>
                                </li>
                                {isAuthenticated && (
                                    <li className="nav-item">
                                        <Nav.Link href='/login' to='/login' as={Link} className="nav-link">
                                            Вход
                                        </Nav.Link>
                                    </li>
                                )}

                                <li className="nav-item">
                                    <Nav.Link href='/contacts' to='/contacts' as={Link} className="nav-link">
                                        Контакти
                                    </Nav.Link>
                                </li>
                            </ul>
                        </div>

                        <hr
                            className="d-block d-sm-block d-md-none d-lg-none d-xl-none"
                            style={{ borderBottom: "1px solid #dcdede", width: "100%" }}
                        />

                        {regions.map((row, index) => {
                            indexRegions += 1;
                            return (
                                <div key={index} className={`${indexRegions === 2 ? 'menuLineLG menuLineMd' : 'menulineSm'} col-6 col-sm-6 co l-md-4 col-lg-2 col-xl-2`}>
                                    <ul className="navbar-nav ml-auto flex-nowrap">
                                        {Object.values(row).map(({ region, slug }, id) => (
                                            <li key={id} className="nav-item">
                                                <Link
                                                    to={`/news/region/${slug}`}
                                                    title={`Новини в регион ${region}`}
                                                    className="nav-link"
                                                >
                                                    {region}
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            );
                        })}

                        <hr
                            className="d-block d-sm-block d-md-none d-lg-none d-xl-none"
                            style={{ borderBottom: "1px solid #dcdede", width: "100%" }}
                        />

                        {categories.map((row, index) => {
                            indexCategories += 1;

                            return (
                                <div key={index} className={`${indexCategories !== 2 && ('menuLineMd')} ${(indexCategories === 1 || indexCategories === 3) && ('menulineSm')} menuLineLG col-6 col-sm-6 col-md-4 col-lg-2 col-xl-2`}>
                                    <ul className="navbar-nav ml-auto flex-nowrap">
                                        {Object.values(row).map(({ category, slug }, id) => (
                                            <li className="nav-item" key={id}>
                                                <Link
                                                    to={`/news/category/${slug}`}
                                                    className="nav-link"
                                                    title={`Новини в категория ${category}`}
                                                >
                                                    {category}
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            );
                        })}

                        <hr
                            className="d-block d-sm-block d-md-none d-lg-none d-xl-none"
                            style={{ borderBottom: "1px solid #dcdede", width: "100%" }}
                        />

                        <div
                            className="col-12 col-sm-12 d-block d-sm-block d-md-blocl d-lg-none d-xl-none"
                            style={{ textAlign: "center" }}
                        >
                            <a
                                className="submitButtonWhite allNewsLinkButton d-block"
                                href="{{ url('/news/add') }}"
                                title="Предлагане на новина"
                            >
                                Предложи новина
                            </a>
                        </div>
                    </div>
                </Navbar.Collapse>
            </nav>
        </>
    );
}

export default MainMobileNavbar;