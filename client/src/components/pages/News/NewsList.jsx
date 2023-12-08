import { Link } from "react-router-dom";

import { stringLimiter, formatDateString } from "../../../utils/functionsUtils";

const NewsList = ({
    _id,
    title,
    article,
    region,
    category,
    _createdOn,
    img
}) => {
    return (
        <>
            <Link to={`/news/${_id}`} title={title} className="moreNewsItem row col-12 col-sm-12 col-md-12 col-lg-12 col-xl-12">
                <div className="secondaryImage col-5 col-sm-4 col-md-4 col-lg-4 col-xl-4 {{ $new->video != '' ? 'isVideo' : '' }}">
                    <img
                        className="imageAspectRatio169"
                        src={img}
                        alt={title}
                    />
                </div>

                <div className="secondaryText col-7 col-sm-8 col-md-8 col-lg-8 col-lg-8">
                    <h5>{stringLimiter(title, 42)}</h5>

                    <div className="articleDivider">
                        <span className="d-none d-sm-none d-md-inline d-lg-inline d-xl-inline">
                            <i className="fas fa-map-marker" /> {region.region}
                        </span>{" "}

                        <span className="d-none d-sm-none d-md-inline d-lg-inline d-xl-inline">
                            <i className="fas fa-tag" /> {category.category}
                        </span>{" "}

                        <i className="far fa-calendar-alt"></i>
                        <span className="d-none d-sm-none d-md-inline d-lg-inline d-xl-inline"></span> {formatDateString(_createdOn)}
                    </div>

                    <span className="newsPreview d-none d-sm-inline d-md-inline d-lg-inline d-xl-inline">
                        {stringLimiter(article, 160)}
                    </span>
                </div>

            </Link>
            <hr style={{ width: '100%' }} />
        </>
    );
};

export default NewsList;