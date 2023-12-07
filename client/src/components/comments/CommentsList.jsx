import { useContext } from "react";

import AuthContext from "../../contexts/authContext";

import { formatDateString } from "../../utils/functionsUtils";

const CommentsList = ({
    _id,
    comment,
    author: { username },
    _ownerId,
    _createdOn,
    onEdit,
    onDelete }) => {
    const { isAuthenticated, userId, userRole } = useContext(AuthContext);

    return (
        <li className="media border-bottom p-2 m-2">
            <div className="media-body">
                <div className="d-flex justify-content-between">
                    <div>
                        <strong>{username}</strong> написа:
                    </div>
                    <div>
                        {isAuthenticated && (userId === _ownerId || userRole === "admin") && (
                            <div className="btn-group btn-group-sm mr-2" style={{ fontSize: "10px" }}>
                                <button className="btn btn-success" style={{ fontSize: "10px" }} onClick={() => onEdit(comment, _id)}>
                                    <i className="fa fa-pencil"></i>
                                </button>
                                <button className="btn btn-danger" style={{ fontSize: "10px" }} onClick={() => onDelete(_id)}>
                                    <i className="fa fa-trash-o"></i>
                                </button>
                            </div>
                        )}
                        <small>{formatDateString(_createdOn)}</small>
                    </div>
                </div>
                <p className="px-2 m-0 text-justify">
                    <em>{comment}</em>
                </p>
            </div>
        </li>
    );
};

export default CommentsList;