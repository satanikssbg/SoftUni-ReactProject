import { useContext } from 'react';
import { Link } from 'react-router-dom';

import { formatDateString, stringLimiter } from '../../../utils/functionsUtils';

import CommentsContext from '../../../contexts/commentsContext';

const LastComments = () => {
    const { latestCommnets } = useContext(CommentsContext);

    return (
        <>
            {
                latestCommnets.length > 0 && (
                    <div className="card mt-3" style={{ width: '300px' }}>
                        <div className="card-header">
                            <h5 className="card-title p-0 m-0">ПОСЛЕДНИ КОМЕНТАРИ</h5>
                        </div>
                        <div className="card-body p-0 m-0">
                            {
                                latestCommnets.map(({ _id, comment, newId, _createdOn, author: { username } }) => (
                                    <Link to={`/news/${newId}`} style={{ color: '#000' }} key={_id}>
                                        <div className="media border-bottom p-2">
                                            <div className="media-body">
                                                <div className="p-2 m-0" style={{ backgroundColor: '#f7f7f7', border: '1px solid #dfdfdf', fontSize: '13px' }}>
                                                    <em>{stringLimiter(comment, 86)}</em>
                                                    <small>
                                                        <div className="d-flex justify-content-between">
                                                            <div><strong>{username}</strong></div>
                                                            <div><strong>{formatDateString(_createdOn, true)}</strong></div>
                                                        </div>
                                                    </small>
                                                </div>
                                            </div>
                                        </div>
                                    </Link>
                                ))
                            }
                        </div>
                    </div>
                )
            }
        </>
    );
}

export default LastComments;