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

export const allNews = async () => {
    //TODO
}

export const getOne = async (id) => {
    const query = new URLSearchParams({
        load: [
            'region=region:regions',
            'category=category:categories'
        ]
    });

    const result = await request.get(`${Path.News}/${id}?${query}`);

    return result;
}


export const newsPaginate = async (page, type = "ALL", categoryId = null) => {
    let OFFSET = (page - 1) * PER_PAGE;

    const query = new URLSearchParams({
        offset: `${OFFSET}`,
        pageSize: `${PER_PAGE}`,
        load: [
            'region=region:regions',
            'category=category:categories'
        ]
    });

    if (type === "CATEGORY") {
        query.append("where", `category="${categoryId}"`);
    } else if (type === "REGION") {
        query.append("where", `region="${categoryId}"`);
    }

    //const queryString = query.toString().replace(/\+/g, '%20');

    const result = await request.get(`${Path.News}?sortBy=_createdOn%20desc&${query}`);
    //const result = await request.get(`http://localhost:3030/data/regions?${query}`);

    return result;
}

export const allNewsCount = async (type = "ALL", categoryId = null) => {
    let query = null;

    if (type === "CATEGORY") {
        query = new URLSearchParams({
            where: `category="${categoryId}"`
        });
    } else if (type === "REGION") {
        query = new URLSearchParams({
            where: `region="${categoryId}"`
        });
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
    const query = new URLSearchParams({
        where: `slug="${slug}"`
    });

    let result;

    if (type === "CATEGORY") {
        result = await request.get(`${Path.GetCategories}?${query}`);
    } else if (type === "REGION") {
        result = await request.get(`${Path.GetRegions}?${query}`);
    }

    return result;
};