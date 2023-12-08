import { useEffect, useState } from "react";

import * as newsService from '../../services/newsService';

import NewsHomeList from "./News/NewsHomeList";
import Loading from "../layouts/Loading";

const HomePage = () => {
    const [news, setNews] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);

        newsService.newsHomePage(9)
            .then(result => {
                setNews(result);
            })
            .catch(error => {
                console.error('Грешка при извличане на новини:', error);
            })
            .finally(() => {
                setLoading(false);
            });

        return () => {
            setNews([]);
        };
    }, []);

    if (loading) {
        return <Loading />;
    }

    return (
        <section>
            <div className="obshtinaHeading">
                <div className="headingLine" />
                <div className="headingText">Последни новини</div>
            </div>


            <div className="row siteColorBackground">
                <div className="newsLines row">
                    {
                        news.map(article => <NewsHomeList {...article} key={`lastNews${article._id}`} />)
                    }
                </div>
            </div>
        </section>
    );
}

export default HomePage;