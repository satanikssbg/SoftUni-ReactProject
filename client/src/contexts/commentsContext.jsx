import { createContext, useContext, useEffect, useReducer, useState } from "react";
import { useParams } from "react-router-dom";

import AuthContext from "./authContext";

import * as commentsService from '../services/commentsService';

import { commentsReducer } from '../components/comments/commentsReducer';

import EditCommentModal from "../components/comments/EditCommentModal";
import ConfirmModal from "../components/layouts/ConfirmModal";

import { toast } from 'react-toastify';

const CommentsContext = createContext();

CommentsContext.displayName = 'CommentsContext';

export const CommentsProvider = ({
    children
}) => {
    const { id } = useParams();
    const { username } = useContext(AuthContext);

    const [comments, dispatch] = useReducer(commentsReducer, []);

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

    const addCommentHandler = async (values) => {
        commentsService.create(id, values.comment)
            .then(newComment => {
                newComment.author = { username };

                dispatch({
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
        setShowEditCommentModal(false);

        commentsService.remove({ id: editComment.id })
            .then(comments => {
                dispatch({
                    type: 'REMOVE_COMMENT',
                    payload: comments
                });

                toast.success('Коментара е изтрит успешно.');
            })
            .catch(error => {
                console.error('Грешка при изтриване на коментар:', error);
                toast.error('Възникна грешка при изтриване на коментар. Моля, опитайте отново.');
            }).finally(() => {
                setEditComment({});
            });
    }

    const values = {
        comments,
        dispatch,
        addCommentHandler,
        commentEditClickHandler,
        commentDeleteClickHandler
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