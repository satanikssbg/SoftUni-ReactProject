import { useContext, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import useForm from "../../../hooks/useForm";

import NewsContext from "../../../contexts/newsContext";
import AuthContext from "../../../contexts/authContext";

import * as request from '../../../lib/request';
import upload from "../../../lib/upload";
import * as newsService from '../../../services/newsService';

import editNewsValidate from "./editNewsValidate";

import { removeKeysForForms } from "../../../utils/functionsUtils";

import Path from "../../../paths";

import Loading from "../../layouts/Loading";
import { toast } from 'react-toastify';

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
        setLoading(true);

        try {
            //const escapedTitle = encodeURIComponent(values.title);
            const escapedTitle = JSON.stringify(values.title).slice(1, -1);
            const checkForDuplicate = await request.get(`${Path.News}?select=_id,title&where=title%3D%22${escapedTitle}%22`);

            const checkForDuplicateWitoutThis = checkForDuplicate.filter(item => item._id !== id);

            if (checkForDuplicateWitoutThis.length === 0) {
                const imgFile = values[`${FormKeys.Img}_file`];
                let imgUrl = article.img;

                try {
                    if (imgFile) {
                        imgUrl = await upload(imgFile);
                    }

                    await newsService.editNew(article._id, values, imgUrl);
                    toast.success('Новината е редактирана успешно.');
                    navigate(`/news/${article._id}`);
                } catch (error) {
                    if (imgFile) {
                        console.error('Грешка при качване на снимка:', error);
                        toast.error('Грешка при качване на снимка. Моля, опитайте отново.');
                    } else {
                        console.error('Грешка при редактиране на новина:', error);
                        toast.error('Грешка при редактиране на новина. Моля, опитайте отново.');
                    }
                }
            } else {
                toast.error('Вече съществува новина с това заглавие.');
            }
        } catch (error) {
            toast.error('Възникна грешка при създаването на новина.');
        } finally {
            setLoading(false);
        }
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
    }, editNewsValidate);

    const testEdit = () => {
        request.patch(`http://localhost:3030/data/news/${id}`, { title: 'proba1' }).then(res => console.log(res));
    }

    useEffect(() => {
        if (article._id) {
            const formDefaultKeys = removeKeysForForms(article);

            formDefaultKeys.map(key => {
                if (key !== 'img') {
                    const changeInitialValue = {
                        target: {
                            name: `${key}`,
                            value: key === 'category' || key === 'region' ? article[key]._id : article[key],
                        }
                    };

                    onChange(changeInitialValue);
                }
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
                                <label htmlFor={FormKeys.Img}>
                                    <strong>Снимка</strong>
                                </label>
                                <div className="custom-file">
                                    <input
                                        id={FormKeys.Img}
                                        name={FormKeys.Img}
                                        value={''}
                                        onChange={onChange}
                                        type="file"
                                        className={`form-control custom-file-input ${errors[FormKeys.Img] && 'is-invalid'}`}
                                        accept=".jpg, .jpeg, .png, .webp, .gif"
                                    />
                                    <label className="custom-file-label" id={`${FormKeys.Img}_fileName`}>
                                        Изберете файл
                                    </label>
                                </div>
                                {
                                    errors[FormKeys.Img] && <div className="invalid-feedback" style={{ display: "inline-block" }}>{errors[FormKeys.Img]}</div>
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