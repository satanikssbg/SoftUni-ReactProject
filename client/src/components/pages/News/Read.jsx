import { useContext, useEffect, useReducer, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import useForm from "../../../hooks/useForm";

import AuthContext from "../../../contexts/authContext";
import CommentsContext from "../../../contexts/commentsContext";

import * as newsService from '../../../services/newsService';

import { formatDateString } from "../../../utils/functionsUtils";

import withSidebar from "../../../HOC/withSidebar";

import addCommentsValidate from "../../comments/addCommentsValidate";

import ConfirmModal from "../../layouts/ConfirmModal";
import CommentsList from "../../comments/CommentsList";
import Loading from "../../layouts/Loading";

import { toast } from 'react-toastify';

const CommentFormKeys = {
    Comment: 'comment',
};

const Read = () => {
    const { id } = useParams();
    const { isAuthenticated, userRole, userId, username } = useContext(AuthContext);

    const [loading, setLoading] = useState(false);

    const navigate = useNavigate();

    const [article, setArticle] = useState({});
    const [showConfirmModal, setShowConfirmModal] = useState(false);

    const { comments, addCommentHandler, commentEditClickHandler, commentDeleteClickHandler } = useContext(CommentsContext);

    useEffect(() => {
        setLoading(true);

        newsService.getOne(id)
            .then(data => {
                setArticle(data);
            })
            .catch(() => {
                navigate('/news');
            })
            .finally(() => {
                setLoading(false);
            });

        return () => {
            setArticle({});
        };
    }, [id]);

    const TextWithLineBreaks = (article) => {
        if (article.article) {
            const lines = article.article.split('\n');

            return (
                <>
                    {lines.map((line, index) => (
                        <p key={index}>
                            {line}
                        </p>
                    ))}
                </>
            );
        }
    };

    const deleteClickHandler = () => {
        setShowConfirmModal(true);
    }

    const deteleNewsHandler = () => {
        setShowConfirmModal(false);
        setLoading(true);

        newsService.deleteNew(article._id)
            .then(() => {
                toast.success('Новината е изтрира успешно.');
                navigate('/news');
            })
            .catch(error => {
                console.error('Грешка при изтриване на новина:', error);
                toast.error('Грешка при изтриване на новина. Моля опитайте отново.');
            })
            .finally(() => {
                setLoading(false);
            });
    }

    const { values, errors, onChange, onSubmit } = useForm(addCommentHandler, {
        [CommentFormKeys.Comment]: '',
    }, addCommentsValidate);

    const commentPressEnterHandler = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            onSubmit(e);
        }
    };

    if (loading) {
        return <Loading />;
    }

    return (
        <article>
            {
                (isAuthenticated && ((userRole === "admin") || (userRole === "reporter" && article._ownerId === userId))) && (
                    <div className="row">
                        <div className="col-12">
                            <div className="btn-toolbar">
                                <div className="btn-group btn-group-sm mr-2">
                                    <Link to={`/news/edit/${id}`} className="btn btn-success">
                                        <i className="fa fa-pencil"></i> Редактирай
                                    </Link>

                                    <button className="btn btn-danger" onClick={deleteClickHandler}>
                                        <i className="fa fa-trash-o"></i> Изтрий
                                    </button>

                                    {showConfirmModal &&
                                        <ConfirmModal
                                            description="Сигурни ли сте, че искате да изтриете новината?"
                                            confim={deteleNewsHandler}
                                            show={() => setShowConfirmModal(true)}
                                            onClose={() => setShowConfirmModal(false)}
                                        />
                                    }
                                </div>

                                <div className="btn-group btn-group-sm mr-2">
                                    <button className="btn btn-secondary">
                                        <i className="fa fa-user"></i> Добавил: {article.author?.username}
                                    </button>
                                </div>

                                {article._updatedOn && (
                                    <div className="btn-group btn-group-sm mr-2">
                                        <button className="btn btn-secondary">
                                            <i className="fa fa-clock-o"></i> Последна редакция: {formatDateString(article._updatedOn, true)}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            <div className="row">
                <div className="col-12 col-sm-12 col-md-12 col-lg-12 col-xl-12">
                    <div>
                        <h1 className="articleTitle d-none d-sm-none d-md-block d-lg-block d-xl-block">
                            {article.title}
                        </h1>
                        <h3 className="articleTitle d-block d-sm-block d-md-none d-lg-none d-xl-none">
                            {article.title}
                        </h3>
                    </div>
                    <div className="articleData">
                        <div>
                            <i className="fas fa-map-marker"></i>
                            <span className="d-none d-sm-none d-md-inline d-lg-inline d-xl-inline">Регион: {article.region?.region}</span>

                            <i className="fas fa-tag"></i>
                            <span className="d-none d-sm-none d-md-inline d-lg-inline d-xl-inline">Категория: {article.category?.category}</span>

                            <i className="far fa-calendar-alt"></i>
                            <span className="d-none d-sm-none d-md-inline d-lg-inline d-xl-inline">Публикувано: {formatDateString(article._createdOn)}</span>
                        </div>
                    </div>

                    <figure>
                        <img className="imageAspectRatio169" src={article.img} alt={article.title} />
                    </figure>
                </div>
            </div>

            <div className="row">
                <div className="readNews col-12 col-sm-12 col-md-12 col-lg-12 col-xl-12">
                    <div className="readArticle">
                        <TextWithLineBreaks article={article.article} />
                    </div>
                </div>
                <div style={{ width: '100%' }}>
                    <span className="articleLabel">
                        <i className="fa fa-user"></i> Автор: {article.author?.username}
                    </span>
                </div>
            </div>


            <div className="row newsLines">
                <div className="obshtinaHeading">
                    <div className="headingLine"></div>
                    <div className="headingText">Коментари</div>
                </div>
            </div>

            <div className="row">
                <div className="adsFilters row col-12">
                    <div className="form-group col-12 col-sm-12 col-md-12 col-lg-12 col-xl-12">
                        {comments.length > 0
                            ? (
                                <>
                                    <ul className="list-unstyled">
                                        {comments.map(comment =>
                                            <CommentsList
                                                key={comment._id}
                                                {...comment}
                                                onEdit={commentEditClickHandler}
                                                onDelete={commentDeleteClickHandler}
                                            />
                                        )}
                                    </ul>
                                </>
                            )
                            : (
                                <div className="alert alert-info text-center">
                                    Тази новина все още няма добавени коментари. Ти можеш да бъдеш първият!
                                </div>
                            )
                        }
                    </div>
                </div>

                {
                    isAuthenticated
                        ? (
                            <form className="adsFilters row col-12" onSubmit={onSubmit} noValidate>
                                <div className="form-group col-12 col-sm-12 col-md-12 col-lg-12 col-xl-12">
                                    <textarea
                                        id={CommentFormKeys.Comment}
                                        name={CommentFormKeys.Comment}
                                        value={values[CommentFormKeys.Comment]}
                                        onChange={onChange}
                                        placeholder="Въведете коментар"
                                        rows={3}
                                        type="text"
                                        className={`form-control ${errors[CommentFormKeys.Comment] ? 'is-invalid' : ''}`}
                                        onKeyPress={commentPressEnterHandler}
                                    />
                                    {
                                        errors[CommentFormKeys.Comment] && <div className="invalid-feedback">{errors[CommentFormKeys.Comment]}</div>
                                    }
                                </div>

                                <div className="col-12 text-center">
                                    <button className="submitButton allNewsLinkButton" type="submit">
                                        Добави коментар
                                    </button>
                                </div>
                            </form>
                        )
                        : (
                            <div className="col-12 col-sm-12 col-md-12 col-lg-12 col-xl-12">
                                <div className="alert alert-danger text-center">
                                    Желаеш да добавиш коментар? Моля, <Link to='/login' title='Вход'>влез</Link> в своя акаунт или се <Link to='/register' title='Регистрация'>регистрирай</Link>.
                                </div>
                            </div>
                        )
                }
            </div>
        </article>
    );
};

export default withSidebar(Read);