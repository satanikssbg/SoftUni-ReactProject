export const objectChunk = (obj, size) => {
    const keys = Object.keys(obj);
    const result = [];
    let index = 0;

    while (index < keys.length) {
        result.push(keys.slice(index, index + size).reduce((acc, key) => {
            acc[key] = obj[key];
            return acc;
        }, {}));
        index += size;
    }

    return result;
}

export const stringLimiter = (string, maxLength) => {
    if (string.length > maxLength) {
        return string.slice(0, maxLength) + '...';
    } else {
        return string;
    }
};

export const formatDateString = (inputDate) => {
    const date = new Date(Number(inputDate));
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    const formattedDate = date.toLocaleDateString('bg-BG', options);

    return formattedDate;
}

export const removeKeysForForms = (keys) => {
    return Object.keys(keys).filter(key => !key.startsWith('_'));
}

export const omit = (obj, keysToOmit) => {
    const result = {};

    for (const key in obj) {
        if (!keysToOmit.includes(key)) {
            result[key] = obj[key];
        }
    }

    return result;
};