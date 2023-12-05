import { useContext, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import AuthContext from "../../../contexts/authContext";
import * as newsService from '../../../services/newsService';
import Loading from "../../layouts/Loading";
import { formatDateString } from "../../../utils/functionsUtils";
import ConfirmModal from "../../layouts/ConfirmModal";
import { toast } from 'react-toastify';
import withSidebar from "../../../HOC/withSidebar";

const Read = () => {
    const { id } = useParams();
    const { isAuthenticated, userRole, userId } = useContext(AuthContext);

    const [loading, setLoading] = useState(false);

    const navigate = useNavigate();

    const [article, setArticle] = useState({});
    const [showConfirmModal, setShowConfirmModal] = useState(false);

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
                        <img className="imageAspectRatio169 lazyload" src={article.img} alt={article.title} />
                    </figure>
                </div>
            </div>

            <div className="row">
                <div className="readNews col-12 col-sm-12 col-md-12 col-lg-12 col-xl-12">
                    <div className="readArticle">
                        <TextWithLineBreaks article={article.article} />
                    </div>
                </div>
            </div>
        </article>
    );
};

export default withSidebar(Read);