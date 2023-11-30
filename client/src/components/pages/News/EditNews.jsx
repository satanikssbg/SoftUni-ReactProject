import { Navigate, useNavigate, useParams } from "react-router-dom";

import * as request from '../../../lib/request';
import * as newsService from '../../../services/newsService';
import { useContext, useEffect, useState } from "react";
import useForm from "../../../hooks/useForm";
import { removeKeysForForms } from "../../../utils/functionsUtils";
import NewsContext from "../../../contexts/newsContext";
import AuthContext from "../../../contexts/authContext";
import addNewsValidate from "./addNewsValidate";
import Loading from "../../layouts/Loading";

const FormKeys = {
    Title: 'title',
    Category: 'category',
    Region: 'region',
    Article: 'article',
    Img: 'img',
};

const EditNews = () => {
    const { id } = useParams();
    const { userRole, userId } = useContext(AuthContext);
    const { categories, regions } = useContext(NewsContext);

    const [article, setArticle] = useState({});
    const [loading, setLoading] = useState(false);

    const navigate = useNavigate();

    const editNewSubmitHandler = async (values) => {

    };

    useEffect(() => {
        setLoading(true);

        newsService.getOne(id)
            .then(data => {
                if (userRole === "reporter" && data._ownerId !== userId) {
                    navigate(`/news/${id}`);
                }

                setArticle(data);
                setLoading(false);
            })
            .catch(error => navigate('/news'));
    }, [id]);

    const { values, errors, onChange, onSubmit } = useForm(editNewSubmitHandler, {
        [FormKeys.Title]: '',
        [FormKeys.Category]: '',
        [FormKeys.Region]: '',
        [FormKeys.Article]: '',
        [FormKeys.Img]: '',
    }, addNewsValidate);

    const testEdit = () => {
        request.patch(`http://localhost:3030/data/news/${id}`, { title: 'proba1' }).then(res => console.log(res));
    }

    useEffect(() => {
        if (article._id) {
            const formDefaultKeys = removeKeysForForms(article);

            formDefaultKeys.map(key => {
                const changeInitialValue = {
                    target: {
                        name: `${key}`,
                        value: key === 'category' || key === 'region' ? article[key]._id : article[key],
                    }
                };

                onChange(changeInitialValue);
            });
        }
    }, [article]);

    if (loading) {
        return <Loading />;
    }

    return (
        <>
            <div className="row">
                <div className="contentWrap row col-12 col-sm-12 col-md-12 col-lg-9 col-xl-9">
                    <div className="row">
                        <div className="obshtinaHeading">
                            <div className="headingLine" />
                            <div className="headingText">Редактиране на новина</div>
                        </div>

                        <form className="adsFilters row col-12" onSubmit={onSubmit} noValidate>
                            <div className="form-group col-12 col-sm-12 col-md-12 col-lg-12 col-xl-12">
                                <label htmlforfor={FormKeys.Title}>
                                    <strong>Заглавие</strong> <span className="redText">*</span>
                                </label>
                                <input
                                    id={FormKeys.Title}
                                    name={FormKeys.Title}
                                    value={values[FormKeys.Title]}
                                    onChange={onChange}
                                    placeholder="Въведете заглавие"
                                    maxLength={255}
                                    type="text"
                                    className={`form-control ${errors[FormKeys.Title] && 'is-invalid'}`}
                                />
                                {
                                    errors[FormKeys.Title] && <div className="invalid-feedback">{errors[FormKeys.Title]}</div>
                                }
                            </div>

                            <div className="form-group col-12 col-sm-12 col-md-9 col-lg-9 col-xl-9">
                                <label htmlFor="name">
                                    <strong>Кагетория</strong> <span className="redText">*</span>
                                </label>
                                <div className="row">
                                    {
                                        categories && categories.length > 0 && categories.map(category => (
                                            <div key={category.slug} className="col-6 custom-radio custom-control">
                                                <input
                                                    id={`category${category._id}`}
                                                    name={FormKeys.Category}
                                                    onChange={onChange}
                                                    value={category._id}
                                                    defaultChecked={category._id === article?.category?._id}
                                                    type="radio"
                                                    className="custom-control-input"
                                                />
                                                <label className="custom-control-label" htmlFor={`category${category._id}`}>
                                                    {category.category}
                                                </label>
                                            </div>

                                        ))
                                    }
                                </div>
                                {
                                    errors[FormKeys.Category] && <div className="invalid-feedback" style={{ display: 'block' }}>{errors[FormKeys.Category]}</div>
                                }
                            </div>

                            <div className="form-group col-12 col-sm-12 col-md-9 col-lg-9 col-xl-9">
                                <label htmlFor="name">
                                    <strong>Регион</strong> <span className="redText">*</span>
                                </label>
                                <div className="row">
                                    {
                                        regions && regions.length > 0 && regions.map(region => (
                                            <div key={region.slug} className="col-6 custom-radio custom-control">
                                                <input
                                                    id={`region${region._id}`}
                                                    name={FormKeys.Region}
                                                    onChange={onChange}
                                                    value={region._id}
                                                    defaultChecked={region._id === article?.region?._id}
                                                    type="radio"
                                                    className="custom-control-input"
                                                />
                                                <label className="custom-control-label" htmlFor={`region${region._id}`}>
                                                    {region.region}
                                                </label>
                                            </div>

                                        ))
                                    }
                                </div>
                                {
                                    errors[FormKeys.Region] && <div className="invalid-feedback" style={{ display: 'block' }}>{errors[FormKeys.Region]}</div>
                                }
                            </div>

                            <div className="form-group col-12 col-sm-12 col-md-12 col-lg-12 col-xl-12">
                                <label htmlforfor={FormKeys.Article}>
                                    <strong>Съдържание</strong> <span className="redText">*</span>
                                </label>
                                <textarea
                                    id={FormKeys.Article}
                                    name={FormKeys.Article}
                                    value={values[FormKeys.Article]}
                                    onChange={onChange}
                                    placeholder="Въведете съдържание"
                                    rows={6}
                                    type="text"
                                    className={`form-control ${errors[FormKeys.Article] && 'is-invalid'}`}
                                />
                                {
                                    errors[FormKeys.Article] && <div className="invalid-feedback">{errors[FormKeys.Article]}</div>
                                }
                            </div>

                            <div className="form-group col-12 col-sm-12 col-md-12 col-lg-12 col-xl-12">
                                <label htmlforfor={FormKeys.Img}>
                                    <strong>Снимка</strong>
                                </label>
                                <input
                                    id={FormKeys.Img}
                                    name={FormKeys.Img}
                                    value={values[FormKeys.Img]}
                                    onChange={onChange}
                                    placeholder="Поставете линк към снимка"
                                    maxLength={255}
                                    type="text"
                                    className={`form-control ${errors[FormKeys.Img] && 'is-invalid'}`}
                                />
                                {
                                    errors[FormKeys.Img] && <div className="invalid-feedback">{errors[FormKeys.Img]}</div>
                                }
                            </div>

                            <div className="col-12 text-center">
                                <button className="submitButton allNewsLinkButton" type="submit">
                                    Редактирай
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </>
    );
};

export default EditNews;