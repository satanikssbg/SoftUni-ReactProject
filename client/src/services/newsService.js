import { PER_PAGE } from '../config';
import * as request from '../lib/request';

import Path from '../paths';

export const createNew = async ({ title, category, region, article, img }) => {
    const result = await request.post(Path.News, {
        title,
        category,
        region,
        article,
        img
    }).then(res => res.json());

    return result;
}

export const allNews = async () => {
    //TODO
}

export const newsPaginate = async (page) => {
    let OFFSET = (page - 1) * PER_PAGE;

    const query = new URLSearchParams({
        offset: `${OFFSET}`,
        pageSize: `${PER_PAGE}`,
        load: [
            'region=region:regions',
            'category=category:categories'
        ]
    });

    //const queryString = query.toString().replace(/\+/g, '%20');

    const result = await request.get(`${Path.News}?${query}`);
    //const result = await request.get(`http://localhost:3030/data/regions?${query}`);

    return result;
}

export const allNewsCount = async () => {
    const result = await request.get(`${Path.News}?count`);
    //const result = await request.get(`http://localhost:3030/data/regions?count`);

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