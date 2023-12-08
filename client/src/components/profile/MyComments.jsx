import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import * as commentsService from '../../services/commentsService';

import { formatDateString } from "../../utils/functionsUtils";

import Loading from "../layouts/Loading";

const MyComments = () => {
    const [loading, setLoading] = useState(false);
    const [comments, setComments] = useState([]);

    useEffect(() => {
        commentsService.getMy()
            .then(result => {
                setComments(result);
            })
            .catch(error => {
                console.error('Грешка при извличане на коментари:', error);
            })
            .finally(() => {
                setLoading(false);
            });

        return (() => {
            setComments([]);
        });
    }, []);

    if (loading) {
        return <Loading />;
    }

    return (
        <>
            <div className="row">
                <div className="obshtinaHeading">
                    <div className="headingLine" />
                    <div className="headingText">
                        Моите коментари
                    </div>
                </div>

                {comments.length === 0
                    ? (
                        <div className="col-12">
                            <div className="alert alert-danger">Все още нямате добавени коментари.</div>
                        </div>
                    )
                    : (
                        <div id="load-data">
                            {comments.map(({ _id, comment, newId, _createdOn, article: { title, img } }) => (
                                <div className="col-12" key={_id}>
                                    <div className="media border-bottom m-2 mb-5">
                                        <Link to={`/news/${newId}`} title={title}>
                                            <img src={img} className="mr-3" alt={title} style={{ maxWidth: "86px" }} />
                                        </Link>
                                        <div className="media-body">
                                            <p className="p-2 m-0" style={{ backgroundColor: '#f7f7f7', border: '1px solid #dfdfdf', borderRadius: '5px' }}>
                                                <em>{comment}</em>
                                                <br />
                                                <small><strong>{formatDateString(_createdOn, true)}</strong></small>
                                            </p>
                                            <small>
                                                Статия: <Link to={`/news/${newId}`} title={title}>{title}</Link>
                                            </small>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
            </div>
        </>
    );
};

export default MyComments;