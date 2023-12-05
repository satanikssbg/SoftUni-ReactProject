import * as request from '../lib/request';

import Path from '../paths';

export const create = async (newId, comment) => {
    const newComment = await request.post(`${Path.Comments}`, {
        newId,
        comment,
    });

    return newComment;
};

export const getAll = async (newId) => {
    const query = new URLSearchParams({
        where: `newId="${newId}"`,
        load: `author=_ownerId:users`,
    });

    const result = await request.get(`${Path.Comments}?${query}`);

    return result;
};