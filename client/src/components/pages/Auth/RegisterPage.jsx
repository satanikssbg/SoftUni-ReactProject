import { useContext, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import useForm from "../../../hooks/useForm";

import AuthContext from "../../../contexts/authContext";

import registerValidate from "./registerValidate";

const RegisterFormKyes = {
    Username: 'username',
    Email: 'email',
    Password: 'password',
    RePassword: 'repassword',
    TermsAgreement: 'termsAgreement',
};

const RegisterPage = () => {
    const navigate = useNavigate();

    const { isAuthenticated, registerSubmitHandler } = useContext(AuthContext);

    useEffect(() => {
        if (isAuthenticated) {
            navigate('/');
        }
    }, [isAuthenticated]);

    const { values, errors, onChange, onSubmit } = useForm(registerSubmitHandler, {
        [RegisterFormKyes.Username]: '',
        [RegisterFormKyes.Email]: '',
        [RegisterFormKyes.Password]: '',
        [RegisterFormKyes.RePassword]: '',
        [RegisterFormKyes.TermsAgreement]: false,
    }, registerValidate);

    return (
        <div className="row">
            <div className="obshtinaHeading">
                <div className="headingLine" />
                <div className="headingText">Регистрация</div>
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
                    <label htmlforfor={RegisterFormKyes.Username}>
                        <strong>Потребителско име</strong> <span className="redText">*</span>
                    </label>
                    <input
                        id={RegisterFormKyes.Username}
                        name={RegisterFormKyes.Username}
                        value={values[RegisterFormKyes.Username]}
                        onChange={onChange}
                        placeholder="Въведете Потребителско име"
                        maxLength={255}
                        type="text"
                        className={`form-control ${errors[RegisterFormKyes.Username] && 'is-invalid'}`}
                    />
                    {
                        errors[RegisterFormKyes.Username] && <div className="invalid-feedback">{errors[RegisterFormKyes.Username]}</div>
                    }
                </div>

                <div className="form-group col-12 col-sm-12 col-md-12 col-lg-12 col-xl-12">
                    <label htmlforfor={RegisterFormKyes.Email}>
                        <strong>E-mail</strong> <span className="redText">*</span>
                    </label>
                    <input
                        id={RegisterFormKyes.Email}
                        name={RegisterFormKyes.Email}
                        value={values[RegisterFormKyes.Email]}
                        onChange={onChange}
                        placeholder="Въведете E-mail"
                        maxLength={255}
                        type="email"
                        className={`form-control ${errors[RegisterFormKyes.Email] && 'is-invalid'}`}
                    />
                    {
                        errors[RegisterFormKyes.Email] && <div className="invalid-feedback">{errors[RegisterFormKyes.Email]}</div>
                    }
                </div>

                <div className="form-group col-12 col-sm-12 col-md-12 col-lg-12 col-xl-12">
                    <label htmlforfor={RegisterFormKyes.Password}>
                        <strong>Парола</strong> <span className="redText">*</span>
                    </label>
                    <input
                        id={RegisterFormKyes.Password}
                        name={RegisterFormKyes.Password}
                        value={values[RegisterFormKyes.Password]}
                        onChange={onChange}
                        placeholder="Въведете парола"
                        maxLength={64}
                        type="password"
                        className={`form-control ${errors[RegisterFormKyes.Password] && 'is-invalid'}`}
                    />
                    {
                        errors[RegisterFormKyes.Password] && <div className="invalid-feedback">{errors[RegisterFormKyes.Password]}</div>
                    }
                </div>

                <div className="form-group col-12 col-sm-12 col-md-12 col-lg-12 col-xl-12">
                    <label htmlforfor={RegisterFormKyes.RePassword}>
                        <strong>Потвърждаваща Парола</strong> <span className="redText">*</span>
                    </label>
                    <input
                        id={RegisterFormKyes.RePassword}
                        name={RegisterFormKyes.RePassword}
                        value={values[RegisterFormKyes.RePassword]}
                        onChange={onChange}
                        placeholder="Въведете потвърждаваща парола"
                        maxLength={64}
                        type="password"
                        className={`form-control ${errors[RegisterFormKyes.RePassword] && 'is-invalid'}`}
                    />
                    {
                        errors[RegisterFormKyes.RePassword] && <div className="invalid-feedback">{errors[RegisterFormKyes.RePassword]}</div>
                    }
                </div>

                <div className="form-group col-12 col-sm-12 col-md-12 col-lg-12 col-xl-12">
                    <div className="custom-checkbox custom-control">
                        <input
                            id={RegisterFormKyes.TermsAgreement}
                            name={RegisterFormKyes.TermsAgreement}
                            onChange={onChange}
                            type="checkbox"
                            className="custom-control-input"
                        />
                        <label className="custom-control-label" htmlFor={RegisterFormKyes.TermsAgreement}>
                            Съгласен съм с Общите условия
                        </label>
                    </div>
                    {
                        errors[RegisterFormKyes.TermsAgreement] && <div className="invalid-feedback" style={{ display: 'block' }}>{errors[RegisterFormKyes.TermsAgreement]}</div>
                    }
                </div>

                <div className="col-12 text-center">
                    <button className="submitButton allNewsLinkButton" type="submit">
                        Регистрация
                    </button>
                </div>
            </form>
        </div>
    );
}

export default RegisterPage;