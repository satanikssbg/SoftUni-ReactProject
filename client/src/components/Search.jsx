import { useRef, useState } from "react";

import useForm from "../hooks/useForm";

import { validationCommon } from "../utils/functionsUtils";
import { useNavigate } from "react-router-dom";

const SearchFormKeys = {
    Search: 'search'
};

const searchValidate = (errors, name, value) => {
    switch (name) {
        case 'search':
            if (value.length <= 0) {
                return {
                    ...errors,
                    [name]: 'Не сте въвели дума за търсене.'
                };
            } else if (value.length < 3) {
                return {
                    ...errors,
                    [name]: 'Трябва да въведете минимум 3 символа за търсене.'
                };
            }
            return validationCommon(errors, name);

        default:
            return validationCommon(errors, name);
    }
}

const Search = () => {
    const navigate = useNavigate();

    const searchRef = useRef(null);

    const searchHandler = async () => {
        $(searchRef.current).collapse('hide');
        setValues({ [SearchFormKeys.Search]: '' });
        navigate(`/news/search/${values[SearchFormKeys.Search]}`);
    }

    const { values, setValues, errors, onChange, onSubmit } = useForm(searchHandler, {
        [SearchFormKeys.Search]: '',
    }, searchValidate);

    const searchPressEnterHandler = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            onSubmit(e);
        }
    };

    return (
        <div ref={searchRef} id="searchBox" className="collapse container">
            <div className="row">
                <form onSubmit={onSubmit} noValidate>
                    <div>
                        <label htmlFor={SearchFormKeys.Search}>
                            <input
                                id={SearchFormKeys.Search}
                                name={SearchFormKeys.Search}
                                value={values[SearchFormKeys.Search]}
                                onChange={onChange}
                                onKeyPress={searchPressEnterHandler}
                                placeholder="Търси"
                                type="text"
                            />
                        </label>
                        <label className="lupa">
                            <i
                                style={{ color: "#0f4359", fontSize: 24 }}
                                className="fas fa-search"
                                aria-hidden="true"
                            />
                            <input type="submit" name="search_post" />
                        </label>
                        <br />
                    </div>
                </form>
                {
                    errors[SearchFormKeys.Search] && <p id="search_error" style={{ fontSize: 14, fontWeight: 700 }}>{errors[SearchFormKeys.Search]}</p>
                }
            </div>
        </div>
    );
}

export default Search;