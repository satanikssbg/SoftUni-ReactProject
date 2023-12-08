import { PER_PAGE } from '../config';

import * as request from '../lib/request';

import Path from '../paths';

export const createNew = async ({ title, category, region, article }, img_url) => {
    const result = await request.post(Path.News, {
        title,
        category,
        region,
        article,
        img: img_url
    });

    return result;
}

export const editNew = async (id, { title, category, region, article }, img_url) => {
    const result = await request.put(`${Path.News}/${id}`, {
        title,
        category,
        region,
        article,
        img: img_url
    });

    return result;
}

export const deleteNew = async (id) => {
    let query = new URLSearchParams({
        select: `_id`,
        where: `newId="${id}"`,
    });

    const checkForNewComments = await request.get(`${Path.Comments}?${query}`);

    if (checkForNewComments.length > 0) {
        const deleteOperations = checkForNewComments.map(comment => request.remove(`${Path.Comments}/${comment._id}`));

        try {
            await Promise.all(deleteOperations);
        } catch (error) {
            console.error('Възникна грешка при изтриването на коментарите:', error);
        }
    }

    const result = await request.remove(`${Path.News}/${id}`);

    return result;
}


export const allNews = async () => {
    //TODO
}

export const getOne = async (id) => {
    const query = new URLSearchParams({
        load: [
            'region=region:regions',
            'category=category:categories',
            'author=_ownerId:users'
        ]
    });

    const result = await request.get(`${Path.News}/${id}?${query}`);

    return result;
}

export const newsHomePage = async (limit = 3, type = "ALL", categoryId = null) => {
    const query = new URLSearchParams({
        offset: `0`,
        pageSize: `${limit}`,
    });

    if (type === "CATEGORY") {
        query.append("where", `category="${categoryId}"`);
    }

    const result = await request.get(`${Path.News}?sortBy=_createdOn%20desc&${query}`);

    return result;
}


export const newsPaginate = async (page, type = "ALL", categoryId = null) => {
    let OFFSET = (page - 1) * PER_PAGE;

    let query = new URLSearchParams({
        offset: `${OFFSET}`,
        pageSize: `${PER_PAGE}`,
        load: [
            'region=region:regions',
            'category=category:categories'
        ]
    });

    let escapedSearch = null;

    if (type === "CATEGORY") {
        query.append("where", `category="${categoryId}"`);
    } else if (type === "REGION") {
        query.append("where", `region="${categoryId}"`);
    } else if (type === "SEARCH") {
        escapedSearch = JSON.stringify(categoryId).slice(1, -1);
        query = query.toString() + `&where=title LIKE "${escapedSearch}"`;
    } else if (type === "USER") {
        query.append("where", `_ownerId="${categoryId}"`);
    }

    //const queryString = query.toString().replace(/\+/g, '%20');

    const result = await request.get(`${Path.News}?sortBy=_createdOn%20desc&${query}`);

    return result;
}

export const allNewsCount = async (type = "ALL", categoryId = null) => {
    let query = null;
    let escapedSearch = null;

    switch (type) {
        case "CATEGORY":
            query = new URLSearchParams({
                where: `category="${categoryId}"`
            });
            break;

        case "REGION":
            query = new URLSearchParams({
                where: `region="${categoryId}"`
            });
            break;

        case "SEARCH":
            escapedSearch = JSON.stringify(categoryId).slice(1, -1);
            query = `where=title LIKE "${escapedSearch}"`;
            break;

        case "USER":
            query = new URLSearchParams({
                where: `_ownerId="${categoryId}"`
            });
            break;
    }

    const result = await request.get(`${Path.News}?count${query ? `&${query}` : ''}`);

    return result;
}

export const getCategories = async () => {
    const result = await request.get(Path.GetCategories);

    return result;
}

export const getRegions = async () => {
    const result = await request.get(Path.GetRegions);

    return result;
};

export const existCategoryRegion = async (type, slug) => {
    let query = new URLSearchParams({
        where: `slug="${slug}"`
    });

    let result;
    let escapedSearch;

    if (type === "CATEGORY") {
        result = await request.get(`${Path.GetCategories}?${query}`);
    } else if (type === "REGION") {
        result = await request.get(`${Path.GetRegions}?${query}`);
    } else if (type === "SEARCH") {
        escapedSearch = JSON.stringify(slug).slice(1, -1);

        result = await request.get(`${Path.News}?where=title LIKE "${escapedSearch}"`);
    }

    return result;
};