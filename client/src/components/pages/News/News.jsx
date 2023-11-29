import { useEffect, useState } from 'react';
import * as newsService from '../../../services/newsService';
import { PER_PAGE } from '../../../config';
import { Link, useSearchParams } from 'react-router-dom';
import PaginateLinks from '../../layouts/PaginateLinks';
import NewsList from './NewsList';

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
        newsService.newsPaginate(currentPage).then(result => {
            setNews(result);
        });
    }, [currentPage]);

    const paginateLink = page => `/news?page=${page}`;

    return (
        <>
            <div id="content" className="container" style={{ marginTop: 20 }}>
                <div className="row">
                    <div className="contentWrap row col-12 col-sm-12 col-md-12 col-lg-9 col-xl-9">
                        <div className="row">
                            <div className="obshtinaHeading">
                                <div className="headingLine" />
                                <div className="headingText">
                                    Новини ({Number(totalNews)})
                                </div>
                            </div>

                            <div id="load-data">
                                {
                                    news.length > 0 && news.map(article =>
                                        <NewsList key={article._id} {...article} />
                                    )
                                }

                                {totalPages > 1 && (
                                    <>
                                        <PaginateLinks
                                            currentPage={currentPage}
                                            lastPage={totalPages}
                                            paginateLink={paginateLink}
                                        />
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default News;