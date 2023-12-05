import { validationCommon } from "../../../utils/functionsUtils";

const loginValidate = (errors, name, value, values = {}) => {
    switch (name) {
        case 'email':
            if (value.length <= 0) {
                return {
                    ...errors,
                    [name]: 'Не сте въвели E-mail.',
                };
            }
            else if (value.length < 8) {
                return {
                    ...errors,
                    [name]: 'Трябва да въведете минимум 8 символа за E-mail.',
                };
            } else if (!new RegExp(/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/).test(value)) {
                return {
                    ...errors,
                    [name]: 'Невалиден формат на E-mail.',
                };
            }
            return validationCommon(errors, name);

        case 'password':
            if (value.length <= 0) {
                return {
                    ...errors,
                    [name]: 'Не сте въвели парола.',
                };
            } else if (value.length < 6) {
                return {
                    ...errors,
                    [name]: 'Трябва да въведете минимум 6 символа за парола.',
                };
            }
            return validationCommon(errors, name);


        default:
            return commonValidation(errors, name);
    }
};

export default loginValidate;