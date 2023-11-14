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