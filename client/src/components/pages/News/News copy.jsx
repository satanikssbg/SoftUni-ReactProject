import { useEffect, useState } from 'react';
import * as newsService from '../../../services/newsService';
import { PER_PAGE } from '../../../config';
import { Link, useSearchParams } from 'react-router-dom';

const News = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const paramPage = searchParams.get('page');



    const [totalNews, setTotalNews] = useState(0);
    const [totalPages, setTotalPages] = useState(Number(0));
    const [currentPage, setCurrentPage] = useState(Number(1));

    const [news, setNews] = useState([]);

    const [loading, setLoading] = useState(false);

    useEffect(() => {
        newsService.allNewsCount().then(result => {
            if (typeof result === "number" && Number(result) >= 0) {
                let calcPages = 1;

                if (result > PER_PAGE) {
                    calcPages = Math.ceil(result / PER_PAGE);
                }

                setTotalNews(result);
                setTotalPages(Number(calcPages));
            }
        });
    });

    useEffect(() => {
        if (paramPage <= 0 || paramPage === 1) {
            setSearchParams({});
            setCurrentPage(Number(1));
        }

        if (paramPage >= 1 && paramPage <= totalPages && paramPage !== currentPage) {
            setCurrentPage(Number(paramPage));
        } else if (paramPage >= 1 && paramPage > totalPages && totalPages !== currentPage) {
            setCurrentPage(Number(totalPages));
            setSearchParams({ page: Number(totalPages) });
        }
    }, [paramPage, currentPage]);


    useEffect(() => {
        newsService.newsPaginate(currentPage).then(res => console.log(res));
    }, [currentPage]);

    return (
        <>
            {totalPages > 1 && (
                <div className="paging d-none d-sm-none d-md-block d-lg-block d-xl-block">
                    {Array.from({ length: totalPages }, (_, index) => (
                        <Link
                            key={index}
                            to={`/news?page=${index + 1}`}
                            className={Number(index + 1) === Number(currentPage) ? "currentPage" : ""}
                        >
                            {index + 1}
                        </Link>
                    ))}

                    

                    <Link to={`/news?page=-1`}>-1</Link>
                    <Link to={`/news?page=0`}>0</Link>
                    <Link to={`/news?page=5`}>5</Link>
                </div>
            )}
        </>
    );
};

export default News;