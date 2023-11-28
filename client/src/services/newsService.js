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
    const query = new URLSearchParams({
        offset: '1',
        pageSize: '1',
        load: [
            'region=region:regions',
            'category=category:categories'
        ]
    });

    //const queryString = query.toString().replace(/\+/g, '%20');

    const result = await request.get(`${Path.News}?${query}`);

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