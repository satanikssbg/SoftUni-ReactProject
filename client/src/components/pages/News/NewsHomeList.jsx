import { Link } from "react-router-dom";

import { formatDateString, stringLimiter } from "../../../utils/functionsUtils";

const NewsHomeList = ({ _id, title, img, _createdOn }) => {
    return (
        <>
            <Link to={`/news/${_id}`} title={title} className="moreNewsItem siteColorBackground row col-12 col-sm-12 col-md-12 col-lg-4 col-xl-4">
                <div className="secondaryImage col-4 col-sm-3 col-md-3 col-lg-12 col-xl-12">
                    <img className="imageAspectRatio169" src={img} alt={title} />
                </div>
                <div className="secondaryText col-8 col-sm-9 col-md-9 col-lg-12 col-xl-12">
                    <h6>{stringLimiter(title, 44)}</h6>
                    <div className="articleDivider">
                        <span>
                            <i className="far fa-calendar-alt"></i> {formatDateString(_createdOn)}
                        </span>

                    </div>
                </div>
            </Link>
        </>
    );
};

export default NewsHomeList;