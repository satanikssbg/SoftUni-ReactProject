import { useState } from 'react';

const useForm = (submitHandler, initialValues, validation) => {
    const [values, setValues] = useState(initialValues);
    const [errors, setErrors] = useState({});

    const validateAllFields = () => {
        let newErrors = {};

        if (validation) {
            for (const [name, value] of Object.entries(values)) {
                newErrors = validation(newErrors, name, value, values);
            }
        }

        setErrors(newErrors);

        return newErrors;
    };

    const onChange = (e) => {
        let name = e.target.name;
        let value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;

        if (e.target.type === "file" && document.querySelector(`#${name}_fileName`)) {
            let file = document.querySelector(`#${name}`).files[0];
            document.querySelector(`#${name}_fileName`).innerHTML = file.name;
        }

        setValues((state) => {
            const newState = {
                ...state,
                [name]: value,
            };

            if (validation) {
                const newErrors = validation(errors, name, value, newState);
                setErrors(newErrors);
            }

            if (e.target.type === "file") {
                newState[`${name}_file`] = e.target.files[0];
            }

            return newState;
        });
    };

    const onSubmit = (e) => {
        e.preventDefault();

        if (validation) {
            const newErrors = validateAllFields();

            if (Object.keys(newErrors).length === 0 && Object.keys(values).length !== 0) {
                submitHandler(values)
                    .then()
                    .catch(error => {
                        setErrors({ submit: error.message });
                    });
            }
        } else {
            submitHandler(values);
        }
    };

    return {
        values,
        errors,
        onChange,
        onSubmit,
    };
};

export default useForm;