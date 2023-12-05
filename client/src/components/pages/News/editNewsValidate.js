import { omit } from '../../../utils/functionsUtils';
import { ALLOWED_IMAGE_EXT } from '../../../config';

const commonValidation = (errors, name) => omit(errors, [name]);

const addNewsValidate = (errors, name, value, values = {}) => {
    switch (name) {
        case 'title':
            if (value.length <= 0) {
                return { ...errors, [name]: 'Не сте въвели заглавие.' };
            } else if (value.length < 8) {
                return { ...errors, [name]: 'Трябва да въведете минимум 8 символа за заглавие.' };
            }
            return commonValidation(errors, name);

        case 'category':
        case 'region':
            if (value.length <= 0) {
                return { ...errors, [name]: `Не сте избрали ${name === 'category' ? 'категория' : 'регион'}.` };
            }
            return commonValidation(errors, name);

        case 'article':
            if (value.length <= 0) {
                return { ...errors, [name]: 'Не сте въвели съдъраниже.' };
            } else if (value.length < 30) {
                return { ...errors, [name]: 'Трябва да въведете минимум 30 символа за съдържание.' };
            }
            return commonValidation(errors, name);

        case 'img':
            const fileExtension = value.split('.').pop().toLowerCase();
            if (value.length > 0 && !ALLOWED_IMAGE_EXT.includes(fileExtension)) {
                return {
                    ...errors,
                    [name]: `Файла, който се опитвате да качите, не е позволен. (Позволени разширения: ${ALLOWED_IMAGE_EXT.join(', ')})`,
                };
            }
            return commonValidation(errors, name);

        default:
            return commonValidation(errors, name);
    }
};

export default addNewsValidate;