import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { PER_PAGE } from '../../../config';

import * as newsService from '../../../services/newsService';

import PaginateLinks from '../../layouts/PaginateLinks';
import NewsList from './NewsList';
import withSidebar from '../../../HOC/withSidebar';
import Loading from '../../layouts/Loading';

const News = () => {
    const [pageTitle, setPageTitle] = useState('Новини');
    const [categoryId, setCategoryId] = useState('');

    const [news, setNews] = useState([]);

    const [loading, setLoading] = useState(false);

    const [totalNews, setTotalNews] = useState(0);
    const [totalPages, setTotalPages] = useState(Number(0));
    const [currentPage, setCurrentPage] = useState(Number(1));

    const [searchParams, setSearchParams] = useSearchParams();
    const paramPage = searchParams.get('page');

    const location = useLocation();
    const { slug, region, search } = useParams();

    const navigate = useNavigate();

    let NewsType = "ALL";
    let checkParam = null;

    if (location.pathname.includes('/news/category') && slug) {
        NewsType = "CATEGORY";
        checkParam = slug;
    } else if (location.pathname.includes('/news/region') && region) {
        NewsType = "REGION";
        checkParam = region;
    } else if (location.pathname.includes('/news/search') && search) {
        NewsType = "SEARCH";
        checkParam = search;
    }

    if (checkParam) {
        newsService.existCategoryRegion(NewsType, checkParam).then(res => {
            if (res.length !== 1 && NewsType !== "SEARCH") {
                navigate('/news');
            } else {
                const result = res[0];

                if (NewsType === "CATEGORY") {
                    setCategoryId(result._id);
                    setPageTitle(`Новини в кагегория ${result.category}`);
                } else if (NewsType === "REGION") {
                    setCategoryId(result._id);
                    setPageTitle(`Новини в регион ${result.region}`);
                } else if (NewsType === "SEARCH") {
                    setCategoryId(checkParam);
                    setPageTitle(`Резултати от търсене за ${checkParam}`);
                }
            }
        });
    }

    useEffect(() => {
        newsService.allNewsCount(NewsType, categoryId).then(result => {
            if (typeof result === "number" && Number(result) >= 0) {
                let calcPages = 1;

                if (result > PER_PAGE) {
                    calcPages = Math.ceil(result / PER_PAGE);
                }

                setTotalNews(result);
                setTotalPages(Number(calcPages));
            }
        });
    }, [NewsType, categoryId]);

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
        setLoading(true);

        newsService.newsPaginate(currentPage, NewsType, categoryId)
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
    }, [currentPage, NewsType, categoryId]);


    const paginateLink = (page, type, slug) => {
        if (type === "CATEGORY") {
            return `/news/category/${slug}?page=${page}`;
        } else if (type === "REGION") {
            return `/news/region/${slug}?page=${page}`;
        } else if (type === "SEARCH") {
            return `/news/search/${slug}?page=${page}`;
        }

        return `/news?page=${page}`;
    };

    if (loading) {
        return <Loading />;
    }

    return (
        <div className="row">
            <div className="obshtinaHeading">
                <div className="headingLine" />
                <div className="headingText">
                    {pageTitle} ({Number(totalNews)})
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
                            type={NewsType}
                            slug={checkParam}
                        />
                    </>
                )}
            </div>
        </div>
    );
};

export default withSidebar(News);