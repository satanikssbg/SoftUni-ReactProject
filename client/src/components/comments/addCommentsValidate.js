import { validationCommon } from '../../utils/functionsUtils';

const addCommentsValidate = (errors, name, value) => {
    switch (name) {
        case 'comment':
            if (value.length <= 0) {
                return {
                    ...errors,
                    [name]: 'Не сте въвели коментар.'
                };
            } else if (value.length < 4) {
                return {
                    ...errors,
                    [name]: 'Трябва да въведете минимум 4 символа за коментар.'
                };
            }
            return validationCommon(errors, name);

        default:
            return validationCommon(errors, name);
    }
}

export default addCommentsValidate;