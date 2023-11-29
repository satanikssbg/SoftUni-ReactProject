import { Link } from "react-router-dom";

const PaginateLinks = ({ currentPage, lastPage, paginateLink }) => {
    const onEachSide = 2;

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
                to={paginateLink(i)}
                className={currentPage === i ? 'currentPage' : ''}
            >
                {i}
            </Link>
        );
    }

    return (
        <div className="paging d-none d-sm-none d-md-block d-lg-block d-xl-block">
            {start > 1 && <Link to={paginateLink(1)}>&lt;&lt;</Link>}

            {currentPage > 1 && (
                <Link to={paginateLink(currentPage - 1)} rel="prev" aria-label="Previous">
                    &lt; Предишна
                </Link>
            )}

            {pages}

            {currentPage < lastPage && (
                <Link to={paginateLink(currentPage + 1)} rel="next" aria-label="Next">
                    Следваща &gt;
                </Link>
            )}

            {end < lastPage && <Link to={paginateLink(lastPage)}>&gt;&gt;</Link>}
        </div>
    );
};

export default PaginateLinks;