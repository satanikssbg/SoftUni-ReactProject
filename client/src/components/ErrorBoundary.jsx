import { Component } from "react";

import styles from "./pages/ErrorPage.module.css";

export default class ErrorBoundary extends Component {
    constructor() {
        super();

        this.state = {
            hasError: false,
        }
    }


    static getDerivedStateFromError(err) {
        return {
            hasError: true,
        }
    }

    componentDidCatch(error, errorInfo) {
        console.log(error);
        console.log(errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className={styles.errorPage}>
                    <div className={styles.errorPageContent}>
                        <h1>Опс...</h1>
                        <h2>Нещо се обърка ;(</h2>
                        <h5>Възникна някаква грешка, подари което се извиняваме.</h5>

                        <br />

                        <a href='/' className='submitButton allNewsLinkButton'>
                            Връщане към началната страница
                        </a>
                    </div>
                </div>
            )
        }

        return this.props.children;
    }
}