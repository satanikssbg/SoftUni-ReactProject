import { Link } from 'react-router-dom';

import styles from "./ErrorPage.module.css";

const ErrorPage = () => {
    return (
        <div className={styles.errorPage}>
            <div className={styles.errorPageContent}>
                <h1>404 Опс...</h1>
                <h2>Нещо се обърка ;(</h2>
                <h5>Търсената страница от Вас, не може да бъде намерена.</h5>

                <br />

                <Link to='/' className='submitButton allNewsLinkButton'>
                    Връщане към началната страница
                </Link>
            </div>
        </div>
    );
}

export default ErrorPage;