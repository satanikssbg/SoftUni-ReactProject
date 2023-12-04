import { omit } from 'lodash';
import { ALLOWED_IMAGE_EXT } from '../../../config';

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
            let fileExtension = value.split('.').pop().toLowerCase();

            if (value.length <= 0) {
                return {
                    ...errors,
                    [name]: 'Не сте избрали снимка.',
                };
            }
            else if (!ALLOWED_IMAGE_EXT.includes(fileExtension)) {
                return {
                    ...errors,
                    [name]: `Файла, който се опитвате да качите, не е позволен. (Позволени разширения: ${ALLOWED_IMAGE_EXT.join(', ')})`,
                };
            } else {
                let newObj = omit(errors, [name]);
                return newObj;
            }
            break;

        default:
            let newObj = omit(errors, [name]);
            return newObj;
            break;
    }
};

export default addNewsValidate;