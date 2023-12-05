import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { PER_PAGE } from '../../../config';

import * as newsService from '../../../services/newsService';

import PaginateLinks from '../../layouts/PaginateLinks';
import NewsList from './NewsList';
import withSidebar from '../../../HOC/withSidebar';

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
    const { slug, region } = useParams();

    const navigate = useNavigate();

    let NewsType = "ALL";
    let checkParam = null;

    if (location.pathname.includes('/news/category') && slug) {
        NewsType = "CATEGORY";
        checkParam = slug;
    } else if (location.pathname.includes('/news/region') && region) {
        NewsType = "REGION";
        checkParam = region;
    }

    if (checkParam) {
        newsService.existCategoryRegion(NewsType, checkParam).then(res => {
            if (res.length !== 1) {
                navigate('/news');
            } else {
                const result = res[0];
                setCategoryId(result._id);

                if (NewsType === "CATEGORY") {
                    setPageTitle(`Новини в кагегория ${result.category}`);
                } else if (NewsType === "REGION") {
                    setPageTitle(`Новини в регион ${result.region}`);
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
        newsService.newsPaginate(currentPage, NewsType, categoryId).then(result => {
            setNews(result);
        });
    }, [currentPage, NewsType, categoryId]);


    const paginateLink = (page, type, slug) => {
        if (type === "CATEGORY") {
            return `/news/category/${slug}?page=${page}`;
        } else if (type === "REGION") {
            return `/news/region/${slug}?page=${page}`;
        }

        return `/news?page=${page}`;
    };

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