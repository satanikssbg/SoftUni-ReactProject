import { omit } from 'lodash';

const addNewsValidate = (errors, name, value, values = {}) => {
    switch (name) {
        case 'title':
            if (value.length <= 0) {
                return {
                    ...errors,
                    [name]: 'Не сте въвели заглавие.',
                };
            } else if (value.length < 8) {
                return {
                    ...errors,
                    [name]: 'Трябва да въведете минимум 8 символа за заглавие.',
                };
            } else {
                let newObj = omit(errors, [name]);
                return newObj;
            }
            break;

        case 'category':
            if (value.length <= 0) {
                return {
                    ...errors,
                    [name]: 'Не сте избрали категория.',
                };
            } else {
                let newObj = omit(errors, [name]);
                return newObj;
            }
            break;

        case 'region':
            if (value.length <= 0) {
                return {
                    ...errors,
                    [name]: 'Не сте избрали регион.',
                };
            } else {
                let newObj = omit(errors, [name]);
                return newObj;
            }
            break;

        case 'article':
            if (value.length <= 0) {
                return {
                    ...errors,
                    [name]: 'Не сте въвели съдъраниже.',
                };
            } else if (value.length < 30) {
                return {
                    ...errors,
                    [name]: 'Трябва да въведете минимум 30 символа за съдържание.',
                };
            } else {
                let newObj = omit(errors, [name]);
                return newObj;
            }
            break;

        case 'img':
            if (value.length !== 0 && !new RegExp(/(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/g).test(value)) {
                return {
                    ...errors,
                    [name]: 'Трябва да въведете валиден линк',
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

export default addNewsValidate;