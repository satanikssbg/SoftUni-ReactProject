import { useContext, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import useForm from "../../../hooks/useForm";

import AuthContext from "../../../contexts/authContext";

import { toast } from 'react-toastify';

import loginValidate from "./loginValidate";

const LoginFormKyes = {
    Email: 'email',
    Password: 'password',
};

const LoginPage = () => {
    const navigate = useNavigate();

    const { isAuthenticated, loginSubmitHandler } = useContext(AuthContext);


    useEffect(() => {
        if (isAuthenticated) {
            navigate('/');
        }

    }, [isAuthenticated]);

    const { values, errors, onChange, onSubmit } = useForm(loginSubmitHandler, {
        [LoginFormKyes.Email]: '',
        [LoginFormKyes.Password]: '',
    }, loginValidate);

    return (
        <>
            <div className="row">
                <div className="contentWrap row col-12 col-sm-12 col-md-12 col-lg-9 col-xl-9">
                    <div className="row">
                        <div className="obshtinaHeading">
                            <div className="headingLine" />
                            <div className="headingText">Вход</div>
                        </div>

                        <form className="adsFilters row col-12" onSubmit={onSubmit} noValidate>
                            {errors.submit && (
                                <div className="form-group col-12 col-sm-12 col-md-12 col-lg-12 col-xl-12">
                                    <div className="alert alert-danger">
                                        {errors.submit}
                                    </div>
                                </div>
                            )}

                            <div className="form-group col-12 col-sm-12 col-md-12 col-lg-12 col-xl-12">
                                <label htmlforfor={LoginFormKyes.Email}>
                                    <strong>E-mail</strong> <span className="redText">*</span>
                                </label>
                                <input
                                    id={LoginFormKyes.Email}
                                    name={LoginFormKyes.Email}
                                    value={values[LoginFormKyes.Email]}
                                    onChange={onChange}
                                    placeholder="Въведете E-mail"
                                    maxLength={255}
                                    type="email"
                                    className={`form-control ${errors[LoginFormKyes.Email] && 'is-invalid'}`}
                                />
                                {
                                    errors[LoginFormKyes.Email] && <div className="invalid-feedback">{errors[LoginFormKyes.Email]}</div>
                                }
                            </div>

                            <div className="form-group col-12 col-sm-12 col-md-12 col-lg-12 col-xl-12">
                                <label htmlforfor={LoginFormKyes.Password}>
                                    <strong>Парола</strong> <span className="redText">*</span>
                                </label>
                                <input
                                    id={LoginFormKyes.Password}
                                    name={LoginFormKyes.Password}
                                    value={values[LoginFormKyes.Password]}
                                    onChange={onChange}
                                    placeholder="Въведете парола"
                                    maxLength={64}
                                    type="password"
                                    className={`form-control ${errors[LoginFormKyes.Password] && 'is-invalid'}`}
                                />
                                {
                                    errors[LoginFormKyes.Password] && <div className="invalid-feedback">{errors[LoginFormKyes.Password]}</div>
                                }
                            </div>

                            <div className="col-12 text-center">
                                <button className="submitButton allNewsLinkButton" type="submit">
                                    Вход
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </>
    );
}

export default LoginPage;