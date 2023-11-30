import { Link } from "react-router-dom";

const PaginateLinks = ({ currentPage, lastPage, paginateLink, type = 'ALL', slug = null }) => {
    const onEachSide = 2;

    const scrollClickHandler = () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth',
        });
    };

    let start = currentPage - onEachSide;
    let end = currentPage + onEachSide;

    if (start < 1) {
        start = 1;
        end += 1;
    }

    if (end >= lastPage) {
        end = lastPage;
    }

    const pages = [];

    for (let i = start; i <= end; i++) {
        pages.push(
            <Link
                key={i}
                to={paginateLink(i, type, slug)}
                className={currentPage === i ? 'currentPage' : ''}
                onClick={scrollClickHandler}
            >
                {i}
            </Link>
        );
    }

    return (
        <div className="paging d-none d-sm-none d-md-block d-lg-block d-xl-block">
            {start > 1 && <Link to={paginateLink(1, type, slug)} onClick={scrollClickHandler}>&lt;&lt;</Link>}

            {currentPage > 1 && (
                <Link to={paginateLink(currentPage - 1, type, slug)} rel="prev" aria-label="Previous" onClick={scrollClickHandler}>
                    &lt; Предишна
                </Link>
            )}

            {pages}

            {currentPage < lastPage && (
                <Link to={paginateLink(currentPage + 1, type, slug)} rel="next" aria-label="Next" onClick={scrollClickHandler}>
                    Следваща &gt;
                </Link>
            )}

            {end < lastPage && <Link to={paginateLink(lastPage, type, slug)} onClick={scrollClickHandler}>&gt;&gt;</Link>}
        </div>
    );
};

export default PaginateLinks;