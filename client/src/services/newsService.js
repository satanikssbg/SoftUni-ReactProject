import * as request from '../lib/request';

import Path from '../paths';

export const createNew = async (title) => {
    const result = await request.post(Path.News, { title });

    return result;
}

export const getNewsCategories = async () => {
    const result = await request.get(Path.GetCategories);
    const data = Object.values(result);

    const sortedData = data.sort((a, b) => a.category.localeCompare(b.category));

    return sortedData;
};

export const getRegions = async () => {
    const result = await request.get(Path.GetRegions);
    const data = Object.values(result);

    const regionsArray = Object.values(data);

    regionsArray.sort((a, b) => {
        const regionA = a.region.toLowerCase();
        const regionB = b.region.toLowerCase();

        if (regionA === "българия") {
            return 1;
        } else if (regionB === "българия") {
            return -1;
        } else {
            return regionA.localeCompare(regionB);
        }
    });

    return regionsArray;
};