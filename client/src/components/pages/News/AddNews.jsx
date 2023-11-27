import { useContext, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import useForm from "../../../hooks/useForm";

import AuthContext from "../../../contexts/authContext";

import * as request from '../../../lib/request';
import * as newsService from '../../../services/newsService';

import addNewsValidate from "./addNewsValidate";

import Path from "../../../paths";

import { toast } from 'react-toastify';

const FormKeys = {
    Title: 'title',
    Category: 'category',
    Region: 'region',
};

const AddNews = () => {
    const addNewSubmitHandler = async (values) => {
        const query = new URLSearchParams({
            select: `id,title`,
            where: `title="${values.title}"`
        });

        const checkForDublicate = await request.get(`${Path.News}?${query}`);

        if (checkForDublicate.length === 0) {
            const result = await newsService.createNew(values.title);

            if (result && result._id) {
                toast.success('Новината е добавена успешно.');
            }
        } else {

        }
    };

    const { values, errors, onChange, onSubmit } = useForm(addNewSubmitHandler, {
        [FormKeys.Title]: '123456789',

    }, addNewsValidate);

    return (
        <>
            <div className="row">
                <div className="contentWrap row col-12 col-sm-12 col-md-12 col-lg-9 col-xl-9">
                    <div className="row">
                        <div className="obshtinaHeading">
                            <div className="headingLine" />
                            <div className="headingText">Добавяне на новина</div>
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

                            <div className="col-12 text-center">
                                <button className="submitButton allNewsLinkButton" type="submit">
                                    Добави
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </>
    );
}

export default AddNews;