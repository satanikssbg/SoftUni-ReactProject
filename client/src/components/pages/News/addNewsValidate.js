import { omit } from 'lodash';

const addNewsValidate = (errors, name, value, values = {}) => {
    console.log(values);
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

        default:

            break;
    }
};

export default addNewsValidate;