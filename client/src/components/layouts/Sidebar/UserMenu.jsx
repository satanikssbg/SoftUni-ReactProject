import { useContext } from "react";
import { Link } from "react-router-dom";

import AuthContext from "../../../contexts/authContext";

const UserMenu = () => {
    const { isAuthenticated, username, userRole, userInfo } = useContext(AuthContext);

    return (
        <div className="card" style={{ width: '300px' }}>
            <div className="card-header">
                <h5 className="card-title p-0 m-0">МЕНЮ</h5>
            </div>

            {!isAuthenticated && (
                <>
                    <ul className="list-group list-group-flush">
                        <li className="list-group-item">
                            <Link to='/login' className="submitButton allNewsLinkButton btn-block">
                                Вход
                            </Link>
                        </li>
                        <li className="list-group-item">
                            <Link to='/register' className="submitButton allNewsLinkButton btn-block">
                                Регистрация
                            </Link>
                        </li>
                    </ul>
                </>
            )}

            {isAuthenticated && (
                <>
                    <div className="card-body">
                        <h5 className="card-title">
                            Здравей, {username}!
                        </h5>
                        <p className="card-text">
                            Информация за акаунта Ви:
                        </p>

                        <table className="table table-sm table-hover" style={{ fontSize: '12px' }}>
                            <tbody>
                                <tr>
                                    <td className="text-right">E-mail:</td>
                                    <td>{userInfo.email}</td>
                                </tr>
                                <tr>
                                    <td className="text-right" style={{ width: '100px' }}>Ниво на достъп:</td>
                                    <td>
                                        {
                                            userInfo.role === 'admin'
                                                ? 'Администратор'
                                                : userInfo.role === 'reporter'
                                                    ? 'Репортер'
                                                    : 'Потребител'
                                        }
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <ul className="list-group list-group-flush">
                        <li className="list-group-item">
                            <Link to='/profile/comments'>Моите коментари</Link>
                        </li>
                        {(userRole === "admin" || userRole === "reporter") && (
                            <>
                                <li className="list-group-item">
                                    <Link to='/profile/news'>Моите новини</Link>
                                </li>
                                <li className="list-group-item">
                                    <Link to='/news/add'>Добави новина</Link>
                                </li>
                            </>
                        )}
                    </ul>
                    <div className="card-footer p-0 m-0">
                        <Link to='/logout' className="submitButton allNewsLinkButton btn-block">
                            Изход
                        </Link>
                    </div>
                </>
            )}
        </div>
    );
}

export default UserMenu;