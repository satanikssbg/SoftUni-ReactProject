import { useEffect } from "react";

import styles from "./Loading.module.css";

const Loading = () => {
    useEffect(() => {

    });

    return (
        <>
            <div id={styles.loader}>Зареждане</div>
        </>
    );
}

export default Loading;