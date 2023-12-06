import * as request from '../lib/request';

import Path from '../paths';

export const create = async (newId, comment) => {
    const newComment = await request.post(`${Path.Comments}`, {
        newId,
        comment,
    });

    return newComment;
};

export const edit = async ({ id, comment }) => {
    const result = await request.patch(`${Path.Comments}/${id}`, {
        comment,
    });

    return result;
};

export const remove = async ({ id }) => {
    const result = await request.remove(`${Path.Comments}/${id}`);

    if (result._deletedOn) {
        result._id = id;
    }

    return result;
};

export const getAll = async (newId) => {
    const query = new URLSearchParams({
        where: `newId="${newId}"`,
        load: `author=_ownerId:users`,
    });

    const result = await request.get(`${Path.Comments}?${query}`);

    return result;
};