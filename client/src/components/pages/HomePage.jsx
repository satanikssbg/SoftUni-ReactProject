import { Link } from "react-router-dom";
import withSidebar from "../../HOC/withSidebar";
import { useEffect, useState } from "react";

import * as newsService from '../../services/newsService';
import Loading from "../layouts/Loading";
import NewsHomeList from "./News/NewsHomeList";

const HomePage = () => {
    const [news, setNews] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);

        newsService.newsHomePage(6)
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
        <>
            <section>
                <div className="row siteColorBackground">
                    <div className="newsLines row">
                        {
                            news.map(article => <NewsHomeList {...article} key={`lastNews${article._id}`} />)
                        }
                    </div>
                </div>
            </section>
        </>
    );
}

export default withSidebar(HomePage);