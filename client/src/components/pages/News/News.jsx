import { useEffect, useState } from 'react';
import * as newsService from '../../../services/newsService';

const News = () => {
    const [news, setNews] = useState([]);

    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setLoading(true);

        newsService.allNews()
            .then(result => {
                setNews(result);
                setLoading(false);
            });
    }, []);

    return (
        <>
            {loading && <h1>Зареждане...</h1>}
            {
                news.length > 0 && news.map(article => (
                    <p key={article._id}>
                        {article.title}
                        {article.category.category}
                        {article.region.region}
                    </p>
                ))
            }
        </>
    );
};

export default News;