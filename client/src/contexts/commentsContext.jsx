import { createContext, useContext, useEffect, useReducer, useState } from "react";
import { useLocation, useParams } from "react-router-dom";

import AuthContext from "./authContext";

import * as commentsService from '../services/commentsService';

import { commentsReducer, commentsLatestReducer } from '../components/comments/commentsReducer';

import EditCommentModal from "../components/comments/EditCommentModal";
import ConfirmModal from "../components/layouts/ConfirmModal";

import { toast } from 'react-toastify';

const CommentsContext = createContext();

CommentsContext.displayName = 'CommentsContext';

export const CommentsProvider = ({
    children
}) => {
    //const { id } = useParams();
    const location = useLocation();

    let id = null;

    if (location.pathname.startsWith('/news/')) {
        const splitUrl = location.pathname.split('/');
        const lastElement = splitUrl[splitUrl.length - 1];

        if ((/^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-4[a-fA-F0-9]{3}-[ab0-9A-Fa-f]{4}-[a-fA-F0-9]{12}$/).test(last) || (/^\d+$/).test(lastElement)) {
            id = lastElement;
        }
    }

    const { username } = useContext(AuthContext);

    const [comments, dispatch] = useReducer(commentsReducer, []);
    const [latestCommnets, dispatchLatestComments] = useReducer(commentsLatestReducer, []);

    const [editComment, setEditComment] = useState({});
    const [showEditCommentModal, setShowEditCommentModal] = useState(false);

    const [showDeleteCommentConfirmModal, setShowDeleteCommentConfirmModal] = useState(false);

    useEffect(() => {
        commentsService.getAll(id)
            .then((result) => {
                dispatch({
                    type: 'GET_ALL_COMMENTS',
                    payload: result,
                });
            });

        return () => {
            dispatch({
                type: 'CLEAR_COMMENTS'
            });
        };
    }, [id]);

    useEffect(() => {
        commentsService.latest()
            .then(result => {
                dispatchLatestComments({
                    type: 'GET_COMMENTS',
                    payload: result,
                });
            });
    }, []);

    const addCommentHandler = async (values) => {
        commentsService.create(id, values.comment)
            .then(newComment => {
                newComment.author = { username };

                dispatch({
                    type: 'ADD_COMMENT',
                    payload: newComment
                });

                dispatchLatestComments({
                    type: 'ADD_COMMENT',
                    payload: newComment
                });

                values.comment = '';
                toast.success('Коментара е добавен успешно.');
            })
            .catch(error => {
                console.error('Грешка при добавяне на коментар:', error);
                toast.error('Възникна грешка при добавяне на коментар. Моля, опитайте отново.');
            });
    }

    const commentEditClickHandler = (comment, commentId) => {
        setEditComment({ comment, commentId });
        setShowEditCommentModal(true);
    }

    const editCommentHandler = async (values) => {
        setShowEditCommentModal(false);

        commentsService.edit(values)
            .then(comment => {
                dispatch({
                    type: 'EDIT_COMMENT',
                    payload: comment
                });

                dispatchLatestComments({
                    type: 'EDIT_COMMENT',
                    payload: comment
                });

                toast.success('Коментара е редактиран успешно.');
            })
            .catch(error => {
                console.error('Грешка при редактиране на коментар:', error);
                toast.error('Възникна грешка при редактиране на коментар. Моля, опитайте отново.');
            }).finally(() => {
                setEditComment({});
            });
    }

    const commentDeleteClickHandler = (commentId) => {
        setEditComment({ id: commentId });
        setShowDeleteCommentConfirmModal(true);
    }

    const deleteCommentHandler = async () => {
        try {
            setShowEditCommentModal(false);

            const comments = await commentsService.remove({ id: editComment.id });
            dispatch({
                type: 'REMOVE_COMMENT',
                payload: comments
            });

            const result = await commentsService.latest();
            dispatchLatestComments({
                type: 'GET_COMMENTS',
                payload: result,
            });

            toast.success('Коментара е изтрит успешно.');
        } catch (error) {
            console.error('Грешка при изтриване на коментар:', error);
            toast.error('Възникна грешка при изтриване на коментар. Моля, опитайте отново.');
        } finally {
            setEditComment({});
        }
    };

    const values = {
        comments,
        dispatch,
        addCommentHandler,
        commentEditClickHandler,
        commentDeleteClickHandler,
        latestCommnets,
        dispatchLatestComments,
    };

    return (
        <CommentsContext.Provider value={values}>
            {children}

            {showEditCommentModal &&
                <EditCommentModal
                    comment={editComment}
                    editCommentHandler={editCommentHandler}
                    show={() => setShowEditCommentModal(true)}
                    onClose={() => setShowEditCommentModal(false)}
                />
            }

            {showDeleteCommentConfirmModal &&
                <ConfirmModal
                    description="Сигурни ли сте, че искате да изтриете коментара?"
                    confim={deleteCommentHandler}
                    show={() => setShowDeleteCommentConfirmModal(true)}
                    onClose={() => setShowDeleteCommentConfirmModal(false)}
                />
            }
        </CommentsContext.Provider>
    );
};

export default CommentsContext;