import { omit } from 'lodash';

const registerValidate = (errors, name, value, values = {}) => {
    console.log(values);
    switch (name) {
        case 'username':
            if (value.length <= 0) {
                return {
                    ...errors,
                    [name]: 'Не сте въвели потребителко име.',
                };
            } else if (value.length < 3) {
                return {
                    ...errors,
                    [name]: 'Трябва да въведете минимум 3 символа за потребителко име.',
                };
            } else {
                let newObj = omit(errors, [name]);
                return newObj;
            }
            break;

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
            } else {
                let newObj = omit(errors, [name]);
                return newObj;
            }
            break;

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
            } else {
                let newObj = omit(errors, [name]);
                return newObj;
            }
            break;

        case 'repassword':
            if (value.length <= 0) {
                return {
                    ...errors,
                    [name]: 'Не сте въвели потвърждаваща парола.',
                };
            } else if (value.length < 6) {
                return {
                    ...errors,
                    [name]: 'Трябва да въведете минимум 6 символа за потвърждаваща парола.',
                };
            } else if (value !== values.password) {
                return {
                    ...errors,
                    [name]: 'Двете пароли несъвпадат.',
                };
            } else {
                let newObj = omit(errors, [name]);
                return newObj;
            }
            break;

        case 'termsAgreement':
            if (value !== true) {
                return {
                    ...errors,
                    [name]: 'Не сте приели Общите условия.',
                };
            } else {
                let newObj = omit(errors, [name]);
                return newObj;
            }
            break;

        default:

            break;
    }
};

export default registerValidate;