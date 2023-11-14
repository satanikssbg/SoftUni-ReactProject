import { Link, NavLink } from 'react-router-dom';

import styles from './SilistraNavbar.module.css';

const SilistraNavbar = () => {
    return (
        <nav id="aboutSilistra" className="sticky-top nonStickyMobile bg-aboutSS">
            <div className="container">
                <div className="row" style={{ padding: "0 10px" }}>
                    <div className="menulineSm col-6 col-sm-6 col-md-3 col-lg-3 col-xl-3">
                        <NavLink
                            to="/silistra"
                            className={({ isActive }) => `nav-link ${isActive ? styles.active : ''}`}
                            title="Информация за град Силистра"
                            end
                        >
                            Информация
                        </NavLink>
                    </div>
                    <div className="col-6 col-sm-6 col-md-3 col-lg-3 col-xl-3">
                        <NavLink
                            to="/silistra/history"
                            className={({ isActive }) => `nav-link ${isActive ? styles.active : ''}`}
                            title="История на град Силистра"
                        >
                            История
                        </NavLink>
                    </div>
                    <hr
                        className="d-block d-sm-block d-md-none d-lg-none d-xl-none"
                        style={{ borderBottom: "1px solid #dcdede", width: "100%", margin: 10 }}
                    />
                    <div className="menulineSm col-6 col-sm-6 col-md-3 col-lg-3 col-xl-3">
                        <NavLink
                            to="/silistra/holiday"
                            className={({ isActive }) => `nav-link ${isActive ? styles.active : ''}`}
                            title="Официален празник на град Силистра"
                        >
                            Oфициален празник
                        </NavLink>
                    </div>
                    <div className="col-6 col-sm-6 col-md-3 col-lg-3 col-xl-3">
                        <NavLink
                            to="/silistra/sights"
                            className={({ isActive }) => `nav-link ${isActive ? styles.active : ''}`}
                            title="Забележителности в град Силистра"
                        >
                            Забележителности
                        </NavLink>
                    </div>
                </div>
            </div>
        </nav>
    )
}

export default SilistraNavbar;